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
from .security import PrivatePathError, absolute_path, ensure_private_regular_file


class StoreError(RuntimeError):
    """A durable-store invariant was violated."""


class InvalidTransition(StoreError):
    """A caller attempted an impossible publication or target transition."""


HEX_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
APPROVAL_FINGERPRINT_DOMAIN = b"shortvideo-publication-approval-v1\0"
RESUMABLE_PHASES = frozenset(
    {"session_recorded", "uploading", "resuming", "final_chunk_inflight"}
)


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
    (
        2,
        (
            # Keep the v1 schema immutable for already-created stores.  These
            # append-only columns make each operator re-dispatch and each
            # Telegram status delivery independently durable.
            "ALTER TABLE publications ADD COLUMN status_revision INTEGER NOT NULL DEFAULT 0 CHECK (status_revision >= 0)",
            "ALTER TABLE publication_targets ADD COLUMN dispatch_generation INTEGER NOT NULL DEFAULT 0 CHECK (dispatch_generation >= 0)",
        ),
    ),
    (
        3,
        (
            # A resumable upload URL is a sensitive capability. It is kept
            # only on the target row together with immutable proof of the
            # approved bytes it belongs to. Events never contain these fields.
            "ALTER TABLE publication_targets ADD COLUMN resumable_session_verified INTEGER NOT NULL DEFAULT 0 CHECK (resumable_session_verified IN (0, 1))",
            "ALTER TABLE publication_targets ADD COLUMN resumable_asset_sha256 TEXT",
            "ALTER TABLE publication_targets ADD COLUMN resumable_approval_fingerprint TEXT",
            "ALTER TABLE publication_targets ADD COLUMN resumable_total_bytes INTEGER",
            "ALTER TABLE publication_targets ADD COLUMN resumable_mime_type TEXT",
            "ALTER TABLE publication_targets ADD COLUMN resumable_offset INTEGER",
            "ALTER TABLE publication_targets ADD COLUMN resumable_phase TEXT",
        ),
    ),
)


TARGET_TRANSITIONS: dict[TargetState, frozenset[TargetState]] = {
    TargetState.QUEUED: frozenset({TargetState.UPLOADING, TargetState.CANCELLED}),
    TargetState.UPLOADING: frozenset(
        {
            TargetState.PROCESSING,
            TargetState.PUBLISHED,
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


def _normalize_timestamp(value: str, *, label: str = "timestamp") -> str:
    """Validate and canonically render a timezone-aware UTC timestamp.

    SQLite compares the canonical ISO-8601 strings lexicographically in the
    lease predicates below.  Accepting a non-canonical offset or a naive
    timestamp here would silently weaken those predicates.
    """
    if not isinstance(value, str) or not value:
        raise StoreError(f"{label} must be a non-empty UTC timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise StoreError(f"invalid {label}: {value!r}") from exc
    if parsed.tzinfo is None:
        raise StoreError(f"{label} must include a timezone")
    return parsed.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _future_timestamp(now: str, seconds: int) -> str:
    if seconds <= 0:
        raise StoreError("lease duration must be positive")
    normalized_now = _normalize_timestamp(now, label="current time")
    parsed = datetime.fromisoformat(normalized_now.replace("Z", "+00:00"))
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
        status_revision=row["status_revision"],
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
        resumable_session_verified=bool(row["resumable_session_verified"]),
        resumable_asset_sha256=row["resumable_asset_sha256"],
        resumable_approval_fingerprint=row["resumable_approval_fingerprint"],
        resumable_total_bytes=row["resumable_total_bytes"],
        resumable_mime_type=row["resumable_mime_type"],
        resumable_offset=row["resumable_offset"],
        resumable_phase=row["resumable_phase"],
        external_media_id=row["external_media_id"],
        external_url=row["external_url"],
        last_error_code=row["last_error_code"],
        last_error_detail=row["last_error_detail"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        published_at=row["published_at"],
        dispatch_generation=row["dispatch_generation"],
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
        self.path = absolute_path(path)
        try:
            self._secure_database_files()
        except PrivatePathError as exc:
            raise StoreError(f"unsafe publisher database path: {exc}") from exc
        self.migrate()

    def _secure_database_files(self) -> None:
        """Pre-create SQLite state with private, non-symlink files.

        ``external_session_id`` can be a resumable-upload capability.  SQLite
        writes it to the main database and may spill it into WAL/SHM files, so
        all three must be private before a connection can touch them.
        """
        for path, label in (
            (self.path, "publisher SQLite database"),
            (self.path.with_name(f"{self.path.name}-wal"), "publisher SQLite WAL"),
            (self.path.with_name(f"{self.path.name}-shm"), "publisher SQLite SHM"),
            # A legacy/hot rollback journal can exist before WAL is enabled.
            # Keep it private too, then fail closed if WAL cannot be used.
            (self.path.with_name(f"{self.path.name}-journal"), "publisher SQLite rollback journal"),
        ):
            ensure_private_regular_file(path, label=label, create=True)

    def _connect(self) -> sqlite3.Connection:
        try:
            self._secure_database_files()
        except PrivatePathError as exc:
            raise StoreError(f"unsafe publisher database path: {exc}") from exc
        conn = sqlite3.connect(self.path, isolation_level=None, timeout=5.0)
        try:
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON")
            conn.execute("PRAGMA busy_timeout = 5000")
            row = conn.execute("PRAGMA journal_mode = WAL").fetchone()
            effective_mode = str(row[0]).lower() if row is not None else ""
            if effective_mode != "wal":
                raise StoreError("publisher SQLite must support WAL mode for private resumable state")
            # SQLite may recreate support files while switching journal mode.
            self._secure_database_files()
        except PrivatePathError as exc:
            conn.close()
            raise StoreError(f"unsafe publisher database path: {exc}") from exc
        except BaseException:
            conn.close()
            raise
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

    def get_target(self, target_id: int) -> PublicationTarget | None:
        """Return one target without exposing raw SQLite rows to workers."""
        conn = self._connect()
        try:
            row = conn.execute("SELECT * FROM publication_targets WHERE id = ?", (target_id,)).fetchone()
            return _target_from_row(row) if row is not None else None
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
                        dedupe_key=(
                            f"target-publish:{publication.id}:{target.platform}:g{target.dispatch_generation}"
                        ),
                        publication_id=publication.id,
                        target_id=target.id,
                        payload={
                            "publication_id": publication.id,
                            "target_id": target.id,
                            "platform": target.platform,
                            "dispatch_generation": target.dispatch_generation,
                        },
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
            event_id = self._append_event_txn(
                conn,
                publication.id,
                event_type,
                actor_type="telegram_user",
                actor_id=actor,
                data={"action": action.kind.value},
                now=now,
            )
            self._enqueue_status_update_txn(conn, publication.id, event_id, now)
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
            publication_row = conn.execute(
                "SELECT approved_at FROM publications WHERE id = ?", (current.publication_id,)
            ).fetchone()
            assert publication_row is not None
            if publication_row["approved_at"] is None:
                raise InvalidTransition("cannot transition a target before publication approval")
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
            event_id = self._append_event_txn(
                conn,
                current.publication_id,
                "target.state_changed",
                actor_type="worker",
                data={"platform": current.platform, "from": current.state.value, "to": desired.value},
                now=now,
            )
            self._refresh_publication_state_txn(conn, current.publication_id, now)
            self._enqueue_status_update_txn(conn, current.publication_id, event_id, now)
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
        if kind == "target.publish":
            raise StoreError(
                "target.publish jobs are created only by approved dispatch and explicit retry/reconcile commands"
            )
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
        kinds: Iterable[str] | None = None,
    ) -> OutboxItem | None:
        """Atomically claim one due outbox item.

        ``kinds`` is deliberately part of the claim predicate, not a
        post-claim filter.  A platform worker must never lease a Telegram
        delivery item that happens to sort ahead of a publish job.
        """
        if not worker_id:
            raise StoreError("worker_id must not be empty")
        selected_kinds = tuple(kinds) if kinds is not None else ()
        if any(not isinstance(kind, str) or not kind for kind in selected_kinds):
            raise StoreError("outbox kinds must be non-empty strings")
        if len(set(selected_kinds)) != len(selected_kinds):
            raise StoreError("outbox kinds must be unique")
        current_time = _normalize_timestamp(now or _utc_now(), label="current time")
        expires_at = _future_timestamp(current_time, lease_seconds)
        kind_clause = ""
        if selected_kinds:
            kind_clause = " AND kind IN (" + ", ".join("?" for _ in selected_kinds) + ")"
        with self._write_transaction() as conn:
            conn.execute(
                """
                UPDATE outbox
                SET state = ?, lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
                WHERE state = ? AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
                """
                + kind_clause,
                (OutboxState.PENDING.value, OutboxState.LEASED.value, current_time, *selected_kinds),
            )
            row = conn.execute(
                """
                SELECT * FROM outbox
                WHERE state = ? AND available_at <= ?
                """
                + kind_clause
                + """
                ORDER BY available_at, id
                LIMIT 1
                """,
                (OutboxState.PENDING.value, current_time, *selected_kinds),
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

    def claim_target_publish(
        self,
        worker_id: str,
        *,
        lease_seconds: int = 60,
        now: str | None = None,
    ) -> OutboxItem | None:
        """Claim only platform publish work; Telegram work is never touched."""
        return self.claim_outbox(
            worker_id,
            lease_seconds=lease_seconds,
            now=now,
            kinds=("target.publish",),
        )

    def claim_telegram_status(
        self,
        worker_id: str,
        *,
        lease_seconds: int = 60,
        now: str | None = None,
    ) -> OutboxItem | None:
        """Claim only card-status edits; it never consumes review delivery work."""
        return self.claim_outbox(
            worker_id,
            lease_seconds=lease_seconds,
            now=now,
            kinds=("telegram.status_card",),
        )

    def lease_is_current(
        self,
        outbox_id: int,
        lease_token: str,
        *,
        now: str | None = None,
        kind: str | None = None,
    ) -> bool:
        """Check the fencing token immediately before an external effect."""
        if not lease_token:
            return False
        current_time = _normalize_timestamp(now or _utc_now(), label="current time")
        clauses = [
            "id = ?",
            "state = ?",
            "lease_token = ?",
            "lease_expires_at IS NOT NULL",
            "lease_expires_at > ?",
        ]
        parameters: list[object] = [
            outbox_id,
            OutboxState.LEASED.value,
            lease_token,
            current_time,
        ]
        if kind is not None:
            clauses.append("kind = ?")
            parameters.append(kind)
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT 1 FROM outbox WHERE " + " AND ".join(clauses), parameters
            ).fetchone()
            return row is not None
        finally:
            conn.close()

    def renew_outbox_lease(
        self,
        outbox_id: int,
        lease_token: str,
        *,
        lease_seconds: int = 60,
        now: str | None = None,
    ) -> bool:
        """Extend a live lease without ever reviving a stale owner."""
        if not lease_token:
            return False
        current_time = _normalize_timestamp(now or _utc_now(), label="current time")
        expires_at = _future_timestamp(current_time, lease_seconds)
        with self._write_transaction() as conn:
            changed = conn.execute(
                """
                UPDATE outbox
                SET lease_expires_at = ?
                WHERE id = ? AND state = ? AND lease_token = ?
                  AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
                """,
                (
                    expires_at,
                    outbox_id,
                    OutboxState.LEASED.value,
                    lease_token,
                    current_time,
                ),
            ).rowcount
            return changed == 1

    def complete_outbox(self, outbox_id: int, lease_token: str, *, now: str | None = None) -> bool:
        """Complete a leased item only while its fencing token is current."""
        if not lease_token:
            return False
        current_time = _normalize_timestamp(now or _utc_now(), label="current time")
        with self._write_transaction() as conn:
            changed = conn.execute(
                """
                UPDATE outbox
                SET state = ?, completed_at = ?, lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
                WHERE id = ? AND state = ? AND lease_token = ?
                  AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
                """,
                (
                    OutboxState.COMPLETED.value,
                    current_time,
                    outbox_id,
                    OutboxState.LEASED.value,
                    lease_token,
                    current_time,
                ),
            ).rowcount
            return changed == 1

    def reschedule_outbox(
        self,
        outbox_id: int,
        lease_token: str,
        *,
        available_at: str,
        error: str,
        now: str | None = None,
    ) -> bool:
        if not error:
            raise StoreError("rescheduled outbox item needs a non-empty error")
        current_time = _normalize_timestamp(now or _utc_now(), label="current time")
        next_time = _normalize_timestamp(available_at, label="available_at")
        with self._write_transaction() as conn:
            changed = conn.execute(
                """
                UPDATE outbox
                SET state = ?, available_at = ?, last_error = ?,
                    lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
                WHERE id = ? AND state = ? AND lease_token = ?
                  AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
                """,
                (
                    OutboxState.PENDING.value,
                    next_time,
                    error,
                    outbox_id,
                    OutboxState.LEASED.value,
                    lease_token,
                    current_time,
                ),
            ).rowcount
            return changed == 1

    def dead_outbox(
        self,
        outbox_id: int,
        lease_token: str,
        *,
        error: str,
        now: str | None = None,
    ) -> bool:
        """Terminally stop a leased item while its fencing token is current."""
        if not lease_token:
            return False
        if not error:
            raise StoreError("dead outbox item needs a non-empty error")
        current_time = _normalize_timestamp(now or _utc_now(), label="current time")
        with self._write_transaction() as conn:
            changed = conn.execute(
                """
                UPDATE outbox
                SET state = ?, last_error = ?, lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
                WHERE id = ? AND state = ? AND lease_token = ?
                  AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
                """,
                (
                    OutboxState.DEAD.value,
                    error,
                    outbox_id,
                    OutboxState.LEASED.value,
                    lease_token,
                    current_time,
                ),
            ).rowcount
            return changed == 1

    def complete_telegram_status_delivery(
        self,
        outbox_id: int,
        lease_token: str,
        *,
        publication_id: str,
        revision: int,
        now: str | None = None,
    ) -> tuple[bool, bool]:
        """Complete a known status write and repair every lost-fence write.

        A Telegram edit cannot participate in SQLite's transaction.  If a
        newer status revision committed while an older edit was in flight, a
        fresh repair revision is appended.  More importantly, once the API
        call has returned, a worker that lost its lease must *also* append a
        repair revision even when the durable revision has not changed yet:
        another owner may be about to write, and this delayed worker has
        already performed an unfenced external effect.

        The first return value says whether this worker atomically completed
        its original outbox row.  The second says whether a repair row was
        appended; it can be true even after the original lease was lost.
        """
        if not lease_token:
            return False, False
        if not publication_id or not isinstance(revision, int) or isinstance(revision, bool) or revision < 1:
            raise StoreError("invalid Telegram status delivery identity")
        current_time = _normalize_timestamp(now or _utc_now(), label="current time")
        with self._write_transaction() as conn:
            outbox_row = conn.execute(
                """
                SELECT * FROM outbox
                WHERE id = ? AND kind = ? AND publication_id = ?
                """,
                (
                    outbox_id,
                    "telegram.status_card",
                    publication_id,
                ),
            ).fetchone()
            if outbox_row is None:
                return False, False
            outbox = _outbox_from_row(outbox_row)
            if outbox.payload != {"publication_id": publication_id, "revision": revision}:
                self._dead_outbox_txn(
                    conn,
                    outbox_id,
                    lease_token,
                    current_time,
                    "invalid telegram.status_card payload",
                )
                return False, False
            publication_row = conn.execute(
                "SELECT * FROM publications WHERE id = ?", (publication_id,)
            ).fetchone()
            if publication_row is None:
                self._dead_outbox_txn(
                    conn,
                    outbox_id,
                    lease_token,
                    current_time,
                    "telegram.status_card references an unknown publication",
                )
                return False, False
            publication = _publication_from_row(publication_row)
            if revision > publication.status_revision:
                self._dead_outbox_txn(
                    conn,
                    outbox_id,
                    lease_token,
                    current_time,
                    "telegram.status_card revision is ahead of publication state",
                )
                return False, False
            completed = self._complete_outbox_txn(conn, outbox_id, lease_token, current_time)
            # A successful completion still needs a repair when newer state
            # was committed during the external edit.  A failed completion is
            # a lost/reclaimed fence after a known Telegram write; always
            # enqueue a fresh current revision in that case, even if the
            # durable revision happens to be unchanged at this instant.
            needs_repair = not completed or publication.status_revision != revision
            if needs_repair:
                self._enqueue_telegram_status_repair_txn(
                    conn,
                    publication,
                    written_revision=revision,
                    reason="lost_fence" if not completed else "stale_revision",
                    now=current_time,
                )
            return completed, needs_repair

    def repair_telegram_status_after_external_attempt(
        self,
        outbox_id: int,
        lease_token: str,
        *,
        publication_id: str,
        revision: int,
        now: str | None = None,
    ) -> bool:
        """Repair a possibly-applied status edit after an ambiguous API error.

        This is intentionally narrower than completion: it never completes
        the original row.  If the fence is still live, normal retry handling
        remains responsible for it.  If the attempt lost its fence, the
        request may have reached Telegram after a newer card update, so a
        current repair revision is made durable immediately.
        """
        if not lease_token:
            return False
        if not publication_id or not isinstance(revision, int) or isinstance(revision, bool) or revision < 1:
            raise StoreError("invalid Telegram status delivery identity")
        current_time = _normalize_timestamp(now or _utc_now(), label="current time")
        with self._write_transaction() as conn:
            outbox_row = conn.execute(
                """
                SELECT * FROM outbox
                WHERE id = ? AND kind = ? AND publication_id = ?
                """,
                (outbox_id, "telegram.status_card", publication_id),
            ).fetchone()
            if outbox_row is None:
                return False
            outbox = _outbox_from_row(outbox_row)
            if outbox.payload != {"publication_id": publication_id, "revision": revision}:
                return False
            publication_row = conn.execute(
                "SELECT * FROM publications WHERE id = ?", (publication_id,)
            ).fetchone()
            if publication_row is None:
                return False
            publication = _publication_from_row(publication_row)
            if revision > publication.status_revision:
                return False
            still_fenced = (
                outbox.state is OutboxState.LEASED
                and outbox.lease_token == lease_token
                and outbox.lease_expires_at is not None
                and outbox.lease_expires_at > current_time
            )
            if still_fenced:
                return False
            self._enqueue_telegram_status_repair_txn(
                conn,
                publication,
                written_revision=revision,
                reason="ambiguous_external_attempt_after_lost_fence",
                now=current_time,
            )
            return True

    def start_target_publish(
        self,
        outbox_id: int,
        lease_token: str,
        *,
        resumable_session_supported: bool = False,
        now: str | None = None,
    ) -> PublicationTarget | None:
        """Fence and start a target publish attempt before an adapter call.

        The outbox row, its denormalized payload, target, and approved
        publication are checked together inside the write transaction.  A
        malformed or stale job therefore cannot reach an adapter.
        """
        if not lease_token or not isinstance(resumable_session_supported, bool):
            return None
        current_time = _normalize_timestamp(now or _utc_now(), label="current time")
        with self._write_transaction() as conn:
            context, reason = self._leased_target_publish_context_txn(
                conn, outbox_id, lease_token, current_time
            )
            if context is None:
                return None
            outbox, publication, target = context
            if reason is not None:
                self._dead_outbox_txn(conn, outbox.id, lease_token, current_time, reason)
                if publication is not None:
                    self._append_event_txn(
                        conn,
                        publication.id,
                        "target.publish_job_rejected",
                        actor_type="worker",
                        data={"target_id": target.id if target is not None else None, "reason": reason},
                        now=current_time,
                    )
                return None
            assert publication is not None and target is not None
            if target.state is TargetState.PUBLISHED:
                self._complete_outbox_txn(conn, outbox.id, lease_token, current_time)
                return None
            if target.state in {
                TargetState.FAILED,
                TargetState.RECONCILIATION_REQUIRED,
                TargetState.CANCELLED,
            }:
                self._dead_outbox_txn(
                    conn,
                    outbox.id,
                    lease_token,
                    current_time,
                    f"target is terminal: {target.state.value}",
                )
                return None
            in_flight = target.state in {TargetState.UPLOADING, TargetState.PROCESSING}
            requires_resume_proof = (
                publication.execution_mode is not ExecutionMode.DRY_RUN
                and (
                    in_flight
                    or target.resumable_session_verified
                    or target.external_session_id is not None
                )
            )
            if requires_resume_proof:
                # A process can disappear after starting an external call but
                # before saving its response. Retry-wait rows can also carry
                # a prior provider session. A live target can proceed only
                # when its adapter explicitly supports resume *and* the
                # persisted checkpoint proves the same immutable approval.
                if resumable_session_supported and self._has_valid_resumable_checkpoint(target, publication):
                    pass
                else:
                    # Live adapters are not assumed idempotent/resumable until
                    # they prove that contract. In particular, a legacy
                    # external_session_id is insufficient evidence for a new
                    # adapter to create another upload.
                    error_code = (
                        "lease_expired_after_publish_started"
                        if in_flight
                        else "resumable_session_resume_unavailable"
                    )
                    error_detail = (
                        "lease expired after a live publish attempt started; external outcome is unknown"
                        if in_flight
                        else "a prior live provider session cannot be safely resumed; reconciliation is required"
                    )
                    conn.execute(
                        """
                        UPDATE publication_targets
                        SET state = ?, next_attempt_at = NULL, last_error_code = ?, last_error_detail = ?,
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            TargetState.RECONCILIATION_REQUIRED.value,
                            error_code,
                            error_detail,
                            current_time,
                            target.id,
                        ),
                    )
                    self._dead_outbox_txn(
                        conn,
                        outbox.id,
                        lease_token,
                        current_time,
                        error_detail,
                    )
                    event_id = self._append_event_txn(
                        conn,
                        publication.id,
                        "target.state_changed",
                        actor_type="worker",
                        data={
                            "platform": target.platform,
                            "from": target.state.value,
                            "to": TargetState.RECONCILIATION_REQUIRED.value,
                            "error_code": error_code,
                        },
                        now=current_time,
                    )
                    self._refresh_publication_state_txn(conn, publication.id, current_time)
                    self._enqueue_status_update_txn(conn, publication.id, event_id, current_time)
                    return None
            if target.state not in {
                TargetState.QUEUED,
                TargetState.RETRY_WAIT,
                TargetState.UPLOADING,
                TargetState.PROCESSING,
            }:
                self._dead_outbox_txn(
                    conn,
                    outbox.id,
                    lease_token,
                    current_time,
                    f"target is not runnable: {target.state.value}",
                )
                return None

            previous_state = target.state
            # A reclaimed in-flight job uses the same outbox dedupe key as an
            # idempotency key.  Adapters must therefore make a repeat call a
            # lookup/continuation rather than an independent upload.
            conn.execute(
                """
                UPDATE publication_targets
                SET state = ?, next_attempt_at = NULL, attempts = attempts + 1, updated_at = ?
                WHERE id = ?
                """,
                (TargetState.UPLOADING.value, current_time, target.id),
            )
            event_id = self._append_event_txn(
                conn,
                publication.id,
                "target.state_changed",
                actor_type="worker",
                data={
                    "platform": target.platform,
                    "from": previous_state.value,
                    "to": TargetState.UPLOADING.value,
                    "outbox_id": outbox.id,
                },
                now=current_time,
            )
            self._refresh_publication_state_txn(conn, publication.id, current_time)
            self._enqueue_status_update_txn(conn, publication.id, event_id, current_time)
            updated = conn.execute("SELECT * FROM publication_targets WHERE id = ?", (target.id,)).fetchone()
            assert updated is not None
            return _target_from_row(updated)

    def record_target_processing(
        self,
        outbox_id: int,
        lease_token: str,
        *,
        external_session_id: str,
        asset_sha256: str,
        approval_fingerprint: str,
        total_bytes: int,
        mime_type: str,
        offset: int = 0,
        phase: str = "session_recorded",
        now: str | None = None,
    ) -> bool:
        """Durably checkpoint a resumable session before sending media bytes.

        This is deliberately fenced by the claimed outbox lease.  The session
        URI is stored only on ``publication_targets``; event payloads contain
        no URI, token, or other capability material.
        """
        if not lease_token:
            return False
        self._validate_resumable_checkpoint_values(
            external_session_id=external_session_id,
            asset_sha256=asset_sha256,
            approval_fingerprint=approval_fingerprint,
            total_bytes=total_bytes,
            mime_type=mime_type,
            offset=offset,
            phase=phase,
        )
        current_time = _normalize_timestamp(now or _utc_now(), label="current time")
        with self._write_transaction() as conn:
            context, reason = self._leased_target_publish_context_txn(
                conn, outbox_id, lease_token, current_time
            )
            if context is None or reason is not None:
                return False
            outbox, publication, target = context
            assert publication is not None and target is not None
            if target.platform != "youtube":
                return False
            if target.state not in {TargetState.UPLOADING, TargetState.PROCESSING}:
                return False
            if asset_sha256 != publication.asset_sha256 or approval_fingerprint != publication.approval_fingerprint:
                return False
            if target.resumable_session_verified:
                # A session URL is immutable for this dispatch. A different
                # value would turn a lease race into a blind new upload.
                if not self._has_valid_resumable_checkpoint(target, publication):
                    return False
                return (
                    target.external_session_id == external_session_id
                    and target.resumable_asset_sha256 == asset_sha256
                    and target.resumable_approval_fingerprint == approval_fingerprint
                    and target.resumable_total_bytes == total_bytes
                    and target.resumable_mime_type == mime_type
                )
            if target.external_session_id is not None:
                # A legacy/generic external session is not enough evidence to
                # overwrite it as a resumable YouTube capability.
                return False
            conn.execute(
                """
                UPDATE publication_targets
                SET state = ?, next_attempt_at = NULL, external_session_id = ?,
                    resumable_session_verified = 1, resumable_asset_sha256 = ?,
                    resumable_approval_fingerprint = ?, resumable_total_bytes = ?,
                    resumable_mime_type = ?, resumable_offset = ?, resumable_phase = ?,
                    last_error_code = NULL, last_error_detail = NULL, updated_at = ?
                WHERE id = ?
                """,
                (
                    TargetState.PROCESSING.value,
                    external_session_id,
                    asset_sha256,
                    approval_fingerprint,
                    total_bytes,
                    mime_type,
                    offset,
                    phase,
                    current_time,
                    target.id,
                ),
            )
            event_id = self._append_event_txn(
                conn,
                publication.id,
                "target.state_changed",
                actor_type="worker",
                data={
                    "platform": target.platform,
                    "from": target.state.value,
                    "to": TargetState.PROCESSING.value,
                    "resumable_checkpoint_recorded": True,
                },
                now=current_time,
            )
            self._refresh_publication_state_txn(conn, publication.id, current_time)
            self._enqueue_status_update_txn(conn, publication.id, event_id, current_time)
            return True

    def record_target_progress(
        self,
        outbox_id: int,
        lease_token: str,
        *,
        offset: int,
        phase: str,
        now: str | None = None,
    ) -> bool:
        """Persist provider-confirmed resumable progress under the same fence."""
        if not lease_token or isinstance(offset, bool) or not isinstance(offset, int):
            return False
        if phase not in RESUMABLE_PHASES:
            return False
        current_time = _normalize_timestamp(now or _utc_now(), label="current time")
        with self._write_transaction() as conn:
            context, reason = self._leased_target_publish_context_txn(
                conn, outbox_id, lease_token, current_time
            )
            if context is None or reason is not None:
                return False
            _outbox, publication, target = context
            assert publication is not None and target is not None
            if target.platform != "youtube":
                return False
            if target.state not in {TargetState.UPLOADING, TargetState.PROCESSING}:
                return False
            if not self._has_valid_resumable_checkpoint(target, publication):
                return False
            assert target.resumable_total_bytes is not None
            if not 0 <= offset <= target.resumable_total_bytes:
                return False
            conn.execute(
                """
                UPDATE publication_targets
                SET state = ?, resumable_offset = ?, resumable_phase = ?, updated_at = ?
                WHERE id = ?
                """,
                (TargetState.PROCESSING.value, offset, phase, current_time, target.id),
            )
            return True

    def complete_target_publish(
        self,
        outbox_id: int,
        lease_token: str,
        *,
        external_media_id: str,
        external_url: str,
        external_session_id: str | None = None,
        now: str | None = None,
    ) -> bool:
        """Persist a successful target and complete its leased outbox atomically."""
        if not lease_token:
            return False
        if not isinstance(external_media_id, str) or not external_media_id.strip():
            raise StoreError("external_media_id must be a non-empty string")
        if not isinstance(external_url, str) or not external_url.strip():
            raise StoreError("external_url must be a non-empty string")
        if external_session_id is not None and (
            not isinstance(external_session_id, str) or not external_session_id.strip()
        ):
            raise StoreError("external_session_id must be a non-empty string when provided")
        current_time = _normalize_timestamp(now or _utc_now(), label="current time")
        with self._write_transaction() as conn:
            context, reason = self._leased_target_publish_context_txn(
                conn, outbox_id, lease_token, current_time
            )
            if context is None:
                return False
            outbox, publication, target = context
            if reason is not None or target.state not in {TargetState.UPLOADING, TargetState.PROCESSING}:
                return False
            if (
                target.resumable_session_verified
                and external_session_id is not None
                and external_session_id.strip() != target.external_session_id
            ):
                return False
            clear_resumable = target.resumable_session_verified
            changed = conn.execute(
                """
                UPDATE publication_targets
                SET state = ?, next_attempt_at = NULL,
                    external_session_id = CASE WHEN ? THEN NULL ELSE COALESCE(?, external_session_id) END,
                    resumable_session_verified = CASE WHEN ? THEN 0 ELSE resumable_session_verified END,
                    resumable_asset_sha256 = CASE WHEN ? THEN NULL ELSE resumable_asset_sha256 END,
                    resumable_approval_fingerprint = CASE WHEN ? THEN NULL ELSE resumable_approval_fingerprint END,
                    resumable_total_bytes = CASE WHEN ? THEN NULL ELSE resumable_total_bytes END,
                    resumable_mime_type = CASE WHEN ? THEN NULL ELSE resumable_mime_type END,
                    resumable_offset = CASE WHEN ? THEN NULL ELSE resumable_offset END,
                    resumable_phase = CASE WHEN ? THEN NULL ELSE resumable_phase END,
                    external_media_id = ?,
                    external_url = ?, last_error_code = NULL, last_error_detail = NULL,
                    updated_at = ?, published_at = ?
                WHERE id = ?
                """,
                (
                    TargetState.PUBLISHED.value,
                    int(clear_resumable),
                    external_session_id,
                    int(clear_resumable),
                    int(clear_resumable),
                    int(clear_resumable),
                    int(clear_resumable),
                    int(clear_resumable),
                    int(clear_resumable),
                    int(clear_resumable),
                    external_media_id.strip(),
                    external_url.strip(),
                    current_time,
                    current_time,
                    target.id,
                ),
            ).rowcount
            assert changed == 1
            completed = self._complete_outbox_txn(conn, outbox.id, lease_token, current_time)
            if not completed:
                raise StoreError("lost current lease while completing target publish")
            event_id = self._append_event_txn(
                conn,
                publication.id,
                "target.state_changed",
                actor_type="worker",
                data={
                    "platform": target.platform,
                    "from": target.state.value,
                    "to": TargetState.PUBLISHED.value,
                    "external_media_id": external_media_id.strip(),
                    "external_url": external_url.strip(),
                },
                now=current_time,
            )
            self._refresh_publication_state_txn(conn, publication.id, current_time)
            self._enqueue_status_update_txn(conn, publication.id, event_id, current_time)
            return True

    def reschedule_target_publish(
        self,
        outbox_id: int,
        lease_token: str,
        *,
        available_at: str,
        error_code: str,
        error_detail: str,
        now: str | None = None,
    ) -> bool:
        """Move a retryable attempt and its outbox back to a due time atomically."""
        if not lease_token:
            return False
        if not error_code or not error_detail:
            raise StoreError("retryable target failure needs error_code and error_detail")
        current_time = _normalize_timestamp(now or _utc_now(), label="current time")
        next_time = _normalize_timestamp(available_at, label="available_at")
        with self._write_transaction() as conn:
            context, reason = self._leased_target_publish_context_txn(
                conn, outbox_id, lease_token, current_time
            )
            if context is None:
                return False
            outbox, publication, target = context
            if reason is not None or target.state not in {TargetState.UPLOADING, TargetState.PROCESSING}:
                return False
            conn.execute(
                """
                UPDATE publication_targets
                SET state = ?, next_attempt_at = ?, last_error_code = ?, last_error_detail = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    TargetState.RETRY_WAIT.value,
                    next_time,
                    error_code,
                    error_detail,
                    current_time,
                    target.id,
                ),
            )
            rescheduled = self._reschedule_outbox_txn(
                conn, outbox.id, lease_token, next_time, error_detail, current_time
            )
            if not rescheduled:
                raise StoreError("lost current lease while rescheduling target publish")
            event_id = self._append_event_txn(
                conn,
                publication.id,
                "target.state_changed",
                actor_type="worker",
                data={
                    "platform": target.platform,
                    "from": target.state.value,
                    "to": TargetState.RETRY_WAIT.value,
                    "error_code": error_code,
                    "next_attempt_at": next_time,
                },
                now=current_time,
            )
            self._refresh_publication_state_txn(conn, publication.id, current_time)
            self._enqueue_status_update_txn(conn, publication.id, event_id, current_time)
            return True

    def fail_target_publish(
        self,
        outbox_id: int,
        lease_token: str,
        *,
        error_code: str,
        error_detail: str,
        ambiguous: bool = False,
        external_session_id: str | None = None,
        external_media_id: str | None = None,
        external_url: str | None = None,
        now: str | None = None,
    ) -> bool:
        """Terminally fail a target or require reconciliation, atomically with outbox death."""
        if not lease_token:
            return False
        if not error_code or not error_detail:
            raise StoreError("terminal target failure needs error_code and error_detail")
        if external_session_id is not None and (
            not isinstance(external_session_id, str) or not external_session_id.strip()
        ):
            raise StoreError("external_session_id must be a non-empty string when provided")
        if (external_media_id is None) != (external_url is None):
            raise StoreError("external_media_id and external_url must be provided together")
        if external_media_id is not None and (
            not isinstance(external_media_id, str) or not external_media_id.strip()
        ):
            raise StoreError("external_media_id must be a non-empty string when provided")
        if external_url is not None and (
            not isinstance(external_url, str) or not external_url.strip()
        ):
            raise StoreError("external_url must be a non-empty string when provided")
        current_time = _normalize_timestamp(now or _utc_now(), label="current time")
        final_state = TargetState.RECONCILIATION_REQUIRED if ambiguous else TargetState.FAILED
        with self._write_transaction() as conn:
            context, reason = self._leased_target_publish_context_txn(
                conn, outbox_id, lease_token, current_time
            )
            if context is None:
                return False
            outbox, publication, target = context
            if reason is not None or target.state not in {TargetState.UPLOADING, TargetState.PROCESSING}:
                return False
            if (
                target.resumable_session_verified
                and external_session_id is not None
                and external_session_id.strip() != target.external_session_id
            ):
                return False
            # A definitive terminal failure (for example a 404 expired
            # session or a rejected request) is not resumable.  Clear the
            # bearer capability now so a later explicit retry starts a fresh
            # session.  Ambiguous outcomes deliberately retain it for
            # reconciliation/status probing.
            clear_resumable = target.resumable_session_verified and not ambiguous
            conn.execute(
                """
                UPDATE publication_targets
                SET state = ?, next_attempt_at = NULL,
                    external_session_id = CASE WHEN ? THEN NULL ELSE COALESCE(?, external_session_id) END,
                    resumable_session_verified = CASE WHEN ? THEN 0 ELSE resumable_session_verified END,
                    resumable_asset_sha256 = CASE WHEN ? THEN NULL ELSE resumable_asset_sha256 END,
                    resumable_approval_fingerprint = CASE WHEN ? THEN NULL ELSE resumable_approval_fingerprint END,
                    resumable_total_bytes = CASE WHEN ? THEN NULL ELSE resumable_total_bytes END,
                    resumable_mime_type = CASE WHEN ? THEN NULL ELSE resumable_mime_type END,
                    resumable_offset = CASE WHEN ? THEN NULL ELSE resumable_offset END,
                    resumable_phase = CASE WHEN ? THEN NULL ELSE resumable_phase END,
                    external_media_id = COALESCE(?, external_media_id),
                    external_url = COALESCE(?, external_url),
                    last_error_code = ?, last_error_detail = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    final_state.value,
                    int(clear_resumable),
                    external_session_id.strip() if external_session_id is not None else None,
                    int(clear_resumable),
                    int(clear_resumable),
                    int(clear_resumable),
                    int(clear_resumable),
                    int(clear_resumable),
                    int(clear_resumable),
                    int(clear_resumable),
                    external_media_id.strip() if external_media_id is not None else None,
                    external_url.strip() if external_url is not None else None,
                    error_code,
                    error_detail,
                    current_time,
                    target.id,
                ),
            )
            dead = self._dead_outbox_txn(conn, outbox.id, lease_token, current_time, error_detail)
            if not dead:
                raise StoreError("lost current lease while terminally failing target publish")
            event_id = self._append_event_txn(
                conn,
                publication.id,
                "target.state_changed",
                actor_type="worker",
                data={
                    "platform": target.platform,
                    "from": target.state.value,
                    "to": final_state.value,
                    "error_code": error_code,
                },
                now=current_time,
            )
            self._refresh_publication_state_txn(conn, publication.id, current_time)
            self._enqueue_status_update_txn(conn, publication.id, event_id, current_time)
            return True

    def retry_failed_target(self, target_id: int, *, now: str | None = None) -> PublicationTarget:
        """Explicitly requeue only a terminally failed target after operator review."""
        current_time = _normalize_timestamp(now or _utc_now(), label="current time")
        with self._write_transaction() as conn:
            row = conn.execute("SELECT * FROM publication_targets WHERE id = ?", (target_id,)).fetchone()
            if row is None:
                raise StoreError(f"unknown publication target: {target_id}")
            target = _target_from_row(row)
            if target.state is not TargetState.FAILED:
                raise InvalidTransition("only a failed target can be retried explicitly")
            publication_row = conn.execute(
                "SELECT * FROM publications WHERE id = ?", (target.publication_id,)
            ).fetchone()
            assert publication_row is not None
            publication = _publication_from_row(publication_row)
            if publication.approved_at is None:
                raise StoreError("cannot retry a target whose publication was never approved")
            next_generation = target.dispatch_generation + 1
            # A target reaches FAILED only after a definitive terminal
            # outcome.  It must start a new provider session if an operator
            # requeues it; only retry_wait and reconciliation retain a fenced
            # resumable capability.
            retain_checkpoint = False
            conn.execute(
                """
                UPDATE publication_targets
                SET state = ?, next_attempt_at = NULL,
                    external_session_id = CASE WHEN ? THEN external_session_id ELSE NULL END,
                    resumable_session_verified = CASE WHEN ? THEN resumable_session_verified ELSE 0 END,
                    resumable_asset_sha256 = CASE WHEN ? THEN resumable_asset_sha256 ELSE NULL END,
                    resumable_approval_fingerprint = CASE WHEN ? THEN resumable_approval_fingerprint ELSE NULL END,
                    resumable_total_bytes = CASE WHEN ? THEN resumable_total_bytes ELSE NULL END,
                    resumable_mime_type = CASE WHEN ? THEN resumable_mime_type ELSE NULL END,
                    resumable_offset = CASE WHEN ? THEN resumable_offset ELSE NULL END,
                    resumable_phase = CASE WHEN ? THEN resumable_phase ELSE NULL END,
                    external_media_id = NULL, external_url = NULL, published_at = NULL,
                    last_error_code = NULL, last_error_detail = NULL,
                    dispatch_generation = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    TargetState.QUEUED.value,
                    int(retain_checkpoint),
                    int(retain_checkpoint),
                    int(retain_checkpoint),
                    int(retain_checkpoint),
                    int(retain_checkpoint),
                    int(retain_checkpoint),
                    int(retain_checkpoint),
                    int(retain_checkpoint),
                    next_generation,
                    current_time,
                    target.id,
                ),
            )
            self._requeue_target_outbox_txn(conn, publication, target, next_generation, current_time)
            self._set_publication_publishing_txn(conn, publication, current_time, reason="explicit_retry")
            event_id = self._append_event_txn(
                conn,
                publication.id,
                "target.state_changed",
                actor_type="operator",
                data={
                    "platform": target.platform,
                    "from": TargetState.FAILED.value,
                    "to": TargetState.QUEUED.value,
                    "reason": "explicit_retry",
                },
                now=current_time,
            )
            self._enqueue_status_update_txn(conn, publication.id, event_id, current_time)
            updated = conn.execute("SELECT * FROM publication_targets WHERE id = ?", (target.id,)).fetchone()
            assert updated is not None
            return _target_from_row(updated)

    def reconcile_target(
        self,
        target_id: int,
        *,
        outcome: str,
        external_media_id: str | None = None,
        external_url: str | None = None,
        external_session_id: str | None = None,
        confirmed_absent: bool = False,
        now: str | None = None,
    ) -> PublicationTarget:
        """Resolve an ambiguous target only through an explicit operator outcome."""
        if outcome not in {"mark-published", "requeue"}:
            raise StoreError("reconcile outcome must be mark-published or requeue")
        if outcome == "mark-published":
            if not isinstance(external_media_id, str) or not external_media_id.strip():
                raise StoreError("mark-published reconciliation requires external_media_id")
            if not isinstance(external_url, str) or not external_url.strip():
                raise StoreError("mark-published reconciliation requires external_url")
        elif not confirmed_absent:
            raise StoreError("requeue reconciliation requires confirmed_absent=True")
        if outcome == "requeue" and any(
            value is not None for value in (external_media_id, external_url, external_session_id)
        ):
            raise StoreError("requeue reconciliation must not include external identifiers")
        if external_session_id is not None and (
            not isinstance(external_session_id, str) or not external_session_id.strip()
        ):
            raise StoreError("external_session_id must be a non-empty string when provided")
        current_time = _normalize_timestamp(now or _utc_now(), label="current time")
        with self._write_transaction() as conn:
            row = conn.execute("SELECT * FROM publication_targets WHERE id = ?", (target_id,)).fetchone()
            if row is None:
                raise StoreError(f"unknown publication target: {target_id}")
            target = _target_from_row(row)
            if target.state is not TargetState.RECONCILIATION_REQUIRED:
                raise InvalidTransition("only a reconciliation_required target can be reconciled")
            publication_row = conn.execute(
                "SELECT * FROM publications WHERE id = ?", (target.publication_id,)
            ).fetchone()
            assert publication_row is not None
            publication = _publication_from_row(publication_row)
            if outcome == "mark-published":
                desired = TargetState.PUBLISHED
                clear_resumable = target.resumable_session_verified
                conn.execute(
                    """
                    UPDATE publication_targets
                    SET state = ?, next_attempt_at = NULL,
                        external_session_id = CASE WHEN ? THEN NULL ELSE COALESCE(?, external_session_id) END,
                        resumable_session_verified = CASE WHEN ? THEN 0 ELSE resumable_session_verified END,
                        resumable_asset_sha256 = CASE WHEN ? THEN NULL ELSE resumable_asset_sha256 END,
                        resumable_approval_fingerprint = CASE WHEN ? THEN NULL ELSE resumable_approval_fingerprint END,
                        resumable_total_bytes = CASE WHEN ? THEN NULL ELSE resumable_total_bytes END,
                        resumable_mime_type = CASE WHEN ? THEN NULL ELSE resumable_mime_type END,
                        resumable_offset = CASE WHEN ? THEN NULL ELSE resumable_offset END,
                        resumable_phase = CASE WHEN ? THEN NULL ELSE resumable_phase END,
                        external_media_id = ?, external_url = ?,
                        last_error_code = NULL, last_error_detail = NULL, updated_at = ?, published_at = ?
                    WHERE id = ?
                    """,
                    (
                        desired.value,
                        int(clear_resumable),
                        external_session_id.strip() if external_session_id is not None else None,
                        int(clear_resumable),
                        int(clear_resumable),
                        int(clear_resumable),
                        int(clear_resumable),
                        int(clear_resumable),
                        int(clear_resumable),
                        int(clear_resumable),
                        external_media_id.strip(),
                        external_url.strip(),
                        current_time,
                        current_time,
                        target.id,
                    ),
                )
                self._refresh_publication_state_txn(conn, publication.id, current_time)
            else:
                desired = TargetState.QUEUED
                next_generation = target.dispatch_generation + 1
                conn.execute(
                    """
                    UPDATE publication_targets
                    SET state = ?, next_attempt_at = NULL, external_session_id = NULL,
                        resumable_session_verified = 0, resumable_asset_sha256 = NULL,
                        resumable_approval_fingerprint = NULL, resumable_total_bytes = NULL,
                        resumable_mime_type = NULL, resumable_offset = NULL, resumable_phase = NULL,
                        external_media_id = NULL, external_url = NULL, published_at = NULL,
                        last_error_code = NULL, last_error_detail = NULL,
                        dispatch_generation = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (desired.value, next_generation, current_time, target.id),
                )
                self._requeue_target_outbox_txn(
                    conn, publication, target, next_generation, current_time
                )
                self._set_publication_publishing_txn(conn, publication, current_time, reason="reconcile_requeue")
            event_id = self._append_event_txn(
                conn,
                publication.id,
                "target.state_changed",
                actor_type="operator",
                data={
                    "platform": target.platform,
                    "from": TargetState.RECONCILIATION_REQUIRED.value,
                    "to": desired.value,
                    "reason": f"reconcile:{outcome}",
                },
                now=current_time,
            )
            self._enqueue_status_update_txn(conn, publication.id, event_id, current_time)
            updated = conn.execute("SELECT * FROM publication_targets WHERE id = ?", (target.id,)).fetchone()
            assert updated is not None
            return _target_from_row(updated)

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

    def _leased_target_publish_context_txn(
        self,
        conn: sqlite3.Connection,
        outbox_id: int,
        lease_token: str,
        now: str,
    ) -> tuple[
        tuple[OutboxItem, Publication | None, PublicationTarget | None] | None,
        str | None,
    ]:
        """Load and validate a fenced target.publish job inside a write txn."""
        outbox_row = conn.execute(
            """
            SELECT * FROM outbox
            WHERE id = ? AND kind = ? AND state = ? AND lease_token = ?
              AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
            """,
            (
                outbox_id,
                "target.publish",
                OutboxState.LEASED.value,
                lease_token,
                now,
            ),
        ).fetchone()
        if outbox_row is None:
            return None, None
        outbox = _outbox_from_row(outbox_row)
        if outbox.publication_id is None or outbox.target_id is None:
            return (outbox, None, None), "target.publish job must link publication and target"
        target_row = conn.execute(
            "SELECT * FROM publication_targets WHERE id = ?", (outbox.target_id,)
        ).fetchone()
        if target_row is None:
            return (outbox, None, None), "target.publish job references an unknown target"
        target = _target_from_row(target_row)
        publication_row = conn.execute(
            "SELECT * FROM publications WHERE id = ?", (outbox.publication_id,)
        ).fetchone()
        if publication_row is None:
            return (outbox, None, target), "target.publish job references an unknown publication"
        publication = _publication_from_row(publication_row)
        if target.publication_id != publication.id:
            return (outbox, publication, target), "target does not belong to publication"

        payload = outbox.payload
        if payload.get("publication_id") != publication.id:
            return (outbox, publication, target), "payload publication_id does not match durable row"
        if payload.get("target_id") != target.id or isinstance(payload.get("target_id"), bool):
            return (outbox, publication, target), "payload target_id does not match durable row"
        if payload.get("platform") != target.platform:
            return (outbox, publication, target), "payload platform does not match durable target"
        expected_key = f"target-publish:{publication.id}:{target.platform}:g{target.dispatch_generation}"
        legacy_key = f"target-publish:{publication.id}:{target.platform}"
        payload_generation = payload.get("dispatch_generation", _UNSET)
        if payload_generation is _UNSET:
            if target.dispatch_generation != 0 or outbox.dedupe_key != legacy_key:
                return (outbox, publication, target), "legacy dispatch payload/key is invalid"
        elif (
            isinstance(payload_generation, bool)
            or not isinstance(payload_generation, int)
            or payload_generation != target.dispatch_generation
            or outbox.dedupe_key != expected_key
        ):
            return (outbox, publication, target), "payload dispatch generation does not match durable target"
        if publication.approved_at is None or publication.state in {
            PublicationState.REVIEW_PENDING,
            PublicationState.REJECTED,
        }:
            return (outbox, publication, target), "publication was not approved for target publishing"
        return (outbox, publication, target), None

    @staticmethod
    def _validate_resumable_checkpoint_values(
        *,
        external_session_id: str,
        asset_sha256: str,
        approval_fingerprint: str,
        total_bytes: int,
        mime_type: str,
        offset: int,
        phase: str,
    ) -> None:
        if not isinstance(external_session_id, str) or not external_session_id.strip():
            raise StoreError("resumable session ID must be a non-empty string")
        _require_sha256(asset_sha256, "resumable asset_sha256")
        _require_sha256(approval_fingerprint, "resumable approval_fingerprint")
        if isinstance(total_bytes, bool) or not isinstance(total_bytes, int) or total_bytes < 1:
            raise StoreError("resumable total_bytes must be a positive integer")
        if isinstance(offset, bool) or not isinstance(offset, int) or not 0 <= offset <= total_bytes:
            raise StoreError("resumable offset must be within total_bytes")
        if (
            not isinstance(mime_type, str)
            or not mime_type
            or (not mime_type.startswith("video/") and mime_type != "application/octet-stream")
        ):
            raise StoreError("resumable mime_type must be video/* or application/octet-stream")
        if phase not in RESUMABLE_PHASES:
            raise StoreError("invalid resumable upload phase")

    @classmethod
    def _has_valid_resumable_checkpoint(
        cls,
        target: PublicationTarget,
        publication: Publication,
    ) -> bool:
        if target.platform != "youtube" or not target.resumable_session_verified:
            return False
        try:
            cls._validate_resumable_checkpoint_values(
                external_session_id=target.external_session_id or "",
                asset_sha256=target.resumable_asset_sha256 or "",
                approval_fingerprint=target.resumable_approval_fingerprint or "",
                total_bytes=target.resumable_total_bytes,
                mime_type=target.resumable_mime_type or "",
                offset=target.resumable_offset,
                phase=target.resumable_phase or "",
            )
        except StoreError:
            return False
        return (
            target.resumable_asset_sha256 == publication.asset_sha256
            and target.resumable_approval_fingerprint == publication.approval_fingerprint
        )

    @staticmethod
    def _complete_outbox_txn(
        conn: sqlite3.Connection,
        outbox_id: int,
        lease_token: str,
        now: str,
    ) -> bool:
        return (
            conn.execute(
                """
                UPDATE outbox
                SET state = ?, completed_at = ?, lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
                WHERE id = ? AND state = ? AND lease_token = ?
                  AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
                """,
                (
                    OutboxState.COMPLETED.value,
                    now,
                    outbox_id,
                    OutboxState.LEASED.value,
                    lease_token,
                    now,
                ),
            ).rowcount
            == 1
        )

    @staticmethod
    def _reschedule_outbox_txn(
        conn: sqlite3.Connection,
        outbox_id: int,
        lease_token: str,
        available_at: str,
        error: str,
        now: str,
    ) -> bool:
        return (
            conn.execute(
                """
                UPDATE outbox
                SET state = ?, available_at = ?, last_error = ?,
                    lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
                WHERE id = ? AND state = ? AND lease_token = ?
                  AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
                """,
                (
                    OutboxState.PENDING.value,
                    available_at,
                    error,
                    outbox_id,
                    OutboxState.LEASED.value,
                    lease_token,
                    now,
                ),
            ).rowcount
            == 1
        )

    @staticmethod
    def _dead_outbox_txn(
        conn: sqlite3.Connection,
        outbox_id: int,
        lease_token: str,
        now: str,
        error: str,
    ) -> bool:
        return (
            conn.execute(
                """
                UPDATE outbox
                SET state = ?, last_error = ?, lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
                WHERE id = ? AND state = ? AND lease_token = ?
                  AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
                """,
                (
                    OutboxState.DEAD.value,
                    error,
                    outbox_id,
                    OutboxState.LEASED.value,
                    lease_token,
                    now,
                ),
            ).rowcount
            == 1
        )

    def _requeue_target_outbox_txn(
        self,
        conn: sqlite3.Connection,
        publication: Publication,
        target: PublicationTarget,
        generation: int,
        now: str,
    ) -> OutboxItem:
        """Create a fresh dispatch generation; never rearm a conflicting row."""
        dedupe_key = f"target-publish:{publication.id}:{target.platform}:g{generation}"
        existing = conn.execute("SELECT id FROM outbox WHERE dedupe_key = ?", (dedupe_key,)).fetchone()
        if existing is not None:
            raise StoreError("refusing to reuse an existing target publish dispatch generation")
        try:
            conn.execute(
                """
                INSERT INTO outbox(
                    kind, dedupe_key, publication_id, target_id, payload_json, state, available_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "target.publish",
                    dedupe_key,
                    publication.id,
                    target.id,
                    _json(
                        {
                            "publication_id": publication.id,
                            "target_id": target.id,
                            "platform": target.platform,
                            "dispatch_generation": generation,
                        }
                    ),
                    OutboxState.PENDING.value,
                    now,
                    now,
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise StoreError("cannot create a new target publish dispatch generation") from exc
        row = conn.execute("SELECT * FROM outbox WHERE dedupe_key = ?", (dedupe_key,)).fetchone()
        assert row is not None
        return _outbox_from_row(row)

    def _set_publication_publishing_txn(
        self,
        conn: sqlite3.Connection,
        publication: Publication,
        now: str,
        *,
        reason: str,
    ) -> None:
        if publication.state is PublicationState.PUBLISHING:
            return
        conn.execute(
            "UPDATE publications SET state = ?, updated_at = ? WHERE id = ?",
            (PublicationState.PUBLISHING.value, now, publication.id),
        )
        self._append_event_txn(
            conn,
            publication.id,
            "publication.state_changed",
            actor_type="system",
            data={"from": publication.state.value, "to": PublicationState.PUBLISHING.value, "reason": reason},
            now=now,
        )

    def _enqueue_status_update_txn(
        self,
        conn: sqlite3.Connection,
        publication_id: str,
        _event_id: int,
        now: str,
    ) -> OutboxItem:
        """Append a revisioned status delivery; later revisions supersede earlier ones."""
        row = conn.execute(
            "SELECT status_revision FROM publications WHERE id = ?", (publication_id,)
        ).fetchone()
        if row is None:
            raise StoreError(f"unknown publication: {publication_id}")
        revision = int(row["status_revision"]) + 1
        conn.execute(
            "UPDATE publications SET status_revision = ?, updated_at = ? WHERE id = ?",
            (revision, now, publication_id),
        )
        item = self._enqueue_outbox_txn(
            conn,
            kind="telegram.status_card",
            dedupe_key=f"telegram-status:{publication_id}:r{revision}",
            publication_id=publication_id,
            payload={"publication_id": publication_id, "revision": revision},
            now=now,
        )
        if (
            item.kind != "telegram.status_card"
            or item.publication_id != publication_id
            or item.payload != {"publication_id": publication_id, "revision": revision}
        ):
            raise StoreError("refusing to reuse a conflicting Telegram status revision")
        return item

    def _enqueue_telegram_status_repair_txn(
        self,
        conn: sqlite3.Connection,
        publication: Publication,
        *,
        written_revision: int,
        reason: str,
        now: str,
    ) -> OutboxItem:
        """Append the next current-card repair after an unfenced API write."""
        event_id = self._append_event_txn(
            conn,
            publication.id,
            "telegram.status_card_stale_edit_repaired",
            actor_type="telegram_bot",
            data={
                "written_revision": written_revision,
                "current_revision": publication.status_revision,
                "reason": reason,
            },
            now=now,
        )
        return self._enqueue_status_update_txn(conn, publication.id, event_id, now)

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
    ) -> int:
        cursor = conn.execute(
            """
            INSERT INTO publication_events(publication_id, event_type, actor_type, actor_id, data_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (publication_id, event_type, actor_type, actor_id, _json(data), now),
        )
        return int(cursor.lastrowid)

    def _refresh_publication_state_txn(
        self, conn: sqlite3.Connection, publication_id: str, now: str
    ) -> None:
        publication_row = conn.execute("SELECT * FROM publications WHERE id = ?", (publication_id,)).fetchone()
        assert publication_row is not None
        publication = _publication_from_row(publication_row)
        if publication.state in {PublicationState.REVIEW_PENDING, PublicationState.REJECTED}:
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
        active = {
            TargetState.QUEUED,
            TargetState.UPLOADING,
            TargetState.PROCESSING,
            TargetState.RETRY_WAIT,
        }
        if publication.state is PublicationState.APPROVED and all(
            state is TargetState.QUEUED for state in states
        ):
            # Approval itself queues jobs but remains visibly distinct from a
            # worker that has actually started publishing.
            return
        if any(state in active for state in states):
            desired = PublicationState.PUBLISHING
        elif all(state is TargetState.PUBLISHED for state in states):
            desired = PublicationState.PUBLISHED
        elif any(state is TargetState.PUBLISHED for state in states) and all(state in terminal for state in states):
            desired = PublicationState.PARTIAL
        elif all(state in terminal for state in states):
            desired = PublicationState.FAILED
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
