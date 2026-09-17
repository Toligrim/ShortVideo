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


def test_openrouter_runner_is_fail_closed_before_llm():
    source = (TOOLS / "run_episode_openrouter.sh").read_text(encoding="utf-8")
    doctor = source.index("python3 tools/openrouter_doctor.py")
    llm = source.index("python3 tools/openrouter_harness.py run")
    assert doctor < llm
    assert "tts_scenes.py --check-quota" in source
    assert "publication_created" in source
    assert "finalize-cost" in source


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


def test_delegation_is_intercepted_control_plane():
    source = (TOOLS / "openrouter_control.py").read_text(encoding="utf-8")
    assert '["python3", "tools/openrouter_harness.py", "internal-delegate"]' in source
    assert "self.run_delegate(ns.role, ns.slug, ns.task)" in source
    harness = (TOOLS / "openrouter_harness.py").read_text(encoding="utf-8")
    assert "internal-delegate is a harness control-plane command" in harness


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
