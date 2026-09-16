#!/usr/bin/env python3
"""Tool surface for the ShortVideo OpenRouter harness.

Exactly eight model-visible functions live here:
read_file, write_file, edit_file, grep, glob, bash, web_search, web_fetch.

Networking and process execution are owned by the trusted supervisor.  Model
controlled shell commands run in bubblewrap with no network and a scrubbed
environment.  web_search/web_fetch run outside that sandbox through narrow,
validated interfaces.
"""
from __future__ import annotations

import base64
import contextlib
import gzip
import hashlib
import http.client
import ipaddress
import json
import mimetypes
import os
import re
import select
import shlex
import shutil
import socket
import socketserver
import ssl
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urljoin, urlsplit

try:
    import httpx
except ImportError as exc:  # pragma: no cover - doctor reports this cleanly
    raise RuntimeError("httpx is required; install requirements-openrouter.txt") from exc

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
DEFAULT_READ_CHARS = 24_000
MAX_READ_CHARS = 80_000
MAX_BASH_OUTPUT_CHARS = 60_000
MAX_FETCH_BYTES = 3 * 1024 * 1024
MAX_FETCH_CHARS = 36_000
DEFAULT_FETCH_CHARS = 24_000
MAX_SEARCH_RESULTS = 10
DEFAULT_TOOL_TIMEOUT = 600

_SECRET_ENV_PREFIXES = (
    "OPENROUTER_",
    "EXA_",
    "GEMINI_",
    "GOOGLE_API_KEY",
    "ANTHROPIC_",
    "OPENAI_",
    "AWS_",
    "AZURE_",
    "TELEGRAM_",
)
_SECRET_ENV_NAMES = {
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
    "http_proxy", "https_proxy", "all_proxy", "no_proxy",
}

_DANGEROUS_COMMANDS = (
    (re.compile(r"(^|[;&|]\s*|\s)(sudo|su|doas)\b"), "privilege escalation is disabled"),
    (re.compile(r"(^|[;&|]\s*|\s)(mount|umount|nsenter|unshare|bwrap)\b"), "namespace manipulation is disabled"),
    (re.compile(r"(^|[;&|]\s*|\s)(kill|pkill|killall)\b"), "process signalling is disabled"),
    (re.compile(r"(^|[;&|]\s*|\s)(curl|wget|nc|ncat|netcat|socat|ssh|scp|sftp|telnet)\b"), "network CLIs are disabled; use web_search/web_fetch"),
    (re.compile(r"\bgit\s+stash\b"), "git stash is forbidden"),
    (re.compile(r"\bgit\s+reset\s+--hard\b"), "git reset --hard is forbidden"),
    (re.compile(r"\bgit\s+clean\b"), "git clean is forbidden"),
    (re.compile(r"\bgit\s+checkout\s+--\s+\.(?:\s|$)"), "mass git checkout is forbidden"),
    (re.compile(r"\bgit\s+restore(?:\s+\S+)*\s+\.(?:\s|$)"), "mass git restore is forbidden"),
    (re.compile(r"\bgit\s+(update-ref|rebase|prune|gc)\b"), "direct git history/ref mutation is forbidden"),
    (re.compile(r"\bgit\s+branch\s+(?:-[dDfFmM]|--delete|--force)\b"), "destructive git branch operations are forbidden"),
)

TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": (
                "Read a UTF-8 text file in the workspace, or inspect a PNG/JPEG/WebP. "
                "Text is returned with line numbers and deterministic truncation. "
                "Images are analyzed by the harness vision backend. Errors are JSON "
                "{ok:false,error:{type,message,hint,retryable}}."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Workspace-relative path, or /tmp/<file> for session scratch."},
                    "start_line": {"type": "integer", "minimum": 1, "description": "First 1-based line; default 1."},
                    "end_line": {"type": "integer", "minimum": 1, "description": "Optional inclusive last line."},
                    "max_chars": {"type": "integer", "minimum": 1000, "maximum": MAX_READ_CHARS, "description": "Deterministic output cap; default 24000."},
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": (
                "Atomically create or replace one UTF-8 file inside the workspace. "
                "Denied for read-only roles. Parent directories are created. Errors are structured JSON."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Workspace-relative file path; /tmp is not allowed here."},
                    "content": {"type": "string", "description": "Complete UTF-8 file contents."},
                },
                "required": ["path", "content"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edit_file",
            "description": (
                "Make one exact textual replacement in a UTF-8 workspace file. "
                "The old_text must occur exactly once; zero or multiple matches fail without changing the file. "
                "Use this for focused edits rather than rewriting a whole file."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "old_text": {"type": "string", "minLength": 1, "maxLength": 12000},
                    "new_text": {"type": "string", "maxLength": 12000},
                },
                "required": ["path", "old_text", "new_text"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "grep",
            "description": (
                "Search workspace text with ripgrep. Returns path:line:text matches, capped deterministically. "
                "Use glob to narrow files. Invalid regex and rg errors are structured."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "minLength": 1, "maxLength": 1000},
                    "path": {"type": "string", "description": "Workspace-relative file or directory; default ."},
                    "glob": {"type": "string", "description": "Optional ripgrep -g pattern."},
                    "max_matches": {"type": "integer", "minimum": 1, "maximum": 200, "description": "Default 80."},
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "glob",
            "description": (
                "List workspace paths matching a Python-style glob such as video/src/**/*.tsx. "
                "Returns sorted relative paths and truncation metadata."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "minLength": 1, "maxLength": 1000},
                    "path": {"type": "string", "description": "Workspace-relative base directory; default ."},
                    "max_results": {"type": "integer", "minimum": 1, "maximum": 500, "description": "Default 200."},
                },
                "required": ["pattern"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "bash",
            "description": (
                "Execute a shell command in the role sandbox. The sandbox has no external network, "
                "a private persistent /tmp, scrubbed secrets, PID isolation, and role-specific read/write access. "
                "sudo, kill/pkill, network CLIs, namespace tools, git stash/reset --hard/clean and mass checkout are denied. "
                "Returns exit_code, stdout, stderr and truncation flags."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "minLength": 1, "maxLength": 20000},
                    "timeout_seconds": {"type": "integer", "minimum": 1, "maximum": 1200, "description": "Default 600; trusted delegation is handled outside this tool timeout."},
                },
                "required": ["command"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Search the public web through Exa. Returns ranked title/url/published_date/highlights only. "
                "Use it for research discovery, then web_fetch sources you rely on. Results are cached for this run."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "minLength": 2, "maxLength": 2000},
                    "num_results": {"type": "integer", "minimum": 1, "maximum": MAX_SEARCH_RESULTS, "description": "Default 5."},
                    "include_domains": {"type": "array", "items": {"type": "string"}, "maxItems": 10},
                    "exclude_domains": {"type": "array", "items": {"type": "string"}, "maxItems": 10},
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_fetch",
            "description": (
                "Fetch one public HTTP(S) page with SSRF protection, redirects revalidated, boilerplate removal via Trafilatura, "
                "and deterministic character truncation. Slow requests time out. A restricted headless-Chromium fallback is used "
                "only when normal extraction is clearly empty. Results are cached for this run."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "minLength": 8, "maxLength": 4096},
                    "max_chars": {"type": "integer", "minimum": 2000, "maximum": MAX_FETCH_CHARS, "description": "Default 24000."},
                    "render_js": {"type": "string", "enum": ["auto", "never"], "description": "Default auto."},
                },
                "required": ["url"],
                "additionalProperties": False,
            },
        },
    },
]


@dataclass
class ToolError(Exception):
    type: str
    message: str
    hint: str | None = None
    retryable: bool = False

    def payload(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "type": self.type,
            "message": self.message,
            "retryable": self.retryable,
        }
        if self.hint:
            data["hint"] = self.hint
        return {"ok": False, "error": data}


def _ok(data: Any, **meta: Any) -> dict[str, Any]:
    out: dict[str, Any] = {"ok": True, "data": data}
    if meta:
        out["meta"] = meta
    return out


def _json_size_stable(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _is_secret_env(name: str) -> bool:
    return name in _SECRET_ENV_NAMES or any(name.startswith(p) for p in _SECRET_ENV_PREFIXES)


def sanitized_child_env(extra: dict[str, str] | None = None) -> dict[str, str]:
    keep = {
        "PATH", "LANG", "LC_ALL", "TERM", "TZ",
        "SV_RUN_ID", "SV_RUN_DIR", "SV_CLI", "SV_MODEL", "SV_EFFORT",
        "SV_ORCHESTRATION", "SV_SANDBOX_POLICY",
        "SHORTVIDEO_PUBLISH_STATE_DIR",
    }
    env: dict[str, str] = {}
    for key, value in os.environ.items():
        if key in keep and not _is_secret_env(key):
            env[key] = value
    env.setdefault("PATH", "/usr/local/bin:/usr/bin:/bin")
    env.setdefault("LANG", "C.UTF-8")
    env.setdefault("LC_ALL", "C.UTF-8")
    env["HOME"] = "/tmp/home"
    if extra:
        for key, value in extra.items():
            if not _is_secret_env(key):
                env[key] = value
    return env


def _dangerous_command_reason(command: str) -> str | None:
    for pattern, reason in _DANGEROUS_COMMANDS:
        if pattern.search(command):
            return reason
    return None


def _ensure_parents_args(path: Path) -> list[str]:
    parts = path.resolve().parts
    args: list[str] = []
    current = Path(parts[0])
    for part in parts[1:-1]:
        current /= part
        args.extend(["--dir", str(current)])
    return args


def _resolve_git_paths(workspace: Path) -> tuple[Path | None, Path | None]:
    try:
        gd = subprocess.run(
            ["git", "-C", str(workspace), "rev-parse", "--absolute-git-dir"],
            check=True, capture_output=True, text=True, timeout=5,
        ).stdout.strip()
        common = subprocess.run(
            ["git", "-C", str(workspace), "rev-parse", "--git-common-dir"],
            check=True, capture_output=True, text=True, timeout=5,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None, None
    git_dir = Path(gd).resolve()
    common_path = Path(common)
    if not common_path.is_absolute():
        common_path = (workspace / common_path).resolve()
    else:
        common_path = common_path.resolve()
    return git_dir, common_path
