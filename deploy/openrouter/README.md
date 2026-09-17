# Deploy the OpenRouter harness on Raspberry Pi

This is staging only. It does not switch the production cron runner.

## Dependencies

```bash
venv/bin/pip install -r requirements-openrouter.txt
```

Only `httpx` and `trafilatura` are required by the harness; SearXNG and optional Firecrawl are accessed through raw HTTP. `tools/run_episode_openrouter.sh` uses `venv/bin/python` by default.

Run deterministic checks before a live episode:

```bash
venv/bin/python -m py_compile \
  tools/openrouter_base.py tools/openrouter_client.py tools/openrouter_config.py \
  tools/openrouter_control.py tools/openrouter_doctor.py tools/openrouter_executor.py \
  tools/openrouter_agent.py tools/openrouter_harness.py tools/openrouter_sandbox.py \
  tools/openrouter_tools.py tools/openrouter_web.py tools/openrouter_web_cache.py \
  tools/openrouter_web_search.py tools/openrouter_web_extract.py tools/producer_openrouter_once.py
bash -n tools/run_episode.sh
bash -n tools/run_episode_legacy.sh
bash -n tools/run_episode_openrouter.sh
venv/bin/python -m pytest -q \
  tools/test_openrouter_harness.py tools/test_openrouter_web.py tools/test_run_episode_runner.py
```

## Trusted supervisor environment

Create `~/.config/shortvideo/openrouter.env` with mode `0600`:

```text
OPENROUTER_API_KEY=...
SEARXNG_URL=http://127.0.0.1:8888
# Optional paid/keyed fallback only:
# FIRECRAWL_API_KEY=...
# Optional cache placement/TTL overrides:
# SHORTVIDEO_WEB_CACHE_DIR=~/.cache/shortvideo/openrouter-web
# SHORTVIDEO_WEB_CACHE_TTL_SECONDS=1200
```

`EXA_API_KEY` is no longer required. Do not assume the example SearXNG address is correct for a host: set `SEARXNG_URL` to the actual instance. The doctor performs a real JSON search probe. If SearXNG is unavailable, a configured `FIRECRAWL_API_KEY` supplies the optional fallback route; keyless Firecrawl is intentionally not supported.

Load these variables only into the trusted producer/supervisor. OpenRouter, SearXNG/Firecrawl, Gemini, Telegram and other secret families are scrubbed from model-controlled bash.

Existing Gemini TTS and publisher credentials remain in their existing files/services.

## bubblewrap and AppArmor

Ubuntu 24.04 may have `kernel.apparmor_restrict_unprivileged_userns=1`. Do not globally disable it. Install bubblewrap, then create a separate ShortVideo/OpenRouter AppArmor profile for the exact bwrap binary selected by `SHORTVIDEO_BWRAP`, using the already-working `/etc/apparmor.d/codex-bwrap` only as a reference. Do not edit/broaden the Codex profile.

```bash
sudo apt update
sudo apt install bubblewrap
set -a
. ~/.config/shortvideo/openrouter.env
set +a
venv/bin/python tools/openrouter_doctor.py
```

The doctor performs a real bwrap namespace smoke test; `bwrap --version` alone is not acceptance.

## Web acceptance on the Pi

Before a full episode, verify the web layer with the same production user:

- doctor reports SearXNG search success, or explicitly reports the keyed Firecrawl fallback as configured;
- `web_search` returns normalized SearXNG results and a repeated identical query hits cache;
- `web_fetch` can fetch a normal public article, batch two to five public URLs, and read a truncated page's `@web-cache/...` path through `read_file`;
- localhost, metadata IPs, CGNAT/private addresses and a public-to-private redirect fail closed;
- a JS-only test page works only if Chromium is installed, and Chromium cannot subrequest localhost/private hosts;
- cache directory ownership/permissions are correct for the service user.

## First staging run

```bash
python3 tools/producer_openrouter_once.py --dry-run
set -a
. ~/.config/shortvideo/openrouter.env
set +a
export SHORTVIDEO_PUBLISH_STATE_DIR=...
python3 tools/producer_openrouter_once.py
```

A staging run must create the normal Telegram-gated review. Production scheduler constants stay `codex` / `gpt-5.6-luna` / `max` until parity is explicitly accepted.

## Full Raspberry Pi acceptance

Before calling the runner healthy, verify on the actual host:

1. `openrouter_doctor.py` is green under the production user, including bwrap and search route.
2. A scriptwriter detached worktree can write/commit and integrate through the existing `delegate_worktree.py` lease/allowlist path.
3. Critic is read-only and can still research through supervisor web tools.
4. Animation director can run `tsc`, render a Preview still into private `/tmp`, inspect it through the V4.1 Flash vision helper, commit in its detached worktree and integrate only allowed paths. For the ~270 KB animator catalog, use `grep` then ranged `read_file`, never load the whole catalog as routine context.
5. Gemini TTS bridge and approval review work without exposing supervisor secrets to model bash.
6. Deterministic overlap/motion checks pass and one full manual episode reaches `publication_created`.
7. Repeat several manual parity episodes before any scheduler migration.

## Cost/cache inspection

```bash
cat runs/<run_id>/openrouter-cost.json
tail -n 20 runs/<run_id>/openrouter-usage.jsonl
```

Web cache defaults to `~/.cache/shortvideo/openrouter-web`. OpenRouter cost continues to use the existing run telemetry; no parallel billing store is created.
