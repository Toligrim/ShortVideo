from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import sha256
from pathlib import Path
from contextlib import redirect_stderr
from io import StringIO
import os
import tempfile
import threading
import unittest
from urllib.parse import parse_qs
from unittest.mock import patch

from publishing.adapters.base import AmbiguousPublishError, InstagramPublishCheckpoint, PermanentPublishError, PublishRequest, RetryablePublishError
from publishing.adapters.instagram import InstagramConfigurationError, InstagramHttpResponse, InstagramReelsAdapter, InstagramSettings
from publishing.adapters.live import CombinedLiveAdapterFactory, instagram_doctor
from publishing.adapters.r2 import R2ConfigurationError, R2OperationError, StagedMedia
from publishing.db import PublishingStore
from publishing.metadata import metadata_sha256, write_metadata_snapshot
from publishing.models import ExecutionMode, TargetState
from publishing.worker import PublishWorker
import publish


class FakeTransport:
    def __init__(self, responses): self.responses, self.calls = list(responses), []
    def request(self, method, url, *, headers, body, timeout):
        self.calls.append((method, url, dict(headers), body, timeout))
        item = self.responses.pop(0)
        if isinstance(item, BaseException): raise item
        return item


class FakeR2:
    def __init__(self, staged): self.staged, self.stage_calls, self.cleanup_calls = staged, [], []
    def stage(self, **kwargs): self.stage_calls.append(kwargs); return self.staged
    def cleanup(self, key): self.cleanup_calls.append(key)


class WatchdogTransport(FakeTransport):
    requires_lease_watchdog = True

    def __init__(self, response, failed):
        super().__init__([response])
        self.failed = failed

    def request(self, method, url, *, headers, body, timeout):
        self.calls.append((method, url, dict(headers), body, timeout))
        self.failed.wait(1)
        return self.responses.pop(0)


class InstagramAdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); root = Path(self.temp.name)
        self.asset = root / "approved.mp4"; self.asset.write_bytes(b"approved-video")
        self.digest = sha256(self.asset.read_bytes()).hexdigest(); self.fingerprint = "a" * 64
        self.token = root / "instagram-token"; self.token.write_text("secret-token", encoding="utf-8"); os.chmod(self.token, 0o600)
        self.settings = InstagramSettings("12345", "v22.0", self.token, root / "state")
        self.staged = StagedMedia("temporary-media/pub/1/object.mp4", "https://abc.r2.cloudflarestorage.com/x?X-Amz-Signature=secret", datetime.now(timezone.utc) + timedelta(minutes=10))
        self.recorded = []

    def tearDown(self): self.temp.cleanup()
    def request(self, checkpoint=None, **kwargs):
        return PublishRequest("pub", 1, "instagram", self.asset, self.digest, {"targets": {"instagram": {"caption": "Hi #short", "share_to_feed": True}}}, self.fingerprint, "idempotency", instagram_checkpoint=checkpoint, record_instagram_checkpoint=lambda cp: self.recorded.append(cp) or True, **kwargs)
    def adapter(self, responses):
        self.r2 = FakeR2(self.staged); self.transport = FakeTransport(responses)
        return InstagramReelsAdapter(self.settings, self.r2, transport=self.transport, timeout_seconds=1)

    def test_happy_path_form_encoding_and_cleanup(self):
        adapter = self.adapter([InstagramHttpResponse(200, {}, b'{"id":"88"}'), InstagramHttpResponse(200, {}, b'{"status_code":"FINISHED"}'), InstagramHttpResponse(200, {}, b'{"id":"99"}')])
        result = adapter.publish(self.request())
        self.assertEqual(result.external_url, "https://www.instagram.com/reel/99/")
        self.assertEqual([x.phase for x in self.recorded], ["object_uploaded", "container_create_inflight", "container_created", "processing", "publish_inflight"])
        self.assertEqual(self.r2.cleanup_calls, [self.staged.object_key])
        first = parse_qs(self.transport.calls[0][3].decode())
        self.assertEqual(first["media_type"], ["REELS"]); self.assertEqual(first["share_to_feed"], ["true"])
        self.assertEqual(first["access_token"], ["secret-token"])
        self.assertNotIn("secret-token", repr(self.recorded)); self.assertNotIn("X-Amz-Signature", repr(self.recorded))

    def test_worker_fast_finished_path_publishes_and_clears_checkpoint(self):
        state_dir = Path(self.temp.name) / "worker-state"; state_dir.mkdir(mode=0o700)
        metadata = {
            "schema_version": 1, "slug": "instagram-fast-path",
            "targets": {"instagram": {"caption": "Hi #short", "share_to_feed": True}},
        }
        snapshot = write_metadata_snapshot(metadata, Path(self.temp.name) / "metadata")
        store = PublishingStore(Path(self.temp.name) / "publisher.sqlite3")
        publication = store.create_publication(
            publication_id="instagram-fast-path", slug="instagram-fast-path",
            source_path=str(self.asset), source_sha256=self.digest,
            asset_path=str(self.asset), asset_sha256=self.digest,
            metadata_path=str(snapshot.path), metadata_sha256=metadata_sha256(metadata),
            target_platforms=("instagram",), execution_mode=ExecutionMode.LIVE,
        )
        action = store.issue_telegram_action(publication.id, "approve")
        self.assertTrue(store.apply_telegram_action(update_id=1, action_token=action.token, actor_user_id="operator").accepted)
        r2 = FakeR2(self.staged)
        transport = FakeTransport([
            InstagramHttpResponse(200, {}, b'{"id":"88"}'),
            InstagramHttpResponse(200, {}, b'{"status_code":"FINISHED"}'),
            InstagramHttpResponse(200, {}, b'{"id":"99"}'),
        ])
        adapter = InstagramReelsAdapter(
            InstagramSettings("12345", "v22.0", self.token, state_dir), r2, transport=transport, timeout_seconds=1,
        )

        class Factory:
            def supports_instagram_checkpoint(self, platform): return platform == "instagram"
            def __call__(self, platform):
                self_test.assertEqual(platform, "instagram")
                return adapter

        self_test = self
        result = PublishWorker(store=store, worker_id="fast-path", adapter_factory=Factory(), lease_seconds=30).run_once()
        target = store.list_targets(publication.id)[0]
        self.assertEqual(result.outcome, "published")
        self.assertEqual(target.state, TargetState.PUBLISHED)
        self.assertFalse(target.instagram_checkpoint_verified)
        self.assertIsNone(target.instagram_object_key)
        self.assertIsNone(target.instagram_container_id)
        self.assertIsNone(target.instagram_phase)
        self.assertEqual(len(transport.calls), 3)
        self.assertEqual(sum("/media_publish" in call[1] for call in transport.calls), 1)
        self.assertEqual(r2.cleanup_calls, [self.staged.object_key])

    def test_fresh_container_timeout_is_ambiguous_and_never_repeats(self):
        adapter = self.adapter([OSError("lost")])
        with self.assertRaises(AmbiguousPublishError): adapter.publish(self.request())
        checkpoint = self.recorded[-1]
        with self.assertRaises(AmbiguousPublishError): adapter.publish(self.request(checkpoint))
        self.assertEqual(len(self.transport.calls), 1)

    def test_object_uploaded_resume_refreshes_r2_then_creates_once(self):
        cp = InstagramPublishCheckpoint(self.staged.object_key, None, self.digest, self.fingerprint, self.asset.stat().st_size, "video/mp4", "object_uploaded", "2030-01-01T00:00:00Z")
        adapter = self.adapter([InstagramHttpResponse(200, {}, b'{"id":"88"}'), InstagramHttpResponse(200, {}, b'{"status_code":"IN_PROGRESS"}')])
        with self.assertRaises(RetryablePublishError): adapter.publish(self.request(cp))
        self.assertEqual(len(self.r2.stage_calls), 1)
        self.assertEqual([x.phase for x in self.recorded], ["object_uploaded", "container_create_inflight", "container_created", "processing"])
        create_calls = [call for call in self.transport.calls if call[0] == "POST"]
        self.assertEqual(len(create_calls), 1)

    def test_create_inflight_never_repeats_post(self):
        cp = InstagramPublishCheckpoint(self.staged.object_key, None, self.digest, self.fingerprint, self.asset.stat().st_size, "video/mp4", "container_create_inflight", "2030-01-01T00:00:00Z")
        adapter = self.adapter([])
        with self.assertRaises(AmbiguousPublishError): adapter.publish(self.request(cp))
        self.assertEqual(adapter.transport.calls, [])

    def test_processing_then_finished_resume_and_publish_once(self):
        cp = InstagramPublishCheckpoint(self.staged.object_key, "88", self.digest, self.fingerprint, self.asset.stat().st_size, "video/mp4", "container_created", "2030-01-01T00:00:00Z")
        adapter = self.adapter([InstagramHttpResponse(200, {}, b'{"status_code":"IN_PROGRESS"}')])
        with self.assertRaises(RetryablePublishError): adapter.publish(self.request(cp))
        self.assertEqual(self.recorded[-1].phase, "processing")
        processing = self.recorded[-1]
        adapter = self.adapter([InstagramHttpResponse(200, {}, b'{"status_code":"FINISHED"}'), InstagramHttpResponse(200, {}, b'{"id":"99"}')])
        self.assertEqual(adapter.publish(self.request(processing)).external_media_id, "99")

    def test_error_and_publish_inflight_are_not_retried(self):
        cp = InstagramPublishCheckpoint(self.staged.object_key, "88", self.digest, self.fingerprint, self.asset.stat().st_size, "video/mp4", "container_created", "2030-01-01T00:00:00Z")
        adapter = self.adapter([InstagramHttpResponse(200, {}, b'{"status_code":"ERROR"}')])
        with self.assertRaises(PermanentPublishError): adapter.publish(self.request(cp))
        self.assertEqual(adapter.r2.cleanup_calls, [self.staged.object_key])
        inflight = InstagramPublishCheckpoint(**{**cp.__dict__, "phase": "publish_inflight"})
        adapter = self.adapter([])
        with self.assertRaises(AmbiguousPublishError): adapter.publish(self.request(inflight))
        self.assertEqual(adapter.transport.calls, [])

    def test_media_publish_timeout_is_ambiguous(self):
        cp = InstagramPublishCheckpoint(self.staged.object_key, "88", self.digest, self.fingerprint, self.asset.stat().st_size, "video/mp4", "container_created", "2030-01-01T00:00:00Z")
        adapter = self.adapter([InstagramHttpResponse(200, {}, b'{"status_code":"FINISHED"}'), OSError("lost")])
        with self.assertRaises(AmbiguousPublishError): adapter.publish(self.request(cp))
        self.assertEqual(self.recorded[-1].phase, "publish_inflight")
        self.assertEqual(self.r2.cleanup_calls, [])

    def test_accepted_publish_cleanup_failure_preserves_known_media(self):
        cp = InstagramPublishCheckpoint(self.staged.object_key, "88", self.digest, self.fingerprint, self.asset.stat().st_size, "video/mp4", "container_created", "2030-01-01T00:00:00Z")
        adapter = self.adapter([InstagramHttpResponse(200, {}, b'{"status_code":"FINISHED"}'), InstagramHttpResponse(200, {}, b'{"id":"99"}')])
        adapter.r2.cleanup = lambda _key: (_ for _ in ()).throw(R2OperationError("provider secret"))
        with self.assertRaises(AmbiguousPublishError) as raised:
            adapter.publish(self.request(cp))
        self.assertEqual(raised.exception.code, "instagram_cleanup_required")
        self.assertEqual(raised.exception.external_media_id, "99")
        self.assertEqual(raised.exception.external_url, "https://www.instagram.com/reel/99/")
        self.assertNotIn("provider secret", str(raised.exception))
        self.assertEqual([item.phase for item in self.recorded], ["processing", "publish_inflight"])
        calls_before_resume = len(adapter.transport.calls)
        with self.assertRaises(AmbiguousPublishError):
            adapter.publish(self.request(self.recorded[-1]))
        self.assertEqual(len(adapter.transport.calls), calls_before_resume)

    def test_terminal_cleanup_failure_requires_reconciliation(self):
        cp = InstagramPublishCheckpoint(self.staged.object_key, "88", self.digest, self.fingerprint, self.asset.stat().st_size, "video/mp4", "processing", "2030-01-01T00:00:00Z")
        adapter = self.adapter([InstagramHttpResponse(200, {}, b'{"status_code":"ERROR"}')])
        adapter.r2.cleanup = lambda _key: (_ for _ in ()).throw(R2OperationError("hidden"))
        with self.assertRaises(AmbiguousPublishError) as raised:
            adapter.publish(self.request(cp))
        self.assertEqual(raised.exception.code, "instagram_cleanup_required")
        self.assertEqual(raised.exception.external_session_id, "88")

    def test_status_server_failure_is_retryable(self):
        cp = InstagramPublishCheckpoint(self.staged.object_key, "88", self.digest, self.fingerprint, self.asset.stat().st_size, "video/mp4", "container_created", "2030-01-01T00:00:00Z")
        adapter = self.adapter([InstagramHttpResponse(503, {"Retry-After": "9"})])
        with self.assertRaises(RetryablePublishError) as raised:
            adapter.publish(self.request(cp))
        self.assertEqual(raised.exception.retry_after_seconds, 9)

    def test_production_watchdog_rejects_success_after_lease_loss(self):
        failed = threading.Event()
        beats = iter((True, True, False))
        def heartbeat():
            result = next(beats)
            if not result:
                failed.set()
            return result
        adapter = self.adapter([])
        adapter.transport = WatchdogTransport(InstagramHttpResponse(200, {}, b'{"id":"88"}'), failed)
        with self.assertRaises(AmbiguousPublishError) as raised:
            adapter.publish(self.request(heartbeat=heartbeat, lease_seconds=10))
        self.assertEqual(raised.exception.code, "instagram_lease_lost_during_request")

    def test_bad_token_never_records_irreversible_phases(self):
        self.token.unlink()
        adapter = self.adapter([])
        with self.assertRaises(InstagramConfigurationError):
            adapter.publish(self.request())
        self.assertEqual([item.phase for item in self.recorded], ["object_uploaded"])
        self.assertEqual(adapter.transport.calls, [])

    def test_bad_token_after_status_never_records_publish_inflight(self):
        cp = InstagramPublishCheckpoint(self.staged.object_key, "88", self.digest, self.fingerprint, self.asset.stat().st_size, "video/mp4", "container_created", "2030-01-01T00:00:00Z")
        class DeleteTokenTransport(FakeTransport):
            def request(inner, method, url, *, headers, body, timeout):
                value = super(DeleteTokenTransport, inner).request(method, url, headers=headers, body=body, timeout=timeout)
                self.token.unlink()
                return value
        self.r2 = FakeR2(self.staged)
        adapter = InstagramReelsAdapter(self.settings, self.r2, transport=DeleteTokenTransport([InstagramHttpResponse(200, {}, b'{"status_code":"FINISHED"}')]), timeout_seconds=1)
        with self.assertRaises(InstagramConfigurationError):
            adapter.publish(self.request(cp))
        self.assertEqual([item.phase for item in self.recorded], ["processing"])
        self.assertEqual(len(adapter.transport.calls), 1)

    def test_r2_operation_is_retryable_but_configuration_is_permanent(self):
        adapter = self.adapter([])
        adapter.r2.stage = lambda **_kwargs: (_ for _ in ()).throw(R2OperationError("redacted"))
        with self.assertRaises(RetryablePublishError): adapter.publish(self.request())
        adapter = self.adapter([])
        adapter.r2.stage = lambda **_kwargs: (_ for _ in ()).throw(R2ConfigurationError("secret-token"))
        with self.assertRaises(PermanentPublishError) as raised:
            adapter.publish(self.request())
        self.assertNotIn("secret-token", str(raised.exception))

    def test_cancel_and_lease_are_checked_before_network(self):
        adapter = self.adapter([])
        with self.assertRaises(PermanentPublishError): adapter.publish(self.request(cancellation_requested=lambda: True))
        with self.assertRaises(PermanentPublishError): adapter.publish(self.request(lease_seconds=6))
        self.assertEqual(adapter.transport.calls, [])

    def test_settings_rejects_token_inside_state(self):
        with self.assertRaises(Exception):
            InstagramSettings.from_environment(state_dir=self.temp.name, environ={"SHORTVIDEO_INSTAGRAM_USER_ID": "1", "SHORTVIDEO_INSTAGRAM_API_VERSION": "v22.0", "SHORTVIDEO_INSTAGRAM_ACCESS_TOKEN_FILE": str(self.token)})


class InstagramDoctorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.state = self.root / "state"
        self.state.mkdir(mode=0o700)
        self.token = self.root / "instagram-token"
        self.fake_token = "unit-test-token-never-print"
        self.token.write_text(self.fake_token, encoding="utf-8")
        self.token.chmod(0o600)
        self.env = {
            "SHORTVIDEO_INSTAGRAM_USER_ID": "123456789",
            "SHORTVIDEO_INSTAGRAM_API_VERSION": "v22.0",
            "SHORTVIDEO_INSTAGRAM_ACCESS_TOKEN_FILE": str(self.token),
            "SHORTVIDEO_R2_ACCOUNT_ID": "a" * 32,
            "SHORTVIDEO_R2_BUCKET": "shortvideo-media",
            "SHORTVIDEO_R2_ACCESS_KEY_ID": "unit-test-access-key",
            "SHORTVIDEO_R2_SECRET_ACCESS_KEY": "unit-test-secret-key",
            "SHORTVIDEO_R2_TTL": "900",
        }

    def doctor_error(self, environ=None):
        with self.assertRaises(PermanentPublishError) as raised:
            instagram_doctor(state_dir=self.state, environ=self.env if environ is None else environ)
        self.assertEqual(raised.exception.code, "instagram_configuration_invalid")
        return raised.exception

    def test_valid_configuration_is_ok_without_exposing_token(self):
        result = instagram_doctor(state_dir=self.state, environ=self.env)
        self.assertEqual(
            result,
            {
                "provider": "instagram",
                "access_token_configured": True,
                "r2_configured": True,
                "api_version": "v22.0",
            },
        )
        self.assertNotIn(self.fake_token, repr(result))

    def test_non_cloudflare_s3_provider_with_endpoint_override_is_ok(self):
        """Backblaze B2 (or any other S3-compatible provider) has no
        Cloudflare-shaped account id — doctor must not demand one once an
        explicit endpoint override is present."""
        env = dict(self.env)
        del env["SHORTVIDEO_R2_ACCOUNT_ID"]
        env["SHORTVIDEO_R2_ENDPOINT_URL"] = "https://s3.us-west-004.backblazeb2.com"
        env["SHORTVIDEO_R2_REGION"] = "us-west-004"
        result = instagram_doctor(state_dir=self.state, environ=env)
        self.assertEqual(result["r2_configured"], True)

    def test_endpoint_override_must_be_a_bare_https_url(self):
        env = dict(self.env)
        del env["SHORTVIDEO_R2_ACCOUNT_ID"]
        env["SHORTVIDEO_R2_ENDPOINT_URL"] = "http://s3.us-west-004.backblazeb2.com"
        error = self.doctor_error(env)
        self.assertIn("r2_endpoint_url_invalid", error.reason_codes)

    def test_each_configuration_problem_has_a_specific_reason_code(self):
        cases = {
            "instagram_user_id_placeholder": ("SHORTVIDEO_INSTAGRAM_USER_ID", "REPLACE_WITH_PROFESSIONAL_ACCOUNT_ID"),
            "instagram_user_id_invalid": ("SHORTVIDEO_INSTAGRAM_USER_ID", "not-an-id"),
            "instagram_api_version_placeholder": ("SHORTVIDEO_INSTAGRAM_API_VERSION", "vXX.0"),
            "instagram_api_version_invalid": ("SHORTVIDEO_INSTAGRAM_API_VERSION", "22"),
            "instagram_token_path_missing": ("SHORTVIDEO_INSTAGRAM_ACCESS_TOKEN_FILE", ""),
            "instagram_token_path_placeholder": (
                "SHORTVIDEO_INSTAGRAM_ACCESS_TOKEN_FILE",
                "/home/USER/.local/share/shortvideo/secrets/instagram-token",
            ),
            "instagram_token_path_not_absolute": ("SHORTVIDEO_INSTAGRAM_ACCESS_TOKEN_FILE", "relative-token"),
            "r2_account_id_invalid": ("SHORTVIDEO_R2_ACCOUNT_ID", "bad-account"),
            "r2_bucket_invalid": ("SHORTVIDEO_R2_BUCKET", "BAD_BUCKET"),
            "r2_ttl_invalid": ("SHORTVIDEO_R2_TTL", "not-an-integer"),
            "r2_ttl_out_of_range": ("SHORTVIDEO_R2_TTL", "30"),
        }
        for expected, (name, value) in cases.items():
            with self.subTest(reason_code=expected):
                environ = dict(self.env)
                environ[name] = value
                error = self.doctor_error(environ)
                self.assertIn(expected, error.reason_codes)
                self.assertTrue(any(issue["reason_code"] == expected for issue in error.issues))

    def test_missing_unsafe_and_empty_token_files_are_distinct(self):
        missing = dict(self.env)
        missing["SHORTVIDEO_INSTAGRAM_ACCESS_TOKEN_FILE"] = str(self.root / "missing-token")
        self.assertIn("instagram_token_file_missing", self.doctor_error(missing).reason_codes)

        unsafe = dict(self.env)
        self.token.chmod(0o640)
        self.assertIn("instagram_token_file_unsafe", self.doctor_error(unsafe).reason_codes)

        empty = dict(self.env)
        self.token.write_text("", encoding="utf-8")
        self.token.chmod(0o600)
        empty_error = self.doctor_error(empty)
        self.assertIn("instagram_token_file_empty", empty_error.reason_codes)
        self.assertNotIn("instagram_token_file_missing", empty_error.reason_codes)

    def test_realistic_production_placeholders_are_reported_in_one_pass(self):
        environ = {
            "SHORTVIDEO_INSTAGRAM_USER_ID": "REPLACE_WITH_PROFESSIONAL_ACCOUNT_ID",
            "SHORTVIDEO_INSTAGRAM_API_VERSION": "REPLACE_WITH_CURRENT_VXX_0",
            "SHORTVIDEO_INSTAGRAM_ACCESS_TOKEN_FILE": "/home/USER/.local/share/shortvideo/secrets/instagram-token",
            "SHORTVIDEO_R2_ACCOUNT_ID": "REPLACE_WITH_32_HEX_ACCOUNT_ID",
            "SHORTVIDEO_R2_BUCKET": "REPLACE_WITH_BUCKET",
            "SHORTVIDEO_R2_ACCESS_KEY_ID": "REPLACE_WITH_ACCESS_KEY_ID",
            "SHORTVIDEO_R2_SECRET_ACCESS_KEY": "REPLACE_WITH_SECRET_ACCESS_KEY",
        }
        error = self.doctor_error(environ)
        self.assertEqual(
            set(error.reason_codes),
            {
                "instagram_user_id_placeholder",
                "instagram_api_version_placeholder",
                "instagram_token_path_placeholder",
                "instagram_token_file_missing",
                "r2_configuration_incomplete",
            },
        )
        rendered = str(error)
        self.assertIn("SHORTVIDEO_INSTAGRAM_USER_ID", rendered)
        self.assertIn("SHORTVIDEO_INSTAGRAM_API_VERSION", rendered)
        self.assertIn("SHORTVIDEO_R2_ACCOUNT_ID", rendered)
        self.assertIn("not configured safely", rendered)

    def test_factory_preserves_configuration_cause_chain(self):
        environ = dict(self.env)
        environ["SHORTVIDEO_INSTAGRAM_USER_ID"] = "REPLACE_WITH_PROFESSIONAL_ACCOUNT_ID"
        factory = CombinedLiveAdapterFactory(self.state)
        with patch.dict(os.environ, environ, clear=True):
            with self.assertRaises(PermanentPublishError) as raised:
                factory("instagram")
        self.assertEqual(raised.exception.code, "instagram_configuration_invalid")
        self.assertIn("instagram_user_id_placeholder", raised.exception.reason_codes)
        self.assertIsInstance(raised.exception.__cause__, InstagramConfigurationError)
        self.assertEqual(raised.exception.__cause__.reason_code, "instagram_user_id_placeholder")

    def test_cli_guidance_never_contains_token_value(self):
        environ = dict(self.env)
        environ.pop("SHORTVIDEO_R2_SECRET_ACCESS_KEY")
        stderr = StringIO()
        with patch.dict(os.environ, environ, clear=True), redirect_stderr(stderr):
            result = publish.main(["doctor", "instagram", "--state-dir", str(self.state)])
        output = stderr.getvalue()
        self.assertEqual(result, 2)
        self.assertIn("error_code: instagram_configuration_invalid", output)
        self.assertIn("SHORTVIDEO_R2_SECRET_ACCESS_KEY", output)
        self.assertNotIn(self.fake_token, output)


if __name__ == "__main__": unittest.main()
