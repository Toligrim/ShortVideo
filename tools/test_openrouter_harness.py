#!/usr/bin/env python3
"""Regression tests for the staging OpenRouter harness boundary."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent
LEGACY_RUNNER_BLOB = "c2c7e2c454919b26fd0638dbdaa0951e74b8f3c1"


def test_production_scheduler_remains_codex_luna_max():
    source = (TOOLS / "producer_scheduler.py").read_text(encoding="utf-8")
    assert 'RUNNER = "codex"' in source
    assert 'MODEL = "gpt-5.6-luna"' in source
    assert 'EFFORT = "max"' in source


def test_run_episode_dispatches_only_explicit_openrouter():
    source = (TOOLS / "run_episode.sh").read_text(encoding="utf-8")
    assert 'if [[ "$RUNNER" == "openrouter" ]]' in source
    assert 'run_episode_openrouter.sh' in source
    assert 'run_episode_legacy.sh' in source
    assert source.index('if [[ "$RUNNER" == "openrouter" ]]') < source.index('run_episode_legacy.sh')


def test_legacy_runner_is_exact_pre_openrouter_blob():
    proc = subprocess.run(
        ["git", "hash-object", str(TOOLS / "run_episode_legacy.sh")],
        cwd=str(ROOT),
        check=True,
        capture_output=True,
        text=True,
    )
    assert proc.stdout.strip() == LEGACY_RUNNER_BLOB


def test_openrouter_runner_is_fail_closed_before_llm_and_uses_project_venv():
    source = (TOOLS / "run_episode_openrouter.sh").read_text(encoding="utf-8")
    assert 'HARNESS_PYTHON="${SHORTVIDEO_OPENROUTER_PYTHON:-$ROOT/venv/bin/python}"' in source
    assert '[[ ! -x "$HARNESS_PYTHON" ]]' in source
    doctor = source.index('"$HARNESS_PYTHON" tools/openrouter_doctor.py')
    llm = source.index('"$HARNESS_PYTHON" tools/openrouter_harness.py run')
    assert doctor < llm
    assert "tts_scenes.py --check-quota" in source
    assert "publication_created" in source
    assert "finalize-cost" in source


def test_openrouter_runner_and_doctor_have_no_exa_dependency():
    runner = (TOOLS / "run_episode_openrouter.sh").read_text(encoding="utf-8")
    doctor = (TOOLS / "openrouter_doctor.py").read_text(encoding="utf-8")
    assert "EXA_API_KEY" not in runner
    assert "EXA_API_KEY" not in doctor
    assert "SEARXNG_URL" in runner and "FIRECRAWL_API_KEY" in runner
    assert "openrouter_search_unavailable" in runner
    assert "SEARXNG_URL" in doctor and "FIRECRAWL_API_KEY" in doctor


def test_singleflight_cache_marker_becomes_public_cache_hit_only():
    pytest.importorskip("httpx")
    sys.path.insert(0, str(TOOLS))
    try:
        from openrouter_web_search import WebSearcher
    finally:
        sys.path.pop(0)
    response = {
        "ok": True,
        "data": [{"url": "https://example.com/"}],
        "meta": {"provider": "searxng", "_singleflight_cache_hit": True},
    }
    out = WebSearcher._slice(response, 1, cache_hit=False)
    assert out["meta"]["cache_hit"] is True
    assert "_singleflight_cache_hit" not in out["meta"]
    assert response["meta"]["_singleflight_cache_hit"] is True


def test_shell_entrypoints_parse():
    for name in ("run_episode.sh", "run_episode_legacy.sh", "run_episode_openrouter.sh"):
        proc = subprocess.run(
            ["bash", "-n", str(TOOLS / name)], capture_output=True, text=True
        )
        assert proc.returncode == 0, f"{name}: {proc.stderr}"


def test_deepseek_first_policy_and_text_critic():
    policy = json.loads((TOOLS / "delegate_policy.json").read_text(encoding="utf-8"))
    assert policy["openrouter_orchestrator"]["model"] == "deepseek/deepseek-v4-flash-0731"
    for role in ("scriptwriter", "critic", "animation-director"):
        assert policy["roles"][role]["openrouter_model"] == "deepseek/deepseek-v4-flash-0731"
    assert policy["roles"]["critic"]["sandbox"] == "read-only"
    assert policy["roles"]["animation-director"]["openrouter_vision_model"] == "deepseek/deepseek-v4.1-flash"


def test_context_budgets_keep_orchestrator_small():
    sys.path.insert(0, str(TOOLS))
    try:
        import openrouter_config as cfg
    finally:
        sys.path.pop(0)
    assert cfg.CONTEXT_BUDGETS["orchestrator"] == (32_000, 48_000)
    assert cfg.DEFAULT_MODEL == "deepseek/deepseek-v4-flash-0731"
    assert cfg.DEFAULT_VISION_MODEL == "deepseek/deepseek-v4.1-flash"


def test_exact_eight_tools_and_no_delegate_tool():
    pytest.importorskip("httpx")
    pytest.importorskip("trafilatura")
    sys.path.insert(0, str(TOOLS))
    try:
        import openrouter_tools
    finally:
        sys.path.pop(0)
    names = [x["function"]["name"] for x in openrouter_tools.TOOL_SCHEMAS]
    assert names == [
        "read_file",
        "write_file",
        "edit_file",
        "grep",
        "glob",
        "bash",
        "web_search",
        "web_fetch",
    ]
    assert "delegate" not in names


def test_delegation_is_intercepted_control_plane_and_worktree_is_detached():
    source = (TOOLS / "openrouter_control.py").read_text(encoding="utf-8")
    assert '["python3", "tools/openrouter_harness.py", "internal-delegate"]' in source
    assert "self.run_delegate(ns.role, ns.slug, ns.task)" in source
    harness = (TOOLS / "openrouter_harness.py").read_text(encoding="utf-8")
    assert "internal-delegate is a harness control-plane command" in harness
    worktree = (TOOLS / "delegate_worktree.py").read_text(encoding="utf-8")
    assert '["worktree", "add", "--detach", str(wt), base]' in worktree


def test_delegate_open_timeout_has_raspberry_pi_headroom():
    """staging incident 2026-09-17: real `git worktree add --detach` on the
    Pi measured ~22-30s; the old timeout=30 for delegate_worktree.py open
    intermittently raised TimeoutExpired. Guard against it silently
    regressing back to a too-tight value."""
    source = (TOOLS / "openrouter_control.py").read_text(encoding="utf-8")
    assert 'opened = subprocess.run(open_cmd, cwd=str(ROOT), capture_output=True, text=True, timeout=90)' in source
    # close already had enough headroom (120s) and must stay untouched.
    assert 'closed = subprocess.run(close_cmd, cwd=str(ROOT), capture_output=True, text=True, timeout=120)' in source


def test_run_delegate_parses_last_json_object_from_open_stdout():
    """delegate_worktree.py open always prints two JSON objects to stdout
    (the in-process delegate-claim result, then its own open result) -
    plain json.loads(opened.stdout) raises "Extra data". Masked previously
    by the too-tight open timeout (never reached this parse); exposed once
    that timeout was fixed. Guard the fix and its usage site."""
    sys.path.insert(0, str(TOOLS))
    try:
        from openrouter_control import _last_json_object
    finally:
        sys.path.pop(0)

    two_json_objects = (
        '{\n "granted": true,\n "agent_id": "scriptwriter-abc"\n}\n'
        '{\n "agent_id": "scriptwriter-abc",\n "worktree": "/tmp/x"\n}\n'
    )
    assert _last_json_object(two_json_objects) == {
        "agent_id": "scriptwriter-abc", "worktree": "/tmp/x",
    }

    source = (TOOLS / "openrouter_control.py").read_text(encoding="utf-8")
    assert "info = _last_json_object(opened.stdout)" in source


def test_provider_routing_prefers_throughput_over_cheapest_saturated_endpoint():
    """staging incident 2026-09-17: sort="price" repeatedly routed to a
    saturated shared (non-BYOK) endpoint and 429'd. Switching only the sort
    order did not help - require_parameters=True had already narrowed the
    field to that one provider (1 of 29 endpoints), so there was nothing
    left to sort/fall back to. The account has paid balance, so route for
    available capacity instead: sort by throughput AND stop requiring every
    provider to support our exact parameter set."""
    source = (TOOLS / "openrouter_client.py").read_text(encoding="utf-8")
    assert '"sort": "throughput"' in source
    assert '"sort": "price"' not in source
    assert '"require_parameters": False' in source


def test_staging_producer_dry_run_selects_openrouter():
    proc = subprocess.run(
        [sys.executable, str(TOOLS / "producer_openrouter_once.py"), "--dry-run", "--now", "1789600000"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=20,
    )
    assert proc.returncode == 0, proc.stderr
    body = json.loads(proc.stdout)
    assert body["runner"] == "openrouter"
    assert body["model"] == "deepseek/deepseek-v4-flash-0731"
    assert body["production_scheduler_unchanged"]["runner"] == "codex"


def test_openrouter_prompt_has_no_absolute_skill_path():
    """staging incident 2026-09-17: producer_scheduler.build_prompt() embeds
    an absolute filesystem path to the skill file (fine for Codex's
    unrestricted read access); read_file only accepts workspace-relative
    paths, so an unpatched prompt sent the orchestrator into a
    path_outside_workspace retry loop that burned the entire
    MAX_AGENT_STEPS budget without ever delegating to any role. Guard the
    fix in producer_openrouter_once.py."""
    sys.path.insert(0, str(TOOLS))
    try:
        import producer_openrouter_once as sched_once
    finally:
        sys.path.pop(0)

    now = 1789600000
    slug = sched_once.sched.make_slug(now, sched_once.ROOT / "episodes")
    raw_prompt = sched_once.sched.build_prompt(sched_once.ROOT, slug, sched_once.sched.PROMPT_TOPIC_LABEL)
    absolute_skill_path = str(sched_once.ROOT / ".claude" / "skills" / "produce" / "SKILL.md")
    assert absolute_skill_path in raw_prompt, "test assumption stale: build_prompt() no longer embeds an absolute path"

    relative_skill_path = ".claude/skills/produce/SKILL.md"
    expected_patched_chars = len(raw_prompt) - len(absolute_skill_path) + len(relative_skill_path)

    proc = subprocess.run(
        [sys.executable, str(TOOLS / "producer_openrouter_once.py"), "--dry-run", "--now", str(now)],
        cwd=str(ROOT), capture_output=True, text=True, timeout=20,
    )
    assert proc.returncode == 0, proc.stderr
    body = json.loads(proc.stdout)
    # dry-run doesn't echo the prompt text itself, but the actual patched
    # length (one occurrence of the absolute path shortened to relative)
    # only matches if main()'s replace() in fact ran against this same slug.
    assert body["prompt_chars"] == expected_patched_chars


def test_sandbox_shares_node_modules_readonly_into_detached_worktree(tmp_path, monkeypatch):
    """staging incident 2026-09-17: a fresh detached worktree has no
    video/node_modules (never installed there) and the model shell has no
    network, so tsc/remotion had nothing to run. Share the trusted
    supervisor's own install read-only instead of requiring network in the
    sandbox."""
    sys.path.insert(0, str(TOOLS))
    try:
        import openrouter_sandbox
    finally:
        sys.path.pop(0)

    fake_root = tmp_path / "root"
    (fake_root / "video" / "node_modules").mkdir(parents=True)
    monkeypatch.setattr(openrouter_sandbox, "ROOT", fake_root)

    workspace_with_video = tmp_path / "worktree-with-video"
    (workspace_with_video / "video").mkdir(parents=True)
    sandbox = openrouter_sandbox.BubblewrapSandbox(
        workspace_with_video, tmp_path / "scratch1", writable=True,
        role="animation-director", bwrap_path="/bin/true",
    )
    argv = sandbox._argv("true")
    src = str(fake_root / "video" / "node_modules")
    dst = str(workspace_with_video / "video" / "node_modules")
    ro_binds = [argv[i + 1 : i + 3] for i, arg in enumerate(argv) if arg == "--ro-bind"]
    assert [src, dst] in ro_binds

    workspace_without_video = tmp_path / "worktree-no-video"
    workspace_without_video.mkdir()
    sandbox_no_video = openrouter_sandbox.BubblewrapSandbox(
        workspace_without_video, tmp_path / "scratch2", writable=True,
        role="scriptwriter", bwrap_path="/bin/true",
    )
    argv_no_video = sandbox_no_video._argv("true")
    assert src not in argv_no_video


def test_doctor_render_assets_check_catches_missing_and_tampered_fonts(tmp_path, monkeypatch):
    """The director's still/vision loop silently reaches for the CDN (or
    renders with the wrong font) if a vendored file is missing or a
    @remotion/google-fonts bump changes the expected bytes without
    regenerating video/public/fonts. Doctor must catch both before any
    OpenRouter call."""
    sys.path.insert(0, str(TOOLS))
    try:
        import openrouter_doctor
    finally:
        sys.path.pop(0)

    fake_root = tmp_path / "root"
    fonts_dir = fake_root / "video" / "public" / "fonts"
    fonts_dir.mkdir(parents=True)
    (fonts_dir / "a.woff2").write_bytes(b"font-bytes")
    import hashlib
    manifest = {"files": [{"filename": "a.woff2", "sha256": hashlib.sha256(b"font-bytes").hexdigest()}]}
    (fonts_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    chrome_dir = fake_root / "video" / "node_modules" / ".remotion" / "chrome-headless-shell" / "linux-arm64"
    chrome_dir.mkdir(parents=True)
    (chrome_dir / "chrome-headless-shell").write_bytes(b"x")

    monkeypatch.setattr(openrouter_doctor, "ROOT", fake_root)
    ok = openrouter_doctor._check_render_assets()
    assert ok == {"fonts_ok": True, "chrome_headless_shell_ok": True}

    (fonts_dir / "a.woff2").write_bytes(b"tampered")
    tampered = openrouter_doctor._check_render_assets()
    assert tampered["fonts_ok"] is False
    assert "hash_mismatch" in tampered["fonts_error"]

    (fonts_dir / "a.woff2").write_bytes(b"font-bytes")
    (chrome_dir / "chrome-headless-shell").unlink()
    chrome_dir.rmdir()
    no_chrome = openrouter_doctor._check_render_assets()
    assert no_chrome["fonts_ok"] is True
    assert no_chrome["chrome_headless_shell_ok"] is False
