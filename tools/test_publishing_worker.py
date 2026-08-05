from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import sha256
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import publish
from publishing.adapters.base import (
    AmbiguousPublishError,
    PermanentPublishError,
    PublishResult,
    RetryablePublishError,
)
from publishing.db import MIGRATIONS, InvalidTransition, PublishingStore
from publishing.metadata import metadata_sha256, write_metadata_snapshot
from publishing.models import ExecutionMode, OutboxState, PublicationState, TargetState
from publishing.worker import PublishWorker, verify_publish_inputs


def metadata() -> dict[str, object]:
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
            "instagram": {
                "caption": "A compact approved caption.",
                "share_to_feed": True,
            },
        },
    }


class Clock:
    def __init__(self, value: str = "2099-01-01T00:00:00.000000Z"):
        self.current = datetime.fromisoformat(value.replace("Z", "+00:00"))

    def __call__(self) -> str:
        return self.current.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")

    def advance(self, seconds: int) -> None:
        self.current += timedelta(seconds=seconds)


class RecordingFactory:
    def __init__(self, outcomes: dict[str, object]):
        self.outcomes = outcomes
        self.factory_calls: list[str] = []
        self.calls: list[object] = []

    def __call__(self, platform: str):
        self.factory_calls.append(platform)
        factory = self

        class Adapter:
            def publish(self, request):
                factory.calls.append(request)
                outcome = factory.outcomes[platform]
                if isinstance(outcome, BaseException):
                    raise outcome
                return outcome

        return Adapter()


class ExplodingFactory:
    def __init__(self):
        self.calls = 0

    def __call__(self, _platform: str):
        self.calls += 1
        raise AssertionError("network-like adapter factory must not be used")


class ExpiringFactory:
    def __init__(self, clock: Clock, seconds: int):
        self.clock = clock
        self.seconds = seconds
        self.factory_calls = 0
        self.publish_calls = 0

    def __call__(self, _platform: str):
        self.factory_calls += 1
        self.clock.advance(self.seconds)
        factory = self

        class Adapter:
            def publish(self, _request):
                factory.publish_calls += 1
                return PublishResult("unexpected", "https://example.invalid/unexpected")

        return Adapter()


class MutatingFactory:
    def __init__(self, asset: Path):
        self.asset = asset
        self.publish_calls = 0

    def __call__(self, _platform: str):
        self.asset.write_bytes(b"tampered while factory was constructing")
        factory = self

        class Adapter:
            def publish(self, _request):
                factory.publish_calls += 1
                return PublishResult("unexpected", "https://example.invalid/unexpected")

        return Adapter()


class PublishWorkerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.store = PublishingStore(self.root / "publisher.sqlite3")
        self.asset = self.root / "asset.mp4"
        self.asset.write_bytes(b"immutable video bytes")
        self.snapshot = write_metadata_snapshot(metadata(), self.root / "metadata")
        self.clock = Clock()
        self._update_id = 1

    def create_publication(
        self,
        *,
        publication_id: str = "publication-1",
        mode: ExecutionMode = ExecutionMode.LIVE,
        platforms: tuple[str, ...] = ("youtube", "instagram"),
    ):
        return self.store.create_publication(
            publication_id=publication_id,
            slug="hash-tables",
            source_path=str(self.root / "source.mp4"),
            source_sha256="a" * 64,
            asset_path=str(self.asset),
            asset_sha256=sha256(self.asset.read_bytes()).hexdigest(),
            metadata_path=str(self.snapshot.path),
            metadata_sha256=metadata_sha256(metadata()),
            target_platforms=platforms,
            execution_mode=mode,
        )

    def approve(self, publication):
        action = self.store.issue_telegram_action(publication.id, "approve")
        result = self.store.apply_telegram_action(
            update_id=self._update_id,
            action_token=action.token,
            actor_user_id="operator",
        )
        self._update_id += 1
        self.assertTrue(result.accepted)

    def target(self, publication, platform: str):
        return next(item for item in self.store.list_targets(publication.id) if item.platform == platform)

    def worker(self, factory=None, **overrides):
        params = {
            "store": self.store,
            "worker_id": "test-worker",
            "adapter_factory": factory,
            "clock": self.clock,
            "lease_seconds": 30,
        }
        params.update(overrides)
        return PublishWorker(**params)

    def test_claim_target_publish_does_not_lease_telegram_rows(self):
        publication = self.create_publication()
        self.approve(publication)
        factory = RecordingFactory(
            {
                "youtube": PublishResult("yt-1", "https://example.invalid/yt-1"),
                "instagram": PublishResult("ig-1", "https://example.invalid/ig-1"),
            }
        )
        result = self.worker(factory).run_once()
        self.assertEqual(result.outcome, "published")
        telegram_rows = [
            item
            for item in self.store.list_outbox(publication_id=publication.id)
            if item.kind.startswith("telegram.")
        ]
        self.assertTrue(telegram_rows)
        self.assertTrue(all(item.state is OutboxState.PENDING for item in telegram_rows))
        self.assertTrue(all(item.lease_owner is None for item in telegram_rows))

    def test_stale_worker_cannot_call_adapter_or_finalize_reclaimed_lease(self):
        publication = self.create_publication(platforms=("youtube",))
        self.approve(publication)
        first = self.store.claim_target_publish("first", lease_seconds=5, now=self.clock())
        self.assertIsNotNone(first)
        self.clock.advance(6)
        second = self.store.claim_target_publish("second", lease_seconds=30, now=self.clock())
        self.assertIsNotNone(second)
        factory = RecordingFactory({"youtube": PublishResult("yt-1", "https://example.invalid/yt-1")})
        stale_worker = self.worker(factory, worker_id="first")
        stale = stale_worker._process_claim(first)
        self.assertEqual(stale.outcome, "skipped_stale_or_invalid")
        self.assertEqual(factory.calls, [])
        self.assertFalse(self.store.complete_outbox(first.id, first.lease_token, now=self.clock()))
        self.assertFalse(
            self.store.reschedule_outbox(
                first.id,
                first.lease_token,
                available_at=self.clock(),
                error="stale",
                now=self.clock(),
            )
        )
        self.assertFalse(self.store.dead_outbox(first.id, first.lease_token, error="stale", now=self.clock()))
        self.assertEqual(self.worker(factory, worker_id="second")._process_claim(second).outcome, "published")
        self.assertEqual(len(factory.calls), 1)

    def test_reclaimed_live_job_that_started_is_reconciliation_not_blind_retry(self):
        publication = self.create_publication(platforms=("youtube",))
        self.approve(publication)
        first = self.store.claim_target_publish("first", lease_seconds=5, now=self.clock())
        self.assertIsNotNone(first)
        self.assertIsNotNone(self.store.start_target_publish(first.id, first.lease_token, now=self.clock()))
        self.clock.advance(6)
        factory = ExplodingFactory()
        result = self.worker(factory, worker_id="second").run_once()
        self.assertEqual(result.outcome, "skipped_stale_or_invalid")
        self.assertEqual(factory.calls, 0)
        target = self.target(publication, "youtube")
        self.assertEqual(target.state, TargetState.RECONCILIATION_REQUIRED)
        self.assertEqual(
            self.store.get_outbox_by_dedupe_key(f"target-publish:{publication.id}:youtube:g0").state,
            OutboxState.DEAD,
        )

    def test_factory_cannot_run_adapter_after_lease_expires(self):
        publication = self.create_publication(platforms=("youtube",))
        self.approve(publication)
        factory = ExpiringFactory(self.clock, seconds=31)
        result = self.worker(factory, lease_seconds=30).run_once()
        self.assertEqual(result.outcome, "skipped_stale_lease")
        self.assertEqual(factory.factory_calls, 1)
        self.assertEqual(factory.publish_calls, 0)

    def test_factory_time_tamper_is_reverified_before_adapter_call(self):
        publication = self.create_publication(platforms=("youtube",))
        self.approve(publication)
        factory = MutatingFactory(self.asset)
        result = self.worker(factory).run_once()
        self.assertEqual(result.outcome, "permanent_failure")
        self.assertEqual(factory.publish_calls, 0)
        self.assertEqual(self.target(publication, "youtube").state, TargetState.FAILED)

    def test_second_immutable_verification_cannot_expire_lease_before_adapter_call(self):
        publication = self.create_publication(platforms=("youtube",))
        self.approve(publication)
        factory = RecordingFactory(
            {"youtube": PublishResult("yt-1", "https://example.invalid/yt-1")}
        )
        real_verify = verify_publish_inputs
        verification_count = 0

        def slow_second_verify(current_publication):
            nonlocal verification_count
            verified = real_verify(current_publication)
            verification_count += 1
            if verification_count == 2:
                self.clock.advance(31)
            return verified

        with patch("publishing.worker.verify_publish_inputs", side_effect=slow_second_verify):
            result = self.worker(factory, lease_seconds=30).run_once()
        self.assertEqual(result.outcome, "skipped_stale_lease")
        self.assertEqual(verification_count, 2)
        self.assertEqual(factory.calls, [])

    def test_retryable_error_uses_bounded_exponential_backoff_then_fails(self):
        publication = self.create_publication(platforms=("youtube",))
        self.approve(publication)
        retryable = RetryablePublishError("provider_unavailable", "temporary provider outage")
        factory = RecordingFactory({"youtube": retryable})
        worker = self.worker(factory, max_attempts=3, base_backoff_seconds=10, max_backoff_seconds=30)

        first = worker.run_once()
        self.assertEqual(first.outcome, "retry_wait")
        target = self.target(publication, "youtube")
        self.assertEqual(target.state, TargetState.RETRY_WAIT)
        self.assertEqual(target.next_attempt_at, "2099-01-01T00:00:10.000000Z")
        outbox = self.store.get_outbox_by_dedupe_key(f"target-publish:{publication.id}:youtube:g0")
        self.assertEqual((outbox.state, outbox.attempts), (OutboxState.PENDING, 1))

        self.clock.advance(10)
        second = worker.run_once()
        self.assertEqual(second.outcome, "retry_wait")
        self.assertEqual(self.target(publication, "youtube").next_attempt_at, "2099-01-01T00:00:30.000000Z")

        self.clock.advance(20)
        third = worker.run_once()
        self.assertEqual(third.outcome, "permanent_failure")
        target = self.target(publication, "youtube")
        self.assertEqual((target.state, target.attempts), (TargetState.FAILED, 3))
        self.assertEqual(self.store.get_outbox_by_dedupe_key(outbox.dedupe_key).state, OutboxState.DEAD)
        self.assertEqual(self.store.get_publication(publication.id).state, PublicationState.FAILED)

    def test_permanent_and_ambiguous_errors_have_different_terminal_states(self):
        permanent_publication = self.create_publication(platforms=("youtube",))
        self.approve(permanent_publication)
        permanent = self.worker(
            RecordingFactory({"youtube": PermanentPublishError("bad_metadata", "provider rejected metadata")})
        ).run_once()
        self.assertEqual(permanent.outcome, "permanent_failure")
        permanent_target = self.target(permanent_publication, "youtube")
        self.assertEqual(permanent_target.state, TargetState.FAILED)

        # A separate store avoids approval-fingerprint idempotency collision.
        self.store = PublishingStore(self.root / "ambiguous.sqlite3")
        ambiguous_publication = self.create_publication(platforms=("youtube",))
        self.approve(ambiguous_publication)
        ambiguous = self.worker(
            RecordingFactory(
                {
                    "youtube": AmbiguousPublishError(
                        "timeout_after_upload", "provider timed out after accepting bytes", external_session_id="session-7"
                    )
                }
            )
        ).run_once()
        self.assertEqual(ambiguous.outcome, "reconciliation_required")
        target = self.target(ambiguous_publication, "youtube")
        self.assertEqual(target.state, TargetState.RECONCILIATION_REQUIRED)
        self.assertEqual(target.external_session_id, "session-7")
        outbox = self.store.get_outbox_by_dedupe_key(f"target-publish:{ambiguous_publication.id}:youtube:g0")
        self.assertEqual(outbox.state, OutboxState.DEAD)
        with self.assertRaises(InvalidTransition):
            self.store.retry_failed_target(target.id)

    def test_invalid_adapter_response_after_call_requires_reconciliation(self):
        publication = self.create_publication(platforms=("youtube",))
        self.approve(publication)
        result = self.worker(RecordingFactory({"youtube": object()})).run_once()
        self.assertEqual(result.outcome, "reconciliation_required")
        target = self.target(publication, "youtube")
        self.assertEqual(target.state, TargetState.RECONCILIATION_REQUIRED)
        self.assertEqual(
            self.store.get_outbox_by_dedupe_key(f"target-publish:{publication.id}:youtube:g0").state,
            OutboxState.DEAD,
        )

    def test_invalid_adapter_session_id_requires_reconciliation_before_completion(self):
        publication = self.create_publication(platforms=("youtube",))
        self.approve(publication)
        result = self.worker(
            RecordingFactory({"youtube": PublishResult("yt-1", "https://example.invalid/yt-1", "")})
        ).run_once()
        self.assertEqual(result.outcome, "reconciliation_required")
        target = self.target(publication, "youtube")
        self.assertEqual(target.state, TargetState.RECONCILIATION_REQUIRED)
        self.assertIsNone(target.external_session_id)
        self.assertEqual(
            self.store.get_outbox_by_dedupe_key(f"target-publish:{publication.id}:youtube:g0").state,
            OutboxState.DEAD,
        )

    def test_explicit_retry_and_reconciliation_use_new_dispatch_generations(self):
        publication = self.create_publication(platforms=("youtube",))
        self.approve(publication)
        factory = RecordingFactory(
            {
                "youtube": PermanentPublishError(
                    "forbidden", "not allowed", external_session_id="failed-session"
                )
            }
        )
        self.worker(factory).run_once()
        failed = self.target(publication, "youtube")
        self.assertEqual(failed.external_session_id, "failed-session")
        retried = self.store.retry_failed_target(failed.id, now=self.clock())
        self.assertEqual((retried.state, retried.dispatch_generation), (TargetState.QUEUED, 1))
        self.assertIsNone(retried.external_session_id)
        self.assertIsNone(retried.external_media_id)
        self.assertIsNone(retried.external_url)
        self.assertIsNone(retried.published_at)
        self.assertEqual(self.store.get_publication(publication.id).state, PublicationState.PUBLISHING)
        second_job = self.store.get_outbox_by_dedupe_key(f"target-publish:{publication.id}:youtube:g1")
        self.assertEqual(second_job.state, OutboxState.PENDING)
        self.assertEqual(
            self.store.get_outbox_by_dedupe_key(f"target-publish:{publication.id}:youtube:g0").state,
            OutboxState.DEAD,
        )

        # Force an ambiguous current generation, then require explicit absent
        # confirmation before a further requeue.
        self.worker(
            RecordingFactory(
                {
                    "youtube": AmbiguousPublishError(
                        "unknown", "unknown provider outcome", external_session_id="ambiguous-session"
                    )
                }
            )
        ).run_once()
        reconciliation = self.target(publication, "youtube")
        self.assertEqual(reconciliation.state, TargetState.RECONCILIATION_REQUIRED)
        self.assertEqual(reconciliation.external_session_id, "ambiguous-session")
        with self.assertRaisesRegex(Exception, "confirmed_absent"):
            self.store.reconcile_target(reconciliation.id, outcome="requeue", now=self.clock())
        requeued = self.store.reconcile_target(
            reconciliation.id,
            outcome="requeue",
            confirmed_absent=True,
            now=self.clock(),
        )
        self.assertEqual((requeued.state, requeued.dispatch_generation), (TargetState.QUEUED, 2))
        self.assertIsNone(requeued.external_session_id)
        self.assertIsNone(requeued.external_media_id)
        self.assertIsNone(requeued.external_url)
        self.assertIsNone(requeued.published_at)
        self.assertEqual(
            self.store.get_outbox_by_dedupe_key(f"target-publish:{publication.id}:youtube:g2").state,
            OutboxState.PENDING,
        )

    def test_reconcile_mark_published_refreshes_failed_and_partial_aggregate(self):
        failed_publication = self.create_publication(platforms=("youtube",))
        self.approve(failed_publication)
        self.worker(
            RecordingFactory({"youtube": AmbiguousPublishError("unknown", "unknown provider outcome")})
        ).run_once()
        self.assertEqual(self.store.get_publication(failed_publication.id).state, PublicationState.FAILED)
        self.store.reconcile_target(
            self.target(failed_publication, "youtube").id,
            outcome="mark-published",
            external_media_id="yt-reconciled",
            external_url="https://example.invalid/yt-reconciled",
            now=self.clock(),
        )
        self.assertEqual(self.store.get_publication(failed_publication.id).state, PublicationState.PUBLISHED)

        self.store = PublishingStore(self.root / "partial.sqlite3")
        partial_publication = self.create_publication(platforms=("youtube", "instagram"))
        self.approve(partial_publication)
        factory = RecordingFactory(
            {
                "youtube": PublishResult("yt-ok", "https://example.invalid/yt-ok"),
                "instagram": AmbiguousPublishError("unknown", "unknown provider outcome"),
            }
        )
        worker = self.worker(factory)
        self.assertEqual(worker.run_once().outcome, "published")
        self.assertEqual(worker.run_once().outcome, "reconciliation_required")
        self.assertEqual(self.store.get_publication(partial_publication.id).state, PublicationState.PARTIAL)
        self.store.reconcile_target(
            self.target(partial_publication, "instagram").id,
            outcome="mark-published",
            external_media_id="ig-reconciled",
            external_url="https://example.invalid/ig-reconciled",
            now=self.clock(),
        )
        self.assertEqual(self.store.get_publication(partial_publication.id).state, PublicationState.PUBLISHED)

    def test_dry_run_never_uses_network_like_factory_and_finishes_targets_independently(self):
        publication = self.create_publication(mode=ExecutionMode.DRY_RUN)
        self.approve(publication)
        factory = ExplodingFactory()
        worker = self.worker(factory)
        with patch("socket.create_connection", side_effect=AssertionError("network is forbidden")):
            first = worker.run_once()
            second = worker.run_once()
        self.assertEqual([first.outcome, second.outcome], ["published", "published"])
        self.assertEqual(factory.calls, 0)
        targets = self.store.list_targets(publication.id)
        self.assertTrue(all(target.state is TargetState.PUBLISHED for target in targets))
        self.assertEqual(len({target.external_media_id for target in targets}), 2)
        self.assertTrue(all(target.external_url.startswith("https://dry-run.invalid/") for target in targets))
        self.assertIsNone(worker.run_once())

    def test_tampered_asset_is_terminal_before_factory_or_adapter_call(self):
        publication = self.create_publication(platforms=("youtube",))
        self.approve(publication)
        self.asset.write_bytes(b"tampered after approval")
        factory = ExplodingFactory()
        result = self.worker(factory).run_once()
        self.assertEqual(result.outcome, "permanent_failure")
        self.assertEqual(factory.calls, 0)
        self.assertEqual(self.target(publication, "youtube").state, TargetState.FAILED)
        self.assertEqual(
            self.store.get_outbox_by_dedupe_key(f"target-publish:{publication.id}:youtube:g0").state,
            OutboxState.DEAD,
        )

    def test_unapproved_or_payload_tampered_job_never_reaches_factory(self):
        publication = self.create_publication(platforms=("youtube",))
        target = self.target(publication, "youtube")
        with self.store._write_transaction() as conn:
            conn.execute(
                """
                INSERT INTO outbox(
                    kind, dedupe_key, publication_id, target_id, payload_json, state, available_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "target.publish",
                    "manual-invalid-job",
                    publication.id,
                    target.id,
                    json.dumps(
                        {
                            "publication_id": publication.id,
                            "target_id": target.id,
                            "platform": "youtube",
                        }
                    ),
                    "pending",
                    self.clock(),
                    self.clock(),
                ),
            )
        factory = ExplodingFactory()
        result = self.worker(factory).run_once()
        self.assertEqual(result.outcome, "skipped_stale_or_invalid")
        self.assertEqual(factory.calls, 0)
        self.assertEqual(self.store.get_outbox_by_dedupe_key("manual-invalid-job").state, OutboxState.DEAD)

        self.store = PublishingStore(self.root / "payload-tampered.sqlite3")
        approved = self.create_publication(platforms=("youtube",))
        self.approve(approved)
        target = self.target(approved, "youtube")
        job_key = f"target-publish:{approved.id}:youtube:g0"
        with self.store._write_transaction() as conn:
            conn.execute(
                "UPDATE outbox SET payload_json = ? WHERE dedupe_key = ?",
                (
                    json.dumps(
                        {
                            "publication_id": approved.id,
                            "target_id": target.id,
                            "platform": "instagram",
                            "dispatch_generation": 0,
                        }
                    ),
                    job_key,
                ),
            )
        factory = ExplodingFactory()
        self.assertEqual(self.worker(factory).run_once().outcome, "skipped_stale_or_invalid")
        self.assertEqual(factory.calls, 0)
        self.assertEqual(self.store.get_outbox_by_dedupe_key(job_key).state, OutboxState.DEAD)

    def test_v1_database_upgrades_append_only_to_v2(self):
        legacy_path = self.root / "legacy.sqlite3"
        conn = sqlite3.connect(legacy_path)
        try:
            conn.execute("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)")
            for statement in MIGRATIONS[0][1]:
                conn.execute(statement)
            now = "2026-01-01T00:00:00.000000Z"
            conn.execute(
                """
                INSERT INTO publications(
                    id, slug, state, execution_mode, source_path, source_sha256, asset_path, asset_sha256,
                    metadata_path, metadata_sha256, approval_fingerprint, approved_at, approved_by_user_id,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "legacy-publication",
                    "hash-tables",
                    "approved",
                    "dry-run",
                    "/tmp/source.mp4",
                    "a" * 64,
                    "/tmp/asset.mp4",
                    "b" * 64,
                    "/tmp/metadata.json",
                    "c" * 64,
                    "d" * 64,
                    now,
                    "operator",
                    now,
                    now,
                ),
            )
            conn.execute(
                """
                INSERT INTO publication_targets(publication_id, platform, state, attempts, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                ("legacy-publication", "youtube", "queued", 2, now, now),
            )
            conn.execute(
                "INSERT INTO schema_migrations(version, applied_at) VALUES (1, '2026-01-01T00:00:00.000000Z')"
            )
            conn.commit()
        finally:
            conn.close()
        upgraded = PublishingStore(legacy_path)
        self.assertEqual(upgraded.schema_version(), 2)
        conn = upgraded._connect()
        try:
            publication_columns = {row["name"] for row in conn.execute("PRAGMA table_info(publications)")}
            target_columns = {row["name"] for row in conn.execute("PRAGMA table_info(publication_targets)")}
        finally:
            conn.close()
        self.assertIn("status_revision", publication_columns)
        self.assertIn("dispatch_generation", target_columns)
        legacy_publication = upgraded.get_publication("legacy-publication")
        legacy_target = upgraded.list_targets("legacy-publication")[0]
        self.assertEqual(legacy_publication.status_revision, 0)
        self.assertEqual((legacy_target.attempts, legacy_target.dispatch_generation), (2, 0))

    def test_cli_retry_and_reconcile_require_explicit_safe_outcomes(self):
        publication = self.create_publication(platforms=("youtube",))
        self.approve(publication)
        target = self.target(publication, "youtube")
        self.store.transition_target(target.id, TargetState.UPLOADING)
        self.store.transition_target(target.id, TargetState.FAILED, error_code="bad", error_detail="bad")
        stdout = io.StringIO()
        with patch("sys.stdout", stdout):
            self.assertEqual(
                publish.main(
                    [
                        "retry",
                        "--state-dir",
                        str(self.root),
                        "--publication-id",
                        publication.id,
                        "--target",
                        "youtube",
                    ]
                ),
                0,
            )
        self.assertEqual(json.loads(stdout.getvalue())["state"], "queued")
        target = self.target(publication, "youtube")
        self.store.transition_target(target.id, TargetState.UPLOADING)
        self.store.transition_target(target.id, TargetState.RECONCILIATION_REQUIRED, error_code="unknown", error_detail="unknown")
        with patch("sys.stderr", io.StringIO()):
            self.assertEqual(
                publish.main(
                    [
                        "reconcile",
                        "--state-dir",
                        str(self.root),
                        "--publication-id",
                        publication.id,
                        "--target",
                        "youtube",
                        "--outcome",
                        "requeue",
                    ]
                ),
                2,
            )
        with patch("sys.stdout", stdout := io.StringIO()):
            self.assertEqual(
                publish.main(
                    [
                        "reconcile",
                        "--state-dir",
                        str(self.root),
                        "--publication-id",
                        publication.id,
                        "--target",
                        "youtube",
                        "--outcome",
                        "mark-published",
                        "--external-id",
                        "yt-operator",
                        "--external-url",
                        "https://example.invalid/yt-operator",
                    ]
                ),
                0,
            )
        self.assertEqual(json.loads(stdout.getvalue())["state"], "published")


if __name__ == "__main__":
    unittest.main()
