# Deterministic delegate invocation protocol

This protocol is part of the production orchestrator prompt. It applies to a
Codex orchestrator running in `tools/run_episode.sh` and to every nested Codex
delegate.

## Why the bridge exists

The installed Codex CLI (`codex-cli 0.149.0`) exposes the configured `codex`
MCP server as `tools.mcp__codex__codex(...)` in the observed production run
logs. The exact JS exposure is not documented by `codex --help` or the
official MCP pages, so treat that part as an installation-specific
hypothesis. The prompt must nevertheless be a runtime value read from a
file, never text interpolated into JavaScript source.

The available JS `exec` host is a V8 isolate without Node's `require`,
`process`, or `performance` globals. The generated snippet therefore uses a
statically shell-quoted `tools.exec_command` call to `cat` the validated
prompt file and takes its stdout as the runtime string. This is the
file-based-payload equivalent of `fs.readFileSync`; the file content is never
parsed as JavaScript, so backticks, `${...}`, quotes, shell syntax, and Unicode
remain ordinary prompt data.

The bridge is `tools/delegate_invoke.py`. Its `render` command prints a
complete JavaScript snippet only after validation. The snippet has one
LLM-controlled input in its source: a validated absolute prompt-file path.
The nested `cwd`, `sandbox`, `model`, approval policy, and timeout are all
resolved by the bridge from `tools/delegate_policy.json` and the registered
lease.

## Required sequence

1. Open a worktree with the stable CLI contract:

   ```text
   python3 tools/delegate_worktree.py open --task-id <task-id> --role <role>
   ```

   Save the returned `agent_id`, `worktree`, and `base` values. Do not invent a
   cwd. The worktree output is registered in the run's `delegations.json`.

2. Write the complete delegate prompt with the normal file-write tool to an
   absolute path below the active run, for example:

   ```text
   $SV_RUN_DIR/delegate-prompts/<agent-id>.md
   ```

   Do not put the prompt body in JavaScript source and do not pass a free-form
   model, sandbox, cwd, or approval-policy argument.

3. Ask the bridge for the invocation source:

   ```text
   python3 tools/delegate_invoke.py render \
     --task-id <task-id> --agent-id <agent-id> --role <role> \
     --prompt-file "$SV_RUN_DIR/delegate-prompts/<agent-id>.md"
   ```

   Paste the bridge's stdout into the next `exec` tool literally. Do not edit
   the generated JavaScript. A validation error has no stdout snippet and is a
   control-plane/infrastructure failure; do not spend a semantic retry on it.

4. The generated source records the observable nested lifecycle: start,
   request start, response boundary, result classification, and completion or
   failure. Its timeout is measured with the runtime's monotonic
   `performance.now()` clock when available, with a `Date.now()` fallback, and
   records both the configured `timeout_seconds` and measured `elapsed_ms`.

5. For a semantic result that is not an ordinary successful response, classify
   it before closing the worktree:

   ```text
   python3 tools/delegate_invoke.py result --run-id "$SV_RUN_ID" \
     --agent-id <agent-id> --result-class semantic_failure
   ```

   For an infrastructure or control-plane result, use one of the stable error
   codes accepted by `tools/agent_log.py`, for example
   `mcp_transport_timeout` or `mcp_invocation_invalid`. A successful nested
   response is classified by the generated bridge as `success`.

   A `mcp_transport_timeout` is special: `Promise.race` stops waiting but does
   not prove that the nested process stopped. The bridge records
   `termination_unconfirmed` and leaves the claim/worktree in quarantine. Do
   not close, abandon, delete, or retry that task. After checking the host
   independently, an operator may attest termination explicitly:

   ```text
   python3 tools/agent_log.py delegate-confirm-termination \
     --agent-id <agent-id> --evidence "<external process check>"
   ```

   Only after that confirmation may the normal release/abandon and worktree
   lifecycle commands proceed. Until then the stable error code is
   `delegate_termination_unconfirmed`; it is an infrastructure quarantine,
   not a semantic failure or a completed infrastructure retry.

6. Record the close boundary and then use the worktree CLI (it remains the
   owner of physical worktree operations):

   ```text
   python3 tools/delegate_invoke.py lifecycle --run-id "$SV_RUN_ID" \
     --agent-id <agent-id> --event worktree_close_started
   python3 tools/delegate_worktree.py close --agent-id <agent-id> \
     --allow <approved-relative-path> [--allow ...]
   ```

   If the delegate is unrecoverable, use the `abandon` command; its event is
   normalized to `worktree_abandoned`. The `open`/`close` CLI remains the
   owner of physical worktree operations and enforces timeout quarantine.

## Retry and telemetry rules

Semantic attempts are incremented only after the generated bridge records
`delegate_started` and the release has a `success` or `semantic_failure`
classification. Sandbox startup, RTM_NEWADDR, model/runtime unavailability,
MCP transport timeout, malformed invocation, and worktree visibility failures
use a separate bounded infrastructure budget (three attempts, with a circuit
breaker after two identical errors). A transport timeout first enters
`termination_unconfirmed` quarantine; it is not counted in that budget and the
circuit stays closed to all new attempts until termination is confirmed. The
bridge enforces the bounded exponential backoff before rendering a retry (and
`agent_log.py` reports the same machine-readable recommendation). A failed
sandbox doctor prevents every Codex attempt in the episode; it is not run for
the Claude runner.

`events.jsonl` contains structured lifecycle events. It records paths and the
prompt-file reference, not the prompt body. MCP-internal token/progress events
are not exposed as a stable caller API by this installed runtime, so the
telemetry marks the caller-visible request/response boundaries with
`observability: caller_boundary`; the `delegate_first_event` and
`delegate_last_event` names are explicitly `caller_boundary_proxy` records,
not claims about unavailable MCP-internal progress events.

The policy source is deliberately small and deterministic:
`tools/delegate_policy.json`. `scriptwriter` and `animation-director` use
`workspace-write`, while `critic` uses `read-only`. All three use the single
canonical model `gpt-5.6-luna`. A director's cwd is its registered worktree;
the repository ROOT is not an output location.

## Investigation references

The official Codex documentation describes configured MCP servers and the
non-interactive `codex exec` JSONL mode, but does not document a separate
native nested-delegate API or the JS exposure used by this installed host:

- <https://developers.openai.com/codex/extend/mcp/>
- <https://developers.openai.com/codex/non-interactive-mode/>

The local checks inspected `codex --help`, `codex exec --help`,
`codex mcp-server --help`, the installed standalone package, the project Codex
config, and a harmless top-level `codex exec --json` MCP call. The JSONL probe
emitted `mcp_tool_call` with server `codex`, tool `codex`, and structured
arguments, then stopped at `MCP tool call requires approval, but approval
policy is never`; it did not run a nested delegate. This confirms the
caller-visible structured MCP call record, not the internal JS implementation.
A direct probe of the available V8 `exec` host confirmed the missing Node
globals described above and that `tools.exec_command` returns stdout in its
`output` field unchanged. No command-line option or official package
documentation exposed a separate structured nested-delegate call; the exact
internal JS exposure remains the explicit hypothesis above. These checks did
not modify a worktree or consume a semantic delegate attempt.
