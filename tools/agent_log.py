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
    agent_log.py delegate-start   --agent-id A
    agent_log.py delegate-result  --agent-id A --result-class CLASS [--error-code CODE]
    agent_log.py delegate-release --agent-id A --status ok|failed|abandoned
    agent_log.py delegate-status  [--json]
    agent_log.py action           --actor A --kind KIND [--name N] [--input ...]
    agent_log.py anomaly          --kind KIND --detail ... [--actor A]

Коды выхода:
    0  успех
    2  ошибка использования
    4  задача уже занята живой лизой (delegate-claim) — НЕ ошибка вызова,
       а штатный отказ, который оркестратор обязан обработать
    5  неизвестный agent_id (release/heartbeat/start/result)
    7  infrastructure budget/circuit breaker отказал в новой попытке
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
REGISTRY_VERSION = 2

TERMINAL_STATES = {"ok", "failed", "abandoned", "denied"}

RESULT_CLASSES = {
    "success",
    "semantic_failure",
    "infrastructure_failure",
    "control_plane_failure",
    "policy_failure",
}

INFRASTRUCTURE_ERROR_CODES = {
    "codex_sandbox_unavailable",
    "mcp_transport_timeout",
    "delegate_startup_timeout",
    "model_unavailable",
    "worktree_missing",
    "worktree_not_visible",
    "infrastructure_budget_exhausted",
}

CONTROL_PLANE_ERROR_CODES = {
    "mcp_invocation_invalid",
}

POLICY_ERROR_CODES = {
    "role_not_allowed",
    "policy_config_invalid",
    "policy_violation",
    "worktree_path_violation",
    "worktree_conflict",
    "worktree_unsupported_change_type",
    "worktree_base_missing",
    "worktree_base_invalid",
    "worktree_base_mismatch",
    "worktree_lease_invalid",
    "worktree_lease_expired",
    "worktree_lease_identity_mismatch",
    "worktree_commit_failed",
    "worktree_apply_failed",
    "worktree_rollback_failed",
    "task_already_claimed",
}

# A retry budget is intentionally separate from the semantic attempt count.
# Two identical infrastructure errors open the circuit early; three different
# infrastructure failures are the absolute maximum for one task.
MAX_INFRASTRUCTURE_ATTEMPTS = 3
INFRASTRUCTURE_CIRCUIT_REPEAT = 2


def infrastructure_backoff_seconds(completed_attempts: int) -> int:
    """Return the bounded delay recommended before the next infra retry.

    The CLI reports this value to the orchestrator; sleeping is left to the
    caller so a telemetry command never holds the registry lock.  The circuit
    breaker remains authoritative when the same deterministic error repeats.
    """

    if completed_attempts <= 0:
        return 0
    return min(8, 2 ** (completed_attempts - 1))


def validate_result(result_class: str, error_code: str | None) -> None:
    """Validate machine-readable result metadata before it reaches the log."""

    if result_class not in RESULT_CLASSES:
        raise ValueError(f"unknown result class: {result_class}")
    if result_class == "infrastructure_failure":
        if error_code not in INFRASTRUCTURE_ERROR_CODES:
            raise ValueError(f"invalid infrastructure error code: {error_code}")
    elif result_class == "control_plane_failure":
        if error_code not in CONTROL_PLANE_ERROR_CODES:
            raise ValueError(f"invalid control-plane error code: {error_code}")
    elif result_class == "policy_failure":
        if error_code not in POLICY_ERROR_CODES:
            raise ValueError(f"invalid policy error code: {error_code}")


def default_result_for_status(status: str, started: bool = False) -> tuple[str, str | None]:
    """Choose a safe compatibility classification when old callers omit it."""

    if status == "ok":
        # An old close caller may not have marked the delegate as started.  It
        # may retain status=ok for compatibility, but it must not create a
        # semantic attempt without observable start evidence.
        return "success", None
    if status == "abandoned":
        return (
            "infrastructure_failure",
            "mcp_transport_timeout" if started else "delegate_startup_timeout",
        )
    # Old close/status=failed calls are deliberately conservative.  A semantic
    # failure must now be supplied explicitly by delegate-result; free notes
    # cannot decide whether a worktree conflict or an LLM failure occurred.
    return "policy_failure", "policy_violation"


def task_counters(claims: dict[str, Any], task_id: str) -> tuple[int, int, list[str]]:
    """Return (semantic attempts, infrastructure attempts, infra error codes)."""

    semantic = 0
    infrastructure = 0
    codes: list[str] = []
    for claim in claims.values():
        if claim.get("task_id") != task_id:
            continue
        if claim.get("semantic_counted"):
            semantic += 1
        elif claim.get("result_class") in {"success", "semantic_failure"}:
            # Count old successful records only when their status proves the
            # delegate actually completed; old failed/no-start records are not
            # semantic attempts.
            if claim.get("state") == "ok" and claim.get("delegate_started", True):
                semantic += 1
        if claim.get("infrastructure_counted") or claim.get("result_class") == "infrastructure_failure":
            infrastructure += 1
            if claim.get("error_code"):
                codes.append(str(claim["error_code"]))
    return semantic, infrastructure, codes


def infrastructure_circuit_open(claims: dict[str, Any], task_id: str) -> tuple[bool, str | None]:
    _, count, codes = task_counters(claims, task_id)
    if count >= MAX_INFRASTRUCTURE_ATTEMPTS:
        return True, "infrastructure_budget_exhausted"
    if len(codes) >= INFRASTRUCTURE_CIRCUIT_REPEAT and codes[-1] == codes[-2]:
        return True, "infrastructure_budget_exhausted"
    return False, None


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
        self.data["version"] = REGISTRY_VERSION
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
                task_id = claim.get("task_id")
                _, infrastructure_before, _ = task_counters(self.claims, task_id)
                claim["state"] = "abandoned"
                claim["released_at"] = now
                claim["release_reason"] = "lease_expired"
                claim["result_class"] = "infrastructure_failure"
                claim["error_code"] = "delegate_startup_timeout"
                claim["infrastructure_attempt"] = infrastructure_before + 1
                claim["infrastructure_counted"] = True
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
        semantic_attempts, infrastructure_attempts, _ = task_counters(
            reg.claims, args.task_id
        )
        emit(run_dir, {
            "kind": "delegate_requested", "actor": agent_id,
            "task_id": args.task_id, "role": args.role,
            "phase": "claim", "semantic_attempt": semantic_attempts,
            "infrastructure_attempt": infrastructure_attempts + 1,
            "worktree_path": args.worktree,
        })
        for stale in reg.expire_stale(now):
            emit(run_dir, {
                "kind": "delegation_release", "actor": stale["agent_id"],
                "task_id": stale["task_id"], "status": "abandoned",
                "detail": "lease_expired",
                "result_class": "infrastructure_failure",
                "error_code": "delegate_startup_timeout",
                "infrastructure_attempt": stale.get("infrastructure_attempt"),
            })
        # Expiring stale claims above may have changed the counters.
        semantic_attempts, infrastructure_attempts, _ = task_counters(
            reg.claims, args.task_id
        )

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
                "result_class": "policy_failure",
                "error_code": "task_already_claimed",
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

        circuit_open, circuit_code = infrastructure_circuit_open(reg.claims, args.task_id)
        if circuit_open:
            emit(run_dir, {
                "kind": "delegation_denied", "actor": agent_id,
                "task_id": args.task_id, "role": args.role,
                "detail": "infrastructure_circuit_open",
                "result_class": "infrastructure_failure",
                "error_code": circuit_code,
                "infrastructure_attempt": infrastructure_attempts + 1,
            })
            print(json.dumps({
                "granted": False,
                "reason": "infrastructure_circuit_open",
                "task_id": args.task_id,
                "infrastructure_attempts": infrastructure_attempts,
                "semantic_attempts": semantic_attempts,
                "error_code": circuit_code,
            }, ensure_ascii=False, indent=1))
            return 7

        attempt = reg.attempts_for_task(args.task_id) + 1
        claim = {
            "agent_id": agent_id,
            "task_id": args.task_id,
            "role": args.role,
            "attempt": attempt,
            "state": "running",
            "base_sha": args.base_sha,
            "claimed_at": now,
            "expires_at": now + args.lease_sec,
            "heartbeat_at": now,
            "lease_sec": args.lease_sec,
            "parallel_group": args.parallel_group,
            "reason": args.reason,
            "worktree": args.worktree,
            "semantic_attempt": None,
            "infrastructure_attempt": infrastructure_attempts + 1,
            "semantic_counted": False,
            "infrastructure_counted": False,
            "delegate_started": False,
            "started_at": None,
            "pending_result_class": None,
            "pending_error_code": None,
            "pending_substantive_work": False,
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
        "semantic_attempt": semantic_attempts,
        "infrastructure_attempt": infrastructure_attempts + 1,
    })
    print(json.dumps({
        "granted": True, "agent_id": agent_id, "task_id": args.task_id,
        "role": args.role, "attempt": attempt,
        "semantic_attempt": semantic_attempts,
        "infrastructure_attempt": infrastructure_attempts + 1,
        "semantic_attempts": semantic_attempts,
        "infrastructure_attempts": infrastructure_attempts,
        "recommended_backoff_seconds": infrastructure_backoff_seconds(infrastructure_attempts),
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


def _claim_or_error(reg: Registry, agent_id: str) -> dict[str, Any] | None:
    claim = reg.claims.get(agent_id)
    if claim is None:
        print(f"agent_log: неизвестный agent_id {agent_id!r}", file=sys.stderr)
        return None
    return claim


def _claim_identity_matches(claim: dict[str, Any], args: argparse.Namespace) -> bool:
    """Optionally bind a lifecycle update to the claim being rendered.

    Older callers only supplied ``agent_id``; the new bridge also supplies the
    task, role, and claim attempt so an agent-id reuse cannot retarget a later
    lease during a slow MCP request.
    """

    for argument, field in (("task_id", "task_id"), ("role", "role"), ("attempt", "attempt")):
        expected = getattr(args, argument, None)
        if expected is not None and claim.get(field) != expected:
            return False
    return True


def cmd_delegate_start(args: argparse.Namespace) -> int:
    """Record the observable hand-off to the nested delegate.

    The generated JS bridge calls this immediately before the MCP request.  A
    semantic result is counted only when this marker exists, so a worktree
    opened for an invocation that never started cannot consume a semantic slot.
    """

    run_dir = resolve_run_dir()
    now = now_epoch()
    with Registry(run_dir) as reg:
        claim = _claim_or_error(reg, args.agent_id)
        if claim is None:
            return 5
        if not _claim_identity_matches(claim, args):
            print(f"agent_log: lease identity for {args.agent_id!r} changed", file=sys.stderr)
            return 5
        if claim.get("state") in TERMINAL_STATES or now >= claim.get("expires_at", 0):
            print(f"agent_log: lease для {args.agent_id!r} не активна", file=sys.stderr)
            return 5
        claim["delegate_started"] = True
        claim["started_at"] = now
        claim["heartbeat_at"] = now
        claim["expires_at"] = now + claim.get("lease_sec", DEFAULT_LEASE_SEC)
        reg.save()
        task_id = claim.get("task_id")
        role = claim.get("role")
        worktree = claim.get("worktree")
        base = claim.get("base_sha")
        infra_attempt = claim.get("infrastructure_attempt")
        semantic_attempt = claim.get("semantic_attempt")
    emit(run_dir, {
        "kind": "delegate_started", "actor": args.agent_id,
        "task_id": task_id, "role": role, "worktree_path": worktree,
        "base_sha": base, "phase": "mcp_handoff",
        "infrastructure_attempt": infra_attempt,
        "semantic_attempt": semantic_attempt,
        "observability": "caller_boundary",
    })
    print(json.dumps({
        "agent_id": args.agent_id, "delegate_started": True,
        "started_at": iso(now), "infrastructure_attempt": infra_attempt,
        "semantic_attempt": semantic_attempt,
    }, ensure_ascii=False))
    return 0


def cmd_delegate_result(args: argparse.Namespace) -> int:
    """Store a structured result before a legacy worktree close releases it."""

    try:
        validate_result(args.result_class, args.error_code)
    except ValueError as exc:
        print(f"agent_log: {exc}", file=sys.stderr)
        return 2

    run_dir = resolve_run_dir()
    now = now_epoch()
    with Registry(run_dir) as reg:
        claim = _claim_or_error(reg, args.agent_id)
        if claim is None:
            return 5
        if not _claim_identity_matches(claim, args):
            print(f"agent_log: lease identity for {args.agent_id!r} changed", file=sys.stderr)
            return 5
        if claim.get("state") in TERMINAL_STATES:
            print(f"agent_log: lease для {args.agent_id!r} уже закрыта", file=sys.stderr)
            return 5
        if args.result_class in {"success", "semantic_failure"} and not claim.get("delegate_started"):
            print(
                "agent_log: semantic result requires delegate-start evidence",
                file=sys.stderr,
            )
            return 2
        claim["pending_result_class"] = args.result_class
        claim["pending_error_code"] = args.error_code
        claim["pending_substantive_work"] = args.result_class in {"success", "semantic_failure"}
        reg.save()
        task_id = claim.get("task_id")
        role = claim.get("role")
        infra_attempt = claim.get("infrastructure_attempt")
        semantic_attempt = claim.get("semantic_attempt")
    emit(run_dir, {
        "kind": "delegate_result_classified", "actor": args.agent_id,
        "task_id": task_id, "role": role,
        "result_class": args.result_class, "error_code": args.error_code,
        "infrastructure_attempt": infra_attempt,
        "semantic_attempt": semantic_attempt,
        "phase": "result_classification",
    })
    print(json.dumps({
        "agent_id": args.agent_id, "result_class": args.result_class,
        "error_code": args.error_code,
    }, ensure_ascii=False))
    return 0


def release_claim_locked(
    reg: Registry,
    agent_id: str,
    status: str,
    *,
    result_class: str | None = None,
    error_code: str | None = None,
    note: str | None = None,
    thread_id: str | None = None,
    now: float | None = None,
) -> dict[str, Any] | None:
    """Release a claim while the caller already holds ``reg``'s lock.

    ``delegate_worktree.close`` needs to keep the registry lock across lease
    validation and the integration transaction.  Keeping the state mutation
    here avoids reopening the registry (and accidentally allowing a stale
    close to race a heartbeat or another lifecycle update).
    """

    now = now_epoch() if now is None else now
    claim = _claim_or_error(reg, agent_id)
    if claim is None:
        return None
    semantic_before, infrastructure_before, _ = task_counters(
        reg.claims, claim.get("task_id")
    )
    explicit_result = result_class is not None
    result_class = result_class or claim.get("pending_result_class")
    error_code = error_code or claim.get("pending_error_code")
    # The unchanged delegate_worktree.close CLI reports a merge/path
    # failure only through status=failed and a free note.  If a bridge had
    # already classified the nested MCP response as success, that pending
    # result must not hide the later deterministic policy failure.  An
    # explicit release classification still wins because it is the
    # structured caller contract.
    if not explicit_result and status == "failed" and result_class == "success":
        result_class, error_code = "policy_failure", "policy_violation"
    if not explicit_result and status == "abandoned" and result_class == "success":
        result_class, error_code = default_result_for_status(
            status, bool(claim.get("delegate_started"))
        )
    if result_class is None:
        result_class, error_code = default_result_for_status(
            status, bool(claim.get("delegate_started"))
        )
    validate_result(result_class, error_code)

    semantic_counted = (
        result_class in {"success", "semantic_failure"}
        and bool(claim.get("delegate_started"))
    )
    infrastructure_counted = result_class == "infrastructure_failure"
    claim["state"] = status
    claim["released_at"] = now
    claim["release_reason"] = note
    claim["result_class"] = result_class
    claim["error_code"] = error_code
    claim["semantic_counted"] = semantic_counted
    claim["infrastructure_counted"] = infrastructure_counted
    if semantic_counted:
        claim["semantic_attempt"] = semantic_before + 1
    if infrastructure_counted:
        claim["infrastructure_attempt"] = infrastructure_before + 1
    if thread_id:
        claim["thread_id"] = thread_id
    reg.save()
    task_id = claim.get("task_id")
    semantic_after, infrastructure_after, _ = task_counters(reg.claims, task_id)
    return {
        "claim": claim,
        "task_id": task_id,
        "role": claim.get("role"),
        "worktree": claim.get("worktree"),
        "base_sha": claim.get("base_sha"),
        "status": status,
        "note": note,
        "thread_id": thread_id,
        "result_class": result_class,
        "error_code": error_code,
        "semantic_counted": semantic_counted,
        "infrastructure_counted": infrastructure_counted,
        "semantic_after": semantic_after,
        "infrastructure_after": infrastructure_after,
        "held_sec": round(now - claim.get("claimed_at", now), 3),
    }


def cmd_delegate_release(args: argparse.Namespace) -> int:
    run_dir = resolve_run_dir()
    try:
        with Registry(run_dir) as reg:
            info = release_claim_locked(
                reg, args.agent_id, args.status,
                result_class=args.result_class,
                error_code=args.error_code,
                note=args.note,
                thread_id=args.thread_id,
            )
    except ValueError as exc:
        print(f"agent_log: {exc}", file=sys.stderr)
        return 2
    if info is None:
        return 5

    claim = info["claim"]
    emit(run_dir, {
        "kind": "delegation_release", "actor": args.agent_id,
        "task_id": info["task_id"], "status": info["status"],
        "detail": info["note"], "held_sec": info["held_sec"],
        "thread_id": info["thread_id"], "role": info["role"],
        "worktree_path": info["worktree"], "base_sha": info["base_sha"],
        "result_class": info["result_class"], "error_code": info["error_code"],
        "infrastructure_attempt": claim.get("infrastructure_attempt"),
        "semantic_attempt": claim.get("semantic_attempt"),
    })
    print(json.dumps({
        "agent_id": args.agent_id, "status": info["status"],
        "held_sec": info["held_sec"], "result_class": info["result_class"],
        "error_code": info["error_code"],
        "semantic_attempt": claim.get("semantic_attempt"),
        "infrastructure_attempt": claim.get("infrastructure_attempt"),
        "semantic_attempts": info["semantic_after"],
        "infrastructure_attempts": info["infrastructure_after"],
        "recommended_next_backoff_seconds": (
            infrastructure_backoff_seconds(info["infrastructure_after"])
            if info["infrastructure_counted"] else 0
        ),
        "semantic_counted": info["semantic_counted"],
        "infrastructure_counted": info["infrastructure_counted"],
    }, ensure_ascii=False))
    return 0


def cmd_delegate_status(args: argparse.Namespace) -> int:
    run_dir = resolve_run_dir()
    now = now_epoch()
    with Registry(run_dir) as reg:
        claims = list(reg.claims.values())

    live = [c for c in claims if c.get("state") not in TERMINAL_STATES
            and now < c.get("expires_at", 0)]
    if args.json:
        by_task: dict[str, dict[str, Any]] = {}
        for claim in claims:
            task_id = claim.get("task_id")
            if not task_id:
                continue
            semantic, infrastructure, codes = task_counters(
                {c.get("agent_id", str(i)): c for i, c in enumerate(claims)}, task_id
            )
            by_task[task_id] = {
                "semantic_attempts": semantic,
                "infrastructure_attempts": infrastructure,
                "infrastructure_budget": MAX_INFRASTRUCTURE_ATTEMPTS,
                "recommended_backoff_seconds": infrastructure_backoff_seconds(infrastructure),
                "last_infrastructure_error_codes": codes[-3:],
                "circuit_open": infrastructure_circuit_open(
                    {c.get("agent_id", str(i)): c for i, c in enumerate(claims)}, task_id
                )[0],
            }
        print(json.dumps({"run_dir": str(run_dir), "claims": claims,
                          "live": [c["agent_id"] for c in live],
                          "budgets": by_task}, ensure_ascii=False, indent=1))
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
        print(f"      semantic={c.get('semantic_attempt')} "
              f"infrastructure={c.get('infrastructure_attempt')} "
              f"result={c.get('result_class')} code={c.get('error_code')}")
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
    dc.add_argument("--base-sha", default=None,
                    help="canonical git baseline captured for this delegation")
    dc.add_argument("--parallel-group", default=None,
                    help="метка осознанной параллельности: разные task_id одной "
                         "группы допустимо гонять одновременно")
    dc.add_argument("--reason", default=None,
                    help="ЗАЧЕМ делегируется — попадает в рассказ о прогоне")
    dc.add_argument("--worktree", default=None)

    dh = sub.add_parser("delegate-heartbeat", help="продлить лизу живого делегата")
    dh.add_argument("--agent-id", required=True)
    dh.add_argument("--thread-id", default=None)

    dst = sub.add_parser("delegate-start", help="зафиксировать передачу задачи MCP-делегату")
    dst.add_argument("--agent-id", required=True)
    dst.add_argument("--task-id", default=None)
    dst.add_argument("--role", default=None)
    dst.add_argument("--attempt", type=int, default=None)

    dres = sub.add_parser("delegate-result", help="зафиксировать результат до close")
    dres.add_argument("--agent-id", required=True)
    dres.add_argument("--task-id", default=None)
    dres.add_argument("--role", default=None)
    dres.add_argument("--attempt", type=int, default=None)
    dres.add_argument("--result-class", required=True, choices=sorted(RESULT_CLASSES))
    dres.add_argument("--error-code", default=None)

    dr = sub.add_parser("delegate-release", help="закрыть лизу")
    dr.add_argument("--agent-id", required=True)
    dr.add_argument("--status", required=True, choices=["ok", "failed", "abandoned"])
    dr.add_argument("--result-class", choices=sorted(RESULT_CLASSES), default=None)
    dr.add_argument("--error-code", default=None)
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
        "delegate-start": cmd_delegate_start,
        "delegate-result": cmd_delegate_result,
        "delegate-release": cmd_delegate_release,
        "delegate-status": cmd_delegate_status,
        "action": cmd_action,
        "anomaly": cmd_anomaly,
    }
    return handlers[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())
