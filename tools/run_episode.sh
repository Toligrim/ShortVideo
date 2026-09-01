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
    --exit-code "$((128 + sig_num))" > "$RUN_DIR/manifest.json" 2>/dev/null
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
      - < "$PROMPT_FILE" \
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
python3 tools/repo_guard.py check --warn-only || true

echo "run_id=$RUN_ID status=$STATUS exit_code=$CODE" >&2
echo "manifest=$RUN_DIR/manifest.json" >&2
exit "$CODE"
