# Deploy the OpenRouter harness on Raspberry Pi

This is a staging deployment. It does not switch the production cron runner.

## Python dependencies

From the repository virtualenv:

```bash
venv/bin/pip install -r requirements-openrouter.txt
```

The harness intentionally adds only `httpx` and `trafilatura` to the Python runtime.

## Credentials

Create `~/.config/shortvideo/openrouter.env`, mode `0600`:

```text
OPENROUTER_API_KEY=...
EXA_API_KEY=...
```

Load it into the trusted producer/supervisor environment only. Model-controlled shell processes are scrubbed of these values.

Existing Gemini TTS and publisher credentials stay in their existing files/services.

## bubblewrap and AppArmor

Ubuntu 24.04 on this host uses `kernel.apparmor_restrict_unprivileged_userns=1`. Do not globally disable that sysctl.

Install bubblewrap:

```bash
sudo apt update
sudo apt install bubblewrap
```

Before changing AppArmor, save the current state and use the already-working Codex bwrap profile only as a reference. Create a separate ShortVideo profile for the exact bwrap binary selected by `SHORTVIDEO_BWRAP`; do not broaden the Codex profile.

After loading the profile, run:

```bash
set -a
. ~/.config/shortvideo/openrouter.env
set +a
python3 tools/openrouter_doctor.py
```

The doctor performs a real user/PID/network namespace smoke test. `bwrap --version` alone is not sufficient.

### Rollback

Unload/remove only the new ShortVideo AppArmor profile, restore any edited file from its backup, reload AppArmor and unset `SHORTVIDEO_BWRAP`. Do not change `kernel.apparmor_restrict_unprivileged_userns` as a workaround.

## First staging run

Inspect the command without starting an LLM:

```bash
python3 tools/producer_openrouter_once.py --dry-run
```

Then use the same approval store as production:

```bash
set -a
. ~/.config/shortvideo/openrouter.env
set +a
export SHORTVIDEO_PUBLISH_STATE_DIR=...
python3 tools/producer_openrouter_once.py
```

A successful staging run must create the normal Telegram-gated publication review. Production scheduler constants remain Codex/Luna until parity runs are accepted.

## Inspect cost and cache usage

```bash
cat runs/<run_id>/openrouter-cost.json
tail -n 20 runs/<run_id>/openrouter-usage.jsonl
```

The aggregate is also written back into the existing run manifest/index rather than a parallel accounting store.
