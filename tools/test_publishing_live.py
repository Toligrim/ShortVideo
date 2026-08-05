import os
from pathlib import Path
import tempfile
import unittest
from contextlib import redirect_stderr
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import publish
from publishing.adapters.base import PermanentPublishError
from publishing.adapters.live import CombinedLiveAdapterFactory, instagram_doctor
from publishing.adapters.instagram import InstagramReelsAdapter
from publishing.adapters.r2 import R2AssetError, R2ConfigurationError, R2OperationError


class LiveFactoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.state = self.root / "state"
        self.state.mkdir(mode=0o700)
        self.token = self.root / "instagram-token"
        self.token.write_text("TOKEN", encoding="utf-8")
        self.token.chmod(0o600)
        self.env = {
            "SHORTVIDEO_INSTAGRAM_USER_ID": "123456",
            "SHORTVIDEO_INSTAGRAM_API_VERSION": "v24.0",
            "SHORTVIDEO_INSTAGRAM_ACCESS_TOKEN_FILE": str(self.token),
            "SHORTVIDEO_R2_ACCOUNT_ID": "a" * 32,
            "SHORTVIDEO_R2_BUCKET": "shortvideo-media",
            "SHORTVIDEO_R2_ACCESS_KEY_ID": "ACCESS_KEY_VALUE",
            "SHORTVIDEO_R2_SECRET_ACCESS_KEY": "SECRET_KEY_VALUE",
        }

    def test_youtube_does_not_require_instagram_configuration(self):
        sentinel = object()
        factory = CombinedLiveAdapterFactory(self.state, youtube_factory=lambda platform: sentinel)
        with patch.dict(os.environ, {}, clear=True):
            self.assertIs(factory("youtube"), sentinel)
        self.assertTrue(factory.supports_resumable_session("youtube"))
        self.assertFalse(factory.supports_resumable_session("instagram"))
        self.assertTrue(factory.supports_instagram_checkpoint("instagram"))
        self.assertFalse(factory.supports_instagram_checkpoint("youtube"))

    def test_instagram_factory_is_lazy_and_safe(self):
        factory = CombinedLiveAdapterFactory(self.state)
        with patch.dict(os.environ, self.env, clear=True):
            adapter = factory("instagram")
        self.assertIsInstance(adapter, InstagramReelsAdapter)
        self.assertIsNone(adapter.r2._client)

    def test_instagram_doctor_is_local_and_redacted(self):
        with patch.dict(os.environ, self.env, clear=True), patch(
            "publishing.adapters.r2._r2_client", side_effect=AssertionError("no client")
        ):
            result = instagram_doctor(state_dir=self.state)
        self.assertEqual(result, {"provider": "instagram", "access_token_configured": True, "r2_configured": True, "api_version": "v24.0"})
        rendered = repr(result)
        for secret in ("TOKEN", "ACCESS_KEY_VALUE", "SECRET_KEY_VALUE", str(self.token), "shortvideo-media", "123456"):
            self.assertNotIn(secret, rendered)

    def test_invalid_instagram_configuration_is_safe_permanent_error(self):
        factory = CombinedLiveAdapterFactory(self.state)
        with patch.dict(os.environ, {}, clear=True), self.assertRaisesRegex(PermanentPublishError, "not configured safely"):
            factory("instagram")

    def test_instagram_doctor_cli_reports_safe_error_without_traceback(self):
        stderr = tempfile.SpooledTemporaryFile(mode="w+")
        try:
            with patch.dict(os.environ, {}, clear=True), redirect_stderr(stderr):
                result = publish.main(["doctor", "instagram", "--state-dir", str(self.state)])
            stderr.seek(0)
            error = stderr.read()
        finally:
            stderr.close()
        self.assertEqual(result, 2)
        self.assertIn("error: Instagram live adapter is not configured safely", error)
        self.assertNotIn("Traceback", error)
        self.assertNotIn("TOKEN", error)


class ReconcileCleanupCliTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = Path(self.tmp.name) / "state"
        self.state.mkdir(mode=0o700)

    def _run_reconcile(self, cleanup_side_effect=None):
        target = SimpleNamespace(
            id=42,
            platform="instagram",
            instagram_checkpoint_verified=True,
            instagram_object_key="temporary-media/publication/target/asset.mp4",
        )
        updated = SimpleNamespace(
            platform="instagram",
            state=SimpleNamespace(value="published"),
            dispatch_generation=3,
            external_media_id="media-1",
            external_url="https://instagram.example/media-1",
        )
        store = MagicMock()
        store.reconcile_target.return_value = updated
        media = MagicMock()
        media.cleanup.side_effect = cleanup_side_effect
        stderr = tempfile.SpooledTemporaryFile(mode="w+")
        try:
            with (
                patch("publish._config", return_value=SimpleNamespace(database_path=self.state / "publisher.sqlite3")),
                patch("publish.PublishingStore", return_value=store),
                patch("publish._selected_target", return_value=(SimpleNamespace(id="publication-1"), target)),
                patch("publish.R2Config.from_environment", return_value=MagicMock()),
                patch("publish.R2TemporaryMedia", return_value=media),
                redirect_stderr(stderr),
            ):
                result = publish.main(
                    [
                        "reconcile", "--state-dir", str(self.state), "--publication-id", "publication-1",
                        "--target", "instagram", "--outcome", "mark-published",
                        "--external-id", "media-1", "--external-url", "https://instagram.example/media-1",
                    ]
                )
            stderr.seek(0)
            return result, stderr.read(), store, media
        finally:
            stderr.close()

    def test_cleanup_errors_are_safe_and_do_not_reconcile(self):
        for error in (R2ConfigurationError, R2OperationError, R2AssetError):
            with self.subTest(error=error.__name__):
                result, stderr, store, media = self._run_reconcile(error("unsafe cleanup"))
                self.assertEqual(result, 2)
                self.assertIn("Instagram temporary media cleanup failed", stderr)
                media.cleanup.assert_called_once_with("temporary-media/publication/target/asset.mp4")
                store.reconcile_target.assert_not_called()

    def test_successful_cleanup_precedes_reconcile_transition(self):
        calls = []
        target = SimpleNamespace(
            id=42,
            platform="instagram",
            instagram_checkpoint_verified=True,
            instagram_object_key="temporary-media/publication/target/asset.mp4",
        )
        updated = SimpleNamespace(
            platform="instagram",
            state=SimpleNamespace(value="published"),
            dispatch_generation=3,
            external_media_id="media-1",
            external_url="https://instagram.example/media-1",
        )
        store = MagicMock()
        store.reconcile_target.side_effect = lambda *args, **kwargs: (calls.append("reconcile"), updated)[1]
        media = MagicMock()
        media.cleanup.side_effect = lambda key: calls.append("cleanup")
        with (
            patch("publish._config", return_value=SimpleNamespace(database_path=self.state / "publisher.sqlite3")),
            patch("publish.PublishingStore", return_value=store),
            patch("publish._selected_target", return_value=(SimpleNamespace(id="publication-1"), target)),
            patch("publish.R2Config.from_environment", return_value=MagicMock()),
            patch("publish.R2TemporaryMedia", return_value=media),
        ):
            self.assertEqual(
                publish.main(
                    [
                        "reconcile", "--state-dir", str(self.state), "--publication-id", "publication-1",
                        "--target", "instagram", "--outcome", "mark-published",
                        "--external-id", "media-1", "--external-url", "https://instagram.example/media-1",
                    ]
                ),
                0,
            )
        self.assertEqual(calls, ["cleanup", "reconcile"])


if __name__ == "__main__":
    unittest.main()
