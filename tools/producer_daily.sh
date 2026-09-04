#!/usr/bin/env bash
# Once-a-day cron entry point: produce DAILY_VIDEO_COUNT episodes back to
# back, then stop until tomorrow.
#
# Replaces the old per-minute "tick" model (producer_cron.sh run every
# minute inside an 8-22 cron window, gated by INTERVAL_SECONDS) with a
# single daily trigger at a fixed hour. Each individual video still goes
# through the existing, unchanged path:
#
#     producer_daily.sh -> producer_cron.sh --force (env setup, unchanged)
#         -> producer_scheduler.py --force (unchanged)
#         -> run_episode.sh (unchanged)
#
# This script only adds the daily loop and a same-day idempotency guard.
# A failed video does NOT abort the rest of the day's batch (see the
# explicit exit-code handling below) - it is logged and the loop moves on
# to the next attempt, matching the operational reality observed in
# practice: individual production failures (infra hiccups, transient
# upstream outages) are common enough that "stop the whole day on the
# first one" would routinely leave well under the target count.
#
# Default lowered 6 -> 5 on 2026-09-04, same day it was introduced: a real
# batch of 6 hit the Gemini TTS free-tier daily quota
# (GenerateRequestsPerDayPerProjectPerModel-FreeTier, 10 requests/day/model
# x 3 fallback models = ~30/day, ~5 TTS calls per episode) on videos 4 and
# 5, both of which stopped at TTS with no video/no review created. 5 is
# the actually-sustainable daily count on the current free-tier quota, not
# an arbitrary preference - see corrections/ (or ask the operator) for the
# option to raise this again once Gemini API billing moves off the free
# tier.
set -uo pipefail
# Deliberately no -e: see the note above about not aborting the loop.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Overridable only for hermetic tests (a fake stub standing in for
# producer_cron.sh, to exercise the continue-after-failure loop behavior
# without a real codex/LLM launch); production always uses the real path.
LAUNCH_CMD="${PRODUCER_DAILY_LAUNCH_CMD:-$ROOT/tools/producer_cron.sh}"

# Same state directory producer_cron.sh itself resolves to (SV_SCHEDULER_STATE_DIR
# env override, else the default) - used here only for this script's own
# same-day marker file, not passed on to producer_cron.sh (which resolves it
# again itself; passing --state-dir twice would conflict with its own flag).
STATE_DIR="${SV_SCHEDULER_STATE_DIR:-$HOME/.local/share/shortvideo/scheduler}"
mkdir -p "$STATE_DIR"

DAILY_VIDEO_COUNT="${DAILY_VIDEO_COUNT:-5}"
TODAY="$(date -u +%F)"
MARKER="$STATE_DIR/daily-${TODAY}.started"

log() {
  # stderr, matching producer_scheduler.py's own log() convention - real
  # cron usage captures both streams into cron.log anyway (2>&1).
  echo "$(date -u +%FT%TZ) producer_daily: $*" >&2
}

if [[ -e "$MARKER" && "${1:-}" != "--force-daily" ]]; then
  log "$TODAY already started (marker $MARKER present) — refusing a second daily batch. Pass --force-daily to override."
  exit 0
fi
: > "$MARKER"

log "starting daily batch of $DAILY_VIDEO_COUNT for $TODAY"

for i in $(seq 1 "$DAILY_VIDEO_COUNT"); do
  log "launching video $i/$DAILY_VIDEO_COUNT"
  "$LAUNCH_CMD" --force
  code=$?
  log "video $i/$DAILY_VIDEO_COUNT exit_code=$code"
done

log "daily batch complete for $TODAY"
