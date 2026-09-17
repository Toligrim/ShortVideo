#!/usr/bin/env bash
# Stable dispatcher. Production scheduler still passes --runner codex and is
# therefore routed to the preserved legacy lifecycle. OpenRouter is explicit.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER=""
EXPECT_RUNNER=0
for arg in "$@"; do
  if [[ "$EXPECT_RUNNER" -eq 1 ]]; then
    RUNNER="$arg"
    break
  fi
  if [[ "$arg" == "--runner" ]]; then
    EXPECT_RUNNER=1
  fi
done

if [[ "$RUNNER" == "openrouter" ]]; then
  exec "$ROOT/tools/run_episode_openrouter.sh" "$@"
fi

# Missing/unknown runners deliberately fall through to the legacy parser so
# its established usage/error semantics remain authoritative for codex/claude.
exec "$ROOT/tools/run_episode_legacy.sh" "$@"
