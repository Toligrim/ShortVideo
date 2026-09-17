# OpenRouter harness for ShortVideo

Status: staging runner. `codex` remains the production scheduler profile until parity runs are accepted by the operator. PR #1 must remain Draft until Raspberry Pi acceptance.

## Current model layout

The critic is a script/source gate before animation/TTS, not a final visual critic. Text/control roles use `deepseek/deepseek-v4-flash-0731`: orchestrator, scriptwriter, critic, animation-director and context compaction. `deepseek/deepseek-v4.1-flash` is an internal vision helper used only when the director reads PNG/JPEG/WebP.

## Harness boundary

The harness calls `POST https://openrouter.ai/api/v1/chat/completions` directly with `httpx`; no LangChain, LiteLLM, PydanticAI, OpenAI SDK or OpenRouter Agent SDK is used. OpenRouter requests keep `provider.sort = "throughput"` and `provider.require_parameters = false` (changed from `"price"`/`true` on 2026-09-17: with `require_parameters` true, only 1 of 29 `deepseek/deepseek-v4-flash-0731` endpoints supported the harness's exact parameter set, so sort order and fallbacks had nothing else to route to and every call 429'd on that one saturated, non-BYOK shared-pool endpoint; the account pays for reliable capacity instead of getting stuck on the cheapest/only saturated one - accepted trade-off: a provider may silently drop an unsupported parameter instead of being excluded).

The model sees exactly eight tools, in fixed order: `read_file`, `write_file`, `edit_file`, `grep`, `glob`, `bash`, `web_search`, `web_fetch`. Delegation to scriptwriter/critic/animation-director is internal control-plane logic and is not a ninth tool. Existing detached worktrees, leases, allowlists and integration remain owned by `delegate_worktree.py` and `delegate_policy.json`.

## Hermes-derived web research subsystem

This is a static ShortVideo-specific implementation, not a Hermes dependency or plugin framework. Attribution and the exact upstream reference are in `docs/hermes-web-attribution.md`.

### Search

Model surface is intentionally small: `web_search(query, limit=5)`. The provider is host-side.

- Primary: self-hosted SearXNG configured by `SEARXNG_URL`.
- Request shape: `GET <SEARXNG_URL>/search?q=<query>&format=json&pageno=1`.
- Results are normalized to title/url/description/position/score and sorted by SearXNG score.
- Search queries are case-folded and whitespace-normalized for caching.
- Limit buckets are 5 and 10, so callers requesting smaller limits can share one cached backend result.
- Search TTL is 20 minutes by default. Search results are reusable across runs. Identical concurrent requests are coalesced within a process and across Linux harness/delegate processes: exact keys use the normal in-memory flight table, while processes coordinate through 64 fixed advisory-lock shards and recheck disk cache after acquiring the shard. The fixed shard set avoids an unbounded lock-file table.
- Disk hits preserve the original `expires_at`; loading a near-expiry entry into memory does not grant it another full TTL.
- Failed searches are not cached.

Optional fallback: keyed Firecrawl REST search, enabled only when `FIRECRAWL_API_KEY` is present. No Firecrawl SDK, keyless cloud ring, Nous gateway or provider registry is imported. If SearXNG is healthy, Firecrawl is not used. If neither SearXNG nor the keyed fallback is usable, doctor fails closed.

`EXA_API_KEY` is no longer required or used by the OpenRouter web subsystem.

### Fetch / extraction

`web_fetch` accepts either the backward-compatible `url` or `urls` with one to five entries, plus `max_chars` (default 15000) and `render_js` (`auto` or `never`).

Every requested URL goes through safety gates before any cache lookup: normalization/IDNA, credentials and sensitive-query refusal, public-IP DNS validation, allowed-port policy and SSRF checks. A cache hit skips only network/extraction; it never skips these controls.

On a miss the pipeline is deterministic:

1. DNS is resolved and the validated public IP is pinned for the connection.
2. Redirects are re-normalized and revalidated before the next hop.
3. Static bytes are fetched with byte and wall-clock limits.
4. Trafilatura produces clean Markdown/text.
5. Inline `data:image/...;base64,...` payloads are replaced by `[IMAGE]` / `[IMAGE: alt]`.
6. Only when an HTML page is effectively JS-empty and `render_js=auto`, a restricted headless Chromium fallback is attempted. Its proxy allows only the already validated origin/port and pins the selected public IP; localhost/private cross-origin subrequests are denied.
7. No LLM summarizes web pages before the role model sees them.

Batch workers may finish out of order. Results are associated and cached only when they explicitly identify one of the original requested normalized URLs; positional association is forbidden, so a missing/reordered result cannot poison another URL's cache key.

### Extract cache and large pages

Clean successful page text is stored in a disk-backed cross-run cache. Default TTL is 20 minutes, keys include normalized URL + extraction/render mode + provider revision, and the index is capped at 500 entries. Index/content writes are atomic; the extract index also uses a Linux inter-process lock to avoid lost updates. Failed/unsafe/incomplete extractions are not indexed as successful pages. A corrupt index degrades to a cache miss instead of aborting the run.

The maximum complete cached page is 2,000,000 clean characters. When model output exceeds `max_chars`, the full clean page is spilled under the shared web-cache namespace and the model gets approximately 75% head + 25% tail, cut on line boundaries where practical, plus an explicit `[TRUNCATED]` footer. `read_file` can read only model-readable `@web-cache/pages/...` and `@web-cache/extract/...` paths; writes and arbitrary host paths remain denied. If a page itself exceeds the 2,000,000-character storage ceiling, the spill is explicitly marked incomplete rather than pretending to contain the full page.

Default cache root is `~/.cache/shortvideo/openrouter-web`; override with `SHORTVIDEO_WEB_CACHE_DIR`. Override TTL with `SHORTVIDEO_WEB_CACHE_TTL_SECONDS`.

### SSRF policy

`web_fetch` fails closed for localhost/private/link-local/reserved/multicast/unspecified IPs, CGNAT `100.64.0.0/10`, cloud metadata targets including `169.254.169.254` and `100.100.100.200`, IPv4-mapped IPv6 forms, URL credentials, sensitive query parameters, disallowed ports, public hostnames resolving to any non-public answer, and public-to-private redirects. IDNA hostnames are normalized before DNS. Chromium uses the restricted pinned-origin proxy rather than unrestricted browser networking.

The search backend URL is trusted operator configuration and lives outside model-controlled bash. `OPENROUTER_*`, `SEARXNG_*`, `FIRECRAWL_*`, legacy `EXA_*`, Gemini, Telegram and other secret families are stripped from the model shell environment.

## Context management

Active context stays far below advertised model windows: orchestrator 32k/48k soft-hard; scriptwriter 64k/96k; critic 64k/96k; animation-director 96k/144k. Old large tool results are evicted first and durable state lives on disk. DeepSeek compaction is used only after deterministic cleanup.

For the director, `.claude/skills/animator/catalog.md` is a large lookup resource, not a system prefix: use `grep` to find the relevant visual/type and then `read_file` the needed line range. Small core style/motion documents may be read normally. This is consistent with the OpenRouter system rule to search long files before reading ranges.

## Sandbox

Normal model-issued `bash` stays under bubblewrap with private PID/network namespaces, private persistent `/tmp`, no external network and scrubbed credentials. Writer roles get workspace-write; critic is workspace read-only. The supervisor remains outside bwrap and owns OpenRouter/search/fetch network I/O. The dedicated ShortVideo AppArmor profile remains separate from the existing Codex profile.

A fresh detached delegate worktree never gets its own `npm ci` (no network in the sandbox), so `BubblewrapSandbox` read-only binds the trusted supervisor's own `video/node_modules` into the worktree, plus a second, writable overlay bind sourced from the sandbox's private scratch dir at just `node_modules/.cache` (remotion/webpack hard-write their build cache there with no override, and would otherwise fail with `EROFS` against the read-only bind). Renders stay network-free because fonts are vendored under `video/public/fonts` (see that directory's `README.md`) rather than fetched from `fonts.gstatic.com` - the director's `tsc`/`remotion still`/vision preview loop runs end-to-end with zero network.

## Cost accounting

OpenRouter generations continue through the existing run telemetry. Provider `usage.cost` is authoritative when present; role/model/token/cache/reasoning fields are recorded in `runs/<run_id>/`. No parallel telemetry database is introduced.

## Doctor / staging

`tools/openrouter_doctor.py` requires `OPENROUTER_API_KEY`, Python dependencies, host tools, the bwrap smoke test and a usable search route. It actively probes the configured SearXNG `/search?format=json` endpoint; a configured keyed Firecrawl fallback is sufficient for the search-route requirement if SearXNG is unavailable. Chromium remains optional until a JS-only page needs it.

The unattended `producer_scheduler.py` remains hard-pinned to Codex/Luna/max. Manual OpenRouter parity runs use `tools/producer_openrouter_once.py` only after doctor passes on the Raspberry Pi. Do not switch production cron until the Pi has passed sandbox/AppArmor, search/fetch, role/worktree integration, director `tsc` + Remotion still/vision, Gemini TTS bridge, deterministic overlap/motion checks and several full parity runs. Existing Codex/Claude legacy lifecycle remains the rollback path.
