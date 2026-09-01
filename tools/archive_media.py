#!/usr/bin/env python3
"""Постоянный архив рендера и озвучки эпизода в Cloudflare R2 + манифест в git.

docs/agent-safety-architecture.md, §5.3 (уровень B). Требование оператора
«в git должно быть вообще всё» на видео и аудио буквально невыполнимо: один
только уже накопленный rендер весит 1.37 ГБ (45 роликов), при темпе ~7
роликов/сутки это ~245 МБ/сутки — такими темпами `.git` раздувается на
несколько гигабайт в месяц, и git не сжимает mp4 дельтами: каждая версия
ложится в историю целиком, навсегда (`.git` уже разово чистили от старых
mp4 — см. git-историю, коммит с git-filter-repo). Аудио отдельно ценно —
Gemini TTS недетерминирован, значит "перерендерить и получить то же самое"
для звука невозможно в принципе, его нельзя просто игнорировать как
воспроизводимое.

Решение — не хранить содержимое в git, а хранить УКАЗАТЕЛЬ на него: тяжёлые
файлы уезжают в R2 (тот же бакет и те же credentials, что уже настроены для
временного стейджинга Instagram — tools/publishing/adapters/r2.py, только
другой префикс ключа: `archive/`, не `temporary-media/`, и без TTL/cleanup
— здесь хранение постоянное), а в git коммитится крошечный
episodes/<slug>.artifacts.json с sha256, размером и ключом каждого файла.
Manifest — уровень A (repo_guard.py must see it), сами файлы — уровень B.

    archive_media.py archive --slug SLUG [--dry-run]
    archive_media.py verify  --slug SLUG
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Any, Callable, Mapping, Protocol

sys.path.insert(0, str(Path(__file__).resolve().parent))
from publishing.adapters.r2 import R2Config, R2ConfigurationError  # noqa: E402
from publishing.security import absolute_path, reject_symlink_chain, PrivatePathError  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
KEY_PREFIX = "archive"


class R2ArchiveError(RuntimeError):
    """Постоянный R2-архив недоступен или сконфигурирован небезопасно."""


class R2Client(Protocol):
    def upload_file(self, Filename: str, Bucket: str, Key: str, ExtraArgs: Mapping[str, Any]) -> None: ...
    def head_object(self, *, Bucket: str, Key: str) -> Mapping[str, Any]: ...


def _r2_client(config: R2Config) -> R2Client:
    try:
        import boto3
    except ImportError as exc:
        raise R2ArchiveError("архив в R2 требует опциональную зависимость boto3") from exc
    return boto3.client(
        "s3", endpoint_url=config.endpoint_url, region_name="auto",
        aws_access_key_id=config.access_key_id, aws_secret_access_key=config.secret_access_key,
    )


@dataclass(frozen=True)
class Artifact:
    kind: str  # "video" | "audio"
    local_path: Path
    r2_key: str
    content_type: str


def find_artifacts(slug: str) -> list[Artifact]:
    out: list[Artifact] = []
    video = ROOT / "video" / "out" / f"{slug}.mp4"
    if video.is_file():
        out.append(Artifact("video", video, f"{KEY_PREFIX}/{slug}/video.mp4", "video/mp4"))
    audio_dir = ROOT / "video" / "public" / "episodes" / slug / "audio"
    if audio_dir.is_dir():
        for p in sorted(audio_dir.glob("*.mp3")):
            out.append(Artifact("audio", p, f"{KEY_PREFIX}/{slug}/audio/{p.name}", "audio/mpeg"))
    return out


def sha256_file(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def manifest_path(slug: str) -> Path:
    return ROOT / "episodes" / f"{slug}.artifacts.json"


def load_manifest(slug: str) -> dict[str, Any]:
    p = manifest_path(slug)
    if not p.is_file():
        return {"slug": slug, "artifacts": {}}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"slug": slug, "artifacts": {}}


def _validate_local(path: Path) -> Path:
    resolved = absolute_path(path)
    try:
        reject_symlink_chain(resolved, label="архивируемый артефакт")
    except PrivatePathError as exc:
        raise R2ArchiveError(f"{path} небезопасен для загрузки") from exc
    if not resolved.is_file():
        raise R2ArchiveError(f"{path} не файл")
    return resolved


def cmd_archive(args: argparse.Namespace) -> int:
    artifacts = find_artifacts(args.slug)
    if not artifacts:
        print(f"archive_media: нет ни рендера, ни аудио для {args.slug!r} "
              "(video/out/<slug>.mp4, video/public/episodes/<slug>/audio/*.mp3)",
              file=sys.stderr)
        return 2

    manifest = load_manifest(args.slug)
    manifest["slug"] = args.slug
    entries: dict[str, Any] = manifest.setdefault("artifacts", {})

    client = None
    config = None
    uploaded, skipped = [], []
    for art in artifacts:
        local = _validate_local(art.local_path)
        digest = sha256_file(local)
        size = local.stat().st_size
        rel = str(local.relative_to(ROOT))
        key = art.kind if art.kind == "video" else f"audio/{local.name}"
        prior = entries.get(key)
        if prior and prior.get("sha256") == digest:
            skipped.append(rel)
            continue

        if args.dry_run:
            uploaded.append(rel)
            continue

        if config is None:
            config = R2Config.from_environment()
            config.validate()
            client = _r2_client(config)
        try:
            client.upload_file(
                str(local), config.bucket, art.r2_key,
                ExtraArgs={"ContentType": art.content_type, "Metadata": {"sha256": digest}},
            )
        except Exception as exc:  # noqa: BLE001 — сеть/R2, детали провайдера не нужны наружу
            print(f"archive_media: загрузка {rel} в R2 не удалась: {exc}", file=sys.stderr)
            return 3
        entries[key] = {
            "local_path": rel, "r2_key": art.r2_key, "bucket": config.bucket,
            "sha256": digest, "bytes": size, "content_type": art.content_type,
            "uploaded_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        uploaded.append(rel)

    if args.dry_run:
        print(json.dumps({"would_upload": uploaded, "already_current": skipped}, ensure_ascii=False, indent=1))
        return 0

    manifest_path(args.slug).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"uploaded": uploaded, "already_current": skipped,
                      "manifest": str(manifest_path(args.slug).relative_to(ROOT))},
                     ensure_ascii=False, indent=1))
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    manifest = load_manifest(args.slug)
    entries: dict[str, Any] = manifest.get("artifacts") or {}
    if not entries:
        print(f"archive_media: манифеста нет или он пуст для {args.slug!r}", file=sys.stderr)
        return 2

    config = R2Config.from_environment()
    config.validate()
    client = _r2_client(config)

    ok, bad = [], []
    for key, entry in entries.items():
        try:
            head = client.head_object(Bucket=entry["bucket"], Key=entry["r2_key"])
        except Exception as exc:  # noqa: BLE001
            bad.append({"key": key, "reason": f"недоступен в R2: {exc}"})
            continue
        remote_sha = (head.get("Metadata") or {}).get("sha256")
        if remote_sha != entry.get("sha256"):
            bad.append({"key": key, "reason": f"sha256 не совпадает (манифест={entry.get('sha256')}, R2={remote_sha})"})
            continue
        ok.append(key)

    print(json.dumps({"ok": ok, "bad": bad}, ensure_ascii=False, indent=1))
    return 0 if not bad else 1


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("archive", help="загрузить video/audio эпизода в R2, записать манифест")
    a.add_argument("--slug", required=True)
    a.add_argument("--dry-run", action="store_true")

    v = sub.add_parser("verify", help="сверить манифест с реальным содержимым R2")
    v.add_argument("--slug", required=True)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.cmd == "archive":
        return cmd_archive(args)
    if args.cmd == "verify":
        return cmd_verify(args)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
