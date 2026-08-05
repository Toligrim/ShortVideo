import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from publishing.preflight import (
    TELEGRAM_MAX_UPLOAD_BYTES,
    PreflightError,
    normalize_asset,
    probe_video,
    validate_target_policy,
)


def probe_payload(
    *,
    duration="74.88",
    width=1080,
    height=1920,
    frame_rate="30/1",
    codec="h264",
    pixel_format="yuv420p",
    audio=True,
):
    streams = [
        {
            "codec_type": "video",
            "codec_name": codec,
            "profile": "High",
            "pix_fmt": pixel_format,
            "width": width,
            "height": height,
            "avg_frame_rate": frame_rate,
            "r_frame_rate": frame_rate,
            "bit_rate": "2000000",
        }
    ]
    if audio:
        streams.append(
            {
                "codec_type": "audio",
                "codec_name": "aac",
                "sample_rate": "48000",
                "channels": 2,
                "bit_rate": "128000",
            }
        )
    return {"streams": streams, "format": {"duration": duration, "size": "128"}}


class FakeMediaRunner:
    def __init__(self, *, source_payload=None, normalized_payload=None, output=b"normalized-mp4", output_size=None):
        self.source_payload = source_payload or probe_payload()
        self.normalized_payload = normalized_payload or probe_payload()
        self.output = output
        self.output_size = output_size
        self.calls = []

    def __call__(self, command, *, capture_output, text, check):
        self.calls.append(command)
        if command[0] == "fake-ffprobe":
            payload = self.normalized_payload if Path(command[-1]).name == "normalized.mp4" else self.source_payload
            return subprocess.CompletedProcess(command, 0, json.dumps(payload), "")
        if command[0] == "fake-ffmpeg":
            output = Path(command[-1])
            if self.output_size is None:
                output.write_bytes(self.output)
            else:
                with output.open("wb") as handle:
                    handle.truncate(self.output_size)
            return subprocess.CompletedProcess(command, 0, "", "")
        raise AssertionError(f"unexpected command: {command}")


class PreflightTests(unittest.TestCase):
    def source_file(self, directory: str) -> Path:
        source = Path(directory) / "source.mp4"
        source.write_bytes(b"source-must-not-change")
        return source

    def test_invalid_ffprobe_json_and_missing_video_stream_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = self.source_file(tmp)

            def invalid_json(command, *, capture_output, text, check):
                return subprocess.CompletedProcess(command, 0, "not-json", "")

            with self.assertRaisesRegex(PreflightError, "invalid JSON"):
                probe_video(source, ffprobe_bin="fake-ffprobe", run=invalid_json)

            def no_video(command, *, capture_output, text, check):
                return subprocess.CompletedProcess(
                    command,
                    0,
                    json.dumps({"streams": [], "format": {"duration": "1", "size": "1"}}),
                    "",
                )

            with self.assertRaisesRegex(PreflightError, "exactly one video stream"):
                probe_video(source, ffprobe_bin="fake-ffprobe", run=no_video)

    def test_target_policy_is_selected_target_specific_and_requires_vertical(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = self.source_file(tmp)
            runner = FakeMediaRunner(source_payload=probe_payload(duration="180.1"))
            probe = probe_video(source, ffprobe_bin="fake-ffprobe", run=runner)
            with self.assertRaisesRegex(PreflightError, "180 seconds"):
                validate_target_policy(probe, ("youtube",))
            with self.assertRaisesRegex(PreflightError, "180 seconds"):
                validate_target_policy(probe, ("instagram",))

            short_runner = FakeMediaRunner(source_payload=probe_payload(duration="2.9"))
            short_probe = probe_video(source, ffprobe_bin="fake-ffprobe", run=short_runner)
            with self.assertRaisesRegex(PreflightError, "at least 3 seconds"):
                validate_target_policy(short_probe, ("instagram",))

            landscape_runner = FakeMediaRunner(source_payload=probe_payload(width=1920, height=1080))
            landscape_probe = probe_video(source, ffprobe_bin="fake-ffprobe", run=landscape_runner)
            with self.assertRaisesRegex(PreflightError, "vertical"):
                validate_target_policy(landscape_probe, ("youtube", "instagram"))

    def test_normalization_uses_deterministic_safe_argv_and_immutable_asset(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = self.source_file(tmp)
            before = source.read_bytes()
            runner = FakeMediaRunner()
            source_probe = probe_video(source, ffprobe_bin="fake-ffprobe", run=runner)
            asset = normalize_asset(
                source,
                source_probe,
                temporary_dir=Path(tmp) / "var" / "publisher" / "tmp",
                asset_dir=Path(tmp) / "var" / "publisher" / "assets",
                ffmpeg_bin="fake-ffmpeg",
                ffprobe_bin="fake-ffprobe",
                run=runner,
            )
            command = runner.calls[1]
            self.assertIsInstance(command, list)
            self.assertEqual(command[:8], ["fake-ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", str(source.resolve())])
            self.assertEqual(command[command.index("-map_metadata") + 1], "-1")
            self.assertEqual(command[command.index("-pix_fmt") + 1], "yuv420p")
            self.assertEqual(command[command.index("-r") + 1], "30")
            self.assertEqual(command[command.index("-c:a") + 1], "aac")
            self.assertEqual(command[command.index("-ar") + 1], "48000")
            self.assertEqual(command[command.index("-ac") + 1], "2")
            self.assertEqual(command[command.index("-b:a") + 1], "128k")
            self.assertEqual(command[command.index("-crf") + 1], "23")
            self.assertEqual(command[command.index("-maxrate") + 1], "1800k")
            self.assertEqual(command[command.index("-bufsize") + 1], "3600k")
            self.assertEqual(command[command.index("-movflags") + 1], "+faststart")
            self.assertEqual(source.read_bytes(), before)
            self.assertTrue(asset.path.is_file())
            self.assertEqual(asset.path.parent.name, "assets")
            self.assertEqual(asset.path.name, f"{asset.sha256}.mp4")
            self.assertEqual(asset.path.read_bytes(), b"normalized-mp4")
            self.assertEqual(asset.path.stat().st_mode & 0o222, 0)
            self.assertEqual(asset.probe.path, asset.path)
            self.assertTrue(asset.probe.path.exists())

    def test_normalization_generates_silent_aac_when_source_has_no_audio(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = self.source_file(tmp)
            runner = FakeMediaRunner(source_payload=probe_payload(audio=False))
            source_probe = probe_video(source, ffprobe_bin="fake-ffprobe", run=runner)
            normalize_asset(
                source,
                source_probe,
                temporary_dir=Path(tmp) / "tmp",
                asset_dir=Path(tmp) / "assets",
                ffmpeg_bin="fake-ffmpeg",
                ffprobe_bin="fake-ffprobe",
                run=runner,
            )
            command = runner.calls[1]
            self.assertIn("anullsrc=channel_layout=stereo:sample_rate=48000", command)
            map_positions = [index for index, value in enumerate(command) if value == "-map"]
            self.assertEqual(command[map_positions[1] + 1], "1:a:0")

    def test_normalization_fails_closed_above_telegram_upload_limit(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = self.source_file(tmp)
            runner = FakeMediaRunner(output_size=TELEGRAM_MAX_UPLOAD_BYTES + 1)
            source_probe = probe_video(source, ffprobe_bin="fake-ffprobe", run=runner)
            with self.assertRaisesRegex(PreflightError, "50 MiB Telegram"):
                normalize_asset(
                    source,
                    source_probe,
                    temporary_dir=Path(tmp) / "tmp",
                    asset_dir=Path(tmp) / "assets",
                    ffmpeg_bin="fake-ffmpeg",
                    ffprobe_bin="fake-ffprobe",
                    run=runner,
                )


if __name__ == "__main__":
    unittest.main()
