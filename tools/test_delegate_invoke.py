#!/usr/bin/env python3
"""Regression tests for the deterministic nested-delegate bridge."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import agent_log  # noqa: E402
import delegate_invoke  # noqa: E402


@pytest.fixture()
def delegation(tmp_path, monkeypatch):
    """A real git worktree path with a synthetic active run/lease."""

    marker = delegate_invoke.ROOT / ".delegate-base"
    if not marker.is_file():
        pytest.skip("the isolated worktree has no delegate base marker")
    base = marker.read_text(encoding="utf-8").strip()
    run_dir = tmp_path / "run-bridge"
    run_dir.mkdir()
    (run_dir / "mono_start").write_text(repr(time.monotonic()), encoding="utf-8")
    prompt_dir = run_dir / "delegate-prompts"
    prompt_dir.mkdir()
    prompt_file = prompt_dir / "agent-1.md"
    claim = {
        "agent_id": "agent-1",
        "task_id": "scriptwriter:serialization",
        "role": "scriptwriter",
        "attempt": 1,
        "state": "running",
        "claimed_at": time.time(),
        "expires_at": time.time() + 600,
        "heartbeat_at": time.time(),
        "lease_sec": 600,
        "worktree": str(delegate_invoke.ROOT),
        "base_sha": base,
        "semantic_attempt": None,
        "infrastructure_attempt": 1,
        "semantic_counted": False,
        "infrastructure_counted": False,
        "delegate_started": False,
    }
    with agent_log.Registry(run_dir) as registry:
        registry.claims["agent-1"] = claim
        registry.save()
    monkeypatch.setenv("SV_RUN_DIR", str(run_dir))
    monkeypatch.setenv("SV_RUN_ID", run_dir.name)
    return run_dir, prompt_file, claim


def _render(delegation, prompt: str, capsys) -> tuple[str, Path]:
    run_dir, prompt_file, _ = delegation
    prompt_file.write_text(prompt, encoding="utf-8")
    rc = delegate_invoke.main([
        "render",
        "--task-id",
        "scriptwriter:serialization",
        "--agent-id",
        "agent-1",
        "--role",
        "scriptwriter",
        "--prompt-file",
        str(prompt_file),
    ])
    captured = capsys.readouterr()
    assert rc == 0, captured.err
    assert captured.err == ""
    source = captured.out
    js_file = run_dir / "generated.js"
    js_file.write_text(source, encoding="utf-8")
    return source, js_file


def _node() -> str:
    node = shutil.which("node") or "/home/toligrim/.local/bin/node"
    if not Path(node).is_file():
        pytest.skip("node is not available")
    return node


def test_explicit_run_id_honors_isolated_run_dir(delegation, monkeypatch):
    run_dir, _, _ = delegation
    wrong_runs = run_dir.parent / "wrong-runs"
    wrong_dir = wrong_runs / run_dir.name
    wrong_dir.mkdir(parents=True)
    (wrong_dir / "delegations.json").write_text('{"claims": {}}', encoding="utf-8")
    monkeypatch.setattr(delegate_invoke.pipeline_log, "RUNS", wrong_runs)

    assert delegate_invoke.resolve_run_dir(run_dir.name) == run_dir.resolve()


def test_registered_base_sha_is_valid_fallback_without_marker(tmp_path, monkeypatch):
    worktree = tmp_path / "worktree"
    worktree.mkdir()
    monkeypatch.setattr(delegate_invoke, "_git", lambda _cwd, _args: "")
    base = "a" * 40
    assert delegate_invoke._read_base_sha(worktree, base) == base


def test_prompt_serialization_survives_node_check_and_runtime(delegation, capsys):
    prompt = (
        "backticks: `inline code` and literal ${not_an_expression}\n"
        "quotes: \"double\" and 'single'; slashes: C:\\\\tmp\\file\n"
        "многострочный русский текст — ёжик и символы: ✓ 🚀\n"
        '{"json": ["value", {"nested": true}]}\n'
        "shell: $(echo do-not-run); `printf no`; && || |\n"
        "incident regression: `totp-window`\n"
    )
    source, js_file = _render(delegation, prompt, capsys)
    assert "promptReadCommand" in source
    assert "cat --" in source
    assert "readFileSync" not in source
    assert prompt not in source
    assert "gpt-5.2-codex" not in source
    assert 'model: "gpt-5.6-luna"' in source

    node = _node()
    checked = subprocess.run([node, "--check", str(js_file)], capture_output=True, text=True)
    assert checked.returncode == 0, checked.stderr

    runner = r'''
const fs = require("fs");
const outputs = [];
globalThis.text = (value) => outputs.push(String(value));
globalThis.tools = {
  exec_command: async ({cmd}) => ({
    exit_code: 0,
    output: cmd.includes("cat --") ? fs.readFileSync(process.env.PROMPT_FILE, "utf8") : ""
  }),
  mcp__codex__codex: async ({prompt}) => ({content: [{type: "text", text: prompt}]})
};
require(process.env.GENERATED_JS);
setTimeout(() => process.stdout.write(JSON.stringify(outputs)), 100);
'''
    executed = subprocess.run(
        [node, "-e", runner],
        env={**os.environ, "GENERATED_JS": str(js_file), "PROMPT_FILE": str(delegation[1])},
        capture_output=True,
        text=True,
    )
    assert executed.returncode == 0, executed.stderr
    outputs = json.loads(executed.stdout)
    assert outputs[0] == prompt
    assert json.loads(outputs[-1])["result_class"] == "success"


def test_startup_control_failure_is_classified_before_close(delegation, capsys):
    run_dir, prompt_file, _ = delegation
    prompt_file.write_text("safe", encoding="utf-8")
    source, js_file = _render(delegation, "safe", capsys)
    assert "failBeforeRequest" in source

    node = _node()
    runner = r'''
const outputs = [];
const commands = [];
globalThis.text = (value) => outputs.push(String(value));
globalThis.tools = {
  exec_command: async ({cmd}) => {
    commands.push(cmd);
    return {exit_code: cmd.includes("mark-started") ? 1 : 0, output: "safe"};
  },
  mcp__codex__codex: async () => { throw new Error("must not be called"); }
};
require(process.env.GENERATED_JS);
setTimeout(() => process.stdout.write(JSON.stringify({outputs, commands})), 100);
'''
    executed = subprocess.run(
        [node, "-e", runner],
        env={**os.environ, "GENERATED_JS": str(js_file)},
        capture_output=True,
        text=True,
    )
    assert executed.returncode == 0, executed.stderr
    result = json.loads(executed.stdout)
    outputs = result["outputs"]
    assert json.loads(outputs[-1])["result_class"] == "control_plane_failure"
    result_commands = [
        command for command in result["commands"] if "delegate_invoke.py result " in command
    ]
    assert any(
        "delegate_invoke.py result " in command
        and "control_plane_failure" in command
        and "mcp_invocation_invalid" in command
        for command in result["commands"]
    )
    assert result_commands
    assert all("--termination-uncertain" not in command for command in result_commands)


def test_mcp_timeout_is_classified_by_generated_bridge(delegation):
    """Promise.race timeout must surface the stable transport error code."""

    run_dir, prompt_file, claim = delegation
    prompt_file.write_text("safe", encoding="utf-8")
    context = delegate_invoke.ClaimContext(
        run_dir=run_dir,
        run_id=run_dir.name,
        task_id=claim["task_id"],
        agent_id=claim["agent_id"],
        role=claim["role"],
        attempt=claim["attempt"],
        worktree=delegate_invoke.ROOT,
        base_sha=claim["base_sha"],
        semantic_attempt=0,
        infrastructure_attempt=1,
        codex_path=Path("/usr/bin/codex"),
        codex_version="test-codex",
        policy=delegate_invoke.Policy(
            model="gpt-5.6-luna",
            sandbox="workspace-write",
            approval_policy="never",
            timeout_seconds=1,
        ),
    )
    js_file = run_dir / "timeout.js"
    js_file.write_text(delegate_invoke._render_js(context, prompt_file), encoding="utf-8")

    node = _node()
    runner = r'''
const outputs = [];
globalThis.text = (value) => outputs.push(String(value));
globalThis.tools = {
  exec_command: async ({cmd}) => ({
    exit_code: 0, output: cmd.includes("cat --") ? "safe" : ""
  }),
  mcp__codex__codex: async () => new Promise(() => {})
};
require(process.env.GENERATED_JS);
setTimeout(() => process.stdout.write(JSON.stringify(outputs)), 1500);
'''
    executed = subprocess.run(
        [node, "-e", runner],
        env={**os.environ, "GENERATED_JS": str(js_file)},
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert executed.returncode == 0, executed.stderr
    result = json.loads(json.loads(executed.stdout)[-1])
    assert result["result_class"] == "infrastructure_failure"
    assert result["error_code"] == "mcp_transport_timeout"


def test_mcp_invocation_error_marks_termination_uncertain_by_generated_bridge(tmp_path):
    """A fast MCP error after request start must quarantine the delegate claim."""

    run_dir = tmp_path / "run-invocation-error"
    run_dir.mkdir()
    prompt_file = run_dir / "prompt.md"
    prompt_file.write_text("safe", encoding="utf-8")
    context = delegate_invoke.ClaimContext(
        run_dir=run_dir,
        run_id=run_dir.name,
        task_id="scriptwriter:invocation-error",
        agent_id="agent-1",
        role="scriptwriter",
        attempt=1,
        worktree=tmp_path,
        base_sha="a" * 40,
        semantic_attempt=0,
        infrastructure_attempt=1,
        codex_path=Path("/usr/bin/codex"),
        codex_version="test-codex",
        policy=delegate_invoke.Policy(
            model="gpt-5.6-luna",
            sandbox="workspace-write",
            approval_policy="never",
            timeout_seconds=1,
        ),
    )
    js_file = run_dir / "invocation-error.js"
    js_file.write_text(delegate_invoke._render_js(context, prompt_file), encoding="utf-8")

    node = _node()
    runner = r'''
const outputs = [];
const commands = [];
globalThis.text = (value) => outputs.push(String(value));
globalThis.tools = {
  exec_command: async ({cmd}) => {
    commands.push(cmd);
    return {exit_code: 0, output: cmd.includes("cat --") ? "safe" : ""};
  },
  mcp__codex__codex: async () => {
    throw new Error("MCP tool call requires approval, but approval policy is never");
  }
};
require(process.env.GENERATED_JS);
setTimeout(() => process.stdout.write(JSON.stringify({outputs, commands})), 100);
'''
    executed = subprocess.run(
        [node, "-e", runner],
        env={**os.environ, "GENERATED_JS": str(js_file)},
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert executed.returncode == 0, executed.stderr
    result = json.loads(executed.stdout)
    failure = json.loads(result["outputs"][-1])
    assert failure["ok"] is False
    assert failure["result_class"] == "control_plane_failure"
    assert failure["error_code"] == "mcp_invocation_invalid"
    assert failure["timeout_seconds"] == 1
    assert any("mcp_request_started" in command for command in result["commands"])
    result_commands = [
        command for command in result["commands"] if "delegate_invoke.py result " in command
    ]
    assert any(
        "control_plane_failure" in command
        and "mcp_invocation_invalid" in command
        and "--termination-uncertain" in command
        for command in result_commands
    )


def test_animation_director_policy_is_workspace_write():
    assert delegate_invoke.load_policy("animation-director").sandbox == "workspace-write"


@pytest.mark.parametrize("role", ["scriptwriter", "animation-director", "critic"])
def test_all_roles_use_raised_delegate_timeout(role):
    # 1800s (30 min) is delegate_invoke.load_policy()'s own hard cap
    # (`not 1 <= timeout <= 1_800` below) — the highest this wrapper timeout
    # can go without also changing that validator. Keep it below the
    # underlying nested MCP transport's own tool_timeout_sec (configured in
    # ~/.codex/config.toml, outside this repo — see
    # docs/agent-safety-architecture.md), so this controlled,
    # telemetry-integrated Promise.race always fires first and remains the
    # authoritative classification path instead of a raw transport reject.
    assert delegate_invoke.load_policy(role).timeout_seconds == 1800


def test_bridge_refuses_render_for_quarantined_claim(delegation, capsys):
    run_dir, prompt_file, claim = delegation
    prompt_file.write_text("safe", encoding="utf-8")
    with agent_log.Registry(run_dir) as registry:
        stored = registry.claims[claim["agent_id"]]
        stored["state"] = agent_log.TERMINATION_UNCONFIRMED_STATE
        stored["termination_unconfirmed"] = True
        registry.save()

    rc = delegate_invoke.main([
        "render",
        "--task-id", claim["task_id"],
        "--agent-id", claim["agent_id"],
        "--role", claim["role"],
        "--prompt-file", str(prompt_file),
    ])
    captured = capsys.readouterr()
    assert rc == 7
    assert captured.out == ""
    assert json.loads(captured.err)["error_code"] == "delegate_termination_unconfirmed"


def test_model_sandbox_and_cwd_are_not_bridge_arguments(delegation):
    run_dir, prompt_file, _ = delegation
    prompt_file.write_text("safe", encoding="utf-8")
    result = subprocess.run(
        [
            sys.executable,
            str(TOOLS / "delegate_invoke.py"),
            "render",
            "--task-id",
            "scriptwriter:serialization",
            "--agent-id",
            "agent-1",
            "--role",
            "scriptwriter",
            "--prompt-file",
            str(prompt_file),
            "--model",
            "gpt-5.2-codex",
        ],
        env={**os.environ, "SV_RUN_DIR": str(run_dir), "SV_RUN_ID": run_dir.name},
        capture_output=True,
        text=True,
    )
    assert result.returncode == 2
    assert result.stdout == ""


def test_policy_and_worktree_refusals_emit_no_javascript(delegation, capsys):
    run_dir, prompt_file, claim = delegation
    prompt_file.write_text("safe", encoding="utf-8")

    rc = delegate_invoke.main([
        "render",
        "--task-id",
        claim["task_id"],
        "--agent-id",
        claim["agent_id"],
        "--role",
        "unapproved-role",
        "--prompt-file",
        str(prompt_file),
    ])
    captured = capsys.readouterr()
    assert rc == 21
    assert captured.out == ""
    assert json.loads(captured.err)["error_code"] == "role_not_allowed"

    with agent_log.Registry(run_dir) as registry:
        registry.claims[claim["agent_id"]]["worktree"] = str(run_dir / "missing-worktree")
        registry.save()
    rc = delegate_invoke.main([
        "render",
        "--task-id",
        claim["task_id"],
        "--agent-id",
        claim["agent_id"],
        "--role",
        claim["role"],
        "--prompt-file",
        str(prompt_file),
    ])
    captured = capsys.readouterr()
    assert rc == 22
    assert captured.out == ""
    assert json.loads(captured.err)["error_code"] == "worktree_missing"


def test_success_and_semantic_attempts_are_separate_from_infrastructure(tmp_path, monkeypatch, capsys):
    run_dir = tmp_path / "run-budget"
    run_dir.mkdir()
    (run_dir / "mono_start").write_text(repr(time.monotonic()), encoding="utf-8")
    monkeypatch.setenv("SV_RUN_DIR", str(run_dir))
    monkeypatch.setenv("SV_RUN_ID", run_dir.name)
    task = "scriptwriter:budget"

    assert agent_log.main([
        "delegate-claim", "--task-id", task, "--role", "scriptwriter", "--agent-id", "no-start"
    ]) == 0
    capsys.readouterr()
    assert agent_log.main([
        "delegate-release", "--agent-id", "no-start", "--status", "failed", "--note", "runtime note"
    ]) == 0
    capsys.readouterr()

    assert agent_log.main([
        "delegate-claim", "--task-id", task, "--role", "scriptwriter", "--agent-id", "semantic"
    ]) == 0
    capsys.readouterr()
    assert agent_log.main(["delegate-start", "--agent-id", "semantic"]) == 0
    capsys.readouterr()
    assert agent_log.main([
        "delegate-result", "--agent-id", "semantic", "--result-class", "semantic_failure"
    ]) == 0
    capsys.readouterr()
    assert agent_log.main([
        "delegate-release", "--agent-id", "semantic", "--status", "failed"
    ]) == 0
    capsys.readouterr()

    assert agent_log.main([
        "delegate-claim", "--task-id", task, "--role", "scriptwriter", "--agent-id", "infra-1"
    ]) == 0
    capsys.readouterr()
    assert agent_log.main([
        "delegate-result", "--agent-id", "infra-1", "--result-class", "infrastructure_failure",
        "--error-code", "mcp_transport_timeout",
    ]) == 0
    capsys.readouterr()
    assert agent_log.main([
        "delegate-confirm-termination", "--agent-id", "infra-1",
        "--evidence", "focused test confirmed no old actor",
    ]) == 0
    capsys.readouterr()
    assert agent_log.main([
        "delegate-release", "--agent-id", "infra-1", "--status", "failed"
    ]) == 0
    capsys.readouterr()

    with agent_log.Registry(run_dir) as registry:
        semantic, infrastructure, codes = agent_log.task_counters(registry.claims, task)
    assert semantic == 1
    assert infrastructure == 1
    assert codes == ["mcp_transport_timeout"]


def test_timeout_quarantine_blocks_release_and_retry_until_confirmed(tmp_path, monkeypatch, capsys):
    run_dir = tmp_path / "run-quarantine"
    run_dir.mkdir()
    (run_dir / "mono_start").write_text(repr(time.monotonic()), encoding="utf-8")
    monkeypatch.setenv("SV_RUN_DIR", str(run_dir))
    monkeypatch.setenv("SV_RUN_ID", run_dir.name)
    task = "critic:quarantine"

    assert agent_log.main([
        "delegate-claim", "--task-id", task, "--role", "critic", "--agent-id", "timed-out",
        "--lease-sec", "1",
    ]) == 0
    capsys.readouterr()
    assert agent_log.main(["delegate-start", "--agent-id", "timed-out"]) == 0
    capsys.readouterr()
    assert agent_log.main([
        "delegate-result", "--agent-id", "timed-out",
        "--result-class", "infrastructure_failure", "--error-code", "mcp_transport_timeout",
    ]) == 0
    capsys.readouterr()

    assert agent_log.main([
        "delegate-release", "--agent-id", "timed-out", "--status", "failed",
    ]) == 7
    assert json.loads(capsys.readouterr().out)["error_code"] == "delegate_termination_unconfirmed"
    assert agent_log.main([
        "delegate-claim", "--task-id", task, "--role", "critic", "--agent-id", "retry",
    ]) == 7
    assert json.loads(capsys.readouterr().out)["error_code"] == "delegate_termination_unconfirmed"

    with agent_log.Registry(run_dir) as registry:
        assert agent_log.task_counters(registry.claims, task) == (0, 0, [])

    assert agent_log.main([
        "delegate-confirm-termination", "--agent-id", "timed-out",
        "--evidence", "test actor was independently confirmed dead",
    ]) == 0
    capsys.readouterr()
    assert agent_log.main([
        "delegate-release", "--agent-id", "timed-out", "--status", "failed",
    ]) == 0
    capsys.readouterr()
    assert agent_log.main([
        "delegate-claim", "--task-id", task, "--role", "critic", "--agent-id", "retry",
    ]) == 0
    capsys.readouterr()


def test_invocation_invalid_with_termination_uncertain_blocks_release_and_retry_until_confirmed(
    tmp_path, monkeypatch, capsys,
):
    run_dir = tmp_path / "run-invocation-quarantine"
    run_dir.mkdir()
    (run_dir / "mono_start").write_text(repr(time.monotonic()), encoding="utf-8")
    monkeypatch.setenv("SV_RUN_DIR", str(run_dir))
    monkeypatch.setenv("SV_RUN_ID", run_dir.name)
    task = "critic:invocation-quarantine"

    assert agent_log.main([
        "delegate-claim", "--task-id", task, "--role", "critic", "--agent-id", "invalid",
    ]) == 0
    capsys.readouterr()
    assert agent_log.main(["delegate-start", "--agent-id", "invalid"]) == 0
    capsys.readouterr()
    assert agent_log.main([
        "delegate-result", "--agent-id", "invalid",
        "--result-class", "control_plane_failure", "--error-code", "mcp_invocation_invalid",
        "--termination-uncertain",
    ]) == 0
    assert json.loads(capsys.readouterr().out)["termination_unconfirmed"] is True

    assert agent_log.main([
        "delegate-release", "--agent-id", "invalid", "--status", "failed",
    ]) == 7
    assert json.loads(capsys.readouterr().out)["error_code"] == "delegate_termination_unconfirmed"
    assert agent_log.main([
        "delegate-claim", "--task-id", task, "--role", "critic", "--agent-id", "retry",
    ]) == 7
    assert json.loads(capsys.readouterr().out)["error_code"] == "delegate_termination_unconfirmed"

    with agent_log.Registry(run_dir) as registry:
        assert agent_log.task_counters(registry.claims, task) == (0, 0, [])

    assert agent_log.main([
        "delegate-confirm-termination", "--agent-id", "invalid",
        "--evidence", "test actor was independently confirmed dead",
    ]) == 0
    capsys.readouterr()
    assert agent_log.main([
        "delegate-release", "--agent-id", "invalid", "--status", "failed",
    ]) == 0
    capsys.readouterr()
    assert agent_log.main([
        "delegate-claim", "--task-id", task, "--role", "critic", "--agent-id", "retry",
    ]) == 0
    capsys.readouterr()


def test_invocation_invalid_without_termination_uncertain_releases_normally(
    tmp_path, monkeypatch, capsys,
):
    run_dir = tmp_path / "run-invocation-safe"
    run_dir.mkdir()
    (run_dir / "mono_start").write_text(repr(time.monotonic()), encoding="utf-8")
    monkeypatch.setenv("SV_RUN_DIR", str(run_dir))
    monkeypatch.setenv("SV_RUN_ID", run_dir.name)
    task = "critic:invocation-safe"

    assert agent_log.main([
        "delegate-claim", "--task-id", task, "--role", "critic", "--agent-id", "startup",
    ]) == 0
    capsys.readouterr()
    assert agent_log.main([
        "delegate-result", "--agent-id", "startup",
        "--result-class", "control_plane_failure", "--error-code", "mcp_invocation_invalid",
    ]) == 0
    assert json.loads(capsys.readouterr().out)["termination_unconfirmed"] is False
    assert agent_log.main([
        "delegate-release", "--agent-id", "startup", "--status", "failed",
    ]) == 0
    capsys.readouterr()
    assert agent_log.main([
        "delegate-claim", "--task-id", task, "--role", "critic", "--agent-id", "retry",
    ]) == 0
    capsys.readouterr()


def test_repeated_infrastructure_errors_open_the_circuit(tmp_path, monkeypatch, capsys):
    run_dir = tmp_path / "run-circuit"
    run_dir.mkdir()
    (run_dir / "mono_start").write_text(repr(time.monotonic()), encoding="utf-8")
    monkeypatch.setenv("SV_RUN_DIR", str(run_dir))
    monkeypatch.setenv("SV_RUN_ID", run_dir.name)
    task = "critic:circuit"

    for index in (1, 2):
        agent_id = f"infra-{index}"
        assert agent_log.main([
            "delegate-claim", "--task-id", task, "--role", "critic", "--agent-id", agent_id
        ]) == 0
        capsys.readouterr()
        assert agent_log.main([
            "delegate-result", "--agent-id", agent_id,
            "--result-class", "infrastructure_failure",
            "--error-code", "mcp_transport_timeout",
        ]) == 0
        capsys.readouterr()
        assert agent_log.main([
            "delegate-confirm-termination", "--agent-id", agent_id,
            "--evidence", "focused test confirmed no old actor",
        ]) == 0
        capsys.readouterr()
        assert agent_log.main([
            "delegate-release", "--agent-id", agent_id, "--status", "failed"
        ]) == 0
        capsys.readouterr()

    rc = agent_log.main([
        "delegate-claim", "--task-id", task, "--role", "critic", "--agent-id", "infra-3"
    ])
    captured = capsys.readouterr()
    assert rc == 7
    assert json.loads(captured.out)["error_code"] == "infrastructure_budget_exhausted"


def test_worktree_close_failure_cannot_be_hidden_by_pending_success(tmp_path, monkeypatch, capsys):
    run_dir = tmp_path / "run-close-failure"
    run_dir.mkdir()
    (run_dir / "mono_start").write_text(repr(time.monotonic()), encoding="utf-8")
    monkeypatch.setenv("SV_RUN_DIR", str(run_dir))
    monkeypatch.setenv("SV_RUN_ID", run_dir.name)
    task = "scriptwriter:close-failure"
    assert agent_log.main([
        "delegate-claim", "--task-id", task, "--role", "scriptwriter", "--agent-id", "close-1"
    ]) == 0
    capsys.readouterr()
    assert agent_log.main(["delegate-start", "--agent-id", "close-1"]) == 0
    capsys.readouterr()
    assert agent_log.main([
        "delegate-result", "--agent-id", "close-1", "--result-class", "success"
    ]) == 0
    capsys.readouterr()
    assert agent_log.main([
        "delegate-release", "--agent-id", "close-1", "--status", "failed", "--note", "merge conflict"
    ]) == 0
    result = json.loads(capsys.readouterr().out)
    assert result["result_class"] == "policy_failure"
    assert result["error_code"] == "policy_violation"
