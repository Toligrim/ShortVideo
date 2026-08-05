"""Prepare a local, immutable publication review request with no network I/O."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import subprocess

from .config import PublishingConfig
from .db import PublishingStore, StoreError
from .metadata import MetadataError, MetadataSnapshot, load_metadata, write_metadata_snapshot
from .models import ExecutionMode, Publication
from .preflight import (
    AssetSnapshot,
    MediaProbe,
    PreflightError,
    RunCommand,
    normalize_asset,
    probe_video,
    sha256_file,
    validate_target_policy,
    verify_asset_snapshot,
)


class ReviewError(RuntimeError):
    """The local review request could not be prepared safely."""


@dataclass(frozen=True)
class PreparedReview:
    publication: Publication
    source_sha256: str
    asset: AssetSnapshot
    metadata: MetadataSnapshot
    source_probe: MediaProbe


def prepare_review(
    *,
    slug: str,
    video_path: Path | str,
    metadata_path: Path | str,
    config: PublishingConfig,
    store: PublishingStore | None = None,
    execution_mode: ExecutionMode | str = ExecutionMode.DRY_RUN,
    run: RunCommand = subprocess.run,
) -> PreparedReview:
    """Create an approval-gated local publication record.

    The function does not import a network client, does not contact Telegram,
    and does not publish anything. Its sole side effects are local immutable
    snapshots and the durable SQLite review/outbox transaction.
    """
    try:
        mode = ExecutionMode(execution_mode)
    except ValueError as exc:
        raise ReviewError(f"invalid execution mode: {execution_mode!r}") from exc
    try:
        metadata = load_metadata(metadata_path)
    except MetadataError as exc:
        raise ReviewError(str(exc)) from exc
    if metadata["slug"] != slug:
        raise ReviewError(
            f"metadata slug {metadata['slug']!r} does not match requested slug {slug!r}"
        )
    try:
        config.ensure_directories()
        source = Path(video_path).expanduser().resolve()
        source_sha256 = sha256_file(source)
        source_probe = probe_video(source, ffprobe_bin=config.ffprobe_bin, run=run)
        targets = validate_target_policy(source_probe, metadata["targets"].keys())
        asset = normalize_asset(
            source,
            source_probe,
            temporary_dir=config.temporary_dir,
            asset_dir=config.asset_dir,
            ffmpeg_bin=config.ffmpeg_bin,
            ffprobe_bin=config.ffprobe_bin,
            run=run,
        )
        if sha256_file(source) != source_sha256:
            raise ReviewError("source video changed while preparing review")
        verify_asset_snapshot(asset.path, asset.sha256)
        metadata_snapshot = write_metadata_snapshot(metadata, config.metadata_dir)
        publication_store = store or PublishingStore(config.database_path)
        publication = publication_store.create_publication(
            slug=slug,
            source_path=str(source),
            source_sha256=source_sha256,
            asset_path=str(asset.path),
            asset_sha256=asset.sha256,
            metadata_path=str(metadata_snapshot.path),
            metadata_sha256=metadata_snapshot.sha256,
            target_platforms=targets,
            execution_mode=mode,
        )
    except (PreflightError, MetadataError, StoreError, OSError) as exc:
        raise ReviewError(str(exc)) from exc
    return PreparedReview(
        publication=publication,
        source_sha256=source_sha256,
        asset=asset,
        metadata=metadata_snapshot,
        source_probe=source_probe,
    )
