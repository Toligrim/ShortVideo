from contextlib import redirect_stdout
from dataclasses import replace
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import publish
from publishing.config import PublishingConfig
from publishing.db import PublishingStore
from publishing.models import ExecutionMode, PublicationState
from publishing.review import ReviewError, prepare_review


METADATA = {
    "schema_version": 1,
    "slug": "hash-tables",
    "targets": {
        "youtube": {
            "title": "Почему хеш-таблицы не ломаются на коллизиях",
            "description": "Коллизии решаются цепочками и пробами.",
            "tags": ["алгоритмы", "хеш-таблицы"],
            "category_id": "28",
            "privacy_status": "private",
            "made_for_kids": False,
            "contains_synthetic_media": True,
            "notify_subscribers": False,
        },
        "instagram": {"caption": "Коллизия — не поломка.", "share_to_feed": True},
    },
}


def media_payload():
    return {
        "streams": [
            {
                "codec_type": "video",
                "codec_name": "h264",
                "profile": "High",
                "pix_fmt": "yuv420p",
                "width": 1080,
                "height": 1920,
                "avg_frame_rate": "30/1",
                "r_frame_rate": "30/1",
                "bit_rate": "2000000",
            },
            {
                "codec_type": "audio",
                "codec_name": "aac",
                "sample_rate": "48000",
                "channels": 2,
                "bit_rate": "128000",
            },
        ],
        "format": {"duration": "74.88", "size": "128"},
    }


class LocalRunner:
    def __init__(self):
        self.calls = []

    def __call__(self, command, *, capture_output, text, check):
        self.calls.append(command)
        if command[0] == "fake-ffprobe":
            return subprocess.CompletedProcess(command, 0, json.dumps(media_payload()), "")
        if command[0] == "fake-ffmpeg":
            Path(command[-1]).write_bytes(b"deterministic-normalized-asset")
            return subprocess.CompletedProcess(command, 0, "", "")
        raise AssertionError(f"unexpected command: {command}")


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / "render.mp4"
        self.source.write_bytes(b"original-render-never-mutated")
        self.metadata_path = self.root / "hash-tables.publish.json"
        self.metadata_path.write_text(json.dumps(METADATA, ensure_ascii=False), encoding="utf-8")
        config = PublishingConfig.from_environment(root=self.root, state_dir=self.root / "var" / "publisher")
        self.config = replace(config, ffmpeg_bin="fake-ffmpeg", ffprobe_bin="fake-ffprobe")
        self.store = PublishingStore(self.config.database_path)
        self.runner = LocalRunner()

    def prepare(self, *, mode=ExecutionMode.DRY_RUN, slug="hash-tables"):
        return prepare_review(
            slug=slug,
            video_path=self.source,
            metadata_path=self.metadata_path,
            config=self.config,
            store=self.store,
            execution_mode=mode,
            run=self.runner,
        )

    def test_slug_mismatch_happens_before_any_media_command(self):
        with self.assertRaisesRegex(ReviewError, "does not match"):
            self.prepare(slug="other-slug")
        self.assertEqual(self.runner.calls, [])

    def test_initial_preflight_errors_are_wrapped_as_review_errors(self):
        self.source.unlink()
        with self.assertRaisesRegex(ReviewError, "video is not a regular file"):
            self.prepare()

    def test_dry_run_is_idempotent_live_is_distinct_and_network_is_not_used(self):
        before = self.source.read_bytes()
        with patch.object(socket, "create_connection", side_effect=AssertionError("network is forbidden")):
            dry_run = self.prepare()
            dry_repeat = self.prepare()
            live = self.prepare(mode=ExecutionMode.LIVE)
            live_repeat = self.prepare(mode=ExecutionMode.LIVE)
        self.assertEqual(dry_run.publication.state, PublicationState.REVIEW_PENDING)
        self.assertEqual(dry_run.publication.execution_mode, ExecutionMode.DRY_RUN)
        self.assertEqual(dry_run.publication.id, dry_repeat.publication.id)
        self.assertEqual(live.publication.execution_mode, ExecutionMode.LIVE)
        self.assertNotEqual(dry_run.publication.id, live.publication.id)
        self.assertEqual(live.publication.id, live_repeat.publication.id)
        self.assertEqual(self.source.read_bytes(), before)
        outbox = self.store.list_outbox()
        self.assertEqual(len(outbox), 2)
        self.assertTrue(all(item.kind == "telegram.review_card" for item in outbox))

    def test_mutated_content_addressed_asset_is_never_overwritten(self):
        prepared = self.prepare()
        os.chmod(prepared.asset.path, 0o644)
        prepared.asset.path.write_bytes(b"tampered")
        with self.assertRaisesRegex(ReviewError, "hash mismatch"):
            self.prepare()
        self.assertEqual(prepared.asset.path.read_bytes(), b"tampered")

    def test_cli_init_and_status_json_are_local_and_machine_readable(self):
        stdout = io.StringIO()
        with redirect_stdout(stdout):
            self.assertEqual(publish.main(["init-db", "--state-dir", str(self.config.state_dir)]), 0)
        self.assertIn("SQLite store ready", stdout.getvalue())
        self.prepare()
        stdout = io.StringIO()
        with redirect_stdout(stdout):
            self.assertEqual(publish.main(["status", "--state-dir", str(self.config.state_dir), "--json"]), 0)
        status = json.loads(stdout.getvalue())
        self.assertEqual(len(status), 1)
        self.assertEqual(status[0]["slug"], "hash-tables")
        self.assertEqual(status[0]["execution_mode"], "dry-run")


if __name__ == "__main__":
    unittest.main()
