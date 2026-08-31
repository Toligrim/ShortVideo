#!/usr/bin/env bash
# Cron-safe entry point for the unattended ShortVideo producer scheduler.
#
# Purpose: a per-minute cron tick calls this wrapper; the wrapper only fixes up
# the environment (cron runs with a minimal PATH) and then hands over to
# tools/producer_scheduler.py which owns the decision, locking and launch.
# See deploy/cron/README.md for the exact crontab line and interval semantics.
set -euo pipefail

# Locate project root from the real script path (not $PWD, which cron does not
# set reliably).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Explicit PATH: codex, npx/node and friends live under $HOME/.local/bin.
export PATH="$HOME/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export LC_ALL=C.UTF-8
export LANG=C.UTF-8

# State lives outside the repository (never committed): next-run clock, lock,
# prompts and per-tick logs.
STATE_DIR="${SV_SCHEDULER_STATE_DIR:-$HOME/.local/share/shortvideo/scheduler}"
mkdir -p "$STATE_DIR"

# Publisher state must be the SAME directory the live Telegram bot/worker
# systemd services read (SHORTVIDEO_PUBLISH_STATE_DIR from their
# EnvironmentFile). Cron has no EnvironmentFile, so default the shared path
# here; the bot/worker then see a cron-created review in the very store they
# poll. An explicitly pre-set value is preserved (override wins).
export SHORTVIDEO_PUBLISH_STATE_DIR="${SHORTVIDEO_PUBLISH_STATE_DIR:-$HOME/.local/share/shortvideo/publisher}"

exec python3 "$ROOT/tools/producer_scheduler.py" --state-dir "$STATE_DIR" "$@"
