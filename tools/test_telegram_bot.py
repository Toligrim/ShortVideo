#!/usr/bin/env python3
import argparse
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

import telegram_bot


class FakeApi:
    def __init__(self):
        self.sent = None

    def get_updates(self):
        return [
            {"update_id": 1, "message": {"chat": {"id": 10, "first_name": "Old"}}},
            {"update_id": 2, "message": {"chat": {"id": 20, "username": "new_chat"}}},
        ]

    def send_video(self, chat_id, video_path, caption):
        self.sent = (chat_id, video_path, caption)
        return {"message_id": 7}


class TelegramBotTests(unittest.TestCase):
    def test_latest_chat_id_uses_the_newest_message(self):
        chat_id, label = telegram_bot.latest_chat_id(FakeApi())
        self.assertEqual((chat_id, label), (20, "new_chat"))

    def test_send_video_resolves_path_and_passes_caption(self):
        api = FakeApi()
        with tempfile.TemporaryDirectory() as tmp:
            video = Path(tmp) / "clip.mp4"
            video.write_bytes(b"not a real video")
            args = argparse.Namespace(
                video=str(video), chat_id="123", caption="Тестовый ролик"
            )
            telegram_bot.send_video(api, args)

        self.assertEqual(api.sent[0], "123")
        self.assertEqual(api.sent[1], video.resolve())
        self.assertEqual(api.sent[2], "Тестовый ролик")

    def test_command_name_rejects_command_prefixes(self):
        self.assertEqual(
            telegram_bot.command_name("/video@ShortVideoLLMMakeBot"), "/video"
        )
        self.assertEqual(telegram_bot.command_name("/videoXYZ"), "/videoxyz")
        self.assertEqual(
            telegram_bot.command_name("/video@OtherBot", "ShortVideoLLMMakeBot"), ""
        )

    @patch("telegram_bot.subprocess.run")
    def test_probe_video_returns_explicit_send_video_metadata(self, run):
        run.return_value.stdout = (
            '{"streams":[{"width":1080,"height":1920,"duration":"96.23"}]}'
        )
        self.assertEqual(
            telegram_bot.probe_video(Path("clip.mp4")),
            {"width": 1080, "height": 1920, "duration": 97},
        )

    @patch("telegram_bot.urllib.request.urlopen")
    @patch("telegram_bot.probe_video", return_value={})
    def test_send_video_network_error_does_not_leak_bot_token(self, _probe, urlopen):
        api = telegram_bot.TelegramApi("top-secret-token")
        urlopen.side_effect = urllib.error.URLError(f"cannot reach {api._base}/sendVideo")
        with tempfile.TemporaryDirectory() as tmp:
            video = Path(tmp) / "clip.mp4"
            video.write_bytes(b"video")
            with self.assertRaises(telegram_bot.TelegramError) as raised:
                api.send_video("123", video)
        self.assertNotIn("top-secret-token", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
