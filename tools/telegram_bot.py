#!/usr/bin/env python3
"""Минимальный Telegram-бот для отправки готового видео.

Токен никогда не хранится в репозитории:

    export TELEGRAM_BOT_TOKEN='...'
    python3 tools/telegram_bot.py send-video binary-basics.mp4

Если chat_id не передан, команда берёт последний чат из getUpdates. Для
постоянного режима укажи разрешённый чат:

    export TELEGRAM_ALLOWED_CHAT_ID='...'
    python3 tools/telegram_bot.py poll --video binary-basics.mp4
"""
from __future__ import annotations

import argparse
import json
import math
import mimetypes
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any


MAX_UPLOAD_BYTES = 50 * 1024 * 1024
ROOT = Path(__file__).resolve().parent.parent


class TelegramError(RuntimeError):
    """Ошибка ответа Telegram Bot API без утечки токена."""


class TelegramMessageNotModified(TelegramError):
    """A successful idempotent edit reported as a Telegram API error."""


def dotenv_value(name: str) -> str:
    env_path = ROOT / ".env"
    if not env_path.is_file():
        return ""
    for line in env_path.read_text().splitlines():
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1].strip()
    return ""


def probe_video(path: Path) -> dict[str, int]:
    """Получить размеры и длительность для явных полей sendVideo."""
    try:
        completed = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height,duration",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        stream = json.loads(completed.stdout)["streams"][0]
        fields = {
            "width": int(stream["width"]),
            "height": int(stream["height"]),
        }
        if stream.get("duration") is not None:
            fields["duration"] = math.ceil(float(stream["duration"]))
        return fields
    except (OSError, subprocess.CalledProcessError, KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError):
        # Telegram умеет определить метаданные сам; явные поля — улучшение,
        # а не причина делать отправку невозможной.
        return {}


def read_json_response(response: Any, method: str) -> dict[str, Any]:
    try:
        result = json.load(response)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise TelegramError(f"Telegram вернул некорректный JSON на {method}") from exc
    if not isinstance(result, dict):
        raise TelegramError(f"Telegram вернул неожиданный ответ на {method}")
    return result


class TelegramApi:
    def __init__(self, token: str):
        self._base = f"https://api.telegram.org/bot{token}"

    def _safe_error_text(self, value: object) -> str:
        """Keep endpoint diagnostics useful without ever exposing the bot token."""
        return str(value).replace(self._base, "https://api.telegram.org/bot[redacted]")[:500]

    @staticmethod
    def _is_message_not_modified(method: str, description: str) -> bool:
        return (
            method in {"editMessageText", "editMessageReplyMarkup"}
            and "message is not modified" in description.casefold()
        )

    def _raise_api_error(self, method: str, description: object) -> None:
        safe_description = self._safe_error_text(description)
        if self._is_message_not_modified(method, safe_description):
            # Telegram uses a 400 response for an idempotent edit.  Keep the
            # transport classification stable and do not retain the
            # provider's full diagnostic text in this special case.
            raise TelegramMessageNotModified("Telegram API: message is not modified")
        raise TelegramError(f"Telegram API: {safe_description}")

    def _json_call(self, method: str, payload: dict[str, Any]) -> Any:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            f"{self._base}/{method}",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                result = read_json_response(response, method)
        except urllib.error.HTTPError as exc:
            # Bot API application errors normally use HTTP 400 and still
            # include a JSON ``description``.  Read it when available so an
            # idempotent "message is not modified" response gets the same
            # stable classification as an HTTP-200 ``ok: false`` response.
            try:
                error_result = read_json_response(exc, method)
            except TelegramError:
                raise TelegramError(f"Telegram HTTP {exc.code} на {method}") from exc
            self._raise_api_error(method, error_result.get("description", f"HTTP {exc.code}"))
        except urllib.error.URLError as exc:
            raise TelegramError(
                f"не удалось подключиться к Telegram: {self._safe_error_text(exc.reason)}"
            ) from exc

        if not result.get("ok"):
            self._raise_api_error(method, result.get("description", "неизвестная ошибка"))
        return result.get("result")

    def get_me(self) -> dict[str, Any]:
        return self._json_call("getMe", {})

    def get_updates(
        self, *, offset: int | None = None, timeout: int = 0, limit: int = 100
    ) -> list[dict[str, Any]]:
        payload: dict[str, Any] = {
            "limit": limit,
            "timeout": timeout,
            "allowed_updates": ["message", "channel_post", "callback_query"],
        }
        if offset is not None:
            payload["offset"] = offset
        result = self._json_call("getUpdates", payload)
        if not isinstance(result, list):
            raise TelegramError("Telegram вернул неожиданный список обновлений")
        return result

    def send_message(
        self,
        chat_id: str | int,
        text: str,
        *,
        reply_markup: dict[str, Any] | None = None,
        reply_to_message_id: int | None = None,
        parse_mode: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"chat_id": chat_id, "text": text}
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        if reply_to_message_id is not None:
            payload["reply_to_message_id"] = reply_to_message_id
        if parse_mode is not None:
            payload["parse_mode"] = parse_mode
        result = self._json_call("sendMessage", payload)
        if not isinstance(result, dict):
            raise TelegramError("Telegram вернул неожиданный ответ на sendMessage")
        return result

    def answer_callback_query(
        self,
        callback_query_id: str,
        *,
        text: str | None = None,
        show_alert: bool = False,
    ) -> bool:
        payload: dict[str, Any] = {
            "callback_query_id": callback_query_id,
            "show_alert": show_alert,
        }
        if text:
            payload["text"] = text
        return bool(self._json_call("answerCallbackQuery", payload))

    def edit_message_text(
        self,
        chat_id: str | int,
        message_id: int,
        text: str,
        *,
        reply_markup: dict[str, Any] | None = None,
        parse_mode: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text,
        }
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        if parse_mode is not None:
            payload["parse_mode"] = parse_mode
        result = self._json_call("editMessageText", payload)
        if not isinstance(result, dict):
            raise TelegramError("Telegram вернул неожиданный ответ на editMessageText")
        return result

    def edit_message_reply_markup(
        self,
        chat_id: str | int,
        message_id: int,
        *,
        reply_markup: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "message_id": message_id,
        }
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        result = self._json_call("editMessageReplyMarkup", payload)
        if not isinstance(result, dict):
            raise TelegramError("Telegram вернул неожиданный ответ на editMessageReplyMarkup")
        return result

    def send_video(
        self,
        chat_id: str | int,
        video_path: Path,
        caption: str | None = None,
    ) -> dict[str, Any]:
        size = video_path.stat().st_size
        if size > MAX_UPLOAD_BYTES:
            raise TelegramError(
                f"файл {video_path} весит {size / 1024 / 1024:.1f} МБ; "
                f"лимит Bot API — {MAX_UPLOAD_BYTES / 1024 / 1024:.0f} МБ"
            )

        boundary = f"----ShortVideoBot{uuid.uuid4().hex}".encode("ascii")
        chunks: list[bytes] = []

        def field(name: str, value: str) -> None:
            chunks.extend(
                [
                    b"--" + boundary + b"\r\n",
                    f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(
                        "utf-8"
                    ),
                    value.encode("utf-8"),
                    b"\r\n",
                ]
            )

        field("chat_id", str(chat_id))
        field("supports_streaming", "true")
        for name, value in probe_video(video_path).items():
            field(name, str(value))
        if caption:
            field("caption", caption)

        safe_filename = (
            video_path.name.replace("\\", "_")
            .replace('"', "'")
            .replace("\r", "_")
            .replace("\n", "_")
        )
        content_type = mimetypes.guess_type(safe_filename)[0] or "video/mp4"
        chunks.extend(
            [
                b"--" + boundary + b"\r\n",
                (
                    f'Content-Disposition: form-data; name="video"; '
                    f'filename="{safe_filename}"\r\n'
                ).encode("utf-8"),
                f"Content-Type: {content_type}\r\n\r\n".encode("ascii"),
                video_path.read_bytes(),
                b"\r\n--" + boundary + b"--\r\n",
            ]
        )
        body = b"".join(chunks)
        request = urllib.request.Request(
            f"{self._base}/sendVideo",
            data=body,
            headers={
                "Content-Type": f"multipart/form-data; boundary={boundary.decode('ascii')}"
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                result = read_json_response(response, "sendVideo")
        except urllib.error.HTTPError as exc:
            raise TelegramError(f"Telegram HTTP {exc.code} на sendVideo") from exc
        except urllib.error.URLError as exc:
            raise TelegramError(
                f"не удалось отправить файл в Telegram: {self._safe_error_text(exc.reason)}"
            ) from exc

        if not result.get("ok"):
            description = self._safe_error_text(result.get("description", "ошибка отправки"))
            raise TelegramError(f"Telegram API: {description}")
        response = result.get("result", {})
        if not isinstance(response, dict):
            raise TelegramError("Telegram вернул неожиданный ответ на sendVideo")
        return response


def get_api() -> TelegramApi:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip() or dotenv_value("TELEGRAM_BOT_TOKEN")
    if not token:
        raise SystemExit("нет TELEGRAM_BOT_TOKEN (ни в env, ни в .env)")
    return TelegramApi(token)


def default_chat_id() -> str:
    return os.environ.get("TELEGRAM_ALLOWED_CHAT_ID", "").strip() or dotenv_value(
        "TELEGRAM_ALLOWED_CHAT_ID"
    )


def latest_chat_id(api: TelegramApi) -> tuple[int | str, str]:
    updates = api.get_updates()
    for update in reversed(updates):
        message = update.get("message") or update.get("channel_post")
        chat = message.get("chat") if message else None
        if chat and "id" in chat:
            label = chat.get("title") or chat.get("username") or chat.get("first_name") or str(chat["id"])
            return chat["id"], label
    raise TelegramError(
        "chat_id не найден. Откройте диалог с ботом, отправьте ему /start "
        "и повторите команду; либо передайте --chat-id явно."
    )


def send_video(api: TelegramApi, args: argparse.Namespace) -> None:
    video_path = Path(args.video).resolve()
    if not video_path.is_file():
        raise TelegramError(f"видео не найдено: {video_path}")
    chat_id = args.chat_id or default_chat_id() or None
    label = "указанный чат"
    if chat_id is None:
        chat_id, label = latest_chat_id(api)
    result = api.send_video(chat_id, video_path, args.caption)
    safe_label = "".join(ch for ch in str(label) if 32 <= ord(ch) != 127)
    safe_label = " ".join(safe_label.split())[:120]
    print(f"Видео отправлено в чат {safe_label}; message_id={result.get('message_id', '?')}")


def command_name(text: str, bot_username: str | None = None) -> str:
    """Извлечь имя команды, не принимая похожие строки вроде /videoXYZ."""
    stripped = text.strip().lower()
    first = stripped.split(maxsplit=1)[0] if stripped else ""
    name, separator, mention = first.partition("@")
    if separator and bot_username and mention != bot_username.lower():
        return ""
    return name


def poll(api: TelegramApi, video: str | None, allowed_chat_id: str) -> None:
    video_path = Path(video).resolve() if video else None
    bot_username = str(api.get_me().get("username", ""))
    offset: int | None = None
    print("Бот запущен; Ctrl-C для остановки", flush=True)
    while True:
        try:
            for update in api.get_updates(offset=offset, timeout=25):
                update_id = update.get("update_id")
                message = update.get("message")
                if not isinstance(update_id, int) or not isinstance(message, dict):
                    if isinstance(update_id, int):
                        offset = update_id + 1
                    continue
                chat = message.get("chat")
                text = message.get("text")
                if not isinstance(chat, dict) or "id" not in chat or not isinstance(text, str):
                    offset = update_id + 1
                    continue
                chat_id = chat["id"]
                if str(chat_id) != str(allowed_chat_id):
                    offset = update_id + 1
                    continue
                command = command_name(text, bot_username)
                if command == "/start":
                    api.send_message(chat_id, "Бот ShortVideo на связи. Команда /video отправит ролик.")
                elif command == "/video":
                    if video_path is None:
                        api.send_message(chat_id, "Видео не настроено: запустите бота с --video путь-к-файлу")
                    else:
                        api.send_video(chat_id, video_path, "Бинарная система исчисления")
                offset = update_id + 1
        except (TelegramError, OSError) as exc:
            print(f"Ошибка: {exc}", file=sys.stderr, flush=True)
            time.sleep(3)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("me", help="проверить токен и показать имя бота")

    send = sub.add_parser("send-video", help="отправить MP4 в чат")
    send.add_argument("video", help="путь к MP4")
    send.add_argument("--chat-id", help="Telegram chat_id; если не указан, берётся из getUpdates")
    send.add_argument("--caption", default="Бинарная система исчисления")

    run = sub.add_parser("poll", help="запустить long-polling бота")
    run.add_argument("--video", help="MP4 для команды /video")
    run.add_argument("--chat-id", help="разрешённый chat_id; иначе TELEGRAM_ALLOWED_CHAT_ID")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    api = get_api()
    try:
        if args.command == "me":
            bot = api.get_me()
            print(f"@{bot.get('username', '')} ({bot.get('first_name', 'Telegram bot')})")
        elif args.command == "send-video":
            send_video(api, args)
        elif args.command == "poll":
            allowed_chat_id = args.chat_id or default_chat_id()
            if not allowed_chat_id:
                raise TelegramError(
                    "Для poll укажи --chat-id или TELEGRAM_ALLOWED_CHAT_ID; "
                    "бот не принимает команды от произвольных чатов"
                )
            poll(api, args.video, allowed_chat_id)
    except (TelegramError, OSError) as exc:
        print(f"Ошибка: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
