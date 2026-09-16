#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
import os
import re
import shlex
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from openrouter_base import ToolError
from openrouter_config import ROOT, ROLE_PROMPTS, role_config

class ControlMixin:
    def _trusted_bash(self, command: str, timeout_seconds: int) -> dict[str, Any] | None:
        try:
            argv = shlex.split(command)
        except ValueError:
            return None
        if len(argv) >= 4 and argv[:3] == ["python3", "tools/openrouter_harness.py", "internal-delegate"]:
            try:
                parser = argparse.ArgumentParser(add_help=False)
                parser.add_argument("--role", required=True)
                parser.add_argument("--slug", required=True)
                parser.add_argument("--task", required=True)
                ns = parser.parse_args(argv[3:])
            except SystemExit:
                return {"ok": False, "error": {"type": "invalid_delegate_command", "message": "use exact internal-delegate --role ROLE --slug SLUG --task TASK syntax", "retryable": False}}
            try:
                result = self.run_delegate(ns.role, ns.slug, ns.task)
                return {"ok": True, "data": result, "meta": {"trusted_control_plane": True}}
            except Exception as exc:
                return {"ok": False, "error": {"type": "delegate_failed", "message": f"{type(exc).__name__}: {exc}", "hint": "Inspect the structured worktree/delegate error before deciding whether to retry.", "retryable": False}}
        if len(argv) >= 4 and argv[0:2] == ["venv/bin/python", "tools/tts_scenes.py"]:
            return self._trusted_tts(argv)
        return None

    def _trusted_tts(self, argv: list[str]) -> dict[str, Any]:
        if any(token in {";", "&&", "||", "|", ">", ">>", "<"} for token in argv):
            raise ToolError("policy_denied", "TTS bridge accepts one command only", retryable=False)
        script = self.workspace / "tools" / "tts_scenes.py"
        if not script.is_file():
            raise ToolError("tts_bridge_invalid", "tools/tts_scenes.py is missing", retryable=False)
        status = subprocess.run(["git", "-C", str(self.workspace), "status", "--porcelain", "--", "tools/tts_scenes.py"], capture_output=True, text=True, timeout=10)
        if status.returncode != 0 or status.stdout.strip():
            raise ToolError("tts_bridge_dirty_code", "tools/tts_scenes.py has uncommitted changes; refusing networked execution", "Restore/commit trusted pipeline code before TTS.", False)
        env = {"PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"), "LANG": os.environ.get("LANG", "C.UTF-8"), "HOME": os.environ.get("HOME", str(Path.home()))}
        for key, value in os.environ.items():
            if key.startswith("GEMINI_") or key == "GOOGLE_API_KEY":
                env[key] = value
        started = time.monotonic()
        try:
            proc = subprocess.run(argv, cwd=str(self.workspace), env=env, capture_output=True, text=True, errors="replace", timeout=min(int(self.policy.get("timeout_seconds", 5400)), 3600))
        except subprocess.TimeoutExpired as exc:
            raise ToolError("tts_timeout", "Gemini TTS timed out", retryable=True) from exc
        return {"ok": proc.returncode == 0, "data": {"exit_code": proc.returncode, "stdout": proc.stdout[-20000:], "stderr": proc.stderr[-20000:], "wall_ms": int((time.monotonic() - started) * 1000)}, **({} if proc.returncode == 0 else {"error": {"type": "tts_failed", "message": f"tts_scenes.py exited {proc.returncode}", "retryable": True}})}

    def run_delegate(self, role: str, slug: str, task: str) -> dict[str, Any]:
        if role not in ROLE_PROMPTS:
            raise RuntimeError(f"role not allowed: {role}")
        if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{1,127}", slug):
            raise RuntimeError("invalid slug")
        timeout = int(self.policy.get("timeout_seconds", 5400))
        task_id = f"{role}:{slug}"
        open_cmd = [sys.executable, str(ROOT / "tools" / "delegate_worktree.py"), "open", "--task-id", task_id, "--role", role, "--reason", f"OpenRouter harness: {task[:300]}"]
        opened = subprocess.run(open_cmd, cwd=str(ROOT), capture_output=True, text=True, timeout=30)
        if opened.returncode != 0:
            raise RuntimeError(f"delegate_worktree open failed rc={opened.returncode}: {opened.stdout[-2000:]} {opened.stderr[-2000:]}")
        info = json.loads(opened.stdout)
        agent_id = str(info["agent_id"])
        worktree = Path(info["worktree"])
        base_sha = str(info["base"])
        started = subprocess.run([sys.executable, str(ROOT / "tools" / "agent_log.py"), "delegate-start", "--agent-id", agent_id, "--task-id", task_id, "--role", role], cwd=str(ROOT), capture_output=True, text=True, timeout=15)
        if started.returncode != 0:
            self._abandon_delegate(agent_id, "delegate-start failed")
            raise RuntimeError(f"delegate-start failed: {started.stdout} {started.stderr}")
        cfg = role_config(role, self.policy)
        nested = self.__class__(role=role, task=task, workspace=worktree, run_dir=self.run_dir, model=cfg["model"], effort=cfg["effort"], sandbox_policy=cfg["sandbox"], vision_model=cfg["vision_model"], policy=self.policy, deadline=time.monotonic() + timeout, actor_id=agent_id, task_id=task_id)
        try:
            result = nested.run()
        except TimeoutError:
            subprocess.run([sys.executable, str(ROOT / "tools" / "agent_log.py"), "delegate-result", "--agent-id", agent_id, "--task-id", task_id, "--role", role, "--result-class", "infrastructure_failure", "--error-code", "mcp_transport_timeout"], cwd=str(ROOT), capture_output=True, text=True, timeout=15)
            self._abandon_delegate(agent_id, "OpenRouter delegate timeout")
            raise
        except Exception as exc:
            subprocess.run([sys.executable, str(ROOT / "tools" / "agent_log.py"), "delegate-result", "--agent-id", agent_id, "--task-id", task_id, "--role", role, "--result-class", "semantic_failure"], cwd=str(ROOT), capture_output=True, text=True, timeout=15)
            self._abandon_delegate(agent_id, f"OpenRouter delegate failed: {type(exc).__name__}")
            raise
        finally:
            nested.close()
        classified = subprocess.run([sys.executable, str(ROOT / "tools" / "agent_log.py"), "delegate-result", "--agent-id", agent_id, "--task-id", task_id, "--role", role, "--result-class", "success"], cwd=str(ROOT), capture_output=True, text=True, timeout=15)
        if classified.returncode != 0:
            self._abandon_delegate(agent_id, "delegate-result classification failed")
            raise RuntimeError(f"delegate-result failed: {classified.stdout} {classified.stderr}")
        touched = self._delegate_changed_paths(worktree, base_sha)
        violations = [p for p in touched if not self._delegate_path_allowed(role, slug, p)]
        if violations:
            self._abandon_delegate(agent_id, "OpenRouter policy path violation")
            raise RuntimeError(f"delegate touched paths outside role policy: {violations}")
        allowed_for_close = touched or [self._harmless_allow(role, slug)]
        close_cmd = [sys.executable, str(ROOT / "tools" / "delegate_worktree.py"), "close", "--agent-id", agent_id, "--task-id", task_id, "--role", role, "--status", "ok"]
        for path in allowed_for_close:
            close_cmd += ["--allow", path]
        closed = subprocess.run(close_cmd, cwd=str(ROOT), capture_output=True, text=True, timeout=120)
        if closed.returncode != 0:
            raise RuntimeError(f"delegate_worktree close failed rc={closed.returncode}: {closed.stdout[-4000:]} {closed.stderr[-2000:]}")
        close_info = json.loads(closed.stdout)
        return {"role": role, "agent_id": agent_id, "status": "success", "text": result.text, "steps": result.steps, "estimated_tokens_at_end": result.estimated_tokens, "merged_paths": close_info.get("paths") or [], "commit": close_info.get("commit")}

    def _abandon_delegate(self, agent_id: str, note: str) -> None:
        subprocess.run([sys.executable, str(ROOT / "tools" / "delegate_worktree.py"), "abandon", "--agent-id", agent_id, "--note", note[:500]], cwd=str(ROOT), capture_output=True, text=True, timeout=30)

    @staticmethod
    def _delegate_changed_paths(worktree: Path, base_sha: str) -> list[str]:
        paths: set[str] = set()
        diff = subprocess.run(["git", "-C", str(worktree), "diff", "--name-only", base_sha, "HEAD"], capture_output=True, text=True, timeout=20)
        if diff.returncode != 0:
            raise RuntimeError(f"cannot inspect delegate commit diff: {diff.stderr}")
        paths.update(x.strip() for x in diff.stdout.splitlines() if x.strip())
        status = subprocess.run(["git", "-C", str(worktree), "status", "--porcelain", "-uall"], capture_output=True, text=True, timeout=20)
        if status.returncode != 0:
            raise RuntimeError(f"cannot inspect delegate status: {status.stderr}")
        for line in status.stdout.splitlines():
            if len(line) >= 4:
                raw = line[3:]
                if " -> " in raw:
                    raw = raw.split(" -> ", 1)[1]
                paths.add(raw.strip().strip('"'))
        paths.discard(".delegate-base")
        return sorted(paths)

    @staticmethod
    def _delegate_path_allowed(role: str, slug: str, path: str) -> bool:
        if role == "scriptwriter":
            return path == f"episodes/drafts/{slug}.draft.json"
        if role == "critic":
            return False
        if role == "animation-director":
            exact = {f"episodes/{slug}.json", "gap-scan.md", ".claude/skills/animator/catalog.md", ".claude/skills/animator/motion-catalog.md", "schema/scenes.schema.json", "docs/motion-engine.md"}
            return path in exact or path.startswith("video/src/")
        return False

    @staticmethod
    def _harmless_allow(role: str, slug: str) -> str:
        if role == "scriptwriter":
            return f"episodes/drafts/{slug}.draft.json"
        if role == "critic":
            return f"episodes/drafts/{slug}.draft.json"
        return f"episodes/{slug}.json"
