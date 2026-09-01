#!/usr/bin/env python3
"""Изолированное делегирование: каждому делегату — свой git worktree.

Корневой архитектурный изъян инцидента auto-20260831-164055 был не в том, что
делегат оказался злонамеренным, а в том, что три делегата одновременно писали
в ОДИН путь ОДНОГО рабочего дерева. Отсюда выросло всё остальное: один решил
«убрать с дороги» чужие файлы стешем, другой обнаружил, что его результат
затёрт, и пошёл убивать процессы, чтобы отвоевать файл. Разбор —
corrections/git-reset-clean-incident/REPORT.md.

Гонки за файл нельзя запретить инструкцией — её можно только сделать
невозможной. Здесь это делается так: делегат вообще не видит основного
рабочего дерева. Он работает в собственном worktree по собственному пути;
что бы он там ни натворил, основное дерево этого не замечает. Слить результат
обратно может только оркестратор — единолично, последовательно и с проверкой,
какие пути делегату вообще разрешено было трогать.

    delegate_worktree.py open  --task-id ID --role R [--agent-id A] [--reason ...]
    delegate_worktree.py close --agent-id A --allow PATH [--allow PATH ...]
                               [--status ok|failed] [--no-commit]
    delegate_worktree.py abandon --agent-id A [--note ...]
    delegate_worktree.py list
    delegate_worktree.py gc [--dry-run]

Разделение ответственности с agent_log.py: реестр лиз (кто что занял) живёт
там, здесь — физический жизненный цикл каталога. `open` берёт лизу через
реестр и, только получив её, создаёт worktree, поэтому дублирующее
делегирование не создаёт даже пустого каталога.

Коды выхода:
    0  успех
    2  ошибка использования / состояния
    4  задача уже занята живой лизой (см. agent_log.py delegate-claim)
    6  делегат изменил пути вне разрешённого списка — результат НЕ влит
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_log  # noqa: E402
import agent_log  # noqa: E402

ROOT = pipeline_log.ROOT

# Worktree делегатов живут ВНЕ репозитория. Причины две, обе практические:
# внутри репозитория они попадали бы в любые обходы дерева (`git status`,
# сканер untracked-файлов, du, find) и путали бы их; и, что важнее, каталог
# делегата не должен быть даже теоретически достижим обычной работой с
# основным деревом.
WORKTREES_ROOT = Path.home() / ".local/share/shortvideo/worktrees"
ALLOC_LOCK = Path.home() / ".local/share/shortvideo/worktree-alloc.lock"


def git(args: list[str], cwd: Path | None = None, check: bool = True) -> str:
    """Вызов git. Деструктивные формы здесь не используются принципиально."""
    proc = subprocess.run(["git", *args], cwd=str(cwd or ROOT),
                          capture_output=True, text=True)
    if check and proc.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} → {proc.returncode}: "
                           f"{proc.stderr.strip() or proc.stdout.strip()}")
    return proc.stdout.strip()


class AllocLock:
    """Сериализует операции жизненного цикла worktree.

    Сам git разводит index'ы разных worktree по разным файлам, но
    последовательность «выбрать имя → создать → зарегистрировать лизу» не
    атомарна, а `git worktree prune` может увидеть полусозданный каталог.
    Дешевле сериализовать её целиком, чем ловить эти гонки поодиночке.
    """

    def __enter__(self) -> "AllocLock":
        ALLOC_LOCK.parent.mkdir(parents=True, exist_ok=True)
        self._fd = os.open(ALLOC_LOCK, os.O_CREAT | os.O_RDWR, 0o600)
        fcntl.flock(self._fd, fcntl.LOCK_EX)
        return self

    def __exit__(self, *exc: object) -> None:
        fcntl.flock(self._fd, fcntl.LOCK_UN)
        os.close(self._fd)


def run_dir() -> Path:
    return pipeline_log.ensure_run()


def worktree_path(run_id: str, agent_id: str) -> Path:
    return WORKTREES_ROOT / run_id / agent_id


def changed_paths(wt: Path, base: str) -> tuple[set[str], set[str]]:
    """(изменённые отслеживаемые пути, untracked-пути) в worktree делегата.

    Считаем и то и другое: делегат чаще всего СОЗДАЁТ новый файл (draft JSON),
    то есть его результат — именно untracked-путь, и не проверять их значило бы
    не проверять ничего.
    """
    tracked = set()
    untracked = set()
    out = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"], cwd=wt)
    for entry in out.split("\0"):
        if not entry or len(entry) < 4:
            continue
        code, path = entry[:2], entry[3:]
        (untracked if code == "??" else tracked).add(path)
    # Плюс всё, что делегат успел закоммитить у себя поверх базы.
    try:
        committed = git(["diff", "--name-only", "-z", base, "HEAD"], cwd=wt)
        tracked |= {p for p in committed.split("\0") if p}
    except RuntimeError:
        pass
    return tracked, untracked


def cmd_open(args: argparse.Namespace) -> int:
    rd = run_dir()
    agent_id = args.agent_id or f"{args.role}-{uuid.uuid4().hex[:8]}"
    wt = worktree_path(rd.name, agent_id)

    # Сначала лиза, потом каталог: если задача уже занята, ничего не создаём.
    claim_rc = agent_log.main([
        "delegate-claim", "--task-id", args.task_id, "--role", args.role,
        "--agent-id", agent_id, "--worktree", str(wt),
        *(["--reason", args.reason] if args.reason else []),
        *(["--lease-sec", str(args.lease_sec)] if args.lease_sec else []),
        *(["--parallel-group", args.parallel_group] if args.parallel_group else []),
    ])
    if claim_rc != 0:
        return claim_rc

    with AllocLock():
        base = git(["rev-parse", "HEAD"])
        wt.parent.mkdir(parents=True, exist_ok=True)
        # --detach: делегату не нужна именованная ветка, а detached HEAD
        # исключает случайный захват ветки, на которой сидит основное дерево.
        git(["worktree", "add", "--detach", str(wt), base])
        (wt / ".delegate-base").write_text(base, encoding="utf-8")

    pipeline_log.append_event(rd, {
        "kind": "worktree_open", "actor": agent_id, "task_id": args.task_id,
        "role": args.role, "worktree": str(wt), "base": base,
    })
    print(json.dumps({
        "agent_id": agent_id, "task_id": args.task_id, "worktree": str(wt),
        "base": base,
        "hint": "передай делегату этот путь как рабочий каталог (cwd). Основное "
                "дерево репозитория ему не нужно и трогать его он не должен.",
    }, ensure_ascii=False, indent=1))
    return 0


def cmd_close(args: argparse.Namespace) -> int:
    rd = run_dir()
    registry = json.loads((rd / "delegations.json").read_text(encoding="utf-8")) \
        if (rd / "delegations.json").is_file() else {"claims": {}}
    claim = (registry.get("claims") or {}).get(args.agent_id)
    if claim is None:
        print(f"delegate_worktree: неизвестный agent_id {args.agent_id!r}", file=sys.stderr)
        return 2
    wt = Path(claim.get("worktree") or worktree_path(rd.name, args.agent_id))
    if not wt.is_dir():
        print(f"delegate_worktree: каталог {wt} отсутствует", file=sys.stderr)
        return 2

    base = (wt / ".delegate-base").read_text(encoding="utf-8").strip() \
        if (wt / ".delegate-base").is_file() else git(["rev-parse", "HEAD"])
    tracked, untracked = changed_paths(wt, base)
    untracked.discard(".delegate-base")
    touched = sorted(tracked | untracked)

    allowed = set(args.allow or [])
    violations = [p for p in touched if p not in allowed]

    if violations:
        # Ничего не вливаем. Результат делегата остаётся в его worktree —
        # он не потерян, но и не попадает в основное дерево автоматически.
        # Разбирается оператор, а не конвейер.
        pipeline_log.append_event(rd, {
            "kind": "anomaly", "anomaly_kind": "worktree_path_violation",
            "actor": args.agent_id, "severity": "error",
            "detail": f"делегат изменил {len(violations)} путей вне разрешённых",
            "evidence": json.dumps(violations[:40], ensure_ascii=False),
        })
        agent_log.main(["delegate-release", "--agent-id", args.agent_id,
                        "--status", "failed",
                        "--note", "изменены пути вне allowlist, результат не влит"])
        print(json.dumps({
            "merged": False, "reason": "path_violation",
            "violations": violations[:40], "allowed": sorted(allowed),
            "worktree": str(wt),
            "hint": "worktree намеренно НЕ удалён — в нём лежит работа делегата. "
                    "Разберись глазами, потом закрой `abandon`.",
        }, ensure_ascii=False, indent=1))
        return 6

    merged: list[str] = []
    conflicts: list[str] = []
    for rel in touched:
        src = wt / rel
        dst = ROOT / rel
        if not src.is_file():
            continue
        # Конфликт: пока делегат работал, тот же файл изменился в основном
        # дереве. Никакой автоматики — конвейер останавливается и говорит об
        # этом. Именно на этом месте в инциденте делегат начал «побеждать»
        # конкурента вместо того, чтобы доложить.
        if dst.exists() and args.detect_conflicts:
            base_blob = None
            try:
                base_blob = git(["show", f"{base}:{rel}"], check=False)
            except RuntimeError:
                base_blob = None
            current = dst.read_text(encoding="utf-8", errors="replace")
            if base_blob is not None and base_blob != "" and current != base_blob:
                conflicts.append(rel)
                continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        merged.append(rel)

    if conflicts:
        pipeline_log.append_event(rd, {
            "kind": "anomaly", "anomaly_kind": "worktree_conflict",
            "actor": args.agent_id, "severity": "error",
            "detail": "целевые файлы изменились в основном дереве, пока делегат работал",
            "evidence": json.dumps(conflicts, ensure_ascii=False),
        })

    commit_sha = None
    if merged and not args.no_commit:
        git(["add", "--", *merged])
        role = claim.get("role") or "делегат"
        msg = (f"{role}: результат делегата {args.agent_id}\n\n"
               f"Задача: {claim.get('task_id')}\n"
               f"Worktree: {wt}\nБаза: {base}\n"
               f"Влито путей: {len(merged)}\n")
        proc = subprocess.run(["git", "commit", "-m", msg, "--", *merged],
                              cwd=str(ROOT), capture_output=True, text=True)
        if proc.returncode == 0:
            commit_sha = git(["rev-parse", "HEAD"])

    removed = _remove_worktree(wt)
    agent_log.main(["delegate-release", "--agent-id", args.agent_id,
                    "--status", "failed" if conflicts else args.status,
                    "--note", f"влито путей: {len(merged)}"
                              + (f", конфликтов: {len(conflicts)}" if conflicts else "")])
    pipeline_log.append_event(rd, {
        "kind": "worktree_close", "actor": args.agent_id,
        "merged": merged, "conflicts": conflicts, "commit": commit_sha,
        "worktree_removed": removed,
    })
    print(json.dumps({
        "merged": bool(merged) and not conflicts, "paths": merged,
        "conflicts": conflicts, "commit": commit_sha,
        "worktree_removed": removed,
    }, ensure_ascii=False, indent=1))
    return 2 if conflicts else 0


def _remove_worktree(wt: Path) -> bool:
    """Убрать worktree делегата.

    `git worktree remove` без --force намеренно: если внутри осталось что-то
    незапланированное, каталог должен пережить уборку и дождаться человека.
    Потерять чужие файлы молча — это ровно то, чем кончился инцидент.
    """
    with AllocLock():
        try:
            git(["worktree", "remove", str(wt)])
            return True
        except RuntimeError:
            git(["worktree", "prune"], check=False)
            return wt.exists() is False


def cmd_abandon(args: argparse.Namespace) -> int:
    rd = run_dir()
    agent_log.main(["delegate-release", "--agent-id", args.agent_id,
                    "--status", "abandoned", "--note", args.note or "закрыт оператором"])
    pipeline_log.append_event(rd, {
        "kind": "worktree_abandon", "actor": args.agent_id, "detail": args.note,
    })
    print(json.dumps({"agent_id": args.agent_id, "status": "abandoned"},
                     ensure_ascii=False))
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    out = git(["worktree", "list", "--porcelain"], check=False)
    entries = [b for b in out.split("\n\n") if "worktrees" in b or str(WORKTREES_ROOT) in b]
    if not entries:
        print("worktree делегатов нет")
        return 0
    for block in entries:
        print(block.splitlines()[0])
    return 0


def cmd_gc(args: argparse.Namespace) -> int:
    """Убрать worktree, чьи лизы завершены или истекли.

    Возраст каталога сам по себе НЕ является основанием для удаления: старый
    файл внутри worktree не означает, что делегат мёртв. Основание — только
    терминальное или истёкшее состояние лизы в реестре.
    """
    now = time.time()
    removed, kept = [], []
    if not WORKTREES_ROOT.is_dir():
        print("каталога worktree нет")
        return 0
    for run_path in sorted(WORKTREES_ROOT.iterdir()):
        if not run_path.is_dir():
            continue
        reg_path = pipeline_log.RUNS / run_path.name / "delegations.json"
        registry: dict[str, Any] = {}
        try:
            registry = json.loads(reg_path.read_text(encoding="utf-8")).get("claims", {})
        except (OSError, ValueError):
            registry = {}
        for wt in sorted(run_path.iterdir()):
            if not wt.is_dir():
                continue
            claim = registry.get(wt.name)
            terminal = claim is not None and claim.get("state") in agent_log.TERMINAL_STATES
            expired = claim is not None and now >= claim.get("expires_at", 0)
            unknown = claim is None
            if not (terminal or expired or unknown):
                kept.append(str(wt))
                continue
            if args.dry_run:
                removed.append(str(wt))
                continue
            if _remove_worktree(wt):
                removed.append(str(wt))
            else:
                kept.append(str(wt))
    print(json.dumps({"removed": removed, "kept": kept,
                      "dry_run": bool(args.dry_run)}, ensure_ascii=False, indent=1))
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="delegate_worktree.py", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    o = sub.add_parser("open")
    o.add_argument("--task-id", required=True)
    o.add_argument("--role", required=True)
    o.add_argument("--agent-id", default=None)
    o.add_argument("--reason", default=None)
    o.add_argument("--lease-sec", type=int, default=None)
    o.add_argument("--parallel-group", default=None)

    c = sub.add_parser("close")
    c.add_argument("--agent-id", required=True)
    c.add_argument("--allow", action="append", required=True,
                   help="путь относительно корня репозитория, который делегату "
                        "разрешено было изменить. Всё остальное — нарушение.")
    c.add_argument("--status", default="ok", choices=["ok", "failed"])
    c.add_argument("--no-commit", action="store_true")
    c.add_argument("--detect-conflicts", action="store_true", default=True)

    a = sub.add_parser("abandon")
    a.add_argument("--agent-id", required=True)
    a.add_argument("--note", default=None)

    sub.add_parser("list")

    g = sub.add_parser("gc")
    g.add_argument("--dry-run", action="store_true")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return {"open": cmd_open, "close": cmd_close, "abandon": cmd_abandon,
            "list": cmd_list, "gc": cmd_gc}[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())
