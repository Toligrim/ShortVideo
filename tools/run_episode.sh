#!/usr/bin/env bash
# Единая точка входа для инструментированного прогона конвейера (§2.2 плана
# docs/observability-and-analytics-plan.md). Обёртка ничего не знает про
# под-агентов — одинаково меряет Claude Code и Codex.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TOPIC=""
SLUG=""
RUNNER=""
MODEL=""
EFFORT="max"
PROMPT_FILE=""
TIMEOUT_MIN=180

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

for req in TOPIC SLUG RUNNER MODEL PROMPT_FILE; do
  if [[ -z "${!req}" ]]; then
    echo "нужен --${req,,}" >&2
    exit 2
  fi
done

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

case "$RUNNER" in
  codex) ORCH="single-actor" ;;
  claude) ORCH="subagents" ;;
  *) echo "runner должен быть codex|claude" >&2; exit 2 ;;
esac

INVOCATION=""
case "$RUNNER" in
  codex)
    INVOCATION="codex exec -m $MODEL -c model_reasoning_effort=$EFFORT --sandbox danger-full-access < $PROMPT_FILE"
    ;;
  claude)
    INVOCATION="claude -p <prompt> --model $MODEL --effort $EFFORT --dangerously-skip-permissions"
    ;;
esac

RUN_ID=$(python3 tools/pipeline_log.py run-start \
  --slug "$SLUG" --topic "$TOPIC" --cli "$RUNNER" --model "$MODEL" \
  --effort "$EFFORT" --orchestration "$ORCH" --invocation "$INVOCATION")
RUN_DIR="$ROOT/runs/$RUN_ID"
echo "run_id=$RUN_ID" >&2

# Наблюдаемость (docs/agent-safety-architecture.md, этап 2.2): untracked-файл
# уровня A — ошибка прогона, а не фон (именно так неделями лежал untracked
# tools/pipeline_log.py до инцидента 31.08). Пока только предупреждение
# (--warn-only): не роняет прогон, даёт время убедиться, что в реальной
# работе ложных срабатываний нет, прежде чем сделать эту проверку жёсткой.
python3 tools/repo_guard.py check --warn-only || true

# SIGTERM/SIGINT (docs/agent-safety-architecture.md, §7.3, шаг A). Инцидент
# 31.08.2026: делегат убил именно этот процесс (run_episode.sh) сначала
# точечным `kill`, затем весь process group оркестратора — и НИКТО об этом
# не узнал почти сутки, потому что убивать было уже некому. Это не мешает
# убийству случиться (детерминированно запретить kill/pkill сегодня на этой
# машине нельзя, см. §7.4 — решение отложено), но убирает то, что было хуже
# самого убийства: тишину. Флаг-защёлка — сигнал может прийти дважды
# (TERM, потом дожимающий KILL), обработчик не должен запускаться повторно.
NOTIFIED_KILLED=""
on_kill_signal() {
  local sig_num="$1"
  [ -n "$NOTIFIED_KILLED" ] && exit "$((128 + sig_num))"
  NOTIFIED_KILLED=1
  set +e
  python3 tools/pipeline_log.py finish --status killed \
    --exit-code "$((128 + sig_num))" \
    --result-class infrastructure_failure --error-code mcp_transport_timeout \
    > "$RUN_DIR/manifest.json" 2>/dev/null
  python3 tools/codex_session_import.py import --run-id "$RUN_ID" >/dev/null 2>&1
  python3 tools/episode_story.py run --run-id "$RUN_ID" >/dev/null 2>&1
  (
    ENV_FILE="$HOME/.config/shortvideo/publisher.env"
    [ -f "$ENV_FILE" ] && . "$ENV_FILE"
    if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_ALLOWED_CHAT_ID:-}" ]; then
      TEXT="⚠️ Прогон $SLUG (run_id=$RUN_ID) получил сигнал $sig_num и остановлен принудительно.
Рассказ: runs/$RUN_ID/STORY.md"
      curl -s -m 10 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -d chat_id="${TELEGRAM_ALLOWED_CHAT_ID}" --data-urlencode text="$TEXT" >/dev/null 2>&1
    fi
  )
  exit "$((128 + sig_num))"
}
trap 'on_kill_signal 15' TERM
trap 'on_kill_signal 2' INT

python3 tools/pipeline_log.py snapshot --label before

export SV_RUN_ID="$RUN_ID"
export SV_RUN_DIR="$RUN_DIR"
export SV_CLI="$RUNNER"
export SV_MODEL="$MODEL"
export SV_EFFORT="$EFFORT"
export SV_ORCHESTRATION="$ORCH"
export SV_SANDBOX_POLICY="danger-full-access"

# Host-side Codex sandbox preflight.  This is intentionally after run-start
# (so the refusal is durable in the manifest) and before the first Codex
# process or delegate worktree can be created.  Claude does not invoke Codex,
# so its run must not be coupled to Codex/bwrap availability.
export SV_CODEX_VERSION=""
if [[ "$RUNNER" == codex ]]; then
  # A non-zero doctor result is an infrastructure failure, never a semantic
  # attempt.
  DOCTOR_JSON="$RUN_DIR/codex-sandbox-doctor.json"
  set +e
  python3 tools/codex_sandbox_doctor.py > "$DOCTOR_JSON"
  DOCTOR_RC=$?
  set -e
  DOCTOR_CLASS=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8")).get("error_class", "bwrap_unknown_failure"))' "$DOCTOR_JSON" 2>/dev/null || true)
  DOCTOR_VERSION=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8")).get("codex_version") or "")' "$DOCTOR_JSON" 2>/dev/null || true)
  [[ -n "$DOCTOR_CLASS" ]] || DOCTOR_CLASS="bwrap_unknown_failure"
  export SV_CODEX_VERSION="$DOCTOR_VERSION"
  DOCTOR_PASSED=0
  if [[ "$DOCTOR_RC" -eq 0 && "$DOCTOR_CLASS" == ok ]]; then
    DOCTOR_PASSED=1
  fi
  python3 tools/pipeline_log.py event sandbox_preflight --stage other \
    --severity "$([[ "$DOCTOR_PASSED" -eq 1 ]] && echo info || echo error)" \
    --detail "$DOCTOR_CLASS" \
    --data "doctor_exit_code=$DOCTOR_RC" \
    --data "error_class=$DOCTOR_CLASS" || true
  if [[ "$DOCTOR_PASSED" -ne 1 ]]; then
    python3 tools/pipeline_log.py finish --status failed --exit-code 78 \
      --result-class infrastructure_failure --error-code codex_sandbox_unavailable \
      > "$RUN_DIR/manifest.json"
    echo "Codex sandbox preflight failed: class=$DOCTOR_CLASS (see $DOCTOR_JSON)" >&2
    exit 78
  fi
fi

# Gemini TTS free-tier daily quota preflight (2026-09-05). Real incidents
# 2026-09-04/05: multiple full scriptwriter+director passes (tens of
# minutes of real delegate work) completed only to fail at TTS with
# nothing to show for it, because
# generativelanguage.googleapis.com/generate_content_free_tier_requests
# was already exhausted on every fallback model before the run even
# started. tools/tts_scenes.py remembers a 429 per model until the next
# Pacific-Time day (Google's documented reset boundary; no live quota-
# check API exists for a plain API key, only a browser-auth'd dashboard) -
# if every model is already known exhausted, fail here, before any Codex
# delegate time is spent, rather than discover it after the fact.
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
  echo "Gemini TTS free-tier daily quota already exhausted on every model (see $TTS_QUOTA_JSON) — refusing to spend delegate time on a run that would fail at TTS anyway" >&2
  exit 77
fi

# The producer prompt remains a normal file value.  The protocol is appended
# only after the host preflight and is read from disk by codex exec; nested
# delegation itself is further constrained by delegate_invoke.py.
CODEX_PROMPT_FILE="$PROMPT_FILE"
if [[ "$RUNNER" == codex ]]; then
  CODEX_PROMPT_FILE="$RUN_DIR/orchestrator-prompt.md"
  {
    cat "$PROMPT_FILE"
    printf '\n\n--- ShortVideo deterministic delegate invocation protocol ---\n\n'
    cat "$ROOT/docs/delegate-invocation-protocol.md"
  } > "$CODEX_PROMPT_FILE"
  chmod 600 "$CODEX_PROMPT_FILE"
fi

set +e
case "$RUNNER" in
  codex)
    # Оркестратору-Codex запрещено делегировать через skill
    # ~/.codex/skills/delegate-with-opencode (инцидент 31.08.2026: делегат не
    # смог прочитать словарь транслитерации вне проекта, Codex в обход велел
    # оставить буквальный плейсхолдер {SHOW|термин} — он дошёл до эфира).
    # Единственный разрешённый канал делегирования — MCP-сервер `codex`
    # (codex mcp add codex -- codex mcp-server). Технически блокируем сам
    # бинарь opencode-tool шимом в PATH: SKILL.md он прочитать может,
    # выполнить — нет, получит понятный отказ вместо тихого обхода. Шим
    # активируется через SHORTVIDEO_NO_OPENCODE в ~/.bashrc (а не через
    # PATH= здесь), потому что shell-тул codex гоняет `bash -lc`, login-шелл
    # заново подключает ~/.bashrc и переприкладывает ~/.local/bin поверх
    # любого PATH= из родителя.
    SHIM_DIR="$ROOT/var/codex-shim"
    mkdir -p "$SHIM_DIR"
    cat > "$SHIM_DIR/opencode-tool" <<'SHIM'
#!/usr/bin/env bash
echo "opencode-tool отключён для автономного продюсера ShortVideo (delegate-with-opencode запрещён)." >&2
echo "Для делегирования подзадач используй MCP-сервер 'codex' (codex mcp-server), не skill delegate-with-opencode." >&2
exit 127
SHIM
    chmod +x "$SHIM_DIR/opencode-tool"
    # Явный background + wait, а не просто foreground-вызов: bash не
    # прерывает синхронную foreground-команду ради trap — обработчик
    # SIGTERM/SIGINT молча откладывается до её завершения (проверено эмпирически:
    # foreground `timeout ... sleep` не давал trap сработать вообще, пока не
    # закончится сам; тот же код через `cmd & wait "$!"` прерывался за
    # миллисекунды). Без этого весь trap выше был бы бесполезен на боевом
    # прогоне — именно так и убили run_episode.sh 31.08.2026.
    SHORTVIDEO_NO_OPENCODE=1 \
    timeout "${TIMEOUT_MIN}m" codex exec \
      -C "$ROOT" \
      -m "$MODEL" \
      -c model_reasoning_effort="$EFFORT" \
      --sandbox danger-full-access \
      - < "$CODEX_PROMPT_FILE" \
      > "$RUN_DIR/cli-stdout.log" 2> "$RUN_DIR/cli-stderr.log" &
    CLI_PID=$!
    wait "$CLI_PID"
    CODE=$?
    ;;
  claude)
    timeout "${TIMEOUT_MIN}m" claude -p "$(cat "$PROMPT_FILE")" \
      --model "$MODEL" --effort "$EFFORT" --dangerously-skip-permissions \
      > "$RUN_DIR/cli-stdout.log" 2> "$RUN_DIR/cli-stderr.log" &
    CLI_PID=$!
    wait "$CLI_PID"
    CODE=$?
    ;;
esac
set -e

python3 tools/pipeline_log.py snapshot --label after

STATUS="ok"
RESULT_CLASS="success"
ERROR_CODE=""
if [[ $CODE -eq 0 ]]; then
  if [[ ! -f "episodes/${SLUG}.json" ]]; then
    STATUS="failed"
    RESULT_CLASS="semantic_failure"
    ERROR_CODE="pipeline_incomplete"
  elif ! python3 tools/validate.py "episodes/${SLUG}.json"; then
    STATUS="failed"
    RESULT_CLASS="semantic_failure"
    ERROR_CODE="pipeline_incomplete"
  elif ! grep -q '"kind": "publication_created"' "$RUN_DIR/events.jsonl" 2>/dev/null; then
    # episodes/<slug>.json exists as soon as animation-director finishes -
    # long before tts/critic/render/publish. A real incident
    # (auto-20260904-144810, 2026-09-04): Gemini TTS returned 429 on every
    # available model, the pipeline honestly stopped there (no MP4, no
    # review sent - orchestrator's own summary said so explicitly), yet
    # this gate still marked the run status=ok/success because the episode
    # JSON alone was already valid. publication_created only appears once
    # publish.py review has actually created a Publication - the real
    # deliverable for an automated run - so require it too.
    STATUS="failed"
    RESULT_CLASS="semantic_failure"
    ERROR_CODE="pipeline_incomplete"
  fi
fi
if [[ $CODE -ne 0 ]]; then
  STATUS="failed"
  RESULT_CLASS="semantic_failure"
  # Classification is based only on process exit status and host/runtime
  # stderr, never on an LLM-authored --note or free-form summary.
  if rg -qi 'RTM_NEWADDR|Failed to create network namespace|bwrap|user namespace' \
      "$RUN_DIR/cli-stderr.log"; then
    RESULT_CLASS="infrastructure_failure"
    ERROR_CODE="codex_sandbox_unavailable"
  elif [[ $CODE -eq 124 ]] || rg -qi 'timed out|timeout' "$RUN_DIR/cli-stderr.log"; then
    RESULT_CLASS="infrastructure_failure"
    ERROR_CODE="mcp_transport_timeout"
  elif rg -qi 'unknown model|model .*(not found|unavailable|invalid)|invalid.*model' \
      "$RUN_DIR/cli-stderr.log"; then
    RESULT_CLASS="infrastructure_failure"
    ERROR_CODE="model_unavailable"
  elif rg -qi 'MCP tool call requires approval|SyntaxError|Unexpected identifier|mcp_invocation_invalid' \
      "$RUN_DIR/cli-stderr.log"; then
    RESULT_CLASS="control_plane_failure"
    ERROR_CODE="mcp_invocation_invalid"
  fi
fi
FINISH_ARGS=(--status "$STATUS" --exit-code "$CODE" --result-class "$RESULT_CLASS")
if [[ -n "$ERROR_CODE" ]]; then
  FINISH_ARGS+=(--error-code "$ERROR_CODE")
fi
python3 tools/pipeline_log.py finish "${FINISH_ARGS[@]}" > "$RUN_DIR/manifest.json"

# Наблюдаемость (docs/agent-safety-architecture.md, этап 1.2): втянуть сессии
# делегатов Codex за этот прогон в runs/$RUN_ID/agents/ и собрать рассказ.
# Оба шага — ПОСЛЕ завершения прогона и с || true: телеметрия не имеет права
# стоить эпизода, тот же принцип, что уже принят в pipeline_log.py.
python3 tools/codex_session_import.py import --run-id "$RUN_ID" || true
python3 tools/episode_story.py run --run-id "$RUN_ID" || true
python3 tools/repo_guard.py check --warn-only || true

echo "run_id=$RUN_ID status=$STATUS exit_code=$CODE" >&2
echo "manifest=$RUN_DIR/manifest.json" >&2
exit "$CODE"
