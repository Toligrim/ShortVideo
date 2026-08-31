#!/usr/bin/env python3
"""Реестр делегирования и журнал действий агентов конвейера ShortVideo.

Дополняет tools/pipeline_log.py, а не заменяет его. Разделение ответственности:

    pipeline_log.py — ЭТАПЫ конвейера (сценарист/режиссёр/tts/рендер): сколько
                      длился шаг, чем закончился, что выросло в библиотеке.
    agent_log.py    — АКТОРЫ и их ДЕЙСТВИЯ: кто кому что делегировал, когда,
                      с какой мотивировкой, чем это кончилось, и какие
                      подозрительные действия при этом были предприняты.

Оба пишут в один и тот же `runs/<run_id>/events.jsonl` (один поток, одни часы,
один `seq`) — восстановление хронологии прогона не требует склейки разных
журналов. См. docs/agent-safety-architecture.md, раздел «Слой 2».

Зачем это вообще появилось. В инциденте auto-20260831-164055 оркестратор
трижды параллельно делегировал сценариста на один slug, и НИ ОДНО из этих
решений не осталось в логах: `runs/` знал только про этапы конвейера, а сам
факт делегирования был виден лишь косвенно — по появившимся сессиям Codex в
~/.codex/sessions. Разбор — corrections/git-reset-clean-incident/REPORT.md.

Ключевая идея реестра: повторное делегирование одной и той же задачи не
запрещается текстом промпта (это уже пробовали, и текст не удержал) — оно
делается СТРУКТУРНО невозможным. `delegate-claim` атомарен под flock: вторая
попытка занять ту же `task_id`, пока первая жива, завершается кодом 4 и
печатает, кто именно её держит. Оркестратору физически нечего сделать, кроме
как дождаться или явно освободить лизу.

    agent_log.py delegate-claim   --task-id ID --role R [--agent-id A] [--reason ...]
    agent_log.py delegate-heartbeat --agent-id A
    agent_log.py delegate-release --agent-id A --status ok|failed|abandoned
    agent_log.py delegate-status  [--json]
    agent_log.py action           --actor A --kind KIND [--name N] [--input ...]
    agent_log.py anomaly          --kind KIND --detail ... [--actor A]

Коды выхода:
    0  успех
    2  ошибка использования
    4  задача уже занята живой лизой (delegate-claim) — НЕ ошибка вызова,
       а штатный отказ, который оркестратор обязан обработать
    5  неизвестный agent_id (release/heartbeat)
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_log  # noqa: E402  — переиспользуем часы, ensure_run и append_event

ROOT = pipeline_log.ROOT

# Лиза по умолчанию — 45 минут. Ориентир: самый долгий наблюдавшийся делегат
# (сценарист с полноценным веб-ресёрчем) укладывался в ~12 минут; 45 минут
# оставляют запас на порядок и при этом не дают мёртвой лизе висеть до конца
# трёхчасового прогона.
DEFAULT_LEASE_SEC = 45 * 60

REGISTRY_FILENAME = "delegations.json"
REGISTRY_VERSION = 1

TERMINAL_STATES = {"ok", "failed", "abandoned", "denied"}


def now_epoch() -> float:
    return time.time()


def iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
        f"{int((ts % 1) * 1000):03d}Z"


def registry_path(run_dir: Path) -> Path:
    return run_dir / REGISTRY_FILENAME


class Registry:
    """Реестр делегирования под flock.

    Блокировка берётся на отдельный файл-компаньон (`.delegations.lock`), а не
    на сам JSON: реестр перезаписывается через os.replace (атомарная подмена
    inode), и flock на подменяемом файле потерял бы смысл — второй процесс
    заблокировал бы уже отвязанный inode и спокойно вошёл бы в критическую
    секцию одновременно с первым. Это ровно тот класс гонки, от которого
    реестр и защищает, так что здесь он недопустим вдвойне.
    """

    def __init__(self, run_dir: Path) -> None:
        self.run_dir = run_dir
        self.path = registry_path(run_dir)
        self.lock_path = run_dir / ".delegations.lock"
        self._fd: int | None = None
        self.data: dict[str, Any] = {}

    def __enter__(self) -> "Registry":
        self.run_dir.mkdir(parents=True, exist_ok=True)
        self._fd = os.open(self.lock_path, os.O_CREAT | os.O_RDWR, 0o600)
        fcntl.flock(self._fd, fcntl.LOCK_EX)
        self.data = self._read()
        return self

    def __exit__(self, *exc: object) -> None:
        if self._fd is not None:
            fcntl.flock(self._fd, fcntl.LOCK_UN)
            os.close(self._fd)
            self._fd = None

    def _read(self) -> dict[str, Any]:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "claims" in data:
                return data
        except (OSError, ValueError):
            pass
        return {"version": REGISTRY_VERSION, "claims": {}}

    def save(self) -> None:
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, self.path)

    @property
    def claims(self) -> dict[str, Any]:
        return self.data.setdefault("claims", {})

    def active_for_task(self, task_id: str, now: float) -> dict[str, Any] | None:
        """Живая (нетерминальная и не истёкшая) лиза на задачу, если есть."""
        for claim in self.claims.values():
            if claim.get("task_id") != task_id:
                continue
            if claim.get("state") in TERMINAL_STATES:
                continue
            if now >= claim.get("expires_at", 0):
                continue  # истёкшая лиза не держит задачу
            return claim
        return None

    def attempts_for_task(self, task_id: str) -> int:
        return sum(1 for c in self.claims.values() if c.get("task_id") == task_id)

    def expire_stale(self, now: float) -> list[dict[str, Any]]:
        """Перевести истёкшие живые лизы в `abandoned`. Возвращает список задетых."""
        expired = []
        for claim in self.claims.values():
            if claim.get("state") in TERMINAL_STATES:
                continue
            if now >= claim.get("expires_at", 0):
                claim["state"] = "abandoned"
                claim["released_at"] = now
                claim["release_reason"] = "lease_expired"
                expired.append(claim)
        return expired


def resolve_run_dir() -> Path:
    """Каталог активного прогона; неявный прогон создаётся, как в pipeline_log."""
    return pipeline_log.ensure_run()


def emit(run_dir: Path, fields: dict[str, Any]) -> dict[str, Any]:
    return pipeline_log.append_event(run_dir, fields)


# ---------------------------------------------------------------------------
# Команды
# ---------------------------------------------------------------------------

def cmd_delegate_claim(args: argparse.Namespace) -> int:
    run_dir = resolve_run_dir()
    now = now_epoch()
    agent_id = args.agent_id or f"{args.role}-{uuid.uuid4().hex[:8]}"

    with Registry(run_dir) as reg:
        for stale in reg.expire_stale(now):
            emit(run_dir, {
                "kind": "delegation_release", "actor": stale["agent_id"],
                "task_id": stale["task_id"], "status": "abandoned",
                "detail": "lease_expired",
            })

        held = reg.active_for_task(args.task_id, now)
        if held is not None:
            # Структурный отказ — то самое место, где инцидент 31.08 был бы
            # остановлен: второй и третий вызовы сценариста на тот же slug
            # просто не получили бы разрешения работать.
            emit(run_dir, {
                "kind": "delegation_denied", "actor": agent_id,
                "task_id": args.task_id, "role": args.role,
                "detail": "task_already_claimed",
                "held_by": held["agent_id"],
                "held_since": iso(held["claimed_at"]),
                "reason": args.reason,
            })
            print(json.dumps({
                "granted": False,
                "reason": "task_already_claimed",
                "task_id": args.task_id,
                "held_by": held["agent_id"],
                "held_since": iso(held["claimed_at"]),
                "expires_at": iso(held["expires_at"]),
                "hint": "дождись завершения этого делегата (codex-reply/опрос) "
                        "или явно освободи лизу delegate-release, если он "
                        "безвозвратно умер. Второй параллельный вызов той же "
                        "задачи запрещён структурно.",
            }, ensure_ascii=False, indent=1))
            return 4

        attempt = reg.attempts_for_task(args.task_id) + 1
        claim = {
            "agent_id": agent_id,
            "task_id": args.task_id,
            "role": args.role,
            "attempt": attempt,
            "state": "running",
            "claimed_at": now,
            "expires_at": now + args.lease_sec,
            "heartbeat_at": now,
            "lease_sec": args.lease_sec,
            "parallel_group": args.parallel_group,
            "reason": args.reason,
            "worktree": args.worktree,
            "thread_id": None,
            "released_at": None,
            "release_reason": None,
        }
        reg.claims[agent_id] = claim
        reg.save()

    emit(run_dir, {
        "kind": "delegation_claim", "actor": agent_id, "task_id": args.task_id,
        "role": args.role, "attempt": attempt, "reason": args.reason,
        "parallel_group": args.parallel_group, "worktree": args.worktree,
        "lease_sec": args.lease_sec,
    })
    print(json.dumps({
        "granted": True, "agent_id": agent_id, "task_id": args.task_id,
        "role": args.role, "attempt": attempt,
        "expires_at": iso(now + args.lease_sec),
        "run_dir": str(run_dir),
    }, ensure_ascii=False, indent=1))
    return 0


def cmd_delegate_heartbeat(args: argparse.Namespace) -> int:
    run_dir = resolve_run_dir()
    now = now_epoch()
    with Registry(run_dir) as reg:
        claim = reg.claims.get(args.agent_id)
        if claim is None:
            print(f"agent_log: неизвестный agent_id {args.agent_id!r}", file=sys.stderr)
            return 5
        claim["heartbeat_at"] = now
        claim["expires_at"] = now + claim.get("lease_sec", DEFAULT_LEASE_SEC)
        if args.thread_id:
            claim["thread_id"] = args.thread_id
        reg.save()
        expires = claim["expires_at"]
    emit(run_dir, {
        "kind": "delegation_heartbeat", "actor": args.agent_id,
        "task_id": claim.get("task_id"), "thread_id": args.thread_id,
    })
    print(json.dumps({"agent_id": args.agent_id, "expires_at": iso(expires)},
                     ensure_ascii=False))
    return 0


def cmd_delegate_release(args: argparse.Namespace) -> int:
    run_dir = resolve_run_dir()
    now = now_epoch()
    with Registry(run_dir) as reg:
        claim = reg.claims.get(args.agent_id)
        if claim is None:
            print(f"agent_log: неизвестный agent_id {args.agent_id!r}", file=sys.stderr)
            return 5
        claim["state"] = args.status
        claim["released_at"] = now
        claim["release_reason"] = args.note
        if args.thread_id:
            claim["thread_id"] = args.thread_id
        reg.save()
        task_id = claim.get("task_id")
        held_sec = round(now - claim.get("claimed_at", now), 3)
    emit(run_dir, {
        "kind": "delegation_release", "actor": args.agent_id, "task_id": task_id,
        "status": args.status, "detail": args.note, "held_sec": held_sec,
        "thread_id": args.thread_id,
    })
    print(json.dumps({"agent_id": args.agent_id, "status": args.status,
                      "held_sec": held_sec}, ensure_ascii=False))
    return 0


def cmd_delegate_status(args: argparse.Namespace) -> int:
    run_dir = resolve_run_dir()
    now = now_epoch()
    with Registry(run_dir) as reg:
        claims = list(reg.claims.values())

    live = [c for c in claims if c.get("state") not in TERMINAL_STATES
            and now < c.get("expires_at", 0)]
    if args.json:
        print(json.dumps({"run_dir": str(run_dir), "claims": claims,
                          "live": [c["agent_id"] for c in live]},
                         ensure_ascii=False, indent=1))
        return 0

    if not claims:
        print("делегирований в этом прогоне не было")
        return 0
    print(f"прогон: {run_dir.name}")
    for c in sorted(claims, key=lambda x: x.get("claimed_at", 0)):
        mark = "●" if c in live else "○"
        held = (c.get("released_at") or now) - c.get("claimed_at", now)
        print(f"  {mark} {c['agent_id']:<28} {c.get('task_id','?'):<34} "
              f"{c.get('state','?'):<10} попытка {c.get('attempt','?')}  "
              f"{held:7.1f}s")
        if c.get("reason"):
            print(f"      мотив: {c['reason']}")
    return 0


def cmd_action(args: argparse.Namespace) -> int:
    """Записать одно действие актора (вызов инструмента, сообщение, решение)."""
    run_dir = resolve_run_dir()
    emit(run_dir, {
        "kind": "agent_action", "actor": args.actor, "action_kind": args.kind,
        "name": args.name, "input": (args.input or "")[:4000],
        "task_id": args.task_id, "detail": args.detail,
    })
    return 0


def cmd_anomaly(args: argparse.Namespace) -> int:
    run_dir = resolve_run_dir()
    emit(run_dir, {
        "kind": "anomaly", "anomaly_kind": args.kind, "actor": args.actor,
        "severity": args.severity, "detail": args.detail,
        "evidence": (args.evidence or "")[:4000],
    })
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="agent_log.py", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    dc = sub.add_parser("delegate-claim", help="атомарно занять задачу под делегата")
    dc.add_argument("--task-id", required=True,
                    help="идентификатор задачи, обычно <роль>:<slug> — именно он "
                         "защищён от повторного занятия")
    dc.add_argument("--role", required=True)
    dc.add_argument("--agent-id", default=None)
    dc.add_argument("--lease-sec", type=int, default=DEFAULT_LEASE_SEC)
    dc.add_argument("--parallel-group", default=None,
                    help="метка осознанной параллельности: разные task_id одной "
                         "группы допустимо гонять одновременно")
    dc.add_argument("--reason", default=None,
                    help="ЗАЧЕМ делегируется — попадает в рассказ о прогоне")
    dc.add_argument("--worktree", default=None)

    dh = sub.add_parser("delegate-heartbeat", help="продлить лизу живого делегата")
    dh.add_argument("--agent-id", required=True)
    dh.add_argument("--thread-id", default=None)

    dr = sub.add_parser("delegate-release", help="закрыть лизу")
    dr.add_argument("--agent-id", required=True)
    dr.add_argument("--status", required=True, choices=["ok", "failed", "abandoned"])
    dr.add_argument("--note", default=None)
    dr.add_argument("--thread-id", default=None)

    ds = sub.add_parser("delegate-status", help="что сейчас делегировано и кому")
    ds.add_argument("--json", action="store_true")

    ac = sub.add_parser("action", help="записать действие актора")
    ac.add_argument("--actor", required=True)
    ac.add_argument("--kind", required=True)
    ac.add_argument("--name", default=None)
    ac.add_argument("--input", default=None)
    ac.add_argument("--task-id", default=None)
    ac.add_argument("--detail", default=None)

    an = sub.add_parser("anomaly", help="записать аномалию")
    an.add_argument("--kind", required=True)
    an.add_argument("--actor", default=None)
    an.add_argument("--severity", default="warn", choices=["info", "warn", "error"])
    an.add_argument("--detail", default=None)
    an.add_argument("--evidence", default=None)

    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    handlers = {
        "delegate-claim": cmd_delegate_claim,
        "delegate-heartbeat": cmd_delegate_heartbeat,
        "delegate-release": cmd_delegate_release,
        "delegate-status": cmd_delegate_status,
        "action": cmd_action,
        "anomaly": cmd_anomaly,
    }
    return handlers[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())
