#!/usr/bin/env python3
from __future__ import annotations
import os
import subprocess
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from openrouter_base import (
    MAX_BASH_OUTPUT_CHARS, ToolError, _dangerous_command_reason,
    _ensure_parents_args, _ok, _resolve_git_paths, sanitized_child_env,
)
from openrouter_config import ROOT

class BubblewrapSandbox:
    def __init__(
        self,
        workspace: Path,
        scratch: Path,
        *,
        writable: bool,
        role: str,
        bwrap_path: str | None = None,
    ) -> None:
        self.workspace = workspace.resolve()
        self.scratch = scratch.resolve()
        self.writable = writable
        self.role = role
        self.bwrap = bwrap_path or os.environ.get("SHORTVIDEO_BWRAP") or shutil.which("bwrap")

    def _argv(self, command: str) -> list[str]:
        if not self.bwrap:
            raise ToolError(
                "sandbox_unavailable",
                "bubblewrap executable is not configured",
                "Run tools/openrouter_doctor.py and deploy the dedicated bwrap/AppArmor setup.",
                retryable=False,
            )
        self.scratch.mkdir(parents=True, exist_ok=True)
        (self.scratch / "home").mkdir(exist_ok=True)

        argv = [
            self.bwrap,
            "--die-with-parent",
            "--new-session",
            "--unshare-pid",
            "--unshare-net",
            "--unshare-ipc",
            "--unshare-uts",
            "--proc", "/proc",
            "--dev", "/dev",
        ]
        for host_path in ("/usr", "/bin", "/sbin", "/lib", "/lib64", "/etc", "/opt"):
            p = Path(host_path)
            if p.exists():
                argv += ["--ro-bind", host_path, host_path]

        argv += _ensure_parents_args(self.workspace)
        argv += ["--bind" if self.writable else "--ro-bind", str(self.workspace), str(self.workspace)]
        argv += ["--bind", str(self.scratch), "/tmp"]

        # Detached delegate worktrees never get their own `npm ci` (the model
        # shell has no network by design), so video/node_modules is simply
        # missing there and tsc/remotion have nothing to run. Share the
        # trusted supervisor's own install read-only instead of requiring
        # network access inside the sandbox. Skipped when the workspace IS
        # the main checkout (nothing to bind onto itself).
        src_node_modules = ROOT / "video" / "node_modules"
        dst_node_modules = self.workspace / "video" / "node_modules"
        if src_node_modules.is_dir() and (self.workspace / "video").is_dir() \
                and dst_node_modules.resolve() != src_node_modules.resolve():
            argv += _ensure_parents_args(dst_node_modules)
            argv += ["--ro-bind", str(src_node_modules), str(dst_node_modules)]
            # remotion/webpack unconditionally write their build cache under
            # node_modules/.cache (hardcoded, no env var override - see
            # @remotion/bundler's getWebpackCacheDir) and hang/error with
            # EROFS against the read-only bind above. Layer a private,
            # writable scratch directory over just that subpath, mirroring
            # the existing git_common/objects writable-overlay pattern below.
            webpack_cache = self.scratch / "webpack-cache"
            webpack_cache.mkdir(parents=True, exist_ok=True)
            cache_dst = dst_node_modules / ".cache"
            argv += _ensure_parents_args(cache_dst)
            argv += ["--bind", str(webpack_cache), str(cache_dst)]

        git_dir, git_common = _resolve_git_paths(self.workspace)
        if git_dir and git_common:
            if git_dir == git_common:
                if not self.writable:
                    argv += ["--ro-bind", str(git_common), str(git_common)]
            else:
                argv += _ensure_parents_args(git_common)
                argv += ["--ro-bind", str(git_common), str(git_common)]
                objects = git_common / "objects"
                if self.writable and objects.is_dir():
                    argv += ["--bind", str(objects), str(objects)]
                argv += _ensure_parents_args(git_dir)
                argv += [
                    "--bind" if self.writable else "--ro-bind",
                    str(git_dir), str(git_dir),
                ]

        publish_state = os.environ.get("SHORTVIDEO_PUBLISH_STATE_DIR", "").strip()
        if publish_state and self.role == "orchestrator":
            ps = Path(os.path.expanduser(publish_state)).resolve()
            if ps.exists():
                argv += _ensure_parents_args(ps)
                argv += ["--bind", str(ps), str(ps)]

        argv += [
            "--chdir", str(self.workspace),
            "--setenv", "HOME", "/tmp/home",
            "/bin/bash", "-lc", command,
        ]
        return argv

    def run(self, command: str, timeout_seconds: int) -> dict[str, Any]:
        reason = _dangerous_command_reason(command)
        if reason:
            raise ToolError(
                "policy_denied",
                reason,
                "Use the dedicated harness tools or a narrower non-destructive command.",
                retryable=False,
            )
        argv = self._argv(command)
        env = sanitized_child_env()
        started = time.monotonic()
        try:
            proc = subprocess.run(
                argv,
                cwd=str(self.workspace),
                env=env,
                capture_output=True,
                text=True,
                errors="replace",
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired as exc:
            raise ToolError(
                "command_timeout",
                f"command exceeded {timeout_seconds}s",
                "Narrow the command or inspect intermediate state before retrying.",
                retryable=True,
            ) from exc
        except OSError as exc:
            raise ToolError("command_start_failed", str(exc), retryable=False) from exc

        def cap(text: str) -> tuple[str, bool]:
            if len(text) <= MAX_BASH_OUTPUT_CHARS:
                return text, False
            half = MAX_BASH_OUTPUT_CHARS // 2
            return text[:half] + "\n...[deterministically truncated]...\n" + text[-half:], True

        stdout, out_tr = cap(proc.stdout)
        stderr, err_tr = cap(proc.stderr)
        return _ok({
            "exit_code": proc.returncode,
            "stdout": stdout,
            "stderr": stderr,
            "stdout_truncated": out_tr,
            "stderr_truncated": err_tr,
            "wall_ms": int((time.monotonic() - started) * 1000),
        })
