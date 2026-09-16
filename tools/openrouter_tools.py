#!/usr/bin/env python3
"""Public import surface for the ShortVideo OpenRouter tool layer."""
from __future__ import annotations

from openrouter_base import (
    TOOL_SCHEMAS, ToolError, _dangerous_command_reason, _json_size_stable,
    sanitized_child_env,
)
from openrouter_executor import ToolExecutor
from openrouter_web import _proxy_target_allowed, _public_ips_for_host, _validate_public_url, socket

def tool_schema_bytes() -> int:
    return len(_json_size_stable(TOOL_SCHEMAS).encode("utf-8"))

def assert_exact_tool_surface() -> None:
    names = [item["function"]["name"] for item in TOOL_SCHEMAS]
    expected = [
        "read_file", "write_file", "edit_file", "grep",
        "glob", "bash", "web_search", "web_fetch",
    ]
    if names != expected:
        raise AssertionError(f"tool surface drifted: {names!r}")

assert_exact_tool_surface()
