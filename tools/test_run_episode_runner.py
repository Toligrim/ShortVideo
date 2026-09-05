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
    publication_created: bool = True,
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

    run_dir = tmp_path / "run-dir"
    run_dir.mkdir()
    events = ['{"kind": "run_start"}']
    if publication_created:
        events.append('{"kind": "publication_created", "publication_id": "p1"}')
    (run_dir / "events.jsonl").write_text("\n".join(events) + "\n", encoding="utf-8")

    gate = _completion_gate(_source())
    shell = (
        "set -euo pipefail\n"
        f"CODE={code}\n"
        "SLUG=test-slug\n"
        f'RUN_DIR="{run_dir}"\n'
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


def _tts_quota_gate(source: str) -> str:
    start = source.index("# Gemini TTS free-tier daily quota preflight")
    end = source.index("# The producer prompt remains a normal file value.", start)
    return source[start:end]


def _run_tts_quota_gate(tmp_path: Path, *, quota_ok: bool) -> subprocess.CompletedProcess:
    (tmp_path / "tools").mkdir()
    run_dir = tmp_path / "runs" / "run-dir"
    run_dir.mkdir(parents=True)
    (tmp_path / "tools" / "tts_scenes.py").write_text(
        f"import sys\nsys.exit({0 if quota_ok else 1})\n", encoding="utf-8"
    )
    (tmp_path / "tools" / "pipeline_log.py").write_text(
        "import sys\n"
        "print('CALLED:', sys.argv[1:], file=sys.stderr)\n"
        "print('{}')\n",
        encoding="utf-8",
    )

    gate = _tts_quota_gate(_source())
    shell = f'RUN_DIR="{run_dir}"\n' f"{gate}" 'echo "GATE_PASSED"\n'
    return subprocess.run(
        ["bash", "-c", shell],
        cwd=tmp_path,
        capture_output=True,
        text=True,
    )


def test_tts_quota_gate_passes_through_when_quota_available(tmp_path: Path):
    result = _run_tts_quota_gate(tmp_path, quota_ok=True)

    assert result.returncode == 0, result.stderr
    assert "GATE_PASSED" in result.stdout
    assert "'finish'" not in result.stderr


def test_tts_quota_gate_fails_fast_when_every_model_exhausted(tmp_path: Path):
    """Real incidents 2026-09-04/05: multiple full scriptwriter+director
    passes only failed at TTS afterward, wasting real delegate time. This
    gate must refuse before any of that time is spent."""
    result = _run_tts_quota_gate(tmp_path, quota_ok=False)

    assert result.returncode == 77
    assert "GATE_PASSED" not in result.stdout
    assert "'finish'" in result.stderr
    assert "tts_quota_exhausted" in result.stderr
    assert "infrastructure_failure" in result.stderr


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


def test_success_with_valid_episode_but_no_publication_is_pipeline_incomplete(tmp_path: Path):
    """Real incident (auto-20260904-144810, 2026-09-04): Gemini TTS returned
    429 on every available model, and the pipeline honestly stopped there -
    no MP4 rendered, no review sent (the orchestrator's own final summary
    said so explicitly). But episodes/<slug>.json is written by
    animation-director, long before tts/critic/render/publish even start,
    so it already existed and validated - this gate used to mark the run
    status=ok/success anyway, with no video and no publication_created."""
    result = _run_completion_gate(
        tmp_path,
        code=0,
        episode_exists=True,
        validate_code=0,
        publication_created=False,
    )

    assert result == ("failed", "semantic_failure", "pipeline_incomplete")
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
