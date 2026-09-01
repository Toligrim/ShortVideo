# Unattended ShortVideo producer scheduler

Автоматический планировщик производства роликов: сам выбирает тему (математика /
информатика), гоняет полный approval-gated конвейер и делает это каждые
3 часа 21 минуту (12 060 секунд) через существующую точку входа
`tools/run_episode.sh` (которая не изменялась).

## Архитектура

```
crontab (каждую минуту)
  └─ tools/producer_cron.sh            тонкая cron-обёртка:
        · set -euo pipefail
        · абсолютный путь проекта (не $PWD)
        · явный PATH: $HOME/.local/bin + стандартные каталоги
          (там лежат codex, npx, node)
        · export SHORTVIDEO_PUBLISH_STATE_DIR → общий state публикации
          (тот же, что у live bot/worker; override сохраняется)
        · exec → python3 tools/producer_scheduler.py
  └─ tools/producer_scheduler.py       решает, планирует, блокирует:
        · читает/пишет часы следующего запуска (state.json)
        · flock на tick.lock — только один прогон одновременно
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
| interval       | `12060` с (= 3ч 21м)  |
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

см. `deploy/cron/shortvideo-producer-cron.example` — одна строка из пяти звёзд
(`* * * * *`). В crontab можно добавить `PATH=...` и `SHELL=/bin/bash`, но обёртка
уже сама выставляет PATH, поэтому достаточно собственно команды:

```
* * * * * /home/toligrim/projects/ShortVideo/tools/producer_cron.sh >> /home/toligrim/.local/share/shortvideo/scheduler/cron.log 2>&1
```

## Семантика интервала

- Тик каждую минуту — это только «будильник». Решение принимает планировщик.
- Состояние `state.json` хранит `next_run` (epoch), `last_run`, `last_slug`.
- **Первый запуск**: файла состояния нет ⇒ первый тик запускает прогон сразу же.
- **Дальше**: следующий запуск планируется от момента запуска текущего →
  `next_run = now + 12060`. Если `now < next_run` — тик ничего не делает
  (в cron.log одна строка `skip`).
- Пока прогон идёт, `flock` на `tick.lock` удерживается — каждый минутный тик
  получает `busy` и завершается кодом 3, дубликатов нет.
- Если прогон занял больше интервала — после завершения предыдущего тик сразу
  стартует новый (расписание «не реже чем раз в 3ч21м, без параллелей»).

## Пути

| Что                          | Путь                                                                     |
|------------------------------|--------------------------------------------------------------------------|
| Часы/замок/логи планировщика | `~/.local/share/shortvideo/scheduler/`                                   |
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

# Запустить вне графика (разово, игнорируя часы next_run)
tools/producer_cron.sh --force

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

`tools/test_producer_scheduler.py` — фокус на инвариантах (интервал, константы
model/effort, блокировка, slug, содержимое промпта) без запуска LLM. Отдельно
`CronWrapperPublicationStateTests` гоняет сам `tools/producer_cron.sh` на
герметичном `$HOME` и проверяет, что обёртка передаёт планировщику
`SHORTVIDEO_PUBLISH_STATE_DIR` (и default, и явный override):

```bash
venv/bin/python -m pytest tools/test_producer_scheduler.py -v
```