#!/usr/bin/env python3
"""Deterministic control-plane bridge for nested Codex delegates.

The installed Codex code-mode runtime exposes the nested ``codex`` MCP tool
through JavaScript.  This bridge makes the JavaScript source independent of
the LLM-generated prompt: the caller supplies a validated prompt *file*, and
the generated snippet reads that file at runtime through a statically quoted
``tools.exec_command``/``cat`` call.  The code-mode runtime does not expose
Node's ``require`` API, so the snippet cannot rely on ``fs.readFileSync``.

The bridge is deliberately the only place that chooses the nested model,
sandbox policy, worktree path, timeout, and approval policy.  It emits the
snippet on stdout only after validating the active lease, the physical
worktree, its base commit, the role policy, and the infrastructure retry
budget.  Validation failures emit a bounded JSON diagnostic on stderr and
never emit executable JavaScript on stdout.

Lifecycle commands are also provided because MCP-internal events are not
available to the caller as a stable stream.  The generated snippet records
the request/response boundaries through ``tools.exec_command``; no prompt
body is copied into telemetry.
"""
from __future__ import annotations

import argparse
import contextlib
import io
import json
import math
import os
import re
import shlex
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

sys.path.insert(0, str(Path(__file__).resolve().parent))
import agent_log  # noqa: E402
import pipeline_log  # noqa: E402


ROOT = pipeline_log.ROOT
POLICY_PATH = Path(__file__).resolve().with_name("delegate_policy.json")

ROLE_RE = re.compile(r"^[a-z][a-z0-9-]{1,63}$")
IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")
RUN_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
SHA_RE = re.compile(r"^[0-9a-fA-F]{40,64}$")
MODEL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")
SANDBOX_POLICIES = frozenset({"read-only", "workspace-write", "danger-full-access"})
MAX_PROMPT_BYTES = 4 * 1024 * 1024
VERSION_TIMEOUT_SECONDS = 5.0
GIT_TIMEOUT_SECONDS = 5.0

RESULT_CLASSES = frozenset(agent_log.RESULT_CLASSES)
INFRASTRUCTURE_CODES = frozenset(agent_log.INFRASTRUCTURE_ERROR_CODES)
CONTROL_PLANE_CODES = frozenset(agent_log.CONTROL_PLANE_ERROR_CODES)
POLICY_CODES = frozenset(agent_log.POLICY_ERROR_CODES)


class BridgeError(Exception):
    """A safe, machine-readable refusal from the control plane."""

    def __init__(
        self,
        result_class: str,
        error_code: str,
        message: str,
        *,
        exit_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.result_class = result_class
        self.error_code = error_code
        self.message = message
        self.exit_code = exit_code or {
            "infrastructure_failure": 22,
            "control_plane_failure": 20,
            "policy_failure": 21,
        }.get(result_class, 20)


@dataclass(frozen=True)
class Policy:
    model: str
    sandbox: str
    approval_policy: str
    timeout_seconds: int


@dataclass(frozen=True)
class ClaimContext:
    run_dir: Path
    run_id: str
    task_id: str
    agent_id: str
    role: str
    attempt: int
    worktree: Path
    base_sha: str
    semantic_attempt: int
    infrastructure_attempt: int
    codex_path: Path
    codex_version: str
    policy: Policy


def _bounded(value: str | None, limit: int = 2_048) -> str:
    if not value:
        return ""
    value = str(value).strip()
    return value if len(value) <= limit else value[:limit] + "...[truncated]"


def _validate_identifier(value: str, name: str, pattern: re.Pattern[str] = IDENTIFIER_RE) -> str:
    if not isinstance(value, str) or not pattern.fullmatch(value):
        raise BridgeError(
            "control_plane_failure",
            "mcp_invocation_invalid",
            f"{name} has an invalid format",
        )
    return value


def _safe_shell(value: str) -> str:
    # Every value entering a command embedded in the generated JS is quoted
    # here, including paths and version strings.  The JS code quotes its few
    # runtime enum values again with the same POSIX single-quote convention.
    return shlex.quote(value)


def _json_string(value: str) -> str:
    # Keep generated JavaScript ASCII-safe even when a worktree or prompt-file
    # path itself contains U+2028/U+2029 or other source-sensitive characters.
    # The prompt body is never passed here at all.
    return json.dumps(value, ensure_ascii=True)


def _is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def _run_id_for_dir(run_dir: Path) -> str:
    run_id = run_dir.name
    return _validate_identifier(run_id, "run_id", RUN_ID_RE)


def resolve_run_dir(run_id: str | None = None) -> Path:
    """Resolve an already-created run without creating an implicit run."""

    if run_id:
        _validate_identifier(run_id, "run_id", RUN_ID_RE)
        env_dir = os.environ.get("SV_RUN_DIR", "").strip()
        if env_dir:
            candidate = Path(env_dir)
            if not candidate.is_absolute():
                raise BridgeError(
                    "control_plane_failure",
                    "mcp_invocation_invalid",
                    "SV_RUN_DIR must be absolute",
                )
            if candidate.name != run_id:
                raise BridgeError(
                    "control_plane_failure",
                    "mcp_invocation_invalid",
                    "SV_RUN_DIR and run_id disagree",
                )
            run_dir = candidate
        else:
            run_dir = pipeline_log.RUNS / run_id
    else:
        env_dir = os.environ.get("SV_RUN_DIR", "").strip()
        if env_dir:
            candidate = Path(env_dir)
            if not candidate.is_absolute():
                raise BridgeError(
                    "control_plane_failure",
                    "mcp_invocation_invalid",
                    "SV_RUN_DIR must be absolute",
                )
            run_dir = candidate
        else:
            env_run_id = os.environ.get("SV_RUN_ID", "").strip()
            if not env_run_id:
                raise BridgeError(
                    "control_plane_failure",
                    "mcp_invocation_invalid",
                    "no active run (SV_RUN_DIR/SV_RUN_ID is missing)",
                )
            _validate_identifier(env_run_id, "run_id", RUN_ID_RE)
            run_dir = pipeline_log.RUNS / env_run_id

    try:
        run_dir = run_dir.resolve(strict=True)
    except OSError as exc:
        raise BridgeError(
            "control_plane_failure",
            "mcp_invocation_invalid",
            "run directory is unavailable",
        ) from exc
    if not run_dir.is_dir() or not (run_dir / "delegations.json").is_file():
        raise BridgeError(
            "control_plane_failure",
            "mcp_invocation_invalid",
            "run directory or delegation registry is unavailable",
        )
    _run_id_for_dir(run_dir)
    return run_dir


def load_policy(role: str) -> Policy:
    """Load and validate the single project policy source."""

    _validate_identifier(role, "role", ROLE_RE)
    try:
        raw = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BridgeError(
            "policy_failure",
            "policy_config_invalid",
            "delegate policy cannot be read",
        ) from exc
    if not isinstance(raw, dict) or raw.get("version") != 1:
        raise BridgeError("policy_failure", "policy_config_invalid", "unsupported policy version")
    if (
        raw.get("approval_policy") != "never"
        or raw.get("max_infrastructure_attempts") != agent_log.MAX_INFRASTRUCTURE_ATTEMPTS
        or raw.get("infrastructure_circuit_repeat") != agent_log.INFRASTRUCTURE_CIRCUIT_REPEAT
    ):
        raise BridgeError(
            "policy_failure", "policy_config_invalid", "approval policy must be never"
        )
    roles = raw.get("roles")
    if not isinstance(roles, dict) or role not in roles or not isinstance(roles[role], dict):
        raise BridgeError("policy_failure", "role_not_allowed", f"role {role!r} is not allowed")
    role_policy = roles[role]
    model = role_policy.get("model")
    sandbox = role_policy.get("sandbox")
    timeout = raw.get("timeout_seconds")
    if (
        not isinstance(model, str)
        or not MODEL_RE.fullmatch(model)
        or sandbox not in SANDBOX_POLICIES
        or not isinstance(timeout, int)
        or isinstance(timeout, bool)
        or not 1 <= timeout <= 1_800
    ):
        raise BridgeError("policy_failure", "policy_config_invalid", "invalid role policy")
    return Policy(
        model=model,
        sandbox=sandbox,
        approval_policy="never",
        timeout_seconds=timeout,
    )


def _git(cwd: Path, args: Iterable[str]) -> str:
    try:
        proc = subprocess.run(
            ["git", "-C", str(cwd), *args],
            capture_output=True,
            text=True,
            errors="replace",
            timeout=GIT_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise BridgeError(
            "infrastructure_failure",
            "worktree_not_visible",
            "git could not inspect the registered worktree",
        ) from exc
    if proc.returncode != 0:
        raise BridgeError(
            "infrastructure_failure",
            "worktree_not_visible",
            "registered worktree is not a visible git worktree",
        )
    return proc.stdout.strip()


def resolve_codex() -> tuple[Path, str]:
    selected = shutil.which("codex")
    if not selected:
        raise BridgeError(
            "infrastructure_failure", "model_unavailable", "codex is not available on PATH"
        )
    try:
        codex_path = Path(selected).resolve(strict=True)
        proc = subprocess.run(
            [str(codex_path), "--version"],
            capture_output=True,
            text=True,
            errors="replace",
            timeout=VERSION_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise BridgeError(
            "infrastructure_failure", "model_unavailable", "codex version is unavailable"
        ) from exc
    version = next((line.strip() for line in proc.stdout.splitlines() if line.strip()), "")
    if proc.returncode != 0 or not version or len(version) > 256:
        raise BridgeError(
            "infrastructure_failure", "model_unavailable", "codex version check failed"
        )
    return codex_path, version


def _read_base_sha(worktree: Path, registered_base_sha: Any = None) -> str:
    marker = worktree / ".delegate-base"
    if marker.is_file():
        try:
            base = marker.read_text(encoding="utf-8").strip()
        except (OSError, UnicodeError) as exc:
            raise BridgeError(
                "infrastructure_failure", "worktree_not_visible", "base marker is unreadable"
            ) from exc
        if (
            registered_base_sha is not None
            and (
                not isinstance(registered_base_sha, str)
                or base.lower() != registered_base_sha.lower()
            )
        ):
            raise BridgeError(
                "infrastructure_failure",
                "worktree_not_visible",
                "worktree base marker disagrees with the delegation registry",
            )
    else:
        base = registered_base_sha
        if not isinstance(base, str) or not base:
            raise BridgeError(
                "infrastructure_failure",
                "worktree_not_visible",
                "registered worktree has no known base SHA",
            )
    if not isinstance(base, str) or not SHA_RE.fullmatch(base):
        raise BridgeError(
            "infrastructure_failure", "worktree_not_visible", "base marker is not a commit SHA"
        )
    _git(worktree, ["cat-file", "-e", f"{base}^{{commit}}"])
    return base.lower()


def resolve_claim(
    run_dir: Path,
    *,
    task_id: str,
    agent_id: str,
    role: str,
    policy: Policy,
) -> ClaimContext:
    """Validate lease, identity, physical path, git root, and base SHA."""

    now = time.time()
    with agent_log.Registry(run_dir) as registry:
        claim = registry.claims.get(agent_id)
        if not isinstance(claim, dict):
            raise BridgeError(
                "control_plane_failure", "mcp_invocation_invalid", "unknown agent_id"
            )
        if claim.get("task_id") != task_id or claim.get("role") != role:
            raise BridgeError(
                "policy_failure", "policy_violation", "task, role, and lease identity disagree"
            )
        attempt = claim.get("attempt")
        if not isinstance(attempt, int) or isinstance(attempt, bool) or attempt < 1:
            raise BridgeError(
                "control_plane_failure", "mcp_invocation_invalid", "lease attempt is missing"
            )
        if agent_log.termination_unconfirmed(claim):
            raise BridgeError(
                "infrastructure_failure",
                agent_log.TERMINATION_UNCONFIRMED_ERROR_CODE,
                "delegate termination is unconfirmed after an MCP timeout",
                exit_code=7,
            )
        if claim.get("state") in agent_log.TERMINAL_STATES or now >= claim.get("expires_at", 0):
            raise BridgeError(
                "infrastructure_failure",
                "delegate_startup_timeout",
                "delegate lease is not active",
            )
        registered = claim.get("worktree")
        if not isinstance(registered, str) or not registered:
            raise BridgeError(
                "infrastructure_failure", "worktree_missing", "lease has no registered worktree"
            )
        registered_base_sha = claim.get("base_sha")
        registered_path = Path(registered)

    if not registered_path.is_absolute():
        raise BridgeError(
            "infrastructure_failure", "worktree_not_visible", "registered worktree is not absolute"
        )
    if not registered_path.exists():
        raise BridgeError(
            "infrastructure_failure", "worktree_missing", "registered worktree does not exist"
        )
    if not registered_path.is_dir() or registered_path.is_symlink():
        raise BridgeError(
            "infrastructure_failure", "worktree_not_visible", "registered worktree is not a directory"
        )
    try:
        worktree = registered_path.resolve(strict=True)
    except OSError as exc:
        raise BridgeError(
            "infrastructure_failure", "worktree_not_visible", "worktree cannot be resolved"
        ) from exc
    if worktree != registered_path:
        raise BridgeError(
            "infrastructure_failure",
            "worktree_not_visible",
            "registered worktree resolves to a different path",
        )
    git_root = Path(_git(worktree, ["rev-parse", "--show-toplevel"])).resolve()
    if git_root != worktree:
        raise BridgeError(
            "infrastructure_failure",
            "worktree_not_visible",
            "git root differs from registered worktree",
        )
    base_sha = _read_base_sha(worktree, registered_base_sha)

    codex_path, codex_version = resolve_codex()
    with agent_log.Registry(run_dir) as registry:
        current = registry.claims.get(agent_id)
        now = time.time()
        if not isinstance(current, dict) or current.get("state") in agent_log.TERMINAL_STATES:
            raise BridgeError(
                "control_plane_failure", "mcp_invocation_invalid", "delegate lease disappeared"
            )
        if agent_log.termination_unconfirmed(current):
            raise BridgeError(
                "infrastructure_failure",
                agent_log.TERMINATION_UNCONFIRMED_ERROR_CODE,
                "delegate termination became unconfirmed during validation",
                exit_code=7,
            )
        if (
            current.get("task_id") != task_id
            or current.get("role") != role
            or current.get("attempt") != attempt
            or current.get("worktree") != str(registered_path)
        ):
            raise BridgeError(
                "control_plane_failure",
                "mcp_invocation_invalid",
                "delegate lease identity changed during validation",
            )
        current_base_sha = current.get("base_sha")
        if current_base_sha is not None and (
            not isinstance(current_base_sha, str)
            or not SHA_RE.fullmatch(current_base_sha)
            or current_base_sha.lower() != base_sha
        ):
            raise BridgeError(
                "infrastructure_failure",
                "worktree_not_visible",
                "registered base SHA changed during validation",
            )
        if now >= current.get("expires_at", 0):
            raise BridgeError(
                "infrastructure_failure",
                "delegate_startup_timeout",
                "delegate lease expired during validation",
            )
        semantic_attempts, infrastructure_attempts, _ = agent_log.task_counters(
            registry.claims, task_id
        )
        open_circuit, _ = agent_log.infrastructure_circuit_open(registry.claims, task_id)
        if open_circuit:
            raise BridgeError(
                "infrastructure_failure",
                "infrastructure_budget_exhausted",
                "infrastructure retry circuit is open",
                exit_code=7,
            )
        current.update({
            "base_sha": base_sha,
            "codex_path": str(codex_path),
            "codex_version": codex_version,
            "effective_model": policy.model,
            "effective_sandbox_policy": policy.sandbox,
        })
        registry.save()
        infrastructure_attempt = int(current.get("infrastructure_attempt") or infrastructure_attempts + 1)

    return ClaimContext(
        run_dir=run_dir,
        run_id=run_dir.name,
        task_id=task_id,
        agent_id=agent_id,
        role=role,
        attempt=attempt,
        worktree=worktree,
        base_sha=base_sha,
        semantic_attempt=semantic_attempts,
        infrastructure_attempt=infrastructure_attempt,
        codex_path=codex_path,
        codex_version=codex_version,
        policy=policy,
    )


def validate_prompt_file(prompt_file: str, ctx: ClaimContext) -> Path:
    if not isinstance(prompt_file, str) or not prompt_file:
        raise BridgeError(
            "control_plane_failure", "mcp_invocation_invalid", "prompt file is required"
        )
    candidate = Path(prompt_file)
    if not candidate.is_absolute():
        raise BridgeError(
            "control_plane_failure", "mcp_invocation_invalid", "prompt file must be absolute"
        )
    if candidate.is_symlink():
        raise BridgeError(
            "control_plane_failure", "mcp_invocation_invalid", "prompt file must not be a symlink"
        )
    try:
        resolved = candidate.resolve(strict=True)
        stat = resolved.stat()
    except (OSError, RuntimeError) as exc:
        raise BridgeError(
            "control_plane_failure", "mcp_invocation_invalid", "prompt file is unavailable"
        ) from exc
    run_dir = ctx.run_dir.resolve()
    if not (_is_within(resolved, run_dir) or _is_within(resolved, ctx.worktree)):
        raise BridgeError(
            "control_plane_failure",
            "mcp_invocation_invalid",
            "prompt file must be inside the active run or delegate worktree",
        )
    if not resolved.is_file() or stat.st_size > MAX_PROMPT_BYTES:
        raise BridgeError(
            "control_plane_failure", "mcp_invocation_invalid", "prompt file is not a regular bounded file"
        )
    try:
        resolved.read_bytes().decode("utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        raise BridgeError(
            "control_plane_failure", "mcp_invocation_invalid", "prompt file must be UTF-8"
        ) from exc
    return resolved


def telemetry_fields(ctx: ClaimContext, *, phase: str | None = None, prompt_path: Path | None = None) -> dict[str, Any]:
    return {
        "task_id": ctx.task_id,
        "agent_id": ctx.agent_id,
        "role": ctx.role,
        "infrastructure_attempt": ctx.infrastructure_attempt,
        "semantic_attempt": ctx.semantic_attempt,
        "worktree_path": str(ctx.worktree),
        "base_sha": ctx.base_sha,
        "codex_version": ctx.codex_version,
        "effective_model": ctx.policy.model,
        "effective_sandbox_policy": ctx.policy.sandbox,
        "phase": phase,
        "prompt_path": str(prompt_path) if prompt_path else None,
    }


def append_bridge_telemetry(
    run_dir: Path,
    event: str,
    *,
    ctx: ClaimContext | None = None,
    fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = dict(fields or {})
    if ctx is not None:
        payload = {**telemetry_fields(ctx), **payload}
    return pipeline_log.append_telemetry(run_dir, event, **payload)


def _record_refusal(
    run_dir: Path | None,
    args: argparse.Namespace,
    error: BridgeError,
) -> None:
    if run_dir is None:
        return
    try:
        agent_id = getattr(args, "agent_id", None)
        if agent_id:
            # Keep the failed claim from looking like a live, retryable
            # semantic delegate.  Physical lifecycle commands perform their
            # own quarantine check, and the result classification is durable
            # even when render refuses before the JS hand-off.
            _call_agent_log(
                run_dir,
                [
                    "delegate-result",
                    "--agent-id",
                    agent_id,
                    *( ["--task-id", args.task_id] if getattr(args, "task_id", None) else [] ),
                    *( ["--role", args.role] if getattr(args, "role", None) else [] ),
                    "--result-class",
                    error.result_class,
                    "--error-code",
                    error.error_code,
                ],
            )
    except Exception:  # noqa: BLE001 — refusal reporting cannot mask the refusal
        pass
    try:
        pipeline_log.append_telemetry(
            run_dir,
            "delegate_failed",
            task_id=getattr(args, "task_id", None),
            agent_id=getattr(args, "agent_id", None),
            role=getattr(args, "role", None),
            phase="bridge_validation",
            result_class=error.result_class,
            error_code=error.error_code,
            observability="caller_boundary",
        )
    except Exception:  # noqa: BLE001 — failure reporting cannot mask the refusal
        pass


def _static_command(*parts: str) -> str:
    return " ".join(_safe_shell(str(part)) for part in parts)


def _render_js(ctx: ClaimContext, prompt_path: Path) -> str:
    bridge = Path(__file__).resolve()
    python = Path(sys.executable).resolve()
    root = ROOT.resolve()
    run_id = ctx.run_id
    prompt_read = _static_command("cat", "--", str(prompt_path))
    telemetry_base = _static_command(
        str(python), str(bridge), "telemetry",
        "--run-id", run_id,
        "--task-id", ctx.task_id,
        "--agent-id", ctx.agent_id,
        "--role", ctx.role,
        "--infrastructure-attempt", str(ctx.infrastructure_attempt),
        "--semantic-attempt", str(ctx.semantic_attempt),
        "--worktree-path", str(ctx.worktree),
        "--base-sha", ctx.base_sha,
        "--codex-version", ctx.codex_version,
        "--effective-model", ctx.policy.model,
        "--effective-sandbox-policy", ctx.policy.sandbox,
        "--timeout-seconds", str(ctx.policy.timeout_seconds),
        "--prompt-path", str(prompt_path),
    )
    mark_started = _static_command(
        str(python), str(bridge), "mark-started",
        "--run-id", run_id, "--agent-id", ctx.agent_id,
        "--task-id", ctx.task_id, "--role", ctx.role, "--attempt", str(ctx.attempt),
    )
    result_base = _static_command(
        str(python), str(bridge), "result",
        "--run-id", run_id, "--agent-id", ctx.agent_id,
        "--task-id", ctx.task_id, "--role", ctx.role, "--attempt", str(ctx.attempt),
    )

    infra_codes = sorted(INFRASTRUCTURE_CODES)
    control_codes = sorted(CONTROL_PLANE_CODES)
    return f'''(async () => {{
  const root = {_json_string(str(root))};
  const promptReadCommand = {_json_string(prompt_read)};
  const quoteShell = (value) => "'" + String(value).replaceAll("'", "'\\\"'\\\"'") + "'";
  const telemetryBase = {_json_string(telemetry_base)};
  const markStartedCommand = {_json_string(mark_started)};
  const resultBase = {_json_string(result_base)};
  const timeoutSeconds = {ctx.policy.timeout_seconds};
  const clock = () => typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now() : Date.now();

  async function execCommand(command) {{
    if (typeof tools === "undefined" || typeof tools.exec_command !== "function") return null;
    return await tools.exec_command({{cmd: command, workdir: root}});
  }}

  async function telemetry(event, durationMs = null, resultClass = null, errorCode = null,
      phase = null, observability = "caller_boundary") {{
    try {{
      let command = telemetryBase + " --event " + quoteShell(event);
      if (durationMs !== null) command += " --duration-ms " + String(Math.max(0, Math.round(durationMs)));
      if (resultClass !== null) command += " --result-class " + quoteShell(resultClass);
      if (errorCode !== null) command += " --error-code " + quoteShell(errorCode);
      if (phase !== null) command += " --phase " + quoteShell(phase);
      command += " --observability " + quoteShell(observability);
      await execCommand(command);
    }} catch (_) {{
      // Telemetry must not turn a completed delegate response into a second
      // invocation.  The outer bridge already records the request boundary.
    }}
  }}

  async function classify(resultClass, errorCode) {{
    try {{
      await execCommand(resultBase + " --result-class " + quoteShell(resultClass) +
        (errorCode === null ? "" : " --error-code " + quoteShell(errorCode)));
    }} catch (_) {{}}
  }}

  async function failBeforeRequest(phase = "delegate_start") {{
    await classify("control_plane_failure", "mcp_invocation_invalid");
    await telemetry("delegate_last_event", 0, "control_plane_failure",
      "mcp_invocation_invalid", phase);
    await telemetry("delegate_failed", 0, "control_plane_failure",
      "mcp_invocation_invalid", phase);
    text(JSON.stringify({{ok: false, result_class: "control_plane_failure",
      error_code: "mcp_invocation_invalid"}}));
  }}

  let prompt;
  try {{
    const promptResponse = await execCommand(promptReadCommand);
    if (promptResponse && (promptResponse.isError === true ||
        (typeof promptResponse.exit_code === "number" && promptResponse.exit_code !== 0))) {{
      throw new Error("prompt file read failed");
    }}
    if (promptResponse && typeof promptResponse.output === "string") {{
      prompt = promptResponse.output;
    }} else if (promptResponse && typeof promptResponse.stdout === "string") {{
      prompt = promptResponse.stdout;
    }} else if (promptResponse && Array.isArray(promptResponse.content)) {{
      prompt = promptResponse.content
        .filter((item) => item && item.type === "text")
        .map((item) => item.text)
        .join("");
    }}
    if (typeof prompt !== "string") throw new Error("prompt file output is unavailable");
  }} catch (_) {{
    await failBeforeRequest("prompt_read");
    return;
  }}

  let startedResponse;
  try {{
    startedResponse = await execCommand(markStartedCommand);
    if (startedResponse && (startedResponse.isError === true || startedResponse.error ||
        (typeof startedResponse.exit_code === "number" && startedResponse.exit_code !== 0))) {{
      await failBeforeRequest();
      return;
    }}
  }} catch (_) {{
    await failBeforeRequest();
    return;
  }}

  await telemetry("mcp_request_started", null, null, null, "mcp_request");
  const startedAt = clock();
  let response = null;
  let failure = null;
  let timer = null;
  try {{
    const request = tools.mcp__codex__codex({{
      cwd: {_json_string(str(ctx.worktree))},
      sandbox: {_json_string(ctx.policy.sandbox)},
      "approval-policy": {_json_string(ctx.policy.approval_policy)},
      model: {_json_string(ctx.policy.model)},
      prompt
    }});
    const timeout = new Promise((_, reject) => {{
      timer = setTimeout(() => {{
        const error = new Error("nested MCP request timed out");
        error.code = "mcp_transport_timeout";
        reject(error);
      }}, timeoutSeconds * 1000);
    }});
    response = await Promise.race([request, timeout]);
  }} catch (error) {{
    failure = error;
  }} finally {{
    if (timer !== null) clearTimeout(timer);
  }}

  const elapsedMs = Math.max(0, Math.round(clock() - startedAt));
  const infrastructureCodes = new Set({json.dumps(infra_codes, ensure_ascii=False)});
  const controlCodes = new Set({json.dumps(control_codes, ensure_ascii=False)});
  function classifyFailure(failedValue, responseValue) {{
    const candidates = [
      failedValue && failedValue.code,
      failedValue && failedValue.error_code,
      responseValue && responseValue.error_code,
      responseValue && responseValue.error && responseValue.error.code,
    ];
    for (const candidate of candidates) {{
      if (typeof candidate === "string" && infrastructureCodes.has(candidate)) return candidate;
      if (typeof candidate === "string" && controlCodes.has(candidate)) return candidate;
    }}
    const message = [
      failedValue && failedValue.message,
      responseValue && responseValue.error && responseValue.error.message,
    ].filter((value) => typeof value === "string").join(" ");
    if (/RTM_NEWADDR|network namespace|user namespace|bwrap/i.test(message)) return "codex_sandbox_unavailable";
    if (/timed?\\s*out|timeout/i.test(message)) return "mcp_transport_timeout";
    if (/unknown model|model.*(not found|unavailable|invalid)/i.test(message)) return "model_unavailable";
    if (/worktree.*(missing|not visible|does not exist)/i.test(message)) return "worktree_not_visible";
    return "mcp_invocation_invalid";
  }}
  const failedResponse = response && (response.isError === true || Boolean(response.error));
  const failed = Boolean(failure) || Boolean(failedResponse);
  if (response !== null) {{
    await telemetry("delegate_first_event", elapsedMs, null, null, "response_boundary_proxy",
      "caller_boundary_proxy");
  }}
  if (failed) {{
    const errorCode = classifyFailure(failure, response);
    const resultClass = infrastructureCodes.has(errorCode) ? "infrastructure_failure" : "control_plane_failure";
    await telemetry("delegate_last_event", elapsedMs, resultClass, errorCode, "response_boundary_proxy",
      "caller_boundary_proxy");
    await classify(resultClass, errorCode);
    await telemetry("delegate_failed", elapsedMs, resultClass, errorCode, "delegate_result");
    text(JSON.stringify({{ok: false, result_class: resultClass, error_code: errorCode,
      elapsed_ms: elapsedMs, timeout_seconds: timeoutSeconds}}));
    return;
  }}
  await telemetry("delegate_last_event", elapsedMs, null, null, "response_boundary_proxy",
    "caller_boundary_proxy");
  await classify("success", null);
  await telemetry("delegate_completed", elapsedMs, "success", null, "delegate_result");
  let emittedResponse = false;
  if (response && Array.isArray(response.content)) {{
    for (const item of response.content) {{
      if (item && item.type === "text" && typeof item.text === "string") {{
        text(item.text);
        emittedResponse = true;
      }}
    }}
  }}
  if (!emittedResponse && response && response.structuredContent &&
      typeof response.structuredContent.content === "string") {{
    text(response.structuredContent.content);
  }}
  text(JSON.stringify({{ok: true, result_class: "success", elapsed_ms: elapsedMs,
    timeout_seconds: timeoutSeconds}}));
}})();
'''


def cmd_render(args: argparse.Namespace) -> int:
    run_dir: Path | None = None
    try:
        task_id = _validate_identifier(args.task_id, "task_id")
        agent_id = _validate_identifier(args.agent_id, "agent_id")
        role = _validate_identifier(args.role, "role", ROLE_RE)
        run_dir = resolve_run_dir(args.run_id)
        policy = load_policy(role)
        ctx = resolve_claim(
            run_dir, task_id=task_id, agent_id=agent_id, role=role, policy=policy
        )
        # Enforce the bounded infrastructure backoff at the deterministic
        # bridge boundary.  The claim has already been opened by the stable
        # worktree CLI, but no LLM/MCP call exists yet, so this cannot consume
        # a semantic attempt.  The delay is capped by agent_log.py (0, 1, 2,
        # then 4/8 seconds) and the circuit breaker was checked above.
        previous_infrastructure = max(0, ctx.infrastructure_attempt - 1)
        backoff_seconds = agent_log.infrastructure_backoff_seconds(previous_infrastructure)
        if backoff_seconds:
            time.sleep(backoff_seconds)
        prompt_path = validate_prompt_file(args.prompt_file, ctx)
        started = time.monotonic()
        append_bridge_telemetry(
            run_dir,
            "delegate_invocation_started",
            ctx=ctx,
            fields={
                "phase": "bridge_validation",
                "prompt_path": str(prompt_path),
                "duration_ms": round((time.monotonic() - started) * 1_000),
                "observability": "caller_boundary",
            },
        )
        # stdout is intentionally only the snippet.  The caller must paste it
        # into the next exec tool verbatim; no prompt bytes cross this boundary.
        sys.stdout.write(_render_js(ctx, prompt_path))
        return 0
    except BridgeError as exc:
        _record_refusal(run_dir, args, exc)
        raise


def _call_agent_log(run_dir: Path, argv: list[str]) -> tuple[int, str]:
    old_dir = os.environ.get("SV_RUN_DIR")
    old_id = os.environ.get("SV_RUN_ID")
    os.environ["SV_RUN_DIR"] = str(run_dir)
    os.environ["SV_RUN_ID"] = run_dir.name
    output = io.StringIO()
    try:
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(io.StringIO()):
            rc = agent_log.main(argv)
    finally:
        if old_dir is None:
            os.environ.pop("SV_RUN_DIR", None)
        else:
            os.environ["SV_RUN_DIR"] = old_dir
        if old_id is None:
            os.environ.pop("SV_RUN_ID", None)
        else:
            os.environ["SV_RUN_ID"] = old_id
    return rc, output.getvalue()


def cmd_mark_started(args: argparse.Namespace) -> int:
    run_dir = resolve_run_dir(args.run_id)
    agent_id = _validate_identifier(args.agent_id, "agent_id")
    argv = ["delegate-start", "--agent-id", agent_id]
    if args.task_id:
        argv.extend(["--task-id", args.task_id])
    if args.role:
        argv.extend(["--role", args.role])
    if args.attempt is not None:
        argv.extend(["--attempt", str(args.attempt)])
    rc, output = _call_agent_log(run_dir, argv)
    if rc == 7:
        raise BridgeError(
            "infrastructure_failure",
            agent_log.TERMINATION_UNCONFIRMED_ERROR_CODE,
            "delegate lease is quarantined after an unconfirmed termination",
            exit_code=7,
        )
    if rc != 0:
        raise BridgeError("control_plane_failure", "mcp_invocation_invalid", "delegate lease could not start")
    if output:
        sys.stdout.write(output)
    return 0


def cmd_result(args: argparse.Namespace) -> int:
    run_dir = resolve_run_dir(args.run_id)
    agent_id = _validate_identifier(args.agent_id, "agent_id")
    try:
        agent_log.validate_result(args.result_class, args.error_code)
    except ValueError as exc:
        raise BridgeError("control_plane_failure", "mcp_invocation_invalid", "invalid delegate result") from exc
    argv = ["delegate-result", "--agent-id", agent_id, "--result-class", args.result_class]
    if args.task_id:
        argv.extend(["--task-id", args.task_id])
    if args.role:
        argv.extend(["--role", args.role])
    if args.attempt is not None:
        argv.extend(["--attempt", str(args.attempt)])
    if args.error_code:
        argv.extend(["--error-code", args.error_code])
    rc, output = _call_agent_log(run_dir, argv)
    if rc == 7:
        raise BridgeError(
            "infrastructure_failure",
            agent_log.TERMINATION_UNCONFIRMED_ERROR_CODE,
            "delegate result cannot change a quarantined lease",
            exit_code=7,
        )
    if rc != 0:
        raise BridgeError("control_plane_failure", "mcp_invocation_invalid", "delegate result could not be recorded")
    if output:
        sys.stdout.write(output)
    return 0


def cmd_telemetry(args: argparse.Namespace) -> int:
    run_dir = resolve_run_dir(args.run_id)
    if args.result_class:
        try:
            agent_log.validate_result(args.result_class, args.error_code)
        except ValueError as exc:
            raise BridgeError("control_plane_failure", "mcp_invocation_invalid", "invalid telemetry result") from exc
    for name, value in (
        ("task_id", args.task_id), ("agent_id", args.agent_id), ("role", args.role),
        ("worktree_path", args.worktree_path), ("base_sha", args.base_sha),
        ("prompt_path", args.prompt_path),
    ):
        if value is not None and "\x00" in value:
            raise BridgeError("control_plane_failure", "mcp_invocation_invalid", f"invalid {name}")
    if args.infrastructure_attempt is not None and args.infrastructure_attempt < 1:
        raise BridgeError("control_plane_failure", "mcp_invocation_invalid", "invalid infrastructure attempt")
    if args.semantic_attempt is not None and args.semantic_attempt < 0:
        raise BridgeError("control_plane_failure", "mcp_invocation_invalid", "invalid semantic attempt")
    if args.duration_ms is not None and args.duration_ms < 0:
        raise BridgeError("control_plane_failure", "mcp_invocation_invalid", "invalid duration")
    if args.timeout_seconds is not None and (
        not math.isfinite(args.timeout_seconds) or args.timeout_seconds <= 0
    ):
        raise BridgeError("control_plane_failure", "mcp_invocation_invalid", "invalid timeout")
    fields = {
        "task_id": args.task_id,
        "agent_id": args.agent_id,
        "role": args.role,
        "infrastructure_attempt": args.infrastructure_attempt,
        "semantic_attempt": args.semantic_attempt,
        "worktree_path": args.worktree_path,
        "base_sha": args.base_sha,
        "codex_version": args.codex_version,
        "effective_model": args.effective_model,
        "effective_sandbox_policy": args.effective_sandbox_policy,
        "phase": args.phase,
        "duration_ms": args.duration_ms,
        "result_class": args.result_class,
        "error_code": args.error_code,
        "timeout_seconds": args.timeout_seconds,
        "observability": args.observability or "caller_boundary",
        "prompt_path": args.prompt_path,
    }
    record = pipeline_log.append_telemetry(run_dir, args.event, **fields)
    print(json.dumps(record, ensure_ascii=False))
    return 0


def cmd_lifecycle(args: argparse.Namespace) -> int:
    run_dir = resolve_run_dir(args.run_id)
    event = args.event
    if event not in {"worktree_close_started", "worktree_abandoned", "worktree_closed"}:
        raise BridgeError("control_plane_failure", "mcp_invocation_invalid", "invalid lifecycle event")
    agent_id = _validate_identifier(args.agent_id, "agent_id")
    with agent_log.Registry(run_dir) as registry:
        claim = registry.claims.get(agent_id)
        if not isinstance(claim, dict):
            raise BridgeError("control_plane_failure", "mcp_invocation_invalid", "unknown agent_id")
        if agent_log.termination_unconfirmed(claim):
            raise BridgeError(
                "infrastructure_failure",
                agent_log.TERMINATION_UNCONFIRMED_ERROR_CODE,
                "worktree lifecycle is blocked while delegate termination is unconfirmed",
                exit_code=7,
            )
        task_id = claim.get("task_id")
        role = claim.get("role")
        worktree = claim.get("worktree")
        base_sha = claim.get("base_sha")
        infra = claim.get("infrastructure_attempt")
        semantic = claim.get("semantic_attempt")
        codex_version = claim.get("codex_version") or os.environ.get("SV_CODEX_VERSION")
        model = claim.get("effective_model")
        sandbox = claim.get("effective_sandbox_policy")
    fields = {
        "task_id": task_id,
        "agent_id": agent_id,
        "role": role,
        "infrastructure_attempt": infra,
        "semantic_attempt": semantic,
        "worktree_path": worktree,
        "base_sha": base_sha,
        "codex_version": codex_version,
        "effective_model": model,
        "effective_sandbox_policy": sandbox,
        "phase": "worktree_lifecycle",
        "observability": "caller_boundary",
    }
    record = pipeline_log.append_telemetry(run_dir, event, **fields)
    print(json.dumps(record, ensure_ascii=False))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="delegate_invoke.py", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    render = sub.add_parser("render", help="validate a delegation and print its JS bridge")
    render.add_argument("--task-id", required=True)
    render.add_argument("--agent-id", required=True)
    render.add_argument("--role", required=True)
    render.add_argument("--prompt-file", required=True)
    render.add_argument("--run-id", default=None)

    started = sub.add_parser("mark-started", help="record observable nested invocation start")
    started.add_argument("--run-id", required=True)
    started.add_argument("--agent-id", required=True)
    started.add_argument("--task-id", default=None)
    started.add_argument("--role", default=None)
    started.add_argument("--attempt", type=int, default=None)

    result = sub.add_parser("result", help="record a structured delegate result")
    result.add_argument("--run-id", required=True)
    result.add_argument("--agent-id", required=True)
    result.add_argument("--task-id", default=None)
    result.add_argument("--role", default=None)
    result.add_argument("--attempt", type=int, default=None)
    result.add_argument("--result-class", required=True, choices=sorted(RESULT_CLASSES))
    result.add_argument("--error-code", default=None)

    telemetry = sub.add_parser("telemetry", help="append one structured lifecycle event")
    telemetry.add_argument("--run-id", required=True)
    telemetry.add_argument("--event", required=True, choices=sorted(pipeline_log.DELEGATE_TELEMETRY_EVENTS))
    telemetry.add_argument("--task-id", default=None)
    telemetry.add_argument("--agent-id", default=None)
    telemetry.add_argument("--role", default=None)
    telemetry.add_argument("--infrastructure-attempt", type=int, default=None)
    telemetry.add_argument("--semantic-attempt", type=int, default=None)
    telemetry.add_argument("--worktree-path", default=None)
    telemetry.add_argument("--base-sha", default=None)
    telemetry.add_argument("--codex-version", default=None)
    telemetry.add_argument("--effective-model", default=None)
    telemetry.add_argument("--effective-sandbox-policy", choices=sorted(SANDBOX_POLICIES), default=None)
    telemetry.add_argument("--phase", default=None)
    telemetry.add_argument("--duration-ms", type=int, default=None)
    telemetry.add_argument("--result-class", choices=sorted(RESULT_CLASSES), default=None)
    telemetry.add_argument("--error-code", default=None)
    telemetry.add_argument("--timeout-seconds", type=float, default=None)
    telemetry.add_argument("--observability", default=None)
    telemetry.add_argument("--prompt-path", default=None)

    lifecycle = sub.add_parser("lifecycle", help="record worktree lifecycle boundary")
    lifecycle.add_argument("--run-id", required=True)
    lifecycle.add_argument("--agent-id", required=True)
    lifecycle.add_argument("--event", required=True, choices=["worktree_close_started", "worktree_closed", "worktree_abandoned"])

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return {
            "render": cmd_render,
            "mark-started": cmd_mark_started,
            "result": cmd_result,
            "telemetry": cmd_telemetry,
            "lifecycle": cmd_lifecycle,
        }[args.command](args)
    except BridgeError as exc:
        print(json.dumps({
            "ok": False,
            "result_class": exc.result_class,
            "error_code": exc.error_code,
            "message": _bounded(exc.message, 512),
        }, ensure_ascii=False), file=sys.stderr)
        return exc.exit_code
    except (OSError, ValueError, TypeError) as exc:
        print(json.dumps({
            "ok": False,
            "result_class": "control_plane_failure",
            "error_code": "mcp_invocation_invalid",
            "message": _bounded(str(exc), 512),
        }, ensure_ascii=False), file=sys.stderr)
        return 20


if __name__ == "__main__":
    raise SystemExit(main())
