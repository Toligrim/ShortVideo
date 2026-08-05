from __future__ import annotations

import contextlib
from fractions import Fraction
from hashlib import sha256
import io
from pathlib import Path
import tempfile
import unittest

from publishing.db import PublishingStore
from publishing.metadata import metadata_sha256, write_metadata_snapshot
from publishing.models import ExecutionMode, OutboxState, PublicationState
from publishing.preflight import MediaProbe
from publishing.review import ReviewError, VerifiedReview
from publishing.telegram import (
    UPDATE_CURSOR_KEY,
    TelegramApprovalSettings,
    TelegramReviewService,
    callback_data,
    parse_callback_data,
)
from telegram_bot import TelegramApi, TelegramError


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

    def service(self, api):
        return TelegramReviewService(
            store=self.store,
            api=api,
            settings=self.settings,
            review_loader=self.review_loader,
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

    def test_authorized_callback_answers_before_atomic_apply_and_removes_buttons(self):
        events: list[str] = []
        self.store = RecordingStore(self.root / "publisher.sqlite3", event_log=events)
        publication, delivery_api = self.deliver()
        approve_data = delivery_api.message_calls[0]["reply_markup"]["inline_keyboard"][0][0]["callback_data"]
        api = FakeTelegramApi(
            updates=[self.callback_update(71, approve_data, callback_id="approve")], event_log=events
        )
        self.service(api).poll_once(timeout=0)

        self.assertEqual(events[:2], ["answer", "apply"])
        self.assertTrue(any(call[0] == "edit_message_text" for call in api.calls))
        self.assertTrue(any(call[0] == "edit_message_reply_markup" for call in api.calls))
        self.assertEqual(self.store.get_publication(publication.id).state, PublicationState.APPROVED)

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
