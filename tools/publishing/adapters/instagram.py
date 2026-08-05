"""Fail-closed Instagram Reels adapter for the Instagram Login API.

Meta offers no idempotency key for container creation or media publishing.
Every state transition that precedes such a request is therefore durable; a
lost response always becomes reconciliation, never a duplicate POST.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import json
import os
from pathlib import Path
import re
import stat
import threading
from typing import Any, Callable, Mapping, Protocol
from urllib.parse import urlencode

from .base import (
    AmbiguousPublishError,
    InstagramPublishCheckpoint,
    PermanentPublishError,
    PublishRequest,
    PublishResult,
    RetryablePublishError,
)
from .r2 import (
    R2AssetError,
    R2ConfigurationError,
    R2OperationError,
    R2TemporaryMedia,
    StagedMedia,
)
from ..security import PrivatePathError, absolute_path, reject_symlink_chain


INSTAGRAM_GRAPH_HOST = "graph.instagram.com"
_VERSION_RE = re.compile(r"^v[1-9][0-9]*\.[0-9]+$")
_ID_RE = re.compile(r"^[0-9]+$")
_LEASE_MARGIN_SECONDS = 5.0
_CHECKPOINT_PHASES = frozenset({
    "object_uploaded", "container_create_inflight", "container_created",
    "processing", "publish_inflight",
})


class InstagramConfigurationError(RuntimeError):
    """Local Instagram credentials or configuration are unsafe."""


@dataclass(frozen=True)
class InstagramHttpResponse:
    status_code: int
    headers: Mapping[str, str]
    body: bytes = b""


class InstagramHttpTransport(Protocol):
    def request(
        self, method: str, url: str, *, headers: Mapping[str, str], body: bytes,
        timeout: float,
    ) -> InstagramHttpResponse: ...


class RequestsInstagramHttpTransport:
    """Production transport: redirects are disabled for all API calls."""

    requires_lease_watchdog = True

    def request(
        self, method: str, url: str, *, headers: Mapping[str, str], body: bytes,
        timeout: float,
    ) -> InstagramHttpResponse:
        try:
            import requests
            response = requests.request(
                method, url, headers=dict(headers), data=body, timeout=timeout,
                allow_redirects=False,
            )
        except Exception as exc:
            raise OSError("Instagram HTTP transport failed") from exc
        return InstagramHttpResponse(
            status_code=int(response.status_code),
            headers={str(key): str(value) for key, value in response.headers.items()},
            body=bytes(response.content),
        )


class _LeaseWatchdog:
    """Keep a production lease alive while a bounded HTTP request blocks."""

    def __init__(self, heartbeat: Callable[[], bool], interval_seconds: float) -> None:
        self._heartbeat = heartbeat
        self._interval_seconds = interval_seconds
        self._stop = threading.Event()
        self.failed = False
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self) -> None:
        self._thread.start()

    def close(self) -> None:
        self._stop.set()
        self._thread.join(timeout=max(1.0, self._interval_seconds * 2))
        if self._thread.is_alive():
            self.failed = True

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                if not self._heartbeat():
                    self.failed = True
                    return
            except Exception:
                self.failed = True
                return
            if self._stop.wait(self._interval_seconds):
                return


@dataclass(frozen=True)
class InstagramSettings:
    user_id: str
    api_version: str
    access_token_file: Path = field(repr=False)
    state_dir: Path

    def __post_init__(self) -> None:
        if not _ID_RE.fullmatch(self.user_id) or not _VERSION_RE.fullmatch(self.api_version):
            raise InstagramConfigurationError("Instagram configuration is incomplete or invalid")
        token_file = self._external_token_path(self.access_token_file, self.state_dir)
        object.__setattr__(self, "access_token_file", token_file)
        object.__setattr__(self, "state_dir", absolute_path(self.state_dir))

    @staticmethod
    def _external_token_path(raw: Path | str, state_dir: Path | str) -> Path:
        candidate = absolute_path(raw)
        state = absolute_path(state_dir)
        if not Path(raw).expanduser().is_absolute():
            raise InstagramConfigurationError("Instagram access-token file must be absolute and outside publisher state")
        try:
            reject_symlink_chain(candidate, label="Instagram access-token file")
            reject_symlink_chain(state, label="publisher state directory")
        except PrivatePathError as exc:
            raise InstagramConfigurationError("Instagram access-token file is unsafe") from exc
        try:
            candidate.relative_to(state)
        except ValueError:
            return candidate
        raise InstagramConfigurationError("Instagram access-token file must be outside publisher state")

    @classmethod
    def from_environment(
        cls, *, state_dir: Path | str, environ: Mapping[str, str] | None = None,
    ) -> "InstagramSettings":
        source = os.environ if environ is None else environ
        return cls(
            user_id=str(source.get("SHORTVIDEO_INSTAGRAM_USER_ID", "")).strip(),
            api_version=str(source.get("SHORTVIDEO_INSTAGRAM_API_VERSION", "")).strip(),
            access_token_file=Path(str(source.get("SHORTVIDEO_INSTAGRAM_ACCESS_TOKEN_FILE", "")).strip()),
            state_dir=Path(state_dir),
        )

    def read_access_token(self) -> str:
        try:
            info = self.access_token_file.lstat()
        except OSError as exc:
            raise InstagramConfigurationError("Instagram access-token file cannot be read") from exc
        if (
            stat.S_ISLNK(info.st_mode)
            or not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.geteuid()
            or stat.S_IMODE(info.st_mode) & 0o077
        ):
            raise InstagramConfigurationError("Instagram access-token file must be owner-only")
        try:
            token = self.access_token_file.read_text(encoding="utf-8").strip()
        except OSError as exc:
            raise InstagramConfigurationError("Instagram access-token file cannot be read") from exc
        if not token or "\n" in token or "\r" in token:
            raise InstagramConfigurationError("Instagram access-token file is invalid")
        return token


def _json_object(response: InstagramHttpResponse) -> dict[str, Any]:
    try:
        parsed = json.loads(response.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("invalid JSON") from exc
    if not isinstance(parsed, dict):
        raise ValueError("invalid JSON")
    return parsed


def _retry_after(response: InstagramHttpResponse) -> int | None:
    raw = next((str(value) for key, value in response.headers.items() if str(key).lower() == "retry-after"), None)
    if raw is None:
        return None
    try:
        return max(0, int(raw))
    except ValueError:
        try:
            when = parsedate_to_datetime(raw)
        except (TypeError, ValueError, IndexError):
            return None
        if when.tzinfo is None:
            return None
        return max(0, int((when.astimezone(timezone.utc) - datetime.now(timezone.utc)).total_seconds()))


class InstagramReelsAdapter:
    instagram_checkpoint_capable = True

    def __init__(
        self, settings: InstagramSettings, r2: R2TemporaryMedia, *,
        transport: InstagramHttpTransport | None = None, timeout_seconds: float = 30.0,
    ) -> None:
        if timeout_seconds <= 0:
            raise InstagramConfigurationError("Instagram HTTP timeout must be positive")
        self.settings = settings
        self.r2 = r2
        self.transport = transport or RequestsInstagramHttpTransport()
        self.timeout_seconds = timeout_seconds

    def publish(self, request: PublishRequest) -> PublishResult:
        if request.platform != "instagram":
            raise PermanentPublishError("instagram_platform_mismatch", "Instagram adapter received a non-Instagram target")
        self._ensure_active(request)
        self._validate_lease_budget(request)
        target = self._target_metadata(request)
        total_bytes = self._asset_size(request)
        checkpoint = request.instagram_checkpoint
        if checkpoint is None:
            staged = self._stage(request)
            uploaded = self._checkpoint(request, staged, total_bytes, None, "object_uploaded")
            self._record(request, uploaded)
            return self._create_container(request, staged, uploaded, target)
        self._validate_checkpoint(request, checkpoint, total_bytes)
        if checkpoint.phase == "object_uploaded":
            # A checkpoint before the pre-POST fence means no POST was sent.
            # Re-staging the deterministic key only refreshes the capability.
            staged = self._stage(request)
            refreshed = self._checkpoint(request, staged, total_bytes, None, "object_uploaded")
            self._record(request, refreshed)
            return self._create_container(request, staged, refreshed, target)
        if checkpoint.phase == "container_create_inflight":
            raise AmbiguousPublishError("instagram_container_reconciliation_required", "Instagram container outcome requires reconciliation")
        if checkpoint.phase == "publish_inflight":
            raise AmbiguousPublishError("instagram_publish_reconciliation_required", "Instagram publish outcome requires reconciliation", external_session_id=checkpoint.container_id)
        return self._continue_container(request, checkpoint)

    def _stage(self, request: PublishRequest) -> StagedMedia:
        try:
            return self.r2.stage(
                publication_id=request.publication_id, target_id=str(request.target_id),
                asset_path=request.asset_path, asset_sha256=request.asset_sha256,
            )
        except R2ConfigurationError as exc:
            raise PermanentPublishError("instagram_r2_configuration", "temporary Instagram media storage is not configured") from exc
        except R2AssetError as exc:
            raise PermanentPublishError("instagram_r2_asset_invalid", "approved video cannot be staged for Instagram") from exc
        except R2OperationError as exc:
            raise RetryablePublishError("instagram_r2_unavailable", "temporary Instagram media staging can be retried safely") from exc

    def _create_container(
        self, request: PublishRequest, staged: StagedMedia, checkpoint: InstagramPublishCheckpoint,
        target: Mapping[str, Any],
    ) -> PublishResult:
        if staged.expires_at <= datetime.now(timezone.utc) + timedelta(seconds=self.timeout_seconds + _LEASE_MARGIN_SECONDS):
            raise AmbiguousPublishError("instagram_url_expired", "Instagram temporary media URL expires too soon for container creation")
        # Do this before the pre-POST fence: a local token-file failure cannot
        # be represented as a provider request that may have happened.
        token = self.settings.read_access_token()
        inflight = replace(checkpoint, phase="container_create_inflight")
        self._record(request, inflight)
        body = self._form({
            "media_type": "REELS",
            "video_url": staged.signed_url,
            "caption": target["caption"],
            "share_to_feed": str(target["share_to_feed"]).lower(),
            "access_token": token,
        })
        try:
            response = self._request(request, "POST", self._url(f"/{self.settings.user_id}/media"), body=body)
        except OSError as exc:
            raise AmbiguousPublishError("instagram_container_ambiguous", "Instagram container creation outcome is unknown") from exc
        if response.status_code in {200, 201}:
            try:
                container_id = _json_object(response).get("id")
            except ValueError as exc:
                raise AmbiguousPublishError("instagram_container_ambiguous", "Instagram container creation outcome is unknown") from exc
            if not isinstance(container_id, str) or not _ID_RE.fullmatch(container_id):
                raise AmbiguousPublishError("instagram_container_ambiguous", "Instagram container creation outcome is unknown")
            created = replace(inflight, container_id=container_id, phase="container_created")
            self._record(request, created)
            return self._continue_container(request, created)
        if response.status_code == 429:
            # A response proves Meta declined this request; the pre-POST fence
            # remains, so reconciliation is still required instead of retrying.
            raise AmbiguousPublishError("instagram_container_ambiguous", "Instagram container creation outcome is unknown")
        if 400 <= response.status_code <= 499:
            self._cleanup(inflight.object_key)
            raise PermanentPublishError("instagram_container_rejected", "Instagram rejected the approved request")
        raise AmbiguousPublishError("instagram_container_ambiguous", "Instagram container creation outcome is unknown")

    def _continue_container(self, request: PublishRequest, checkpoint: InstagramPublishCheckpoint) -> PublishResult:
        assert checkpoint.container_id is not None
        try:
            response = self._request(
                request, "GET", self._url(f"/{checkpoint.container_id}?fields=status_code%2Cstatus"),
                headers={"Authorization": f"Bearer {self.settings.read_access_token()}"}, body=b"",
            )
        except OSError as exc:
            raise RetryablePublishError("instagram_status_unavailable", "Instagram container status can be polled again", external_session_id=checkpoint.container_id) from exc
        if response.status_code == 429 or 500 <= response.status_code <= 599:
            raise RetryablePublishError("instagram_status_unavailable", "Instagram container status can be polled again", external_session_id=checkpoint.container_id, retry_after_seconds=_retry_after(response))
        if 400 <= response.status_code <= 499:
            self._cleanup(checkpoint.object_key, external_session_id=checkpoint.container_id)
            raise PermanentPublishError("instagram_status_rejected", "Instagram rejected the container status request", external_session_id=checkpoint.container_id)
        if response.status_code != 200:
            raise AmbiguousPublishError("instagram_status_ambiguous", "Instagram container status was malformed", external_session_id=checkpoint.container_id)
        try:
            status = _json_object(response).get("status_code")
        except ValueError as exc:
            raise AmbiguousPublishError("instagram_status_ambiguous", "Instagram container status was malformed", external_session_id=checkpoint.container_id) from exc
        if status == "IN_PROGRESS":
            self._record(request, replace(checkpoint, phase="processing"))
            raise RetryablePublishError("instagram_processing", "Instagram is still processing the Reel", external_session_id=checkpoint.container_id)
        if status == "FINISHED":
            if checkpoint.phase == "container_created":
                checkpoint = replace(checkpoint, phase="processing")
                self._record(request, checkpoint)
            # Validate local credentials before recording a phase that means
            # exactly one irreversible media_publish POST may be attempted.
            token = self.settings.read_access_token()
            inflight = replace(checkpoint, phase="publish_inflight")
            self._record(request, inflight)
            return self._publish_container(request, inflight, token)
        if status in {"ERROR", "EXPIRED"}:
            self._cleanup(checkpoint.object_key, external_session_id=checkpoint.container_id)
            raise PermanentPublishError("instagram_container_failed", "Instagram rejected or expired the Reel container", external_session_id=checkpoint.container_id)
        raise AmbiguousPublishError("instagram_status_ambiguous", "Instagram container status was malformed", external_session_id=checkpoint.container_id)

    def _publish_container(
        self, request: PublishRequest, checkpoint: InstagramPublishCheckpoint, token: str,
    ) -> PublishResult:
        assert checkpoint.container_id is not None
        body = self._form({"creation_id": checkpoint.container_id, "access_token": token})
        try:
            response = self._request(request, "POST", self._url(f"/{self.settings.user_id}/media_publish"), body=body)
        except OSError as exc:
            raise AmbiguousPublishError("instagram_publish_ambiguous", "Instagram Reel publish outcome is unknown", external_session_id=checkpoint.container_id) from exc
        if response.status_code not in {200, 201}:
            raise AmbiguousPublishError("instagram_publish_ambiguous", "Instagram Reel publish outcome is unknown", external_session_id=checkpoint.container_id)
        try:
            media_id = _json_object(response).get("id")
        except ValueError as exc:
            raise AmbiguousPublishError("instagram_publish_ambiguous", "Instagram Reel publish outcome is unknown", external_session_id=checkpoint.container_id) from exc
        if not isinstance(media_id, str) or not _ID_RE.fullmatch(media_id):
            raise AmbiguousPublishError("instagram_publish_ambiguous", "Instagram Reel publish outcome is unknown", external_session_id=checkpoint.container_id)
        external_url = f"https://www.instagram.com/reel/{media_id}/"
        self._cleanup(
            checkpoint.object_key,
            external_session_id=checkpoint.container_id,
            external_media_id=media_id,
            external_url=external_url,
        )
        return PublishResult(media_id, external_url)

    def _request(self, request: PublishRequest, method: str, url: str, *, body: bytes, headers: Mapping[str, str] | None = None) -> InstagramHttpResponse:
        self._ensure_active(request)
        request_headers = {"Content-Length": str(len(body))}
        if body:
            request_headers["Content-Type"] = "application/x-www-form-urlencoded"
        if headers:
            request_headers.update(headers)
        watchdog = self._request_lease_watchdog(request)
        transport_error: OSError | None = None
        response: InstagramHttpResponse | None = None
        try:
            response = self.transport.request(method, url, headers=request_headers, body=body, timeout=self.timeout_seconds)
        except OSError as exc:
            transport_error = exc
        finally:
            if watchdog is not None:
                watchdog.close()
        if watchdog is not None and watchdog.failed:
            raise AmbiguousPublishError(
                "instagram_lease_lost_during_request",
                "publish lease was lost during an Instagram provider request",
            )
        if transport_error is not None:
            raise transport_error
        assert response is not None
        if isinstance(response.status_code, bool) or not isinstance(response.status_code, int):
            raise OSError("invalid Instagram response")
        return response

    def _request_lease_watchdog(self, request: PublishRequest) -> _LeaseWatchdog | None:
        if (
            request.heartbeat is None
            or request.lease_seconds is None
            or getattr(self.transport, "requires_lease_watchdog", False) is not True
        ):
            return None
        interval = max(0.25, min(5.0, request.lease_seconds / 3.0))
        watchdog = _LeaseWatchdog(request.heartbeat, interval)
        watchdog.start()
        return watchdog

    def _cleanup(
        self,
        object_key: str,
        *,
        external_session_id: str | None = None,
        external_media_id: str | None = None,
        external_url: str | None = None,
    ) -> None:
        try:
            self.r2.cleanup(object_key)
        except (R2ConfigurationError, R2AssetError, R2OperationError) as exc:
            raise AmbiguousPublishError(
                "instagram_cleanup_required",
                "temporary Instagram media cleanup requires reconciliation",
                external_session_id=external_session_id,
                external_media_id=external_media_id,
                external_url=external_url,
            ) from exc

    @staticmethod
    def _target_metadata(request: PublishRequest) -> Mapping[str, Any]:
        targets = request.metadata.get("targets") if isinstance(request.metadata, Mapping) else None
        target = targets.get("instagram") if isinstance(targets, Mapping) else None
        if (
            not isinstance(target, Mapping)
            or set(target) != {"caption", "share_to_feed"}
            or not isinstance(target.get("caption"), str)
            or not isinstance(target.get("share_to_feed"), bool)
        ):
            raise PermanentPublishError("instagram_metadata_invalid", "approved Instagram metadata is invalid")
        return target

    @staticmethod
    def _asset_size(request: PublishRequest) -> int:
        try:
            size = request.asset_path.stat().st_size
        except OSError as exc:
            raise PermanentPublishError("instagram_asset_unreadable", "approved video asset cannot be read") from exc
        if size < 1:
            raise PermanentPublishError("instagram_empty_asset", "approved video asset is empty")
        return size

    def _validate_lease_budget(self, request: PublishRequest) -> None:
        if request.lease_seconds is None:
            return
        if (
            isinstance(request.lease_seconds, bool)
            or not isinstance(request.lease_seconds, int)
            or request.lease_seconds <= self.timeout_seconds + _LEASE_MARGIN_SECONDS
        ):
            raise PermanentPublishError("instagram_lease_too_short", "Instagram publish lease is shorter than one bounded provider request")

    @staticmethod
    def _validate_checkpoint(request: PublishRequest, checkpoint: InstagramPublishCheckpoint, total_bytes: int) -> None:
        no_container = checkpoint.phase in {"object_uploaded", "container_create_inflight"}
        if (
            checkpoint.asset_sha256 != request.asset_sha256
            or checkpoint.approval_fingerprint != request.approval_fingerprint
            or checkpoint.total_bytes != total_bytes
            or checkpoint.mime_type != "video/mp4"
            or checkpoint.phase not in _CHECKPOINT_PHASES
            or not checkpoint.object_key
            or (checkpoint.container_id is None) != no_container
        ):
            raise AmbiguousPublishError("instagram_checkpoint_invalid", "stored Instagram checkpoint cannot be resumed safely")

    def _ensure_active(self, request: PublishRequest) -> None:
        try:
            if request.cancellation_requested is not None and request.cancellation_requested():
                raise PermanentPublishError("publish_cancelled", "publish was cancelled before the next provider request")
            if request.heartbeat is not None and not request.heartbeat():
                raise AmbiguousPublishError("instagram_lease_lost", "publish lease was lost before the next provider request")
        except (PermanentPublishError, AmbiguousPublishError):
            raise
        except Exception as exc:
            raise AmbiguousPublishError("instagram_lease_unknown", "publish lease could not be verified") from exc

    @staticmethod
    def _form(values: Mapping[str, str]) -> bytes:
        return urlencode(values).encode("utf-8")

    def _url(self, path: str) -> str:
        return f"https://{INSTAGRAM_GRAPH_HOST}/{self.settings.api_version}{path}"

    @staticmethod
    def _iso(value: datetime) -> str:
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    def _checkpoint(self, request: PublishRequest, staged: StagedMedia, total_bytes: int, container_id: str | None, phase: str) -> InstagramPublishCheckpoint:
        return InstagramPublishCheckpoint(staged.object_key, container_id, request.asset_sha256, request.approval_fingerprint, total_bytes, "video/mp4", phase, self._iso(staged.expires_at))

    @staticmethod
    def _record(request: PublishRequest, checkpoint: InstagramPublishCheckpoint) -> None:
        if request.record_instagram_checkpoint is None or not request.record_instagram_checkpoint(checkpoint):
            raise AmbiguousPublishError("instagram_checkpoint_not_durable", "Instagram provider state could not be durably recorded", external_session_id=checkpoint.container_id)
