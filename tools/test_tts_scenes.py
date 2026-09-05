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
        # Isolated from the real Yandex fallback (SV_YANDEX_SA_KEY_FILE
        # pointed at a path that doesn't exist) - this test is specifically
        # about Gemini's own bookkeeping; YandexFallbackTests below covers
        # the fallback's own effect on --check-quota's exit code.
        env = {
            **os.environ,
            "SV_TTS_QUOTA_STATE": str(self.state_path),
            "SV_YANDEX_SA_KEY_FILE": str(Path(self.tmp.name) / "no-such-key.json"),
        }
        env.pop("YANDEX_FOLDER_ID", None)
        proc = subprocess.run(
            [sys.executable, str(TOOLS / "tts_scenes.py"), "--check-quota"],
            env=env,
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
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(proc.returncode, 1)
        payload = json.loads(proc.stdout)
        self.assertEqual(payload["available_models"], [])
        self.assertEqual(set(payload["exhausted_models"]), set(tts.GEMINI_MODELS))
        self.assertFalse(payload["yandex_fallback_ready"])

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


class YandexFallbackTests(unittest.TestCase):
    """tools/tts_scenes.py's Yandex SpeechKit fallback - added 2026-09-05
    after the operator set up a Yandex Cloud service account specifically so
    a Gemini-quota day doesn't stall production entirely. No real network
    calls or real keys anywhere in these tests."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state_path = Path(self.tmp.name) / "tts-quota.json"
        self.key_path = Path(self.tmp.name) / "sa-key.json"
        self.env_patch = patch.dict(os.environ, {
            "SV_TTS_QUOTA_STATE": str(self.state_path),
            "SV_YANDEX_SA_KEY_FILE": str(self.key_path),
            "YANDEX_FOLDER_ID": "folder-123",
        })
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)
        # Reset the in-memory IAM token cache between tests - it's a module
        # global, otherwise one test's minted token would leak into the next.
        tts._yandex_iam_cache.update(token=None, expires_at=0.0)

    def _write_key(self):
        self.key_path.write_text(json.dumps({
            "id": "key-id-1",
            "service_account_id": "sa-id-1",
            "private_key": "not-a-real-key",
        }), encoding="utf-8")

    def test_not_configured_without_a_key_file(self):
        self.assertFalse(tts.yandex_is_configured())
        self.assertIsNone(tts.yandex_iam_token())

    def test_configured_once_key_and_folder_are_present(self):
        self._write_key()
        self.assertTrue(tts.yandex_is_configured())

    def test_not_configured_without_folder_id_even_with_a_key(self):
        self._write_key()
        # yandex_folder_id() falls back to reading the repo's real .env when
        # the env var is unset, so patch it directly rather than relying on
        # env-var absence - this test is about yandex_is_configured()'s own
        # AND-logic, not about the .env fallback path (covered separately).
        with patch("tts_scenes.yandex_folder_id", return_value=""):
            self.assertFalse(tts.yandex_is_configured())

    def test_iam_token_is_minted_via_signed_jwt_and_cached(self):
        self._write_key()
        fake_resp = json.dumps({"iamToken": "iam-token-abc"}).encode()

        class FakeResp:
            def __enter__(self_inner):
                return self_inner

            def __exit__(self_inner, *a):
                return False

            def read(self_inner):
                return fake_resp

        with patch("jwt.encode", return_value="signed.jwt.token") as encode, \
             patch("tts_scenes.urllib.request.urlopen", return_value=FakeResp()) as urlopen:
            token = tts.yandex_iam_token()
            self.assertEqual(token, "iam-token-abc")
            encode.assert_called_once()
            self.assertEqual(encode.call_args.kwargs.get("algorithm"), "PS256")
            urlopen.assert_called_once()

            # Second call within validity window must not hit the network again.
            token2 = tts.yandex_iam_token()
            self.assertEqual(token2, "iam-token-abc")
            urlopen.assert_called_once()

    def test_synth_yandex_writes_mp3_bytes_from_response(self):
        out = Path(self.tmp.name) / "scene-0.mp3"

        class FakeResp:
            def __enter__(self_inner):
                return self_inner

            def __exit__(self_inner, *a):
                return False

            def read(self_inner):
                return b"fake-mp3-bytes"

        with patch("tts_scenes.urllib.request.urlopen", return_value=FakeResp()):
            tts.synth_yandex("привет", out, "iam-token-abc", "folder-123")

        self.assertEqual(out.read_bytes(), b"fake-mp3-bytes")

    def test_synth_yandex_raises_yandex_unavailable_without_folder_id(self):
        out = Path(self.tmp.name) / "scene-0.mp3"
        with self.assertRaises(tts.YandexUnavailable):
            tts.synth_yandex("привет", out, "iam-token-abc", "")

    def test_synth_scene_uses_gemini_when_quota_available(self):
        out = Path(self.tmp.name) / "scene-0.mp3"
        with patch("tts_scenes.synth_gemini") as synth_gemini:
            provider = tts.synth_scene("привет", out, "fake-gemini-key")
        self.assertEqual(provider, "gemini")
        synth_gemini.assert_called_once()

    def test_synth_scene_falls_back_to_yandex_when_gemini_quota_exhausted(self):
        """The actual point of this whole feature: a Gemini-exhausted day no
        longer stalls production, it falls through to Yandex - loudly, not
        silently (see the printed message in synth_scene)."""
        for model in tts.GEMINI_MODELS:
            tts.mark_model_exhausted(model)
        self._write_key()
        out = Path(self.tmp.name) / "scene-0.mp3"

        with patch("tts_scenes.synth_gemini") as synth_gemini, \
             patch("tts_scenes.yandex_iam_token", return_value="iam-token-abc"), \
             patch("tts_scenes.synth_yandex") as synth_yandex:
            provider = tts.synth_scene("привет", out, "fake-gemini-key")

        self.assertEqual(provider, "yandex")
        synth_gemini.assert_not_called()
        synth_yandex.assert_called_once()

    def test_synth_scene_falls_back_to_yandex_when_gemini_raises(self):
        """Quota bookkeeping said Gemini should work, but the live call
        still failed (network, transient) - same fallback applies."""
        self._write_key()
        out = Path(self.tmp.name) / "scene-0.mp3"

        def fake_gemini(*a, **kw):
            sys.exit("gemini synth failed: boom")

        with patch("tts_scenes.synth_gemini", side_effect=fake_gemini), \
             patch("tts_scenes.yandex_iam_token", return_value="iam-token-abc"), \
             patch("tts_scenes.synth_yandex") as synth_yandex:
            provider = tts.synth_scene("привет", out, "fake-gemini-key")

        self.assertEqual(provider, "yandex")
        synth_yandex.assert_called_once()

    def test_synth_scene_exits_when_both_providers_are_unavailable(self):
        for model in tts.GEMINI_MODELS:
            tts.mark_model_exhausted(model)
        # No Yandex key written - not configured either.
        out = Path(self.tmp.name) / "scene-0.mp3"

        with self.assertRaises(SystemExit) as ctx:
            tts.synth_scene("привет", out, "fake-gemini-key")
        self.assertIn("оба провайдера недоступны", str(ctx.exception))

    def test_check_quota_cli_is_ready_via_yandex_even_when_gemini_exhausted(self):
        """The --check-quota preflight (used by run_episode.sh) must not
        fail the whole run anymore just because Gemini is out for the day,
        as long as Yandex is configured as a fallback."""
        for model in tts.GEMINI_MODELS:
            tts.mark_model_exhausted(model)
        self._write_key()

        proc = subprocess.run(
            [sys.executable, str(TOOLS / "tts_scenes.py"), "--check-quota"],
            env={
                **os.environ,
                "SV_TTS_QUOTA_STATE": str(self.state_path),
                "SV_YANDEX_SA_KEY_FILE": str(self.key_path),
                "YANDEX_FOLDER_ID": "folder-123",
            },
            capture_output=True,
            text=True,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        payload = json.loads(proc.stdout)
        self.assertEqual(payload["available_models"], [])
        self.assertTrue(payload["yandex_fallback_ready"])

    def test_check_quota_cli_fails_when_neither_provider_is_available(self):
        for model in tts.GEMINI_MODELS:
            tts.mark_model_exhausted(model)
        proc = subprocess.run(
            [sys.executable, str(TOOLS / "tts_scenes.py"), "--check-quota"],
            env={
                **os.environ,
                "SV_TTS_QUOTA_STATE": str(self.state_path),
                "SV_YANDEX_SA_KEY_FILE": str(self.key_path),  # never written
            },
            capture_output=True,
            text=True,
        )
        self.assertEqual(proc.returncode, 1)
        payload = json.loads(proc.stdout)
        self.assertFalse(payload["yandex_fallback_ready"])


if __name__ == "__main__":
    unittest.main()
