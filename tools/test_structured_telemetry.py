#!/usr/bin/env python3
"""Schema regression tests for delegate lifecycle records."""
from __future__ import annotations

import json
import time
from pathlib import Path

import pipeline_log


def _run_dir(tmp_path: Path) -> Path:
    run_dir = tmp_path / "telemetry-run"
    run_dir.mkdir()
    (run_dir / "mono_start").write_text(repr(time.monotonic()), encoding="utf-8")
    return run_dir


def test_delegate_event_has_stable_fields_and_no_prompt_body(tmp_path):
    run_dir = _run_dir(tmp_path)
    record = pipeline_log.append_telemetry(
        run_dir,
        "delegate_completed",
        task_id="scriptwriter:telemetry",
        agent_id="agent-telemetry",
        role="scriptwriter",
        infrastructure_attempt=1,
        semantic_attempt=2,
        worktree_path="/tmp/delegate-worktree",
        base_sha="a" * 40,
        codex_version="codex-cli 0.149.0",
        effective_model="gpt-5.6-luna",
        effective_sandbox_policy="workspace-write",
        phase="delegate_result",
        duration_ms=321,
        result_class="success",
        timeout_seconds=300,
        prompt_path="/tmp/delegate-prompts/agent-telemetry.md",
    )
    assert record["kind"] == "delegate_completed"
    assert record["run_id"] == run_dir.name
    assert record["timestamp"]
    for field in pipeline_log.TELEMETRY_FIELDS:
        assert field in record
    assert record["duration_ms"] == 321
    assert "prompt" not in record
    assert record["prompt_path"].endswith("agent-telemetry.md")


def test_legacy_worktree_events_are_normalized(tmp_path):
    run_dir = _run_dir(tmp_path)
    record = pipeline_log.append_event(
        run_dir,
        {"kind": "worktree_open", "actor": "agent-1", "task_id": "t:1"},
    )
    assert record["kind"] == "worktree_opened"
    assert record["legacy_kind"] == "worktree_open"
    assert record["agent_id"] == "agent-1"
    assert record["task_id"] == "t:1"
    assert record["timestamp"]
