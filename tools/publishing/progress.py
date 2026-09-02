"""Read-only production-run progress reduction and Telegram card syncing.

The reducer only consumes the current run's ``events.jsonl`` and the one
authoritative scriptwriter draft title.  Telegram is used by the small sync
wrapper below; the pure reducer and renderer have no network side effects.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import html
import json
from pathlib import Path
import sys
from typing import Any, Callable, Mapping, TYPE_CHECKING

import pipeline_log
from telegram_bot import TelegramError, TelegramMessageNotModified

from .db import PublishingStore, StoreError

if TYPE_CHECKING:
    from telegram_bot import TelegramApi


# The scheduler's exact placeholder; see tools/producer_scheduler.py.
PROMPT_TOPIC_PLACEHOLDER = "тему выбирает агент (инструкции в промпте)"

PROGRESS_STATE_PREFIX = "telegram_progress:"
PROGRESS_RETRY_SECONDS = 10
PROGRESS_RATE_LIMIT_SECONDS = 3
PROGRESS_RATE_LIMIT_BACKOFF_SECONDS = 30

# tools/telegram_bot.py never forwards the HTTP status code into TelegramError
# (only Telegram's own `description` text) — a raw "429" substring check
# against that text never matches, since the digits belong to the HTTP status
# line, not the description. Match Telegram's actual 429 description instead
# ("Too Many Requests: retry after N"), case-insensitively, plus the literal
# code as a defensive fallback in case a future transport change does surface it.
def _is_rate_limited(exc: BaseException) -> bool:
    text = str(exc).casefold()
    return "too many requests" in text or "429" in text

ROOT = Path(__file__).resolve().parents[2]

STAGE_NAMES = {
    "scriptwriter": "Сценарист",
    "director": "Режиссёр",
    "forge": "Кузница визуалов",
    "validate": "Валидация",
    "tts": "Озвучка",
    "stills": "Стоп-кадры",
    "critic": "Критик",
    "render": "Рендер",
    "telegram": "Публикация в Telegram",
    "publish": "Публикация",
    "commit": "Коммит",
    "other": "Прочее",
}

MEANINGFUL_EVENT_KINDS = frozenset(
    {
        "run_start",
        "stage_start",
        "stage_end",
        "delegate_requested",
        "delegate_started",
        "delegate_result_classified",
        "delegate_termination_confirmed",
        "delegation_denied",
        "verdict",
        "worktree_closed",
        "publication_created",
        "run_end",
    }
)


def current_run_id() -> str | None:
    """Return the run selected by the existing pipeline logger."""
    return pipeline_log.current_run_id()


def run_dir_for(run_id: str) -> Path:
    """Resolve a run directory using the existing pipeline logger rules."""
    return pipeline_log.run_dir_for(run_id)


def read_events(run_dir: Path) -> list[dict[str, Any]]:
    """Read valid JSON object lines, tolerating a run being written live."""
    try:
        raw_lines = (run_dir / "events.jsonl").read_bytes().splitlines()
    except OSError:
        return []

    events: list[dict[str, Any]] = []
    for raw_line in raw_lines:
        if not raw_line.strip():
            continue
        try:
            value = json.loads(raw_line.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
        if isinstance(value, dict):
            events.append(value)
    return events


@dataclass
class ProgressState:
    run_id: str
    slug: str | None = None
    topic: str | None = None
    topic_pending: bool = True
    terminal: bool = False
    terminal_kind: str | None = None
    run_status: str | None = None
    result_class: str | None = None
    error_code: str | None = None
    publication_id: str | None = None
    current_stage: str | None = None
    completed_stages: list[tuple[str, str]] = field(default_factory=list)
    current_delegate: dict[str, Any] | None = None
    last_delegate_failure: dict[str, Any] | None = None
    quarantine: dict[str, Any] | None = None
    circuit_breaker: dict[str, Any] | None = None
    last_verdict: dict[str, Any] | None = None
    last_event_ts: str | None = None
    started_at: str | None = None


def _ordered_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    indexed = [(index, event) for index, event in enumerate(events) if isinstance(event, dict)]

    def sort_key(item: tuple[int, dict[str, Any]]) -> tuple[int, int, int]:
        index, event = item
        seq = event.get("seq")
        if isinstance(seq, int) and not isinstance(seq, bool):
            return (0, seq, index)
        return (1, index, index)

    return [event for _index, event in sorted(indexed, key=sort_key)]


def _delegate_fields(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "role": event.get("role"),
        "agent_id": event.get("actor"),
        "task_id": event.get("task_id"),
        "infrastructure_attempt": event.get("infrastructure_attempt"),
        "semantic_attempt": event.get("semantic_attempt"),
    }


def _draft_title(slug: str | None) -> str | None:
    """Read only the validated title from the authoritative draft file."""
    if not isinstance(slug, str) or not slug or Path(slug).name != slug:
        return None
    draft_path = ROOT / "episodes" / "drafts" / f"{slug}.draft.json"
    try:
        draft = json.loads(draft_path.read_text(encoding="utf-8"))
        title = draft["title"]
        if isinstance(title, str) and title.strip():
            return title
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError):
        return None
    return None


def _refresh_topic_from_draft(state: ProgressState) -> None:
    if not state.topic_pending:
        return
    title = _draft_title(state.slug)
    if title is not None:
        state.topic = title
        state.topic_pending = False


def _is_scriptwriter_success(event: dict[str, Any]) -> bool:
    return (
        event.get("kind") == "delegate_result_classified"
        and event.get("role") == "scriptwriter"
        and event.get("result_class") == "success"
    )


def _is_successful_worktree_close(event: dict[str, Any]) -> bool:
    return event.get("kind") == "worktree_closed" and event.get("status") not in {"failed", "abandoned"}


def reduce_events(run_id: str, events: list[dict[str, Any]]) -> ProgressState:
    """Reduce the append-only run events into the card's safe public state."""
    state = ProgressState(run_id=run_id)
    ordered = _ordered_events(events)

    for event in ordered:
        kind = event.get("kind")

        if kind == "run_start":
            slug = event.get("slug")
            state.slug = slug if isinstance(slug, str) else None
            started_at = event.get("ts")
            state.started_at = started_at if isinstance(started_at, str) else None
            topic_raw = event.get("topic")
            if (
                not isinstance(topic_raw, str)
                or not topic_raw.strip()
                or topic_raw == PROMPT_TOPIC_PLACEHOLDER
            ):
                state.topic = None
                state.topic_pending = True
            else:
                state.topic = topic_raw
                state.topic_pending = False

        elif kind == "stage_start":
            stage = event.get("stage")
            if isinstance(stage, str):
                state.current_stage = stage

        elif kind == "stage_end":
            stage = event.get("stage")
            status = event.get("status")
            if isinstance(stage, str) and isinstance(status, str):
                state.completed_stages.append((stage, status))
                # Keep the last known stage until another stage_start arrives.
                if state.current_stage == stage:
                    state.current_stage = stage

        elif kind in {"delegate_requested", "delegate_started"}:
            state.current_delegate = _delegate_fields(event)

        elif kind == "delegate_result_classified":
            result_class = event.get("result_class")
            if result_class != "success":
                state.last_delegate_failure = {
                    "role": event.get("role"),
                    "agent_id": event.get("actor"),
                    "result_class": result_class,
                    "error_code": event.get("error_code"),
                }
            if event.get("termination_unconfirmed") is True:
                state.quarantine = {
                    "role": event.get("role"),
                    "agent_id": event.get("actor"),
                    "task_id": event.get("task_id"),
                    "error_code": event.get("error_code"),
                }

        elif kind == "delegate_termination_confirmed":
            task_id = event.get("task_id")
            if state.quarantine is not None and state.quarantine.get("task_id") == task_id:
                state.quarantine = None

        elif kind == "delegation_denied":
            if event.get("detail") == "infrastructure_circuit_open":
                state.circuit_breaker = {
                    "role": event.get("role"),
                    "task_id": event.get("task_id"),
                    "error_code": event.get("error_code"),
                }

        elif kind == "verdict":
            state.last_verdict = {
                "round": event.get("round"),
                "verdict": event.get("verdict"),
                "issues": event.get("issues"),
            }

        elif kind == "publication_created":
            state.terminal = True
            state.terminal_kind = "published"
            state.run_status = None
            state.result_class = None
            state.error_code = None
            publication_id = event.get("publication_id")
            state.publication_id = publication_id if isinstance(publication_id, str) else None

        elif kind == "run_end":
            if state.terminal_kind is None:
                status = event.get("status")
                state.terminal = True
                state.run_status = status if isinstance(status, str) else None
                result_class = event.get("result_class")
                state.result_class = result_class if isinstance(result_class, str) else None
                error_code = event.get("error_code")
                state.error_code = error_code if isinstance(error_code, str) else None
                if status == "killed":
                    state.terminal_kind = "killed"
                elif status != "ok":
                    state.terminal_kind = "failed"
                else:
                    state.terminal_kind = "no_publication"

        if kind in MEANINGFUL_EVENT_KINDS:
            event_ts = event.get("ts")
            state.last_event_ts = event_ts if isinstance(event_ts, str) else None

        if _is_successful_worktree_close(event) or _is_scriptwriter_success(event):
            _refresh_topic_from_draft(state)

    return state


def _escaped(value: Any, fallback: str = "—") -> str:
    if value is None:
        return fallback
    return html.escape(str(value))


# Display-only: the operator reads this card locally in Moscow time. All
# internal clock/throttle/backoff comparisons stay in UTC (see _as_utc,
# _parse_datetime, _default_clock below) - only what's rendered for a human
# is shifted.
DISPLAY_TZ = timezone(timedelta(hours=3), name="MSK")


def _format_timestamp(value: str | None) -> str:
    if not value:
        return "—"
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return html.escape(value)
        return html.escape(parsed.astimezone(DISPLAY_TZ).strftime("%H:%M:%S MSK"))
    except (TypeError, ValueError):
        return html.escape(value)


def _stage_name(stage: Any) -> str:
    if not isinstance(stage, str):
        return "—"
    return html.escape(STAGE_NAMES.get(stage, stage))


def _short_agent_id(value: Any) -> str:
    if value is None:
        return "—"
    agent_id = str(value)
    suffix = agent_id.rsplit("-", 1)[-1]
    return html.escape(suffix[:8])


def _attempt_label(delegate: dict[str, Any]) -> str:
    infrastructure = delegate.get("infrastructure_attempt")
    semantic = delegate.get("semantic_attempt")
    if infrastructure is not None and semantic is not None and infrastructure != semantic:
        return f"попытки infra {_escaped(infrastructure)} / semantic {_escaped(semantic)}"
    attempt = infrastructure if infrastructure is not None else semantic
    return f"попытка {_escaped(attempt)}" if attempt is not None else "попытка —"


# Telegram's sendMessage/editMessageText hard cap (UTF-16 code units, but we
# stay well clear of that distinction by budgeting in plain characters).
TELEGRAM_TEXT_LIMIT = 4096
_TRUNCATION_MARKER = "\n…"


def _fit_to_telegram_limit(lines: list[str]) -> str:
    """Join rendered lines, dropping whole trailing lines to stay under
    Telegram's message-length limit. Cutting on line boundaries (rather than
    a raw character slice) guarantees an HTML entity emitted by `_escaped()`
    is never split in half."""
    text = "\n".join(lines)
    if len(text) <= TELEGRAM_TEXT_LIMIT:
        return text
    budget = TELEGRAM_TEXT_LIMIT - len(_TRUNCATION_MARKER)
    kept: list[str] = []
    length = 0
    for line in lines:
        added = len(line) + (1 if kept else 0)
        if length + added > budget:
            break
        kept.append(line)
        length += added
    if not kept:
        return text[:budget] + _TRUNCATION_MARKER
    return "\n".join(kept) + _TRUNCATION_MARKER


def render(state: ProgressState) -> str:
    """Render only allow-listed reducer fields as Telegram HTML."""
    lines = ["🎬 ShortVideo · production run"]

    if state.terminal:
        if state.terminal_kind == "published":
            lines.extend(
                [
                    "✅ Production завершён",
                    f"Заявка на публикацию создана ({_escaped(state.publication_id)}). "
                    "Review придёт отдельным сообщением.",
                ]
            )
        elif state.terminal_kind == "failed":
            lines.extend(
                [
                    "❌ Прогон завершён с ошибкой",
                    f"Результат: {_escaped(state.result_class)}",
                    f"Ошибка: {_escaped(state.error_code)}",
                ]
            )
        elif state.terminal_kind == "killed":
            lines.append("🛑 Прогон остановлен (killed)")
        else:
            lines.append("⚠️ Production завершён без заявки на публикацию")
        if state.slug is not None:
            lines.append(f"🏷 <b>{_escaped(state.slug)}</b>")
        if state.run_status is not None:
            lines.append(f"Статус: {_escaped(state.run_status)}")
        if state.last_event_ts is not None:
            lines.append(f"Последнее событие: {_format_timestamp(state.last_event_ts)}")
        return _fit_to_telegram_limit(lines)

    lines.extend(
        [
            "🟡 В работе",
            "",
            f"🏷 <b>{_escaped(state.slug)}</b>",
            f"🕐 Старт: {_format_timestamp(state.started_at)}",
            f"🧠 Тема: "
            + ("выбирается сценаристом…" if state.topic_pending else _escaped(state.topic)),
            "",
            f"📍 Текущий этап: {_stage_name(state.current_stage)}",
        ]
    )

    if state.completed_stages:
        completed = ", ".join(
            f"{_stage_name(stage)} ({_escaped(status)})"
            for stage, status in state.completed_stages
        )
        lines.append(f"✅ Завершено: {completed}")

    if state.current_delegate is not None:
        delegate = state.current_delegate
        lines.append(
            f"👤 {_escaped(delegate.get('role'))}-{_short_agent_id(delegate.get('agent_id'))} "
            f"· {_attempt_label(delegate)}"
        )

    if state.last_delegate_failure is not None:
        failure = state.last_delegate_failure
        lines.append(
            f"⚠️ Прошлая попытка: {_escaped(failure.get('result_class'))} / "
            f"{_escaped(failure.get('error_code'))}"
        )

    if state.quarantine is not None:
        quarantine = state.quarantine
        lines.append(
            f"☣️ Termination не подтверждён — role={_escaped(quarantine.get('role'))}, "
            f"error={_escaped(quarantine.get('error_code'))}. Новая попытка заблокирована."
        )

    if state.circuit_breaker is not None:
        breaker = state.circuit_breaker
        lines.append(
            f"⛔ Circuit breaker открыт — role={_escaped(breaker.get('role'))}, "
            f"error={_escaped(breaker.get('error_code'))}"
        )

    if state.last_verdict is not None:
        verdict = state.last_verdict
        lines.append(
            f"🧐 Критик: раунд {_escaped(verdict.get('round'))}, "
            f"{_escaped(verdict.get('verdict'))}, issues={_escaped(verdict.get('issues'))}"
        )

    if state.last_event_ts is not None:
        lines.append(f"Последнее событие: {_format_timestamp(state.last_event_ts)}")
    return _fit_to_telegram_limit(lines)


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def _default_clock() -> datetime:
    return datetime.now(timezone.utc)


class ProgressCardSync:
    """Synchronize one current production run into one Telegram message."""

    def __init__(
        self,
        *,
        store: PublishingStore,
        api: "TelegramApi",
        chat_id: str,
        clock: Callable[[], datetime] = _default_clock,
    ):
        self.store = store
        self.api = api
        self.chat_id = chat_id
        self._clock = clock

    def sync(self) -> None:
        """Sync the current run; expected transport/store failures are isolated."""
        try:
            self._sync()
        except (TelegramError, OSError, StoreError) as exc:
            self._log_error(exc)

    def _sync(self) -> None:
        run_id = current_run_id()
        if run_id is None:
            return

        key = f"{PROGRESS_STATE_PREFIX}{run_id}"
        raw_stored = self.store.get_bot_state(key)
        stored: dict[str, Any] | None = None
        if raw_stored is not None:
            try:
                parsed = json.loads(raw_stored)
                if isinstance(parsed, dict):
                    stored = parsed
                else:
                    raise ValueError("stored progress state is not an object")
            except (json.JSONDecodeError, TypeError, ValueError):
                print(
                    f"Telegram progress state for run {run_id} is invalid; rebuilding",
                    file=sys.stderr,
                    flush=True,
                )

        if stored is not None and stored.get("terminal") is True:
            return

        state = reduce_events(run_id, read_events(run_dir_for(run_id)))
        text = render(state)
        digest = sha256(text.encode("utf-8")).hexdigest()
        if stored is not None and stored.get("last_render_hash") == digest:
            return

        now = self._clock()
        now = self._as_utc(now)
        next_attempt_at = _parse_datetime(stored.get("next_attempt_at")) if stored else None
        if next_attempt_at is not None and now < next_attempt_at:
            return

        last_edit_at = _parse_datetime(stored.get("last_edit_at")) if stored else None
        if last_edit_at is not None and (now - last_edit_at).total_seconds() < PROGRESS_RATE_LIMIT_SECONDS:
            return

        old_message_id = stored.get("message_id") if stored else None
        message_id = old_message_id
        try:
            if old_message_id is None:
                response = self.api.send_message(self.chat_id, text, parse_mode="HTML")
                message_id = self._message_id(response, "sendMessage")
            else:
                self.api.edit_message_text(self.chat_id, old_message_id, text, parse_mode="HTML")
        except TelegramMessageNotModified:
            message_id = old_message_id
        except (TelegramError, OSError) as exc:
            if isinstance(exc, TelegramError) and "message is not modified" in str(exc).casefold():
                message_id = old_message_id
            else:
                backoff = PROGRESS_RATE_LIMIT_BACKOFF_SECONDS if _is_rate_limited(exc) else PROGRESS_RETRY_SECONDS
                retry_state = {
                    "run_id": run_id,
                    "slug": state.slug,
                    "message_id": old_message_id,
                    "last_render_hash": stored.get("last_render_hash") if stored else None,
                    "last_edit_at": stored.get("last_edit_at") if stored else None,
                    "terminal": stored.get("terminal", False) if stored else False,
                    "next_attempt_at": (now + timedelta(seconds=backoff)).isoformat(),
                }
                try:
                    self.store.set_bot_state(key, json.dumps(retry_state, ensure_ascii=False, sort_keys=True))
                except (TelegramError, OSError, StoreError) as save_exc:
                    self._log_error(save_exc)
                    return
                self._log_error(exc)
                return

        self.store.set_bot_state(
            key,
            json.dumps(
                {
                    "run_id": run_id,
                    "slug": state.slug,
                    "message_id": message_id,
                    "last_render_hash": digest,
                    "last_edit_at": now.isoformat(),
                    "terminal": state.terminal,
                    "next_attempt_at": None,
                },
                ensure_ascii=False,
                sort_keys=True,
            ),
        )

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        if not isinstance(value, datetime):
            raise TypeError("progress clock must return datetime")
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @staticmethod
    def _message_id(response: Any, method: str) -> int:
        message_id = response.get("message_id") if isinstance(response, Mapping) else None
        if not isinstance(message_id, int) or isinstance(message_id, bool) or message_id <= 0:
            raise StoreError(f"Telegram {method} response has no positive message_id")
        return message_id

    def _log_error(self, exc: BaseException) -> None:
        text = " ".join(str(exc).split())
        endpoint = getattr(self.api, "_base", "")
        if isinstance(endpoint, str) and endpoint:
            token = endpoint.rpartition("/bot")[2]
            for secret in (endpoint, token):
                if secret:
                    text = text.replace(secret, "[redacted]")
        print(
            f"Telegram progress card sync failed: {text[:500] or exc.__class__.__name__}",
            file=sys.stderr,
            flush=True,
        )


__all__ = [
    "PROMPT_TOPIC_PLACEHOLDER",
    "ProgressCardSync",
    "ProgressState",
    "current_run_id",
    "read_events",
    "reduce_events",
    "render",
    "run_dir_for",
]
