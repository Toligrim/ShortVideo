#!/usr/bin/env python3
"""Hermetic tests for tools/producer_daily.sh (no codex/LLM, no real launch).

Covers the once-a-day driver added 2026-09-04 to replace the old per-minute
cron tick: a fixed DAILY_VIDEO_COUNT of back-to-back productions, a same-day
idempotency guard, and continuing the loop past an individual failure.

    python3 -m pytest tools/test_producer_daily.py -v
"""
from __future__ import annotations

import os
import stat
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
SCRIPT = TOOLS / "producer_daily.sh"


def run_daily(
    argv: list[str] | None = None,
    *,
    home: Path,
    daily_video_count: str | None = None,
    launch_cmd: str | None = None,
) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["HOME"] = str(home)
    env["SV_SCHEDULER_STATE_DIR"] = str(home / "scheduler")
    # The real launcher would try a live codex call; keep it fake unless a
    # test explicitly overrides PRODUCER_DAILY_LAUNCH_CMD with its own stub.
    env["SV_SCHEDULER_FAKE_LAUNCH"] = "1"
    env.pop("SHORTVIDEO_PUBLISH_STATE_DIR", None)
    if daily_video_count is not None:
        env["DAILY_VIDEO_COUNT"] = daily_video_count
    if launch_cmd is not None:
        env["PRODUCER_DAILY_LAUNCH_CMD"] = launch_cmd
    return subprocess.run(
        ["bash", str(SCRIPT), *(argv or [])],
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )


def write_stub_launcher(path: Path, body: str) -> None:
    path.write_text(f"#!/usr/bin/env bash\n{textwrap.dedent(body)}\n", encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)


class ProducerDailyTests(unittest.TestCase):
    def test_fresh_day_launches_default_count(self):
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            proc = run_daily(home=home)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertEqual(proc.stderr.count("launching video"), 6)
            self.assertEqual(proc.stderr.count("exit_code=0"), 6)
            self.assertIn("daily batch complete", proc.stderr)

    def test_daily_video_count_env_override(self):
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            proc = run_daily(home=home, daily_video_count="2")
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertEqual(proc.stderr.count("launching video"), 2)
            self.assertIn("2/2", proc.stderr)

    def test_marker_file_created_for_today(self):
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            run_daily(home=home, daily_video_count="1")
            markers = list((home / "scheduler").glob("daily-*.started"))
            self.assertEqual(len(markers), 1)
            self.assertRegex(markers[0].name, r"^daily-\d{4}-\d{2}-\d{2}\.started$")

    def test_second_invocation_same_day_is_refused_without_force(self):
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            first = run_daily(home=home, daily_video_count="1")
            self.assertEqual(first.stderr.count("launching video"), 1)

            second = run_daily(home=home, daily_video_count="1")
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertEqual(second.stderr.count("launching video"), 0)
            self.assertIn("already started", second.stderr)
            self.assertIn("refusing a second daily batch", second.stderr)

    def test_force_daily_overrides_existing_marker(self):
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            run_daily(home=home, daily_video_count="1")
            second = run_daily(["--force-daily"], home=home, daily_video_count="1")
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertEqual(second.stderr.count("launching video"), 1)

    def test_failed_iteration_does_not_abort_remaining_videos(self):
        """Operational reality (2026-09-03/04): individual production
        failures (transient upstream outages, infra hiccups) happen often
        enough that aborting the whole day's batch on the first one would
        routinely leave well under the target count. The loop must run
        every configured attempt regardless of earlier failures."""
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            stub = home / "fake-launcher.sh"
            counter = home / "calls.count"
            # Fails on the 2nd call only, succeeds on every other call - a
            # single bad attempt in the middle of the batch, not the whole
            # remainder of the day.
            write_stub_launcher(
                stub,
                f"""
                n=0
                [ -f "{counter}" ] && n=$(cat "{counter}")
                n=$((n + 1))
                echo "$n" > "{counter}"
                if [ "$n" -eq 2 ]; then
                  exit 1
                fi
                exit 0
                """,
            )
            proc = run_daily(home=home, daily_video_count="4", launch_cmd=str(stub))
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertEqual(proc.stderr.count("launching video"), 4)
            self.assertEqual(proc.stderr.count("exit_code=0"), 3)
            self.assertEqual(proc.stderr.count("exit_code=1"), 1)
            self.assertIn("daily batch complete", proc.stderr)
            self.assertEqual(counter.read_text().strip(), "4")


if __name__ == "__main__":
    unittest.main()
