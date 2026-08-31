#!/usr/bin/env python3
"""Focused tests for the unattended producer scheduler.

Упражняют инварианты БЕЗ запуска кодека/LLM: константы model/effort (не
переопределяются окружением/аргументами), интервал 12060s, блокировка flock,
slug, содержимое промпта и state-переходы. Запуск: pytest или unittest.

    venv/bin/python -m pytest tools/test_producer_scheduler.py -v
"""
import contextlib
import fcntl
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import producer_scheduler as sched  # noqa: E402

ROOT = TOOLS.parent
EPOCH = 1_800_000_000  # 2027-01-13T00:00:00Z, fixed reference for determinism


def run_main_state(tmp, argv):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = sched.main(argv + ["--state-dir", str(tmp)])
    return code, out.getvalue(), err.getvalue()


def run_cron_wrapper(argv, *, publish_state_dir_env=None):
    """Run tools/producer_cron.sh hermetically (no codex/LLM, no external env
    files): HOME is a throwaway temp dir and the scheduler state dir is pinned
    via SV_SCHEDULER_STATE_DIR. Returns the CompletedProcess and the temp HOME.
    """
    with tempfile.TemporaryDirectory() as td:
        home = Path(td)
        env = os.environ.copy()
        env.pop("SHORTVIDEO_PUBLISH_STATE_DIR", None)  # force the wrapper default
        env["HOME"] = str(home)
        env["SV_SCHEDULER_STATE_DIR"] = str(home / "scheduler")
        if publish_state_dir_env is not None:
            env["SHORTVIDEO_PUBLISH_STATE_DIR"] = publish_state_dir_env
        proc = subprocess.run(
            ["bash", str(TOOLS / "producer_cron.sh"), *argv],
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
        )
        return proc, home


class ConstantInvariantTests(unittest.TestCase):
    def test_interval_is_3h21m(self):
        self.assertEqual(sched.INTERVAL_SECONDS, 12060)
        self.assertEqual(sched.INTERVAL_SECONDS, 3 * 3600 + 21 * 60)

    def test_pipeline_constants(self):
        self.assertEqual(sched.MODEL, "gpt-5.6-luna")
        self.assertEqual(sched.EFFORT, "max")
        self.assertEqual(sched.RUNNER, "codex")

    def test_constants_not_overridable_by_env(self):
        before = sched.constants()
        env = {
            "SV_MODEL": "some-other-model",
            "PI_MODEL": "x",
            "MODEL": "y",
            "SV_EFFORT": "low",
            "SV_RUNNER": "claude",
            "SV_SCHEDULER_INTERVAL": "60",
        }
        old = {}
        for k, v in env.items():
            old[k] = os.environ.get(k)
            os.environ[k] = v
        try:
            self.assertEqual(sched.constants(), before)
            self.assertEqual(sched.MODEL, "gpt-5.6-luna")
            self.assertEqual(sched.EFFORT, "max")
            self.assertEqual(sched.RUNNER, "codex")
            self.assertEqual(sched.TIMEOUT_MIN, 180)
        finally:
            for k, v in old.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    def test_unknown_flags_rejected(self):
        parser = sched.build_arg_parser()
        for flag in ("--model", "--effort", "--runner", "--interval"):
            with self.subTest(flag=flag):
                with self.assertRaises(SystemExit) as ctx:
                    parser.parse_args([flag, "x"])
                self.assertEqual(ctx.exception.code, 2)

    def test_validate_mode_reports_constants(self):
        with tempfile.TemporaryDirectory() as td:
            code, out, _err = run_main_state(td, ["--validate"])
        self.assertEqual(code, 0)
        data = json.loads(out)
        self.assertEqual(data["constants"]["model"], "gpt-5.6-luna")
        self.assertEqual(data["constants"]["effort"], "max")
        self.assertEqual(data["constants"]["runner"], "codex")
        self.assertEqual(data["constants"]["interval_seconds"], 12060)
        self.assertIn("publish_state_dir_env", data)


class StateTests(unittest.TestCase):
    def test_state_roundtrip(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            s = {"version": 1, "next_run": EPOCH + 10, "last_slug": "auto-x"}
            sched.write_state(d, s)
            self.assertEqual(sched.read_state(d), s)

    def test_missing_state_is_empty(self):
        with tempfile.TemporaryDirectory() as td:
            self.assertEqual(sched.read_state(Path(td)), {})

    def test_corrupt_state_is_treated_fresh(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            (d / sched.STATE_FILENAME).write_text("not json {{{", encoding="utf-8")
            self.assertEqual(sched.read_state(d), {})


class DueTests(unittest.TestCase):
    def test_first_run_is_due(self):
        due, next_run, upcoming = sched.due_status({}, EPOCH)
        self.assertTrue(due)
        self.assertEqual(next_run, EPOCH + sched.INTERVAL_SECONDS)
        self.assertEqual(upcoming, EPOCH)

    def test_pending_future_not_due(self):
        due, next_run, upcoming = sched.due_status({"next_run": EPOCH + 100}, EPOCH)
        self.assertFalse(due)
        self.assertEqual(next_run, EPOCH + sched.INTERVAL_SECONDS)
        self.assertEqual(upcoming, EPOCH + 100)

    def test_pending_past_is_due(self):
        due, _, upcoming = sched.due_status({"next_run": EPOCH - 1}, EPOCH)
        self.assertTrue(due)
        self.assertEqual(upcoming, EPOCH)

    def test_exact_boundary_is_due(self):
        due, _, _ = sched.due_status({"next_run": EPOCH}, EPOCH)
        self.assertTrue(due)

    def test_force_overrides_pending(self):
        due, next_run, _ = sched.due_status({"next_run": EPOCH + 9999}, EPOCH, force=True)
        self.assertTrue(due)
        self.assertEqual(next_run, EPOCH + sched.INTERVAL_SECONDS)

    def test_corrupt_pending_is_due(self):
        due, _, _ = sched.due_status({"next_run": "bogus"}, EPOCH)
        self.assertTrue(due)


class SlugTests(unittest.TestCase):
    def test_format_and_uniqueness(self):
        with tempfile.TemporaryDirectory() as td:
            ep = Path(td)
            s1 = sched.make_slug(EPOCH, ep)
            s2 = sched.make_slug(EPOCH, ep)
            self.assertRegex(s1, r"^auto-\d{8}-\d{6}$")
            self.assertEqual(s1, s2)
            ts = datetime.fromtimestamp(EPOCH, tz=timezone.utc)
            self.assertEqual(s1, "auto-" + ts.strftime("%Y%m%d-%H%M%S"))

    def test_collision_bumps_suffix(self):
        with tempfile.TemporaryDirectory() as td:
            ep = Path(td)
            base = sched.make_slug(EPOCH, ep)
            (ep / f"{base}.json").write_text("{}", encoding="utf-8")
            bumped = sched.make_slug(EPOCH, ep)
            self.assertNotEqual(bumped, base)
            self.assertTrue(bumped.startswith(base + "-"))


class PastTitlesTests(unittest.TestCase):
    """collect_past_episode_titles: deterministic de-dup input for build_prompt.

    Incident 2026-08-31: the QR-code error-correction fact shipped three times
    (20.08, 30.08, 31.08) under three different titles, none consecutive, none
    a literal repeat — a prompt instruction to "ls episodes/ и не повторяй
    последние" never had the actual titles in front of it. These tests pin
    down that the collector is deterministic, tolerates a corrupt file instead
    of raising, and that build_prompt actually embeds the full list.
    """

    def test_empty_dir_returns_empty_list(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "episodes").mkdir()
            self.assertEqual(sched.collect_past_episode_titles(root), [])

    def test_missing_episodes_dir_returns_empty_list(self):
        with tempfile.TemporaryDirectory() as td:
            self.assertEqual(sched.collect_past_episode_titles(Path(td)), [])

    def test_collects_titles_sorted_and_skips_bad_files(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            episodes = root / "episodes"
            episodes.mkdir()

            def write(slug, title):
                data = {"targets": {"youtube": {"title": title}}}
                (episodes / f"{slug}.metadata.json").write_text(json.dumps(data), encoding="utf-8")

            write("auto-20260830-082101", "Почему QR-код читается, даже если часть закрыта?")
            write("auto-20260820-193301", "Почему QR-код читается даже с оторванным углом")
            write("auto-20260831-150301", "Почему QR-код не боится царапин?")
            # Malformed / structurally wrong files must be skipped, not fatal.
            (episodes / "auto-broken.metadata.json").write_text("{not json", encoding="utf-8")
            (episodes / "auto-no-title.metadata.json").write_text(
                json.dumps({"targets": {"youtube": {}}}), encoding="utf-8"
            )

            titles = sched.collect_past_episode_titles(root)
            # Sorted by filename (== chronological, slugs are timestamps).
            self.assertEqual(
                titles,
                [
                    "Почему QR-код читается даже с оторванным углом",
                    "Почему QR-код читается, даже если часть закрыта?",
                    "Почему QR-код не боится царапин?",
                ],
            )


class PromptTests(unittest.TestCase):
    def test_prompt_references_skill_and_slug(self):
        text = sched.build_prompt(ROOT, "auto-20270113-000000", sched.PROMPT_TOPIC_LABEL)
        self.assertIn(".claude/skills/produce/SKILL.md", text)
        self.assertIn(".claude", text)
        self.assertIn("auto-20270113-000000", text)

    def test_prompt_embeds_full_past_titles_list_deterministically(self):
        """build_prompt must not rely on the agent discovering topics itself."""
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / ".claude" / "skills" / "produce").mkdir(parents=True)
            (root / ".claude" / "skills" / "produce" / "SKILL.md").write_text("skill", encoding="utf-8")
            episodes = root / "episodes"
            episodes.mkdir()
            (episodes / "auto-20260820-193301.metadata.json").write_text(
                json.dumps({"targets": {"youtube": {"title": "Почему QR-код читается даже с оторванным углом"}}}),
                encoding="utf-8",
            )
            (episodes / "auto-20260830-082101.metadata.json").write_text(
                json.dumps({"targets": {"youtube": {"title": "Почему QR-код читается, даже если часть закрыта?"}}}),
                encoding="utf-8",
            )
            text = sched.build_prompt(root, "auto-x", sched.PROMPT_TOPIC_LABEL)
            self.assertIn("Почему QR-код читается даже с оторванным углом", text)
            self.assertIn("Почему QR-код читается, даже если часть закрыта?", text)
            self.assertIn("ВСЕ 2 эпизодов", text)
            self.assertIn("ПО СУТИ факта/механизма", text)

    def test_prompt_handles_no_past_episodes(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / ".claude" / "skills" / "produce").mkdir(parents=True)
            (root / ".claude" / "skills" / "produce" / "SKILL.md").write_text("skill", encoding="utf-8")
            text = sched.build_prompt(root, "auto-x", sched.PROMPT_TOPIC_LABEL)
            self.assertIn("Уже выпущенных эпизодов нет", text)

    def test_prompt_instructs_autonomy_and_approval_gate(self):
        text = sched.build_prompt(ROOT, "auto-x", sched.PROMPT_TOPIC_LABEL)
        self.assertIn("ВЫБЕРИ ТЕМУ САМ", text)
        self.assertIn("approval-gated", text)
        self.assertIn("review", text)
        self.assertIn("validate-metadata", text)
        self.assertIn("send-video", text)  # explicitly forbidden path
        self.assertIn("worker", text)      # explicitly forbidden path
        self.assertIn("Gemini", text)

    def test_command_uses_fixed_stack(self):
        p = Path("/tmp/prompt.md")
        cmd = sched.build_command(ROOT, "auto-x", p)
        joined = " ".join(cmd)
        self.assertIn("tools/run_episode.sh", joined)
        self.assertIn("--runner codex", joined)
        self.assertIn("--model gpt-5.6-luna", joined)
        self.assertIn("--effort max", joined)
        self.assertIn("--prompt-file /tmp/prompt.md", joined)
        self.assertIn("--timeout-min 180", joined)
        self.assertIn("--slug auto-x", joined)


class DryRunAndLockTests(unittest.TestCase):
    def test_dry_run_first_tick_due_no_state_written(self):
        with tempfile.TemporaryDirectory() as td:
            code, out, _err = run_main_state(td, ["--dry-run", "--now", str(EPOCH)])
            self.assertEqual(code, 0)
            data = json.loads(out)
            self.assertTrue(data["due"])
            self.assertEqual(data["next_run"], EPOCH + sched.INTERVAL_SECONDS)
            self.assertEqual(data["constants"]["model"], "gpt-5.6-luna")
            self.assertIn("run_episode.sh", " ".join(data["command"]))
            self.assertFalse((Path(td) / sched.STATE_FILENAME).exists())

    def test_dry_run_not_due_when_pending(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            sched.write_state(d, {"next_run": EPOCH + 1000, "last_slug": "auto-old"})
            code, out, _err = run_main_state(td, ["--dry-run", "--now", str(EPOCH)])
            self.assertEqual(code, 0)
            data = json.loads(out)
            self.assertFalse(data["due"])
            self.assertEqual(data["next_run"], EPOCH + 1000)
            # state untouched by dry-run
            self.assertEqual(sched.read_state(d)["next_run"], EPOCH + 1000)

    def test_dry_run_force_overrides_pending(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            sched.write_state(d, {"next_run": EPOCH + 1000, "last_slug": "auto-old"})
            code, out, _err = run_main_state(td, ["--dry-run", "--now", str(EPOCH), "--force"])
            self.assertEqual(code, 0)
            self.assertTrue(json.loads(out)["due"])

    def test_prompt_file_cleaned_up(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            run_main_state(td, ["--dry-run", "--now", str(EPOCH)])
            leftovers = [p.name for p in d.iterdir() if p.name.startswith("producer-prompt-")]
            self.assertEqual(leftovers, [])

    def test_busy_lock_blocks_tick(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            lock = d / sched.LOCK_FILENAME
            fd = os.open(lock, os.O_CREAT | os.O_RDWR, 0o600)
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                code, _out, err = run_main_state(td, ["--dry-run", "--now", str(EPOCH)])
                self.assertEqual(code, sched.EXIT_BUSY)
                self.assertIn("busy", err)
            finally:
                os.close(fd)


class FakeLaunchTransitionTests(unittest.TestCase):
    def test_real_tick_writes_state_and_advances_clock(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            os.environ[sched.FAKE_LAUNCH_ENV] = "1"
            try:
                code, _out, err = run_main_state(td, ["--now", str(EPOCH)])
                self.assertEqual(code, 0)
                state = sched.read_state(d)
                self.assertEqual(state["next_run"], EPOCH + sched.INTERVAL_SECONDS)
                self.assertEqual(state["last_run"], EPOCH)
                self.assertEqual(state["last_slug"], sched.make_slug(EPOCH, ROOT / "episodes"))
                self.assertIn("FAKE_LAUNCH", err)
            finally:
                os.environ.pop(sched.FAKE_LAUNCH_ENV, None)

    def test_real_tick_respects_pending_clock(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            sched.write_state(d, {"next_run": EPOCH + 5000, "last_slug": "auto-old"})
            os.environ[sched.FAKE_LAUNCH_ENV] = "1"
            try:
                code, _out, err = run_main_state(td, ["--now", str(EPOCH)])
                self.assertEqual(code, 0)
                self.assertIn("not due", err)
                self.assertEqual(sched.read_state(d)["next_run"], EPOCH + 5000)
            finally:
                os.environ.pop(sched.FAKE_LAUNCH_ENV, None)


class PublishStateDirEnvTests(unittest.TestCase):
    def test_reports_effective_value(self):
        env_value = str(Path.home() / "publisher")
        old = os.environ.get(sched.PUBLISH_STATE_DIR_ENV)
        os.environ[sched.PUBLISH_STATE_DIR_ENV] = env_value
        try:
            self.assertEqual(sched.publish_state_dir_env(), env_value)
        finally:
            if old is None:
                os.environ.pop(sched.PUBLISH_STATE_DIR_ENV, None)
            else:
                os.environ[sched.PUBLISH_STATE_DIR_ENV] = old

    def test_unset_returns_none(self):
        old = os.environ.pop(sched.PUBLISH_STATE_DIR_ENV, None)
        try:
            self.assertIsNone(sched.publish_state_dir_env())
        finally:
            if old is not None:
                os.environ[sched.PUBLISH_STATE_DIR_ENV] = old

    def test_expands_home_prefix(self):
        old = os.environ.get(sched.PUBLISH_STATE_DIR_ENV)
        os.environ[sched.PUBLISH_STATE_DIR_ENV] = "~/sv/publisher"
        try:
            self.assertEqual(sched.publish_state_dir_env(), str(Path("~/sv/publisher").expanduser()))
        finally:
            if old is None:
                os.environ.pop(sched.PUBLISH_STATE_DIR_ENV, None)
            else:
                os.environ[sched.PUBLISH_STATE_DIR_ENV] = old


class CronWrapperPublicationStateTests(unittest.TestCase):
    """The cron wrapper must export SHORTVIDEO_PUBLISH_STATE_DIR so a cron
    review lands in the SAME publisher store the live bot/worker poll.

    Exercised through the real wrapper as a subprocess with a hermetic HOME —
    deterministic, launches no codex, reads no external env file.
    """

    def test_wrapper_defaults_to_shared_publisher_path(self):
        proc, home = run_cron_wrapper(["--validate"])
        self.assertEqual(proc.returncode, 0, proc.stderr)
        data = json.loads(proc.stdout)
        self.assertEqual(
            data["publish_state_dir_env"],
            str(home / ".local/share/shortvideo/publisher"),
        )
        self.assertNotIn("/var/publisher", data["publish_state_dir_env"])

    def test_wrapper_preserves_explicit_override(self):
        proc, _home = run_cron_wrapper(
            ["--validate"], publish_state_dir_env="/tmp/custom-publisher-state"
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        data = json.loads(proc.stdout)
        self.assertEqual(data["publish_state_dir_env"], "/tmp/custom-publisher-state")

    def test_wrapper_scheduler_and_publisher_dirs_are_distinct(self):
        proc, home = run_cron_wrapper(["--validate"])
        self.assertEqual(proc.returncode, 0, proc.stderr)
        data = json.loads(proc.stdout)
        self.assertEqual(Path(data["state_dir"]), home / "scheduler")
        self.assertEqual(
            Path(data["publish_state_dir_env"]),
            home / ".local/share/shortvideo/publisher",
        )
        self.assertNotEqual(data["state_dir"], data["publish_state_dir_env"])


if __name__ == "__main__":
    unittest.main()