#!/usr/bin/env python3
"""Tests for tools/tts_scenes.py's local Gemini TTS quota bookkeeping.

Added 2026-09-05 after two real incidents (auto-20260904-144810 and
auto-20260905-050001/-054829): the Gemini TTS free-tier daily quota
(generativelanguage.googleapis.com/generate_content_free_tier_requests,
10 requests/day/model) was exhausted on every fallback model, and the
pipeline only discovered this after a full, real scriptwriter+director
pass. These tests cover the "remember a 429 until the next local day, skip
without even asking" bookkeeping added to close that gap - no network
calls, no real Gemini API key required.

    python3 -m pytest tools/test_tts_scenes.py -v
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import tts_scenes as tts  # noqa: E402


class QuotaStateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state_path = Path(self.tmp.name) / "tts-quota.json"
        self.env_patch = patch.dict(os.environ, {"SV_TTS_QUOTA_STATE": str(self.state_path)})
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)

    def test_fresh_state_has_no_exhausted_models(self):
        state = tts._load_quota_state()
        self.assertEqual(state["exhausted_models"], [])
        self.assertTrue(tts.has_quota_for_any_model())
        for model in tts.GEMINI_MODELS:
            self.assertFalse(tts.model_is_known_exhausted(model))

    def test_mark_exhausted_persists_across_loads(self):
        tts.mark_model_exhausted(tts.GEMINI_MODELS[0])

        self.assertTrue(tts.model_is_known_exhausted(tts.GEMINI_MODELS[0]))
        self.assertFalse(tts.model_is_known_exhausted(tts.GEMINI_MODELS[1]))
        self.assertTrue(tts.has_quota_for_any_model())  # other models still fine

    def test_marking_all_models_reports_no_quota(self):
        for model in tts.GEMINI_MODELS:
            tts.mark_model_exhausted(model)

        self.assertFalse(tts.has_quota_for_any_model())

    def test_marking_the_same_model_twice_does_not_duplicate(self):
        tts.mark_model_exhausted(tts.GEMINI_MODELS[0])
        tts.mark_model_exhausted(tts.GEMINI_MODELS[0])

        state = tts._load_quota_state()
        self.assertEqual(state["exhausted_models"].count(tts.GEMINI_MODELS[0]), 1)

    def test_state_from_a_different_day_is_discarded(self):
        for model in tts.GEMINI_MODELS:
            tts.mark_model_exhausted(model)
        self.assertFalse(tts.has_quota_for_any_model())

        stale = json.loads(self.state_path.read_text(encoding="utf-8"))
        stale["day"] = "2000-01-01"
        self.state_path.write_text(json.dumps(stale), encoding="utf-8")

        # A brand new local day clears yesterday's memory entirely.
        self.assertTrue(tts.has_quota_for_any_model())
        state = tts._load_quota_state()
        self.assertEqual(state["exhausted_models"], [])
        self.assertNotEqual(state["day"], "2000-01-01")

    def test_malformed_state_file_is_treated_as_fresh(self):
        self.state_path.write_text("not json", encoding="utf-8")
        state = tts._load_quota_state()
        self.assertEqual(state["exhausted_models"], [])

    def test_check_quota_cli_exit_code_and_json(self):
        proc = subprocess.run(
            [sys.executable, str(TOOLS / "tts_scenes.py"), "--check-quota"],
            env={**os.environ, "SV_TTS_QUOTA_STATE": str(self.state_path)},
            capture_output=True,
            text=True,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        payload = json.loads(proc.stdout)
        self.assertEqual(payload["available_models"], tts.GEMINI_MODELS)

        for model in tts.GEMINI_MODELS:
            tts.mark_model_exhausted(model)
        proc = subprocess.run(
            [sys.executable, str(TOOLS / "tts_scenes.py"), "--check-quota"],
            env={**os.environ, "SV_TTS_QUOTA_STATE": str(self.state_path)},
            capture_output=True,
            text=True,
        )
        self.assertEqual(proc.returncode, 1)
        payload = json.loads(proc.stdout)
        self.assertEqual(payload["available_models"], [])
        self.assertEqual(set(payload["exhausted_models"]), set(tts.GEMINI_MODELS))

    def test_synth_gemini_skips_known_exhausted_models_without_a_network_call(self):
        """The actual value of this feature: once every model is known
        exhausted, don't even try - no urlopen call at all."""
        for model in tts.GEMINI_MODELS:
            tts.mark_model_exhausted(model)

        with patch("tts_scenes.urllib.request.urlopen") as urlopen:
            with self.assertRaises(SystemExit) as ctx:
                tts.synth_gemini("тест", Path(self.tmp.name) / "out.mp3", "fake-key")
            urlopen.assert_not_called()
            self.assertIn("already known exhausted today", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
