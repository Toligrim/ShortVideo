#!/usr/bin/env python3
"""Deterministic host-side preflight for the Codex sandbox.

The production entrypoint must run this check before it spends model tokens or
opens a delegate worktree.  The check deliberately follows the executable
selected by ``PATH`` and the resource directory next to that executable; a
system ``bwrap`` or a different Codex installation is not a valid substitute.

stdout is one JSON object.  The process exits zero only for ``ok`` and exits
one for every reported failure.  No environment variables or command output
other than the bounded version/stderr fields are emitted.
"""
from __future__ import annotations

import errno
import json
import os
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Iterable


SMOKE_TIMEOUT_SECONDS = 10.0
SMOKE_SEQUENTIAL_COUNT = 10
SMOKE_PARALLEL_COUNT = 3
VERSION_TIMEOUT_SECONDS = 5.0
MAX_STDERR_CHARS = 2_048

ERROR_CLASSES = {
    "ok",
    "codex_not_found",
    "vendored_bwrap_not_found",
    "bwrap_userns_denied",
    "bwrap_rtm_newaddr",
    "bwrap_unknown_failure",
}


def _truncate(value: str | None, limit: int = MAX_STDERR_CHARS) -> str:
    """Return bounded diagnostic text without exposing an entire stream."""

    if not value:
        return ""
    value = value.strip()
    if len(value) <= limit:
        return value
    return value[:limit] + "...[truncated]"


def resolve_codex() -> Path | None:
    """Resolve the first ``codex`` selected by the current process PATH."""

    selected = shutil.which("codex")
    if not selected:
        return None
    try:
        return Path(selected).resolve(strict=True)
    except OSError:
        # ``which`` found a path, but a concurrently removed/broken symlink is
        # still a not-found condition from the doctor's point of view.
        return None


def read_codex_version(codex_path: Path) -> tuple[str | None, str | None]:
    """Return (version, diagnostic) without invoking a model session."""

    try:
        proc = subprocess.run(
            [str(codex_path), "--version"],
            capture_output=True,
            text=True,
            errors="replace",
            timeout=VERSION_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return None, _truncate(str(exc))
    version = next((line.strip() for line in proc.stdout.splitlines() if line.strip()), None)
    if proc.returncode != 0:
        diagnostic = proc.stderr or proc.stdout
        return version, _truncate(diagnostic)
    return version, None


def _unique_paths(paths: Iterable[Path]) -> list[Path]:
    seen: set[str] = set()
    out: list[Path] = []
    for path in paths:
        key = os.path.normcase(str(path))
        if key in seen:
            continue
        seen.add(key)
        out.append(path)
    return out


def vendored_bwrap_candidates(codex_path: Path) -> list[Path]:
    """List bwrap paths belonging to the resolved Codex installation.

    Standalone releases keep ``bin/codex`` and ``codex-resources`` under the
    same release directory.  npm installations keep the platform package
    below ``node_modules/@openai/codex-linux-*/vendor/*``.  Walking ancestors
    keeps both layouts deterministic while never selecting an unrelated
    installation from PATH or from the user's home directory.
    """

    resolved = codex_path.resolve()
    candidates: list[Path] = [
        resolved.parent.parent / "codex-resources" / "bwrap",
        resolved.parent / "codex-resources" / "bwrap",
    ]
    for ancestor in (resolved, *resolved.parents):
        candidates.extend(
            sorted(
                ancestor.glob(
                    "node_modules/@openai/codex-linux-*/vendor/*/codex-resources/bwrap"
                )
            )
        )
        # A few npm launchers resolve directly into a platform package.
        candidates.extend(sorted(ancestor.glob("vendor/*/codex-resources/bwrap")))
    return _unique_paths(candidates)


def resolve_vendored_bwrap(codex_path: Path) -> Path | None:
    """Return the first existing bwrap belonging to ``codex_path``."""

    for candidate in vendored_bwrap_candidates(codex_path):
        if candidate.is_file():
            try:
                return candidate.resolve(strict=True)
            except OSError:
                continue
    return None


def classify_smoke(exit_code: int | None, stderr: str, timed_out: bool = False) -> str:
    """Map only host-observable smoke-test facts to the required classes."""

    if timed_out:
        return "bwrap_unknown_failure"
    if exit_code == 0:
        return "ok"
    lowered = stderr.lower()
    if "rtm_newaddr" in lowered:
        return "bwrap_rtm_newaddr"
    if (
        "operation not permitted" in lowered
        or "permission denied" in lowered
        or "user namespace" in lowered
        or "unshare" in lowered and "not permitted" in lowered
    ):
        return "bwrap_userns_denied"
    return "bwrap_unknown_failure"


def run_smoke(bwrap_path: Path) -> dict[str, Any]:
    """Run the same user+network namespace probe used by production."""

    command = [
        str(bwrap_path),
        "--unshare-net",
        "--unshare-user",
        "--uid",
        "0",
        "--gid",
        "0",
        "--dev-bind",
        "/",
        "/",
        "--",
        "true",
    ]
    started = time.monotonic()
    try:
        proc = subprocess.run(
            command,
            capture_output=True,
            text=True,
            errors="replace",
            timeout=SMOKE_TIMEOUT_SECONDS,
            check=False,
        )
        elapsed_ms = round((time.monotonic() - started) * 1_000)
        stderr = _truncate(proc.stderr)
        return {
            "smoke_exit_code": proc.returncode,
            "smoke_stderr": stderr,
            "stderr": stderr,
            "smoke_elapsed_ms": elapsed_ms,
            "error_class": classify_smoke(proc.returncode, proc.stderr),
        }
    except subprocess.TimeoutExpired as exc:
        elapsed_ms = round((time.monotonic() - started) * 1_000)
        stderr_value = exc.stderr
        if isinstance(stderr_value, bytes):
            stderr_value = stderr_value.decode(errors="replace")
        stderr = _truncate(stderr_value)
        return {
            "smoke_exit_code": 124,
            "smoke_stderr": stderr,
            "stderr": stderr,
            "smoke_elapsed_ms": elapsed_ms,
            "error_class": classify_smoke(124, stderr, timed_out=True),
        }
    except OSError as exc:
        elapsed_ms = round((time.monotonic() - started) * 1_000)
        stderr = _truncate(str(exc))
        return {
            "smoke_exit_code": None,
            "smoke_stderr": stderr,
            "stderr": stderr,
            "smoke_elapsed_ms": elapsed_ms,
            "error_class": (
                "bwrap_userns_denied"
                if exc.errno in {errno.EPERM, errno.EACCES}
                else "bwrap_unknown_failure"
            ),
        }


def run_smoke_suite(bwrap_path: Path) -> dict[str, Any]:
    """Run the deterministic probe repeatedly, including a parallel batch.

    A single successful probe is useful, but it would not catch the class of
    regression that only appears when several namespace creations overlap.
    Keep the probe itself small and make the suite bounded: thirteen short
    child processes, each with the same timeout and no model invocation.
    """

    started = time.monotonic()
    sequential = [run_smoke(bwrap_path) for _ in range(SMOKE_SEQUENTIAL_COUNT)]
    with ThreadPoolExecutor(max_workers=SMOKE_PARALLEL_COUNT) as executor:
        parallel = list(
            executor.map(
                run_smoke,
                [bwrap_path] * SMOKE_PARALLEL_COUNT,
            )
        )

    outcomes = sequential + parallel
    failures = [outcome for outcome in outcomes if outcome.get("smoke_exit_code") != 0]
    first_failure = failures[0] if failures else None
    stderr_values = [
        str(outcome.get("smoke_stderr") or "")
        for outcome in failures
        if outcome.get("smoke_stderr")
    ]
    stderr = _truncate("\n".join(dict.fromkeys(stderr_values)))
    exit_codes = [outcome.get("smoke_exit_code") for outcome in outcomes]
    aggregate_exit = 0
    if first_failure is not None:
        aggregate_exit = first_failure.get("smoke_exit_code")
        if aggregate_exit is None:
            aggregate_exit = 1

    return {
        "smoke_exit_code": aggregate_exit,
        "smoke_stderr": stderr,
        "stderr": stderr,
        "smoke_elapsed_ms": round((time.monotonic() - started) * 1_000),
        "smoke_sequential_count": SMOKE_SEQUENTIAL_COUNT,
        "smoke_parallel_count": SMOKE_PARALLEL_COUNT,
        "smoke_exit_codes": exit_codes,
        "error_class": (
            first_failure.get("error_class", "bwrap_unknown_failure")
            if first_failure is not None
            else "ok"
        ),
    }


def doctor() -> dict[str, Any]:
    """Collect the complete, bounded machine-readable preflight result."""

    result: dict[str, Any] = {
        "codex_version": None,
        "codex_path": None,
        "bwrap_path": None,
        "smoke_exit_code": None,
        "smoke_stderr": "",
        "stderr": "",
        "smoke_elapsed_ms": None,
        "smoke_timeout_seconds": SMOKE_TIMEOUT_SECONDS,
        "error_class": "bwrap_unknown_failure",
    }

    codex_path = resolve_codex()
    if codex_path is None:
        result["error_class"] = "codex_not_found"
        return result
    result["codex_path"] = str(codex_path)

    version, version_diagnostic = read_codex_version(codex_path)
    result["codex_version"] = version
    if version is None:
        result["stderr"] = version_diagnostic or "codex --version failed"
        result["smoke_stderr"] = result["stderr"]
        result["error_class"] = "bwrap_unknown_failure"
        return result

    bwrap_path = resolve_vendored_bwrap(codex_path)
    if bwrap_path is None or not bwrap_path.is_file() or not os.access(bwrap_path, os.X_OK):
        if bwrap_path is not None:
            result["bwrap_path"] = str(bwrap_path)
        result["error_class"] = "vendored_bwrap_not_found"
        return result
    result["bwrap_path"] = str(bwrap_path)
    result.update(run_smoke_suite(bwrap_path))
    return result


def main() -> int:
    try:
        result = doctor()
    except Exception as exc:  # noqa: BLE001 — stdout must stay machine-readable
        result = {
            "codex_version": None,
            "codex_path": None,
            "bwrap_path": None,
            "smoke_exit_code": None,
            "smoke_stderr": _truncate(str(exc)),
            "stderr": _truncate(str(exc)),
            "smoke_elapsed_ms": None,
            "smoke_timeout_seconds": SMOKE_TIMEOUT_SECONDS,
            "error_class": "bwrap_unknown_failure",
        }
    # Keep stdout exactly one JSON document so shell callers can safely save
    # and parse it even when the doctor exits non-zero.
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0 if result.get("error_class") == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
