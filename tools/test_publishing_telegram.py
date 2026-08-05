from __future__ import annotations

import contextlib
from datetime import datetime, timedelta, timezone
from fractions import Fraction
from hashlib import sha256
import io
from pathlib import Path
import tempfile
import urllib.error
import unittest
from unittest.mock import patch

from publishing.db import PublishingStore
from publishing.metadata import metadata_sha256, write_metadata_snapshot
from publishing.models import ExecutionMode, OutboxState, PublicationState, TargetState
from publishing.preflight import MediaProbe
from publishing.review import ReviewError, VerifiedReview
from publishing.telegram import (
    UPDATE_CURSOR_KEY,
    TelegramApprovalSettings,
    TelegramReviewService,
    callback_data,
    parse_callback_data,
)
from telegram_bot import TelegramApi, TelegramError, TelegramMessageNotModified


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


class StatusClock:
    def __init__(self, value: str = "2099-01-01T00:00:00.000000Z"):
        self.current = datetime.fromisoformat(value.replace("Z", "+00:00"))

    def __call__(self) -> str:
        return self.current.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")

    def advance(self, seconds: int) -> None:
        self.current += timedelta(seconds=seconds)


class FakeTelegramApi:
    """No-network Bot API double with controllable long-polling behaviour."""

    def __init__(
        self,
        *,
        updates: list[dict[str, object]] | None = None,
        ignore_offset: bool = False,
        event_log: list[str] | None = None,
    ):
        self.updates = updates or []
        self.ignore_offset = ignore_offset
        self.calls: list[tuple[str, object]] = []
        self.video_calls: list[tuple[str, Path, str]] = []
        self.message_calls: list[dict[str, object]] = []
        self.answer_calls: list[dict[str, object]] = []
        self.fail_next_card = False
        self.event_log = event_log

    def get_updates(self, *, offset=None, timeout=0, limit=100):
        self.calls.append(("get_updates", {"offset": offset, "timeout": timeout, "limit": limit}))
        if self.ignore_offset or offset is None:
            return list(self.updates)
        return [update for update in self.updates if int(update["update_id"]) >= offset]

    def send_video(self, chat_id, video_path, caption=None):
        self.video_calls.append((str(chat_id), Path(video_path), str(caption)))
        self.calls.append(("send_video", None))
        return {"message_id": 101}

    def send_message(self, chat_id, text, *, reply_markup=None, reply_to_message_id=None):
        self.message_calls.append(
            {
                "chat_id": str(chat_id),
                "text": text,
                "reply_markup": reply_markup,
                "reply_to_message_id": reply_to_message_id,
            }
        )
        self.calls.append(("send_message", None))
        if self.fail_next_card:
            self.fail_next_card = False
            raise TelegramError("planned sendMessage failure")
        return {"message_id": 202}

    def answer_callback_query(self, callback_query_id, *, text=None, show_alert=False):
        self.answer_calls.append(
            {"id": callback_query_id, "text": text, "show_alert": show_alert}
        )
        self.calls.append(("answer_callback_query", callback_query_id))
        if self.event_log is not None:
            self.event_log.append("answer")
        return True

    def edit_message_text(self, chat_id, message_id, text, *, reply_markup=None):
        self.calls.append(("edit_message_text", {"chat_id": str(chat_id), "message_id": message_id, "text": text, "reply_markup": reply_markup}))
        return {"message_id": message_id}

    def edit_message_reply_markup(self, chat_id, message_id, *, reply_markup=None):
        self.calls.append(("edit_message_reply_markup", {"chat_id": str(chat_id), "message_id": message_id, "reply_markup": reply_markup}))
        return {"message_id": message_id}


class RecordingStore(PublishingStore):
    def __init__(self, *args, event_log: list[str], **kwargs):
        self.event_log = event_log
        super().__init__(*args, **kwargs)

    def apply_telegram_action(self, **kwargs):
        self.event_log.append("apply")
        return super().apply_telegram_action(**kwargs)


class TransportSpy(TelegramApi):
    def __init__(self):
        super().__init__("not-a-real-token")
        self.calls: list[tuple[str, dict[str, object]]] = []

    def _json_call(self, method, payload):
        self.calls.append((method, payload))
        if method == "getUpdates":
            return []
        if method == "answerCallbackQuery":
            return True
        return {"message_id": 1}


class TelegramApprovalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.store = PublishingStore(self.root / "publisher.sqlite3")
        self.settings = TelegramApprovalSettings(allowed_chat_id="-100001", allowed_user_id="42")
        self.asset = self.root / "asset.mp4"
        self.asset.write_bytes(b"immutable video bytes")
        self.metadata = metadata()
        self.metadata_snapshot = write_metadata_snapshot(self.metadata, self.root / "metadata")

    def create_publication(self, *, publication_id="publication-1", asset=None):
        asset_path = Path(asset) if asset is not None else self.asset
        return self.store.create_publication(
            publication_id=publication_id,
            slug="hash-tables",
            source_path=str(self.root / "source.mp4"),
            source_sha256="a" * 64,
            asset_path=str(asset_path),
            asset_sha256=sha256(asset_path.read_bytes()).hexdigest(),
            metadata_path=str(self.metadata_snapshot.path),
            metadata_sha256=metadata_sha256(self.metadata),
            target_platforms=("youtube", "instagram"),
            execution_mode=ExecutionMode.LIVE,
        )

    def review_loader(self, publication):
        return VerifiedReview(
            asset_path=Path(publication.asset_path),
            metadata=self.metadata,
            probe=MediaProbe(
                path=Path(publication.asset_path),
                duration_seconds=59.5,
                byte_count=self.asset.stat().st_size,
                codec_name="h264",
                profile="High",
                pixel_format="yuv420p",
                width=1080,
                height=1920,
                frame_rate=Fraction(30, 1),
                audio=None,
            ),
        )

    def service(self, api, **overrides):
        return TelegramReviewService(
            store=self.store,
            api=api,
            settings=self.settings,
            review_loader=self.review_loader,
            **overrides,
        )

    def deliver(self, api=None):
        api = api or FakeTelegramApi()
        publication = self.create_publication()
        self.service(api).deliver_review(publication.id)
        return publication, api

    @staticmethod
    def callback_update(update_id, data, *, user_id=42, chat_id="-100001", callback_id="cb-1"):
        return {
            "update_id": update_id,
            "callback_query": {
                "id": callback_id,
                "from": {"id": user_id},
                "message": {"chat": {"id": chat_id}},
                "data": data,
            },
        }

    def test_transport_payloads_cover_callback_query_and_inline_markup(self):
        api = TransportSpy()
        self.assertEqual(api.get_updates(offset=7, timeout=13), [])
        api.send_message("chat", "review", reply_markup={"inline_keyboard": []}, reply_to_message_id=5)
        api.answer_callback_query("callback", text="received")
        api.edit_message_text("chat", 2, "approved", reply_markup={"inline_keyboard": []})
        api.edit_message_reply_markup("chat", 2, reply_markup={"inline_keyboard": []})

        self.assertEqual(api.calls[0][0], "getUpdates")
        self.assertEqual(
            api.calls[0][1]["allowed_updates"], ["message", "channel_post", "callback_query"]
        )
        self.assertEqual(api.calls[1][1]["reply_markup"], {"inline_keyboard": []})
        self.assertEqual(api.calls[1][1]["reply_to_message_id"], 5)
        self.assertEqual(
            [method for method, _ in api.calls[2:]],
            ["answerCallbackQuery", "editMessageText", "editMessageReplyMarkup"],
        )

    def test_transport_classifies_message_not_modified_without_exposing_response_text(self):
        api = TelegramApi("not-a-real-token")
        response = io.BytesIO(
            b'{"ok": false, "description": "Bad Request: message is not modified: diagnostic"}'
        )
        with patch("urllib.request.urlopen", return_value=response):
            with self.assertRaises(TelegramMessageNotModified) as caught:
                api.edit_message_text("chat", 2, "unchanged", reply_markup={"inline_keyboard": []})
        self.assertEqual(str(caught.exception), "Telegram API: message is not modified")

        http_error = urllib.error.HTTPError(
            "https://api.telegram.org/botnot-a-real-token/editMessageText",
            400,
            "Bad Request",
            None,
            io.BytesIO(b'{"ok": false, "description": "Bad Request: message is not modified"}'),
        )
        with patch("urllib.request.urlopen", side_effect=http_error):
            with self.assertRaises(TelegramMessageNotModified) as caught_http:
                api.edit_message_text("chat", 2, "unchanged", reply_markup={"inline_keyboard": []})
        self.assertEqual(str(caught_http.exception), "Telegram API: message is not modified")

    def test_review_partial_retry_persists_video_before_card_and_skips_reupload(self):
        publication = self.create_publication()
        api = FakeTelegramApi()
        api.fail_next_card = True
        service = self.service(api)
        with self.assertRaisesRegex(TelegramError, "planned sendMessage failure"):
            service.deliver_review(publication.id)

        partial = self.store.get_publication(publication.id)
        self.assertEqual(partial.review_video_message_id, 101)
        self.assertIsNone(partial.review_card_message_id)
        self.assertEqual(len(api.video_calls), 1)
        self.assertEqual(
            self.store.get_outbox_by_dedupe_key("telegram-review-card:publication-1").state,
            OutboxState.PENDING,
        )

        restarted = TelegramReviewService(
            store=PublishingStore(self.store.path),
            api=api,
            settings=self.settings,
            review_loader=self.review_loader,
        )
        delivered = restarted.deliver_pending_reviews()
        self.assertEqual([(item.video_message_id, item.card_message_id) for item in delivered], [(101, 202)])
        self.assertEqual(len(api.video_calls), 1)
        complete = self.store.get_publication(publication.id)
        self.assertEqual(complete.review_card_message_id, 202)
        self.assertEqual(
            self.store.get_outbox_by_dedupe_key("telegram-review-card:publication-1").state,
            OutboxState.COMPLETED,
        )

    def test_callback_data_is_short_and_opaque(self):
        publication, api = self.deliver()
        markup = api.message_calls[0]["reply_markup"]
        values = [button["callback_data"] for button in markup["inline_keyboard"][0]]
        self.assertEqual(len(values), 2)
        self.assertTrue(all(len(value.encode("utf-8")) <= 64 for value in values))
        self.assertTrue(all(publication.id not in value and publication.slug not in value for value in values))
        self.assertEqual(parse_callback_data(values[0])[0].value, "approve")
        self.assertIsNone(parse_callback_data("sv1:a:" + "x" * 100))

    def test_unauthorized_and_wrong_chat_are_answered_without_state_transition(self):
        publication, delivery_api = self.deliver()
        approve_data = delivery_api.message_calls[0]["reply_markup"]["inline_keyboard"][0][0]["callback_data"]
        api = FakeTelegramApi(
            updates=[
                self.callback_update(10, approve_data, user_id=99, callback_id="bad-user"),
                self.callback_update(11, approve_data, chat_id="-999", callback_id="bad-chat"),
            ]
        )
        self.service(api).poll_once(timeout=0)

        self.assertEqual([call["id"] for call in api.answer_calls], ["bad-user", "bad-chat"])
        self.assertTrue(all(call["show_alert"] for call in api.answer_calls))
        self.assertEqual(self.store.get_publication(publication.id).state, PublicationState.REVIEW_PENDING)
        self.assertEqual(self.store.get_bot_state(UPDATE_CURSOR_KEY), "11")
        self.assertEqual(
            [item.kind for item in self.store.list_outbox(publication_id=publication.id)],
            ["telegram.review_card"],
        )

    def test_unknown_callback_is_answered_and_cursor_is_durable(self):
        self.create_publication()
        api = FakeTelegramApi(updates=[self.callback_update(9, "sv1:a:unknown-token", callback_id="unknown")])
        self.service(api).poll_once(timeout=0)
        self.assertEqual(api.answer_calls, [{"id": "unknown", "text": "Unknown or expired action", "show_alert": True}])
        self.assertEqual(self.store.get_bot_state(UPDATE_CURSOR_KEY), "9")

    def test_duplicate_callback_after_restart_uses_durable_cursor_and_creates_no_new_jobs(self):
        publication, delivery_api = self.deliver()
        approve_data = delivery_api.message_calls[0]["reply_markup"]["inline_keyboard"][0][0]["callback_data"]
        update = self.callback_update(50, approve_data, callback_id="first")
        first_api = FakeTelegramApi(updates=[update])
        self.service(first_api).poll_once(timeout=0)
        self.assertEqual(self.store.get_publication(publication.id).state, PublicationState.APPROVED)
        self.assertEqual(self.store.get_bot_state(UPDATE_CURSOR_KEY), "50")
        expected_jobs = [
            "telegram.review_card",
            "target.publish",
            "target.publish",
            "telegram.status_card",
        ]
        self.assertEqual(
            [item.kind for item in self.store.list_outbox(publication_id=publication.id)], expected_jobs
        )

        # Simulate a stale redelivery despite the durable offset.  The bot
        # requests 51 after restart, apply_telegram_action then still makes
        # the duplicated update harmless if Telegram returns it anyway.
        restarted_api = FakeTelegramApi(updates=[update], ignore_offset=True)
        restarted = TelegramReviewService(
            store=PublishingStore(self.store.path),
            api=restarted_api,
            settings=self.settings,
            review_loader=self.review_loader,
        )
        restarted.poll_once(timeout=0)
        self.assertEqual(restarted_api.calls[0][1]["offset"], 51)
        self.assertEqual(
            [item.kind for item in self.store.list_outbox(publication_id=publication.id)], expected_jobs
        )
        self.assertEqual(self.store.get_bot_state(UPDATE_CURSOR_KEY), "50")

    def test_authorized_callback_answers_before_atomic_apply_and_queues_versioned_status_edit(self):
        events: list[str] = []
        self.store = RecordingStore(self.root / "publisher.sqlite3", event_log=events)
        publication, delivery_api = self.deliver()
        approve_data = delivery_api.message_calls[0]["reply_markup"]["inline_keyboard"][0][0]["callback_data"]
        api = FakeTelegramApi(
            updates=[self.callback_update(71, approve_data, callback_id="approve")], event_log=events
        )
        self.service(api).poll_once(timeout=0)

        self.assertEqual(events[:2], ["answer", "apply"])
        self.assertFalse(any(call[0] == "edit_message_text" for call in api.calls))
        self.assertTrue(
            any(
                item.kind == "telegram.status_card" and item.state is OutboxState.PENDING
                for item in self.store.list_outbox(publication_id=publication.id)
            )
        )
        self.service(api).deliver_pending_status_updates()
        self.assertTrue(any(call[0] == "edit_message_text" for call in api.calls))
        status_edit = next(payload for method, payload in api.calls if method == "edit_message_text")
        self.assertEqual(status_edit["reply_markup"], {"inline_keyboard": []})
        self.assertEqual(self.store.get_publication(publication.id).state, PublicationState.APPROVED)

    def test_durable_status_updates_edit_existing_card_without_resending_video_or_buttons(self):
        publication, api = self.deliver()
        approve = self.store.issue_telegram_action(publication.id, "approve")
        self.store.apply_telegram_action(update_id=91, action_token=approve.token, actor_user_id="42")
        youtube = self.store.list_targets(publication.id)[0]
        self.store.transition_target(youtube.id, TargetState.UPLOADING)
        self.store.transition_target(youtube.id, TargetState.PUBLISHED)

        calls_before = len(api.calls)
        video_calls_before = len(api.video_calls)
        message_calls_before = len(api.message_calls)
        delivered = self.service(api).deliver_pending_status_updates()

        self.assertTrue(any(not result.skipped_stale for result in delivered))
        self.assertEqual(len(api.video_calls), video_calls_before)
        self.assertEqual(len(api.message_calls), message_calls_before)
        new_methods = [method for method, _ in api.calls[calls_before:]]
        self.assertEqual(new_methods, ["edit_message_text"])
        self.assertEqual(api.calls[-1][1]["reply_markup"], {"inline_keyboard": []})
        status_rows = [
            item for item in self.store.list_outbox(publication_id=publication.id) if item.kind == "telegram.status_card"
        ]
        self.assertTrue(status_rows)
        self.assertTrue(all(item.state is OutboxState.COMPLETED for item in status_rows))

    def test_status_delivery_failure_isolated_and_keeps_durable_retry(self):
        publication, delivery_api = self.deliver()
        approve = self.store.issue_telegram_action(publication.id, "approve")
        self.store.apply_telegram_action(update_id=92, action_token=approve.token, actor_user_id="42")

        class FailingEditApi(FakeTelegramApi):
            def edit_message_text(self, *args, **kwargs):
                raise TelegramError("planned edit failure")

        service = self.service(FailingEditApi())
        delivered = service.deliver_pending_status_updates()
        self.assertEqual(delivered, [])
        self.assertEqual(len(service.last_status_failures), 1)
        status_rows = [
            item for item in self.store.list_outbox(publication_id=publication.id) if item.kind == "telegram.status_card"
        ]
        self.assertTrue(any(item.state is OutboxState.PENDING for item in status_rows))
        self.assertEqual(self.store.get_publication(publication.id).state, PublicationState.APPROVED)

    def test_message_not_modified_completes_status_delivery_idempotently(self):
        publication, _delivery_api = self.deliver()
        approve = self.store.issue_telegram_action(publication.id, "approve")
        self.store.apply_telegram_action(update_id=921, action_token=approve.token, actor_user_id="42")

        class AlreadyCurrentApi(FakeTelegramApi):
            def edit_message_text(self, *args, **kwargs):
                self.calls.append(("edit_message_text", {"text": kwargs.get("text")}))
                raise TelegramError("Telegram API: Bad Request: message is not modified")

        service = self.service(AlreadyCurrentApi())
        delivered = service.deliver_pending_status_updates()
        self.assertEqual([(item.publication_id, item.revision) for item in delivered], [(publication.id, 1)])
        self.assertEqual(service.last_status_failures, [])
        status_rows = [
            item for item in self.store.list_outbox(publication_id=publication.id) if item.kind == "telegram.status_card"
        ]
        self.assertTrue(all(item.state is OutboxState.COMPLETED for item in status_rows))

    def test_expired_status_lease_never_starts_a_telegram_edit(self):
        publication, _delivery_api = self.deliver()
        approve = self.store.issue_telegram_action(publication.id, "approve")
        self.store.apply_telegram_action(update_id=922, action_token=approve.token, actor_user_id="42")
        clock = StatusClock()
        api = FakeTelegramApi()
        service = self.service(api, clock=clock, status_lease_seconds=5)
        item = self.store.claim_telegram_status("stale-worker", lease_seconds=5, now=clock())
        self.assertIsNotNone(item)
        clock.advance(6)
        self.assertIsNone(service._deliver_status_update(item))
        self.assertFalse(any(method == "edit_message_text" for method, _payload in api.calls))

    def test_known_status_write_after_lost_fence_always_queues_a_repair(self):
        publication, _delivery_api = self.deliver()
        approve = self.store.issue_telegram_action(publication.id, "approve")
        self.store.apply_telegram_action(update_id=9221, action_token=approve.token, actor_user_id="42")
        clock = StatusClock()
        item = self.store.claim_telegram_status("old-worker", lease_seconds=5, now=clock())
        self.assertIsNotNone(item)
        clock.advance(6)
        completed, repaired = self.store.complete_telegram_status_delivery(
            item.id,
            item.lease_token,
            publication_id=publication.id,
            revision=1,
            now=clock(),
        )
        self.assertFalse(completed)
        self.assertTrue(repaired)
        self.assertEqual(self.store.get_publication(publication.id).status_revision, 2)
        repair = self.store.get_outbox_by_dedupe_key(f"telegram-status:{publication.id}:r2")
        self.assertEqual(repair.state, OutboxState.PENDING)

    def test_delayed_status_edit_after_lost_lease_gets_a_current_repair(self):
        publication, _delivery_api = self.deliver()
        approve = self.store.issue_telegram_action(publication.id, "approve")
        self.store.apply_telegram_action(update_id=923, action_token=approve.token, actor_user_id="42")
        clock = StatusClock()
        newer_api = FakeTelegramApi()
        newer_service = self.service(newer_api, clock=clock, status_lease_seconds=5)
        store = self.store

        class DelayedOldApi(FakeTelegramApi):
            def __init__(self):
                super().__init__()
                self.delayed = False

            def edit_message_text(self, *args, **kwargs):
                if not self.delayed:
                    self.delayed = True
                    # The old worker renewed r1, then stalled until its lease
                    # expired.  A new worker writes r2 before this delayed
                    # r1 request reaches Telegram.
                    clock.advance(6)
                    youtube = store.list_targets(publication.id)[0]
                    store.transition_target(youtube.id, TargetState.UPLOADING)
                    newer_service.deliver_pending_status_updates()
                return super().edit_message_text(*args, **kwargs)

        old_api = DelayedOldApi()
        delivered = self.service(old_api, clock=clock, status_lease_seconds=5).deliver_pending_status_updates()
        self.assertTrue(delivered)
        text_edits = [payload["text"] for method, payload in old_api.calls if method == "edit_message_text"]
        self.assertGreaterEqual(len(text_edits), 2)
        self.assertIn("Publishing", text_edits[-1])
        self.assertEqual(self.store.get_publication(publication.id).status_revision, 3)
        status_rows = [
            item for item in self.store.list_outbox(publication_id=publication.id) if item.kind == "telegram.status_card"
        ]
        self.assertTrue(all(item.state is OutboxState.COMPLETED for item in status_rows))

    def test_stale_status_edit_is_repaired_after_a_concurrent_newer_delivery(self):
        publication, _delivery_api = self.deliver()
        approve = self.store.issue_telegram_action(publication.id, "approve")
        self.store.apply_telegram_action(update_id=93, action_token=approve.token, actor_user_id="42")
        newer_api = FakeTelegramApi()
        newer_service = self.service(newer_api)
        store = self.store
        settings = self.settings

        class RacingApi(FakeTelegramApi):
            def __init__(self):
                super().__init__()
                self.raced = False

            def edit_message_text(self, *args, **kwargs):
                if not self.raced:
                    self.raced = True
                    youtube = store.list_targets(publication.id)[0]
                    store.transition_target(youtube.id, TargetState.UPLOADING)
                    # A different bot instance completes r2 before this stale
                    # r1 text edit is issued.
                    newer_service.deliver_pending_status_updates()
                return super().edit_message_text(*args, **kwargs)

        racing_api = RacingApi()
        delivered = self.service(racing_api).deliver_pending_status_updates()
        self.assertTrue(any(result.skipped_stale for result in delivered))
        text_edits = [payload["text"] for method, payload in racing_api.calls if method == "edit_message_text"]
        self.assertGreaterEqual(len(text_edits), 2)
        self.assertIn("Publishing", text_edits[-1])
        status_rows = [
            item for item in self.store.list_outbox(publication_id=publication.id) if item.kind == "telegram.status_card"
        ]
        self.assertTrue(all(item.state is OutboxState.COMPLETED for item in status_rows))

    def test_tampered_snapshot_blocks_delivery_before_any_telegram_call(self):
        publication = self.create_publication()
        self.asset.write_bytes(b"tampered bytes")
        api = FakeTelegramApi()
        strict = TelegramReviewService(store=self.store, api=api, settings=self.settings)
        with self.assertRaisesRegex(Exception, "snapshot verification failed"):
            strict.deliver_review(publication.id)
        self.assertEqual(api.video_calls, [])
        self.assertEqual(api.message_calls, [])

    def test_broken_pending_delivery_does_not_block_later_delivery_or_callbacks(self):
        broken_asset = self.root / "broken.mp4"
        broken_asset.write_bytes(b"different immutable bytes")
        broken = self.create_publication(publication_id="publication-broken", asset=broken_asset)
        healthy = self.create_publication(publication_id="publication-healthy")
        approve = self.store.issue_telegram_action(healthy.id, "approve")
        api = FakeTelegramApi(
            updates=[self.callback_update(80, callback_data(approve), callback_id="healthy-approve")]
        )
        api._base = "https://api.telegram.org/botvery-secret-token"

        # Match the production failure type while deliberately including the
        # fake endpoint to prove logging cannot disclose the bot token.
        def safe_loader(publication):
            if publication.id == broken.id:
                raise ReviewError(f"cannot inspect {api._base}")
            return self.review_loader(publication)

        service = TelegramReviewService(
            store=self.store,
            api=api,
            settings=self.settings,
            review_loader=safe_loader,
        )
        log = io.StringIO()
        with contextlib.redirect_stderr(log):
            processed = service.run_once(timeout=0)

        self.assertEqual(processed, 1)
        self.assertEqual([call[1] for call in api.video_calls], [self.asset])
        self.assertEqual(self.store.get_publication(healthy.id).state, PublicationState.APPROVED)
        self.assertEqual(self.store.get_publication(broken.id).state, PublicationState.REVIEW_PENDING)
        self.assertEqual(
            self.store.get_outbox_by_dedupe_key(f"telegram-review-card:{broken.id}").state,
            OutboxState.PENDING,
        )
        self.assertEqual(
            [(failure.publication_id, failure.error) for failure in service.last_delivery_failures],
            [(broken.id, "cannot inspect [redacted]")],
        )
        self.assertNotIn("very-secret-token", log.getvalue())
        self.assertEqual(self.store.get_bot_state(UPDATE_CURSOR_KEY), "80")


if __name__ == "__main__":
    unittest.main()
