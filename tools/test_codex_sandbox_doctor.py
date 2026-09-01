#!/usr/bin/env python3
"""Unit and live-host checks for the Codex sandbox preflight."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import codex_sandbox_doctor as doctor  # noqa: E402


@pytest.mark.parametrize(
    ("exit_code", "stderr", "timed_out", "expected"),
    [
        (0, "", False, "ok"),
        (1, "bwrap: Failed to create new user namespace: Operation not permitted", False, "bwrap_userns_denied"),
        (1, "bwrap: Failed to create network namespace: RTM_NEWADDR failed", False, "bwrap_rtm_newaddr"),
        (1, "some other host failure", False, "bwrap_unknown_failure"),
        (None, "", True, "bwrap_unknown_failure"),
    ],
)
def test_smoke_error_classification(exit_code, stderr, timed_out, expected):
    assert doctor.classify_smoke(exit_code, stderr, timed_out) == expected


def test_live_doctor_uses_path_codex_and_vendored_bwrap():
    result = doctor.doctor()
    assert set(result) >= {
        "codex_version",
        "codex_path",
        "bwrap_path",
        "smoke_exit_code",
        "error_class",
    }
    assert result["error_class"] == "ok"
    assert Path(result["codex_path"]).is_file()
    assert Path(result["bwrap_path"]).is_file()
    assert result["smoke_exit_code"] == 0
    assert result["smoke_stderr"] == ""
    assert result["smoke_sequential_count"] == 10
    assert result["smoke_parallel_count"] == 3
    assert result["smoke_exit_codes"] == [0] * 13


def test_cli_stdout_is_one_json_document():
    completed = subprocess.run(
        [sys.executable, str(TOOLS / "codex_sandbox_doctor.py")],
        capture_output=True,
        text=True,
    )
    parsed = json.loads(completed.stdout)
    assert isinstance(parsed, dict)
    assert completed.returncode == (0 if parsed["error_class"] == "ok" else 1)
