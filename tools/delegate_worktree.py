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
import dataclasses
import fcntl
import json
import os
import shutil
import stat
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


def _run_git(args: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[bytes]:
    """Запустить git без декодирования stdout.

    Декодирование и нормализация намеренно вынесены в вызывающие функции:
    git использует stdout и для обычных текстовых значений, и для бинарных
    blob'ов/NUL-разделённых протоколов.
    """
    return subprocess.run(["git", *args], cwd=str(cwd or ROOT),
                          capture_output=True)


def _raise_git_error(args: list[str], proc: subprocess.CompletedProcess[bytes]) -> None:
    stderr = os.fsdecode(proc.stderr).strip()
    # stdout может принадлежать raw-команде; не нормализуем его даже в
    # диагностике ошибки. У stderr здесь обычная текстовая роль.
    stdout = os.fsdecode(proc.stdout)
    raise RuntimeError(f"git {' '.join(args)} → {proc.returncode}: "
                       f"{stderr or stdout}")


def git(args: list[str], cwd: Path | None = None, check: bool = True) -> str:
    """Вызов git для обычного текстового scalar-вывода.

    `.strip()` допустим только здесь: вызывающий код должен использовать эту
    функцию лишь для значений вроде commit SHA или типа git-объекта.
    """
    proc = _run_git(args, cwd=cwd)
    if check and proc.returncode != 0:
        _raise_git_error(args, proc)
    return os.fsdecode(proc.stdout).strip()


def git_raw(args: list[str], cwd: Path | None = None, check: bool = True) -> bytes:
    """Вызов git, возвращающий stdout побайтово и без нормализации.

    Это единственный допустимый путь для `-z`-выводов и содержимого blob'ов:
    здесь нельзя удалять пробелы, переводы строк или любые другие байты.
    """
    proc = _run_git(args, cwd=cwd)
    if check and proc.returncode != 0:
        _raise_git_error(args, proc)
    return proc.stdout


def _decode_git_path(raw_path: bytes) -> str:
    """Декодировать имя файла как имя filesystem, не теряя байты.

    `-z`-режим не применяет git-экранирование. `os.fsdecode` использует
    surrogateescape для невалидного UTF-8 и потому сохраняет такие имена для
    последующего обращения к файловой системе.
    """
    return os.fsdecode(raw_path)


def _nul_paths(raw: bytes) -> list[str]:
    """Разобрать NUL-разделённый список путей без trim/strip."""
    return [_decode_git_path(part) for part in raw.split(b"\0") if part]


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

    Tracked-изменения берём относительно зафиксированной базы, а untracked —
    отдельной git-командой. Обе команды используют NUL-протокол и raw bytes:
    status porcelain здесь не нужен, а значит пробелы в двухбайтовом статусе
    не могут стать частью имени пути.

    `--no-renames` обязателен для safety-проверки: rename намеренно выглядит
    как удаление старого пути и добавление нового, чтобы allowlist не потеряла
    ни одну из сторон.
    """
    tracked = set(_nul_paths(git_raw([
        "diff", "--name-only", "-z", "--no-renames", base, "--",
    ], cwd=wt)))
    untracked = set(_nul_paths(git_raw([
        "ls-files", "--others", "--exclude-standard", "-z", "--",
    ], cwd=wt)))
    return tracked, untracked


@dataclasses.dataclass(frozen=True)
class FileState:
    """Состояние одного пути в дереве.

    Отсутствие — это `exists=False`, а не пустой `content`: пустой blob имеет
    `exists=True` и `content=b""`. Для regular-файлов `content` всегда raw
    bytes, поэтому trailing whitespace, CRLF и произвольные binary bytes
    остаются частью сравнения.
    """

    exists: bool
    content: bytes | None
    kind: str = "missing"
    mode: str | None = None


@dataclasses.dataclass(frozen=True)
class Change:
    path: str
    base: FileState
    delegate: FileState
    change_type: str


SUPPORTED_FILE_KINDS = {"missing", "file"}


def _base_tree_header(base: str, rel: str, cwd: Path) -> bytes | None:
    """Вернуть header `ls-tree` для exact path или None, если его нет.

    `ls-tree -z` не цитирует имена путей. Literal pathspec нужен дополнительно,
    чтобы символы `*`, `?`, `[` в имени не расширялись в другие записи.
    """
    raw = git_raw([
        "ls-tree", "-z", "--full-tree", base, "--", f":(literal){rel}",
    ], cwd=cwd)
    wanted = os.fsencode(rel)
    for record in raw.split(b"\0"):
        if not record:
            continue
        try:
            header, path = record.split(b"\t", 1)
        except ValueError as exc:
            raise RuntimeError(f"git ls-tree вернул повреждённую запись для {rel!r}") from exc
        if path == wanted:
            return header
    return None


def _base_file_state(base: str, rel: str, cwd: Path) -> FileState:
    """Прочитать состояние пути в BASE, включая пустой blob.

    Наличие проверяется по записи `ls-tree`, а не по содержимому stdout
    `git show`: у отсутствующего пути и у существующего пустого blob stdout
    одинаково пуст.
    """
    header = _base_tree_header(base, rel, cwd)
    if header is None:
        return FileState(False, None)

    fields = header.split()
    if len(fields) != 3:
        raise RuntimeError(f"git ls-tree вернул неожиданный header для {rel!r}")
    mode = os.fsdecode(fields[0])
    object_type = os.fsdecode(fields[1])
    object_id = os.fsdecode(fields[2])

    if mode == "120000":
        kind = "symlink"
    elif mode.startswith("100") and object_type == "blob":
        kind = "file"
    elif object_type == "tree":
        kind = "directory"
    elif object_type == "commit":
        kind = "submodule"
    else:
        kind = "other"

    content = None
    if object_type == "blob":
        # cat-file blob отдаёт данные без заголовков и без финального newline.
        content = git_raw(["cat-file", "blob", object_id], cwd=cwd)
    return FileState(True, content, kind, mode)


def _disk_file_state(path: Path) -> FileState:
    """Прочитать состояние на диске через lstat/read_bytes, не следуя symlink."""
    try:
        info = path.lstat()
    except FileNotFoundError:
        return FileState(False, None)

    if stat.S_ISLNK(info.st_mode):
        return FileState(True, None, "symlink", "120000")
    if stat.S_ISREG(info.st_mode):
        mode = "100755" if info.st_mode & 0o111 else "100644"
        return FileState(True, path.read_bytes(), "file", mode)
    if stat.S_ISDIR(info.st_mode):
        return FileState(True, None, "directory")
    return FileState(True, None, "other")


def _unsupported_kind(base: FileState, delegate: FileState) -> str | None:
    for state in (base, delegate):
        if state.kind not in SUPPORTED_FILE_KINDS:
            return state.kind
    return None


def _change_for(wt: Path, base: str, rel: str) -> Change:
    base_state = _base_file_state(base, rel, wt)
    delegate_state = _disk_file_state(wt / rel)
    unsupported = _unsupported_kind(base_state, delegate_state)
    if unsupported is not None:
        return Change(rel, base_state, delegate_state, unsupported)
    if not base_state.exists and delegate_state.exists:
        change_type = "add"
    elif base_state.exists and not delegate_state.exists:
        change_type = "delete"
    elif base_state.exists and delegate_state.exists:
        # Binary files intentionally use the same path as text files: all
        # regular-file handling below is byte-for-byte and never decodes text.
        change_type = "modify"
    else:
        # A path in changed_paths should not have both states missing. Treat
        # that race/anomaly as unsupported instead of silently losing it.
        change_type = "unknown"
    return Change(rel, base_state, delegate_state, change_type)


def _unsupported_details(changes: list[Change], main_states: dict[str, FileState]) -> list[dict[str, str]]:
    details: list[dict[str, str]] = []
    for change in changes:
        if change.change_type not in {"add", "delete", "modify"}:
            details.append({"path": change.path, "type": change.change_type,
                            "change_type": change.change_type})
            continue
        main = main_states.get(change.path)
        if main is not None and main.kind not in SUPPORTED_FILE_KINDS:
            details.append({"path": change.path, "type": main.kind,
                            "change_type": main.kind})
    return details


def _report_unsupported_change_type(
    rd: Path, agent_id: str, wt: Path, details: list[dict[str, str]],
) -> int:
    """Остановить close до слияния, сохранив worktree для оператора."""
    pipeline_log.append_event(rd, {
        "kind": "anomaly", "anomaly_kind": "worktree_unsupported_change_type",
        "actor": agent_id, "severity": "error",
        "detail": "делегат изменил неподдерживаемый тип пути",
        "evidence": json.dumps(details, ensure_ascii=False),
    })
    agent_log.main(["delegate-release", "--agent-id", agent_id,
                    "--status", "failed",
                    "--note", "обнаружен неподдерживаемый тип изменения, результат не влит"])
    print(json.dumps({
        "merged": False,
        "error": "worktree_unsupported_change_type",
        "error_code": "worktree_unsupported_change_type",
        "reason": "worktree_unsupported_change_type",
        "unsupported": details,
        "worktree": str(wt),
        "hint": "worktree намеренно НЕ удалён — разберись с типом изменения и закрой его `abandon`.",
    }, ensure_ascii=False, indent=1))
    return 2


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

    changes = [_change_for(wt, base, rel) for rel in touched]
    main_states = {change.path: _disk_file_state(ROOT / change.path)
                   for change in changes}
    unsupported = _unsupported_details(changes, main_states)
    if unsupported:
        return _report_unsupported_change_type(rd, args.agent_id, wt, unsupported)

    merged: list[str] = []
    conflicts: list[str] = []
    for change in changes:
        rel = change.path
        src = wt / rel
        dst = ROOT / rel
        main_state = main_states[rel]

        # Сравниваем явные состояния BASE и main, включая exists=False и
        # content=b"". Это покрывает modify/add/delete и не превращает
        # отсутствие файла в особый случай с пустой строкой.
        if args.detect_conflicts and main_state != change.base:
            conflicts.append(rel)
            continue

        if change.change_type == "delete":
            # При включённом conflict detection main_state.exists здесь всегда
            # True: если main уже удалил файл, это было бы конфликтом выше.
            if main_state.exists:
                dst.unlink()
        elif change.change_type in {"add", "modify"}:
            dst.parent.mkdir(parents=True, exist_ok=True)
            # Источник проверен через lstat/read_bytes: symlink не может
            # незаметно превратиться в копирование внешнего файла.
            shutil.copy2(src, dst)
        else:
            # Изменённый путь с двумя отсутствующими состояниями невозможен
            # для обычного git diff, но не должен молча менять main.
            continue
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
        "change_types": {change.path: change.change_type for change in changes},
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
