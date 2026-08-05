"""Network-agnostic contract for a single platform publish attempt."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping, Protocol


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


@dataclass(frozen=True)
class PublishResult:
    external_media_id: str
    external_url: str
    external_session_id: str | None = None


class PublishAdapter(Protocol):
    """A provider adapter that must honor ``PublishRequest.idempotency_key``."""

    def publish(self, request: PublishRequest) -> PublishResult:
        """Publish or resume exactly this immutable request."""


AdapterFactory = Callable[[str], PublishAdapter]


class PublishError(RuntimeError):
    """Base failure with a stable operator-safe error code."""

    def __init__(self, code: str, detail: str, *, external_session_id: str | None = None):
        if not code or not detail:
            raise ValueError("publish errors need non-empty code and detail")
        if external_session_id is not None and (
            not isinstance(external_session_id, str) or not external_session_id.strip()
        ):
            raise ValueError("external_session_id must be a non-empty string when provided")
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.external_session_id = external_session_id.strip() if external_session_id is not None else None


class RetryablePublishError(PublishError):
    """The adapter proved no ambiguous external outcome occurred."""


class PermanentPublishError(PublishError):
    """The adapter proved retrying this immutable request cannot help."""


class AmbiguousPublishError(PublishError):
    """The provider may have accepted work; automatic retry is unsafe."""
