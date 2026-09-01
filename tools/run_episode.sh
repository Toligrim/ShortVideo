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

python3 tools/pipeline_log.py snapshot --label before

export SV_RUN_ID="$RUN_ID"
export SV_RUN_DIR="$RUN_DIR"
export SV_CLI="$RUNNER"
export SV_MODEL="$MODEL"
export SV_EFFORT="$EFFORT"
export SV_ORCHESTRATION="$ORCH"

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
    SHORTVIDEO_NO_OPENCODE=1 \
    timeout "${TIMEOUT_MIN}m" codex exec \
      -C "$ROOT" \
      -m "$MODEL" \
      -c model_reasoning_effort="$EFFORT" \
      --sandbox danger-full-access \
      - < "$PROMPT_FILE" \
      > "$RUN_DIR/cli-stdout.log" 2> "$RUN_DIR/cli-stderr.log"
    CODE=$?
    ;;
  claude)
    timeout "${TIMEOUT_MIN}m" claude -p "$(cat "$PROMPT_FILE")" \
      --model "$MODEL" --effort "$EFFORT" --dangerously-skip-permissions \
      > "$RUN_DIR/cli-stdout.log" 2> "$RUN_DIR/cli-stderr.log"
    CODE=$?
    ;;
esac
set -e

python3 tools/pipeline_log.py snapshot --label after

STATUS="ok"
if [[ $CODE -ne 0 ]]; then
  STATUS="failed"
fi
python3 tools/pipeline_log.py finish --status "$STATUS" --exit-code "$CODE" > "$RUN_DIR/manifest.json"

# Наблюдаемость (docs/agent-safety-architecture.md, этап 1.2): втянуть сессии
# делегатов Codex за этот прогон в runs/$RUN_ID/agents/ и собрать рассказ.
# Оба шага — ПОСЛЕ завершения прогона и с || true: телеметрия не имеет права
# стоить эпизода, тот же принцип, что уже принят в pipeline_log.py.
python3 tools/codex_session_import.py import --run-id "$RUN_ID" || true
python3 tools/episode_story.py run --run-id "$RUN_ID" || true

echo "run_id=$RUN_ID status=$STATUS exit_code=$CODE" >&2
echo "manifest=$RUN_DIR/manifest.json" >&2
exit "$CODE"
