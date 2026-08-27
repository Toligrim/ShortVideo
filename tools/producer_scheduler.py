#!/usr/bin/env python3
"""Unattended ShortVideo producer scheduler (cron tick handler).

Drives one production run every INTERVAL_SECONDS via the existing entry point
tools/run_episode.sh (which stays unchanged). The scheduler is only a clock,
lock and prompt-fabric: it never chooses topics or runs the LLM itself.

Constants (MODEL/EFFORT/RUNNER/INTERVAL) are hard-wired here by design. They
are intentionally NOT read from the environment or user arguments, so an
unattended cron launch can never drift from the required stack:

    runner = codex
    model  = gpt-5.6-luna          -> run_episode.sh --model gpt-5.6-luna
    effort = max                   -> run_episode.sh --effort max
    every  = 12060s (3h21m)        -> documented in deploy/cron/README.md

State is persisted under ~/.local/share/shortvideo/scheduler/ (next-run clock,
last slug, lock file, logs). A non-blocking flock on tick.lock guarantees a
single production at a time even if cron ticks every minute.

Modes (for operators and deterministic tests, never launches the LLM):
    --validate   print the resolved configuration and exit 0.
    --dry-run    compute whether a run is due, build everything, print JSON,
                 write nothing, do not lock state or launch anything.
    --now EPOCH  override the reference clock (tests / dry-run / replay).

First-run behaviour: with no state file the first tick is due immediately
(run at once), then every INTERVAL_SECONDS from the launch time.

Exit codes:
    0  ok (not due / validated / dry-run completed / run finished 0)
    2  usage/config error (incl. any unknown flag such as --model/--effort)
    3  another tick or production holds the scheduler lock (busy)
    N  run_episode.sh exit code when a production actually launched
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Hard-wired constants — deliberately not configurable (see module docstring).
# ---------------------------------------------------------------------------
MODEL = "gpt-5.6-luna"
EFFORT = "max"
RUNNER = "codex"
INTERVAL_SECONDS = 12060  # 3 h 21 min
TIMEOUT_MIN = 180
PROMPT_TOPIC_LABEL = "тему выбирает агент (инструкции в промпте)"

# Test-only seam: when set to a truthy value a "real" (non-dry) launch is
# simulated — the command is logged and printed but run_episode.sh / codex are
# never executed. Used by tools/test_producer_scheduler.py.
FAKE_LAUNCH_ENV = "SV_SCHEDULER_FAKE_LAUNCH"

# Env var which pins the approval-gated publication store. tools/producer_cron.sh
# must export it (same value the live bot/worker systemd services get from
# their EnvironmentFile) so a cron-produced review lands in the same SQLite
# store the approval services poll — otherwise review drifts into the
# repo-default var/publisher.
PUBLISH_STATE_DIR_ENV = "SHORTVIDEO_PUBLISH_STATE_DIR"


def publish_state_dir_env() -> str | None:
    """Resolved SHORTVIDEO_PUBLISH_STATE_DIR as descendant processes see it.

    Mirrors tools/publishing/config.py's expanduser rule without its repository
    fallback: returns None when unset, letting --validate flag a launch path
    that would default into the wrong (repository var/publisher) store.
    """
    raw = os.environ.get(PUBLISH_STATE_DIR_ENV, "").strip()
    return os.path.expanduser(raw) if raw else None

EXIT_OK = 0
EXIT_USAGE = 2
EXIT_BUSY = 3

STATE_VERSION = 1
STATE_FILENAME = "state.json"
LOCK_FILENAME = "tick.lock"


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def default_state_dir() -> Path:
    return Path.home() / ".local/share/shortvideo/scheduler"


def constants() -> dict[str, Any]:
    return {
        "runner": RUNNER,
        "model": MODEL,
        "effort": EFFORT,
        "interval_seconds": INTERVAL_SECONDS,
        "timeout_min": TIMEOUT_MIN,
    }


# ---------------------------------------------------------------------------
# State persistence (atomic write + read).
# ---------------------------------------------------------------------------
def state_path(state_dir: Path) -> Path:
    return state_dir / STATE_FILENAME


def read_state(state_dir: Path) -> dict[str, Any]:
    """Return {} on missing/corrupt state — a corrupt clock is safer than
    wedged scheduling, so a fresh run is scheduled on the next tick."""
    try:
        with open(state_path(state_dir), "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict):
            return data
    except (OSError, ValueError):
        pass
    return {}


def write_state(state_dir: Path, state: dict[str, Any]) -> None:
    state_dir.mkdir(parents=True, exist_ok=True)
    tmp_fd, tmp_name = tempfile.mkstemp(dir=str(state_dir), prefix=".state-", suffix=".tmp")
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as fh:
            json.dump(state, fh, ensure_ascii=False, sort_keys=True, indent=2)
        os.replace(tmp_name, state_path(state_dir))
    except BaseException:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


# ---------------------------------------------------------------------------
# Scheduler lock (non-blocking flock on tick.lock).
# ---------------------------------------------------------------------------
class SchedulerLock:
    def __init__(self, state_dir: Path) -> None:
        self.path = state_dir / LOCK_FILENAME
        self._fd: int | None = None

    def acquire(self) -> bool:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(self.path, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(fd)
            return False
        self._fd = fd  # held open for the whole production run
        return True

    def release(self) -> None:
        if self._fd is not None:
            try:
                fcntl.flock(self._fd, fcntl.LOCK_UN)
            finally:
                os.close(self._fd)
                self._fd = None

    def __enter__(self) -> "SchedulerLock":
        return self

    def __exit__(self, *exc: object) -> None:
        self.release()


# ---------------------------------------------------------------------------
# Due logic.
# ---------------------------------------------------------------------------
def due_status(state: dict[str, Any], now: int, force: bool = False) -> tuple[bool, int, int]:
    """Return (due, next_run, upcoming) for the reference time `now`.

    next_run is the epoch after this decision (now + INTERVAL when due).
    upcoming is the pending next-run epoch used to decide whether we wait.
    """
    pending = state.get("next_run")
    if pending is None or force:
        due = True
    else:
        try:
            due = now >= int(pending)
        except (TypeError, ValueError):
            due = True
    if due:
        upcoming = now
    else:
        upcoming = int(pending)
    return due, now + INTERVAL_SECONDS, upcoming


# ---------------------------------------------------------------------------
# Slug and prompt.
# ---------------------------------------------------------------------------
def make_slug(now: int, episodes_dir: Path) -> str:
    """Timestamp-based unique slug, e.g. auto-20260820-182500.

    Collides with an existing episodes/<slug>.json only in pathological clock
    cases (flock + 3h21m cadence make same-second launches impossible), but the
    bump keeps run_episode.sh's pre-flight check happy regardless.
    """
    base = "auto-" + datetime.fromtimestamp(now, tz=timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = base
    i = 2
    while (episodes_dir / f"{slug}.json").exists():
        slug = f"{base}-{i}"
        i += 1
    return slug


def build_prompt(root: Path, slug: str, topic_label: str) -> str:
    skill_path = root / ".claude" / "skills" / "produce" / "SKILL.md"
    return f"""Ты — автономный продюсер конвейера ShortVideo, запущенный планировщиком
без присмотра оператора. Выполни ПОЛНЫЙ одобряемый (approval-gated) workflow снизу
доверху и в конце выдай сводку: тема, длительность, число новых визуалов, вердикт
критика, статус публикации.

КОНВЕЙЕР — прочитай скилл целиком и следуй ему неукоснительно:
    {skill_path}

1. ВЫБЕРИ ТЕМУ САМ. Критерий №1 — узнаваемость, а не узость: тема должна быть на
   слуху у человека БЕЗ технического образования (слышал слово в новостях, от
   друзей, в рекламе), а не нишевый механизм, интересный только инженерам.
   Ориентируйся на крупные хайповые кластеры общечеловеческого интереса — «как
   работает блокчейн/криптовалюта», «как думают нейросети/ИИ», «как устроен
   компьютер внутри», интернет, смартфон, пароли и похожие — и бери из них ОДИН
   конкретный вопрос, который реально звучит в комментариях и на кухне (например:
   «почему биткоин нельзя подделать», «почему ChatGPT иногда уверенно врёт»,
   «что происходит в компьютере в первую секунду после кнопки питания»), а не
   внутренний алгоритм или структуру данных. Твой «вау-факт» обязан быть понятен и
   полезен человеку без бэкграунда в CS с первого раза — жизненное следствие или
   наблюдаемое поведение, а НЕ деталь реализации (плохо: «Raft переживает потерю
   N/2 узлов»; хорошо: «сервис продолжает работать, даже если сгорела половина его
   серверов — вот почему»). Посмотри, что уже сделано (ls episodes/ и
   episodes/drafts/) и НЕ повторяй последние эпизоды — ни конкретную тему, ни (два
   ролика подряд) один и тот же хайповый кластер. Разрешены WebSearch/WebFetch для
   ресёрча. Тема задаётся переданным slug — он уже занят только тобой.
2. Сценарист → режиссёр → озвучка → критик → рендер — все шаги скилла produce,
   включая проверки и право вето (gap-скан ≤3 без новых визуалов — не пропускай).
   СЦЕНАРИСТА и РЕЖИССЁРА можно делегировать (opencode-tool или аналог) —
   их результат проверяется дальше по конвейеру (валидация схемы, критик).
   КРИТИКА делегировать ЗАПРЕЩЕНО: смотри контрольные кадры сам, той же
   моделью, которой запущен этот прогон. Прецедент auto-20260825-080101
   (25.08.2026): делегированный бесплатной моделью критик реально нашёл
   6 дефектов, но explicitly «прошёл» два кадра с наложенным текстом —
   пользователь увидел их сам и счёл ролик нечитаемым. Перед вердиктом критика
   ОБЯЗАТЕЛЬНО прогони `cd video && node scripts/check-overlaps.cjs {slug}` —
   это не LLM, а измерение реальных прямоугольников текста в DOM; ненулевой
   код выхода = вернуть режиссёру, рендер и review запрещены до зелёного чека.
3. ОЗВУЧКА: только Gemini TTS (venv/bin/python tools/tts_scenes.py), без фолбэка.
   Недоступность Gemini — СТОП с явной причиной, не подменяй другим провайдером.
4. ПУБЛИКАЦИЯ — ТОЛЬКО approval-gated раздел скилла (section «Approval-gated
   social publishing»):
     a. создай metadata JSON по образцу examples/publish-metadata.example.json
        (privacy_status по умолчанию "public");
     b. python3 tools/publish.py validate-metadata <path>;
     c. python3 tools/publish.py review --slug {slug}
        --video video/out/{slug}.mp4 --metadata <path> --mode live;
   Бот и worker-сервисы уже запущены, они сами доставят видео и карточку в Telegram
   и опубликуют после approve оператора.
   НИКОГДА не вызывай tools/telegram_bot.py send-video напрямую и не запускай
   tools/publish.py worker/retry сам — это создаст дубликат или обойдёт апрув.
5. Каждый этап, меняющий файлы, завершай git-коммитом. Slug сквозной от draft до
   mp4: {slug}.

Slug для этого прогона: {slug}
Пометка темы для лога: {topic_label!r}

Работай автономно до завершения либо до явного блокера (нет сети Gemini, нехватка
диска >2 ГБ, невозможность валидного рендера). При блокере — остановись и честно
напиши причину в сводке.
"""


# ---------------------------------------------------------------------------
# Command construction for run_episode.sh.
# ---------------------------------------------------------------------------
def build_command(root: Path, slug: str, prompt_path: Path, timeout_min: int = TIMEOUT_MIN) -> list[str]:
    return [
        "bash",
        str(root / "tools" / "run_episode.sh"),
        "--topic", PROMPT_TOPIC_LABEL,
        "--slug", slug,
        "--runner", RUNNER,
        "--model", MODEL,
        "--effort", EFFORT,
        "--prompt-file", str(prompt_path),
        "--timeout-min", str(timeout_min),
    ]


# ---------------------------------------------------------------------------
# Output helpers.
# ---------------------------------------------------------------------------
def emit_json(obj: dict[str, Any]) -> None:
    print(json.dumps(obj, ensure_ascii=False, sort_keys=True))


def log(msg: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"[{ts}] {msg}", file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# Actions.
# ---------------------------------------------------------------------------
def _prepare_temp_prompt(root: Path, state_dir: Path, slug: str) -> str:
    state_dir.mkdir(parents=True, exist_ok=True)
    fd, path = tempfile.mkstemp(dir=str(state_dir), prefix="producer-prompt-", suffix=".md")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(build_prompt(root, slug, PROMPT_TOPIC_LABEL))
    os.chmod(path, 0o600)
    return path


def action_validate(args: argparse.Namespace) -> int:
    root = project_root()
    state_dir = Path(args.state_dir) if args.state_dir else default_state_dir()
    codex_hint = ""
    from shutil import which

    codex = which("codex")
    codex_hint = str(codex) if codex else "(codex не найден в PATH — crontab должен класть $HOME/.local/bin)"
    emit_json(
        {
            "constants": constants(),
            "root": str(root),
            "state_dir": str(state_dir),
            "state_file": str(state_path(state_dir)),
            "lock_file": str(state_dir / LOCK_FILENAME),
            "prompt_topic_label": PROMPT_TOPIC_LABEL,
            "codex": codex_hint,
            "entry_point": str(root / "tools" / "run_episode.sh"),
            "publish_state_dir_env": publish_state_dir_env(),
        }
    )
    return EXIT_OK


def action_plan(args: argparse.Namespace, dry_run: bool) -> int:
    """Common core for --dry-run and the real launch. Returns exit code."""
    root = project_root()
    state_dir = Path(args.state_dir) if args.state_dir else default_state_dir()
    now = int(args.now) if args.now is not None else int(time.time())

    episodes_dir = root / "episodes"
    with SchedulerLock(state_dir) as lock:
        if not lock.acquire():
            log("busy: scheduler lock held by another tick/production")
            return EXIT_BUSY

        state = read_state(state_dir)
        due, next_run, upcoming = due_status(state, now, force=args.force)
        slug = make_slug(now, episodes_dir)

        if not due:
            emit_json(
                {
                    "due": False,
                    "now": now,
                    "next_run": upcoming,
                    "slug": None,
                    "interval_seconds": INTERVAL_SECONDS,
                }
            )
            log(f"skip: not due (next run at {upcoming})")
            return EXIT_OK

        prompt_path = _prepare_temp_prompt(root, state_dir, slug)
        try:
            command = build_command(root, slug, Path(prompt_path), TIMEOUT_MIN)
            if dry_run:
                emit_json(
                    {
                        "due": True,
                        "now": now,
                        "next_run": next_run,
                        "slug": slug,
                        "command": command,
                        "constants": constants(),
                    }
                )
                log(f"dry-run: would launch slug={slug} next_run={next_run}")
                return EXIT_OK

            launch_state = {
                "version": STATE_VERSION,
                "last_run": now,
                "last_slug": slug,
                "next_run": next_run,
            }
            write_state(state_dir, launch_state)
            log(f"launch slug={slug} pid-file-lock held; next_run={next_run} interval={INTERVAL_SECONDS}s")

            if os.environ.get(FAKE_LAUNCH_ENV):
                log(f"FAKE_LAUNCH (test seam): {' '.join(command)}")
                return EXIT_OK

            proc = subprocess.run(
                command,
                cwd=str(root),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                env=os.environ.copy(),
            )
            if proc.stdout:
                for line in proc.stdout.splitlines():
                    log(f"  {line}")
            if proc.returncode != 0:
                log(f"run_episode.sh exit={proc.returncode} slug={slug}")
            return proc.returncode
        finally:
            try:
                os.unlink(prompt_path)
            except OSError:
                pass


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="producer_scheduler.py",
        description="ShortVideo unattended producer scheduler (cron tick wrapper).",
        epilog=(
            f"Fixed pipeline stack: runner={RUNNER} model={MODEL} effort={EFFORT} "
            f"interval={INTERVAL_SECONDS}s. These are NOT overridable."
        ),
    )
    parser.add_argument("--state-dir", metavar="DIR", help="scheduler state dir (default: %(prog)s under ~/.local/share/shortvideo/scheduler)")
    parser.add_argument("--now", metavar="EPOCH", type=int, help="reference clock as unix epoch (tests/dry-run)")
    parser.add_argument("--force", action="store_true", help="treat the tick as due regardless of state")
    parser.add_argument("--dry-run", action="store_true", help="decide and print everything, launch nothing, write nothing")
    parser.add_argument("--validate", action="store_true", help="print resolved configuration and exit")
    return parser


def main(argv: list[str]) -> int:
    parser = build_arg_parser()
    # Any unknown flag (--model, --effort, --runner, --interval, ...) is usage
    # error (exit 2) — constants stay fixture-hardwired.
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        # argparse handles help/error; keep its exit code, clamp to >=0
        return int(exc.code) if exc.code is not None else EXIT_OK

    if args.validate:
        return action_validate(args)
    if args.dry_run:
        if args.force:
            # dry-run honors force for deterministic tests of the due edge
            pass
        return action_plan(args, dry_run=True)
    return action_plan(args, dry_run=False)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))