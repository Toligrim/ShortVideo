"""Telegram delivery and approval callbacks for immutable publication reviews.

This module is intentionally limited to the human review gate.  It creates no
YouTube or Instagram client and never makes a platform publish request.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import html
import json
import os
from pathlib import Path
import socket
import sys
import time
from typing import Any, Callable, Mapping
import uuid

from telegram_bot import (
    MAX_UPLOAD_BYTES,
    TelegramApi,
    TelegramError,
    TelegramMessageNotModified,
    dotenv_value,
)

from .db import PublishingStore, StoreError
from .models import OutboxItem, Publication, PublicationState, PublicationTarget, TelegramAction, TelegramActionKind
from .progress import ProgressCardSync
from .review import ReviewError, VerifiedReview, verify_review_snapshots


CALLBACK_PREFIX = "sv1"
CALLBACK_DATA_LIMIT_BYTES = 64
TELEGRAM_TEXT_LIMIT = 4096
UPDATE_CURSOR_KEY = "telegram_callback_update_cursor"
EMPTY_INLINE_KEYBOARD = {"inline_keyboard": []}
STATUS_LEASE_SECONDS = 60
STATUS_RETRY_SECONDS = 30

CARD_PARSE_MODE = "HTML"

# Official YouTube video category IDs, display name only (cosmetic; an
# unknown ID still renders fine with just its number).
YOUTUBE_CATEGORY_NAMES = {
    "1": "Film & Animation",
    "2": "Autos & Vehicles",
    "10": "Music",
    "15": "Pets & Animals",
    "17": "Sports",
    "19": "Travel & Events",
    "20": "Gaming",
    "22": "People & Blogs",
    "23": "Comedy",
    "24": "Entertainment",
    "25": "News & Politics",
    "26": "Howto & Style",
    "27": "Education",
    "28": "Science & Technology",
    "29": "Nonprofits & Activism",
}

YOUTUBE_PRIVACY_ICONS = {"private": "🔒", "unlisted": "🔗", "public": "🌍"}
YOUTUBE_PRIVACY_LABELS_RU = {"private": "Приватное", "unlisted": "По ссылке", "public": "Публичное"}


Clock = Callable[[], str]


def _sd_notify(state: str) -> None:
    """Send a systemd notify message without affecting the bot loop."""
    addr = os.environ.get("NOTIFY_SOCKET")
    if not addr:
        return
    if addr.startswith("@"):
        addr = "\0" + addr[1:]
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as sock:
            sock.setblocking(False)
            sock.sendto(state.encode("ascii"), addr)
    except Exception:
        # Notifications are best-effort and must never stop or stall the bot.
        pass


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


class TelegramApprovalError(RuntimeError):
    """The approval gate cannot safely continue."""


@dataclass(frozen=True)
class TelegramApprovalSettings:
    """Explicit allow-list required for approval actions."""

    allowed_chat_id: str
    allowed_user_id: str

    @classmethod
    def from_environment(cls) -> "TelegramApprovalSettings":
        def required(name: str) -> str:
            value = os.environ.get(name, "").strip() or dotenv_value(name)
            if not value:
                raise TelegramApprovalError(f"{name} is required for Telegram approval callbacks")
            return value

        return cls(
            allowed_chat_id=required("TELEGRAM_ALLOWED_CHAT_ID"),
            allowed_user_id=required("TELEGRAM_ALLOWED_USER_ID"),
        )


@dataclass(frozen=True)
class ReviewDeliveryResult:
    publication_id: str
    video_message_id: int
    card_message_id: int


@dataclass(frozen=True)
class ReviewDeliveryFailure:
    """A per-publication delivery failure retained for the current bot cycle."""

    publication_id: str
    error: str


@dataclass(frozen=True)
class StatusDeliveryResult:
    publication_id: str
    revision: int
    skipped_stale: bool = False


@dataclass(frozen=True)
class StatusDeliveryFailure:
    publication_id: str | None
    error: str


@dataclass(frozen=True)
class CallbackResult:
    update_id: int | None
    accepted: bool
    reason: str | None


ReviewLoader = Callable[[Publication], VerifiedReview]


def callback_data(action: TelegramAction) -> str:
    """Encode only a short opaque database token into Telegram callback data."""
    codes = {
        TelegramActionKind.APPROVE: "a",
        TelegramActionKind.REJECT: "r",
    }
    code = codes.get(action.kind)
    if code is None:
        raise TelegramApprovalError(f"unsupported review callback action: {action.kind.value}")
    if not action.token or ":" in action.token or any(character.isspace() for character in action.token):
        raise TelegramApprovalError("Telegram action token is not safe for callback data")
    encoded = f"{CALLBACK_PREFIX}:{code}:{action.token}"
    if len(encoded.encode("utf-8")) > CALLBACK_DATA_LIMIT_BYTES:
        raise TelegramApprovalError("Telegram callback data exceeds the 64-byte Bot API limit")
    return encoded


def parse_callback_data(value: object) -> tuple[TelegramActionKind, str] | None:
    if not isinstance(value, str) or len(value.encode("utf-8")) > CALLBACK_DATA_LIMIT_BYTES:
        return None
    prefix, separator, rest = value.partition(":")
    if prefix != CALLBACK_PREFIX or not separator:
        return None
    code, separator, token = rest.partition(":")
    kinds = {"a": TelegramActionKind.APPROVE, "r": TelegramActionKind.REJECT}
    kind = kinds.get(code)
    if kind is None or not separator or not token or ":" in token or any(character.isspace() for character in token):
        return None
    return kind, token


def _yes_no(value: object) -> str:
    if value is True:
        return "✅ Да"
    if value is False:
        return "🚫 Нет"
    raise TelegramApprovalError("verified metadata contains a non-boolean flag")


def _duration(value: float) -> str:
    rendered = f"{value:.3f}".rstrip("0").rstrip(".")
    return f"{rendered}s"


def _esc(value: object) -> str:
    return html.escape(str(value))


def _require_text_card(text: str) -> None:
    if not text or len(text) > TELEGRAM_TEXT_LIMIT:
        raise TelegramApprovalError(
            "review card cannot fit Telegram's 4096-character limit; approved metadata was not truncated"
        )


def format_review_card(
    publication: Publication,
    review: VerifiedReview,
    *,
    instagram_configured: bool | None = None,
) -> str:
    """Render every approved target field as Telegram HTML; do not truncate or silently omit it.

    ``instagram_configured`` — результат локальной проверки (без сети), что для
    Instagram вообще есть рабочие credentials. ``None`` = проверка не
    выполнялась (предупреждение не показываем, поведение как раньше).
    """
    metadata = review.metadata
    targets = metadata.get("targets") if isinstance(metadata, Mapping) else None
    if not isinstance(targets, Mapping):
        raise TelegramApprovalError("verified metadata has no targets object")
    if publication.execution_mode.value == "live":
        mode_line = "🔴 <b>LIVE</b> — по нажатию Approve уйдёт в реальную публикацию"
    else:
        mode_line = "🧪 <b>DRY-RUN</b> — тестовый прогон, наружу ничего не публикуется"
    lines = [
        f"🎬 <b>Заявка на публикацию</b> · <code>{_esc(publication.slug)}</code>",
        mode_line,
        f"📼 Видео: {_esc(_duration(review.probe.duration_seconds))} · "
        f"{review.probe.width}×{review.probe.height}",
        f"🔑 <code>{_esc(publication.approval_fingerprint)}</code>",
    ]
    youtube = targets.get("youtube")
    if youtube is not None:
        if not isinstance(youtube, Mapping):
            raise TelegramApprovalError("verified YouTube metadata is not an object")
        try:
            tags = ", ".join(_esc(tag) for tag in youtube["tags"]) or "—"
            category_id = str(youtube["category_id"])
            category_name = YOUTUBE_CATEGORY_NAMES.get(category_id)
            category_label = f"{_esc(category_id)} · {_esc(category_name)}" if category_name else _esc(category_id)
            privacy = str(youtube["privacy_status"])
            privacy_icon = YOUTUBE_PRIVACY_ICONS.get(privacy, "")
            privacy_name = YOUTUBE_PRIVACY_LABELS_RU.get(privacy, privacy)
            privacy_label = f"{privacy_icon} <b>Доступ</b>: {_esc(privacy_name)} ({_esc(privacy)})".strip()
            lines.extend(
                [
                    "",
                    "━━━━━━━━━━━━━━━━━━━",
                    "▶️ <b>YouTube Shorts</b>",
                    "",
                    "📝 <b>Заголовок</b>",
                    f"<b>{_esc(youtube['title'])}</b>",
                    "",
                    "📄 <b>Описание</b>",
                    f"<blockquote>{_esc(youtube['description'])}</blockquote>",
                    "",
                    f"🏷 <b>Теги</b>: {tags}",
                    f"📁 <b>Категория</b>: {category_label}",
                    privacy_label,
                    "",
                    f"🔞 Детская аудитория (COPPA): {_yes_no(youtube['made_for_kids'])}",
                    f"🤖 Пометка «ИИ-контент»: {_yes_no(youtube['contains_synthetic_media'])}",
                    f"🔔 Уведомить подписчиков: {_yes_no(youtube['notify_subscribers'])}",
                ]
            )
        except KeyError as exc:
            raise TelegramApprovalError(f"verified YouTube metadata is missing {exc.args[0]!r}") from exc
    instagram = targets.get("instagram")
    if instagram is not None:
        if not isinstance(instagram, Mapping):
            raise TelegramApprovalError("verified Instagram metadata is not an object")
        try:
            lines.extend(["", "━━━━━━━━━━━━━━━━━━━", "📸 <b>Instagram Reels</b>"])
            if instagram_configured is False:
                lines.append("⚠️ <b>Не подключён — по Approve публикация НЕ выполнится</b>")
            lines.extend(
                [
                    "",
                    "📝 <b>Подпись</b>",
                    f"<blockquote>{_esc(instagram['caption'])}</blockquote>",
                    "",
                    f"📤 Опубликовать в ленту: {_yes_no(instagram['share_to_feed'])}",
                ]
            )
        except KeyError as exc:
            raise TelegramApprovalError(f"verified Instagram metadata is missing {exc.args[0]!r}") from exc
    card = "\n".join(lines)
    _require_text_card(card)
    return card


def format_status_card(
    publication: Publication,
    targets: tuple[PublicationTarget, ...] | list[PublicationTarget] = (),
) -> str:
    state = publication.state
    if state is PublicationState.APPROVED:
        headline = "✅ <b>Approved</b> — publish jobs queued"
    elif state is PublicationState.REJECTED:
        headline = "❌ <b>Rejected</b>"
    elif state is PublicationState.PUBLISHING:
        headline = "⏳ <b>Publishing</b>"
    elif state is PublicationState.PUBLISHED:
        headline = "✅ <b>Published</b> on all selected platforms"
    elif state is PublicationState.PARTIAL:
        headline = "⚠️ <b>Partially published</b> — operator attention needed"
    elif state is PublicationState.FAILED:
        headline = "❌ <b>Publishing stopped</b> — operator attention needed"
    else:
        headline = f"<b>Review status:</b> {_esc(state.value)}"
    mode_badge = "🔴 LIVE" if publication.execution_mode.value == "live" else "🧪 DRY-RUN"
    lines = [
        headline,
        f"<code>{_esc(publication.slug)}</code>  ·  {mode_badge}",
        f"🔑 <code>{_esc(publication.approval_fingerprint)}</code>",
    ]
    if targets:
        lines.append("")
        lines.append("━━━━━━━━━━━━━━━━━━━")
        for target in targets:
            platform = _esc(target.platform)
            rendered = f"• <b>{platform}</b>: {_esc(target.state.value)}"
            if target.state.value == "reconciliation_required":
                rendered += " ⚠️ (manual reconciliation required)"
            elif target.external_url:
                url = _esc(target.external_url)
                rendered += f" — <a href=\"{url}\">{url}</a>"
            elif target.last_error_code:
                rendered += f" (<code>{_esc(target.last_error_code)}</code>)"
            lines.append(rendered)
    text = "\n".join(lines)
    _require_text_card(text)
    return text


class TelegramReviewService:
    """Durable Telegram review delivery plus authorized approval callbacks."""

    def __init__(
        self,
        *,
        store: PublishingStore,
        api: TelegramApi,
        settings: TelegramApprovalSettings,
        review_loader: ReviewLoader = verify_review_snapshots,
        status_lease_seconds: int = STATUS_LEASE_SECONDS,
        clock: Clock = _utc_now,
        instagram_configured: Callable[[], bool] | None = None,
        progress_sync: ProgressCardSync | None = None,
    ):
        if status_lease_seconds < 1:
            raise TelegramApprovalError("Telegram status lease must be positive")
        self.store = store
        self.api = api
        self.settings = settings
        self.review_loader = review_loader
        self._status_lease_seconds = status_lease_seconds
        self._clock = clock
        # Local-only credential check injected by the caller; this module
        # must not construct provider clients itself (see module docstring).
        self._instagram_configured = instagram_configured
        self._progress_sync = progress_sync
        self.last_delivery_failures: list[ReviewDeliveryFailure] = []
        self.last_status_failures: list[StatusDeliveryFailure] = []
        self._status_worker_id = f"telegram-status-{uuid.uuid4().hex}"

    def deliver_pending_reviews(self) -> list[ReviewDeliveryResult]:
        delivered: list[ReviewDeliveryResult] = []
        self.last_delivery_failures = []
        for publication in self.store.list_pending_review_deliveries():
            try:
                delivered.append(self.deliver_review(publication.id))
            except (OSError, ReviewError, StoreError, TelegramApprovalError, TelegramError) as exc:
                # Keep this outbox item pending.  A malformed or temporarily
                # unavailable review must not starve later review cards or the
                # callback polling pass in this same bot cycle.
                failure = ReviewDeliveryFailure(publication.id, self._safe_error_text(exc))
                self.last_delivery_failures.append(failure)
                print(
                    f"Telegram review delivery failed for publication {failure.publication_id}: {failure.error}",
                    file=sys.stderr,
                    flush=True,
                )
        return delivered

    def deliver_pending_status_updates(self) -> list[StatusDeliveryResult]:
        """Apply durable card edits without ever resending the video/buttons.

        Each revision is an outbox row.  If workers have already produced a
        newer revision, an older row is completed locally without a Telegram
        API call, preventing stale state from overwriting the card.
        """
        delivered: list[StatusDeliveryResult] = []
        self.last_status_failures = []
        while True:
            item = self.store.claim_telegram_status(
                self._status_worker_id,
                lease_seconds=self._status_lease_seconds,
                now=self._status_now(),
            )
            if item is None:
                return delivered
            try:
                result = self._deliver_status_update(item)
            except (OSError, StoreError, TelegramApprovalError, TelegramError) as exc:
                self._reschedule_status_failure(item, exc)
                continue
            if result is not None:
                delivered.append(result)

    def _deliver_status_update(self, item: OutboxItem) -> StatusDeliveryResult | None:
        if item.lease_token is None:
            return None
        publication_id = item.publication_id
        payload_publication_id = item.payload.get("publication_id")
        revision = item.payload.get("revision")
        if (
            publication_id is None
            or payload_publication_id != publication_id
            or not isinstance(revision, int)
            or isinstance(revision, bool)
            or revision < 1
        ):
            self.store.dead_outbox(
                item.id,
                item.lease_token,
                error="invalid telegram.status_card payload",
                now=self._status_now(),
            )
            return None
        publication = self.store.get_publication(publication_id)
        if publication is None:
            self.store.dead_outbox(
                item.id,
                item.lease_token,
                error="telegram.status_card references an unknown publication",
                now=self._status_now(),
            )
            return None
        if revision < publication.status_revision:
            completed = self.store.complete_outbox(item.id, item.lease_token, now=self._status_now())
            return StatusDeliveryResult(publication.id, revision, skipped_stale=True) if completed else None
        if revision != publication.status_revision:
            self.store.dead_outbox(
                item.id,
                item.lease_token,
                error="telegram.status_card revision is ahead of publication state",
                now=self._status_now(),
            )
            return None
        if publication.review_card_message_id is None:
            self.store.reschedule_outbox(
                item.id,
                item.lease_token,
                available_at=self._status_retry_at(),
                error="review card is not available for a status edit",
                now=self._status_now(),
            )
            return None
        targets = self.store.list_targets(publication.id)
        card = format_status_card(publication, targets)
        # Renew immediately before the only external status-card operation.
        # If the fence is stale, no Telegram request is started at all.
        if not self.store.renew_outbox_lease(
            item.id,
            item.lease_token,
            lease_seconds=self._status_lease_seconds,
            now=self._status_now(),
        ):
            return None
        try:
            # ``editMessageText`` accepts reply_markup, so this single call
            # updates the existing text and removes review buttons together.
            self.api.edit_message_text(
                self.settings.allowed_chat_id,
                publication.review_card_message_id,
                card,
                reply_markup=EMPTY_INLINE_KEYBOARD,
                parse_mode=CARD_PARSE_MODE,
            )
        except (OSError, TelegramError) as exc:
            if not self._is_message_not_modified_error(exc):
                # A timeout may happen after Telegram applied the edit.  Do
                # not complete the original row, but if its fence was lost,
                # make a current repair revision durable before retry logic.
                self.store.repair_telegram_status_after_external_attempt(
                    item.id,
                    item.lease_token,
                    publication_id=publication.id,
                    revision=revision,
                    now=self._status_now(),
                )
                raise
        completed, repaired_stale_write = self.store.complete_telegram_status_delivery(
            item.id,
            item.lease_token,
            publication_id=publication.id,
            revision=revision,
            now=self._status_now(),
        )
        if not completed:
            return None
        return StatusDeliveryResult(publication.id, revision, skipped_stale=repaired_stale_write)

    def _reschedule_status_failure(self, item: OutboxItem, exc: BaseException) -> None:
        error = self._safe_error_text(exc)
        try:
            if item.lease_token is not None:
                self.store.reschedule_outbox(
                    item.id,
                    item.lease_token,
                    available_at=self._status_retry_at(),
                    error=error,
                    now=self._status_now(),
                )
        except StoreError:
            # The original failure remains isolated even if a stale lease or a
            # concurrent owner makes its retry bookkeeping impossible.
            pass
        failure = StatusDeliveryFailure(item.publication_id, error)
        self.last_status_failures.append(failure)
        print(
            f"Telegram status delivery failed for publication {failure.publication_id}: {failure.error}",
            file=sys.stderr,
            flush=True,
        )

    def _status_now(self) -> str:
        return self._clock()

    def _status_retry_at(self) -> str:
        try:
            now = datetime.fromisoformat(self._status_now().replace("Z", "+00:00"))
        except ValueError as exc:
            raise TelegramApprovalError("Telegram status clock must return an ISO-8601 timestamp") from exc
        if now.tzinfo is None:
            raise TelegramApprovalError("Telegram status clock must return a timezone-aware timestamp")
        return (now.astimezone(timezone.utc) + timedelta(seconds=STATUS_RETRY_SECONDS)).isoformat(
            timespec="microseconds"
        ).replace("+00:00", "Z")

    @staticmethod
    def _is_message_not_modified_error(exc: BaseException) -> bool:
        return isinstance(exc, TelegramMessageNotModified) or (
            isinstance(exc, TelegramError) and "message is not modified" in str(exc).casefold()
        )

    def deliver_review(self, publication_id: str) -> ReviewDeliveryResult:
        publication = self.store.get_publication(publication_id)
        if publication is None:
            raise TelegramApprovalError(f"unknown publication: {publication_id}")
        if publication.state is not PublicationState.REVIEW_PENDING:
            raise TelegramApprovalError("only pending reviews can be delivered to Telegram")

        # Validate all immutable inputs and the complete card before the first
        # external send.  This prevents a video without an actionable, exact
        # review card when metadata is oversized or tampered with.
        review = self.review_loader(publication)
        self._validate_upload_size(review.asset_path)
        approve = self.store.issue_telegram_action(publication.id, TelegramActionKind.APPROVE)
        reject = self.store.issue_telegram_action(publication.id, TelegramActionKind.REJECT)
        instagram_configured = None
        instagram_target = (
            review.metadata.get("targets", {}).get("instagram")
            if isinstance(review.metadata, Mapping)
            else None
        )
        if instagram_target is not None and self._instagram_configured is not None:
            try:
                instagram_configured = bool(self._instagram_configured())
            except Exception:
                # A broken local check must not block delivery of the review
                # itself; show the warning as a precaution instead.
                instagram_configured = False
        card = format_review_card(publication, review, instagram_configured=instagram_configured)
        markup = {
            "inline_keyboard": [
                [
                    {"text": "✅ Approve", "callback_data": callback_data(approve)},
                    {"text": "❌ Reject", "callback_data": callback_data(reject)},
                ]
            ]
        }

        if publication.review_video_message_id is None:
            result = self.api.send_video(
                self.settings.allowed_chat_id,
                review.asset_path,
                f"Review: {publication.slug}",
            )
            video_message_id = self._message_id(result, "sendVideo")
            # This write must happen before sendMessage: a card-send retry can
            # then resume without uploading the asset again.
            self.store.record_review_video_message(publication.id, video_message_id)
            publication = self._require_publication(publication.id)

        if publication.review_card_message_id is None:
            result = self.api.send_message(
                self.settings.allowed_chat_id,
                card,
                reply_markup=markup,
                reply_to_message_id=publication.review_video_message_id,
                parse_mode=CARD_PARSE_MODE,
            )
            card_message_id = self._message_id(result, "sendMessage")
            self.store.record_review_card_message(publication.id, card_message_id)
            publication = self._require_publication(publication.id)

        self.store.complete_review_delivery(publication.id)
        if publication.review_video_message_id is None or publication.review_card_message_id is None:
            raise TelegramApprovalError("review delivery was completed without both Telegram message IDs")
        return ReviewDeliveryResult(
            publication_id=publication.id,
            video_message_id=publication.review_video_message_id,
            card_message_id=publication.review_card_message_id,
        )

    def poll_once(self, *, timeout: int = 25) -> int:
        if timeout < 0:
            raise TelegramApprovalError("Telegram poll timeout cannot be negative")
        cursor = self._read_cursor()
        updates = self.api.get_updates(offset=cursor + 1 if cursor is not None else None, timeout=timeout)
        processed = 0
        for update in updates:
            if not isinstance(update, Mapping):
                continue
            update_id = update.get("update_id")
            if not isinstance(update_id, int) or isinstance(update_id, bool) or update_id < 0:
                continue
            try:
                self.process_update(update)
            except (OSError, StoreError, TelegramApprovalError, TelegramError) as exc:
                # A single update (e.g. a callback query that expired before
                # we could answer it) must not wedge the cursor forever and
                # starve every later update in the same and all future polls.
                print(
                    f"Telegram callback processing failed for update {update_id}: {self._safe_error_text(exc)}",
                    file=sys.stderr,
                    flush=True,
                )
            self._advance_cursor(update_id)
            processed += 1
        return processed

    def run_once(self, *, timeout: int = 25) -> int:
        if self._progress_sync is not None:
            try:
                self._progress_sync.sync()
            except Exception as exc:  # noqa: BLE001 — progress must not block review/callbacks
                print(
                    f"Telegram progress observer failed: {self._safe_error_text(exc)}",
                    file=sys.stderr,
                    flush=True,
                )
        self.deliver_pending_reviews()
        self.deliver_pending_status_updates()
        return self.poll_once(timeout=timeout)

    def run_forever(self, *, timeout: int = 25) -> None:
        _sd_notify("READY=1")
        while True:
            try:
                self.run_once(timeout=timeout)
            except (OSError, ReviewError, StoreError, TelegramApprovalError, TelegramError) as exc:
                print(f"Telegram approval bot error: {self._safe_error_text(exc)}", flush=True)
                time.sleep(2)
            _sd_notify("WATCHDOG=1")

    def process_update(self, update: Mapping[str, Any]) -> CallbackResult | None:
        callback = update.get("callback_query")
        if not isinstance(callback, Mapping):
            return None
        update_id = update.get("update_id")
        if not isinstance(update_id, int) or isinstance(update_id, bool) or update_id < 0:
            return CallbackResult(None, False, "invalid update")
        return self._process_callback(update_id, callback)

    def _process_callback(self, update_id: int, callback: Mapping[str, Any]) -> CallbackResult:
        callback_id = callback.get("id")
        if not isinstance(callback_id, str) or not callback_id:
            return CallbackResult(update_id, False, "missing callback ID")

        user = callback.get("from")
        message = callback.get("message")
        chat = message.get("chat") if isinstance(message, Mapping) else None
        user_id = user.get("id") if isinstance(user, Mapping) else None
        chat_id = chat.get("id") if isinstance(chat, Mapping) else None
        if str(user_id) != self.settings.allowed_user_id or str(chat_id) != self.settings.allowed_chat_id:
            self.api.answer_callback_query(callback_id, text="Not authorized", show_alert=True)
            return CallbackResult(update_id, False, "unauthorized callback")

        parsed = parse_callback_data(callback.get("data"))
        if parsed is None:
            self.api.answer_callback_query(callback_id, text="Unknown or expired action", show_alert=True)
            return CallbackResult(update_id, False, "unknown action")
        expected_kind, token = parsed
        action = self.store.get_telegram_action(token)
        if action is None or action.kind is not expected_kind:
            self.api.answer_callback_query(callback_id, text="Unknown or expired action", show_alert=True)
            return CallbackResult(update_id, False, "unknown action")

        # Answer before the state transaction and UI edits so Telegram stops
        # showing its spinner even if those subsequent durable operations take
        # a moment.  apply_telegram_action remains the sole state transition.
        #
        # The ack itself is best-effort only: incident 2026-08-31 — a host
        # network blip (see CLAUDE.md notes on wlan0/VPN route flapping)
        # queued updates while the bot's getUpdates long-poll was down, and
        # by the time it drained the backlog Telegram rejected the ack with
        # "query is too old" (a real HTTP error from answer_callback_query,
        # raised as TelegramError). That exception used to propagate straight
        # out of this method, so apply_telegram_action below never ran and
        # the Approve press was silently dropped — poll_once's outer handler
        # still advanced the cursor past it (by design, so one bad update
        # can't wedge the queue), so it was never retried either: the button
        # visibly did nothing. A stale/failed ack does not mean the actual
        # write below would also fail — apply_telegram_action is a pure local
        # DB transaction, no network involved — so never let a failed ack
        # skip it.
        try:
            self.api.answer_callback_query(callback_id, text="Action received")
        except TelegramError as exc:
            print(
                f"answerCallbackQuery failed for callback {callback_id} "
                f"(update {update_id}), applying the action anyway: "
                f"{self._safe_error_text(exc)}",
                file=sys.stderr,
                flush=True,
            )
        result = self.store.apply_telegram_action(
            update_id=update_id,
            action_token=token,
            actor_user_id=self.settings.allowed_user_id,
        )
        # apply_telegram_action has already created a revisioned status outbox
        # row.  Do not issue an unversioned immediate edit here: it could race
        # a target outcome and overwrite a newer card after its delivery.
        return CallbackResult(update_id, result.accepted, result.reason)

    @staticmethod
    def _message_id(result: object, method: str) -> int:
        message_id = result.get("message_id") if isinstance(result, Mapping) else None
        if not isinstance(message_id, int) or isinstance(message_id, bool) or message_id <= 0:
            raise TelegramApprovalError(f"Telegram {method} response has no positive message_id")
        return message_id

    @staticmethod
    def _validate_upload_size(asset_path: Path) -> None:
        try:
            size = asset_path.stat().st_size
        except OSError as exc:
            raise TelegramApprovalError(f"cannot inspect review asset: {exc}") from exc
        if size <= 0 or size > MAX_UPLOAD_BYTES:
            raise TelegramApprovalError("review asset cannot be sent through Telegram Bot API")

    def _read_cursor(self) -> int | None:
        raw = self.store.get_bot_state(UPDATE_CURSOR_KEY)
        if raw is None:
            return None
        try:
            cursor = int(raw)
        except ValueError as exc:
            raise TelegramApprovalError("stored Telegram callback cursor is invalid") from exc
        if cursor < 0:
            raise TelegramApprovalError("stored Telegram callback cursor is invalid")
        return cursor

    def _advance_cursor(self, update_id: int) -> None:
        cursor = self._read_cursor()
        if cursor is None or update_id > cursor:
            self.store.set_bot_state(UPDATE_CURSOR_KEY, str(update_id))

    def _require_publication(self, publication_id: str) -> Publication:
        publication = self.store.get_publication(publication_id)
        if publication is None:
            raise TelegramApprovalError(f"publication disappeared: {publication_id}")
        return publication

    def _safe_error_text(self, exc: BaseException) -> str:
        """Redact the configured Bot API endpoint from operator-facing logs."""
        text = " ".join(str(exc).split())
        endpoint = getattr(self.api, "_base", "")
        if isinstance(endpoint, str) and endpoint:
            token = endpoint.rpartition("/bot")[2]
            for secret in (endpoint, token):
                if secret:
                    text = text.replace(secret, "[redacted]")
        return text[:500] or exc.__class__.__name__
