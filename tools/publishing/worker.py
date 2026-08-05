"""Fenced, approval-gated worker for ``target.publish`` outbox items."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
import time
from typing import Any, Callable, Mapping
import uuid

from .adapters.base import (
    AdapterFactory,
    AmbiguousPublishError,
    PermanentPublishError,
    PublishRequest,
    PublishResult,
    ResumableSessionCheckpoint,
    RetryablePublishError,
)
from .adapters.dry_run import DryRunAdapter
from .db import PublishingStore, StoreError, approval_fingerprint
from .metadata import MetadataError, verify_metadata_snapshot
from .models import ExecutionMode, OutboxItem, Publication, PublicationTarget, TargetState
from .preflight import PreflightError, verify_asset_snapshot


TARGET_PUBLISH_KIND = "target.publish"


class PublishWorkerError(RuntimeError):
    """Worker configuration or immutable-input verification failure."""


@dataclass(frozen=True)
class VerifiedPublishInputs:
    asset_path: Path
    metadata: Mapping[str, Any]


@dataclass(frozen=True)
class WorkerRunResult:
    outbox_id: int
    target_id: int | None
    outcome: str
    detail: str | None = None


Clock = Callable[[], str]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


_URL_RE = re.compile(r"https?://[^\s'\"<>]+", re.IGNORECASE)
_BEARER_RE = re.compile(r"(?i)\bbearer\s+[^\s]+")
_SECRET_ASSIGNMENT_RE = re.compile(
    r"(?i)([\"']?(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|"
    r"code[_-]?verifier|authorization[_-]?code|upload_id)[\"']?\s*(?:=|:)\s*)"
    r"(?:[\"'][^\"']*[\"']|[^\s,;}\]]+)"
)


def _safe_detail(exc: BaseException, *, sensitive_values: tuple[str | None, ...] = ()) -> str:
    """Render a bounded diagnostic without upload URLs or OAuth material."""
    text = " ".join(str(exc).split())
    for value in sensitive_values:
        if isinstance(value, str) and value:
            text = text.replace(value, "[redacted]")
    text = _BEARER_RE.sub("Bearer [redacted]", text)
    text = _SECRET_ASSIGNMENT_RE.sub(r"\1[redacted]", text)
    text = _URL_RE.sub("[redacted-url]", text)
    return text[:500] or exc.__class__.__name__


def _future_timestamp(now: str, seconds: int) -> str:
    parsed = datetime.fromisoformat(now.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise PublishWorkerError("worker clock must return a timezone-aware timestamp")
    return (parsed.astimezone(timezone.utc) + timedelta(seconds=seconds)).isoformat(
        timespec="microseconds"
    ).replace("+00:00", "Z")


def verify_publish_inputs(publication: Publication) -> VerifiedPublishInputs:
    """Revalidate the exact immutable review inputs before provider construction."""
    asset_path = Path(publication.asset_path)
    try:
        verify_asset_snapshot(asset_path, publication.asset_sha256)
        metadata = verify_metadata_snapshot(publication.metadata_path, publication.metadata_sha256)
        expected_fingerprint = approval_fingerprint(
            publication.asset_sha256,
            publication.metadata_sha256,
            publication.execution_mode,
        )
    except (MetadataError, PreflightError, StoreError, OSError) as exc:
        raise PublishWorkerError(f"immutable publish snapshot verification failed: {exc}") from exc
    if expected_fingerprint != publication.approval_fingerprint:
        raise PublishWorkerError("publication approval fingerprint no longer matches immutable inputs")
    return VerifiedPublishInputs(asset_path=asset_path, metadata=metadata)


class PublishWorker:
    """Process only platform work; Telegram delivery is a separate service."""

    def __init__(
        self,
        *,
        store: PublishingStore,
        worker_id: str | None = None,
        adapter_factory: AdapterFactory | None = None,
        max_attempts: int = 3,
        base_backoff_seconds: int = 30,
        max_backoff_seconds: int = 3600,
        lease_seconds: int = 120,
        clock: Clock = _utc_now,
    ):
        if max_attempts < 1:
            raise PublishWorkerError("max_attempts must be at least one")
        if base_backoff_seconds < 1 or max_backoff_seconds < base_backoff_seconds:
            raise PublishWorkerError("invalid exponential backoff bounds")
        if lease_seconds < 1:
            raise PublishWorkerError("lease_seconds must be positive")
        self.store = store
        self.worker_id = worker_id or f"publish-worker-{uuid.uuid4().hex}"
        self.adapter_factory = adapter_factory
        self.max_attempts = max_attempts
        self.base_backoff_seconds = base_backoff_seconds
        self.max_backoff_seconds = max_backoff_seconds
        self.lease_seconds = lease_seconds
        self.clock = clock

    def backoff_seconds(self, attempts: int) -> int:
        """Bounded exponential delay for a just-failed attempt number."""
        if attempts < 1:
            raise PublishWorkerError("attempt number must be positive")
        exponent = attempts - 1
        return min(self.max_backoff_seconds, self.base_backoff_seconds * (2**exponent))

    def run_once(self) -> WorkerRunResult | None:
        now = self.clock()
        # This specialized claim is a security boundary: review/status cards
        # are not platform jobs, even when their available_at sorts first.
        item = self.store.claim_target_publish(
            self.worker_id,
            lease_seconds=self.lease_seconds,
            now=now,
        )
        if item is None:
            return None
        return self._process_claim(item)

    def run_forever(self, *, idle_seconds: float = 1.0) -> None:
        if idle_seconds < 0:
            raise PublishWorkerError("idle_seconds cannot be negative")
        while True:
            result = self.run_once()
            if result is None:
                time.sleep(idle_seconds)

    def _process_claim(self, item: OutboxItem) -> WorkerRunResult:
        if item.kind != TARGET_PUBLISH_KIND or item.target_id is None or item.publication_id is None:
            # ``claim_target_publish`` makes this unreachable.  Do not try to
            # repair arbitrary rows here: a stale worker must not touch them.
            return WorkerRunResult(item.id, item.target_id, "ignored_invalid_claim")
        if item.lease_token is None:
            return WorkerRunResult(item.id, item.target_id, "ignored_missing_lease")
        token = item.lease_token

        claimed_target = self.store.get_target(item.target_id)
        # Capability probing is itself untrusted factory code.  Preserve the
        # dry-run invariant that no caller-supplied live-factory method is
        # touched before the deterministic adapter path.
        claimed_publication = self.store.get_publication(item.publication_id)
        resumable_session_supported = (
            claimed_target is not None
            and claimed_publication is not None
            and claimed_publication.execution_mode is not ExecutionMode.DRY_RUN
            and claimed_target.platform == "youtube"
            and self._factory_supports_resumable_session(claimed_target.platform)
        )
        target = self.store.start_target_publish(
            item.id,
            token,
            resumable_session_supported=resumable_session_supported,
            now=self.clock(),
        )
        if target is None:
            return WorkerRunResult(item.id, item.target_id, "skipped_stale_or_invalid")
        publication = self.store.get_publication(item.publication_id)
        if publication is None:
            # The fenced start method already verifies this before changing
            # target state.  Preserve safety if storage is externally damaged.
            return WorkerRunResult(item.id, target.id, "skipped_missing_publication")

        try:
            verified = verify_publish_inputs(publication)
            self._validate_target_metadata(target, verified.metadata)
        except PublishWorkerError as exc:
            failed = self.store.fail_target_publish(
                item.id,
                token,
                error_code="immutable_snapshot_invalid",
                error_detail=_safe_detail(exc),
                now=self.clock(),
            )
            outcome = "permanent_failure" if failed else "lost_lease_before_outcome"
            return WorkerRunResult(item.id, target.id, outcome, _safe_detail(exc))

        # Renew only after the expensive local verification and immediately
        # before provider construction/call.  A false result means no provider
        # object is created and no network-capable code is reached.
        if not self.store.renew_outbox_lease(
            item.id,
            token,
            lease_seconds=self.lease_seconds,
            now=self.clock(),
        ):
            return WorkerRunResult(item.id, target.id, "skipped_stale_lease")

        try:
            adapter = self._adapter_for(publication, target)
            # Factory construction can load credentials or block.  Re-fence
            # immediately after it returns and before invoking provider code.
            if not self.store.renew_outbox_lease(
                item.id,
                token,
                lease_seconds=self.lease_seconds,
                now=self.clock(),
            ):
                return WorkerRunResult(item.id, target.id, "skipped_stale_lease")
            # Rehash once more after potentially slow factory construction so
            # the adapter receives the immutable bytes/metadata just checked
            # immediately before its external call.
            verified = verify_publish_inputs(publication)
            self._validate_target_metadata(target, verified.metadata)
            checkpoint = self._checkpoint_for_target(publication, target)
            # The rehash above can itself block on storage.  Renew once more
            # after it and immediately before the provider side effect.
            if not self.store.renew_outbox_lease(
                item.id,
                token,
                lease_seconds=self.lease_seconds,
                now=self.clock(),
            ):
                return WorkerRunResult(item.id, target.id, "skipped_stale_lease")
            result = adapter.publish(
                PublishRequest(
                    publication_id=publication.id,
                    target_id=target.id,
                    platform=target.platform,
                    asset_path=verified.asset_path,
                    asset_sha256=publication.asset_sha256,
                    metadata=verified.metadata,
                    approval_fingerprint=publication.approval_fingerprint,
                    idempotency_key=item.dedupe_key,
                    existing_external_session_id=checkpoint.session_uri if checkpoint is not None else None,
                    resumable_checkpoint=checkpoint,
                    record_target_processing=lambda value: self.store.record_target_processing(
                        item.id,
                        token,
                        external_session_id=value.session_uri,
                        asset_sha256=value.asset_sha256,
                        approval_fingerprint=value.approval_fingerprint,
                        total_bytes=value.total_bytes,
                        mime_type=value.mime_type,
                        offset=value.offset,
                        phase=value.phase,
                        now=self.clock(),
                    ),
                    record_target_progress=lambda offset, phase: self.store.record_target_progress(
                        item.id,
                        token,
                        offset=offset,
                        phase=phase,
                        now=self.clock(),
                    ),
                    heartbeat=lambda: self.store.renew_outbox_lease(
                        item.id,
                        token,
                        lease_seconds=self.lease_seconds,
                        now=self.clock(),
                    ),
                    cancellation_requested=lambda: (
                        (current := self.store.get_target(target.id)) is None
                        or current.state is TargetState.CANCELLED
                    ),
                    lease_seconds=self.lease_seconds,
                )
            )
            self._validate_result(result)
        except PublishWorkerError as exc:
            failed = self.store.fail_target_publish(
                item.id,
                token,
                error_code="immutable_snapshot_invalid",
                error_detail=_safe_detail(exc),
                now=self.clock(),
            )
            outcome = "permanent_failure" if failed else "lost_lease_before_outcome"
            return WorkerRunResult(item.id, target.id, outcome, _safe_detail(exc))
        except RetryablePublishError as exc:
            return self._handle_retryable(item, target, token, exc)
        except PermanentPublishError as exc:
            detail = _safe_detail(
                exc,
                sensitive_values=(target.external_session_id, exc.external_session_id),
            )
            failed = self.store.fail_target_publish(
                item.id,
                token,
                error_code=exc.code,
                error_detail=detail,
                external_session_id=exc.external_session_id,
                now=self.clock(),
            )
            outcome = "permanent_failure" if failed else "lost_lease_before_outcome"
            return WorkerRunResult(item.id, target.id, outcome, exc.code)
        except AmbiguousPublishError as exc:
            detail = _safe_detail(
                exc,
                sensitive_values=(target.external_session_id, exc.external_session_id),
            )
            failed = self.store.fail_target_publish(
                item.id,
                token,
                error_code=exc.code,
                error_detail=detail,
                ambiguous=True,
                external_session_id=exc.external_session_id,
                external_media_id=exc.external_media_id,
                external_url=exc.external_url,
                now=self.clock(),
            )
            outcome = "reconciliation_required" if failed else "lost_lease_after_adapter"
            return WorkerRunResult(item.id, target.id, outcome, exc.code)
        except Exception as exc:  # Unknown transport outcome is never retried blindly.
            detail = _safe_detail(exc)
            failed = self.store.fail_target_publish(
                item.id,
                token,
                error_code="unexpected_adapter_outcome",
                error_detail=detail,
                ambiguous=True,
                now=self.clock(),
            )
            outcome = "reconciliation_required" if failed else "lost_lease_after_adapter"
            return WorkerRunResult(item.id, target.id, outcome, detail)

        completed = self.store.complete_target_publish(
            item.id,
            token,
            external_media_id=result.external_media_id,
            external_url=result.external_url,
            external_session_id=result.external_session_id,
            now=self.clock(),
        )
        if not completed:
            # We cannot safely mutate a target after losing its fence.  A live
            # reclaimed in-flight job is conservatively reconciled by the
            # store before another adapter call; dry-run is deterministic.
            return WorkerRunResult(item.id, target.id, "lost_lease_after_adapter")
        return WorkerRunResult(item.id, target.id, "published", result.external_media_id)

    def _handle_retryable(
        self,
        item: OutboxItem,
        target: PublicationTarget,
        token: str,
        exc: RetryablePublishError,
    ) -> WorkerRunResult:
        detail = _safe_detail(
            exc,
            sensitive_values=(target.external_session_id, exc.external_session_id),
        )
        if item.attempts >= self.max_attempts:
            # A retryable response from a fenced resumable session still
            # leaves the provider-side outcome unresolved.  Exhausting local
            # retries must not erase that capability and initiate a second
            # upload; hand it to explicit reconciliation instead.
            requires_reconciliation = (
                target.resumable_session_verified or exc.external_session_id is not None
            )
            failed = self.store.fail_target_publish(
                item.id,
                token,
                error_code="retry_attempts_exhausted",
                error_detail=f"{exc.code}: {detail}",
                ambiguous=requires_reconciliation,
                external_session_id=exc.external_session_id,
                now=self.clock(),
            )
            if failed and requires_reconciliation:
                outcome = "reconciliation_required"
            else:
                outcome = "permanent_failure" if failed else "lost_lease_before_outcome"
            return WorkerRunResult(item.id, target.id, outcome, "retry_attempts_exhausted")
        now = self.clock()
        delay = max(self.backoff_seconds(item.attempts), exc.retry_after_seconds or 0)
        available_at = _future_timestamp(now, delay)
        rescheduled = self.store.reschedule_target_publish(
            item.id,
            token,
            available_at=available_at,
            error_code=exc.code,
            error_detail=detail,
            now=now,
        )
        outcome = "retry_wait" if rescheduled else "lost_lease_before_outcome"
        return WorkerRunResult(item.id, target.id, outcome, available_at)

    def _adapter_for(self, publication: Publication, target: PublicationTarget):
        # This branch deliberately precedes factory access.  The dry-run path
        # must stay network-zero even if a caller supplied a network-like
        # factory that would initiate work during construction.
        if publication.execution_mode is ExecutionMode.DRY_RUN:
            return DryRunAdapter(target.platform)
        if self.adapter_factory is None:
            raise PermanentPublishError(
                "live_adapter_unavailable",
                f"no live adapter is configured for {target.platform}",
            )
        return self.adapter_factory(target.platform)

    def _factory_supports_resumable_session(self, platform: str) -> bool:
        """Ask an optional factory capability without weakening other targets."""
        if self.adapter_factory is None:
            return False
        capability = getattr(self.adapter_factory, "supports_resumable_session", None)
        if not callable(capability):
            return False
        try:
            return capability(platform) is True
        except Exception:
            # Capability discovery must fail closed and must never build an
            # adapter or start a network effect.
            return False

    @staticmethod
    def _checkpoint_for_target(
        publication: Publication,
        target: PublicationTarget,
    ) -> ResumableSessionCheckpoint | None:
        if not target.resumable_session_verified:
            return None
        if target.platform != "youtube":
            raise AmbiguousPublishError(
                "invalid_resumable_checkpoint",
                "resumable upload checkpoints are supported only for YouTube targets",
                external_session_id=target.external_session_id,
            )
        valid = (
            isinstance(target.external_session_id, str)
            and bool(target.external_session_id)
            and target.resumable_asset_sha256 == publication.asset_sha256
            and target.resumable_approval_fingerprint == publication.approval_fingerprint
            and isinstance(target.resumable_total_bytes, int)
            and not isinstance(target.resumable_total_bytes, bool)
            and target.resumable_total_bytes > 0
            and isinstance(target.resumable_mime_type, str)
            and bool(target.resumable_mime_type)
            and isinstance(target.resumable_offset, int)
            and not isinstance(target.resumable_offset, bool)
            and 0 <= target.resumable_offset <= target.resumable_total_bytes
            and target.resumable_phase in {
                "session_recorded",
                "uploading",
                "resuming",
                "final_chunk_inflight",
            }
        )
        if not valid:
            raise AmbiguousPublishError(
                "invalid_resumable_checkpoint",
                "stored resumable upload checkpoint is incomplete or does not match approved inputs",
                external_session_id=target.external_session_id,
            )
        return ResumableSessionCheckpoint(
            session_uri=target.external_session_id,
            asset_sha256=target.resumable_asset_sha256,
            approval_fingerprint=target.resumable_approval_fingerprint,
            total_bytes=target.resumable_total_bytes,
            mime_type=target.resumable_mime_type,
            offset=target.resumable_offset,
            phase=target.resumable_phase,
        )

    @staticmethod
    def _validate_target_metadata(target: PublicationTarget, metadata: Mapping[str, Any]) -> None:
        targets = metadata.get("targets")
        if not isinstance(targets, Mapping) or not isinstance(targets.get(target.platform), Mapping):
            raise PublishWorkerError("verified metadata no longer contains the selected target")

    @staticmethod
    def _validate_result(result: object) -> None:
        if not isinstance(result, PublishResult):
            raise AmbiguousPublishError(
                "invalid_adapter_result",
                "provider call returned an invalid publish result",
            )
        if not isinstance(result.external_media_id, str) or not result.external_media_id.strip():
            raise AmbiguousPublishError(
                "invalid_adapter_result",
                "provider call returned no external_media_id",
            )
        if not isinstance(result.external_url, str) or not result.external_url.strip():
            raise AmbiguousPublishError(
                "invalid_adapter_result",
                "provider call returned no external_url",
            )
        if result.external_session_id is not None and (
            not isinstance(result.external_session_id, str) or not result.external_session_id.strip()
        ):
            raise AmbiguousPublishError(
                "invalid_adapter_result",
                "provider call returned an invalid external_session_id",
            )
