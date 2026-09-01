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
    7  worktree/task quarantine активен после неподтверждённого timeout
"""
from __future__ import annotations

import argparse
import dataclasses
import fcntl
import json
import math
import os
import re
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
# Keep the lock outside ROOT so it cannot become a repository change, while
# deriving it from ROOT so test/sandbox repositories do not need home access.
INTEGRATION_LOCK = ROOT.parent / f".{ROOT.name}.worktree-integration.lock"
IDENTITY_MARKER = "delegate-identity"


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


class IntegrationLock:
    """Serialize ROOT validation, apply, staging, and commit transactions."""

    def __enter__(self) -> "IntegrationLock":
        INTEGRATION_LOCK.parent.mkdir(parents=True, exist_ok=True)
        self._fd = os.open(INTEGRATION_LOCK, os.O_CREAT | os.O_RDWR, 0o600)
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
SHA_RE = re.compile(r"[0-9a-fA-F]{40}|[0-9a-fA-F]{64}")


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


@dataclasses.dataclass(frozen=True)
class IndexSnapshot:
    path: Path
    exists: bool
    content: bytes | None
    mode: int | None


class CloseValidationError(RuntimeError):
    """A close request is unsafe to integrate and must fail closed."""

    def __init__(self, error_code: str, reason: str, **details: Any) -> None:
        super().__init__(reason)
        self.error_code = error_code
        self.reason = reason
        self.details = details


def _release_claim_locked(
    reg: agent_log.Registry,
    rd: Path,
    agent_id: str,
    status: str,
    *,
    note: str,
    error_code: str | None = None,
) -> dict[str, Any] | None:
    """Release a close claim while ``reg`` remains locked."""

    info = agent_log.release_claim_locked(
        reg, agent_id, status,
        result_class="policy_failure" if error_code else None,
        error_code=error_code,
        note=note,
    )
    if info is None:
        return None
    claim = info["claim"]
    agent_log.emit(rd, {
        "kind": "delegation_release", "actor": agent_id,
        "task_id": info["task_id"], "status": info["status"],
        "detail": info["note"], "held_sec": info["held_sec"],
        "thread_id": info["thread_id"], "role": info["role"],
        "worktree_path": info["worktree"], "base_sha": info["base_sha"],
        "result_class": info["result_class"], "error_code": info["error_code"],
        "infrastructure_attempt": claim.get("infrastructure_attempt"),
        "semantic_attempt": claim.get("semantic_attempt"),
    })
    return info


def _validate_claim(args: argparse.Namespace, rd: Path, claim: dict[str, Any]) -> Path:
    """Validate lease state and bind the claim to this close invocation."""

    if claim.get("agent_id") != args.agent_id:
        raise CloseValidationError(
            "worktree_lease_identity_mismatch", "claim agent identity mismatch",
        )
    if agent_log.termination_unconfirmed(claim):
        raise CloseValidationError(
            agent_log.TERMINATION_UNCONFIRMED_ERROR_CODE,
            "delegate termination is unconfirmed after transport timeout",
            termination_unconfirmed=True,
            worktree=claim.get("worktree"),
            worktree_removed=False,
        )
    state = claim.get("state")
    if state in agent_log.TERMINAL_STATES:
        raise CloseValidationError(
            "worktree_lease_invalid", "terminal lease cannot be merged",
            lease_state=state,
        )
    if state != "running":
        raise CloseValidationError(
            "worktree_lease_invalid", "claim is not an active lease",
            lease_state=state,
        )
    try:
        expires_at = float(claim["expires_at"])
    except (KeyError, TypeError, ValueError) as exc:
        raise CloseValidationError(
            "worktree_lease_invalid", "claim has no valid lease expiry",
        ) from exc
    if not math.isfinite(expires_at) or time.time() >= expires_at:
        raise CloseValidationError(
            "worktree_lease_expired", "lease has expired",
            expires_at=expires_at,
        )

    for argument, field in (("task_id", "task_id"), ("role", "role"), ("attempt", "attempt")):
        expected = getattr(args, argument, None)
        if expected is not None and claim.get(field) != expected:
            raise CloseValidationError(
                "worktree_lease_identity_mismatch", f"claim {field} mismatch",
                field=field, expected=expected, actual=claim.get(field),
            )

    expected_worktree = worktree_path(rd.name, args.agent_id).resolve()
    registered_worktree = claim.get("worktree")
    if not isinstance(registered_worktree, str) or not registered_worktree:
        raise CloseValidationError(
            "worktree_lease_invalid", "claim has no registered worktree",
        )
    worktree = Path(registered_worktree).resolve()
    if worktree != expected_worktree:
        raise CloseValidationError(
            "worktree_lease_identity_mismatch", "claim worktree identity mismatch",
            expected=str(expected_worktree), actual=str(worktree),
        )
    return worktree


def _claim_identity(claim: dict[str, Any]) -> dict[str, Any]:
    return {
        "agent_id": claim.get("agent_id"),
        "task_id": claim.get("task_id"),
        "role": claim.get("role"),
        "attempt": claim.get("attempt"),
        "base_sha": claim.get("base_sha"),
    }


def _identity_marker_path(wt: Path) -> Path:
    raw_git_dir = Path(git(["rev-parse", "--git-dir"], cwd=wt))
    git_dir = raw_git_dir if raw_git_dir.is_absolute() else (wt / raw_git_dir).resolve()
    return git_dir / IDENTITY_MARKER


def _validate_identity_marker(claim: dict[str, Any], wt: Path) -> None:
    """Reject a stale/reused claim whose worktree identity no longer matches."""

    try:
        marker = _identity_marker_path(wt)
    except RuntimeError as exc:
        raise CloseValidationError(
            "worktree_lease_identity_mismatch", "cannot locate worktree identity marker",
        ) from exc
    try:
        info = marker.lstat()
    except (FileNotFoundError, OSError) as exc:
        raise CloseValidationError(
            "worktree_lease_identity_mismatch", "delegate identity marker is missing",
        ) from exc
    if not stat.S_ISREG(info.st_mode):
        raise CloseValidationError(
            "worktree_lease_identity_mismatch", "delegate identity marker is not regular",
        )
    try:
        marker_identity = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError) as exc:
        raise CloseValidationError(
            "worktree_lease_identity_mismatch", "delegate identity marker is invalid",
        ) from exc
    if marker_identity != _claim_identity(claim):
        raise CloseValidationError(
            "worktree_lease_identity_mismatch", "delegate identity marker disagrees with claim",
        )


def _canonical_base(claim: dict[str, Any], wt: Path) -> str:
    """Return the validated registry baseline; the marker is only a check."""

    base_value = claim.get("base_sha")
    if not isinstance(base_value, str) or SHA_RE.fullmatch(base_value) is None:
        raise CloseValidationError(
            "worktree_base_missing", "claim has no canonical base SHA",
        )
    base = base_value.lower()
    try:
        resolved = git(["rev-parse", "--verify", f"{base}^{{commit}}"], cwd=ROOT)
    except RuntimeError as exc:
        raise CloseValidationError(
            "worktree_base_invalid", "claim base SHA is not a commit",
        ) from exc
    if resolved.lower() != base:
        raise CloseValidationError(
            "worktree_base_invalid", "claim base SHA is not canonical",
            resolved=resolved,
        )

    marker = wt / ".delegate-base"
    try:
        marker_info = marker.lstat()
    except FileNotFoundError:
        marker_info = None
    except OSError as exc:
        raise CloseValidationError(
            "worktree_base_mismatch", "cannot inspect delegate base marker",
        ) from exc
    if marker_info is not None:
        if not stat.S_ISREG(marker_info.st_mode):
            raise CloseValidationError(
                "worktree_base_mismatch", "delegate base marker is not a regular file",
            )
        try:
            marker_base = marker.read_text(encoding="utf-8").strip().lower()
        except (OSError, UnicodeError) as exc:
            raise CloseValidationError(
                "worktree_base_mismatch", "cannot read delegate base marker",
            ) from exc
        if marker_base != base:
            raise CloseValidationError(
                "worktree_base_mismatch", "delegate base marker disagrees with registry",
                marker_base=marker_base,
                registry_base=base,
            )
    return base


def _index_snapshot() -> IndexSnapshot:
    raw_path = Path(git(["rev-parse", "--git-path", "index"], cwd=ROOT))
    path = raw_path if raw_path.is_absolute() else ROOT / raw_path
    try:
        info = path.lstat()
    except FileNotFoundError:
        return IndexSnapshot(path, False, None, None)
    if not stat.S_ISREG(info.st_mode):
        raise RuntimeError(f"git index path is not a regular file: {path}")
    return IndexSnapshot(path, True, path.read_bytes(), stat.S_IMODE(info.st_mode))


def _remove_path_without_following(path: Path) -> None:
    try:
        info = path.lstat()
    except FileNotFoundError:
        return
    if stat.S_ISDIR(info.st_mode):
        path.rmdir()
    else:
        path.unlink()


def _restore_file_state(rel: str, state: FileState) -> None:
    path = ROOT / rel
    if not state.exists:
        # A missing path may also be a parent of another restored path; only
        # remove regular-file artifacts here. Newly created directories are
        # handled separately by _rollback_transaction.
        try:
            info = path.lstat()
        except FileNotFoundError:
            return
        if stat.S_ISDIR(info.st_mode):
            return
        path.unlink()
        return
    if state.kind != "file" or state.content is None:
        raise RuntimeError(f"cannot restore unsupported pre-state for {rel!r}")
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        info = path.lstat()
    except FileNotFoundError:
        info = None
    if info is not None and not stat.S_ISREG(info.st_mode):
        _remove_path_without_following(path)
    path.write_bytes(state.content)
    os.chmod(path, 0o755 if state.mode == "100755" else 0o644)


def _restore_index(snapshot: IndexSnapshot) -> None:
    if not snapshot.exists:
        _remove_path_without_following(snapshot.path)
        return
    snapshot.path.parent.mkdir(parents=True, exist_ok=True)
    snapshot.path.write_bytes(snapshot.content or b"")
    if snapshot.mode is not None:
        os.chmod(snapshot.path, snapshot.mode)


def _rollback_transaction(
    main_states: dict[str, FileState],
    index: IndexSnapshot,
    created_dirs: set[Path],
) -> list[str]:
    """Restore only this close's paths and index; never reset the repository."""

    errors: list[str] = []
    for rel, state in main_states.items():
        try:
            _restore_file_state(rel, state)
        except (OSError, RuntimeError) as exc:
            errors.append(f"{rel}: {exc}")
    for directory in sorted(created_dirs, key=lambda path: len(path.parts), reverse=True):
        try:
            if directory.exists():
                directory.rmdir()
        except OSError as exc:
            errors.append(f"{directory}: {exc}")
    try:
        _restore_index(index)
    except (OSError, RuntimeError) as exc:
        errors.append(f"{index.path}: {exc}")
    return errors


def _ensure_parent_dirs(path: Path) -> set[Path]:
    missing: list[Path] = []
    parent = path.parent
    while parent != ROOT:
        try:
            info = parent.lstat()
        except FileNotFoundError:
            missing.append(parent)
            parent = parent.parent
            continue
        if not stat.S_ISDIR(info.st_mode):
            raise RuntimeError(f"parent is not a regular directory: {parent}")
        break
    path.parent.mkdir(parents=True, exist_ok=True)
    return set(missing)


def _apply_change(change: Change, created_dirs: set[Path]) -> None:
    dst = ROOT / change.path
    if change.change_type == "delete":
        _remove_path_without_following(dst)
        return
    if change.change_type not in {"add", "modify"} or change.delegate.content is None:
        raise RuntimeError(f"cannot apply unsupported change {change.path!r}")
    created_dirs.update(_ensure_parent_dirs(dst))
    # Apply the planned raw bytes, rather than rereading a possibly changing
    # delegate path. The source was already checked for symlink/type safety.
    dst.write_bytes(change.delegate.content)
    os.chmod(dst, 0o755 if change.delegate.mode == "100755" else 0o644)


def _report_unsupported_change_type(
    rd: Path, agent_id: str, wt: Path, details: list[dict[str, str]],
    reg: agent_log.Registry,
) -> int:
    """Остановить close до слияния, сохранив worktree для оператора."""
    pipeline_log.append_event(rd, {
        "kind": "anomaly", "anomaly_kind": "worktree_unsupported_change_type",
        "actor": agent_id, "severity": "error",
        "detail": "делегат изменил неподдерживаемый тип пути",
        "evidence": json.dumps(details, ensure_ascii=False),
    })
    _release_claim_locked(
        reg, rd, agent_id, "failed",
        note="обнаружен неподдерживаемый тип изменения, результат не влит",
        error_code="worktree_unsupported_change_type",
    )
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
    base = git(["rev-parse", "HEAD"])

    # Сначала лиза, потом каталог: если задача уже занята, ничего не создаём.
    claim_rc = agent_log.main([
        "delegate-claim", "--task-id", args.task_id, "--role", args.role,
        "--agent-id", agent_id, "--worktree", str(wt),
        "--base-sha", base,
        *(["--reason", args.reason] if args.reason else []),
        *(["--lease-sec", str(args.lease_sec)] if args.lease_sec else []),
        *(["--parallel-group", args.parallel_group] if args.parallel_group else []),
    ])
    if claim_rc != 0:
        return claim_rc

    with agent_log.Registry(rd) as reg:
        claim = reg.claims.get(agent_id)
        if claim is None:
            print(f"delegate_worktree: claim {agent_id!r} исчез после открытия", file=sys.stderr)
            return 2
        identity = _claim_identity(claim)

    try:
        with AllocLock():
            wt.parent.mkdir(parents=True, exist_ok=True)
            # --detach: делегату не нужна именованная ветка, а detached HEAD
            # исключает случайный захват ветки, на которой сидит основное дерево.
            git(["worktree", "add", "--detach", str(wt), base])
            (wt / ".delegate-base").write_text(base, encoding="utf-8")
            _identity_marker_path(wt).write_text(
                json.dumps(identity, ensure_ascii=False, sort_keys=True),
                encoding="utf-8",
            )
    except (OSError, RuntimeError):
        # Claim first, worktree second: a failed git allocation must consume
        # an explicit infrastructure attempt immediately, not remain
        # ``running`` until the lease expires.  Do not attempt force cleanup;
        # a partially-created path is evidence for the operator to inspect.
        release_rc = agent_log.main([
            "delegate-release", "--agent-id", agent_id, "--status", "failed",
            "--result-class", "infrastructure_failure",
            "--error-code", "worktree_add_failed",
            "--note", "не удалось создать worktree",
        ])
        if release_rc != 0:
            return release_rc
        pipeline_log.append_event(rd, {
            "kind": "anomaly", "anomaly_kind": "worktree_add_failed",
            "actor": agent_id, "severity": "error",
            "detail": "worktree не создан после выдачи lease",
            "error_code": "worktree_add_failed",
        })
        print(json.dumps({
            "opened": False,
            "error": "worktree_add_failed",
            "error_code": "worktree_add_failed",
            "worktree": str(wt),
            "claim_released": True,
        }, ensure_ascii=False, indent=1))
        return 2

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
    removed = False
    with IntegrationLock():
        # Keep the registry lock for the whole close. A heartbeat/release
        # cannot invalidate the lease between the final check and apply.
        with agent_log.Registry(rd) as reg:
            claim = reg.claims.get(args.agent_id)
            if claim is None:
                print(f"delegate_worktree: неизвестный agent_id {args.agent_id!r}", file=sys.stderr)
                return 2
            try:
                wt = _validate_claim(args, rd, claim)
            except CloseValidationError as exc:
                payload: dict[str, Any] = {
                    "merged": False, "error": exc.error_code,
                    "error_code": exc.error_code, "reason": exc.reason,
                    **exc.details,
                }
                print(json.dumps(payload, ensure_ascii=False, indent=1))
                return (
                    7
                    if exc.error_code == agent_log.TERMINATION_UNCONFIRMED_ERROR_CODE
                    else 2
                )
            if not wt.is_dir():
                print(f"delegate_worktree: каталог {wt} отсутствует", file=sys.stderr)
                return 2
            try:
                _validate_identity_marker(claim, wt)
            except CloseValidationError as exc:
                _release_claim_locked(
                    reg, rd, args.agent_id, "failed",
                    note=f"close отклонён: {exc.reason}",
                    error_code=exc.error_code,
                )
                print(json.dumps({
                    "merged": False, "error": exc.error_code,
                    "error_code": exc.error_code, "reason": exc.reason,
                    "worktree": str(wt), **exc.details,
                }, ensure_ascii=False, indent=1))
                return 2

            try:
                base = _canonical_base(claim, wt)
            except CloseValidationError as exc:
                _release_claim_locked(
                    reg, rd, args.agent_id, "failed",
                    note=f"close отклонён: {exc.reason}",
                    error_code=exc.error_code,
                )
                payload = {
                    "merged": False, "error": exc.error_code,
                    "error_code": exc.error_code, "reason": exc.reason,
                    "worktree": str(wt), **exc.details,
                }
                print(json.dumps(payload, ensure_ascii=False, indent=1))
                return 2

            try:
                tracked, untracked = changed_paths(wt, base)
                untracked.discard(".delegate-base")
                touched = sorted(tracked | untracked)
            except RuntimeError as exc:
                _release_claim_locked(
                    reg, rd, args.agent_id, "failed",
                    note=f"не удалось построить change-set: {exc}",
                    error_code="worktree_apply_failed",
                )
                print(json.dumps({
                    "merged": False, "error": "worktree_apply_failed",
                    "error_code": "worktree_apply_failed",
                    "reason": "change-set validation failed",
                    "detail": str(exc), "worktree": str(wt),
                }, ensure_ascii=False, indent=1))
                return 2

            allowed = set(args.allow or [])
            violations = [p for p in touched if p not in allowed]
            if violations:
                pipeline_log.append_event(rd, {
                    "kind": "anomaly", "anomaly_kind": "worktree_path_violation",
                    "actor": args.agent_id, "severity": "error",
                    "detail": f"делегат изменил {len(violations)} путей вне разрешённых",
                    "evidence": json.dumps(violations[:40], ensure_ascii=False),
                })
                _release_claim_locked(
                    reg, rd, args.agent_id, "failed",
                    note="изменены пути вне allowlist, результат не влит",
                    error_code="worktree_path_violation",
                )
                print(json.dumps({
                    "merged": False, "error": "worktree_path_violation",
                    "error_code": "worktree_path_violation", "reason": "path_violation",
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
                return _report_unsupported_change_type(
                    rd, args.agent_id, wt, unsupported, reg,
                )

            # This is the complete validation/plan phase. No ROOT file or
            # index has been touched before this point, and every conflict is
            # collected before phase 2 can start.
            conflicts = [
                change.path for change in changes
                if main_states[change.path] != change.base
            ]
            change_types = {change.path: change.change_type for change in changes}
            if conflicts:
                pipeline_log.append_event(rd, {
                    "kind": "anomaly", "anomaly_kind": "worktree_conflict",
                    "actor": args.agent_id, "severity": "error",
                    "detail": "целевые файлы изменились в основном дереве, пока делегат работал",
                    "evidence": json.dumps(conflicts, ensure_ascii=False),
                })
                _release_claim_locked(
                    reg, rd, args.agent_id, "failed",
                    note=f"конфликтов: {len(conflicts)}",
                    error_code="worktree_conflict",
                )
                print(json.dumps({
                    "merged": False, "paths": [], "conflicts": conflicts,
                    "commit": None, "worktree_removed": False,
                    "change_types": change_types, "worktree": str(wt),
                }, ensure_ascii=False, indent=1))
                return 2

            if not changes:
                _release_claim_locked(
                    reg, rd, args.agent_id, args.status,
                    note="влито путей: 0",
                )
                # There is no transaction to roll back. Preserve the old
                # cleanup behavior for an unchanged delegate worktree.
                success = {"paths": [], "conflicts": [], "commit": None,
                           "change_types": change_types}
            else:
                try:
                    index_before = _index_snapshot()
                except (OSError, RuntimeError) as exc:
                    _release_claim_locked(
                        reg, rd, args.agent_id, "failed",
                        note=f"не удалось сохранить index: {exc}",
                        error_code="worktree_apply_failed",
                    )
                    print(json.dumps({
                        "merged": False, "error": "worktree_apply_failed",
                        "error_code": "worktree_apply_failed",
                        "reason": "cannot snapshot git index",
                        "detail": str(exc), "worktree": str(wt),
                    }, ensure_ascii=False, indent=1))
                    return 2

                applied: list[str] = []
                created_dirs: set[Path] = set()
                try:
                    for change in changes:
                        _apply_change(change, created_dirs)
                        applied.append(change.path)
                    git(["add", "--", *applied], cwd=ROOT)
                except (OSError, RuntimeError) as exc:
                    rollback_errors = _rollback_transaction(
                        main_states, index_before, created_dirs,
                    )
                    error_code = (
                        "worktree_rollback_failed" if rollback_errors
                        else "worktree_apply_failed"
                    )
                    _release_claim_locked(
                        reg, rd, args.agent_id, "failed",
                        note=f"ошибка применения: {exc}", error_code=error_code,
                    )
                    print(json.dumps({
                        "merged": False, "paths": [], "applied_paths": applied,
                        "conflicts": [], "commit": None, "error": error_code,
                        "error_code": error_code, "detail": str(exc),
                        "rollback_errors": rollback_errors, "worktree": str(wt),
                        "change_types": change_types,
                    }, ensure_ascii=False, indent=1))
                    return 2

                commit_sha: str | None = None
                if not args.no_commit:
                    role = claim.get("role") or "делегат"
                    msg = (f"{role}: результат делегата {args.agent_id}\n\n"
                           f"Задача: {claim.get('task_id')}\n"
                           f"Worktree: {wt}\nБаза: {base}\n"
                           f"Влито путей: {len(applied)}\n")
                    try:
                        proc = subprocess.run(
                            ["git", "commit", "-m", msg, "--", *applied],
                            cwd=str(ROOT), capture_output=True, text=True,
                        )
                    except OSError as exc:
                        proc = None
                        detail = str(exc)
                    else:
                        raw_detail = proc.stderr or proc.stdout or "git commit failed"
                        detail = (
                            os.fsdecode(raw_detail) if isinstance(raw_detail, bytes)
                            else str(raw_detail)
                        ).strip()
                    if proc is None or proc.returncode != 0:
                        rollback_errors = _rollback_transaction(
                            main_states, index_before, created_dirs,
                        )
                        error_code = (
                            "worktree_rollback_failed" if rollback_errors
                            else "worktree_commit_failed"
                        )
                        _release_claim_locked(
                            reg, rd, args.agent_id, "failed",
                            note=(
                                "git commit завершился с кодом "
                                f"{proc.returncode if proc is not None else 'exec-error'}"
                            ),
                            error_code=error_code,
                        )
                        print(json.dumps({
                            "merged": False, "paths": [], "applied_paths": applied,
                            "conflicts": [], "commit": None, "error": error_code,
                            "error_code": error_code, "detail": detail,
                            "rollback_errors": rollback_errors, "worktree": str(wt),
                            "change_types": change_types,
                        }, ensure_ascii=False, indent=1))
                        return 2
                    # A successful commit is a point of no return for ROOT;
                    # only failures before it enter the rollback path.
                    commit_sha = git(["rev-parse", "HEAD"], cwd=ROOT)

                _release_claim_locked(
                    reg, rd, args.agent_id, args.status,
                    note=f"влито путей: {len(applied)}",
                )
                success = {"paths": applied, "conflicts": [],
                           "commit": commit_sha, "change_types": change_types}

        removed = _remove_worktree(wt)
        pipeline_log.append_event(rd, {
            "kind": "worktree_close", "actor": args.agent_id,
            "merged": bool(success["paths"]), "conflicts": success["conflicts"],
            "commit": success["commit"], "worktree_removed": removed,
        })
        print(json.dumps({
            "merged": bool(success["paths"]), "paths": success["paths"],
            "conflicts": success["conflicts"], "commit": success["commit"],
            "worktree_removed": removed, "change_types": success["change_types"],
        }, ensure_ascii=False, indent=1))
        return 0


def _remove_worktree(wt: Path, *, allow_force_cleanup: bool = False) -> bool:
    """Убрать worktree делегата.

    `git worktree remove` без --force намеренно: если внутри осталось что-то
    незапланированное, каталог должен пережить уборку и дождаться человека.
    Потерять чужие файлы молча — это ровно то, чем кончился инцидент. Перед
    обычным удалением успешного close убирается только служебный marker,
    созданный `open`. Force cleanup — отдельный GC-only режим, который
    разрешается только после положительного доказательства полного успешного
    close.
    """
    with AllocLock():
        marker = wt / ".delegate-base"
        try:
            marker_info = marker.lstat()
        except FileNotFoundError:
            marker_info = None
        except OSError:
            return False
        if marker_info is not None:
            # Never follow or remove a replacement symlink/directory under a
            # service filename.  Such a path is not disposable metadata.
            if not stat.S_ISREG(marker_info.st_mode):
                return False
            try:
                marker.unlink()
            except OSError:
                return False
        try:
            git(["worktree", "remove", str(wt)])
            return True
        except RuntimeError:
            if allow_force_cleanup:
                try:
                    git(["worktree", "remove", "--force", str(wt)])
                    return wt.exists() is False
                except RuntimeError:
                    pass
            git(["worktree", "prune"], check=False)
            return wt.exists() is False


def cmd_abandon(args: argparse.Namespace) -> int:
    rd = run_dir()
    release_rc = agent_log.main([
        "delegate-release", "--agent-id", args.agent_id,
        "--status", "abandoned", "--note", args.note or "закрыт оператором",
    ])
    if release_rc != 0:
        # In particular, do not report a successful abandon when the release
        # was refused because an MCP timeout left the actor quarantined.
        return release_rc
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

    # Read every registry before removing anything from that run.  A missing
    # or invalid registry is not evidence that its worktrees are disposable.
    # Runs are independent safety domains, so quarantine only the affected
    # run; otherwise one old/corrupt registry would make unrelated valid
    # worktrees impossible to clean up forever.  The command still returns an
    # error if any run was quarantined.
    worktrees_by_run: dict[str, list[Path]] = {}
    claims_by_run: dict[str, dict[str, Any]] = {}
    invalid_runs: set[str] = set()
    for run_path in sorted(WORKTREES_ROOT.iterdir()):
        if not run_path.is_dir():
            continue
        worktrees = sorted(wt for wt in run_path.iterdir() if wt.is_dir())
        worktrees_by_run[run_path.name] = worktrees
        reg_path = pipeline_log.RUNS / run_path.name / "delegations.json"
        try:
            registry_exists = reg_path.is_file()
        except OSError:
            registry_exists = False
        if not registry_exists:
            invalid_runs.add(run_path.name)
            kept.extend(str(wt) for wt in worktrees)
            continue
        try:
            with agent_log.Registry(reg_path.parent) as reg:
                claims_by_run[run_path.name] = dict(reg.claims)
        except (agent_log.RegistryInvalidError, OSError):
            invalid_runs.add(run_path.name)
            kept.extend(str(wt) for wt in worktrees)

    candidates: list[tuple[Path, bool]] = []
    for run_name, worktrees in worktrees_by_run.items():
        if run_name in invalid_runs:
            continue
        registry = claims_by_run[run_name]
        for wt in worktrees:
            claim = registry.get(wt.name)
            if not isinstance(claim, dict):
                # Unknown/missing claims are explicitly kept.  GC needs
                # positive lifecycle evidence, never absence of evidence.
                kept.append(str(wt))
                continue
            if claim.get("agent_id") != wt.name:
                kept.append(str(wt))
                continue
            if agent_log.termination_unconfirmed(claim):
                # A timed-out actor may still mutate this worktree. Lease
                # expiry is not a safe deletion signal, so quarantine wins.
                kept.append(str(wt))
                continue

            removable = claim.get("state") in agent_log.TERMINAL_STATES
            if not removable and claim.get("state") == "running":
                try:
                    expires_at = float(claim["expires_at"])
                except (KeyError, TypeError, ValueError):
                    expires_at = math.inf
                removable = math.isfinite(expires_at) and now >= expires_at
            if not removable:
                # An unknown state or malformed expiry is ambiguous and must
                # survive this pass.
                kept.append(str(wt))
                continue
            allow_force_cleanup = False
            if (claim.get("state") == "ok"
                    and claim.get("result_class") == "success"
                    and re.fullmatch(
                        r"влито путей: [0-9]+",
                        str(claim.get("release_reason", "")),
                    )):
                registered = claim.get("worktree")
                if isinstance(registered, str) and registered:
                    try:
                        allow_force_cleanup = Path(registered).resolve() == wt.resolve()
                    except (OSError, RuntimeError):
                        allow_force_cleanup = False
            candidates.append((wt, allow_force_cleanup))

    for wt, allow_force_cleanup in candidates:
        if args.dry_run:
            removed.append(str(wt))
        elif _remove_worktree(wt, allow_force_cleanup=allow_force_cleanup):
            removed.append(str(wt))
        else:
            kept.append(str(wt))
    print(json.dumps({"removed": removed, "kept": kept,
                      "dry_run": bool(args.dry_run),
                      **({
                          "error": agent_log.REGISTRY_INVALID_ERROR_CODE,
                          "error_code": agent_log.REGISTRY_INVALID_ERROR_CODE,
                      } if invalid_runs else {})},
               ensure_ascii=False, indent=1))
    return 2 if invalid_runs else 0


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
    c.add_argument("--task-id", default=None,
                   help="optional identity binding for the registered claim")
    c.add_argument("--role", default=None,
                   help="optional identity binding for the registered claim")
    c.add_argument("--attempt", type=int, default=None,
                   help="optional identity binding for the registered claim")
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
    try:
        return {"open": cmd_open, "close": cmd_close, "abandon": cmd_abandon,
                "list": cmd_list, "gc": cmd_gc}[args.cmd](args)
    except agent_log.RegistryInvalidError:
        print(json.dumps({
            "error": agent_log.REGISTRY_INVALID_ERROR_CODE,
            "error_code": agent_log.REGISTRY_INVALID_ERROR_CODE,
        }, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
