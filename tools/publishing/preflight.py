"""Local media inspection, policy checks, and immutable normalized assets."""
from __future__ import annotations

from dataclasses import dataclass, replace
from fractions import Fraction
from hashlib import sha256
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from typing import Any, Callable, Iterable, Sequence


class PreflightError(RuntimeError):
    """The source is unsuitable for review or normalization failed safely."""


RunCommand = Callable[..., subprocess.CompletedProcess[str]]
TELEGRAM_MAX_UPLOAD_BYTES = 50 * 1024 * 1024
NORMALIZED_VIDEO_CRF = "23"
NORMALIZED_VIDEO_MAXRATE = "1800k"
NORMALIZED_VIDEO_BUFSIZE = "3600k"


@dataclass(frozen=True)
class AudioProbe:
    codec_name: str
    sample_rate: int | None
    channels: int | None
    bit_rate: int | None


@dataclass(frozen=True)
class MediaProbe:
    path: Path
    duration_seconds: float
    byte_count: int
    codec_name: str
    profile: str | None
    pixel_format: str | None
    width: int
    height: int
    frame_rate: Fraction
    audio: AudioProbe | None


@dataclass(frozen=True)
class AssetSnapshot:
    path: Path
    sha256: str
    byte_count: int
    probe: MediaProbe


def _read_positive_int(value: Any, field: str, *, allow_none: bool = False) -> int | None:
    if value is None and allow_none:
        return None
    if isinstance(value, bool):
        raise PreflightError(f"ffprobe {field}: expected integer")
    try:
        parsed = int(str(value))
    except (TypeError, ValueError) as exc:
        raise PreflightError(f"ffprobe {field}: expected integer") from exc
    if parsed <= 0:
        raise PreflightError(f"ffprobe {field}: expected positive integer")
    return parsed


def _read_positive_float(value: Any, field: str) -> float:
    try:
        parsed = float(str(value))
    except (TypeError, ValueError) as exc:
        raise PreflightError(f"ffprobe {field}: expected number") from exc
    if not math.isfinite(parsed) or parsed <= 0:
        raise PreflightError(f"ffprobe {field}: expected positive finite number")
    return parsed


def _read_frame_rate(stream: dict[str, Any]) -> Fraction:
    for field in ("avg_frame_rate", "r_frame_rate"):
        raw = stream.get(field)
        if raw in (None, "", "0/0"):
            continue
        try:
            rate = Fraction(str(raw))
        except (ValueError, ZeroDivisionError) as exc:
            raise PreflightError(f"ffprobe {field}: invalid frame rate") from exc
        if rate > 0:
            return rate
    raise PreflightError("ffprobe: video stream has no positive frame rate")


def _sanitize_process_error(stderr: str | None) -> str:
    text = " ".join((stderr or "").split())
    return text[:500] or "no diagnostic output"


def _source_path(path: Path | str) -> Path:
    source = Path(path).expanduser().resolve()
    if not source.is_file():
        raise PreflightError(f"video is not a regular file: {source}")
    return source


def probe_video(
    path: Path | str,
    *,
    ffprobe_bin: str = "ffprobe",
    run: RunCommand = subprocess.run,
) -> MediaProbe:
    """Read machine JSON from ffprobe without ever invoking a shell."""
    source = _source_path(path)
    command = [
        ffprobe_bin,
        "-v",
        "error",
        "-show_entries",
        (
            "format=duration,size:stream=codec_type,codec_name,profile,pix_fmt,"
            "width,height,avg_frame_rate,r_frame_rate,bit_rate,sample_rate,channels"
        ),
        "-of",
        "json",
        str(source),
    ]
    try:
        completed = run(command, capture_output=True, text=True, check=False)
    except OSError as exc:
        raise PreflightError(f"cannot run ffprobe: {exc}") from exc
    if completed.returncode != 0:
        raise PreflightError(f"ffprobe failed: {_sanitize_process_error(completed.stderr)}")
    try:
        payload = json.loads(completed.stdout)
    except (TypeError, json.JSONDecodeError) as exc:
        raise PreflightError("ffprobe returned invalid JSON") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("streams"), list):
        raise PreflightError("ffprobe JSON has no streams array")
    streams = [stream for stream in payload["streams"] if isinstance(stream, dict)]
    video_streams = [stream for stream in streams if stream.get("codec_type") == "video"]
    if len(video_streams) != 1:
        raise PreflightError("ffprobe must report exactly one video stream")
    video = video_streams[0]
    audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]
    if len(audio_streams) > 1:
        raise PreflightError("ffprobe reports more than one audio stream")
    format_data = payload.get("format")
    if not isinstance(format_data, dict):
        raise PreflightError("ffprobe JSON has no format object")
    codec_name = video.get("codec_name")
    if not isinstance(codec_name, str) or not codec_name:
        raise PreflightError("ffprobe video codec is missing")
    audio: AudioProbe | None = None
    if audio_streams:
        audio_stream = audio_streams[0]
        audio_codec = audio_stream.get("codec_name")
        if not isinstance(audio_codec, str) or not audio_codec:
            raise PreflightError("ffprobe audio codec is missing")
        audio = AudioProbe(
            codec_name=audio_codec,
            sample_rate=_read_positive_int(audio_stream.get("sample_rate"), "audio.sample_rate", allow_none=True),
            channels=_read_positive_int(audio_stream.get("channels"), "audio.channels", allow_none=True),
            bit_rate=_read_positive_int(audio_stream.get("bit_rate"), "audio.bit_rate", allow_none=True),
        )
    return MediaProbe(
        path=source,
        duration_seconds=_read_positive_float(format_data.get("duration"), "format.duration"),
        byte_count=_read_positive_int(format_data.get("size"), "format.size") or 0,
        codec_name=codec_name,
        profile=video.get("profile") if isinstance(video.get("profile"), str) else None,
        pixel_format=video.get("pix_fmt") if isinstance(video.get("pix_fmt"), str) else None,
        width=_read_positive_int(video.get("width"), "video.width") or 0,
        height=_read_positive_int(video.get("height"), "video.height") or 0,
        frame_rate=_read_frame_rate(video),
        audio=audio,
    )


def validate_target_policy(probe: MediaProbe, targets: Iterable[str]) -> tuple[str, ...]:
    """Enforce the common vertical policy plus target-specific duration limits."""
    selected = tuple(targets)
    allowed = {"youtube", "instagram"}
    if not selected or len(set(selected)) != len(selected) or any(target not in allowed for target in selected):
        raise PreflightError("targets must be a non-empty unique subset of youtube, instagram")
    if probe.height <= probe.width:
        raise PreflightError("source must be vertical (height greater than width)")
    if probe.duration_seconds > 180:
        raise PreflightError("Short/Reel source must not exceed 180 seconds")
    if "instagram" in selected and probe.duration_seconds < 3:
        raise PreflightError("Instagram Reel source must be at least 3 seconds")
    return selected


def normalized_ffmpeg_command(
    source: Path,
    destination: Path,
    *,
    has_audio: bool,
    ffmpeg_bin: str = "ffmpeg",
) -> list[str]:
    """Return the stable argv used to create a cross-platform publish asset."""
    command = [ffmpeg_bin, "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", str(source)]
    if not has_audio:
        command.extend(["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"])
    command.extend(["-map", "0:v:0", "-map", "0:a:0" if has_audio else "1:a:0"])
    command.extend(
        [
            "-map_metadata",
            "-1",
            "-vf",
            (
                "scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,"
                "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1"
            ),
            "-r",
            "30",
            "-fps_mode",
            "cfr",
            "-c:v",
            "libx264",
            "-profile:v",
            "high",
            "-pix_fmt",
            "yuv420p",
            "-preset",
            "veryfast",
            "-crf",
            NORMALIZED_VIDEO_CRF,
            "-maxrate",
            NORMALIZED_VIDEO_MAXRATE,
            "-bufsize",
            NORMALIZED_VIDEO_BUFSIZE,
            "-c:a",
            "aac",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            "-shortest",
            str(destination),
        ]
    )
    return command


def sha256_file(path: Path | str) -> str:
    source = _source_path(path)
    digest = sha256()
    try:
        with source.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise PreflightError(f"cannot hash video {source}: {exc}") from exc
    return digest.hexdigest()


def verify_asset_snapshot(path: Path | str, expected_sha256: str) -> None:
    if not isinstance(expected_sha256, str) or len(expected_sha256) != 64:
        raise PreflightError("expected asset hash must be a SHA-256 digest")
    actual = sha256_file(path)
    if actual != expected_sha256:
        raise PreflightError(f"normalized asset hash mismatch: expected {expected_sha256}, got {actual}")


def _validate_normalized_probe(probe: MediaProbe) -> None:
    if (probe.width, probe.height) != (1080, 1920):
        raise PreflightError("normalized asset is not 1080x1920")
    if probe.codec_name != "h264" or probe.pixel_format != "yuv420p":
        raise PreflightError("normalized asset is not H.264/yuv420p")
    if probe.frame_rate != Fraction(30, 1):
        raise PreflightError("normalized asset is not 30fps")
    if probe.audio is None:
        raise PreflightError("normalized asset has no audio stream")
    if (
        probe.audio.codec_name != "aac"
        or probe.audio.sample_rate != 48000
        or probe.audio.channels != 2
    ):
        raise PreflightError("normalized asset is not AAC stereo at 48kHz")


def _link_immutable_asset(temp_path: Path, assets_dir: Path, digest: str, byte_count: int, probe: MediaProbe) -> AssetSnapshot:
    assets_dir.mkdir(parents=True, exist_ok=True)
    final_path = assets_dir / f"{digest}.mp4"
    if final_path.exists():
        verify_asset_snapshot(final_path, digest)
        return AssetSnapshot(
            path=final_path,
            sha256=digest,
            byte_count=final_path.stat().st_size,
            probe=replace(probe, path=final_path),
        )
    try:
        os.chmod(temp_path, 0o444)
        os.link(temp_path, final_path)
    except FileExistsError:
        verify_asset_snapshot(final_path, digest)
    except OSError as exc:
        raise PreflightError(f"cannot create immutable normalized asset {final_path}: {exc}") from exc
    verify_asset_snapshot(final_path, digest)
    return AssetSnapshot(
        path=final_path,
        sha256=digest,
        byte_count=byte_count,
        probe=replace(probe, path=final_path),
    )


def normalize_asset(
    source: Path | str,
    source_probe: MediaProbe,
    *,
    temporary_dir: Path | str,
    asset_dir: Path | str,
    ffmpeg_bin: str = "ffmpeg",
    ffprobe_bin: str = "ffprobe",
    run: RunCommand = subprocess.run,
) -> AssetSnapshot:
    """Normalize into a temporary sibling tree, then atomically content-address it."""
    source_path = _source_path(source)
    temp_root = Path(temporary_dir)
    temp_root.mkdir(parents=True, exist_ok=True)
    work_dir = Path(tempfile.mkdtemp(prefix="normalize-", dir=temp_root))
    temporary_output = work_dir / "normalized.mp4"
    try:
        command = normalized_ffmpeg_command(
            source_path,
            temporary_output,
            has_audio=source_probe.audio is not None,
            ffmpeg_bin=ffmpeg_bin,
        )
        try:
            completed = run(command, capture_output=True, text=True, check=False)
        except OSError as exc:
            raise PreflightError(f"cannot run ffmpeg: {exc}") from exc
        if completed.returncode != 0:
            raise PreflightError(f"ffmpeg normalization failed: {_sanitize_process_error(completed.stderr)}")
        if not temporary_output.is_file() or temporary_output.stat().st_size <= 0:
            raise PreflightError("ffmpeg normalization produced no MP4 output")
        if temporary_output.stat().st_size > TELEGRAM_MAX_UPLOAD_BYTES:
            raise PreflightError(
                "normalized asset exceeds the 50 MiB Telegram upload limit; shorten or simplify the source"
            )
        normalized_probe = probe_video(temporary_output, ffprobe_bin=ffprobe_bin, run=run)
        _validate_normalized_probe(normalized_probe)
        digest = sha256_file(temporary_output)
        return _link_immutable_asset(
            temporary_output,
            Path(asset_dir),
            digest,
            temporary_output.stat().st_size,
            normalized_probe,
        )
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
