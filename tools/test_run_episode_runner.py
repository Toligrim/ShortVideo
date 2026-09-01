#!/usr/bin/env python3
"""Focused regression for runner-specific sandbox preflight."""
from __future__ import annotations

from pathlib import Path
import subprocess

import pytest


RUN_EPISODE = Path(__file__).with_name("run_episode.sh")


def _source() -> str:
    return RUN_EPISODE.read_text(encoding="utf-8")


def _completion_gate(source: str) -> str:
    snapshot = source.index("python3 tools/pipeline_log.py snapshot --label after")
    start = source.index("if [[ $CODE -eq 0 ]]; then", snapshot)
    end = source.index("if [[ $CODE -ne 0 ]]; then", start)
    return source[start:end]


def _run_completion_gate(
    tmp_path: Path,
    *,
    code: int,
    episode_exists: bool,
    validate_code: int,
) -> tuple[str, str, str]:
    (tmp_path / "episodes").mkdir()
    (tmp_path / "tools").mkdir()
    if episode_exists:
        (tmp_path / "episodes" / "test-slug.json").write_text("{}", encoding="utf-8")
    (tmp_path / "tools" / "validate.py").write_text(
        "from pathlib import Path\n"
        "Path('validate-called').write_text('yes', encoding='utf-8')\n"
        f"raise SystemExit({validate_code})\n",
        encoding="utf-8",
    )

    gate = _completion_gate(_source())
    shell = (
        "set -euo pipefail\n"
        f"CODE={code}\n"
        "SLUG=test-slug\n"
        'STATUS="ok"\n'
        'RESULT_CLASS="success"\n'
        'ERROR_CODE=""\n'
        f"{gate}"
        'printf \'%s\\n\' "$STATUS" "$RESULT_CLASS" "$ERROR_CODE"\n'
    )
    result = subprocess.run(
        ["bash", "-c", shell],
        cwd=tmp_path,
        check=True,
        capture_output=True,
        text=True,
    )
    status, result_class, error_code = result.stdout.splitlines()
    return status, result_class, error_code


def test_codex_doctor_is_inside_codex_runner_gate_only():
    source = _source()
    start = source.index("# Host-side Codex sandbox preflight.")
    end = source.index("# The producer prompt remains a normal file value.", start)
    preflight = source[start:end]

    assert 'if [[ "$RUNNER" == codex ]]; then' in preflight
    assert preflight.count("python3 tools/codex_sandbox_doctor.py") == 1
    assert preflight.rstrip().endswith("fi")
    assert "Claude does not invoke Codex" in preflight


def test_success_without_episode_is_pipeline_incomplete(tmp_path: Path):
    result = _run_completion_gate(
        tmp_path,
        code=0,
        episode_exists=False,
        validate_code=0,
    )

    assert result == ("failed", "semantic_failure", "pipeline_incomplete")
    assert not (tmp_path / "validate-called").exists()


def test_success_with_invalid_episode_is_pipeline_incomplete(tmp_path: Path):
    result = _run_completion_gate(
        tmp_path,
        code=0,
        episode_exists=True,
        validate_code=1,
    )

    assert result == ("failed", "semantic_failure", "pipeline_incomplete")
    assert (tmp_path / "validate-called").exists()


def test_success_with_valid_episode_keeps_success_classification(tmp_path: Path):
    result = _run_completion_gate(
        tmp_path,
        code=0,
        episode_exists=True,
        validate_code=0,
    )

    assert result == ("ok", "success", "")
    assert (tmp_path / "validate-called").exists()


@pytest.mark.parametrize(
    ("stderr", "expected_class", "expected_error"),
    [
        ("RTM_NEWADDR", "infrastructure_failure", "codex_sandbox_unavailable"),
        ("timed out", "infrastructure_failure", "mcp_transport_timeout"),
        ("unknown model", "infrastructure_failure", "model_unavailable"),
        (
            "MCP tool call requires approval",
            "control_plane_failure",
            "mcp_invocation_invalid",
        ),
        ("", "semantic_failure", ""),
    ],
)
def test_nonzero_exit_classification_is_unchanged(
    tmp_path: Path,
    stderr: str,
    expected_class: str,
    expected_error: str,
):
    source = _source()
    start = source.index("if [[ $CODE -ne 0 ]]; then", source.index("snapshot --label after"))
    end = source.index("\nfi\nFINISH_ARGS=", start) + len("\nfi")
    classification = source[start:end]
    (tmp_path / "cli-stderr.log").write_text(stderr, encoding="utf-8")
    shell = (
        "set -euo pipefail\n"
        "CODE=1\n"
        'RUN_DIR="$PWD"\n'
        'STATUS="ok"\n'
        'RESULT_CLASS="success"\n'
        'ERROR_CODE=""\n'
        f"{classification}\n"
        'printf \'%s\\n\' "$STATUS" "$RESULT_CLASS" "$ERROR_CODE"\n'
    )

    result = subprocess.run(
        ["bash", "-c", shell],
        cwd=tmp_path,
        check=True,
        capture_output=True,
        text=True,
    )

    assert result.stdout.splitlines() == ["failed", expected_class, expected_error]
