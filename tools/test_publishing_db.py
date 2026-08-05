from pathlib import Path
import tempfile
import unittest

from publishing.db import InvalidTransition, PublishingStore, StoreError, approval_fingerprint
from publishing.models import ExecutionMode, OutboxState, PublicationState, TargetState, TelegramActionKind


SOURCE_SHA = "a" * 64
ASSET_SHA = "b" * 64
METADATA_SHA = "c" * 64


class PublishingStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = PublishingStore(Path(self.tmp.name) / "publisher.sqlite3")

    def create_publication(self, **overrides):
        params = {
            "publication_id": "publication-1",
            "slug": "hash-tables",
            "source_path": "/tmp/source.mp4",
            "source_sha256": SOURCE_SHA,
            "asset_path": "/tmp/asset.mp4",
            "asset_sha256": ASSET_SHA,
            "metadata_path": "/tmp/metadata.json",
            "metadata_sha256": METADATA_SHA,
            "target_platforms": ("youtube", "instagram"),
            "execution_mode": ExecutionMode.DRY_RUN,
        }
        params.update(overrides)
        return self.store.create_publication(**params)

    def test_migrates_with_required_pragmas_and_restart_is_safe(self):
        self.assertEqual(self.store.schema_version(), 1)
        conn = self.store._connect()
        try:
            self.assertEqual(conn.execute("PRAGMA foreign_keys").fetchone()[0], 1)
            self.assertEqual(conn.execute("PRAGMA journal_mode").fetchone()[0].lower(), "wal")
            self.assertEqual(conn.execute("PRAGMA busy_timeout").fetchone()[0], 5000)
        finally:
            conn.close()
        restarted = PublishingStore(self.store.path)
        self.assertEqual(restarted.schema_version(), 1)

    def test_create_is_idempotent_by_immutable_approval_fingerprint(self):
        first = self.create_publication()
        second = self.create_publication(publication_id="publication-2", source_path="/tmp/new-source.mp4")
        self.assertEqual(first.id, second.id)
        self.assertEqual(
            first.approval_fingerprint,
            approval_fingerprint(ASSET_SHA, METADATA_SHA, ExecutionMode.DRY_RUN),
        )
        self.assertEqual(first.state, PublicationState.REVIEW_PENDING)
        self.assertEqual([target.platform for target in self.store.list_targets(first.id)], ["youtube", "instagram"])
        outbox = self.store.list_outbox(publication_id=first.id)
        self.assertEqual([(item.kind, item.dedupe_key) for item in outbox], [
            ("telegram.review_card", "telegram-review-card:publication-1")
        ])

    def test_execution_mode_is_part_of_fingerprint_and_each_mode_is_idempotent(self):
        dry_run = self.create_publication()
        live = self.create_publication(
            publication_id="publication-live",
            execution_mode=ExecutionMode.LIVE,
        )
        self.assertNotEqual(dry_run.id, live.id)
        self.assertNotEqual(dry_run.approval_fingerprint, live.approval_fingerprint)
        self.assertEqual(dry_run.execution_mode, ExecutionMode.DRY_RUN)
        self.assertEqual(live.execution_mode, ExecutionMode.LIVE)
        self.assertEqual(
            self.create_publication(publication_id="dry-run-repeat").id,
            dry_run.id,
        )
        self.assertEqual(
            self.create_publication(
                publication_id="live-repeat",
                execution_mode=ExecutionMode.LIVE,
            ).id,
            live.id,
        )

    def test_rejects_invalid_hashes_and_duplicate_target_inputs(self):
        with self.assertRaisesRegex(StoreError, "SHA-256"):
            self.create_publication(asset_sha256="not-a-hash")
        with self.assertRaisesRegex(StoreError, "unique subset"):
            self.create_publication(target_platforms=("youtube", "youtube"))

    def test_approve_action_is_atomic_and_idempotent_across_duplicate_callbacks(self):
        publication = self.create_publication()
        approve = self.store.issue_telegram_action(publication.id, TelegramActionKind.APPROVE, token="approve-token")
        reject = self.store.issue_telegram_action(publication.id, TelegramActionKind.REJECT, token="reject-token")
        self.assertEqual(self.store.issue_telegram_action(publication.id, "approve").token, approve.token)

        result = self.store.apply_telegram_action(update_id=100, action_token=approve.token, actor_user_id=42)
        self.assertTrue(result.accepted)
        self.assertEqual(result.publication_state, PublicationState.APPROVED)
        self.assertEqual(self.store.get_publication(publication.id).approved_by_user_id, "42")
        self.assertEqual(
            [item.dedupe_key for item in self.store.list_outbox(publication_id=publication.id)],
            [
                "telegram-review-card:publication-1",
                "target-publish:publication-1:youtube",
                "target-publish:publication-1:instagram",
            ],
        )

        duplicate = self.store.apply_telegram_action(update_id=100, action_token=approve.token, actor_user_id=42)
        self.assertFalse(duplicate.accepted)
        self.assertTrue(duplicate.duplicate_update)
        stale = self.store.apply_telegram_action(update_id=101, action_token=reject.token, actor_user_id=42)
        self.assertFalse(stale.accepted)
        self.assertEqual(stale.reason, "action already consumed")
        self.assertEqual(self.store.get_publication(publication.id).state, PublicationState.APPROVED)

    def test_rejection_creates_no_platform_jobs(self):
        publication = self.create_publication()
        reject = self.store.issue_telegram_action(publication.id, "reject", token="reject-token")
        result = self.store.apply_telegram_action(update_id=1, action_token=reject.token, actor_user_id="owner")
        self.assertTrue(result.accepted)
        self.assertEqual(self.store.get_publication(publication.id).state, PublicationState.REJECTED)
        self.assertEqual([item.kind for item in self.store.list_outbox(publication_id=publication.id)], ["telegram.review_card"])

    def test_target_transitions_compute_partial_publication_state(self):
        publication = self.create_publication()
        approve = self.store.issue_telegram_action(publication.id, "approve", token="approve-token")
        self.store.apply_telegram_action(update_id=1, action_token=approve.token, actor_user_id="owner")
        youtube, instagram = self.store.list_targets(publication.id)

        self.store.transition_target(youtube.id, TargetState.UPLOADING, increment_attempts=True)
        self.assertEqual(self.store.get_publication(publication.id).state, PublicationState.PUBLISHING)
        self.store.transition_target(youtube.id, TargetState.PROCESSING)
        self.store.transition_target(youtube.id, TargetState.PUBLISHED)
        self.store.transition_target(instagram.id, TargetState.UPLOADING, increment_attempts=True)
        self.store.transition_target(instagram.id, TargetState.FAILED, error_code="network", error_detail="redacted")
        self.assertEqual(self.store.get_publication(publication.id).state, PublicationState.PARTIAL)
        self.assertEqual(self.store.list_targets(publication.id)[0].attempts, 1)
        with self.assertRaises(InvalidTransition):
            self.store.transition_target(youtube.id, TargetState.UPLOADING)

    def test_outbox_dedupe_lease_and_reclaim_are_durable(self):
        item = self.store.enqueue_outbox(
            kind="test.job",
            dedupe_key="job:one",
            payload={"n": 1},
            available_at="2026-01-01T00:00:00.000000Z",
        )
        again = self.store.enqueue_outbox(kind="ignored", dedupe_key="job:one", payload={"n": 2})
        self.assertEqual(item.id, again.id)
        self.assertEqual(again.kind, "test.job")
        claimed = self.store.claim_outbox("worker-a", lease_seconds=10, now="2026-01-01T00:00:00.000000Z")
        self.assertEqual(claimed.id, item.id)
        self.assertEqual(claimed.state, OutboxState.LEASED)
        self.assertEqual(claimed.attempts, 1)
        self.assertFalse(self.store.complete_outbox(item.id, "wrong-token"))
        self.assertIsNone(self.store.claim_outbox("worker-b", now="2026-01-01T00:00:05.000000Z"))
        reclaimed = self.store.claim_outbox("worker-b", now="2026-01-01T00:00:11.000000Z")
        self.assertEqual(reclaimed.id, item.id)
        self.assertEqual(reclaimed.attempts, 2)
        self.assertTrue(self.store.complete_outbox(item.id, reclaimed.lease_token))
        self.assertEqual(self.store.get_outbox_by_dedupe_key("job:one").state, OutboxState.COMPLETED)

    def test_outbox_target_must_belong_to_its_publication(self):
        first = self.create_publication()
        second = self.create_publication(
            publication_id="publication-2",
            asset_sha256="d" * 64,
            metadata_sha256="e" * 64,
        )
        foreign_target = self.store.list_targets(second.id)[0]
        with self.assertRaisesRegex(StoreError, "does not belong"):
            self.store.enqueue_outbox(
                kind="target.publish",
                dedupe_key="bad-target-link",
                publication_id=first.id,
                target_id=foreign_target.id,
            )

    def test_bot_state_and_event_log_are_persistent(self):
        publication = self.create_publication()
        self.store.set_bot_state("last_update_id", "123")
        self.assertEqual(self.store.get_bot_state("last_update_id"), "123")
        events = self.store.list_events(publication.id)
        self.assertEqual(events[0]["event_type"], "publication.created")
        self.assertEqual(events[0]["data"]["targets"], ["youtube", "instagram"])


if __name__ == "__main__":
    unittest.main()
