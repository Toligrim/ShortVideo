#!/usr/bin/env python3
from __future__ import annotations
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Callable

import httpx

from openrouter_base import (
    DEFAULT_FETCH_CHARS, DEFAULT_READ_CHARS, DEFAULT_TOOL_TIMEOUT,
    IMAGE_SUFFIXES, MAX_FETCH_CHARS, MAX_READ_CHARS, MAX_SEARCH_RESULTS,
    TOOL_SCHEMAS, ToolError, _json_size_stable, _ok,
)
from openrouter_sandbox import BubblewrapSandbox
from openrouter_web import (
    _chromium_dump_dom, _extract_html, _fetch_public_bytes,
    _public_ips_for_host, _validate_public_url,
)

class ToolExecutor:
    def __init__(
        self,
        *,
        workspace: Path,
        scratch: Path,
        run_dir: Path,
        role: str,
        writable: bool,
        vision_callback: Callable[[Path], str] | None = None,
        trusted_bash_callback: Callable[[str, int], dict[str, Any] | None] | None = None,
    ) -> None:
        self.workspace = workspace.resolve()
        self.scratch = scratch.resolve()
        self.run_dir = run_dir.resolve()
        self.role = role
        self.writable = writable
        self.vision_callback = vision_callback
        self.trusted_bash_callback = trusted_bash_callback
        self.sandbox = BubblewrapSandbox(
            self.workspace, self.scratch, writable=writable, role=role
        )
        self.cache_dir = self.run_dir / "openrouter-cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _tool_path(self, raw: str, *, allow_tmp: bool, for_write: bool = False) -> Path:
        if "\x00" in raw:
            raise ToolError("invalid_path", "NUL is not allowed in paths", retryable=False)
        if raw == "~/.claude/commands/tts.md":
            if for_write:
                raise ToolError("policy_denied", "the shared TTS dictionary is read-only", retryable=False)
            external = (Path.home() / ".claude" / "commands" / "tts.md").resolve()
            if not external.is_file():
                raise ToolError("file_not_found", "shared TTS dictionary is not installed", retryable=False)
            return external
        p = Path(raw)
        if for_write and not p.is_absolute() and p.parts and p.parts[0] == ".git":
            raise ToolError(
                "policy_denied",
                "direct writes to .git metadata are forbidden",
                "Use ordinary non-destructive git commands through bash.",
                False,
            )
        if p.is_absolute():
            if allow_tmp and (p == Path("/tmp") or str(p).startswith("/tmp/")):
                rel = p.relative_to("/tmp")
                candidate = self.scratch / rel
                root = self.scratch
            else:
                raise ToolError("path_outside_workspace", "absolute paths are limited to /tmp session scratch", retryable=False)
        else:
            candidate = self.workspace / p
            root = self.workspace

        try:
            root_resolved = root.resolve()
            if for_write and not candidate.exists():
                resolved_parent = candidate.parent.resolve()
                resolved = resolved_parent / candidate.name
            else:
                resolved = candidate.resolve()
            resolved.relative_to(root_resolved)
        except (OSError, RuntimeError, ValueError) as exc:
            raise ToolError(
                "path_outside_workspace",
                f"path escapes allowed root: {raw}",
                "Use a workspace-relative path; symlink escapes are rejected.",
                False,
            ) from exc
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
            if name == "read_file":
                return self.read_file(args)
            if name == "write_file":
                return self.write_file(args)
            if name == "edit_file":
                return self.edit_file(args)
            if name == "grep":
                return self.grep(args)
            if name == "glob":
                return self.glob(args)
            if name == "bash":
                return self.bash(args)
            if name == "web_search":
                return self.web_search(args)
            if name == "web_fetch":
                return self.web_fetch(args)
            raise ToolError("unknown_tool", f"unknown tool {name!r}", retryable=False)
        except ToolError as exc:
            return exc.payload()
        except Exception as exc:
            return ToolError(
                "internal_tool_error",
                f"{type(exc).__name__}: {exc}",
                "Do not retry identically; simplify the operation or report the failure.",
                False,
            ).payload()

    def read_file(self, args: dict[str, Any]) -> dict[str, Any]:
        path = self._tool_path(str(args["path"]), allow_tmp=True)
        if not path.is_file():
            raise ToolError("file_not_found", f"file does not exist: {args['path']}", retryable=False)
        if path.suffix.lower() in IMAGE_SUFFIXES:
            if not self.vision_callback:
                raise ToolError("vision_unavailable", "image inspection is not configured", retryable=False)
            return _ok({
                "kind": "image_analysis",
                "path": str(args["path"]),
                "analysis": self.vision_callback(path),
            })
        max_chars = self._bounded_chars(args.get("max_chars"), DEFAULT_READ_CHARS, MAX_READ_CHARS)
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise ToolError(
                "binary_file",
                "file is not UTF-8 text and is not a supported image",
                "Use bash for deterministic metadata inspection, not raw binary dumping.",
                False,
            ) from exc
        lines = text.splitlines()
        start = int(args.get("start_line") or 1)
        end_arg = args.get("end_line")
        end = int(end_arg) if end_arg is not None else len(lines)
        if start < 1 or end < start:
            raise ToolError("invalid_arguments", "line range is invalid", retryable=False)
        selected = lines[start - 1:end]
        rendered = "\n".join(f"{i}: {line}" for i, line in enumerate(selected, start=start))
        truncated = len(rendered) > max_chars
        if truncated:
            rendered = rendered[:max_chars] + "\n...[deterministically truncated]..."
        return _ok({
            "path": str(args["path"]),
            "content": rendered,
            "start_line": start,
            "end_line": min(end, len(lines)),
            "total_lines": len(lines),
            "truncated": truncated,
        })

    def _require_write(self) -> None:
        if not self.writable:
            raise ToolError(
                "policy_denied",
                f"role {self.role} is read-only",
                "Return findings to the caller instead of modifying files.",
                False,
            )

    def write_file(self, args: dict[str, Any]) -> dict[str, Any]:
        self._require_write()
        path = self._tool_path(str(args["path"]), allow_tmp=False, for_write=True)
        content = str(args["content"])
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(content)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(temp_name, path)
        finally:
            try:
                os.unlink(temp_name)
            except FileNotFoundError:
                pass
        return _ok({"path": str(args["path"]), "bytes": len(content.encode("utf-8"))})

    def edit_file(self, args: dict[str, Any]) -> dict[str, Any]:
        self._require_write()
        path = self._tool_path(str(args["path"]), allow_tmp=False)
        if not path.is_file():
            raise ToolError("file_not_found", f"file does not exist: {args['path']}", retryable=False)
        old = str(args["old_text"])
        new = str(args["new_text"])
        text = path.read_text(encoding="utf-8")
        count = text.count(old)
        if count != 1:
            raise ToolError(
                "edit_match_count",
                f"old_text matched {count} times; expected exactly 1",
                "Read a narrower surrounding span and retry with unique old_text.",
                False,
            )
        replaced = text.replace(old, new, 1)
        return self.write_file({"path": str(args["path"]), "content": replaced})

    def grep(self, args: dict[str, Any]) -> dict[str, Any]:
        query = str(args["query"])
        base = self._tool_path(str(args.get("path") or "."), allow_tmp=False)
        limit = max(1, min(int(args.get("max_matches") or 80), 200))
        cmd = ["rg", "-n", "--no-heading", "--color", "never", "--", query, str(base)]
        glob_pattern = args.get("glob")
        if glob_pattern:
            cmd = ["rg", "-n", "--no-heading", "--color", "never", "-g", str(glob_pattern), "--", query, str(base)]
        try:
            proc = subprocess.run(cmd, cwd=str(self.workspace), capture_output=True, text=True, errors="replace", timeout=20)
        except subprocess.TimeoutExpired as exc:
            raise ToolError("grep_timeout", "ripgrep exceeded 20s", retryable=True) from exc
        if proc.returncode not in {0, 1}:
            raise ToolError("grep_failed", proc.stderr.strip() or f"rg exit {proc.returncode}", retryable=False)
        raw_lines = proc.stdout.splitlines()
        shown = raw_lines[:limit]
        normalized: list[str] = []
        prefix = str(self.workspace) + os.sep
        for line in shown:
            normalized.append(line.replace(prefix, "", 1) if line.startswith(prefix) else line)
        return _ok({
            "matches": normalized,
            "count_returned": len(normalized),
            "truncated": len(raw_lines) > limit,
        })

    def glob(self, args: dict[str, Any]) -> dict[str, Any]:
        base = self._tool_path(str(args.get("path") or "."), allow_tmp=False)
        if not base.is_dir():
            raise ToolError("not_a_directory", f"glob base is not a directory: {args.get('path') or '.'}", retryable=False)
        pattern = str(args["pattern"])
        limit = max(1, min(int(args.get("max_results") or 200), 500))
        found: list[str] = []
        for p in base.glob(pattern):
            try:
                resolved = p.resolve()
                resolved.relative_to(self.workspace)
            except (OSError, ValueError):
                continue
            rel = resolved.relative_to(self.workspace).as_posix()
            found.append(rel + ("/" if resolved.is_dir() else ""))
        found = sorted(set(found))
        return _ok({"paths": found[:limit], "count_returned": min(len(found), limit), "truncated": len(found) > limit})

    def bash(self, args: dict[str, Any]) -> dict[str, Any]:
        command = str(args["command"])
        timeout_seconds = int(args.get("timeout_seconds") or DEFAULT_TOOL_TIMEOUT)
        timeout_seconds = max(1, min(timeout_seconds, 1200))
        if self.trusted_bash_callback is not None:
            trusted = self.trusted_bash_callback(command, timeout_seconds)
            if trusted is not None:
                return trusted
        return self.sandbox.run(command, timeout_seconds)

    def _cache_path(self, namespace: str, key: Any) -> Path:
        digest = hashlib.sha256(_json_size_stable(key).encode("utf-8")).hexdigest()
        return self.cache_dir / f"{namespace}-{digest}.json"

    def web_search(self, args: dict[str, Any]) -> dict[str, Any]:
        key = {
            "query": str(args["query"]).strip(),
            "num_results": max(1, min(int(args.get("num_results") or 5), MAX_SEARCH_RESULTS)),
            "include_domains": args.get("include_domains") or [],
            "exclude_domains": args.get("exclude_domains") or [],
        }
        cache = self._cache_path("search", key)
        if cache.is_file():
            data = json.loads(cache.read_text(encoding="utf-8"))
            data.setdefault("meta", {})["cache_hit"] = True
            return data
        api_key = os.environ.get("EXA_API_KEY", "").strip()
        if not api_key:
            raise ToolError("search_unconfigured", "EXA_API_KEY is not set", retryable=False)
        payload: dict[str, Any] = {
            "query": key["query"],
            "numResults": key["num_results"],
            "type": "auto",
            "contents": {"highlights": {"maxCharacters": 1800}},
        }
        if key["include_domains"]:
            payload["includeDomains"] = key["include_domains"]
        if key["exclude_domains"]:
            payload["excludeDomains"] = key["exclude_domains"]
        try:
            with httpx.Client(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
                resp = client.post(
                    "https://api.exa.ai/search",
                    headers={"x-api-key": api_key, "Content-Type": "application/json"},
                    json=payload,
                )
        except httpx.HTTPError as exc:
            raise ToolError("search_transport_error", str(exc), retryable=True) from exc
        if resp.status_code >= 400:
            raise ToolError(
                "search_http_error",
                f"Exa returned HTTP {resp.status_code}",
                resp.text[:500] or None,
                resp.status_code in {408, 425, 429, 500, 502, 503, 504},
            )
        body = resp.json()
        results: list[dict[str, Any]] = []
        for item in body.get("results", [])[: key["num_results"]]:
            highlights = item.get("highlights") or []
            if isinstance(highlights, str):
                highlights = [highlights]
            results.append({
                "title": item.get("title"),
                "url": item.get("url"),
                "published_date": item.get("publishedDate"),
                "highlights": [str(x)[:1800] for x in highlights[:3]],
            })
        out = _ok(results, provider="exa", cache_hit=False)
        cache.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
        return out

    def web_fetch(self, args: dict[str, Any]) -> dict[str, Any]:
        url = str(args["url"]).strip()
        max_chars = self._bounded_chars(args.get("max_chars"), DEFAULT_FETCH_CHARS, MAX_FETCH_CHARS)
        render_js = str(args.get("render_js") or "auto")
        key = {"url": url, "max_chars": max_chars, "render_js": render_js}
        cache = self._cache_path("fetch", key)
        if cache.is_file():
            data = json.loads(cache.read_text(encoding="utf-8"))
            data.setdefault("meta", {})["cache_hit"] = True
            return data

        final_url, raw, content_type = _fetch_public_bytes(url)
        text = _extract_html(raw, final_url, content_type)
        used_js = False

        if render_js == "auto" and len(text) < 500 and "text/html" in content_type.lower():
            scheme, host, port, _ = _validate_public_url(final_url)
            ip = _public_ips_for_host(host, port)[0]
            try:
                dom = _chromium_dump_dom(final_url, host, ip, port=port)
                rendered = _extract_html(dom, final_url, "text/html")
                if len(rendered) > len(text):
                    text = rendered
                    used_js = True
            except ToolError:
                pass

        if not text:
            raise ToolError(
                "extraction_empty",
                "page fetched successfully but no readable article text was extracted",
                "Try a canonical article/documentation URL or use web_search for another source.",
                False,
            )
        truncated = len(text) > max_chars
        if truncated:
            text = text[:max_chars] + "\n\n...[deterministically truncated]..."
        out = _ok({
            "url": final_url,
            "content": text,
            "content_type": content_type,
            "truncated": truncated,
            "rendered_js": used_js,
        }, cache_hit=False)
        cache.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
        return out
