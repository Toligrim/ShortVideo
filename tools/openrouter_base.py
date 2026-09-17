#!/usr/bin/env python3
"""Shared constants, model-visible tool schemas and policy helpers for OpenRouter."""
from __future__ import annotations

import json
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
DEFAULT_READ_CHARS = 24_000
MAX_READ_CHARS = 80_000
MAX_BASH_OUTPUT_CHARS = 60_000
MAX_FETCH_BYTES = 3 * 1024 * 1024
DEFAULT_FETCH_CHARS = 15_000
MAX_FETCH_CHARS = 50_000
MAX_SEARCH_RESULTS = 10
DEFAULT_TOOL_TIMEOUT = 600

_SECRET_ENV_PREFIXES = (
    "OPENROUTER_", "EXA_", "SEARXNG_", "FIRECRAWL_", "GEMINI_", "GOOGLE_API_KEY",
    "ANTHROPIC_", "OPENAI_", "AWS_", "AZURE_", "TELEGRAM_",
)
_SECRET_ENV_NAMES = {"HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"}
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
    {"type":"function","function":{"name":"read_file","description":"Read UTF-8 workspace/session text, a read-only @web-cache path returned by web_fetch, or inspect PNG/JPEG/WebP through the harness vision backend.","parameters":{"type":"object","properties":{"path":{"type":"string"},"start_line":{"type":"integer","minimum":1},"end_line":{"type":"integer","minimum":1},"max_chars":{"type":"integer","minimum":1000,"maximum":MAX_READ_CHARS}},"required":["path"],"additionalProperties":False}}},
    {"type":"function","function":{"name":"write_file","description":"Atomically create or replace one UTF-8 workspace file. Denied for read-only roles and @web-cache.","parameters":{"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"}},"required":["path","content"],"additionalProperties":False}}},
    {"type":"function","function":{"name":"edit_file","description":"Replace one exact unique text span in a UTF-8 workspace file. Denied for read-only roles.","parameters":{"type":"object","properties":{"path":{"type":"string"},"old_text":{"type":"string","minLength":1,"maxLength":12000},"new_text":{"type":"string","maxLength":12000}},"required":["path","old_text","new_text"],"additionalProperties":False}}},
    {"type":"function","function":{"name":"grep","description":"Search workspace text with ripgrep and return capped path:line:text matches.","parameters":{"type":"object","properties":{"query":{"type":"string","minLength":1,"maxLength":1000},"path":{"type":"string"},"glob":{"type":"string"},"max_matches":{"type":"integer","minimum":1,"maximum":200}},"required":["query"],"additionalProperties":False}}},
    {"type":"function","function":{"name":"glob","description":"List sorted workspace paths matching a Python-style glob.","parameters":{"type":"object","properties":{"pattern":{"type":"string","minLength":1,"maxLength":1000},"path":{"type":"string"},"max_results":{"type":"integer","minimum":1,"maximum":500}},"required":["pattern"],"additionalProperties":False}}},
    {"type":"function","function":{"name":"bash","description":"Execute a shell command in the role bubblewrap sandbox: no external network, private /tmp, scrubbed secrets, PID isolation and role-specific workspace access.","parameters":{"type":"object","properties":{"command":{"type":"string","minLength":1,"maxLength":20000},"timeout_seconds":{"type":"integer","minimum":1,"maximum":1200}},"required":["command"],"additionalProperties":False}}},
    {"type":"function","function":{"name":"web_search","description":"Search the public web and return compact metadata. The harness chooses SearXNG and any configured fallback; the model does not choose providers.","parameters":{"type":"object","properties":{"query":{"type":"string","minLength":2,"maxLength":2000},"limit":{"type":"integer","minimum":1,"maximum":MAX_SEARCH_RESULTS}},"required":["query"],"additionalProperties":False}}},
    {"type":"function","function":{"name":"web_fetch","description":"Fetch one or up to five public HTTP(S) pages. Safety runs before cache; large pages return 75/25 head-tail text plus a read-only @web-cache path.","parameters":{"type":"object","properties":{"url":{"type":"string","minLength":8,"maxLength":4096},"urls":{"type":"array","items":{"type":"string","minLength":8,"maxLength":4096},"minItems":1,"maxItems":5},"max_chars":{"type":"integer","minimum":2000,"maximum":MAX_FETCH_CHARS},"render_js":{"type":"string","enum":["auto","never"]}},"anyOf":[{"required":["url"]},{"required":["urls"]}],"additionalProperties":False}}},
]


@dataclass
class ToolError(Exception):
    type: str
    message: str
    hint: str | None = None
    retryable: bool = False

    def payload(self) -> dict[str, Any]:
        data: dict[str, Any] = {"type": self.type, "message": self.message, "retryable": self.retryable}
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
    keep = {"PATH", "LANG", "LC_ALL", "TERM", "TZ", "SV_RUN_ID", "SV_RUN_DIR", "SV_CLI", "SV_MODEL", "SV_EFFORT", "SV_ORCHESTRATION", "SV_SANDBOX_POLICY", "SHORTVIDEO_PUBLISH_STATE_DIR"}
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
        gd = subprocess.run(["git", "-C", str(workspace), "rev-parse", "--absolute-git-dir"], check=True, capture_output=True, text=True, timeout=5).stdout.strip()
        common = subprocess.run(["git", "-C", str(workspace), "rev-parse", "--git-common-dir"], check=True, capture_output=True, text=True, timeout=5).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None, None
    git_dir = Path(gd).resolve()
    common_path = Path(common)
    if not common_path.is_absolute():
        common_path = (workspace / common_path).resolve()
    else:
        common_path = common_path.resolve()
    return git_dir, common_path
