#!/usr/bin/env python3
from __future__ import annotations
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Callable

from openrouter_base import DEFAULT_READ_CHARS, DEFAULT_TOOL_TIMEOUT, IMAGE_SUFFIXES, MAX_READ_CHARS, TOOL_SCHEMAS, ToolError, _ok
from openrouter_sandbox import BubblewrapSandbox
from openrouter_web_cache import ExtractDiskCache, SearchMemo, cache_root, resolve_model_cache_path
from openrouter_web_extract import WebExtractor
from openrouter_web_search import WebSearcher


class ToolExecutor:
    def __init__(self, *, workspace: Path, scratch: Path, run_dir: Path, role: str, writable: bool, vision_callback: Callable[[Path], str] | None = None, trusted_bash_callback: Callable[[str, int], dict[str, Any] | None] | None = None) -> None:
        self.workspace = workspace.resolve()
        self.scratch = scratch.resolve()
        self.run_dir = run_dir.resolve()
        self.role = role
        self.writable = writable
        self.vision_callback = vision_callback
        self.trusted_bash_callback = trusted_bash_callback
        self.sandbox = BubblewrapSandbox(self.workspace, self.scratch, writable=writable, role=role)
        self.web_cache_root = cache_root()
        self.web_searcher = WebSearcher(SearchMemo(self.web_cache_root))
        self.web_extractor = WebExtractor(ExtractDiskCache(self.web_cache_root))

    def _tool_path(self, raw: str, *, allow_tmp: bool, for_write: bool = False) -> Path:
        if "\x00" in raw:
            raise ToolError("invalid_path", "NUL is not allowed in paths", retryable=False)
        if raw.startswith("@web-cache/"):
            if for_write:
                raise ToolError("policy_denied", "@web-cache is read-only", retryable=False)
            try:
                return resolve_model_cache_path(raw, self.web_cache_root)
            except (OSError, ValueError) as exc:
                raise ToolError("path_outside_workspace", "invalid @web-cache path", retryable=False) from exc
        if raw == "~/.claude/commands/tts.md":
            if for_write:
                raise ToolError("policy_denied", "the shared TTS dictionary is read-only", retryable=False)
            external = (Path.home() / ".claude" / "commands" / "tts.md").resolve()
            if not external.is_file():
                raise ToolError("file_not_found", "shared TTS dictionary is not installed", retryable=False)
            return external
        p = Path(raw)
        if for_write and not p.is_absolute() and p.parts and p.parts[0] == ".git":
            raise ToolError("policy_denied", "direct writes to .git metadata are forbidden", "Use ordinary non-destructive git commands through bash.", False)
        if p.is_absolute():
            if allow_tmp and (p == Path("/tmp") or str(p).startswith("/tmp/")):
                candidate, root = self.scratch / p.relative_to("/tmp"), self.scratch
            else:
                raise ToolError("path_outside_workspace", "absolute paths are limited to /tmp session scratch", retryable=False)
        else:
            candidate, root = self.workspace / p, self.workspace
        try:
            root_resolved = root.resolve()
            resolved = candidate.parent.resolve() / candidate.name if for_write and not candidate.exists() else candidate.resolve()
            resolved.relative_to(root_resolved)
        except (OSError, RuntimeError, ValueError) as exc:
            raise ToolError("path_outside_workspace", f"path escapes allowed root: {raw}", "Use a workspace-relative path; symlink escapes are rejected.", False) from exc
        return resolved

    @staticmethod
    def _bounded_chars(value: Any, default: int, max_value: int) -> int:
        if value is None:
            return default
        if isinstance(value, bool) or not isinstance(value, int):
            raise ToolError("invalid_arguments", "character budget must be an integer", retryable=False)
        return max(1, min(value, max_value))

    def call(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
        try:
            if name == "read_file": return self.read_file(args)
            if name == "write_file": return self.write_file(args)
            if name == "edit_file": return self.edit_file(args)
            if name == "grep": return self.grep(args)
            if name == "glob": return self.glob(args)
            if name == "bash": return self.bash(args)
            if name == "web_search": return self.web_search(args)
            if name == "web_fetch": return self.web_fetch(args)
            raise ToolError("unknown_tool", f"unknown tool {name!r}", retryable=False)
        except ToolError as exc:
            return exc.payload()
        except Exception as exc:
            return ToolError("internal_tool_error", f"{type(exc).__name__}: {exc}", "Do not retry identically; simplify the operation or report the failure.", False).payload()

    def read_file(self, args: dict[str, Any]) -> dict[str, Any]:
        path = self._tool_path(str(args["path"]), allow_tmp=True)
        if not path.is_file():
            raise ToolError("file_not_found", f"file does not exist: {args['path']}", retryable=False)
        if path.suffix.lower() in IMAGE_SUFFIXES:
            if not self.vision_callback:
                raise ToolError("vision_unavailable", "image inspection is not configured", retryable=False)
            return _ok({"kind": "image_analysis", "path": str(args["path"]), "analysis": self.vision_callback(path)})
        max_chars = self._bounded_chars(args.get("max_chars"), DEFAULT_READ_CHARS, MAX_READ_CHARS)
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise ToolError("binary_file", "file is not UTF-8 text and is not a supported image", "Use bash for deterministic metadata inspection, not raw binary dumping.", False) from exc
        lines = text.splitlines()
        start = int(args.get("start_line") or 1)
        end = int(args["end_line"]) if args.get("end_line") is not None else len(lines)
        if start < 1 or end < start:
            raise ToolError("invalid_arguments", "line range is invalid", retryable=False)
        selected = lines[start - 1:end]
        rendered = "\n".join(f"{i}: {line}" for i, line in enumerate(selected, start=start))
        truncated = len(rendered) > max_chars
        if truncated:
            rendered = rendered[:max_chars] + "\n...[deterministically truncated]..."
        return _ok({"path": str(args["path"]), "content": rendered, "start_line": start, "end_line": min(end, len(lines)), "total_lines": len(lines), "truncated": truncated})

    def _require_write(self) -> None:
        if not self.writable:
            raise ToolError("policy_denied", f"role {self.role} is read-only", "Return findings to the caller instead of modifying files.", False)

    def write_file(self, args: dict[str, Any]) -> dict[str, Any]:
        self._require_write()
        path = self._tool_path(str(args["path"]), allow_tmp=False, for_write=True)
        content = str(args["content"])
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(content); fh.flush(); os.fsync(fh.fileno())
            os.replace(temp_name, path)
        finally:
            try: os.unlink(temp_name)
            except FileNotFoundError: pass
        return _ok({"path": str(args["path"]), "bytes": len(content.encode("utf-8"))})

    def edit_file(self, args: dict[str, Any]) -> dict[str, Any]:
        self._require_write()
        path = self._tool_path(str(args["path"]), allow_tmp=False)
        if not path.is_file():
            raise ToolError("file_not_found", f"file does not exist: {args['path']}", retryable=False)
        old, new, text = str(args["old_text"]), str(args["new_text"]), path.read_text(encoding="utf-8")
        count = text.count(old)
        if count != 1:
            raise ToolError("edit_match_count", f"old_text matched {count} times; expected exactly 1", "Read a narrower surrounding span and retry with unique old_text.", False)
        return self.write_file({"path": str(args["path"]), "content": text.replace(old, new, 1)})

    def grep(self, args: dict[str, Any]) -> dict[str, Any]:
        query, base = str(args["query"]), self._tool_path(str(args.get("path") or "."), allow_tmp=False)
        limit = max(1, min(int(args.get("max_matches") or 80), 200))
        cmd = ["rg", "-n", "--no-heading", "--color", "never", "--", query, str(base)]
        if args.get("glob"):
            cmd = ["rg", "-n", "--no-heading", "--color", "never", "-g", str(args["glob"]), "--", query, str(base)]
        try:
            proc = subprocess.run(cmd, cwd=str(self.workspace), capture_output=True, text=True, errors="replace", timeout=20)
        except subprocess.TimeoutExpired as exc:
            raise ToolError("grep_timeout", "ripgrep exceeded 20s", retryable=True) from exc
        if proc.returncode not in {0, 1}:
            raise ToolError("grep_failed", proc.stderr.strip() or f"rg exit {proc.returncode}", retryable=False)
        raw_lines, prefix = proc.stdout.splitlines(), str(self.workspace) + os.sep
        normalized = [line.replace(prefix, "", 1) if line.startswith(prefix) else line for line in raw_lines[:limit]]
        return _ok({"matches": normalized, "count_returned": len(normalized), "truncated": len(raw_lines) > limit})

    def glob(self, args: dict[str, Any]) -> dict[str, Any]:
        base = self._tool_path(str(args.get("path") or "."), allow_tmp=False)
        if not base.is_dir():
            raise ToolError("not_a_directory", f"glob base is not a directory: {args.get('path') or '.'}", retryable=False)
        pattern, limit, found = str(args["pattern"]), max(1, min(int(args.get("max_results") or 200), 500)), []
        for p in base.glob(pattern):
            try:
                resolved = p.resolve(); resolved.relative_to(self.workspace)
            except (OSError, ValueError):
                continue
            found.append(resolved.relative_to(self.workspace).as_posix() + ("/" if resolved.is_dir() else ""))
        found = sorted(set(found))
        return _ok({"paths": found[:limit], "count_returned": min(len(found), limit), "truncated": len(found) > limit})

    def bash(self, args: dict[str, Any]) -> dict[str, Any]:
        command = str(args["command"])
        timeout_seconds = max(1, min(int(args.get("timeout_seconds") or DEFAULT_TOOL_TIMEOUT), 1200))
        if self.trusted_bash_callback is not None:
            trusted = self.trusted_bash_callback(command, timeout_seconds)
            if trusted is not None:
                return trusted
        return self.sandbox.run(command, timeout_seconds)

    def web_search(self, args: dict[str, Any]) -> dict[str, Any]:
        try:
            limit = int(args.get("limit", args.get("num_results", 5)))
        except (TypeError, ValueError) as exc:
            raise ToolError("invalid_arguments", "limit must be an integer", retryable=False) from exc
        return self.web_searcher.search(str(args["query"]), limit)

    def web_fetch(self, args: dict[str, Any]) -> dict[str, Any]:
        return self.web_extractor.fetch(args)
