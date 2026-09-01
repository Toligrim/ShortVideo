#!/usr/bin/env python3
"""Focused regression for runner-specific sandbox preflight."""
from __future__ import annotations

from pathlib import Path


RUN_EPISODE = Path(__file__).with_name("run_episode.sh")


def test_codex_doctor_is_inside_codex_runner_gate_only():
    source = RUN_EPISODE.read_text(encoding="utf-8")
    start = source.index("# Host-side Codex sandbox preflight.")
    end = source.index("# The producer prompt remains a normal file value.", start)
    preflight = source[start:end]

    assert 'if [[ "$RUNNER" == codex ]]; then' in preflight
    assert preflight.count("python3 tools/codex_sandbox_doctor.py") == 1
    assert preflight.rstrip().endswith("fi")
    assert "Claude does not invoke Codex" in preflight
