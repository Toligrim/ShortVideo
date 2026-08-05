"""Durable SQLite state for approval-gated publication.

This module intentionally has no network or Telegram dependencies.  Every
external effect in later stages is represented by an idempotent outbox row
created in the same transaction as its local state transition.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
import secrets
import sqlite3
from typing import Any, Iterable, Iterator, Mapping
import uuid

from .models import (
    ActionResult,
    ExecutionMode,
    OutboxItem,
    OutboxState,
    PLATFORMS,
    Publication,
    PublicationState,
    PublicationTarget,
    TargetState,
    TelegramAction,
    TelegramActionKind,
)


class StoreError(RuntimeError):
    """A durable-store invariant was violated."""


class InvalidTransition(StoreError):
    """A caller attempted an impossible publication or target transition."""


HEX_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
APPROVAL_FINGERPRINT_DOMAIN = b"shortvideo-publication-approval-v1\0"


MIGRATIONS: tuple[tuple[int, tuple[str, ...]], ...] = (
    (
        1,
        (
            """
            CREATE TABLE publications (
                id TEXT PRIMARY KEY,
                slug TEXT NOT NULL,
                state TEXT NOT NULL CHECK (state IN (
                    'review_pending', 'approved', 'rejected', 'publishing',
                    'published', 'partial', 'failed'
                )),
                execution_mode TEXT NOT NULL CHECK (execution_mode IN ('dry-run', 'live')),
                source_path TEXT NOT NULL,
                source_sha256 TEXT NOT NULL CHECK (length(source_sha256) = 64),
                asset_path TEXT NOT NULL,
                asset_sha256 TEXT NOT NULL CHECK (length(asset_sha256) = 64),
                metadata_path TEXT NOT NULL,
                metadata_sha256 TEXT NOT NULL CHECK (length(metadata_sha256) = 64),
                approval_fingerprint TEXT NOT NULL UNIQUE CHECK (length(approval_fingerprint) = 64),
                review_video_message_id INTEGER,
                review_card_message_id INTEGER,
                approved_at TEXT,
                approved_by_user_id TEXT,
                rejected_at TEXT,
                rejected_by_user_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
            "CREATE INDEX publications_slug_created_idx ON publications(slug, created_at DESC)",
            """
            CREATE TABLE publication_targets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE RESTRICT,
                platform TEXT NOT NULL CHECK (platform IN ('youtube', 'instagram')),
                state TEXT NOT NULL CHECK (state IN (
                    'queued', 'uploading', 'processing', 'retry_wait', 'published',
                    'failed', 'reconciliation_required', 'cancelled'
                )),
                attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
                next_attempt_at TEXT,
                external_session_id TEXT,
                external_media_id TEXT,
                external_url TEXT,
                last_error_code TEXT,
                last_error_detail TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                published_at TEXT,
                UNIQUE(publication_id, platform)
            )
            """,
            "CREATE INDEX publication_targets_publication_idx ON publication_targets(publication_id, id)",
            "CREATE INDEX publication_targets_state_idx ON publication_targets(state, next_attempt_at)",
            """
            CREATE TABLE outbox (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                dedupe_key TEXT NOT NULL UNIQUE,
                publication_id TEXT REFERENCES publications(id) ON DELETE RESTRICT,
                target_id INTEGER REFERENCES publication_targets(id) ON DELETE RESTRICT,
                payload_json TEXT NOT NULL,
                state TEXT NOT NULL CHECK (state IN ('pending', 'leased', 'completed', 'dead')),
                attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
                available_at TEXT NOT NULL,
                lease_owner TEXT,
                lease_token TEXT,
                lease_expires_at TEXT,
                last_error TEXT,
                created_at TEXT NOT NULL,
                completed_at TEXT
            )
            """,
            "CREATE INDEX outbox_available_idx ON outbox(state, available_at, id)",
            "CREATE INDEX outbox_lease_idx ON outbox(state, lease_expires_at, id)",
            """
            CREATE TABLE publication_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE RESTRICT,
                event_type TEXT NOT NULL,
                actor_type TEXT NOT NULL,
                actor_id TEXT,
                data_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """,
            "CREATE INDEX publication_events_publication_idx ON publication_events(publication_id, id)",
            """
            CREATE TABLE telegram_updates (
                update_id INTEGER PRIMARY KEY,
                action_token TEXT,
                result_json TEXT NOT NULL,
                received_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE telegram_actions (
                token TEXT PRIMARY KEY,
                publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE RESTRICT,
                target_id INTEGER REFERENCES publication_targets(id) ON DELETE RESTRICT,
                kind TEXT NOT NULL CHECK (kind IN ('approve', 'reject', 'retry')),
                created_at TEXT NOT NULL,
                consumed_at TEXT
            )
            """,
            """
            CREATE UNIQUE INDEX telegram_actions_publication_kind_unique
            ON telegram_actions(publication_id, kind)
            WHERE target_id IS NULL
            """,
            """
            CREATE UNIQUE INDEX telegram_actions_target_kind_unique
            ON telegram_actions(publication_id, target_id, kind)
            WHERE target_id IS NOT NULL
            """,
            """
            CREATE TABLE bot_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
        ),
    ),
)


TARGET_TRANSITIONS: dict[TargetState, frozenset[TargetState]] = {
    TargetState.QUEUED: frozenset({TargetState.UPLOADING, TargetState.CANCELLED}),
    TargetState.UPLOADING: frozenset(
        {
            TargetState.PROCESSING,
            TargetState.RETRY_WAIT,
            TargetState.FAILED,
            TargetState.RECONCILIATION_REQUIRED,
        }
    ),
    TargetState.PROCESSING: frozenset(
        {
            TargetState.PUBLISHED,
            TargetState.RETRY_WAIT,
            TargetState.FAILED,
            TargetState.RECONCILIATION_REQUIRED,
        }
    ),
    TargetState.RETRY_WAIT: frozenset({TargetState.QUEUED, TargetState.FAILED, TargetState.CANCELLED}),
    TargetState.PUBLISHED: frozenset(),
    TargetState.FAILED: frozenset(),
    TargetState.RECONCILIATION_REQUIRED: frozenset(),
    TargetState.CANCELLED: frozenset(),
}


_UNSET = object()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _future_timestamp(now: str, seconds: int) -> str:
    if seconds <= 0:
        raise StoreError("lease duration must be positive")
    try:
        parsed = datetime.fromisoformat(now.replace("Z", "+00:00"))
    except ValueError as exc:
        raise StoreError(f"invalid UTC timestamp: {now!r}") from exc
    return (parsed + timedelta(seconds=seconds)).isoformat(timespec="microseconds").replace("+00:00", "Z")


def approval_fingerprint(
    asset_sha256: str,
    metadata_sha256: str,
    execution_mode: ExecutionMode | str,
) -> str:
    """Hash every immutable input that determines what approval permits."""
    _require_sha256(asset_sha256, "asset_sha256")
    _require_sha256(metadata_sha256, "metadata_sha256")
    try:
        mode = ExecutionMode(execution_mode)
    except ValueError as exc:
        raise StoreError(f"invalid execution mode: {execution_mode!r}") from exc
    payload = (
        APPROVAL_FINGERPRINT_DOMAIN
        + asset_sha256.encode("ascii")
        + b"\0"
        + metadata_sha256.encode("ascii")
        + b"\0"
        + mode.value.encode("ascii")
    )
    return sha256(payload).hexdigest()


def _require_sha256(value: str, label: str) -> None:
    if not isinstance(value, str) or not HEX_SHA256_RE.fullmatch(value):
        raise StoreError(f"{label} must be a lowercase SHA-256 hex digest")


def _json(value: Mapping[str, Any] | None) -> str:
    if value is None:
        value = {}
    if not isinstance(value, Mapping):
        raise StoreError("outbox/event data must be an object")
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise StoreError(f"data cannot be serialized as canonical JSON: {exc}") from exc


def _decode_object(raw: str) -> dict[str, Any]:
    value = json.loads(raw)
    if not isinstance(value, dict):  # A corrupt DB should fail loudly, not make an unsafe task.
        raise StoreError("stored JSON is not an object")
    return value


def _publication_from_row(row: sqlite3.Row) -> Publication:
    return Publication(
        id=row["id"],
        slug=row["slug"],
        state=PublicationState(row["state"]),
        execution_mode=ExecutionMode(row["execution_mode"]),
        source_path=row["source_path"],
        source_sha256=row["source_sha256"],
        asset_path=row["asset_path"],
        asset_sha256=row["asset_sha256"],
        metadata_path=row["metadata_path"],
        metadata_sha256=row["metadata_sha256"],
        approval_fingerprint=row["approval_fingerprint"],
        review_video_message_id=row["review_video_message_id"],
        review_card_message_id=row["review_card_message_id"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        approved_at=row["approved_at"],
        approved_by_user_id=row["approved_by_user_id"],
        rejected_at=row["rejected_at"],
        rejected_by_user_id=row["rejected_by_user_id"],
    )


def _target_from_row(row: sqlite3.Row) -> PublicationTarget:
    return PublicationTarget(
        id=row["id"],
        publication_id=row["publication_id"],
        platform=row["platform"],
        state=TargetState(row["state"]),
        attempts=row["attempts"],
        next_attempt_at=row["next_attempt_at"],
        external_session_id=row["external_session_id"],
        external_media_id=row["external_media_id"],
        external_url=row["external_url"],
        last_error_code=row["last_error_code"],
        last_error_detail=row["last_error_detail"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        published_at=row["published_at"],
    )


def _outbox_from_row(row: sqlite3.Row) -> OutboxItem:
    return OutboxItem(
        id=row["id"],
        kind=row["kind"],
        dedupe_key=row["dedupe_key"],
        publication_id=row["publication_id"],
        target_id=row["target_id"],
        payload=_decode_object(row["payload_json"]),
        state=OutboxState(row["state"]),
        attempts=row["attempts"],
        available_at=row["available_at"],
        lease_owner=row["lease_owner"],
        lease_token=row["lease_token"],
        lease_expires_at=row["lease_expires_at"],
        last_error=row["last_error"],
        created_at=row["created_at"],
        completed_at=row["completed_at"],
    )


class PublishingStore:
    """SQLite-backed publication state machine and durable outbox."""

    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.migrate()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, isolation_level=None, timeout=5.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 5000")
        conn.execute("PRAGMA journal_mode = WAL")
        return conn

    @contextmanager
    def _write_transaction(self) -> Iterator[sqlite3.Connection]:
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()

    def migrate(self) -> None:
        with self._write_transaction() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at TEXT NOT NULL
                )
                """
            )
            applied = {
                row["version"]
                for row in conn.execute("SELECT version FROM schema_migrations")
            }
            for version, statements in MIGRATIONS:
                if version in applied:
                    continue
                for statement in statements:
                    conn.execute(statement)
                conn.execute(
                    "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
                    (version, _utc_now()),
                )

    def schema_version(self) -> int:
        conn = self._connect()
        try:
            row = conn.execute("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").fetchone()
            return int(row["version"])
        finally:
            conn.close()

    def create_publication(
        self,
        *,
        slug: str,
        source_path: str,
        source_sha256: str,
        asset_path: str,
        asset_sha256: str,
        metadata_path: str,
        metadata_sha256: str,
        target_platforms: Iterable[str],
        execution_mode: ExecutionMode | str = ExecutionMode.DRY_RUN,
        publication_id: str | None = None,
    ) -> Publication:
        platforms = tuple(target_platforms)
        if not platforms:
            raise StoreError("at least one target platform is required")
        if len(set(platforms)) != len(platforms) or any(platform not in PLATFORMS for platform in platforms):
            raise StoreError("target platforms must be a unique subset of youtube, instagram")
        for label, digest in (
            ("source_sha256", source_sha256),
            ("asset_sha256", asset_sha256),
            ("metadata_sha256", metadata_sha256),
        ):
            _require_sha256(digest, label)
        try:
            mode = ExecutionMode(execution_mode)
        except ValueError as exc:
            raise StoreError(f"invalid execution mode: {execution_mode!r}") from exc
        publication_id = publication_id or uuid.uuid4().hex
        if not publication_id:
            raise StoreError("publication_id must not be empty")
        fingerprint = approval_fingerprint(asset_sha256, metadata_sha256, mode)
        now = _utc_now()
        with self._write_transaction() as conn:
            try:
                conn.execute(
                    """
                    INSERT INTO publications(
                        id, slug, state, execution_mode, source_path, source_sha256,
                        asset_path, asset_sha256, metadata_path, metadata_sha256,
                        approval_fingerprint, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        publication_id,
                        slug,
                        PublicationState.REVIEW_PENDING.value,
                        mode.value,
                        source_path,
                        source_sha256,
                        asset_path,
                        asset_sha256,
                        metadata_path,
                        metadata_sha256,
                        fingerprint,
                        now,
                        now,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                existing = conn.execute(
                    "SELECT * FROM publications WHERE approval_fingerprint = ?", (fingerprint,)
                ).fetchone()
                if existing is not None:
                    return _publication_from_row(existing)
                raise StoreError(f"cannot create publication {publication_id!r}: {exc}") from exc
            for platform in platforms:
                conn.execute(
                    """
                    INSERT INTO publication_targets(
                        publication_id, platform, state, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?)
                    """,
                    (publication_id, platform, TargetState.QUEUED.value, now, now),
                )
            self._append_event_txn(
                conn,
                publication_id,
                "publication.created",
                actor_type="system",
                data={"execution_mode": mode.value, "targets": list(platforms)},
                now=now,
            )
            self._enqueue_outbox_txn(
                conn,
                kind="telegram.review_card",
                dedupe_key=f"telegram-review-card:{publication_id}",
                publication_id=publication_id,
                payload={"publication_id": publication_id},
                now=now,
            )
            row = conn.execute("SELECT * FROM publications WHERE id = ?", (publication_id,)).fetchone()
            assert row is not None
            return _publication_from_row(row)

    def get_publication(self, publication_id: str) -> Publication | None:
        conn = self._connect()
        try:
            row = conn.execute("SELECT * FROM publications WHERE id = ?", (publication_id,)).fetchone()
            return _publication_from_row(row) if row is not None else None
        finally:
            conn.close()

    def list_publications(self, *, slug: str | None = None) -> list[Publication]:
        conn = self._connect()
        try:
            if slug is None:
                rows = conn.execute("SELECT * FROM publications ORDER BY created_at DESC, id DESC").fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM publications WHERE slug = ? ORDER BY created_at DESC, id DESC", (slug,)
                ).fetchall()
            return [_publication_from_row(row) for row in rows]
        finally:
            conn.close()

    def list_targets(self, publication_id: str) -> list[PublicationTarget]:
        conn = self._connect()
        try:
            rows = conn.execute(
                "SELECT * FROM publication_targets WHERE publication_id = ? ORDER BY id", (publication_id,)
            ).fetchall()
            return [_target_from_row(row) for row in rows]
        finally:
            conn.close()

    def list_pending_review_deliveries(self) -> list[Publication]:
        """Return review cards that still need Telegram delivery or completion.

        The durable outbox row is deliberately the selector: a video can have
        been sent and persisted while the following card send failed, so this
        list must include such partial deliveries until the card is recorded
        and the outbox item is completed.
        """
        conn = self._connect()
        try:
            rows = conn.execute(
                """
                SELECT publications.*
                FROM publications
                JOIN outbox ON outbox.publication_id = publications.id
                WHERE publications.state = ?
                  AND outbox.kind = ?
                  AND outbox.state = ?
                ORDER BY outbox.available_at, outbox.id
                """,
                (
                    PublicationState.REVIEW_PENDING.value,
                    "telegram.review_card",
                    OutboxState.PENDING.value,
                ),
            ).fetchall()
            return [_publication_from_row(row) for row in rows]
        finally:
            conn.close()

    def record_review_video_message(self, publication_id: str, message_id: int) -> int:
        """Persist the sent-video message ID before any follow-up API call."""
        return self._record_review_message(publication_id, "review_video_message_id", message_id)

    def record_review_card_message(self, publication_id: str, message_id: int) -> int:
        """Persist the approval-card message ID before completing its outbox item."""
        return self._record_review_message(publication_id, "review_card_message_id", message_id)

    def complete_review_delivery(self, publication_id: str) -> bool:
        """Mark the review delivery complete only after its card has a durable ID."""
        now = _utc_now()
        with self._write_transaction() as conn:
            publication = conn.execute(
                "SELECT review_card_message_id FROM publications WHERE id = ?", (publication_id,)
            ).fetchone()
            if publication is None:
                raise StoreError(f"unknown publication: {publication_id}")
            if publication["review_card_message_id"] is None:
                raise StoreError("cannot complete review delivery before its card message ID is recorded")
            changed = conn.execute(
                """
                UPDATE outbox
                SET state = ?, completed_at = ?, lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
                WHERE publication_id = ? AND kind = ? AND state = ?
                """,
                (
                    OutboxState.COMPLETED.value,
                    now,
                    publication_id,
                    "telegram.review_card",
                    OutboxState.PENDING.value,
                ),
            ).rowcount
            if changed:
                self._append_event_txn(
                    conn,
                    publication_id,
                    "telegram.review_card_delivered",
                    actor_type="telegram_bot",
                    data={"review_card_message_id": int(publication["review_card_message_id"])},
                    now=now,
                )
            return changed == 1

    def issue_telegram_action(
        self,
        publication_id: str,
        kind: TelegramActionKind | str,
        *,
        target_id: int | None = None,
        token: str | None = None,
    ) -> TelegramAction:
        try:
            action_kind = TelegramActionKind(kind)
        except ValueError as exc:
            raise StoreError(f"invalid Telegram action kind: {kind!r}") from exc
        now = _utc_now()
        with self._write_transaction() as conn:
            publication = conn.execute("SELECT id FROM publications WHERE id = ?", (publication_id,)).fetchone()
            if publication is None:
                raise StoreError(f"unknown publication: {publication_id}")
            if target_id is not None:
                target = conn.execute(
                    "SELECT id FROM publication_targets WHERE id = ? AND publication_id = ?",
                    (target_id, publication_id),
                ).fetchone()
                if target is None:
                    raise StoreError("Telegram action target does not belong to publication")
            existing = conn.execute(
                """
                SELECT * FROM telegram_actions
                WHERE publication_id = ? AND kind = ? AND target_id IS ?
                """,
                (publication_id, action_kind.value, target_id),
            ).fetchone()
            if existing is not None:
                return self._action_from_row(existing)
            generated_token = token or secrets.token_urlsafe(18)
            if not generated_token:
                raise StoreError("Telegram action token must not be empty")
            try:
                conn.execute(
                    """
                    INSERT INTO telegram_actions(token, publication_id, target_id, kind, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (generated_token, publication_id, target_id, action_kind.value, now),
                )
            except sqlite3.IntegrityError as exc:
                raise StoreError("Telegram action token already exists") from exc
            row = conn.execute("SELECT * FROM telegram_actions WHERE token = ?", (generated_token,)).fetchone()
            assert row is not None
            return self._action_from_row(row)

    def get_telegram_action(self, token: str) -> TelegramAction | None:
        """Look up an opaque callback token without changing publication state."""
        conn = self._connect()
        try:
            row = conn.execute("SELECT * FROM telegram_actions WHERE token = ?", (token,)).fetchone()
            return self._action_from_row(row) if row is not None else None
        finally:
            conn.close()

    def apply_telegram_action(
        self,
        *,
        update_id: int,
        action_token: str,
        actor_user_id: str | int,
    ) -> ActionResult:
        if not isinstance(update_id, int) or update_id < 0:
            raise StoreError("update_id must be a non-negative integer")
        actor = str(actor_user_id)
        if not actor:
            raise StoreError("actor_user_id must not be empty")
        now = _utc_now()
        with self._write_transaction() as conn:
            inserted = conn.execute(
                """
                INSERT INTO telegram_updates(update_id, action_token, result_json, received_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(update_id) DO NOTHING
                """,
                (update_id, action_token, _json({"status": "received"}), now),
            ).rowcount
            if inserted != 1:
                return ActionResult(False, True, None, "duplicate update")
            action_row = conn.execute(
                "SELECT * FROM telegram_actions WHERE token = ?", (action_token,)
            ).fetchone()
            if action_row is None:
                return self._finish_update_txn(conn, update_id, False, None, "unknown action")
            action = self._action_from_row(action_row)
            publication_row = conn.execute(
                "SELECT * FROM publications WHERE id = ?", (action.publication_id,)
            ).fetchone()
            assert publication_row is not None
            publication = _publication_from_row(publication_row)
            if action.consumed_at is not None:
                return self._finish_update_txn(
                    conn, update_id, False, publication.state, "action already consumed"
                )
            if publication.state is not PublicationState.REVIEW_PENDING:
                return self._finish_update_txn(conn, update_id, False, publication.state, "publication is not pending review")
            if action.kind is TelegramActionKind.APPROVE:
                conn.execute(
                    """
                    UPDATE publications
                    SET state = ?, approved_at = ?, approved_by_user_id = ?, updated_at = ?
                    WHERE id = ? AND state = ?
                    """,
                    (
                        PublicationState.APPROVED.value,
                        now,
                        actor,
                        now,
                        publication.id,
                        PublicationState.REVIEW_PENDING.value,
                    ),
                )
                targets = conn.execute(
                    "SELECT * FROM publication_targets WHERE publication_id = ? ORDER BY id", (publication.id,)
                ).fetchall()
                for target_row in targets:
                    target = _target_from_row(target_row)
                    self._enqueue_outbox_txn(
                        conn,
                        kind="target.publish",
                        dedupe_key=f"target-publish:{publication.id}:{target.platform}",
                        publication_id=publication.id,
                        target_id=target.id,
                        payload={"publication_id": publication.id, "target_id": target.id, "platform": target.platform},
                        now=now,
                    )
                event_type = "publication.approved"
                new_state = PublicationState.APPROVED
            elif action.kind is TelegramActionKind.REJECT:
                conn.execute(
                    """
                    UPDATE publications
                    SET state = ?, rejected_at = ?, rejected_by_user_id = ?, updated_at = ?
                    WHERE id = ? AND state = ?
                    """,
                    (
                        PublicationState.REJECTED.value,
                        now,
                        actor,
                        now,
                        publication.id,
                        PublicationState.REVIEW_PENDING.value,
                    ),
                )
                event_type = "publication.rejected"
                new_state = PublicationState.REJECTED
            else:
                return self._finish_update_txn(conn, update_id, False, publication.state, "retry is not implemented yet")
            conn.execute(
                "UPDATE telegram_actions SET consumed_at = ? WHERE publication_id = ? AND consumed_at IS NULL",
                (now, publication.id),
            )
            self._append_event_txn(
                conn,
                publication.id,
                event_type,
                actor_type="telegram_user",
                actor_id=actor,
                data={"action": action.kind.value},
                now=now,
            )
            return self._finish_update_txn(conn, update_id, True, new_state, None)

    def transition_target(
        self,
        target_id: int,
        new_state: TargetState | str,
        *,
        error_code: str | None = None,
        error_detail: str | None = None,
        next_attempt_at: str | None = None,
        increment_attempts: bool = False,
    ) -> PublicationTarget:
        try:
            desired = TargetState(new_state)
        except ValueError as exc:
            raise StoreError(f"invalid target state: {new_state!r}") from exc
        now = _utc_now()
        with self._write_transaction() as conn:
            row = conn.execute("SELECT * FROM publication_targets WHERE id = ?", (target_id,)).fetchone()
            if row is None:
                raise StoreError(f"unknown publication target: {target_id}")
            current = _target_from_row(row)
            if desired is current.state:
                return current
            if desired not in TARGET_TRANSITIONS[current.state]:
                raise InvalidTransition(f"cannot transition target {target_id} from {current.state} to {desired}")
            published_at = now if desired is TargetState.PUBLISHED else None
            conn.execute(
                """
                UPDATE publication_targets
                SET state = ?, next_attempt_at = ?, last_error_code = ?, last_error_detail = ?,
                    attempts = attempts + ?, updated_at = ?, published_at = COALESCE(?, published_at)
                WHERE id = ?
                """,
                (
                    desired.value,
                    next_attempt_at,
                    error_code,
                    error_detail,
                    int(increment_attempts),
                    now,
                    published_at,
                    target_id,
                ),
            )
            self._append_event_txn(
                conn,
                current.publication_id,
                "target.state_changed",
                actor_type="worker",
                data={"platform": current.platform, "from": current.state.value, "to": desired.value},
                now=now,
            )
            self._refresh_publication_state_txn(conn, current.publication_id, now)
            updated = conn.execute("SELECT * FROM publication_targets WHERE id = ?", (target_id,)).fetchone()
            assert updated is not None
            return _target_from_row(updated)

    def enqueue_outbox(
        self,
        *,
        kind: str,
        dedupe_key: str,
        publication_id: str | None = None,
        target_id: int | None = None,
        payload: Mapping[str, Any] | None = None,
        available_at: str | None = None,
    ) -> OutboxItem:
        now = _utc_now()
        with self._write_transaction() as conn:
            return self._enqueue_outbox_txn(
                conn,
                kind=kind,
                dedupe_key=dedupe_key,
                publication_id=publication_id,
                target_id=target_id,
                payload=payload,
                now=now,
                available_at=available_at,
            )

    def get_outbox_by_dedupe_key(self, dedupe_key: str) -> OutboxItem | None:
        conn = self._connect()
        try:
            row = conn.execute("SELECT * FROM outbox WHERE dedupe_key = ?", (dedupe_key,)).fetchone()
            return _outbox_from_row(row) if row is not None else None
        finally:
            conn.close()

    def list_outbox(self, *, publication_id: str | None = None) -> list[OutboxItem]:
        conn = self._connect()
        try:
            if publication_id is None:
                rows = conn.execute("SELECT * FROM outbox ORDER BY id").fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM outbox WHERE publication_id = ? ORDER BY id", (publication_id,)
                ).fetchall()
            return [_outbox_from_row(row) for row in rows]
        finally:
            conn.close()

    def claim_outbox(
        self,
        worker_id: str,
        *,
        lease_seconds: int = 60,
        now: str | None = None,
    ) -> OutboxItem | None:
        if not worker_id:
            raise StoreError("worker_id must not be empty")
        current_time = now or _utc_now()
        expires_at = _future_timestamp(current_time, lease_seconds)
        with self._write_transaction() as conn:
            conn.execute(
                """
                UPDATE outbox
                SET state = ?, lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
                WHERE state = ? AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
                """,
                (OutboxState.PENDING.value, OutboxState.LEASED.value, current_time),
            )
            row = conn.execute(
                """
                SELECT * FROM outbox
                WHERE state = ? AND available_at <= ?
                ORDER BY available_at, id
                LIMIT 1
                """,
                (OutboxState.PENDING.value, current_time),
            ).fetchone()
            if row is None:
                return None
            token = secrets.token_urlsafe(18)
            changed = conn.execute(
                """
                UPDATE outbox
                SET state = ?, lease_owner = ?, lease_token = ?, lease_expires_at = ?, attempts = attempts + 1
                WHERE id = ? AND state = ?
                """,
                (
                    OutboxState.LEASED.value,
                    worker_id,
                    token,
                    expires_at,
                    row["id"],
                    OutboxState.PENDING.value,
                ),
            ).rowcount
            if changed != 1:
                return None
            claimed = conn.execute("SELECT * FROM outbox WHERE id = ?", (row["id"],)).fetchone()
            assert claimed is not None
            return _outbox_from_row(claimed)

    def complete_outbox(self, outbox_id: int, lease_token: str) -> bool:
        now = _utc_now()
        with self._write_transaction() as conn:
            changed = conn.execute(
                """
                UPDATE outbox
                SET state = ?, completed_at = ?, lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
                WHERE id = ? AND state = ? AND lease_token = ?
                """,
                (OutboxState.COMPLETED.value, now, outbox_id, OutboxState.LEASED.value, lease_token),
            ).rowcount
            return changed == 1

    def reschedule_outbox(
        self,
        outbox_id: int,
        lease_token: str,
        *,
        available_at: str,
        error: str,
    ) -> bool:
        if not error:
            raise StoreError("rescheduled outbox item needs a non-empty error")
        with self._write_transaction() as conn:
            changed = conn.execute(
                """
                UPDATE outbox
                SET state = ?, available_at = ?, last_error = ?,
                    lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
                WHERE id = ? AND state = ? AND lease_token = ?
                """,
                (
                    OutboxState.PENDING.value,
                    available_at,
                    error,
                    outbox_id,
                    OutboxState.LEASED.value,
                    lease_token,
                ),
            ).rowcount
            return changed == 1

    def set_bot_state(self, key: str, value: str) -> None:
        if not key:
            raise StoreError("bot state key must not be empty")
        now = _utc_now()
        with self._write_transaction() as conn:
            conn.execute(
                """
                INSERT INTO bot_state(key, value, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                """,
                (key, value, now),
            )

    def get_bot_state(self, key: str) -> str | None:
        conn = self._connect()
        try:
            row = conn.execute("SELECT value FROM bot_state WHERE key = ?", (key,)).fetchone()
            return str(row["value"]) if row is not None else None
        finally:
            conn.close()

    def list_events(self, publication_id: str) -> list[dict[str, Any]]:
        conn = self._connect()
        try:
            rows = conn.execute(
                "SELECT * FROM publication_events WHERE publication_id = ? ORDER BY id", (publication_id,)
            ).fetchall()
            return [
                {
                    "id": row["id"],
                    "event_type": row["event_type"],
                    "actor_type": row["actor_type"],
                    "actor_id": row["actor_id"],
                    "data": _decode_object(row["data_json"]),
                    "created_at": row["created_at"],
                }
                for row in rows
            ]
        finally:
            conn.close()

    @staticmethod
    def _action_from_row(row: sqlite3.Row) -> TelegramAction:
        return TelegramAction(
            token=row["token"],
            publication_id=row["publication_id"],
            target_id=row["target_id"],
            kind=TelegramActionKind(row["kind"]),
            created_at=row["created_at"],
            consumed_at=row["consumed_at"],
        )

    def _finish_update_txn(
        self,
        conn: sqlite3.Connection,
        update_id: int,
        accepted: bool,
        publication_state: PublicationState | None,
        reason: str | None,
    ) -> ActionResult:
        result = {
            "accepted": accepted,
            "publication_state": publication_state.value if publication_state else None,
            "reason": reason,
        }
        conn.execute("UPDATE telegram_updates SET result_json = ? WHERE update_id = ?", (_json(result), update_id))
        return ActionResult(accepted, False, publication_state, reason)

    def _record_review_message(self, publication_id: str, column: str, message_id: int) -> int:
        if column not in {"review_video_message_id", "review_card_message_id"}:
            raise StoreError("invalid review message column")
        if not isinstance(message_id, int) or isinstance(message_id, bool) or message_id <= 0:
            raise StoreError("Telegram message_id must be a positive integer")
        now = _utc_now()
        with self._write_transaction() as conn:
            row = conn.execute(
                f"SELECT {column} FROM publications WHERE id = ?", (publication_id,)
            ).fetchone()
            if row is None:
                raise StoreError(f"unknown publication: {publication_id}")
            current = row[column]
            if current is not None:
                if int(current) != message_id:
                    raise StoreError(f"{column} is already recorded with a different message ID")
                return int(current)
            conn.execute(
                f"UPDATE publications SET {column} = ?, updated_at = ? WHERE id = ?",
                (message_id, now, publication_id),
            )
            self._append_event_txn(
                conn,
                publication_id,
                "telegram.review_video_sent" if column == "review_video_message_id" else "telegram.review_card_sent",
                actor_type="telegram_bot",
                data={"message_id": message_id},
                now=now,
            )
            return message_id

    def _enqueue_outbox_txn(
        self,
        conn: sqlite3.Connection,
        *,
        kind: str,
        dedupe_key: str,
        publication_id: str | None,
        payload: Mapping[str, Any] | None,
        now: str,
        target_id: int | None = None,
        available_at: str | None = None,
    ) -> OutboxItem:
        if not kind or not dedupe_key:
            raise StoreError("outbox kind and dedupe_key must not be empty")
        if target_id is not None:
            target = conn.execute(
                "SELECT publication_id FROM publication_targets WHERE id = ?", (target_id,)
            ).fetchone()
            if target is None:
                raise StoreError(f"unknown publication target: {target_id}")
            target_publication_id = str(target["publication_id"])
            if publication_id is None:
                publication_id = target_publication_id
            elif publication_id != target_publication_id:
                raise StoreError("outbox target does not belong to publication")
        conn.execute(
            """
            INSERT INTO outbox(
                kind, dedupe_key, publication_id, target_id, payload_json, state, available_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(dedupe_key) DO NOTHING
            """,
            (
                kind,
                dedupe_key,
                publication_id,
                target_id,
                _json(payload),
                OutboxState.PENDING.value,
                available_at or now,
                now,
            ),
        )
        row = conn.execute("SELECT * FROM outbox WHERE dedupe_key = ?", (dedupe_key,)).fetchone()
        assert row is not None
        return _outbox_from_row(row)

    def _append_event_txn(
        self,
        conn: sqlite3.Connection,
        publication_id: str,
        event_type: str,
        *,
        actor_type: str,
        data: Mapping[str, Any] | None,
        now: str,
        actor_id: str | None = None,
    ) -> None:
        conn.execute(
            """
            INSERT INTO publication_events(publication_id, event_type, actor_type, actor_id, data_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (publication_id, event_type, actor_type, actor_id, _json(data), now),
        )

    def _refresh_publication_state_txn(
        self, conn: sqlite3.Connection, publication_id: str, now: str
    ) -> None:
        publication_row = conn.execute("SELECT * FROM publications WHERE id = ?", (publication_id,)).fetchone()
        assert publication_row is not None
        publication = _publication_from_row(publication_row)
        if publication.state not in {PublicationState.APPROVED, PublicationState.PUBLISHING}:
            return
        states = [
            TargetState(row["state"])
            for row in conn.execute(
                "SELECT state FROM publication_targets WHERE publication_id = ?", (publication_id,)
            )
        ]
        if not states:
            return
        terminal = {
            TargetState.PUBLISHED,
            TargetState.FAILED,
            TargetState.RECONCILIATION_REQUIRED,
            TargetState.CANCELLED,
        }
        if all(state is TargetState.PUBLISHED for state in states):
            desired = PublicationState.PUBLISHED
        elif any(state is TargetState.PUBLISHED for state in states) and all(state in terminal for state in states):
            desired = PublicationState.PARTIAL
        elif all(state in terminal for state in states):
            desired = PublicationState.FAILED
        elif any(state in {TargetState.UPLOADING, TargetState.PROCESSING, TargetState.RETRY_WAIT} for state in states):
            desired = PublicationState.PUBLISHING
        else:
            return
        if desired is publication.state:
            return
        conn.execute(
            "UPDATE publications SET state = ?, updated_at = ? WHERE id = ?",
            (desired.value, now, publication_id),
        )
        self._append_event_txn(
            conn,
            publication_id,
            "publication.state_changed",
            actor_type="system",
            data={"from": publication.state.value, "to": desired.value},
            now=now,
        )
