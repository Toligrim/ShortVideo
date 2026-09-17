#!/usr/bin/env bash
# Instrumented one-shot runner for the staging OpenRouter harness.
# Production scheduler remains pinned to the legacy Codex path.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TOPIC=""
SLUG=""
RUNNER=""
MODEL=""
EFFORT="high"
PROMPT_FILE=""
TIMEOUT_MIN=210

while [[ $# -gt 0 ]]; do
  case "$1" in
    --topic) TOPIC="$2"; shift 2 ;;
    --slug) SLUG="$2"; shift 2 ;;
    --runner) RUNNER="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --effort) EFFORT="$2"; shift 2 ;;
    --prompt-file) PROMPT_FILE="$2"; shift 2 ;;
    --timeout-min) TIMEOUT_MIN="$2"; shift 2 ;;
    *) echo "неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
done

for req in TOPIC SLUG MODEL PROMPT_FILE; do
  if [[ -z "${!req}" ]]; then
    echo "нужен --${req,,}" >&2
    exit 2
  fi
done
if [[ -n "$RUNNER" && "$RUNNER" != openrouter ]]; then
  echo "run_episode_openrouter.sh принимает только --runner openrouter" >&2
  exit 2
fi
if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "prompt file not found: $PROMPT_FILE" >&2
  exit 2
fi

HARNESS_PYTHON="${SHORTVIDEO_OPENROUTER_PYTHON:-$ROOT/venv/bin/python}"
if [[ ! -x "$HARNESS_PYTHON" ]]; then
  echo "OpenRouter Python not found/executable: $HARNESS_PYTHON" >&2
  echo "Create/use the project venv and install requirements-openrouter.txt." >&2
  exit 78
fi

ENV_FILE="${SHORTVIDEO_OPENROUTER_ENV:-$HOME/.config/shortvideo/openrouter.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

mkdir -p runs
exec 9>runs/.lock
if ! flock -n 9; then
  echo "runs/.lock занят — другой прогон уже идёт на этой машине" >&2
  exit 1
fi
if [[ -f "episodes/${SLUG}.json" ]]; then
  echo "episodes/${SLUG}.json уже существует — выбери другой slug" >&2
  exit 1
fi
FREE_KB=$(df --output=avail -k "$ROOT" | tail -1)
if (( FREE_KB < 2 * 1024 * 1024 )); then
  echo "меньше 2 ГБ свободного места — прогон не стартует" >&2
  exit 1
fi

INVOCATION="$HARNESS_PYTHON tools/openrouter_harness.py run --role orchestrator --model $MODEL --effort $EFFORT --task-file $PROMPT_FILE"
RUN_ID=$(python3 tools/pipeline_log.py run-start \
  --slug "$SLUG" --topic "$TOPIC" --cli openrouter --model "$MODEL" \
  --effort "$EFFORT" --orchestration subagents --invocation "$INVOCATION")
RUN_DIR="$ROOT/runs/$RUN_ID"
echo "run_id=$RUN_ID" >&2

python3 tools/repo_guard.py check --warn-only || true
python3 tools/pipeline_log.py snapshot --label before

export SV_RUN_ID="$RUN_ID"
export SV_RUN_DIR="$RUN_DIR"
export SV_CLI="openrouter"
export SV_MODEL="$MODEL"
export SV_EFFORT="$EFFORT"
export SV_ORCHESTRATION="subagents"
export SV_SANDBOX_POLICY="bubblewrap"

NOTIFIED_KILLED=""
on_kill_signal() {
  local sig_num="$1"
  [[ -n "$NOTIFIED_KILLED" ]] && exit "$((128 + sig_num))"
  NOTIFIED_KILLED=1
  set +e
  python3 tools/pipeline_log.py finish --status killed \
    --exit-code "$((128 + sig_num))" \
    --result-class infrastructure_failure --error-code openrouter_runner_killed \
    > "$RUN_DIR/manifest.json" 2>/dev/null
  "$HARNESS_PYTHON" tools/openrouter_harness.py finalize-cost --run-dir "$RUN_DIR" >/dev/null 2>&1 || true
  python3 tools/episode_story.py run --run-id "$RUN_ID" >/dev/null 2>&1 || true
  exit "$((128 + sig_num))"
}
trap 'on_kill_signal 15' TERM
trap 'on_kill_signal 2' INT

DOCTOR_JSON="$RUN_DIR/openrouter-doctor.json"
set +e
"$HARNESS_PYTHON" tools/openrouter_doctor.py > "$DOCTOR_JSON"
DOCTOR_RC=$?
set -e
DOCTOR_CLASS=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8")).get("error_class", "openrouter_doctor_failed"))' "$DOCTOR_JSON" 2>/dev/null || true)
[[ -n "$DOCTOR_CLASS" ]] || DOCTOR_CLASS="openrouter_doctor_failed"
python3 tools/pipeline_log.py event sandbox_preflight --stage other \
  --severity "$([[ "$DOCTOR_RC" -eq 0 ]] && echo info || echo error)" \
  --detail "$DOCTOR_CLASS" --data "doctor_exit_code=$DOCTOR_RC" \
  --data "error_class=$DOCTOR_CLASS" || true
if [[ "$DOCTOR_RC" -ne 0 ]]; then
  python3 tools/pipeline_log.py finish --status failed --exit-code 78 \
    --result-class infrastructure_failure --error-code "$DOCTOR_CLASS" \
    > "$RUN_DIR/manifest.json"
  echo "OpenRouter preflight failed: class=$DOCTOR_CLASS (see $DOCTOR_JSON)" >&2
  exit 78
fi

# Keep the same fail-fast Gemini free-tier quota gate used by the legacy run.
TTS_QUOTA_JSON="$RUN_DIR/tts-quota-preflight.json"
set +e
python3 tools/tts_scenes.py --check-quota > "$TTS_QUOTA_JSON"
TTS_QUOTA_RC=$?
set -e
python3 tools/pipeline_log.py event tts_quota_preflight --stage tts \
  --severity "$([[ "$TTS_QUOTA_RC" -eq 0 ]] && echo info || echo error)" \
  --detail "$([[ "$TTS_QUOTA_RC" -eq 0 ]] && echo has_quota || echo exhausted)" || true
if [[ "$TTS_QUOTA_RC" -ne 0 ]]; then
  python3 tools/pipeline_log.py finish --status failed --exit-code 77 \
    --result-class infrastructure_failure --error-code tts_quota_exhausted \
    > "$RUN_DIR/manifest.json"
  echo "Gemini TTS quota exhausted (see $TTS_QUOTA_JSON)" >&2
  exit 77
fi

set +e
timeout "${TIMEOUT_MIN}m" "$HARNESS_PYTHON" tools/openrouter_harness.py run \
  --role orchestrator \
  --workspace "$ROOT" \
  --model "$MODEL" \
  --effort "$EFFORT" \
  --task-file "$PROMPT_FILE" \
  > "$RUN_DIR/cli-stdout.log" 2> "$RUN_DIR/cli-stderr.log" &
CLI_PID=$!
wait "$CLI_PID"
CODE=$?
set -e

python3 tools/pipeline_log.py snapshot --label after

STATUS="ok"
RESULT_CLASS="success"
ERROR_CODE=""
if [[ $CODE -eq 0 ]]; then
  if [[ ! -f "episodes/${SLUG}.json" ]]; then
    STATUS="failed"; RESULT_CLASS="semantic_failure"; ERROR_CODE="pipeline_incomplete"
  elif ! python3 tools/validate.py "episodes/${SLUG}.json"; then
    STATUS="failed"; RESULT_CLASS="semantic_failure"; ERROR_CODE="pipeline_incomplete"
  elif ! grep -q '"kind": "publication_created"' "$RUN_DIR/events.jsonl" 2>/dev/null; then
    STATUS="failed"; RESULT_CLASS="semantic_failure"; ERROR_CODE="pipeline_incomplete"
  fi
else
  STATUS="failed"
  RESULT_CLASS="semantic_failure"
  if [[ $CODE -eq 124 ]] || rg -qi 'timed out|timeout' "$RUN_DIR/cli-stderr.log"; then
    RESULT_CLASS="infrastructure_failure"; ERROR_CODE="openrouter_timeout"
  elif rg -qi 'bwrap|user namespace|network namespace|namespace denied' "$RUN_DIR/cli-stderr.log"; then
    RESULT_CLASS="infrastructure_failure"; ERROR_CODE="openrouter_sandbox_unavailable"
  elif rg -qi '401|unauthorized|OPENROUTER_API_KEY|EXA_API_KEY|key_missing' "$RUN_DIR/cli-stderr.log"; then
    RESULT_CLASS="infrastructure_failure"; ERROR_CODE="openrouter_auth_failed"
  elif rg -qi '429|502|503|504|provider.*(failed|unavailable)|upstream' "$RUN_DIR/cli-stderr.log"; then
    RESULT_CLASS="infrastructure_failure"; ERROR_CODE="openrouter_provider_failure"
  elif rg -qi 'unknown model|model .*(not found|unavailable|invalid)|invalid.*model' "$RUN_DIR/cli-stderr.log"; then
    RESULT_CLASS="infrastructure_failure"; ERROR_CODE="model_unavailable"
  fi
fi

FINISH_ARGS=(--status "$STATUS" --exit-code "$CODE" --result-class "$RESULT_CLASS")
[[ -n "$ERROR_CODE" ]] && FINISH_ARGS+=(--error-code "$ERROR_CODE")
python3 tools/pipeline_log.py finish "${FINISH_ARGS[@]}" > "$RUN_DIR/manifest.json"
"$HARNESS_PYTHON" tools/openrouter_harness.py finalize-cost --run-dir "$RUN_DIR" > "$RUN_DIR/openrouter-finalize.log" 2>&1 || true
python3 tools/episode_story.py run --run-id "$RUN_ID" || true
python3 tools/repo_guard.py check --warn-only || true

echo "run_id=$RUN_ID status=$STATUS exit_code=$CODE" >&2
echo "manifest=$RUN_DIR/manifest.json" >&2
exit "$CODE"
