# Unattended ShortVideo producer scheduler

Автоматический планировщик производства роликов: сам выбирает тему (математика /
информатика), гоняет полный approval-gated конвейер через существующую точку
входа `tools/run_episode.sh` (которая не изменялась).

С 2026-09-04 модель запуска — **один тик в день**, не по часам: в 8:00
crontab запускает `tools/producer_daily.sh`, который сам делает
`DAILY_VIDEO_COUNT` (по умолчанию 5) прогонов подряд, каждый следующий —
сразу после того, как предыдущий подтверждённо завершился (не по таймеру).
Раньше был противоположный дизайн (тик каждую минуту в окне 8–22, запуск —
когда истёк фиксированный интервал 3ч21м/12060с) — он всё ещё физически
существует в `tools/producer_scheduler.py` (интервал 300с, см. ниже), но
больше не является точкой входа по расписанию.

## Архитектура

```
crontab (один раз в день, 8:00)
  └─ tools/producer_daily.sh           дневной драйвер (новое, 2026-09-04):
        · маркер "сегодня уже стартовали" — вторая попытка в тот же день
          сама себя отклоняет (--force-daily снимает защиту)
        · цикл DAILY_VIDEO_COUNT раз (по умолчанию 5):
              tools/producer_cron.sh --force   (блокирующий вызов)
          отказ одного прогона НЕ прерывает цикл — идём дальше
  └─ tools/producer_cron.sh             тонкая cron-обёртка (не изменилась):
        · set -euo pipefail
        · абсолютный путь проекта (не $PWD)
        · явный PATH: $HOME/.local/bin + стандартные каталоги
          (там лежат codex, npx, node)
        · export SHORTVIDEO_PUBLISH_STATE_DIR → общий state публикации
          (тот же, что у live bot/worker; override сохраняется)
        · exec → python3 tools/producer_scheduler.py --force
  └─ tools/producer_scheduler.py       владеет блокировкой и запуском:
        · flock на tick.lock — только один прогон одновременно
          (это и есть реальный «запускай следующий только когда предыдущий
          подтверждённо завершился» — держится всё время работы
          run_episode.sh, включая хвостовые шаги)
        · генерирует timestamp-slug и временный промпт-файл
        · вызывает bash tools/run_episode.sh с фиксированными
          --runner codex --model gpt-5.6-luna --effort max
```

## Фиксированный стек (константы, не переопределяются)

В `tools/producer_scheduler.py` жёстко зашиты и не читаются из окружения/аргументов:

| Параметр       | Значение              |
|----------------|-----------------------|
| runner         | `codex`               |
| model          | `gpt-5.6-luna`        |
| effort         | `max`                 |
| interval       | `300` с (= 5 мин, floor — см. ниже) |
| timeout        | `180` мин на прогон   |

Любой незнакомый флаг (в т.ч. `--model`, `--effort`, `--runner`, `--interval`)
— ошибка использования (exit 2). Валидация: `--validate` печатает резолв.

## Единый state публикации: cron обязан совпадать с systemd

Публикация остаётся approval-gated: агент пишет review через
`publish.py review`, а доставляют и публикуют уже **живые**
bot/worker-сервисы. Чтобы review из крона попало ровно в тот SQLite-store,
который опрашивает бот, оба пути обязаны указывать на одну директорию.

- **systemd bot/worker** получают `SHORTVIDEO_PUBLISH_STATE_DIR` из своего
  `EnvironmentFile` (см. `deploy/systemd/shortvideo-publisher-bot.service` и
  `deploy/systemd/shortvideo-publisher-worker.service`).
- **cron** не имеет `EnvironmentFile`, поэтому `tools/producer_cron.sh` сам
  экспортирует `SHORTVIDEO_PUBLISH_STATE_DIR` (если переменная уже задана —
  её значение сохраняется, override не затирается):
  ```bash
  export SHORTVIDEO_PUBLISH_STATE_DIR="${SHORTVIDEO_PUBLISH_STATE_DIR:-$HOME/.local/share/shortvideo/publisher}"
  ```
  Это значение по умолчанию должно совпадать с тем, что задано в
  `EnvironmentFile` сервисов бота и воркера. Без этого review, созданный
  кроном, попадает в репозиторный фолбэк `var/publisher` — отдельный store,
  который бот не опрашивает, и публикация «мёртвая».

Проверка: `tools/producer_cron.sh --validate` печатает `publish_state_dir_env` —
это то значение, которое увидит воркер агента при `publish.py review`.
Сравни его с путём, заданным в `EnvironmentFile` сервисов.

## Cron-строка

см. `deploy/cron/shortvideo-producer-cron.example` — один тик в сутки, в 8:00:

```
0 8 * * * /home/toligrim/projects/ShortVideo-Suite/ShortVideo/tools/producer_daily.sh >> /home/toligrim/.local/share/shortvideo/scheduler/cron.log 2>&1
```

Никакого `PATH=...`/`SHELL=...` в crontab не нужно — `producer_daily.sh` сам
вызывает `producer_cron.sh`, которая уже выставляет PATH.

## Семантика дневного цикла

- Один тик в сутки — 8:00. Всё остальное решает сам `producer_daily.sh`.
- **Маркер дня**: `~/.local/share/shortvideo/scheduler/daily-<YYYY-MM-DD>.started`.
  Если он уже существует — повторный запуск в тот же день сам себя отклоняет
  (exit 0, ничего не запускает), пока не передан `--force-daily`. Защита от
  случайного второго срабатывания (ручной перезапуск, дублирующийся cron) —
  без неё день мог бы выпустить 10 видео вместо 5.
- Внутри маркера — цикл на `DAILY_VIDEO_COUNT` (переменная окружения,
  по умолчанию `5` — см. ниже, почему не 6) итераций. Каждая — блокирующий вызов
  `tools/producer_cron.sh --force`, то есть реальный прогон одного эпизода
  от начала до конца, включая хвостовые шаги (`STORY.md`, `repo_guard`).
- **Отказ одного прогона не прерывает день.** Скрипт запущен без `set -e`
  специально для этого: код выхода каждой итерации логируется, но цикл идёт
  дальше — на практике отдельные прогоны иногда падают (сбой стороннего
  API, allowlist-нарушение и т.п.), и «остановить весь день на первом же
  отказе» систематически не давал бы дойти до целевого числа.
- **Реальный гейт «следующий стартует только когда предыдущий
  подтверждённо завершился»** — не таймер, а `flock` внутри
  `producer_scheduler.py` (см. `tools/producer_scheduler.py`'s
  `SchedulerLock`, интервал 300с там — уже не точка входа по расписанию,
  просто внутренний floor на случай прямого вызова планировщика без
  дневного драйвера, см. его модульный docstring).
- Итог за день — до `DAILY_VIDEO_COUNT` попыток, каждая по факту занимает
  90–150 минут (`runs/index.jsonl`), так что весь дневной цикл из 5 обычно
  укладывается в 8–13 часов от 8:00.
- **Почему по умолчанию 5, а не 6.** 2026-09-04: реальный батч на 6 упёрся
  в дневную бесплатную квоту Gemini TTS
  (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, 10 запросов/день на
  модель × 3 модели-фолбэка ≈ 30/день, ~5 TTS-вызовов на эпизод) — видео 4
  и 5 остановились на озвучке без видео и без заявки на публикацию. 5 —
  реально устойчивое число на текущей бесплатной квоте, а не произвольная
  цифра. Снять ограничение можно переходом на платный тариф Gemini API.

## Пути

| Что                          | Путь                                                                     |
|------------------------------|--------------------------------------------------------------------------|
| Часы/замок/логи планировщика | `~/.local/share/shortvideo/scheduler/`                                   |
| маркер дневного батча        | `~/.local/share/shortvideo/scheduler/daily-<YYYY-MM-DD>.started`         |
| state (next_run)             | `~/.local/share/shortvideo/scheduler/state.json`                         |
| lock                         | `~/.local/share/shortvideo/scheduler/tick.lock`                          |
| вывод тиков / прогонов       | `~/.local/share/shortvideo/scheduler/cron.log` (redirect в cron-строке)  |
| временные промпты            | `~/.local/share/shortvideo/scheduler/producer-prompt-*.md` (удаляются)   |
| логи прогона                 | `runs/<run-id>/...` внутри репозитория (создаёт `run_episode.sh`)        |
| state публикации (общий с bot/worker) | `~/.local/share/shortvideo/publisher/` (переменная `SHORTVIDEO_PUBLISH_STATE_DIR`) |
| store публикации (SQLite)    | `~/.local/share/shortvideo/publisher/publisher.sqlite3`                  |

Все эти файлы — вне git-репозитория; `.env`, секреты и store/cards
публикации (в `~/.local/share/shortvideo/publisher/`, см. также раздел
«Единый state публикации») не трогаются.

## Операции

```bash
# Текущая конфигурация (не запускает ни LLM, ни кодекса)
tools/producer_cron.sh --validate

# Что бы произошло сейчас (сухой прогон: ничего не запускает, не пишет state)
tools/producer_cron.sh --dry-run

# Один прогон вне графика (разово, тот же путь, что и одна итерация дневного цикла)
tools/producer_cron.sh --force

# Весь дневной батч вручную, вне расписания (проверяет маркер дня как обычно)
tools/producer_daily.sh

# То же, но игнорируя маркер (если день уже стартовал и нужно ещё раз)
tools/producer_daily.sh --force-daily

# Другое число видео за прогон дневного драйвера
DAILY_VIDEO_COUNT=2 tools/producer_daily.sh --force-daily

# Посмотреть часы следующего запуска
jq . ~/.local/share/shortvideo/scheduler/state.json
```

### Проверка установки

```bash
pgrep -fa producer_cron          # активный тик/прогон
journalctl -u cron -f            # попала ли строка в крон (уровень демона)
tail -n 20 ~/.local/share/shortvideo/scheduler/cron.log
```

## На что это не влияет

- `tools/run_episode.sh` — не изменялся и работает как раньше.
- Публикация в соцсети остаётся approval-gated: промпт явно запрещает агенту
  `telegram_bot.py send-video` напрямую и запуск `publish.py worker` — доставку
  делают уже установленные bot/worker сервисы после вашего `Approve`.
- Ручные прогоны по-прежнему защищены собственным `runs/.lock` внутри
  `run_episode.sh`.

## Тесты и валидация

`tools/test_producer_scheduler.py` — фокус на инвариантах (интервал-floor,
константы model/effort, блокировка, slug, содержимое промпта) без запуска
LLM. Отдельно `CronWrapperPublicationStateTests` гоняет сам
`tools/producer_cron.sh` на герметичном `$HOME` и проверяет, что обёртка
передаёт планировщику `SHORTVIDEO_PUBLISH_STATE_DIR` (и default, и явный
override). `tools/test_producer_daily.py` — то же для дневного драйвера:
маркер дня, `--force-daily`, `DAILY_VIDEO_COUNT`, продолжение цикла после
отказа одной итерации (тоже без запуска LLM — `SV_SCHEDULER_FAKE_LAUNCH=1`):

```bash
venv/bin/python -m pytest tools/test_producer_scheduler.py tools/test_producer_daily.py -v
```