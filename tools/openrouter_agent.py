#!/usr/bin/env python3
from __future__ import annotations
import hashlib
import json
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from openrouter_client import OpenRouterClient, UsageLedger, estimate_tokens
from openrouter_config import CONTEXT_BUDGETS, DEFAULT_COMPACTOR_MODEL, MAX_AGENT_STEPS, ROOT, system_prompt_for
from openrouter_control import ControlMixin
from openrouter_tools import TOOL_SCHEMAS, ToolExecutor

def _assistant_message(body: dict[str, Any]) -> dict[str, Any]:
    choices = body.get("choices") or []
    if not choices:
        raise RuntimeError("OpenRouter returned no choices")
    msg = choices[0].get("message") or {}
    out: dict[str, Any] = {
        "role": "assistant",
        "content": msg.get("content") or "",
    }
    if msg.get("tool_calls"):
        out["tool_calls"] = msg["tool_calls"]
    return out


def _evict_old_tool_results(messages: list[dict[str, Any]]) -> int:
    """Replace large old tool payloads with deterministic reread pointers."""
    changed = 0
    keep_from = max(0, len(messages) - 10)
    for idx, msg in enumerate(messages):
        if idx >= keep_from or msg.get("role") != "tool":
            continue
        content = str(msg.get("content") or "")
        if len(content) <= 6000 or "[HARNESS EVICTED TOOL RESULT]" in content:
            continue
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]
        msg["content"] = (
            "[HARNESS EVICTED TOOL RESULT] "
            f"sha256={digest} original_chars={len(content)}. "
            "Durable state is on disk; reread the needed file/range or rerun a narrow query."
        )
        changed += 1
    return changed


@dataclass
class SessionResult:
    text: str
    steps: int
    estimated_tokens: int


class AgentSession(ControlMixin):
    def __init__(
        self,
        *,
        role: str,
        task: str,
        workspace: Path,
        run_dir: Path,
        model: str,
        effort: str,
        sandbox_policy: str,
        vision_model: str,
        policy: dict[str, Any],
        deadline: float | None = None,
        actor_id: str | None = None,
        task_id: str | None = None,
    ) -> None:
        self.role = role
        self.task = task
        self.workspace = workspace.resolve()
        self.run_dir = run_dir.resolve()
        self.model = model
        self.effort = effort
        self.sandbox_policy = sandbox_policy
        self.vision_model = vision_model
        self.policy = policy
        self.deadline = deadline
        self.actor_id = actor_id or ("orchestrator" if role == "orchestrator" else role)
        self.task_id = task_id
        self.session_id = f"sv-{run_dir.name}-{role}-{uuid.uuid4().hex[:10]}"[:256]
        self.ledger = UsageLedger(run_dir)
        self.client = OpenRouterClient(ledger=self.ledger, role=role, session_id=self.session_id)
        scratch = run_dir / "openrouter-scratch" / self.session_id
        writable = sandbox_policy != "read-only"
        self.tools = ToolExecutor(
            workspace=self.workspace,
            scratch=scratch,
            run_dir=run_dir,
            role=role,
            writable=writable,
            vision_callback=lambda p: self.client.inspect_image(p, self.vision_model),
            trusted_bash_callback=self._trusted_bash if role == "orchestrator" else None,
        )
        self.messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt_for(role)},
            {"role": "user", "content": task},
        ]
        self.original_task = task
        self.soft_budget, self.hard_budget = CONTEXT_BUDGETS[role]

    def close(self) -> None:
        self.client.close()

    def estimated_request_tokens(self) -> int:
        return estimate_tokens({"messages": self.messages, "tools": TOOL_SCHEMAS})

    def _compact_with_llm(self) -> None:
        compact_input = self.messages[1:]
        body = self.client.chat(
            model=self.policy.get("openrouter_compactor_model", DEFAULT_COMPACTOR_MODEL),
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Summarize an in-progress coding/research agent session for continuation. "
                        "Preserve: current goal, decisions, exact file paths/artifacts, commands/checks and their results, "
                        "remaining defects, constraints and next action. Drop prose, repeated tool output and dead ends. "
                        "Never claim an action completed unless the transcript says it completed."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(compact_input, ensure_ascii=False),
                },
            ],
            tools=None,
            effort="low",
            max_completion_tokens=4500,
            kind="compaction",
        )
        summary = str(((body.get("choices") or [{}])[0].get("message") or {}).get("content") or "")
        self.messages = [
            self.messages[0],
            {"role": "user", "content": self.original_task},
            {
                "role": "assistant",
                "content": "[HARNESS COMPACTED WORKING STATE]\n" + summary,
            },
            {
                "role": "user",
                "content": (
                    "Continue the original task from the compacted working state. "
                    "Reread durable artifacts from disk whenever exact content is needed."
                ),
            },
        ]

    def _manage_context(self) -> None:
        estimate = self.estimated_request_tokens()
        if estimate >= self.soft_budget:
            _evict_old_tool_results(self.messages)
            estimate = self.estimated_request_tokens()
        if estimate >= self.hard_budget:
            self._compact_with_llm()
            estimate = self.estimated_request_tokens()
        if estimate >= self.hard_budget:
            raise RuntimeError(
                f"context budget still exceeded after compaction: {estimate} >= {self.hard_budget}"
            )

    def _log_tool_action(
        self,
        name: str,
        arguments: dict[str, Any],
        result: dict[str, Any],
    ) -> None:
        """Feed OpenRouter tool activity into the existing agent_log event stream.

        Telemetry is best-effort by the project's established rule: a logging
        failure must never cost the episode.  Inputs are model-authored and
        truncated; environment secrets are never included.
        """
        try:
            raw_input = json.dumps(arguments, ensure_ascii=False, sort_keys=True)
        except (TypeError, ValueError):
            raw_input = "<unserializable>"
        raw_input = raw_input[:2048]
        if result.get("ok") is True:
            detail = "ok"
        else:
            err = result.get("error") if isinstance(result, dict) else None
            err_type = err.get("type") if isinstance(err, dict) else "tool_error"
            detail = f"error:{err_type}"
        cmd = [
            sys.executable,
            str(ROOT / "tools" / "agent_log.py"),
            "action",
            "--actor",
            self.actor_id,
            "--kind",
            "tool_call",
            "--name",
            name[:200],
            "--input",
            raw_input,
            "--detail",
            detail[:500],
        ]
        if self.task_id:
            cmd += ["--task-id", self.task_id]
        try:
            subprocess.run(
                cmd,
                cwd=str(ROOT),
                capture_output=True,
                text=True,
                timeout=10,
            )
        except (OSError, subprocess.TimeoutExpired):
            pass

    def run(self) -> SessionResult:
        for step in range(1, MAX_AGENT_STEPS + 1):
            if self.deadline is not None and time.monotonic() >= self.deadline:
                raise TimeoutError(f"{self.role} exceeded delegate timeout")
            self._manage_context()
            body = self.client.chat(
                model=self.model,
                messages=self.messages,
                tools=TOOL_SCHEMAS,
                effort=self.effort,
                max_completion_tokens=24_000,
                kind="agent",
            )
            assistant = _assistant_message(body)
            self.messages.append(assistant)
            calls = assistant.get("tool_calls") or []
            if not calls:
                text = str(assistant.get("content") or "")
                if not text.strip():
                    raise RuntimeError("model returned neither tool call nor final content")
                self.ledger.write_summary()
                return SessionResult(text=text, steps=step, estimated_tokens=self.estimated_request_tokens())

            for call in calls:
                call_id = str(call.get("id") or f"call-{uuid.uuid4().hex[:12]}")
                fn = call.get("function") or {}
                name = str(fn.get("name") or "")
                raw_args = fn.get("arguments") or "{}"
                telemetry_args: dict[str, Any] = {}
                try:
                    parsed = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                    if not isinstance(parsed, dict):
                        raise ValueError("arguments must be a JSON object")
                    telemetry_args = parsed
                except (ValueError, TypeError) as exc:
                    result: dict[str, Any] = {
                        "ok": False,
                        "error": {
                            "type": "invalid_arguments",
                            "message": f"tool arguments are not valid JSON object: {exc}",
                            "hint": "Correct the JSON arguments; do not repeat the same malformed call.",
                            "retryable": False,
                        },
                    }
                else:
                    result = self.tools.call(name, parsed)
                self._log_tool_action(name, telemetry_args, result)
                self.messages.append({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "name": name,
                    "content": json.dumps(result, ensure_ascii=False, sort_keys=True),
                })

        raise RuntimeError(f"agent exceeded {MAX_AGENT_STEPS} model steps")
