#!/usr/bin/env python3
"""Тесты tools/archive_media.py (фейковый R2-клиент, без сети).

    python3 -m pytest tools/test_archive_media.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))


class FakeR2Client:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], dict[str, Any]] = {}
        self.uploads: list[tuple[str, str, str]] = []

    def upload_file(self, Filename, Bucket, Key, ExtraArgs):
        self.uploads.append((Filename, Bucket, Key))
        self.objects[(Bucket, Key)] = {
            "Metadata": dict(ExtraArgs.get("Metadata") or {}),
            "ContentType": ExtraArgs.get("ContentType"),
        }

    def head_object(self, *, Bucket, Key):
        if (Bucket, Key) not in self.objects:
            raise RuntimeError("NoSuchKey")
        return self.objects[(Bucket, Key)]


@pytest.fixture()
def env(monkeypatch, tmp_path):
    root = tmp_path / "repo"
    (root / "video" / "out").mkdir(parents=True)
    (root / "video" / "public" / "episodes" / "auto-x" / "audio").mkdir(parents=True)
    (root / "episodes").mkdir()

    import archive_media
    monkeypatch.setattr(archive_media, "ROOT", root)

    fake = FakeR2Client()
    monkeypatch.setattr(archive_media, "_r2_client", lambda config: fake)
    monkeypatch.setenv("SHORTVIDEO_R2_ACCOUNT_ID", "a" * 32)
    monkeypatch.setenv("SHORTVIDEO_R2_BUCKET", "test-bucket")
    monkeypatch.setenv("SHORTVIDEO_R2_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("SHORTVIDEO_R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setenv("SHORTVIDEO_R2_TTL", "900")

    return {"root": root, "archive_media": archive_media, "fake": fake}


def test_no_artifacts_on_disk_fails_loudly(env, capsys):
    am = env["archive_media"]
    code = am.main(["archive", "--slug", "ghost"])
    assert code == 2
    assert "нет ни рендера, ни аудио" in capsys.readouterr().err


def test_archive_uploads_video_and_audio_and_writes_manifest(env):
    am, root, fake = env["archive_media"], env["root"], env["fake"]
    (root / "video" / "out" / "auto-x.mp4").write_bytes(b"\x00" * 1000)
    audio_dir = root / "video" / "public" / "episodes" / "auto-x" / "audio"
    (audio_dir / "scene-0.mp3").write_bytes(b"\x01" * 500)
    (audio_dir / "scene-1.mp3").write_bytes(b"\x02" * 700)

    code = am.main(["archive", "--slug", "auto-x"])
    assert code == 0
    assert len(fake.uploads) == 3

    manifest = json.loads((root / "episodes" / "auto-x.artifacts.json").read_text())
    assert manifest["slug"] == "auto-x"
    assert set(manifest["artifacts"]) == {"video", "audio/scene-0.mp3", "audio/scene-1.mp3"}
    video_entry = manifest["artifacts"]["video"]
    assert video_entry["bytes"] == 1000
    assert video_entry["r2_key"] == "archive/auto-x/video.mp4"
    assert len(video_entry["sha256"]) == 64


def test_archive_is_idempotent_skips_unchanged_content(env):
    am, root, fake = env["archive_media"], env["root"], env["fake"]
    (root / "video" / "out" / "auto-x.mp4").write_bytes(b"\x00" * 1000)

    assert am.main(["archive", "--slug", "auto-x"]) == 0
    assert len(fake.uploads) == 1

    # Второй прогон, содержимое не менялось — второй загрузки быть не должно.
    assert am.main(["archive", "--slug", "auto-x"]) == 0
    assert len(fake.uploads) == 1


def test_archive_reuploads_when_content_changes(env):
    am, root, fake = env["archive_media"], env["root"], env["fake"]
    video = root / "video" / "out" / "auto-x.mp4"
    video.write_bytes(b"\x00" * 1000)
    am.main(["archive", "--slug", "auto-x"])

    video.write_bytes(b"\x01" * 1000)  # рендер перегенерировали заново
    am.main(["archive", "--slug", "auto-x"])
    assert len(fake.uploads) == 2


def test_dry_run_touches_neither_r2_nor_manifest(env):
    am, root, fake = env["archive_media"], env["root"], env["fake"]
    (root / "video" / "out" / "auto-x.mp4").write_bytes(b"\x00" * 1000)

    code = am.main(["archive", "--slug", "auto-x", "--dry-run"])
    assert code == 0
    assert fake.uploads == []
    assert not (root / "episodes" / "auto-x.artifacts.json").is_file()


def test_verify_reports_ok_for_matching_manifest(env, capsys):
    am, root = env["archive_media"], env["root"]
    (root / "video" / "out" / "auto-x.mp4").write_bytes(b"\x00" * 1000)
    am.main(["archive", "--slug", "auto-x"])
    capsys.readouterr()

    code = am.main(["verify", "--slug", "auto-x"])
    out = json.loads(capsys.readouterr().out)
    assert code == 0
    assert out["bad"] == []
    assert out["ok"] == ["video"]


def test_verify_catches_sha_mismatch(env, capsys):
    am, root = env["archive_media"], env["root"]
    (root / "video" / "out" / "auto-x.mp4").write_bytes(b"\x00" * 1000)
    am.main(["archive", "--slug", "auto-x"])
    capsys.readouterr()

    manifest_path = root / "episodes" / "auto-x.artifacts.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["artifacts"]["video"]["sha256"] = "0" * 64
    manifest_path.write_text(json.dumps(manifest))

    code = am.main(["verify", "--slug", "auto-x"])
    out = json.loads(capsys.readouterr().out)
    assert code == 1
    assert len(out["bad"]) == 1


def test_verify_catches_missing_object_in_r2(env, capsys):
    am, root, fake = env["archive_media"], env["root"], env["fake"]
    (root / "video" / "out" / "auto-x.mp4").write_bytes(b"\x00" * 1000)
    am.main(["archive", "--slug", "auto-x"])
    capsys.readouterr()
    fake.objects.clear()  # объект пропал в R2, манифест этого не знает

    code = am.main(["verify", "--slug", "auto-x"])
    out = json.loads(capsys.readouterr().out)
    assert code == 1
    assert "video" in [b["key"] for b in out["bad"]]
