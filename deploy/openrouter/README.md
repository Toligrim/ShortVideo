# Deploy the OpenRouter harness on Raspberry Pi

This is a staging deployment. It does not switch the production cron runner.

## Python dependencies

Install the harness dependencies into the repository virtualenv used by the runner:

```bash
venv/bin/pip install -r requirements-openrouter.txt
```

The harness intentionally adds only `httpx` and `trafilatura` to the Python runtime. `tools/run_episode_openrouter.sh` uses `venv/bin/python` by default; set `SHORTVIDEO_OPENROUTER_PYTHON` only if this installation uses a different dedicated interpreter.

Before any live API call, run the deterministic checks:

```bash
venv/bin/python -m py_compile \
  tools/openrouter_base.py tools/openrouter_client.py tools/openrouter_config.py \
  tools/openrouter_control.py tools/openrouter_doctor.py tools/openrouter_executor.py \
  tools/openrouter_agent.py tools/openrouter_harness.py tools/openrouter_sandbox.py \
  tools/openrouter_tools.py tools/openrouter_web.py tools/producer_openrouter_once.py
bash -n tools/run_episode.sh
bash -n tools/run_episode_legacy.sh
bash -n tools/run_episode_openrouter.sh
venv/bin/python -m pytest -q tools/test_openrouter_harness.py tools/test_run_episode_runner.py
```

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
venv/bin/python tools/openrouter_doctor.py
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

## Acceptance on the real Pi

Before calling the staging runner healthy, verify all of these on the actual host:

1. `openrouter_doctor.py` is green under the same user that runs production.
2. A scriptwriter worktree can be written/committed and merged through `delegate_worktree.py close`.
3. The critic cannot write the worktree, while its shell can still perform read-only fact checks through harness web tools.
4. The animation director can run `npx tsc --noEmit`, render a Remotion Preview still into private `/tmp`, inspect it through the V4.1 Flash vision helper, commit in the detached worktree, and merge only allow-listed paths.
5. The orchestrator can execute the trusted Gemini TTS bridge and create a dry-run/normal approval review without exposing OpenRouter/Exa keys to model shell commands.
6. One full manual episode reaches `publication_created` before any production scheduler switch.

## Inspect cost and cache usage

```bash
cat runs/<run_id>/openrouter-cost.json
tail -n 20 runs/<run_id>/openrouter-usage.jsonl
```

The aggregate is also written back into the existing run manifest/index rather than a parallel accounting store.
