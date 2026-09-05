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

Extended the same day to key across (key, model) pairs, not just models:
the operator's fix for the underlying quota wall is a second GEMINI_API_KEY
from a separate Google account (its own independent free-tier pool), not a
different TTS provider (Yandex SpeechKit was tried and reverted the same
day - noticeably duller than Gemini's prompt-driven style).

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

KEY_A = "fake-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaa1111"
KEY_B = "fake-key-bbbbbbbbbbbbbbbbbbbbbbbbbbbb2222"


class QuotaStateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state_path = Path(self.tmp.name) / "tts-quota.json"
        self.env_patch = patch.dict(os.environ, {"SV_TTS_QUOTA_STATE": str(self.state_path)})
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)

    def test_fresh_state_has_no_exhausted_combos(self):
        state = tts._load_quota_state()
        self.assertEqual(state["exhausted_combos"], [])
        self.assertTrue(tts.has_quota_for_any_model(keys=[KEY_A]))
        for model in tts.GEMINI_MODELS:
            self.assertFalse(tts.combo_is_known_exhausted(KEY_A, model))

    def test_mark_exhausted_persists_across_loads(self):
        tts.mark_combo_exhausted(KEY_A, tts.GEMINI_MODELS[0])

        self.assertTrue(tts.combo_is_known_exhausted(KEY_A, tts.GEMINI_MODELS[0]))
        self.assertFalse(tts.combo_is_known_exhausted(KEY_A, tts.GEMINI_MODELS[1]))
        self.assertTrue(tts.has_quota_for_any_model(keys=[KEY_A]))  # other models still fine

    def test_marking_all_models_for_a_key_reports_no_quota_for_that_key_alone(self):
        for model in tts.GEMINI_MODELS:
            tts.mark_combo_exhausted(KEY_A, model)

        self.assertFalse(tts.has_quota_for_any_model(keys=[KEY_A]))

    def test_a_second_key_still_has_quota_when_the_first_is_fully_exhausted(self):
        """The actual point of the multi-key feature: KEY_A running out
        doesn't take KEY_B down with it - a second Google account's key is
        a fully independent quota pool."""
        for model in tts.GEMINI_MODELS:
            tts.mark_combo_exhausted(KEY_A, model)

        self.assertFalse(tts.has_quota_for_any_model(keys=[KEY_A]))
        self.assertTrue(tts.has_quota_for_any_model(keys=[KEY_A, KEY_B]))
        self.assertTrue(tts.has_quota_for_any_model(keys=[KEY_B]))

    def test_marking_the_same_combo_twice_does_not_duplicate(self):
        tts.mark_combo_exhausted(KEY_A, tts.GEMINI_MODELS[0])
        tts.mark_combo_exhausted(KEY_A, tts.GEMINI_MODELS[0])

        state = tts._load_quota_state()
        combo = f"{tts._key_fingerprint(KEY_A)}:{tts.GEMINI_MODELS[0]}"
        self.assertEqual(state["exhausted_combos"].count(combo), 1)

    def test_different_keys_with_the_same_model_are_distinct_combos(self):
        tts.mark_combo_exhausted(KEY_A, tts.GEMINI_MODELS[0])

        self.assertTrue(tts.combo_is_known_exhausted(KEY_A, tts.GEMINI_MODELS[0]))
        self.assertFalse(tts.combo_is_known_exhausted(KEY_B, tts.GEMINI_MODELS[0]))

    def test_state_from_a_different_day_is_discarded(self):
        for model in tts.GEMINI_MODELS:
            tts.mark_combo_exhausted(KEY_A, model)
        self.assertFalse(tts.has_quota_for_any_model(keys=[KEY_A]))

        stale = json.loads(self.state_path.read_text(encoding="utf-8"))
        stale["day"] = "2000-01-01"
        self.state_path.write_text(json.dumps(stale), encoding="utf-8")

        # A brand new local day clears yesterday's memory entirely.
        self.assertTrue(tts.has_quota_for_any_model(keys=[KEY_A]))
        state = tts._load_quota_state()
        self.assertEqual(state["exhausted_combos"], [])
        self.assertNotEqual(state["day"], "2000-01-01")

    def test_malformed_state_file_is_treated_as_fresh(self):
        self.state_path.write_text("not json", encoding="utf-8")
        state = tts._load_quota_state()
        self.assertEqual(state["exhausted_combos"], [])

    def test_key_fingerprint_never_contains_the_raw_key(self):
        fp = tts._key_fingerprint(KEY_A)
        self.assertNotIn(KEY_A, fp)
        self.assertNotEqual(fp, KEY_A)
        # deterministic, so bookkeeping actually recognizes the same key again
        self.assertEqual(fp, tts._key_fingerprint(KEY_A))

    def test_check_quota_cli_exit_code_and_json(self):
        env = {**os.environ, "SV_TTS_QUOTA_STATE": str(self.state_path),
               "GEMINI_API_KEY": KEY_A}
        env.pop("GEMINI_API_KEY_2", None)
        proc = subprocess.run(
            [sys.executable, str(TOOLS / "tts_scenes.py"), "--check-quota"],
            env=env, capture_output=True, text=True,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        payload = json.loads(proc.stdout)
        self.assertEqual(payload["keys_configured"], 1)
        self.assertEqual(payload["available_combos"], len(tts.GEMINI_MODELS))

        for model in tts.GEMINI_MODELS:
            tts.mark_combo_exhausted(KEY_A, model)
        proc = subprocess.run(
            [sys.executable, str(TOOLS / "tts_scenes.py"), "--check-quota"],
            env=env, capture_output=True, text=True,
        )
        self.assertEqual(proc.returncode, 1)
        payload = json.loads(proc.stdout)
        self.assertEqual(payload["available_combos"], 0)
        self.assertEqual(len(payload["exhausted_combos"]), len(tts.GEMINI_MODELS))

    def test_check_quota_cli_reports_a_second_key_as_extra_headroom(self):
        env = {**os.environ, "SV_TTS_QUOTA_STATE": str(self.state_path),
               "GEMINI_API_KEY": KEY_A, "GEMINI_API_KEY_2": KEY_B}
        for model in tts.GEMINI_MODELS:
            tts.mark_combo_exhausted(KEY_A, model)
        proc = subprocess.run(
            [sys.executable, str(TOOLS / "tts_scenes.py"), "--check-quota"],
            env=env, capture_output=True, text=True,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        payload = json.loads(proc.stdout)
        self.assertEqual(payload["keys_configured"], 2)
        self.assertEqual(payload["available_combos"], len(tts.GEMINI_MODELS))

    def test_synth_gemini_skips_known_exhausted_combos_without_a_network_call(self):
        """The actual value of this feature: once every configured combo is
        known exhausted, don't even try - no urlopen call at all."""
        for model in tts.GEMINI_MODELS:
            tts.mark_combo_exhausted(KEY_A, model)

        with patch("tts_scenes.urllib.request.urlopen") as urlopen:
            with self.assertRaises(SystemExit) as ctx:
                tts.synth_gemini("тест", Path(self.tmp.name) / "out.mp3", [KEY_A])
            urlopen.assert_not_called()
            self.assertIn("already known exhausted today", str(ctx.exception))

    def test_synth_gemini_falls_through_to_the_second_key_on_429(self):
        """The multi-key feature's real behavior, not just its bookkeeping:
        a 429 on every model of KEY_A must not stop synth_gemini from trying
        KEY_B before giving up."""
        import urllib.error

        calls = []

        def fake_urlopen(req, timeout=None):
            key = req.get_header("X-goog-api-key")
            calls.append(key)
            if key == KEY_A:
                raise urllib.error.HTTPError(req.full_url, 429, "quota", {}, None)
            raise urllib.error.HTTPError(req.full_url, 500, "boom", {}, None)

        with patch("tts_scenes.urllib.request.urlopen", side_effect=fake_urlopen), \
             patch("tts_scenes.time.sleep"):
            with self.assertRaises(SystemExit):
                tts.synth_gemini("тест", Path(self.tmp.name) / "out.mp3", [KEY_A, KEY_B])

        # Every KEY_A model got exactly one 429 (no retry on 429 itself),
        # then it moved on to KEY_B - never gave up on KEY_A only partially.
        self.assertEqual(calls.count(KEY_A), len(tts.GEMINI_MODELS))
        self.assertTrue(any(k == KEY_B for k in calls))
        for model in tts.GEMINI_MODELS:
            self.assertTrue(tts.combo_is_known_exhausted(KEY_A, model))
            self.assertFalse(tts.combo_is_known_exhausted(KEY_B, model))


if __name__ == "__main__":
    unittest.main()
