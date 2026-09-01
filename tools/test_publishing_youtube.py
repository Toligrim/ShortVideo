from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import sha256
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import publish
from publishing.adapters.base import (
    AmbiguousPublishError,
    PermanentPublishError,
    PublishRequest,
    PublishResult,
    ResumableSessionCheckpoint,
    RetryablePublishError,
)
from publishing.adapters.youtube import (
    MIN_CHUNK_SIZE,
    OAUTH_AUTHORIZATION_ENDPOINT,
    OAUTH_TOKEN_ENDPOINT,
    YOUTUBE_RESUMABLE_INITIATION_ENDPOINT,
    YOUTUBE_REQUIRED_SCOPES,
    YOUTUBE_VIDEOS_ENDPOINT,
    HttpResponse,
    YouTubeConfigurationError,
    YouTubeLiveAdapterFactory,
    YouTubeOAuthClient,
    YouTubeOAuthSettings,
    YouTubeProcessingResult,
    YouTubeResumableAdapter,
    build_authorization_request,
)
from publishing.db import PublishingStore
from publishing.metadata import metadata_sha256, write_metadata_snapshot
from publishing.models import ExecutionMode, TargetState
from publishing.worker import PublishWorker, _safe_detail


SESSION_URI = (
    "https://www.googleapis.com/upload/youtube/v3/videos?"
    "uploadType=resumable&upload_id=SESSION_URL_SECRET"
)


def token_response(token: str = "ACCESS_TOKEN", **extra: object) -> HttpResponse:
    payload: dict[str, object] = {"access_token": token}
    payload.update(extra)
    return HttpResponse(200, {"Content-Type": "application/json"}, json.dumps(payload).encode("utf-8"))


def video_response(video_id: str = "yt-video-123", *, privacy_status: str | None = "private") -> HttpResponse:
    payload: dict[str, object] = {"id": video_id}
    if privacy_status is not None:
        payload["status"] = {"privacyStatus": privacy_status}
    return HttpResponse(201, {"Content-Type": "application/json"}, json.dumps(payload).encode("utf-8"))


def processing_response(
    video_id: str = "yt-video-123",
    *,
    processing_status: str = "succeeded",
    privacy_status: str | None = "private",
    duration: str | None = "PT1M",
    failure_reason: str | None = None,
) -> HttpResponse:
    details: dict[str, object] = {"processingStatus": processing_status}
    if failure_reason is not None:
        details["processingFailureReason"] = failure_reason
    item: dict[str, object] = {"id": video_id, "processingDetails": details}
    if privacy_status is not None:
        item["status"] = {"privacyStatus": privacy_status}
    if duration is not None:
        item["contentDetails"] = {"duration": duration}
    return HttpResponse(
        200,
        {"Content-Type": "application/json"},
        json.dumps({"items": [item]}).encode("utf-8"),
    )


class FakeTransport:
    def __init__(self, *outcomes: object):
        self.outcomes = list(outcomes)
        self.calls: list[dict[str, object]] = []

    def request(self, method, url, *, headers, body, timeout):
        call = {
            "method": method,
            "url": url,
            "headers": dict(headers),
            "body": bytes(body),
            "timeout": timeout,
        }
        self.calls.append(call)
        if not self.outcomes:
            raise AssertionError(f"unexpected HTTP request: {method} {url}")
        outcome = self.outcomes.pop(0)
        if callable(outcome):
            outcome = outcome(call)
        if isinstance(outcome, BaseException):
            raise outcome
        assert isinstance(outcome, HttpResponse)
        return outcome


def youtube_metadata() -> dict[str, object]:
    return {
        "schema_version": 1,
        "slug": "hash-tables",
        "targets": {
            "youtube": {
                "title": "Hash tables in 60 seconds",
                "description": "A compact approved description.",
                "tags": ["algorithms", "hash-table"],
                "category_id": "27",
                "privacy_status": "private",
                "made_for_kids": False,
                "contains_synthetic_media": True,
                "notify_subscribers": False,
            },
        },
    }


class YouTubeAdapterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.state_dir = self.root / "state"
        self.secrets_dir = self.root / "secrets"
        self.secrets_dir.mkdir(mode=0o700)
        self.token_file = self.secrets_dir / "youtube-token.json"
        self.token_file.write_text(
            json.dumps({"refresh_token": "REFRESH_TOKEN_SECRET", "scope": YOUTUBE_REQUIRED_SCOPES}),
            encoding="utf-8",
        )
        os.chmod(self.token_file, 0o600)
        self.settings = YouTubeOAuthSettings(
            client_id="youtube-client-id.apps.googleusercontent.com",
            client_secret="CLIENT_SECRET",
            token_file=self.token_file,
            state_dir=self.state_dir,
        )
        self.asset = self.root / "asset.mp4"

    def write_asset(self, size: int = MIN_CHUNK_SIZE) -> Path:
        self.asset.write_bytes(b"x" * size)
        return self.asset

    def request(
        self,
        *,
        checkpoint: ResumableSessionCheckpoint | None = None,
        heartbeat=None,
        cancelled=None,
        order: list[str] | None = None,
        metadata: dict[str, object] | None = None,
        lease_seconds: int | None = None,
    ) -> tuple[PublishRequest, list[object], list[tuple[int, str]]]:
        saved: list[object] = []
        progress: list[tuple[int, str]] = []

        def record(value):
            saved.append(value)
            if order is not None:
                order.append("checkpoint")
            return True

        def record_progress(offset, phase):
            progress.append((offset, phase))
            if order is not None:
                order.append(f"progress:{offset}:{phase}")
            return True

        request = PublishRequest(
            publication_id="publication-1",
            target_id=1,
            platform="youtube",
            asset_path=self.asset,
            asset_sha256=sha256(self.asset.read_bytes()).hexdigest(),
            metadata=metadata if metadata is not None else youtube_metadata(),
            approval_fingerprint="f" * 64,
            idempotency_key="target-publish:publication-1:youtube:g0",
            existing_external_session_id=checkpoint.session_uri if checkpoint is not None else None,
            resumable_checkpoint=checkpoint,
            record_target_processing=record,
            record_target_progress=record_progress,
            heartbeat=heartbeat,
            cancellation_requested=cancelled,
            lease_seconds=lease_seconds,
        )
        return request, saved, progress

    def checkpoint(self, *, offset: int = 0, phase: str = "uploading") -> ResumableSessionCheckpoint:
        return ResumableSessionCheckpoint(
            session_uri=SESSION_URI,
            asset_sha256=sha256(self.asset.read_bytes()).hexdigest(),
            approval_fingerprint="f" * 64,
            total_bytes=self.asset.stat().st_size,
            mime_type="video/mp4",
            offset=offset,
            phase=phase,
        )

    def adapter(self, transport: FakeTransport, **overrides: object) -> YouTubeResumableAdapter:
        overrides.setdefault("chunk_size", MIN_CHUNK_SIZE)
        overrides.setdefault("sleep", lambda _seconds: None)
        return YouTubeResumableAdapter(self.settings, transport=transport, **overrides)

    def test_refresh_and_pkce_bootstrap_store_no_access_token(self):
        refresh_transport = FakeTransport(token_response("ACCESS_TOKEN_SECRET"))
        oauth = YouTubeOAuthClient(self.settings, transport=refresh_transport)
        self.assertEqual(oauth.access_token(), "ACCESS_TOKEN_SECRET")
        refresh_call = refresh_transport.calls[0]
        self.assertEqual(refresh_call["url"], OAUTH_TOKEN_ENDPOINT)
        refresh_fields = parse_qs(bytes(refresh_call["body"]).decode("ascii"))
        self.assertEqual(refresh_fields["grant_type"], ["refresh_token"])
        self.assertEqual(refresh_fields["refresh_token"], ["REFRESH_TOKEN_SECRET"])
        self.assertEqual(refresh_fields["client_secret"], ["CLIENT_SECRET"])

        client_file = self.secrets_dir / "desktop-client.json"
        client_file.write_text(
            json.dumps(
                {
                    "installed": {
                        "client_id": "desktop-client.apps.googleusercontent.com",
                        "client_secret": "DESKTOP_CLIENT_SECRET",
                    }
                }
            ),
            encoding="utf-8",
        )
        os.chmod(client_file, 0o600)
        bootstrap_token_file = self.secrets_dir / "bootstrap-token.json"
        bootstrap_settings = YouTubeOAuthSettings.from_environment(
            state_dir=self.state_dir,
            require_token_file=False,
            environ={
                "SHORTVIDEO_YOUTUBE_CLIENT_SECRETS_FILE": str(client_file),
                "SHORTVIDEO_YOUTUBE_TOKEN_FILE": str(bootstrap_token_file),
            },
        )
        authorization = build_authorization_request(
            bootstrap_settings,
            redirect_uri="http://127.0.0.1:45678/oauth2/callback",
        )
        parsed = urlparse(authorization.url)
        self.assertEqual(f"{parsed.scheme}://{parsed.netloc}{parsed.path}", OAUTH_AUTHORIZATION_ENDPOINT)
        fields = parse_qs(parsed.query)
        self.assertEqual(fields["scope"], [YOUTUBE_REQUIRED_SCOPES])
        self.assertEqual(fields["code_challenge_method"], ["S256"])
        self.assertEqual(fields["state"], [authorization.state])
        self.assertNotIn(authorization.code_verifier, authorization.url)
        self.assertGreaterEqual(len(authorization.code_verifier), 43)

        bootstrap_transport = FakeTransport(
            token_response(
                "BOOTSTRAP_ACCESS_SECRET",
                refresh_token="BOOTSTRAP_REFRESH_SECRET",
                scope=YOUTUBE_REQUIRED_SCOPES,
            )
        )
        YouTubeOAuthClient(bootstrap_settings, transport=bootstrap_transport).exchange_authorization_code(
            code="AUTHORIZATION_CODE_SECRET",
            redirect_uri=authorization.redirect_uri,
            code_verifier=authorization.code_verifier,
        )
        stored = bootstrap_token_file.read_text(encoding="utf-8")
        self.assertIn("BOOTSTRAP_REFRESH_SECRET", stored)
        self.assertNotIn("BOOTSTRAP_ACCESS_SECRET", stored)
        self.assertEqual(stat.S_IMODE(bootstrap_token_file.stat().st_mode) & 0o077, 0)

    def test_initiation_metadata_headers_location_persisted_before_media(self):
        self.write_asset()
        order: list[str] = []

        def note(call):
            order.append(f"{call['method']}:{call['url']}")
            return token_response()

        def noted(response):
            def callback(call):
                order.append(f"{call['method']}:{call['url']}")
                return response

            return callback

        transport = FakeTransport(
            note,
            noted(HttpResponse(200, {"Location": SESSION_URI})),
            noted(video_response("short-id_1")),
            noted(processing_response("short-id_1")),
        )
        request, saved, progress = self.request(order=order)
        result = self.adapter(transport).publish(request)
        self.assertEqual(result.external_media_id, "short-id_1")
        self.assertEqual(result.external_url, "https://www.youtube.com/shorts/short-id_1")
        self.assertEqual(result.external_session_id, SESSION_URI)
        self.assertEqual(len(saved), 1)
        checkpoint = saved[0]
        self.assertEqual(checkpoint.total_bytes, MIN_CHUNK_SIZE)
        self.assertEqual(checkpoint.mime_type, "video/mp4")
        self.assertEqual(checkpoint.offset, 0)
        self.assertEqual(checkpoint.phase, "session_recorded")
        self.assertIn((0, "final_chunk_inflight"), progress)

        initiation = transport.calls[1]
        query = parse_qs(urlparse(str(initiation["url"])).query)
        self.assertEqual(query, {"uploadType": ["resumable"], "part": ["snippet,status"], "notifySubscribers": ["false"]})
        payload = json.loads(bytes(initiation["body"]).decode("utf-8"))
        self.assertEqual(
            payload,
            {
                "snippet": {
                    "title": "Hash tables in 60 seconds",
                    "description": "A compact approved description.",
                    "tags": ["algorithms", "hash-table"],
                    "categoryId": "27",
                },
                "status": {
                    "privacyStatus": "private",
                    "selfDeclaredMadeForKids": False,
                    "containsSyntheticMedia": True,
                },
            },
        )
        headers = initiation["headers"]
        self.assertEqual(headers["Content-Type"], "application/json; charset=UTF-8")
        self.assertEqual(headers["X-Upload-Content-Length"], str(MIN_CHUNK_SIZE))
        self.assertEqual(headers["X-Upload-Content-Type"], "video/mp4")
        first_media = next(index for index, value in enumerate(order) if value.startswith("PUT:"))
        self.assertLess(order.index("checkpoint"), first_media)

    def test_308_progression_and_resume_status_probe(self):
        self.write_asset(MIN_CHUNK_SIZE * 2)
        transport = FakeTransport(
            token_response(),
            HttpResponse(200, {"Location": SESSION_URI}),
            HttpResponse(308, {"Range": f"bytes=0-{MIN_CHUNK_SIZE - 1}"}),
            video_response(),
            processing_response(),
        )
        request, _saved, progress = self.request()
        self.assertEqual(self.adapter(transport).publish(request).external_media_id, "yt-video-123")
        upload_calls = [call for call in transport.calls if call["url"] == SESSION_URI]
        self.assertEqual(
            [call["headers"]["Content-Range"] for call in upload_calls],
            [
                f"bytes 0-{MIN_CHUNK_SIZE - 1}/{MIN_CHUNK_SIZE * 2}",
                f"bytes {MIN_CHUNK_SIZE}-{MIN_CHUNK_SIZE * 2 - 1}/{MIN_CHUNK_SIZE * 2}",
            ],
        )
        self.assertIn((MIN_CHUNK_SIZE, "uploading"), progress)

        resumed_transport = FakeTransport(
            token_response("RESUMED_ACCESS"),
            HttpResponse(308, {"Range": f"bytes=0-{MIN_CHUNK_SIZE - 1}"}),
            video_response("resumed-video"),
            processing_response("resumed-video"),
        )
        checkpoint = self.checkpoint(offset=0, phase="uploading")
        resumed_request, _saved, resumed_progress = self.request(checkpoint=checkpoint)
        resumed = self.adapter(resumed_transport).publish(resumed_request)
        self.assertEqual(resumed.external_url, "https://www.youtube.com/shorts/resumed-video")
        self.assertEqual(resumed_transport.calls[1]["headers"]["Content-Range"], f"bytes */{MIN_CHUNK_SIZE * 2}")
        self.assertEqual(
            resumed_transport.calls[2]["headers"]["Content-Range"],
            f"bytes {MIN_CHUNK_SIZE}-{MIN_CHUNK_SIZE * 2 - 1}/{MIN_CHUNK_SIZE * 2}",
        )
        self.assertFalse(
            any(
                call["method"] == "POST" and str(call["url"]).startswith(YOUTUBE_RESUMABLE_INITIATION_ENDPOINT)
                for call in resumed_transport.calls
            )
        )
        self.assertIn((MIN_CHUNK_SIZE, "resuming"), resumed_progress)

    def test_401_refreshes_once_and_retries_exact_initiation_request(self):
        self.write_asset()
        transport = FakeTransport(
            token_response("FIRST_ACCESS"),
            HttpResponse(401, {}),
            token_response("SECOND_ACCESS"),
            HttpResponse(200, {"Location": SESSION_URI}),
            video_response(),
            processing_response(),
        )
        request, _saved, _progress = self.request()
        self.adapter(transport).publish(request)
        token_calls = [call for call in transport.calls if call["url"] == OAUTH_TOKEN_ENDPOINT]
        initiation_calls = [
            call
            for call in transport.calls
            if call["method"] == "POST" and str(call["url"]).startswith(YOUTUBE_RESUMABLE_INITIATION_ENDPOINT)
        ]
        self.assertEqual(len(token_calls), 2)
        self.assertEqual(len(initiation_calls), 2)
        self.assertEqual(initiation_calls[0]["body"], initiation_calls[1]["body"])
        self.assertEqual(initiation_calls[0]["headers"]["Authorization"], "Bearer FIRST_ACCESS")
        self.assertEqual(initiation_calls[1]["headers"]["Authorization"], "Bearer SECOND_ACCESS")

    def test_308_retry_after_checkpoints_progress_before_worker_retry(self):
        self.write_asset(MIN_CHUNK_SIZE * 2)
        transport = FakeTransport(
            token_response(),
            HttpResponse(200, {"Location": SESSION_URI}),
            HttpResponse(308, {"Range": f"bytes=0-{MIN_CHUNK_SIZE - 1}", "Retry-After": "5"}),
        )
        request, _saved, progress = self.request()
        with self.assertRaises(RetryablePublishError) as delayed:
            self.adapter(transport).publish(request)
        self.assertEqual(delayed.exception.code, "youtube_retry_after")
        self.assertEqual(delayed.exception.retry_after_seconds, 5)
        self.assertIn((MIN_CHUNK_SIZE, "uploading"), progress)
        self.assertEqual(len([call for call in transport.calls if call["url"] == SESSION_URI]), 1)

    def test_rate_limit_and_server_failure_retry_the_same_session_after_probe(self):
        self.write_asset()
        first_transport = FakeTransport(
            token_response(),
            HttpResponse(200, {"Location": SESSION_URI}),
            HttpResponse(500, {"Retry-After": "11"}),
        )
        request, saved, _progress = self.request()
        with self.assertRaises(RetryablePublishError) as captured:
            self.adapter(first_transport).publish(request)
        self.assertEqual(captured.exception.retry_after_seconds, 11)
        self.assertEqual(captured.exception.external_session_id, SESSION_URI)
        self.assertNotIn(SESSION_URI, str(captured.exception))
        checkpoint = saved[0]

        resumed_transport = FakeTransport(
            token_response(),
            HttpResponse(308, {}),
            video_response("after-500"),
            processing_response("after-500"),
        )
        resumed_request, _saved, _progress = self.request(checkpoint=checkpoint)
        self.assertEqual(self.adapter(resumed_transport).publish(resumed_request).external_media_id, "after-500")
        self.assertFalse(
            any(
                call["method"] == "POST" and str(call["url"]).startswith(YOUTUBE_RESUMABLE_INITIATION_ENDPOINT)
                for call in resumed_transport.calls
            )
        )

        rate_transport = FakeTransport(
            token_response(),
            HttpResponse(200, {"Location": SESSION_URI}),
            HttpResponse(429, {"Retry-After": "7"}),
        )
        with self.assertRaises(RetryablePublishError) as rate_limited:
            self.adapter(rate_transport).publish(self.request()[0])
        self.assertEqual(rate_limited.exception.retry_after_seconds, 7)
        self.assertEqual(rate_limited.exception.external_session_id, SESSION_URI)

    def test_permanent_4xx_and_malformed_final_are_not_blindly_retried(self):
        self.write_asset()
        rejected = FakeTransport(
            token_response(),
            HttpResponse(200, {"Location": SESSION_URI}),
            HttpResponse(400, {}),
        )
        with self.assertRaises(PermanentPublishError) as permanent:
            self.adapter(rejected).publish(self.request()[0])
        self.assertEqual(permanent.exception.code, "youtube_upload_rejected")
        self.assertNotIn(SESSION_URI, str(permanent.exception))

        timeout = FakeTransport(
            token_response(),
            HttpResponse(200, {"Location": SESSION_URI}),
            TimeoutError("network timeout after " + SESSION_URI),
            video_response("confirmed-after-timeout"),
            processing_response("confirmed-after-timeout"),
        )
        confirmed = self.adapter(timeout).publish(self.request()[0])
        self.assertEqual(confirmed.external_media_id, "confirmed-after-timeout")
        self.assertEqual(timeout.calls[2]["headers"]["Content-Length"], str(MIN_CHUNK_SIZE))
        self.assertEqual(timeout.calls[3]["headers"]["Content-Length"], str(0))
        diagnostics = getattr(confirmed, "transport_diagnostics")
        self.assertEqual(diagnostics[0]["exception_class"], "TimeoutError")
        self.assertEqual(diagnostics[0]["stage"], "final_chunk_upload")
        self.assertNotIn(SESSION_URI, json.dumps(diagnostics))

        malformed = FakeTransport(
            token_response(),
            HttpResponse(200, {"Location": SESSION_URI}),
            HttpResponse(201, {}, b"{}"),
        )
        with self.assertRaises(AmbiguousPublishError) as invalid_response:
            self.adapter(malformed).publish(self.request()[0])
        self.assertEqual(invalid_response.exception.code, "youtube_malformed_success_response")

    def test_final_oserror_probe_308_resumes_only_missing_tail(self):
        self.write_asset(MIN_CHUNK_SIZE * 2)
        transport = FakeTransport(
            token_response(),
            HttpResponse(200, {"Location": SESSION_URI}),
            HttpResponse(308, {"Range": f"bytes=0-{MIN_CHUNK_SIZE - 1}"}),
            ConnectionResetError("connection reset"),
            HttpResponse(308, {"Range": f"bytes=0-{MIN_CHUNK_SIZE - 1}"}),
            video_response("resumed-after-unknown"),
            processing_response("resumed-after-unknown"),
        )
        request, _saved, progress = self.request()
        result = self.adapter(transport).publish(request)
        self.assertEqual(result.external_media_id, "resumed-after-unknown")
        session_calls = [call for call in transport.calls if call["url"] == SESSION_URI]
        self.assertEqual(session_calls[0]["headers"]["Content-Range"], "bytes 0-262143/524288")
        self.assertEqual(session_calls[1]["headers"]["Content-Range"], "bytes 262144-524287/524288")
        self.assertEqual(session_calls[2]["headers"]["Content-Range"], "bytes */524288")
        self.assertEqual(session_calls[3]["headers"]["Content-Range"], "bytes 262144-524287/524288")
        self.assertEqual(session_calls[3]["body"], b"x" * MIN_CHUNK_SIZE)
        self.assertIn((MIN_CHUNK_SIZE, "resuming"), progress)

    def test_final_oserror_probe_transport_retry_then_completed(self):
        self.write_asset()
        transport = FakeTransport(
            token_response(),
            HttpResponse(200, {"Location": SESSION_URI}),
            TimeoutError("final transport failure"),
            OSError("probe reset"),
            video_response("probe-retried"),
            processing_response("probe-retried"),
        )
        result = self.adapter(transport).publish(self.request()[0])
        self.assertEqual(result.external_media_id, "probe-retried")
        probes = [call for call in transport.calls if call["url"] == SESSION_URI]
        self.assertEqual(len(probes), 3)
        self.assertEqual([call["headers"]["Content-Range"] for call in probes], [
            "bytes 0-262143/262144",
            "bytes */262144",
            "bytes */262144",
        ])
        diagnostics = getattr(result, "transport_diagnostics")
        self.assertEqual([item["exception_class"] for item in diagnostics], ["TimeoutError", "OSError"])
        self.assertEqual([item["attempt"] for item in diagnostics], [1, 1])

    def test_final_oserror_probe_5xx_honors_retry_after(self):
        self.write_asset()
        delays: list[float] = []
        transport = FakeTransport(
            token_response(),
            HttpResponse(200, {"Location": SESSION_URI}),
            ConnectionResetError("final reset"),
            HttpResponse(503, {"Retry-After": "7"}),
            video_response("probe-5xx-retried"),
            processing_response("probe-5xx-retried"),
        )
        result = self.adapter(transport, sleep=delays.append).publish(self.request()[0])
        self.assertEqual(result.external_media_id, "probe-5xx-retried")
        self.assertEqual(delays, [7.0])
        diagnostics = getattr(result, "transport_diagnostics")
        self.assertEqual(diagnostics[1]["http_status"], 503)
        self.assertEqual(diagnostics[1]["stage"], "resumable_status_probe")

    def test_final_oserror_probe_expired_session_requires_reconciliation(self):
        self.write_asset()
        transport = FakeTransport(
            token_response(),
            HttpResponse(200, {"Location": SESSION_URI}),
            ConnectionResetError("final reset"),
            HttpResponse(404, {}),
        )
        with self.assertRaises(AmbiguousPublishError) as expired:
            self.adapter(transport).publish(self.request()[0])
        self.assertEqual(expired.exception.code, "youtube_final_chunk_session_expired")
        self.assertEqual(len([call for call in transport.calls if call["url"] == SESSION_URI]), 2)

    def test_upload_complete_processing_is_returned_for_a_later_worker_poll(self):
        self.write_asset()
        transport = FakeTransport(
            token_response(),
            HttpResponse(200, {"Location": SESSION_URI}),
            video_response("still-processing"),
            processing_response("still-processing", processing_status="processing"),
        )
        result = self.adapter(transport, processing_poll_interval_seconds=4).publish(self.request()[0])
        self.assertIsInstance(result, YouTubeProcessingResult)
        self.assertEqual(result.processing_status, "processing")
        self.assertEqual(result.external_media_id, "still-processing")
        self.assertEqual(result.next_poll_after_seconds, 4)
        self.assertEqual(
            [call["method"] for call in transport.calls if call["url"] == SESSION_URI],
            ["PUT"],
        )
        processing_calls = [call for call in transport.calls if str(call["url"]).startswith(YOUTUBE_VIDEOS_ENDPOINT)]
        self.assertEqual(len(processing_calls), 1)
        self.assertEqual(parse_qs(urlparse(str(processing_calls[0]["url"])).query)["id"], ["still-processing"])

    def test_processing_failed_preserves_video_reference_and_reason(self):
        self.write_asset()
        transport = FakeTransport(
            token_response(),
            HttpResponse(200, {"Location": SESSION_URI}),
            video_response("processing-failed"),
            processing_response(
                "processing-failed",
                processing_status="failed",
                failure_reason="processingFailed",
            ),
        )
        with self.assertRaises(PermanentPublishError) as failed:
            self.adapter(transport).publish(self.request()[0])
        self.assertEqual(failed.exception.code, "youtube_processing_failed")
        self.assertEqual(failed.exception.external_media_id, "processing-failed")
        self.assertIn("processingFailed", str(failed.exception))
        event = getattr(failed.exception, "youtube_processing_event")
        self.assertEqual(event["event_type"], "youtube_processing_failed")

    def test_processing_failure_after_final_checkpoint_keeps_processing_error(self):
        self.write_asset()
        transport = FakeTransport(
            token_response(),
            video_response("processing-failed-after-resume"),
            processing_response(
                "processing-failed-after-resume",
                processing_status="failed",
                failure_reason="processingFailed",
            ),
        )
        request, _saved, _progress = self.request(checkpoint=self.checkpoint(phase="final_chunk_inflight"))
        with self.assertRaises(PermanentPublishError) as failed:
            self.adapter(transport).publish(request)
        self.assertEqual(failed.exception.code, "youtube_processing_failed")
        self.assertEqual(failed.exception.external_media_id, "processing-failed-after-resume")
        self.assertEqual(
            getattr(failed.exception, "youtube_processing_event")["event_type"],
            "youtube_processing_failed",
        )

    def test_processing_success_zero_duration_is_an_invariant_violation(self):
        self.write_asset()
        transport = FakeTransport(
            token_response(),
            HttpResponse(200, {"Location": SESSION_URI}),
            video_response("zero-duration"),
            processing_response("zero-duration", duration="PT0S"),
        )
        with self.assertRaises(AmbiguousPublishError) as invalid:
            self.adapter(transport).publish(self.request()[0])
        self.assertEqual(invalid.exception.code, "youtube_processing_invariant_violation")
        self.assertEqual(invalid.exception.external_media_id, "zero-duration")

    def test_processing_success_without_privacy_confirmation_is_ambiguous(self):
        self.write_asset()
        transport = FakeTransport(
            token_response(),
            HttpResponse(200, {"Location": SESSION_URI}),
            video_response("missing-processing-privacy"),
            processing_response("missing-processing-privacy", privacy_status=None),
        )
        with self.assertRaises(AmbiguousPublishError) as invalid:
            self.adapter(transport).publish(self.request()[0])
        self.assertEqual(invalid.exception.code, "youtube_privacy_status_mismatch")
        self.assertEqual(invalid.exception.external_media_id, "missing-processing-privacy")

    def test_processing_stuck_beyond_sla_is_actionable(self):
        self.write_asset()
        transport = FakeTransport(
            token_response(),
            HttpResponse(200, {"Location": SESSION_URI}),
            video_response("stuck-video"),
            processing_response("stuck-video", processing_status="processing"),
        )
        request, _saved, _progress = self.request()
        object.__setattr__(request, "_youtube_now", "2099-01-01T00:01:01Z")
        object.__setattr__(request, "_youtube_processing_started_at", "2099-01-01T00:00:00Z")
        with self.assertRaises(AmbiguousPublishError) as stuck:
            self.adapter(
                transport,
                processing_sla_seconds=60,
                processing_poll_interval_seconds=1,
            ).publish(request)
        self.assertEqual(stuck.exception.code, "youtube_processing_stuck")
        self.assertEqual(stuck.exception.external_media_id, "stuck-video")
        self.assertEqual(getattr(stuck.exception, "youtube_processing_event")["processing_age_seconds"], 61)

    def test_lost_location_range_edges_and_404_after_uncertain_final_are_ambiguous(self):
        self.write_asset()
        no_location = FakeTransport(token_response(), HttpResponse(200, {}))
        with self.assertRaises(AmbiguousPublishError) as missing_location:
            self.adapter(no_location).publish(self.request()[0])
        self.assertEqual(missing_location.exception.code, "youtube_initiation_ambiguous")

        malformed_range = FakeTransport(token_response(), HttpResponse(308, {"Range": "not-a-range"}))
        with self.assertRaises(AmbiguousPublishError) as bad_range:
            self.adapter(malformed_range).publish(self.request(checkpoint=self.checkpoint())[0])
        self.assertEqual(bad_range.exception.code, "youtube_invalid_resume_range")

        absent_range = FakeTransport(
            token_response(),
            HttpResponse(308, {}),
            video_response("range-absent"),
            processing_response("range-absent"),
        )
        result = self.adapter(absent_range).publish(self.request(checkpoint=self.checkpoint())[0])
        self.assertEqual(result.external_media_id, "range-absent")
        self.assertEqual(absent_range.calls[2]["headers"]["Content-Range"], f"bytes 0-{MIN_CHUNK_SIZE - 1}/{MIN_CHUNK_SIZE}")

        uncertain_final = FakeTransport(token_response(), HttpResponse(404, {}))
        with self.assertRaises(AmbiguousPublishError) as missing_after_final:
            self.adapter(uncertain_final).publish(
                self.request(checkpoint=self.checkpoint(phase="final_chunk_inflight"))[0]
            )
        self.assertEqual(missing_after_final.exception.code, "youtube_final_chunk_session_expired")

        rejected_final_probe = FakeTransport(token_response(), HttpResponse(403, {}))
        with self.assertRaises(AmbiguousPublishError) as rejected_after_final:
            self.adapter(rejected_final_probe).publish(
                self.request(checkpoint=self.checkpoint(phase="final_chunk_inflight"))[0]
            )
        self.assertEqual(rejected_after_final.exception.code, "youtube_final_chunk_outcome_unknown")

        oauth_rejected_final_probe = FakeTransport(HttpResponse(400, {}))
        with self.assertRaises(AmbiguousPublishError) as oauth_rejected_after_final:
            self.adapter(oauth_rejected_final_probe).publish(
                self.request(checkpoint=self.checkpoint(phase="final_chunk_inflight"))[0]
            )
        self.assertEqual(oauth_rejected_after_final.exception.code, "youtube_final_chunk_outcome_unknown")

        expired = FakeTransport(token_response(), HttpResponse(404, {}))
        with self.assertRaises(PermanentPublishError) as missing_nonfinal:
            self.adapter(expired).publish(self.request(checkpoint=self.checkpoint(phase="uploading"))[0])
        self.assertEqual(missing_nonfinal.exception.code, "youtube_session_not_found")

    def test_final_308_without_video_response_keeps_ambiguous_final_checkpoint(self):
        self.write_asset()
        transport = FakeTransport(
            token_response(),
            HttpResponse(200, {"Location": SESSION_URI}),
            HttpResponse(308, {"Range": f"bytes=0-{MIN_CHUNK_SIZE - 1}"}),
        )
        request, _saved, progress = self.request()
        with self.assertRaises(AmbiguousPublishError) as unknown_completion:
            self.adapter(transport).publish(request)
        self.assertEqual(unknown_completion.exception.code, "youtube_completion_unknown")
        self.assertIn((MIN_CHUNK_SIZE, "final_chunk_inflight"), progress)

    def test_lease_heartbeat_and_cancellation_block_media_bytes(self):
        self.write_asset()
        beats = iter((True, True, True, False))
        lost_lease = FakeTransport(token_response(), HttpResponse(200, {"Location": SESSION_URI}))
        request, saved, _progress = self.request(heartbeat=lambda: next(beats))
        with self.assertRaises(AmbiguousPublishError) as lost:
            self.adapter(lost_lease).publish(request)
        self.assertEqual(lost.exception.code, "youtube_lease_lost")
        self.assertEqual(len(saved), 1)
        self.assertFalse(any(call["url"] == SESSION_URI for call in lost_lease.calls))

        cancelled = FakeTransport()
        with self.assertRaises(PermanentPublishError) as cancelled_error:
            self.adapter(cancelled).publish(self.request(cancelled=lambda: True)[0])
        self.assertEqual(cancelled_error.exception.code, "publish_cancelled")
        self.assertEqual(cancelled.calls, [])

    def test_oauth_refresh_is_refenced_before_each_provider_request(self):
        self.write_asset()
        initial_token_expired = FakeTransport(token_response(), HttpResponse(200, {"Location": SESSION_URI}))
        initial_beats = iter((True, False))
        with self.assertRaises(AmbiguousPublishError) as initial_lost:
            self.adapter(initial_token_expired).publish(self.request(heartbeat=lambda: next(initial_beats))[0])
        self.assertEqual(initial_lost.exception.code, "youtube_lease_lost")
        self.assertEqual(len(initial_token_expired.calls), 1)
        self.assertEqual(initial_token_expired.calls[0]["url"], OAUTH_TOKEN_ENDPOINT)

        refreshed_transport = FakeTransport(
            token_response("FIRST_ACCESS"),
            HttpResponse(401, {}),
            token_response("SECOND_ACCESS"),
        )
        refresh_beats = iter((True, True, True, False))
        with self.assertRaises(AmbiguousPublishError) as refresh_lost:
            self.adapter(refreshed_transport).publish(
                self.request(heartbeat=lambda: next(refresh_beats))[0]
            )
        self.assertEqual(refresh_lost.exception.code, "youtube_lease_lost")
        self.assertEqual(len(refreshed_transport.calls), 3)
        self.assertEqual(refreshed_transport.calls[-1]["url"], OAUTH_TOKEN_ENDPOINT)

    def test_production_like_blocking_request_keeps_lease_renewing_until_it_returns(self):
        self.write_asset()

        class BlockingTransport:
            requires_lease_watchdog = True

            def __init__(self):
                self.calls: list[dict[str, object]] = []
                self.provider_started = threading.Event()
                self.release_provider = threading.Event()

            def request(self, method, url, *, headers, body, timeout):
                self.calls.append({"method": method, "url": url, "headers": dict(headers), "body": bytes(body)})
                if url == OAUTH_TOKEN_ENDPOINT:
                    return token_response()
                self.provider_started.set()
                self.release_provider.wait(timeout=4)
                return HttpResponse(400, {})

        transport = BlockingTransport()
        heartbeat_count = 0
        recurring_renewal = threading.Event()

        def heartbeat():
            nonlocal heartbeat_count
            heartbeat_count += 1
            if heartbeat_count >= 4:
                recurring_renewal.set()
            return True

        request, _saved, _progress = self.request(heartbeat=heartbeat, lease_seconds=6)
        adapter = YouTubeResumableAdapter(
            self.settings,
            transport=transport,
            chunk_size=MIN_CHUNK_SIZE,
            timeout_seconds=0.01,
        )
        outcome: list[BaseException] = []

        def run_publish():
            try:
                adapter.publish(request)
            except BaseException as exc:
                outcome.append(exc)

        thread = threading.Thread(target=run_publish)
        thread.start()
        self.assertTrue(transport.provider_started.wait(timeout=1))
        self.assertTrue(recurring_renewal.wait(timeout=3))
        transport.release_provider.set()
        thread.join(timeout=3)
        self.assertFalse(thread.is_alive())
        self.assertIsInstance(outcome[0], PermanentPublishError)
        self.assertGreaterEqual(heartbeat_count, 4)

    def test_short_lease_and_unsafe_session_uri_are_rejected_before_media(self):
        self.write_asset()
        too_short = FakeTransport()
        with self.assertRaises(PermanentPublishError) as short_lease:
            self.adapter(too_short).publish(self.request(lease_seconds=65)[0])
        self.assertEqual(short_lease.exception.code, "youtube_lease_too_short")
        self.assertEqual(too_short.calls, [])
        final_checkpoint = self.checkpoint(phase="final_chunk_inflight")
        final_request, _saved, _progress = self.request(
            checkpoint=final_checkpoint,
            lease_seconds=65,
        )
        with self.assertRaises(AmbiguousPublishError) as final_short_lease:
            self.adapter(FakeTransport()).publish(final_request)
        self.assertEqual(final_short_lease.exception.code, "youtube_final_chunk_outcome_unknown")
        self.assertFalse(
            YouTubeResumableAdapter._valid_session_uri(
                "https://www.googleapis.com:444/upload/youtube/v3/videos?upload_id=x"
            )
        )
        self.assertFalse(
            YouTubeResumableAdapter._valid_session_uri(
                "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=x#fragment"
            )
        )

    def test_forced_or_missing_privacy_confirmation_requires_reconciliation(self):
        self.write_asset()
        metadata = youtube_metadata()
        metadata["targets"]["youtube"]["privacy_status"] = "public"  # type: ignore[index]
        forced_private = FakeTransport(
            token_response(),
            HttpResponse(200, {"Location": SESSION_URI}),
            video_response("forced-private", privacy_status="private"),
        )
        request, saved, _progress = self.request(metadata=metadata)
        with self.assertRaises(AmbiguousPublishError) as forced:
            self.adapter(forced_private).publish(request)
        self.assertEqual(forced.exception.code, "youtube_privacy_status_mismatch")
        self.assertEqual(forced.exception.external_media_id, "forced-private")
        self.assertEqual(forced.exception.external_url, "https://www.youtube.com/shorts/forced-private")
        self.assertEqual(len(saved), 1)

        missing = FakeTransport(
            token_response(),
            HttpResponse(200, {"Location": SESSION_URI}),
            video_response("missing-status", privacy_status=None),
        )
        with self.assertRaises(AmbiguousPublishError) as absent:
            self.adapter(missing).publish(self.request(metadata=metadata)[0])
        self.assertEqual(absent.exception.code, "youtube_privacy_status_mismatch")

    def test_configuration_rejects_secret_file_in_state_dir_or_unsafe_permissions(self):
        unsafe = self.root / "unsafe-client.json"
        unsafe.write_text(json.dumps({"installed": {"client_id": "x"}}), encoding="utf-8")
        os.chmod(unsafe, 0o644)
        with self.assertRaises(YouTubeConfigurationError):
            YouTubeOAuthSettings.from_environment(
                state_dir=self.state_dir,
                require_token_file=False,
                environ={
                    "SHORTVIDEO_YOUTUBE_CLIENT_SECRETS_FILE": str(unsafe),
                    "SHORTVIDEO_YOUTUBE_TOKEN_FILE": str(self.secrets_dir / "new-token.json"),
                },
            )

    def test_token_parent_is_private_and_symlink_chains_are_rejected(self):
        os.chmod(self.secrets_dir, 0o755)
        YouTubeOAuthSettings.from_environment(
            state_dir=self.state_dir,
            environ={
                "SHORTVIDEO_YOUTUBE_CLIENT_ID": "client-id",
                "SHORTVIDEO_YOUTUBE_TOKEN_FILE": str(self.token_file),
            },
        )
        self.assertEqual(stat.S_IMODE(self.secrets_dir.stat().st_mode), 0o700)

        real_parent = self.root / "real-token-parent"
        real_parent.mkdir(mode=0o700)
        symlink_parent = self.root / "token-parent-link"
        os.symlink(real_parent, symlink_parent)
        with self.assertRaises(YouTubeConfigurationError):
            YouTubeOAuthSettings.from_environment(
                state_dir=self.state_dir,
                require_token_file=False,
                environ={
                    "SHORTVIDEO_YOUTUBE_CLIENT_ID": "client-id",
                    "SHORTVIDEO_YOUTUBE_TOKEN_FILE": str(symlink_parent / "token.json"),
                },
            )

    def test_token_scope_must_be_exactly_upload_and_readonly(self):
        self.token_file.write_text(
            json.dumps({"refresh_token": "REFRESH_TOKEN_SECRET", "scope": f"{YOUTUBE_REQUIRED_SCOPES} openid"}),
            encoding="utf-8",
        )
        os.chmod(self.token_file, 0o600)
        with self.assertRaises(YouTubeConfigurationError):
            YouTubeOAuthSettings.from_environment(
                state_dir=self.state_dir,
                environ={
                    "SHORTVIDEO_YOUTUBE_CLIENT_ID": "client-id",
                    "SHORTVIDEO_YOUTUBE_TOKEN_FILE": str(self.token_file),
                },
            )
        self.token_file.write_text(
            json.dumps(
                {
                    "refresh_token": "REFRESH_TOKEN_SECRET",
                    "scope": "https://www.googleapis.com/auth/youtube.upload",
                }
            ),
            encoding="utf-8",
        )
        with self.assertRaises(YouTubeConfigurationError):
            YouTubeOAuthSettings.from_environment(
                state_dir=self.state_dir,
                environ={
                    "SHORTVIDEO_YOUTUBE_CLIENT_ID": "client-id",
                    "SHORTVIDEO_YOUTUBE_TOKEN_FILE": str(self.token_file),
                },
            )
        state_secret = self.state_dir / "bad-token.json"
        with self.assertRaises(YouTubeConfigurationError):
            YouTubeOAuthSettings.from_environment(
                state_dir=self.state_dir,
                require_token_file=False,
                environ={
                    "SHORTVIDEO_YOUTUBE_CLIENT_ID": "client-id",
                    "SHORTVIDEO_YOUTUBE_TOKEN_FILE": str(state_secret),
                },
            )

    def test_doctor_is_local_and_never_prints_token(self):
        environment = {
            "SHORTVIDEO_YOUTUBE_CLIENT_ID": "youtube-client-id.apps.googleusercontent.com",
            "SHORTVIDEO_YOUTUBE_CLIENT_SECRET": "CLIENT_SECRET",
            "SHORTVIDEO_YOUTUBE_TOKEN_FILE": str(self.token_file),
        }
        with patch.dict(os.environ, environment, clear=False), patch("sys.stdout", io.StringIO()) as stdout:
            self.assertEqual(
                publish.main(["doctor", "youtube", "--state-dir", str(self.state_dir)]),
                0,
            )
        output = stdout.getvalue()
        self.assertIn('"provider":"youtube"', output)
        self.assertNotIn("REFRESH_TOKEN_SECRET", output)
        self.assertNotIn("CLIENT_SECRET", output)

    def test_operator_diagnostics_redact_oauth_and_upload_capability_values(self):
        detail = _safe_detail(
            RuntimeError(
                "access_token=ACCESS_TOKEN_SECRET client_secret: CLIENT_SECRET "
                "upload_id=SESSION_URL_SECRET Bearer ACCESS_TOKEN_SECRET"
            )
        )
        for secret in ("ACCESS_TOKEN_SECRET", "CLIENT_SECRET", "SESSION_URL_SECRET"):
            self.assertNotIn(secret, detail)
        status_detail = publish._safe_status_error_detail(
            "refresh_token=REFRESH_TOKEN_SECRET code_verifier: VERIFIER_SECRET",
            None,
        )
        self.assertNotIn("REFRESH_TOKEN_SECRET", status_detail)
        self.assertNotIn("VERIFIER_SECRET", status_detail)


class Clock:
    def __init__(self, value: str = "2099-01-01T00:00:00.000000Z"):
        self.value = datetime.fromisoformat(value.replace("Z", "+00:00"))

    def __call__(self) -> str:
        return self.value.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")

    def advance(self, seconds: int) -> None:
        self.value += timedelta(seconds=seconds)


class ResumeFactory:
    def __init__(self, result: PublishResult | BaseException):
        self.result = result
        self.requests: list[PublishRequest] = []

    def supports_resumable_session(self, platform: str) -> bool:
        return platform == "youtube"

    def __call__(self, _platform: str):
        factory = self

        class Adapter:
            def publish(self, request):
                factory.requests.append(request)
                if isinstance(factory.result, BaseException):
                    raise factory.result
                return factory.result

        return Adapter()


class ProcessingFactory:
    def __init__(self, clock: "Clock", outcomes: list[object]):
        self.clock = clock
        self.outcomes = list(outcomes)
        self.requests: list[PublishRequest] = []

    def supports_resumable_session(self, platform: str) -> bool:
        return platform == "youtube"

    def __call__(self, _platform: str):
        factory = self

        class Adapter:
            def publish(self, request):
                factory.requests.append(request)
                if request.resumable_checkpoint is None:
                    checkpoint = ResumableSessionCheckpoint(
                        session_uri=SESSION_URI,
                        asset_sha256=request.asset_sha256,
                        approval_fingerprint=request.approval_fingerprint,
                        total_bytes=request.asset_path.stat().st_size,
                        mime_type="video/mp4",
                        offset=0,
                        phase="session_recorded",
                    )
                    assert request.record_target_processing is not None
                    assert request.record_target_processing(checkpoint)
                if not factory.outcomes:
                    raise AssertionError("unexpected processing poll")
                outcome = factory.outcomes.pop(0)
                if callable(outcome):
                    outcome = outcome(request)
                if isinstance(outcome, BaseException):
                    raise outcome
                return outcome

        return Adapter()


class WorkerYouTubeIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.store = PublishingStore(self.root / "publisher.sqlite3")
        self.asset = self.root / "asset.mp4"
        self.asset.write_bytes(b"immutable video bytes")
        self.snapshot = write_metadata_snapshot(youtube_metadata(), self.root / "metadata")
        self.clock = Clock()
        self.update_id = 1

    def create_publication(self, platforms: tuple[str, ...] = ("youtube",)):
        return self.store.create_publication(
            publication_id="publication-1",
            slug="hash-tables",
            source_path=str(self.root / "source.mp4"),
            source_sha256="a" * 64,
            asset_path=str(self.asset),
            asset_sha256=sha256(self.asset.read_bytes()).hexdigest(),
            metadata_path=str(self.snapshot.path),
            metadata_sha256=metadata_sha256(youtube_metadata()),
            target_platforms=platforms,
            execution_mode=ExecutionMode.LIVE,
        )

    def approve(self, publication):
        action = self.store.issue_telegram_action(publication.id, "approve")
        self.store.apply_telegram_action(
            update_id=self.update_id,
            action_token=action.token,
            actor_user_id="operator",
        )
        self.update_id += 1

    def target(self, publication, platform: str):
        return next(value for value in self.store.list_targets(publication.id) if value.platform == platform)

    def worker(self, factory, **overrides):
        params = {
            "store": self.store,
            "worker_id": "youtube-worker",
            "adapter_factory": factory,
            "clock": self.clock,
            "lease_seconds": 30,
        }
        params.update(overrides)
        return PublishWorker(**params)

    def test_processing_is_polled_across_worker_runs_and_never_reuploads(self):
        publication = self.create_publication()
        self.approve(publication)
        started = self.clock()
        pending = YouTubeProcessingResult(
            "processing-video",
            "https://www.youtube.com/shorts/processing-video",
            SESSION_URI,
            processing_started_at=started,
            processing_age_seconds=0,
            next_poll_after_seconds=1,
        )
        factory = ProcessingFactory(
            self.clock,
            [
                pending,
                YouTubeProcessingResult(
                    "processing-video",
                    "https://www.youtube.com/shorts/processing-video",
                    SESSION_URI,
                    processing_started_at=started,
                    processing_age_seconds=1,
                    next_poll_after_seconds=1,
                ),
                PublishResult(
                    "processing-video",
                    "https://www.youtube.com/shorts/processing-video",
                    SESSION_URI,
                ),
            ],
        )
        worker = self.worker(factory)

        self.assertEqual(worker.run_once().outcome, "processing")
        self.assertEqual(self.target(publication, "youtube").state, TargetState.PROCESSING)
        self.assertEqual(self.target(publication, "youtube").external_media_id, "processing-video")

        self.clock.advance(1)
        self.assertEqual(worker.run_once().outcome, "processing")
        self.assertTrue(hasattr(factory.requests[1], "_youtube_existing_external_media_id"))
        self.assertEqual(factory.requests[1]._youtube_existing_external_media_id, "processing-video")

        self.clock.advance(1)
        self.assertEqual(worker.run_once().outcome, "published")
        self.assertEqual(self.target(publication, "youtube").state, TargetState.PUBLISHED)
        self.assertEqual(len(factory.requests), 3)
        self.assertIsNone(worker.run_once())

    def test_processing_failed_is_terminal_but_keeps_video_id(self):
        publication = self.create_publication()
        self.approve(publication)
        failed_error = PermanentPublishError(
            "youtube_processing_failed",
            "YouTube video processing failed (processingFailed)",
            external_session_id=SESSION_URI,
            external_media_id="failed-video",
            external_url="https://www.youtube.com/shorts/failed-video",
        )
        failed_error.youtube_processing_event = {
            "event_type": "youtube_processing_failed",
            "video_id": "failed-video",
            "processing_started_at": self.clock(),
            "processing_age_seconds": 0,
            "reason": "processingFailed",
        }
        factory = ProcessingFactory(
            self.clock,
            [failed_error],
        )
        result = self.worker(factory).run_once()
        self.assertEqual(result.outcome, "permanent_failure")
        target = self.target(publication, "youtube")
        self.assertEqual(target.state, TargetState.FAILED)
        self.assertEqual(target.external_media_id, "failed-video")
        self.assertEqual(target.last_error_code, "youtube_processing_failed")
        self.assertTrue(any(event["event_type"] == "youtube_processing_failed" for event in self.store.list_events(publication.id)))

    def test_processing_stuck_requires_reconciliation_without_duplicate_upload(self):
        publication = self.create_publication()
        self.approve(publication)
        started = self.clock()
        pending = YouTubeProcessingResult(
            "stuck-video",
            "https://www.youtube.com/shorts/stuck-video",
            SESSION_URI,
            processing_started_at=started,
            processing_age_seconds=0,
            next_poll_after_seconds=1,
        )
        stuck = AmbiguousPublishError(
            "youtube_processing_stuck",
            "YouTube video processing exceeded the 60 second SLA",
            external_session_id=SESSION_URI,
            external_media_id="stuck-video",
            external_url="https://www.youtube.com/shorts/stuck-video",
        )
        stuck.youtube_processing_event = {
            "event_type": "youtube_processing_stuck",
            "video_id": "stuck-video",
            "processing_started_at": started,
            "processing_age_seconds": 61,
        }
        factory = ProcessingFactory(self.clock, [pending, stuck])
        worker = self.worker(factory)
        self.assertEqual(worker.run_once().outcome, "processing")
        self.clock.advance(61)
        self.assertEqual(worker.run_once().outcome, "reconciliation_required")
        target = self.target(publication, "youtube")
        self.assertEqual(target.state, TargetState.RECONCILIATION_REQUIRED)
        self.assertEqual(target.external_media_id, "stuck-video")
        self.assertEqual(len(factory.requests), 2)
        self.assertEqual(factory.requests[1]._youtube_existing_external_media_id, "stuck-video")
        stuck_events = [
            event for event in self.store.list_events(publication.id)
            if event["event_type"] == "youtube_processing_stuck"
        ]
        self.assertEqual(len(stuck_events), 1)
        self.assertEqual(stuck_events[0]["data"]["video_id"], "stuck-video")
        self.assertEqual(stuck_events[0]["data"]["processing_age_seconds"], 61)

    def test_transport_diagnostic_event_survives_successful_completion(self):
        publication = self.create_publication()
        self.approve(publication)
        result = PublishResult("diagnostic-video", "https://www.youtube.com/shorts/diagnostic-video")
        object.__setattr__(
            result,
            "transport_diagnostics",
            (
                {
                    "exception_class": "ConnectionResetError",
                    "stage": "final_chunk_upload",
                    "elapsed_seconds": 0.125,
                    "http_status": None,
                    "attempt": 1,
                    "session_fingerprint": "0123456789abcdef",
                },
            ),
        )
        self.assertEqual(self.worker(ResumeFactory(result)).run_once().outcome, "published")
        events = [
            event for event in self.store.list_events(publication.id)
            if event["event_type"] == "youtube_transport_error"
        ]
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["data"]["exception_class"], "ConnectionResetError")
        self.assertNotIn("Authorization", json.dumps(events))
        self.assertNotIn(SESSION_URI, json.dumps(events))
        self.assertIsNone(self.target(publication, "youtube").last_error_code)

    def checkpoint_target(self, publication, *, phase: str = "session_recorded") -> str:
        item = self.store.claim_target_publish("crashed-worker", lease_seconds=5, now=self.clock())
        self.assertIsNotNone(item)
        self.assertIsNotNone(
            self.store.start_target_publish(
                item.id,
                item.lease_token,
                resumable_session_supported=True,
                now=self.clock(),
            )
        )
        self.assertTrue(
            self.store.record_target_processing(
                item.id,
                item.lease_token,
                external_session_id=SESSION_URI,
                asset_sha256=publication.asset_sha256,
                approval_fingerprint=publication.approval_fingerprint,
                total_bytes=self.asset.stat().st_size,
                mime_type="video/mp4",
                offset=0,
                phase=phase,
                now=self.clock(),
            )
        )
        self.clock.advance(6)
        return SESSION_URI

    def test_restart_resumes_same_valid_checkpoint_under_new_lease(self):
        publication = self.create_publication()
        self.approve(publication)
        item = self.store.claim_target_publish("crashed-worker", lease_seconds=5, now=self.clock())
        self.assertIsNotNone(item)
        target = self.store.start_target_publish(
            item.id,
            item.lease_token,
            resumable_session_supported=True,
            now=self.clock(),
        )
        self.assertIsNotNone(target)
        session = SESSION_URI
        self.assertTrue(
            self.store.record_target_processing(
                item.id,
                item.lease_token,
                external_session_id=session,
                asset_sha256=publication.asset_sha256,
                approval_fingerprint=publication.approval_fingerprint,
                total_bytes=self.asset.stat().st_size,
                mime_type="video/mp4",
                offset=0,
                phase="session_recorded",
                now=self.clock(),
            )
        )
        self.clock.advance(6)
        factory = ResumeFactory(PublishResult("resumed-id", "https://www.youtube.com/shorts/resumed-id", session))
        result = self.worker(factory).run_once()
        self.assertEqual(result.outcome, "published")
        self.assertEqual(len(factory.requests), 1)
        request = factory.requests[0]
        self.assertIsNotNone(request.resumable_checkpoint)
        self.assertEqual(request.existing_external_session_id, session)
        self.assertEqual(request.resumable_checkpoint.asset_sha256, publication.asset_sha256)
        published = self.target(publication, "youtube")
        self.assertEqual(published.state, TargetState.PUBLISHED)
        self.assertIsNone(published.external_session_id)
        self.assertFalse(published.resumable_session_verified)
        self.assertIsNone(published.resumable_asset_sha256)
        self.assertIsNone(published.resumable_phase)
        self.assertNotIn(session, json.dumps(self.store.list_events(publication.id), sort_keys=True))
        self.assertNotIn(
            session,
            json.dumps(publish._publication_json(self.store.get_publication(publication.id), [published]), sort_keys=True),
        )

    def test_definitive_expired_session_clears_checkpoint_before_explicit_new_upload(self):
        publication = self.create_publication()
        self.approve(publication)
        session = self.checkpoint_target(publication)
        expired = ResumeFactory(
            PermanentPublishError(
                "youtube_session_not_found",
                "YouTube resumable upload session is no longer available",
                external_session_id=session,
            )
        )
        self.assertEqual(self.worker(expired).run_once().outcome, "permanent_failure")
        failed = self.target(publication, "youtube")
        self.assertEqual(failed.state, TargetState.FAILED)
        self.assertIsNone(failed.external_session_id)
        self.assertFalse(failed.resumable_session_verified)

        retried = self.store.retry_failed_target(failed.id, now=self.clock())
        self.assertEqual(retried.state, TargetState.QUEUED)
        fresh = ResumeFactory(PublishResult("fresh-id", "https://www.youtube.com/shorts/fresh-id"))
        self.assertEqual(self.worker(fresh).run_once().outcome, "published")
        self.assertIsNone(fresh.requests[0].existing_external_session_id)
        self.assertIsNone(fresh.requests[0].resumable_checkpoint)

    def test_retry_wait_or_legacy_session_never_restarts_without_resume_capability(self):
        publication = self.create_publication()
        self.approve(publication)
        case = self

        class CheckpointThenRetry:
            def supports_resumable_session(self, platform):
                return platform == "youtube"

            def __call__(self, _platform):
                class Adapter:
                    def publish(self, request):
                        checkpoint = ResumableSessionCheckpoint(
                            session_uri=SESSION_URI,
                            asset_sha256=request.asset_sha256,
                            approval_fingerprint=request.approval_fingerprint,
                            total_bytes=request.asset_path.stat().st_size,
                            mime_type="video/mp4",
                            offset=0,
                            phase="uploading",
                        )
                        case.assertTrue(request.record_target_processing(checkpoint))
                        raise RetryablePublishError(
                            "youtube_server_unavailable",
                            "YouTube upload session can be retried safely",
                            external_session_id=SESSION_URI,
                        )

                return Adapter()

        self.assertEqual(self.worker(CheckpointThenRetry()).run_once().outcome, "retry_wait")
        target = self.target(publication, "youtube")
        self.assertEqual(target.state, TargetState.RETRY_WAIT)
        # Simulate a v3 migration of an older generic session: its URI is
        # present, but no immutable resumable proof exists.
        with self.store._write_transaction() as conn:
            conn.execute(
                """
                UPDATE publication_targets
                SET resumable_session_verified = 0, resumable_asset_sha256 = NULL,
                    resumable_approval_fingerprint = NULL, resumable_total_bytes = NULL,
                    resumable_mime_type = NULL, resumable_offset = NULL, resumable_phase = NULL
                WHERE id = ?
                """,
                (target.id,),
            )
        self.clock.advance(30)

        class NoResumeFactory:
            def __init__(self):
                self.calls = 0

            def supports_resumable_session(self, _platform):
                return False

            def __call__(self, _platform):
                self.calls += 1
                raise AssertionError("unsafe adapter construction")

        no_resume = NoResumeFactory()
        self.assertEqual(self.worker(no_resume).run_once().outcome, "skipped_stale_or_invalid")
        blocked = self.target(publication, "youtube")
        self.assertEqual(blocked.state, TargetState.RECONCILIATION_REQUIRED)
        self.assertEqual(blocked.last_error_code, "resumable_session_resume_unavailable")
        self.assertEqual(no_resume.calls, 0)

    def test_final_chunk_ambiguity_keeps_checkpoint_for_reconciliation(self):
        publication = self.create_publication()
        self.approve(publication)
        session = self.checkpoint_target(publication, phase="final_chunk_inflight")
        factory = ResumeFactory(
            AmbiguousPublishError(
                "youtube_session_missing_after_final_chunk",
                "YouTube session disappeared after an uncertain final chunk",
                external_session_id=session,
            )
        )
        self.assertEqual(self.worker(factory).run_once().outcome, "reconciliation_required")
        target = self.target(publication, "youtube")
        self.assertEqual(target.state, TargetState.RECONCILIATION_REQUIRED)
        self.assertEqual(target.external_session_id, session)
        self.assertTrue(target.resumable_session_verified)
        reconciled = self.store.reconcile_target(
            target.id,
            outcome="mark-published",
            external_media_id="operator-confirmed",
            external_url="https://www.youtube.com/shorts/operator-confirmed",
            now=self.clock(),
        )
        self.assertEqual(reconciled.state, TargetState.PUBLISHED)
        self.assertIsNone(reconciled.external_session_id)
        self.assertFalse(reconciled.resumable_session_verified)

    def test_privacy_mismatch_keeps_known_video_reference_without_claiming_published(self):
        publication = self.create_publication()
        self.approve(publication)
        session = self.checkpoint_target(publication, phase="final_chunk_inflight")
        factory = ResumeFactory(
            AmbiguousPublishError(
                "youtube_privacy_status_mismatch",
                "YouTube created a video but did not confirm the approved privacy status",
                external_session_id=session,
                external_media_id="forced-private-id",
                external_url="https://www.youtube.com/shorts/forced-private-id",
            )
        )
        self.assertEqual(self.worker(factory).run_once().outcome, "reconciliation_required")
        target = self.target(publication, "youtube")
        self.assertEqual(target.state, TargetState.RECONCILIATION_REQUIRED)
        self.assertEqual(target.external_media_id, "forced-private-id")
        self.assertEqual(target.external_url, "https://www.youtube.com/shorts/forced-private-id")
        self.assertEqual(target.external_session_id, session)

    def test_exhausted_retryable_final_session_requires_reconciliation_not_new_upload(self):
        publication = self.create_publication()
        self.approve(publication)
        session = self.checkpoint_target(publication, phase="final_chunk_inflight")
        factory = ResumeFactory(
            RetryablePublishError(
                "youtube_server_unavailable",
                "YouTube upload session can be retried safely",
                external_session_id=session,
            )
        )
        result = self.worker(factory, max_attempts=2).run_once()
        self.assertEqual(result.outcome, "reconciliation_required")
        target = self.target(publication, "youtube")
        self.assertEqual(target.state, TargetState.RECONCILIATION_REQUIRED)
        self.assertEqual(target.external_session_id, session)
        self.assertTrue(target.resumable_session_verified)
        self.assertEqual(target.dispatch_generation, 0)
        self.assertIsNone(self.worker(factory, max_attempts=2).run_once())

    def test_youtube_target_is_independent_from_unavailable_instagram(self):
        metadata = youtube_metadata()
        metadata["targets"]["instagram"] = {"caption": "Approved", "share_to_feed": True}
        self.snapshot = write_metadata_snapshot(metadata, self.root / "metadata-instagram")
        publication = self.store.create_publication(
            publication_id="publication-ig",
            slug="hash-tables-ig",
            source_path=str(self.root / "source.mp4"),
            source_sha256="a" * 64,
            asset_path=str(self.asset),
            asset_sha256=sha256(self.asset.read_bytes()).hexdigest(),
            metadata_path=str(self.snapshot.path),
            metadata_sha256=metadata_sha256(metadata),
            target_platforms=("youtube", "instagram"),
            execution_mode=ExecutionMode.LIVE,
        )
        self.approve(publication)

        class Factory:
            def supports_resumable_session(self, platform):
                return platform == "youtube"

            def __call__(self, platform):
                class Adapter:
                    def publish(self, _request):
                        if platform == "youtube":
                            return PublishResult("yt-ok", "https://www.youtube.com/shorts/yt-ok")
                        raise PermanentPublishError("live_adapter_unavailable", "Instagram live adapter is unavailable")

                return Adapter()

        worker = self.worker(Factory())
        self.assertEqual(worker.run_once().outcome, "published")
        self.assertEqual(worker.run_once().outcome, "permanent_failure")
        self.assertEqual(self.target(publication, "youtube").state, TargetState.PUBLISHED)
        self.assertEqual(self.target(publication, "instagram").state, TargetState.FAILED)
        live_factory = YouTubeLiveAdapterFactory(self.root / "state")
        self.assertTrue(live_factory.supports_resumable_session("youtube"))
        self.assertFalse(live_factory.supports_resumable_session("instagram"))
        with self.assertRaises(PermanentPublishError):
            live_factory("instagram")

    def test_live_instagram_cannot_record_or_reclaim_youtube_resumable_checkpoint(self):
        metadata = youtube_metadata()
        metadata["targets"]["instagram"] = {"caption": "Approved", "share_to_feed": True}
        snapshot = write_metadata_snapshot(metadata, self.root / "metadata-instagram-resume")
        publication = self.store.create_publication(
            publication_id="publication-instagram-resume",
            slug="hash-tables-instagram-resume",
            source_path=str(self.root / "source.mp4"),
            source_sha256="a" * 64,
            asset_path=str(self.asset),
            asset_sha256=sha256(self.asset.read_bytes()).hexdigest(),
            metadata_path=str(snapshot.path),
            metadata_sha256=metadata_sha256(metadata),
            target_platforms=("instagram",),
            execution_mode=ExecutionMode.LIVE,
        )
        self.approve(publication)
        item = self.store.claim_target_publish("crashed-worker", lease_seconds=5, now=self.clock())
        self.assertIsNotNone(item)
        target = self.store.start_target_publish(
            item.id,
            item.lease_token,
            resumable_session_supported=True,
            now=self.clock(),
        )
        self.assertIsNotNone(target)
        self.assertFalse(
            self.store.record_target_processing(
                item.id,
                item.lease_token,
                external_session_id=SESSION_URI,
                asset_sha256=publication.asset_sha256,
                approval_fingerprint=publication.approval_fingerprint,
                total_bytes=self.asset.stat().st_size,
                mime_type="video/mp4",
                now=self.clock(),
            )
        )
        with self.store._write_transaction() as conn:
            conn.execute(
                """
                UPDATE publication_targets
                SET state = ?, external_session_id = ?, resumable_session_verified = 1,
                    resumable_asset_sha256 = ?, resumable_approval_fingerprint = ?,
                    resumable_total_bytes = ?, resumable_mime_type = ?,
                    resumable_offset = 0, resumable_phase = 'uploading'
                WHERE id = ?
                """,
                (
                    TargetState.PROCESSING.value,
                    SESSION_URI,
                    publication.asset_sha256,
                    publication.approval_fingerprint,
                    self.asset.stat().st_size,
                    "video/mp4",
                    target.id,
                ),
            )
        self.assertFalse(
            self.store.record_target_progress(
                item.id,
                item.lease_token,
                offset=1,
                phase="uploading",
                now=self.clock(),
            )
        )
        self.clock.advance(6)

        class MaliciousFactory:
            def __init__(self):
                self.calls = 0
                self.capability_calls = 0

            def supports_resumable_session(self, _platform):
                self.capability_calls += 1
                return True

            def __call__(self, _platform):
                self.calls += 1
                raise AssertionError("reclaimed non-YouTube checkpoint reached adapter")

        factory = MaliciousFactory()
        self.assertEqual(self.worker(factory).run_once().outcome, "skipped_stale_or_invalid")
        blocked = self.target(publication, "instagram")
        self.assertEqual(blocked.state, TargetState.RECONCILIATION_REQUIRED)
        self.assertEqual(blocked.last_error_code, "lease_expired_after_publish_started")
        self.assertEqual(factory.capability_calls, 0)
        self.assertEqual(factory.calls, 0)

    def test_worker_uses_provider_retry_after_without_exposing_session(self):
        publication = self.create_publication()
        self.approve(publication)
        session = SESSION_URI
        factory = ResumeFactory(
            RetryablePublishError(
                "youtube_rate_limited",
                "provider returned " + session,
                external_session_id=session,
                retry_after_seconds=90,
            )
        )
        worker = PublishWorker(
            store=self.store,
            worker_id="retry-after-worker",
            adapter_factory=factory,
            clock=self.clock,
            lease_seconds=30,
            base_backoff_seconds=10,
        )
        result = worker.run_once()
        self.assertEqual(result.outcome, "retry_wait")
        target = self.target(publication, "youtube")
        self.assertEqual(target.next_attempt_at, "2099-01-01T00:01:30.000000Z")
        self.assertNotIn(session, target.last_error_detail)

    def test_session_url_never_reaches_events_status_or_error_detail(self):
        publication = self.create_publication()
        self.approve(publication)
        session = SESSION_URI
        case = self

        class FailingFactory:
            def supports_resumable_session(self, platform):
                return platform == "youtube"

            def __call__(self, _platform):
                class Adapter:
                    def publish(self, request):
                        checkpoint = ResumableSessionCheckpoint(
                            session_uri=session,
                            asset_sha256=request.asset_sha256,
                            approval_fingerprint=request.approval_fingerprint,
                            total_bytes=request.asset_path.stat().st_size,
                            mime_type="video/mp4",
                            offset=0,
                            phase="session_recorded",
                        )
                        case.assertTrue(request.record_target_processing(checkpoint))
                        raise PermanentPublishError(
                            "youtube_upload_rejected",
                            "provider diagnostic includes " + session,
                            external_session_id=session,
                        )

                return Adapter()

        result = self.worker(FailingFactory()).run_once()
        self.assertEqual(result.outcome, "permanent_failure")
        target = self.target(publication, "youtube")
        self.assertIsNone(target.external_session_id)
        self.assertFalse(target.resumable_session_verified)
        self.assertNotIn(session, target.last_error_detail)
        events = json.dumps(self.store.list_events(publication.id), sort_keys=True)
        self.assertNotIn(session, events)
        status = publish._publication_json(self.store.get_publication(publication.id), [target])
        rendered = json.dumps(status, sort_keys=True)
        self.assertNotIn(session, rendered)
        self.assertNotIn("external_session_id", rendered)


if __name__ == "__main__":
    unittest.main()
