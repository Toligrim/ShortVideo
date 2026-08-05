"""Deterministic adapter that has no HTTP, cloud-storage, or SDK dependency."""
from __future__ import annotations

from hashlib import sha256

from .base import PublishRequest, PublishResult


class DryRunAdapter:
    """Finish a target locally with stable synthetic provider identifiers."""

    def __init__(self, platform: str):
        self.platform = platform

    def publish(self, request: PublishRequest) -> PublishResult:
        if request.platform != self.platform:
            raise ValueError("dry-run adapter platform does not match request")
        material = "\0".join(
            (
                "shortvideo-dry-run-v1",
                request.approval_fingerprint,
                request.platform,
                request.idempotency_key,
            )
        ).encode("utf-8")
        token = sha256(material).hexdigest()[:24]
        media_id = f"dryrun-{request.platform}-{token}"
        return PublishResult(
            external_media_id=media_id,
            external_url=f"https://dry-run.invalid/{request.platform}/{token}",
            external_session_id=f"dryrun-session-{token}",
        )
