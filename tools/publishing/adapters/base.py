"""Network-agnostic contract for a single platform publish attempt.

The durable worker owns the fence and durable state.  Provider adapters only
receive narrowly scoped callbacks for a resumable-upload checkpoint and lease
heartbeat; they never receive a store or a SQLite connection directly.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Mapping, Protocol


@dataclass(frozen=True)
class ResumableSessionCheckpoint:
    """Proof that a resumable provider session belongs to immutable inputs.

    ``session_uri`` is deliberately excluded from ``repr`` because it can
    contain a bearer-like upload capability.  It is permitted in durable
    target storage, never in events, status JSON, or operator diagnostics.
    """

    session_uri: str = field(repr=False)
    asset_sha256: str
    approval_fingerprint: str
    total_bytes: int
    mime_type: str
    offset: int
    phase: str


CheckpointRecorder = Callable[[ResumableSessionCheckpoint], bool]
ProgressRecorder = Callable[[int, str], bool]
LeaseHeartbeat = Callable[[], bool]
CancellationProbe = Callable[[], bool]


@dataclass(frozen=True)
class PublishRequest:
    publication_id: str
    target_id: int
    platform: str
    asset_path: Path
    asset_sha256: str
    metadata: Mapping[str, Any]
    approval_fingerprint: str
    idempotency_key: str
    # ``existing_external_session_id`` keeps the initial Stage 4 contract
    # explicit.  A live resumable adapter requires the richer checkpoint
    # below before it may trust this value for continuation.
    existing_external_session_id: str | None = field(default=None, repr=False)
    resumable_checkpoint: ResumableSessionCheckpoint | None = None
    record_target_processing: CheckpointRecorder | None = field(default=None, repr=False, compare=False)
    record_target_progress: ProgressRecorder | None = field(default=None, repr=False, compare=False)
    heartbeat: LeaseHeartbeat | None = field(default=None, repr=False, compare=False)
    cancellation_requested: CancellationProbe | None = field(default=None, repr=False, compare=False)
    # Live adapters with bounded blocking I/O use this to reject an unsafe
    # lease budget before their first external request.  ``None`` preserves
    # the standalone adapter/test contract.
    lease_seconds: int | None = None


@dataclass(frozen=True)
class PublishResult:
    """A provider accepted the media resource; async processing is not awaited."""

    external_media_id: str
    external_url: str
    external_session_id: str | None = field(default=None, repr=False)


class PublishAdapter(Protocol):
    """A provider adapter that must honor ``PublishRequest.idempotency_key``."""

    def publish(self, request: PublishRequest) -> PublishResult:
        """Publish or resume exactly this immutable request."""


AdapterFactory = Callable[[str], PublishAdapter]


class ResumableSessionCapableFactory(Protocol):
    """Optional factory capability used before a reclaimed provider call.

    The store remains fail-closed for live targets unless this capability says
    the platform can prove a persisted session is safe to resume.
    """

    def supports_resumable_session(self, platform: str) -> bool:
        """Return whether a platform can safely resume a fenced checkpoint."""


class PublishError(RuntimeError):
    """Base failure with a stable operator-safe error code."""

    def __init__(
        self,
        code: str,
        detail: str,
        *,
        external_session_id: str | None = None,
        external_media_id: str | None = None,
        external_url: str | None = None,
        retry_after_seconds: int | None = None,
    ):
        if not code or not detail:
            raise ValueError("publish errors need non-empty code and detail")
        if external_session_id is not None and (
            not isinstance(external_session_id, str) or not external_session_id.strip()
        ):
            raise ValueError("external_session_id must be a non-empty string when provided")
        if (external_media_id is None) != (external_url is None):
            raise ValueError("external_media_id and external_url must be provided together")
        if external_media_id is not None and (
            not isinstance(external_media_id, str) or not external_media_id.strip()
        ):
            raise ValueError("external_media_id must be a non-empty string when provided")
        if external_url is not None and (
            not isinstance(external_url, str) or not external_url.strip()
        ):
            raise ValueError("external_url must be a non-empty string when provided")
        if retry_after_seconds is not None and (
            isinstance(retry_after_seconds, bool)
            or not isinstance(retry_after_seconds, int)
            or retry_after_seconds < 0
        ):
            raise ValueError("retry_after_seconds must be a non-negative integer when provided")
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.external_session_id = external_session_id.strip() if external_session_id is not None else None
        self.external_media_id = external_media_id.strip() if external_media_id is not None else None
        self.external_url = external_url.strip() if external_url is not None else None
        self.retry_after_seconds = retry_after_seconds


class RetryablePublishError(PublishError):
    """The adapter proved no ambiguous external outcome occurred."""


class PermanentPublishError(PublishError):
    """The adapter proved retrying this immutable request cannot help."""


class AmbiguousPublishError(PublishError):
    """The provider may have accepted work; automatic retry is unsafe."""
