"""Local, non-secret configuration for prepare/review commands."""
from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def _state_dir_from_environment(root: Path) -> Path:
    raw = os.environ.get("SHORTVIDEO_PUBLISH_STATE_DIR", "").strip()
    candidate = Path(raw).expanduser() if raw else root / "var" / "publisher"
    if not candidate.is_absolute():
        candidate = root / candidate
    return candidate.resolve()


@dataclass(frozen=True)
class PublishingConfig:
    """Paths and local binary names only; credentials are deliberately absent."""

    root: Path
    state_dir: Path
    database_path: Path
    asset_dir: Path
    metadata_dir: Path
    temporary_dir: Path
    ffmpeg_bin: str
    ffprobe_bin: str

    @classmethod
    def from_environment(
        cls,
        *,
        root: Path | str = ROOT,
        state_dir: Path | str | None = None,
    ) -> "PublishingConfig":
        resolved_root = Path(root).resolve()
        resolved_state = (
            Path(state_dir).expanduser().resolve()
            if state_dir is not None
            else _state_dir_from_environment(resolved_root)
        )
        return cls(
            root=resolved_root,
            state_dir=resolved_state,
            database_path=resolved_state / "publisher.sqlite3",
            asset_dir=resolved_state / "assets",
            metadata_dir=resolved_state / "metadata",
            temporary_dir=resolved_state / "tmp",
            ffmpeg_bin=os.environ.get("SHORTVIDEO_FFMPEG_BIN", "ffmpeg").strip() or "ffmpeg",
            ffprobe_bin=os.environ.get("SHORTVIDEO_FFPROBE_BIN", "ffprobe").strip() or "ffprobe",
        )

    def ensure_directories(self) -> None:
        for directory in (self.state_dir, self.asset_dir, self.metadata_dir, self.temporary_dir):
            directory.mkdir(parents=True, exist_ok=True)
