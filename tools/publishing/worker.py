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
    InstagramPublishCheckpoint,
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
        instagram_checkpoint_supported = (
            claimed_target is not None and claimed_publication is not None
            and claimed_publication.execution_mode is not ExecutionMode.DRY_RUN
            and claimed_target.platform == "instagram"
            and self._factory_supports_instagram_checkpoint(claimed_target.platform)
        )
        target = self.store.start_target_publish(
            item.id,
            token,
            resumable_session_supported=resumable_session_supported,
            instagram_checkpoint_supported=instagram_checkpoint_supported,
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

        publish_request: PublishRequest | None = None
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
            instagram_checkpoint = self._instagram_checkpoint_for_target(publication, target)
            # The rehash above can itself block on storage.  Renew once more
            # after it and immediately before the provider side effect.
            if not self.store.renew_outbox_lease(
                item.id,
                token,
                lease_seconds=self.lease_seconds,
                now=self.clock(),
            ):
                return WorkerRunResult(item.id, target.id, "skipped_stale_lease")
            publish_request = PublishRequest(
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
                record_instagram_checkpoint=lambda value: self.store.record_instagram_checkpoint(
                    item.id, token, object_key=value.object_key, container_id=value.container_id,
                    asset_sha256=value.asset_sha256, approval_fingerprint=value.approval_fingerprint,
                    total_bytes=value.total_bytes, mime_type=value.mime_type, phase=value.phase,
                    signed_url_expires_at=value.signed_url_expires_at, now=self.clock(),
                ) if target.platform == "instagram" and publication.execution_mode is not ExecutionMode.DRY_RUN else False,
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
            if target.platform == "youtube":
                # The shared PublishRequest is frozen and intentionally has
                # no provider-specific processing fields.  Keep that public
                # contract unchanged; these private, request-scoped hooks
                # carry only the YouTube state needed by this worker bridge.
                forwarded_diagnostics: list[int] = []

                def record_youtube_diagnostic(value: Mapping[str, object]) -> bool:
                    recorded = self._record_youtube_transport_diagnostic(item, token, value)
                    if recorded:
                        forwarded_diagnostics.append(id(value))
                    return recorded

                object.__setattr__(
                    publish_request,
                    "_record_youtube_transport_diagnostic",
                    record_youtube_diagnostic,
                )
                object.__setattr__(publish_request, "_youtube_forwarded_diagnostics", forwarded_diagnostics)
                if target.external_media_id is not None:
                    object.__setattr__(
                        publish_request,
                        "_youtube_existing_external_media_id",
                        target.external_media_id,
                    )
                    object.__setattr__(
                        publish_request,
                        "_youtube_processing_started_at",
                        self._youtube_processing_started_at(publication, target),
                    )
                object.__setattr__(publish_request, "_youtube_now", self.clock())
            result = adapter.publish(publish_request)
            self._validate_result(result)
            self._persist_unforwarded_youtube_diagnostics(item, token, publish_request, result)
            if target.platform == "youtube" and getattr(result, "processing_status", None) == "processing":
                self._validate_processing_result(result)
                if not self._schedule_youtube_processing(item, token, target, result):
                    return WorkerRunResult(item.id, target.id, "lost_lease_after_adapter")
                return WorkerRunResult(item.id, target.id, "processing", result.external_media_id)
        except PublishWorkerError as exc:
            self._persist_unforwarded_youtube_diagnostics(item, token, publish_request, exc)
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
            self._persist_unforwarded_youtube_diagnostics(item, token, publish_request, exc)
            return self._handle_retryable(item, target, token, exc)
        except PermanentPublishError as exc:
            self._persist_unforwarded_youtube_diagnostics(item, token, publish_request, exc)
            self._record_youtube_processing_event(item, token, exc)
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
                external_media_id=exc.external_media_id,
                external_url=exc.external_url,
                now=self.clock(),
            )
            outcome = "permanent_failure" if failed else "lost_lease_before_outcome"
            return WorkerRunResult(item.id, target.id, outcome, exc.code)
        except AmbiguousPublishError as exc:
            self._persist_unforwarded_youtube_diagnostics(item, token, publish_request, exc)
            self._record_youtube_processing_event(item, token, exc)
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
            self._persist_unforwarded_youtube_diagnostics(item, token, publish_request, exc)
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
            current_target = self.store.get_target(target.id)
            requires_reconciliation = (
                target.resumable_session_verified
                or (current_target is not None and current_target.instagram_checkpoint_verified)
                or exc.external_session_id is not None
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

    def _record_youtube_transport_diagnostic(
        self,
        item: OutboxItem,
        token: str,
        diagnostic: Mapping[str, object],
    ) -> bool:
        """Append one sanitized adapter diagnostic while the publish fence is live."""
        allowed_stages = {
            "upload_chunk",
            "final_chunk_upload",
            "resumable_status_probe",
            "processing_status_poll",
        }
        exception_class = diagnostic.get("exception_class")
        stage = diagnostic.get("stage")
        elapsed = diagnostic.get("elapsed_seconds")
        attempt = diagnostic.get("attempt")
        http_status = diagnostic.get("http_status")
        session_fingerprint = diagnostic.get("session_fingerprint")
        if (
            not isinstance(exception_class, str)
            or not re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", exception_class)
            or not isinstance(stage, str)
            or stage not in allowed_stages
            or isinstance(elapsed, bool)
            or not isinstance(elapsed, (int, float))
            or elapsed < 0
            or isinstance(attempt, bool)
            or not isinstance(attempt, int)
            or attempt < 1
            or (http_status is not None and (isinstance(http_status, bool) or not isinstance(http_status, int)))
            or (
                session_fingerprint is not None
                and (
                    not isinstance(session_fingerprint, str)
                    or not re.fullmatch(r"[0-9a-f]{16}", session_fingerprint)
                )
            )
        ):
            return False
        data = {
            "platform": "youtube",
            "target_id": item.target_id,
            "exception_class": exception_class,
            "stage": stage,
            "elapsed_seconds": round(float(elapsed), 6),
            "http_status": http_status,
            "attempt": attempt,
            "session_fingerprint": session_fingerprint,
        }
        try:
            with self.store._write_transaction() as conn:
                context, reason = self.store._leased_target_publish_context_txn(
                    conn, item.id, token, self.clock()
                )
                if context is None or reason is not None:
                    return False
                _outbox, publication, target = context
                assert publication is not None and target is not None
                self.store._append_event_txn(
                    conn,
                    publication.id,
                    "youtube_transport_error",
                    actor_type="worker",
                    data=data,
                    now=self.clock(),
                )
                return True
        except Exception:
            return False

    def _persist_unforwarded_youtube_diagnostics(
        self,
        item: OutboxItem,
        token: str,
        request: PublishRequest | None,
        value: BaseException | PublishResult,
    ) -> None:
        if request is None:
            return
        diagnostics = getattr(value, "transport_diagnostics", ())
        if not isinstance(diagnostics, (tuple, list)):
            return
        forwarded = set(getattr(request, "_youtube_forwarded_diagnostics", ()))
        for diagnostic in diagnostics:
            if not isinstance(diagnostic, Mapping) or id(diagnostic) in forwarded:
                continue
            self._record_youtube_transport_diagnostic(
                item,
                token,
                diagnostic,
            )

    @staticmethod
    def _canonical_processing_timestamp(value: object) -> str | None:
        if not isinstance(value, str):
            return None
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            return None
        return parsed.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")

    def _youtube_processing_started_at(
        self,
        publication: Publication,
        target: PublicationTarget,
    ) -> str:
        if target.external_media_id is not None:
            try:
                events = self.store.list_events(publication.id)
            except Exception:
                events = []
            for event in reversed(events):
                data = event.get("data")
                if (
                    event.get("event_type") == "youtube_processing_poll_scheduled"
                    and isinstance(data, Mapping)
                    and data.get("target_id") == target.id
                    and data.get("video_id") == target.external_media_id
                ):
                    started = self._canonical_processing_timestamp(data.get("processing_started_at"))
                    if started is not None:
                        return started
        return self._canonical_processing_timestamp(target.updated_at) or self.clock()

    @staticmethod
    def _validate_processing_result(result: PublishResult) -> None:
        started_at = PublishWorker._canonical_processing_timestamp(
            getattr(result, "processing_started_at", None)
        )
        age_seconds = getattr(result, "processing_age_seconds", None)
        next_poll = getattr(result, "next_poll_after_seconds", None)
        if (
            started_at is None
            or isinstance(age_seconds, bool)
            or not isinstance(age_seconds, int)
            or age_seconds < 0
            or isinstance(next_poll, bool)
            or not isinstance(next_poll, int)
            or next_poll < 1
        ):
            raise AmbiguousPublishError(
                "youtube_processing_result_invalid",
                "YouTube adapter returned an invalid processing checkpoint",
                external_media_id=result.external_media_id,
                external_url=result.external_url,
            )

    def _schedule_youtube_processing(
        self,
        item: OutboxItem,
        token: str,
        claimed_target: PublicationTarget,
        result: PublishResult,
    ) -> bool:
        now = self.clock()
        next_poll = int(getattr(result, "next_poll_after_seconds"))
        available_at = _future_timestamp(now, next_poll)
        started_at = self._canonical_processing_timestamp(getattr(result, "processing_started_at", None))
        assert started_at is not None
        age_seconds = int(getattr(result, "processing_age_seconds"))
        poll_error_code = getattr(result, "poll_error_code", None)
        if poll_error_code is not None and (
            not isinstance(poll_error_code, str) or not re.fullmatch(r"[a-z0-9_.-]{1,100}", poll_error_code)
        ):
            poll_error_code = "youtube_processing_poll_unavailable"
        pending_error = poll_error_code or "youtube_processing_pending"
        try:
            with self.store._write_transaction() as conn:
                context, reason = self.store._leased_target_publish_context_txn(conn, item.id, token, now)
                if context is None or reason is not None:
                    return False
                outbox, publication, target = context
                assert outbox is not None and publication is not None and target is not None
                if target.platform != "youtube" or target.state not in {
                    TargetState.UPLOADING,
                    TargetState.PROCESSING,
                }:
                    return False
                if target.external_media_id is not None and target.external_media_id != result.external_media_id:
                    raise AmbiguousPublishError(
                        "youtube_processing_reference_conflict",
                        "YouTube processing returned a different video for the same target",
                        external_media_id=result.external_media_id,
                        external_url=result.external_url,
                    )
                if (
                    target.resumable_session_verified
                    and result.external_session_id is not None
                    and result.external_session_id != target.external_session_id
                ):
                    raise AmbiguousPublishError(
                        "youtube_processing_session_conflict",
                        "YouTube processing result does not match the durable upload session",
                        external_session_id=result.external_session_id,
                        external_media_id=result.external_media_id,
                        external_url=result.external_url,
                    )
                conn.execute(
                    """
                    UPDATE publication_targets
                    SET state = ?, next_attempt_at = ?, external_media_id = ?, external_url = ?,
                        last_error_code = ?, last_error_detail = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        TargetState.PROCESSING.value,
                        available_at,
                        result.external_media_id,
                        result.external_url,
                        poll_error_code,
                        "YouTube processing poll will be retried" if poll_error_code else None,
                        now,
                        target.id,
                    ),
                )
                if not self.store._reschedule_outbox_txn(
                    conn, outbox.id, token, available_at, pending_error, now
                ):
                    return False
                event_id = self.store._append_event_txn(
                    conn,
                    publication.id,
                    "youtube_processing_poll_scheduled",
                    actor_type="worker",
                    data={
                        "platform": "youtube",
                        "target_id": target.id,
                        "video_id": result.external_media_id,
                        "processing_status": "processing",
                        "processing_started_at": started_at,
                        "processing_age_seconds": age_seconds,
                        "next_attempt_at": available_at,
                        "poll_error_code": poll_error_code,
                    },
                    now=now,
                )
                self.store._refresh_publication_state_txn(conn, publication.id, now)
                self.store._enqueue_status_update_txn(conn, publication.id, event_id, now)
                return True
        except AmbiguousPublishError:
            raise
        except Exception:
            return False

    def _record_youtube_processing_event(
        self,
        item: OutboxItem,
        token: str,
        error: BaseException,
    ) -> bool:
        raw = getattr(error, "youtube_processing_event", None)
        if not isinstance(raw, Mapping):
            return True
        event_type = raw.get("event_type")
        video_id = raw.get("video_id")
        age_seconds = raw.get("processing_age_seconds")
        started_at = self._canonical_processing_timestamp(raw.get("processing_started_at"))
        if (
            not isinstance(event_type, str)
            or not re.fullmatch(r"youtube_processing_[a-z0-9_]+", event_type)
            or not isinstance(video_id, str)
            or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", video_id)
            or isinstance(age_seconds, bool)
            or not isinstance(age_seconds, int)
            or age_seconds < 0
            or started_at is None
        ):
            return False
        data: dict[str, object] = {
            "platform": "youtube",
            "target_id": item.target_id,
            "video_id": video_id,
            "processing_started_at": started_at,
            "processing_age_seconds": age_seconds,
        }
        reason = raw.get("reason")
        if isinstance(reason, str) and reason:
            data["reason"] = re.sub(r"[^A-Za-z0-9_.-]", "_", reason)[:120]
        try:
            with self.store._write_transaction() as conn:
                context, context_reason = self.store._leased_target_publish_context_txn(
                    conn, item.id, token, self.clock()
                )
                if context is None or context_reason is not None:
                    return False
                _outbox, publication, _target = context
                assert publication is not None
                self.store._append_event_txn(
                    conn,
                    publication.id,
                    event_type,
                    actor_type="worker",
                    data=data,
                    now=self.clock(),
                )
                return True
        except Exception:
            return False

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

    def _factory_supports_instagram_checkpoint(self, platform: str) -> bool:
        if self.adapter_factory is None:
            return False
        capability = getattr(self.adapter_factory, "supports_instagram_checkpoint", None)
        if not callable(capability):
            return False
        try:
            return capability(platform) is True
        except Exception:
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
    def _instagram_checkpoint_for_target(publication: Publication, target: PublicationTarget) -> InstagramPublishCheckpoint | None:
        if not target.instagram_checkpoint_verified:
            return None
        if target.platform != "instagram":
            raise AmbiguousPublishError("invalid_instagram_checkpoint", "Instagram checkpoint belongs to a non-Instagram target")
        valid = (
            bool(target.instagram_object_key)
            and target.instagram_asset_sha256 == publication.asset_sha256
            and target.instagram_approval_fingerprint == publication.approval_fingerprint
            and isinstance(target.instagram_total_bytes, int) and not isinstance(target.instagram_total_bytes, bool)
            and target.instagram_total_bytes > 0 and isinstance(target.instagram_mime_type, str)
            and target.instagram_mime_type.startswith("video/")
            and target.instagram_phase in {"object_uploaded", "container_create_inflight", "container_created", "processing", "publish_inflight"}
            and isinstance(target.instagram_signed_url_expires_at, str)
        )
        if not valid:
            raise AmbiguousPublishError("invalid_instagram_checkpoint", "stored Instagram checkpoint is incomplete or does not match approved inputs")
        return InstagramPublishCheckpoint(
            object_key=target.instagram_object_key, container_id=target.instagram_container_id,
            asset_sha256=target.instagram_asset_sha256, approval_fingerprint=target.instagram_approval_fingerprint,
            total_bytes=target.instagram_total_bytes, mime_type=target.instagram_mime_type,
            phase=target.instagram_phase, signed_url_expires_at=target.instagram_signed_url_expires_at,
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
