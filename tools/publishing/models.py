"""Shared value objects and state constants for the publishing subsystem."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class PublicationState(StrEnum):
    REVIEW_PENDING = "review_pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    PUBLISHING = "publishing"
    PUBLISHED = "published"
    PARTIAL = "partial"
    FAILED = "failed"


class TargetState(StrEnum):
    QUEUED = "queued"
    UPLOADING = "uploading"
    PROCESSING = "processing"
    RETRY_WAIT = "retry_wait"
    PUBLISHED = "published"
    FAILED = "failed"
    RECONCILIATION_REQUIRED = "reconciliation_required"
    CANCELLED = "cancelled"


class OutboxState(StrEnum):
    PENDING = "pending"
    LEASED = "leased"
    COMPLETED = "completed"
    DEAD = "dead"


class TelegramActionKind(StrEnum):
    APPROVE = "approve"
    REJECT = "reject"
    RETRY = "retry"


class ExecutionMode(StrEnum):
    DRY_RUN = "dry-run"
    LIVE = "live"


PLATFORMS = frozenset({"youtube", "instagram"})


@dataclass(frozen=True)
class Publication:
    id: str
    slug: str
    state: PublicationState
    execution_mode: ExecutionMode
    source_path: str
    source_sha256: str
    asset_path: str
    asset_sha256: str
    metadata_path: str
    metadata_sha256: str
    approval_fingerprint: str
    review_video_message_id: int | None
    review_card_message_id: int | None
    created_at: str
    updated_at: str
    approved_at: str | None
    approved_by_user_id: str | None
    rejected_at: str | None
    rejected_by_user_id: str | None
    status_revision: int


@dataclass(frozen=True)
class PublicationTarget:
    id: int
    publication_id: str
    platform: str
    state: TargetState
    attempts: int
    next_attempt_at: str | None
    external_session_id: str | None = field(repr=False)
    resumable_session_verified: bool
    resumable_asset_sha256: str | None
    resumable_approval_fingerprint: str | None
    resumable_total_bytes: int | None
    resumable_mime_type: str | None
    resumable_offset: int | None
    resumable_phase: str | None
    external_media_id: str | None
    external_url: str | None
    last_error_code: str | None
    last_error_detail: str | None
    created_at: str
    updated_at: str
    published_at: str | None
    dispatch_generation: int


@dataclass(frozen=True)
class OutboxItem:
    id: int
    kind: str
    dedupe_key: str
    publication_id: str | None
    target_id: int | None
    payload: dict[str, Any]
    state: OutboxState
    attempts: int
    available_at: str
    lease_owner: str | None
    lease_token: str | None
    lease_expires_at: str | None
    last_error: str | None
    created_at: str
    completed_at: str | None


@dataclass(frozen=True)
class TelegramAction:
    token: str
    publication_id: str
    target_id: int | None
    kind: TelegramActionKind
    created_at: str
    consumed_at: str | None


@dataclass(frozen=True)
class ActionResult:
    accepted: bool
    duplicate_update: bool
    publication_state: PublicationState | None
    reason: str | None = None
