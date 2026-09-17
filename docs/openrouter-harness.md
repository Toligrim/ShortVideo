# OpenRouter harness for ShortVideo

Status: staging runner. `codex` remains the production scheduler profile until parity runs are accepted by the operator.

## Current model layout

The current critic is a script critic before animation/TTS, not a visual critic. Therefore the text/control roles use the same inexpensive model:

- orchestrator — `deepseek/deepseek-v4-flash-0731`
- scriptwriter — `deepseek/deepseek-v4-flash-0731`
- critic — `deepseek/deepseek-v4-flash-0731`
- animation-director — `deepseek/deepseek-v4-flash-0731`
- compaction — `deepseek/deepseek-v4-flash-0731`

`deepseek/deepseek-v4.1-flash` is an internal vision backend used only when `read_file` receives an image that the director needs to inspect.

## Harness boundary

The harness talks directly to `POST https://openrouter.ai/api/v1/chat/completions` through `httpx`. There is no LangChain, LiteLLM, PydanticAI, OpenRouter Agent SDK or OpenAI SDK.

The model sees exactly eight tools, in fixed order: `read_file`, `write_file`, `edit_file`, `grep`, `glob`, `bash`, `web_search`, `web_fetch`.

Delegation is control-plane logic and is not a ninth tool. The orchestrator issues the documented `internal-delegate` command through `bash`; `ControlMixin` intercepts the exact argv before shell execution, opens the existing lease/worktree, starts a fresh role session, validates touched paths and closes through `delegate_worktree.py`.

## Context management

Active context is intentionally kept far below the advertised model window. The current soft/hard budgets are:

| role | cleanup | compaction/hard |
|---|---:|---:|
| orchestrator | 32k | 48k |
| scriptwriter | 64k | 96k |
| critic | 64k | 96k |
| animation-director | 96k | 144k |

Old large tool results are evicted first; durable state stays on disk. A low-effort DeepSeek compaction call is used only when deterministic cleanup is insufficient.

## Sandbox

Normal model-issued `bash` runs under bubblewrap with a private PID namespace, private persistent `/tmp`, no external network and scrubbed API/publisher/proxy credentials. Scriptwriter/director/orchestrator receive workspace-write; critic is workspace read-only. Known-dangerous process, namespace, network and destructive git commands are denied before bwrap.

The supervisor owns all network activity. `web_search` uses Exa. `web_fetch` validates public HTTP(S) targets, pins the validated IP, revalidates redirects, extracts readable text with Trafilatura and uses headless Chromium only as a restricted-proxy fallback for JS-only pages.

## Vision

Images are not inserted into the text-only V4 Flash conversation. `read_file` detects PNG/JPEG/WebP, calls the configured V4.1 Flash vision backend in the supervisor and returns a concise analysis to the director. The script critic remains text-only.

## Cost accounting

Every OpenRouter generation is appended to `runs/<run_id>/openrouter-usage.jsonl` using the provider-returned `usage` object. `finalize-cost` aggregates the real `usage.cost` and cache/token details into `openrouter-cost.json`, the normal run manifest and the matching `runs/index.jsonl` row. No parallel billing database is created.

## Staging and rollback

The unattended `producer_scheduler.py` remains hard-pinned to the existing Codex/Luna production path. Manual OpenRouter parity runs are started with `tools/producer_openrouter_once.py` after `openrouter_doctor.py` passes on the Raspberry Pi.

Do not switch production cron until the Pi has passed the sandbox doctor, role/worktree integration, director `tsc` + Remotion still/vision checks, TTS bridge and several full parity runs. The existing Codex runner remains the rollback path throughout staging.
