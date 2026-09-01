# Наблюдаемость производства и аналитика конвейера

**Резюме.** Каждый прогон конвейера получает свой каталог `runs/<run_id>/` с append-only
журналом событий (`events.jsonl`) и собранным в конце манифестом производства
(`manifest.json`) — текстовым описанием ролика и того, как он был сделан: кто (какая
модель) играл каждую роль, сколько wall-clock времени занял каждый этап, из каких сцен и
визуалов состоит результат, какие визуалы появились в библиотеке именно в этом прогоне,
какие были фолбэки и ошибки. Время меряет внешний CLI (`tools/pipeline_log.py`), а не
самоотчёт модели; состав ролика и рост библиотеки вычисляются из артефактов и диффа
схемы/каталога, а не со слов агента. Поверх накопленных манифестов раз в неделю
запускается детерминированный агрегатор + агент-аналитик, который пишет отчёт о динамике
продакшена в `reports/<YYYY-Www>.md`.

---

## 0. Что уже есть в репозитории (проверено чтением файлов)

Прежде чем проектировать, зафиксируем факты — план опирается на них.

| Артефакт | Путь | Что содержит | Кто пишет / читает |
|---|---|---|---|
| Драфт | `episodes/drafts/<slug>.draft.json` | `slug`, `title`, `category`, `device` (нарративный приём), `research[]` (факты + ссылки), `blocks[].{gist,narration}` | пишет `scriptwriter`, читает `animation-director` |
| Эпизод | `episodes/<slug>.json` | `id`, `title`, `scenes[]` — источник правды | пишет `animation-director` |
| Схема | `schema/scenes.schema.json` | типы сцен, enum визуалов `story.beats[].visual`, лимиты полей; `additionalProperties: false` на корне | руками/режиссёром |
| Тайминги | `video/public/episodes/<slug>/meta.json` | **массив** `[{index, duration, words:[{text,start,end}]}]`, ~9.7 КБ для 7 сцен | пишет `tools/tts_scenes.py`, читает Remotion |
| Копия сценария | `video/public/episodes/<slug>/script.json` | побайтовая копия `episodes/<slug>.json` | `cp` в пайплайне, читает Remotion |
| Аудио | `video/public/episodes/<slug>/audio/scene-N.mp3` | ~460 КБ (7 сцен) … 1.7 МБ (24 сцены) | `tts_scenes.py` |
| Рендер | `video/out/<slug>.mp4` | ~35 МБ на 9 сцен; **в `.gitignore`** | `npx remotion render` |
| Каталог визуалов | `.claude/skills/animator/catalog.md` | таблица `visual → что происходит → params` + «когда использовать» | режиссёр обязан дописывать |
| Вердикт критика | `/tmp/critic-<slug>.md` | **теряется после прогона** | `critic` |

Ключевые константы движка (`video/src/lib/theme.ts`, `timeline.ts`, `Root.tsx`):
`FPS = 30`, `LEAD_SEC = 0.2`, `TAIL_SEC = 0.55`, `TRANSITION_FRAMES = 10`.
Длина сцены в кадрах = `ceil((0.2 + duration + 0.55) * 30)`; общая длина эпизода =
`сумма кадров сцен − 10 × (число сцен − 1)`. Эти формулы нужны, чтобы манифест мог
указывать позицию каждой сцены на таймлайне без запуска Remotion.

Текущий масштаб: 6 эпизодов, 58 отслеживаемых файлов в `video/public/episodes`,
5.9 МБ трекнутого аудио, `.git` = 37 МБ. Свободно на SD-карте — 25 ГБ.

**Что в `meta.json` уже есть для наших целей:** посценная длительность и пословные
тайминги — то есть полная транскрибация с метками, ровно тот «~12 КБ файл», о котором
говорил пользователь. **Чего в нём нет:** что происходит на экране (визуалы, узлы,
пакеты, якоря), кто и за сколько это произвёл, чем прогон отличается от предыдущего.
`meta.json` отвечает «что сказано и когда», манифест добавляет «что нарисовано и кем
сделано». Вместе они дают полный текстовый рендер ролика.

---

## 1. Формат per-episode манифеста производства

### 1.1. Где он лежит и почему не внутри существующих файлов

**Решение: новый файл рядом, не расширение `meta.json` / `script.json`.**

Три технические причины, а не вкусовые:

1. `meta.json` — это **голый JSON-массив**, и `video/src/Root.tsx` в `calculateMetadata`
   делает `fetch(...).then(r => r.json())` и сразу `metas.reduce(...)` в `episodeFrames`.
   Превращение массива в объект `{scenes:[...], production:{...}}` ломает рендер всех
   шести уже произведённых эпизодов.
2. `script.json` — побайтовая копия эпизода, а корень `schema/scenes.schema.json` имеет
   `"additionalProperties": false` и `"required": ["id","title","scenes"]`. Любое поле
   `production` в эпизоде провалит `tools/validate.py` — то есть придётся ослаблять
   схему ради телеметрии. Не стоит того.
3. Манифест описывает **прогон**, а не эпизод. Один и тот же slug может быть произведён
   дважды (Codex и Opus делают «хеш-таблицы» независимо — это и есть сценарий сравнения
   моделей). Слот «один файл на slug» такого не выдерживает, а `runs/<run_id>/` выдерживает.

Итоговая раскладка:

```
runs/
  index.jsonl                       # по одной строке на завершённый прогон (быстрая агрегация)
  .current                          # run_id текущего прогона (для CLI без аргументов)
  .lock                             # flock: не более одного прогона одновременно
  20260805-134102-hash-tables/
    events.jsonl                    # append-only сырой журнал (источник правды по времени)
    manifest.json                   # производный документ, собирается на finish
    snapshot-before.json            # отпечаток библиотеки визуалов до прогона
    snapshot-after.json             # он же после
    critic-round-1.md               # вердикты критика (сейчас теряются в /tmp)
    cmd/                            # stdout/stderr обёрнутых команд (обрезанные хвосты)
      validate-1.log  tts-1.log  render-1.log  telegram-1.log
reports/
  2026-W32.json                     # агрегированные числа за период
  2026-W32.md                       # отчёт агента-аналитика
```

`run_id` = `<YYYYMMDD>-<HHMMSS>-<slug>` — сортируемый, уникальный, читаемый глазами.

### 1.2. `events.jsonl` — формат строки

Одна строка = одно событие, JSON без переносов. Пишется только через
`tools/pipeline_log.py`, всегда с временем, взятым процессом Python (`time.time()` +
`time.monotonic()`), никогда — со слов модели.

```json
{"seq":7,"ts":"2026-08-05T13:41:02.317Z","mono":1834.221,"run_id":"20260805-134102-hash-tables",
 "kind":"stage_start","stage":"director",
 "actor":{"role":"animation-director","cli":"claude-code","model":"claude-sonnet-5","effort":"max",
          "orchestration":"subagent","session_id":"e034fc..."},
 "note":"взял драфт episodes/drafts/hash-tables.draft.json"}
```

Поля: `seq` (монотонный счётчик в рамках прогона), `ts` (UTC ISO-8601 с миллисекундами),
`mono` (секунды от `run_start`, устойчиво к переводу часов и NTP-скачкам — на Pi это не
теория), `kind`, `stage`, `actor`, плюс специфичные для `kind`.

Допустимые `kind`:

| kind | Когда | Обязательные поля |
|---|---|---|
| `run_start` | обёрткой, до запуска любой модели | `runner`, `topic`, `slug` |
| `stage_start` | на входе в этап | `stage`, `actor` |
| `stage_end` | на выходе | `stage`, `status` (`ok`/`failed`/`skipped`), `data` |
| `cmd` | обёрткой `wrap` вокруг команды | `stage`, `argv`, `exit_code`, `wall_sec`, `stdout_tail`, `stderr_tail` |
| `incident` | фолбэк/ошибка/предупреждение | `severity`, `detail`, `source` |
| `verdict` | вердикт критика | `round`, `verdict`, `issues` |
| `snapshot` | отпечаток библиотеки | `label` (`before`/`after`), `digest` |
| `artifact` | появился файл-результат | `path`, `bytes`, `sha1` |
| `note` | свободный комментарий агента | `text` |
| `run_end` | обёрткой, после выхода CLI | `status`, `exit_code` |

**Закрытый словарь этапов** (`stage`), CLI отвергает всё остальное — иначе агрегация
превращается в угадайку синонимов:
`scriptwriter`, `director`, `forge`, `validate`, `tts`, `stills`, `critic`, `render`,
`telegram`, `commit`, `other`.
`forge` — вложенный подэтап внутри `director`, по одному на каждый создаваемый визуал
(`--data visual=hash-table`).

### 1.3. `manifest.json` — схема

Собирается командой `pipeline_log.py finish` из `events.jsonl` + артефактов на диске.
Ниже — полный набросок с реальными значениями по эпизоду `hash-tables` (числа
иллюстративные там, где их сейчас неоткуда взять).

```jsonc
{
  "schema_version": 1,
  "run_id": "20260805-134102-hash-tables",
  "slug": "hash-tables",
  "status": "ok",                        // ok | failed | partial
  "failed_stage": null,

  "episode": {
    "topic": "хеш-таблицы и коллизии",   // как её сформулировал заказчик прогона
    "title": "Почему хеш-таблицы не ломаются на коллизиях",
    "category": "web",                   // из драфта
    "device": "Versus — одна коллизия, два выхода: цепочка против открытой адресации",
    "language": "ru",
    "format": "shorts",                  // shorts (<=8 сцен) | longform
    "research_sources": [                // из драфта, чтобы аналитик видел глубину ресёрча
      "https://docs.oracle.com/javase/8/docs/api/java/util/HashMap.html",
      "https://github.com/python/cpython/blob/main/Objects/dictobject.c"
    ],
    "topic_signature": "hash table collision chaining open-addressing"  // нормализованные токены для детекта повторов
  },

  "runner": {
    "cli": "claude-code",                // claude-code | codex-cli | manual
    "cli_version": "2.1.220",
    "model": "claude-opus-5",
    "effort": "max",
    "headless": true,
    "orchestration": "subagents",        // subagents | single-actor
    "session_id": "e034fc2d-814f-4bf5-8a40-eea4e3b33899",
    "budget_usd_limit": 3.0,
    "cost_usd": 2.14,                    // если CLI отдаёт; иначе null
    "invocation": "claude -p \"/produce хеш-таблицы, slug: hash-tables\" --model opus --effort max",
    "host": "shuvalova"
  },

  "timing": {
    "started_at": "2026-08-05T13:41:02.317Z",
    "finished_at": "2026-08-05T14:28:57.702Z",
    "wall_sec": 2875.4,
    "measured_by": "tools/run_episode.sh + tools/pipeline_log.py",
    "unaccounted_sec": 145.2,            // wall минус сумма размеченных этапов
    "coverage_pct": 94.9,
    "stages": {
      "scriptwriter": {
        "started_at": "...", "ended_at": "...", "wall_sec": 412.8,
        "status": "ok", "inferred_start": false,
        "actor": {"role":"scriptwriter","model":"claude-sonnet-5","orchestration":"subagent"},
        "data": {"device":"Versus","words":128,"research_facts":3,"web_searches":4}
      },
      "director": {
        "wall_sec": 986.1, "status": "ok",
        "actor": {"role":"animation-director","model":"claude-sonnet-5","orchestration":"subagent"},
        "data": {"gap_scan_actions": 11, "gap_scan_low": 2},
        "substages": {
          "forge": [
            {"visual":"hash-table","wall_sec":301.2,"preview_stills":4,"status":"ok"},
            {"visual":"collision-compare","wall_sec":248.7,"preview_stills":6,"status":"ok"}
          ]
        }
      },
      "validate":  {"wall_sec": 2.9, "attempts": 2, "exit_code": 0, "status": "ok"},
      "tts":       {"wall_sec": 233.9, "status": "ok",
                    "provider_requested": "gemini", "provider_used": "gemini",
                    "models_tried": ["gemini-3.1-flash-tts-preview"],
                    "whisper_mismatch_scenes": 0},
      "stills":    {"wall_sec": 190.4, "count": 14},
      "critic":    {"wall_sec": 640.0, "rounds_total": 1,
                    "rounds": [{"round":1,"wall_sec":640.0,"verdict":"accepted",
                                "issues":0,"report":"runs/.../critic-round-1.md"}]},
      "render":    {"wall_sec": 1105.0, "exit_code": 0,
                    "output_bytes": 35329941, "realtime_ratio": 15.1},
      "telegram":  {"wall_sec": 41.2, "status": "ok", "message_id": 4812},
      "commit":    {"wall_sec": 3.1, "sha": "0a1f979"}
    }
  },

  "composition": {
    "scene_count": 7,
    "spoken_words": 128,
    "audio_sec": 68.4,
    "video_sec": 73.1,
    "video_frames": 2193,
    "fps": 30,
    "resolution": "1080x1920",
    "wpm": 112.3,
    "scene_type_histogram": {"story": 4, "diagram": 2, "outro": 1},
    "visuals_used": ["collision-compare", "title-slam", "hash-table"],
    "icons_used": ["key-round", "database"],
    "sfx_events": 14,
    "transitions": {"slide": 5, "fade": 1},
    "scenes": [
      {
        "index": 0, "type": "story",
        "start_frame": 0, "end_frame": 344,
        "start_sec": 0.0, "duration_sec": 10.44,
        "narration": "Два разных ключа попали в одну ячейку. {Хеш-таблица|хеш-таблица} сломалась? Нет: ...",
        "words": 21,
        "elements": [
          {"kind":"beat","visual":"collision-compare",
           "params":{"keyA":"профиль","keyB":"платёж","bucket":3},
           "onWord": null, "anchor_sec": null},
          {"kind":"beat","visual":"title-slam",
           "params":{"text":"КОЛЛИЗИЯ","sub":"два ключа, один индекс"},
           "onWord":"трюк","anchor_sec":7.805,"anchor_resolved":true,"anchor_position_pct":74.8}
        ]
      }
      // ... остальные сцены
    ],
    "transcript": "Два разных ключа попали в одну ячейку. Хеш-таблица сломалась? ... (весь текст подряд)"
  },

  "quality_signals": {                   // считаются детерминированно, не мнение LLM
    "anchors_total": 9,
    "anchors_resolved": 9,
    "anchors_late": 1,                   // якорь в последних 15% сцены — элемент не успевают увидеть
    "scenes_without_impact": 0,          // сцена >8 сек без единого impact/бита
    "longest_static_stretch_sec": 6.2,
    "words_per_scene": {"min": 14, "max": 24, "avg": 18.3},
    "validate_failures_before_green": 1,
    "critic_rounds": 1
  },

  "library_growth": {
    "new_scene_types": [],
    "new_story_visuals": ["hash-table", "collision-compare"],
    "new_scene_fields": [],              // напр. [{"scene":"diagram","field":"channel"}]
    "new_components": [],
    "modified_components": ["video/src/scenes/StoryScene.tsx"],
    "new_primitives": [],
    "count": 2,
    "used_in_this_episode": ["hash-table", "collision-compare"],
    "created_but_unused": [],            // сигнал накрутки метрики
    "catalog_drift": {                   // расхождение схемы и catalog.md
      "in_schema_not_in_catalog": [],
      "in_catalog_not_in_schema": []
    },
    "detected_by": ["snapshot-diff", "git-diff"]
  },

  "incidents": [
    {"ts":"...","stage":"tts","kind":"fallback","severity":"warn",
     "detail":"gemini-3.1-flash-tts-preview: 429 → gemini-2.5-flash-preview-tts",
     "source":"stderr-pattern"},
    {"ts":"...","stage":"validate","kind":"validation_failed","severity":"error",
     "detail":"сцена 3: onWord «индекс» не найдено в реплике","source":"exit_code"}
  ],

  "artifacts": {
    "draft_json":  "episodes/drafts/hash-tables.draft.json",
    "episode_json":"episodes/hash-tables.json",
    "meta_json":   "video/public/episodes/hash-tables/meta.json",
    "script_json": "video/public/episodes/hash-tables/script.json",
    "audio_dir":   "video/public/episodes/hash-tables/audio",
    "mp4": {"path":"video/out/hash-tables.mp4","bytes":35329941,"sha1":"...",
            "kept_locally": false,
            "archived_to":"toligrim-eth:/srv/shortvideo/archive/hash-tables.mp4"},
    "critic_reports": ["runs/20260805-134102-hash-tables/critic-round-1.md"],
    "commits": ["0a1f979"]
  },

  "publication": null,                   // заполняется на фазе соцметрик (см. §5)

  "self_reported": {                     // ЕДИНСТВЕННОЕ место, где живут слова модели
    "director_gap_scan": "11 действий, 2 с оценкой ≤3 → выкованы hash-table и collision-compare",
    "critic_summary": "Кадры чистые, коллизия читается с первого взгляда",
    "notes": ["whisper на сцене 4 услышал 19 слов из 20, тайминг доинтерполирован"]
  },

  "integrity": {
    "source": "live",                    // live | backfill
    "stages_measured": ["validate","tts","stills","render","telegram","commit"],
    "stages_reported": ["scriptwriter","director","critic"],
    "stages_inferred": [],
    "stages_missing": [],
    "clock": "utc+monotonic, tools/pipeline_log.py"
  }
}
```

Оценка размера: для шортса из 7 сцен — 8–14 КБ; для longform на 24 сцены — 25–35 КБ.
Пословные тайминги **не дублируются**, манифест ссылается на `meta.json`. Именно поэтому
он остаётся в том же порядке величины, что и файл, о котором говорил пользователь.

### 1.4. `runs/index.jsonl` — плоский индекс

Одна строка на завершённый прогон, чтобы недельная агрегация не читала 105 манифестов:

```json
{"run_id":"20260805-134102-hash-tables","slug":"hash-tables","date":"2026-08-05",
 "status":"ok","cli":"claude-code","model":"claude-opus-5","effort":"max",
 "orchestration":"subagents","wall_sec":2875.4,"cost_usd":2.14,
 "scenes":7,"video_sec":73.1,"words":128,"category":"web","device":"Versus",
 "new_visuals":2,"critic_rounds":1,"incidents":1,"coverage_pct":94.9}
```

---

## 2. Как физически собирать тайминги, если исполнители разные

### 2.1. Принцип: два слоя — гарантированный пол и поощряемая детализация

**Слой A (пол, работает всегда, LLM не участвует).** Внешняя обёртка
`tools/run_episode.sh` открывает прогон **до** запуска любой модели и закрывает
**после** её выхода. Даже если модель не залогирует ни одного этапа, мы получаем:
общее wall-clock, CLI, модель, effort, exit code, отпечаток библиотеки до/после, состав
готового эпизода. Это ровно те данные, которые нужны для честного сравнения
Codex vs Sonnet vs Opus.

**Слой B (детализация, требует кооперации).** Границы этапов внутри прогона. Здесь
кооперация покупается не уговорами, а тем, что логирование **встроено в команды,
которые агент и так обязан выполнить** (см. 2.3).

Ключевая гарантия честности: `pipeline_log.py` берёт время сам. Модель может выбрать,
**когда** позвать CLI, но не может выбрать, **какое время** записать. Полей вида
«я потратил примерно 8 минут» в схеме нет вообще.

### 2.2. `tools/run_episode.sh` — единственная точка входа для прогона

```bash
tools/run_episode.sh \
  --topic "хеш-таблицы и коллизии" \
  --slug hash-tables \
  --runner claude \                 # claude | codex
  --model opus \
  --effort max \
  --budget-usd 3.0
```

Что делает по шагам:

1. `flock runs/.lock` — второй прогон на этой машине не стартует (защита Pi от
   параллельных рендеров).
2. Проверки предполёта: свободного места ≥ 5 ГБ; `episodes/<slug>.json` не существует
   (иначе `--rerun` обязателен); дневная квота прогонов не исчерпана.
3. `RUN_ID=$(python3 tools/pipeline_log.py run-start --slug ... --topic ... --cli ... --model ... --effort ... --invocation "...")`.
4. `python3 tools/pipeline_log.py snapshot --label before`.
5. `export SV_RUN_ID SV_RUN_DIR SV_CLI SV_MODEL SV_EFFORT SV_ORCHESTRATION` — дочерние
   процессы (в т.ч. под-агенты Claude Code, которые наследуют окружение) видят прогон
   без передачи аргументов.
6. Запуск выбранного CLI под `timeout 90m`:
   - `claude -p "/produce <тема>, slug: <slug>" --model $MODEL --effort $EFFORT --max-budget-usd $BUDGET --dangerously-skip-permissions`
   - `codex exec --model $MODEL --effort $EFFORT "<промпт /produce, развёрнутый в текст>"`
7. `python3 tools/pipeline_log.py snapshot --label after`.
8. `python3 tools/pipeline_log.py finish --status ok|failed --exit-code $CODE`.
9. Опционально: `rsync` mp4 и аудио на `toligrim-eth` (см. §7) и запись пути в манифест.

Симметрия важна: **обёртка ничего не знает про под-агентов**. Она одинаково меряет
Claude Code с под-агентами и Codex, который играет все роли сам. Сравнение моделей
остаётся честным по построению.

### 2.3. `tools/pipeline_log.py` — CLI логирования

```
pipeline_log.py run-start   --slug S --topic T --cli C --model M [--effort E] [--invocation ...]
pipeline_log.py stage-start STAGE [--model M] [--role R] [--note "..."]
pipeline_log.py stage-end   STAGE [--status ok|failed|skipped] [--data k=v ...] [--note "..."]
pipeline_log.py wrap        STAGE [--allow-fail] -- <команда...>
pipeline_log.py event       KIND  [--stage S] [--severity ...] [--detail "..."] [--data k=v]
pipeline_log.py verdict     --round N --verdict accepted|revisions --issues N [--report PATH]
pipeline_log.py snapshot    --label before|after
pipeline_log.py finish      [--status ok|failed] [--exit-code N]
pipeline_log.py backfill    --slug S            # реконструкция манифеста для старых эпизодов
```

Правила реализации, которые важнее самих команд:

- **Логгер никогда не роняет прогон.** Любая ошибка внутри `pipeline_log.py` (кроме
  `finish`) печатает предупреждение и завершается кодом 0. Телеметрия не имеет права
  стоить эпизода.
- **Автоопределение прогона.** `run_id` берётся из `$SV_RUN_ID`, иначе из `runs/.current`,
  иначе создаётся неявный прогон с `"origin":"implicit"`. Ручной запуск команды тоже
  попадёт в журнал, а не потеряется.
- **Устойчивость к забывчивости.** `stage-end` без парного `stage-start` не ошибка:
  началом считается конец предыдущего события, в манифест пишется
  `"inferred_start": true` и этап попадает в `integrity.stages_inferred`. Данные
  сохраняются, но помечаются менее достоверными.
- **Незакрытые этапы.** `finish` закрывает всё открытое временем последнего события,
  ставит `"status":"unknown"` и добавляет этап в `integrity.stages_inferred`.
- **`unaccounted_sec`.** Разница между общим wall-clock и суммой размеченных этапов —
  это метрика самой дисциплины логирования, и она попадает в недельный отчёт. Модель,
  которая логирует плохо, видна в сравнении.

### 2.4. `wrap` — главный трюк малой инвазивности

Четыре из десяти этапов — это уже существующие shell-команды. Их не надо просить
логировать, их надо **переписать в документации один раз**:

| Было (в SKILL.md / README) | Стало |
|---|---|
| `python3 tools/validate.py episodes/<slug>.json` | `python3 tools/pipeline_log.py wrap validate -- python3 tools/validate.py episodes/<slug>.json` |
| `venv/bin/python tools/tts_scenes.py ... --provider gemini` | `python3 tools/pipeline_log.py wrap tts -- venv/bin/python tools/tts_scenes.py ... --provider gemini` |
| `npx remotion still Episode /tmp/qc-N.png ...` | `python3 tools/pipeline_log.py wrap stills -- npx remotion still ...` |
| `npx remotion render Episode out/<slug>.mp4 ...` | `python3 tools/pipeline_log.py wrap render -- npx remotion render ...` |
| `python3 tools/telegram_bot.py send-video ...` | `python3 tools/pipeline_log.py wrap telegram -- python3 tools/telegram_bot.py send-video ...` |

Агент копирует команду из инструкции — тайминг получается бесплатно, дисциплины не
требуется вообще. Эти пять этапов покрывают большую часть wall-clock прогона (TTS,
кадры, рендер — самые долгие куски).

`wrap` дополнительно ловит инциденты сам, регулярками по перехваченному stderr:

| Паттерн | Инцидент |
|---|---|
| `429, пробую следующую модель` | `tts / fallback / warn`, с указанием моделей |
| `gemini synth failed` | `tts / error` |
| `edge synth failed` | `tts / error` |
| `whisper услышал (\d+) слов, ожидалось (\d+)` при расхождении >15% | `tts / alignment_drift / warn` |
| `^ERROR:` из `validate.py` | `validate / validation_failed / error` |
| ненулевой exit code | `<stage> / command_failed / error` |

То есть фолбэк «Gemini 429 → Edge» попадает в манифест **без участия модели** — ей не
надо помнить, что об этом положено упомянуть.

### 2.5. Что дописывается в агентов и скиллы (точный минимальный дифф)

Только те этапы, которые не являются shell-командой — по две строки на роль.

**`.claude/agents/scriptwriter.md`** — в начало «Шаг 1 — ресёрч»:
```bash
python3 tools/pipeline_log.py stage-start scriptwriter
```
и в «Перед сдачей», последней строкой:
```bash
python3 tools/pipeline_log.py stage-end scriptwriter --status ok \
  --data device="<приём>" --data words=<N> --data research_facts=<N>
```

**`.claude/agents/animation-director.md`** — в начало «Шаг 1 — раскадровка»:
```bash
python3 tools/pipeline_log.py stage-start director
```
в «Шаг 3 — кузница», вокруг создания каждого визуала:
```bash
python3 tools/pipeline_log.py stage-start forge --note "<имя визуала>"
...
python3 tools/pipeline_log.py stage-end forge --status ok --data visual=<имя>
```
и в «Шаг 4 — сборка JSON и сдача»:
```bash
python3 tools/pipeline_log.py stage-end director --status ok \
  --data gap_scan_actions=<N> --data gap_scan_low=<N> --data new_visuals=<N>
```

**`.claude/agents/critic.md`** — в начало «Процесс»:
```bash
python3 tools/pipeline_log.py stage-start critic --note "круг <N>"
```
и вместо `/tmp/critic-<slug>.md` писать вердикт в `$SV_RUN_DIR/critic-round-<N>.md`, затем:
```bash
python3 tools/pipeline_log.py verdict --round <N> --verdict accepted|revisions \
  --issues <N> --report "$SV_RUN_DIR/critic-round-<N>.md"
python3 tools/pipeline_log.py stage-end critic --status ok
```

**`.claude/skills/produce/SKILL.md`** — заменить команды на `wrap`-варианты (§2.4) и
добавить шаг 7:
```
7. Закрытие прогона: `python3 tools/pipeline_log.py finish`.
   Команда падает, если не размечены обязательные этапы — тогда ДОразметь и повтори.
   Коммит делается только после зелёного finish. В отчёт пользователю числа
   бери из runs/<run_id>/manifest.json, не из головы.
```

**`.claude/skills/animator/SKILL.md`** и **`README.md`** — те же `wrap`-команды в блоке
«Пайплайн производства эпизода», чтобы у одиночного исполнителя (Codex читает эти файлы)
не осталось «старой» версии команды.

### 2.6. Три рычага дисциплины (по логике ROADMAP: не уговаривать, а менять стимулы)

ROADMAP правильно диагностирует: режиссёр не творил, потому что рост нигде не мерился и
безопасный путь был разрешён. С логированием ровно те же грабли, лечим так же:

1. **Убрать возможность забыть.** `wrap` встроен в команды, которые и так обязательны.
   Забыть можно только то, что является отдельным действием — а таких мест осталось шесть
   строк на три файла.
2. **Сделать пропуск дорогим на последнем шаге.** `finish` — гейт: он выходит ненулевым
   кодом со списком «не размечено: director, critic», а `/produce` запрещает коммит и
   сдачу до зелёного `finish`. Доразметить постфактум можно (события допишутся с
   `inferred_start`), но это попадёт в `integrity` и в недельный отчёт — то есть
   аккуратность дешевле неаккуратности.
3. **Измерять и публиковать.** `coverage_pct` и `unaccounted_sec` попадают в разрез по
   моделям в `reports/<неделя>.md`. Ровно тот же механизм, что Б4 в ROADMAP: то, что
   измеряется и сравнивается, начинает делаться.

Чего сознательно **не** делаем: git pre-commit hook, запрещающий коммит без манифеста.
Слишком инвазивно — сломает ручные правки движка и человеческие коммиты, и при 15
прогонах в день будет мешать чаще, чем помогать. Гейт живёт в `finish`, а не в git.

### 2.7. Одиночный исполнитель (Codex) — без единой оговорки

Всё вышеописанное — это вызовы CLI из bash. Ни `pipeline_log.py`, ни `run_episode.sh` не
знают про Agent tool, `.claude/agents/*` и под-агентов. Codex, читающий
`.claude/agents/scriptwriter.md` и играющий сценариста сам, выполняет ту же строку
`stage-start scriptwriter`. Разница фиксируется одним полем: `runner.orchestration` =
`single-actor` против `subagents` (обёртка ставит его из аргумента `--runner`, а
`stage_start` может уточнить `--model`, если роли играют разные модели).

Именно это делает сравнение корректным: **измерительный прибор один и тот же**, а
архитектура исполнения — измеряемый параметр, а не предпосылка.

### 2.8. Как определяются НОВЫЕ визуалы — программно, без слов агента

`pipeline_log.py snapshot` строит «отпечаток библиотеки» из четырёх независимых
источников:

1. **Схема** `schema/scenes.schema.json`:
   - типы сцен = `$defs.scene.oneOf[].$ref`;
   - визуалы битов = `$defs.story.properties.beats.items.properties.visual.enum`
     (сейчас 7 значений: `browser-click`, `devices-meet`, `handshake`, `title-slam`,
     `password-leak`, `hash-table`, `collision-compare`);
   - набор ключей `properties` каждого типа сцены — так ловятся расширения вроде
     `diagram.channel` и `nodes[].secret` (реальный пример: коммит `91d8436`), которые
     новым визуалом формально не являются, но язык расширяют.
2. **Компоненты**: `video/src/scenes/*.tsx`, `video/src/primitives/*.tsx` — имя файла
   плюс sha1 содержимого. Даёт и новые файлы, и «модифицирован `StoryScene.tsx`»
   (новый бит добавляется именно правкой switch внутри него, отдельного файла не появляется).
3. **Каталог** `.claude/skills/animator/catalog.md`: заголовки `## <тип>` и строки таблицы
   визуалов битов. Сравнение с (1) даёт **catalog_drift** — визуал есть в схеме, но не
   описан в каталоге (или наоборот). Это автоматическая проверка правила Б4 «каталог =
   память системы», которую сейчас никто не проверяет.
4. **git**: `git rev-parse HEAD` до и после. Позволяет продублировать вывод через
   `git diff --stat <before>..<after> -- video/src schema .claude/skills/animator/catalog.md`.

Диff `snapshot-before.json` → `snapshot-after.json` даёт блок `library_growth`. Плюс
пересечение с фактически использованными в эпизоде визуалами
(`composition.visuals_used`) даёт `created_but_unused` — защиту от накрутки метрики
«новых визуалов: N» пустыми компонентами.

Важно: snapshot работает, даже если агент забыл сделать коммит; git-диff работает, даже
если snapshot не был снят. Два независимых способа — намеренно.

### 2.9. Что делать с уже существующими шестью эпизодами

`pipeline_log.py backfill --slug <slug>` реконструирует манифест из того, что есть на
диске и в git:

- `composition` — полностью (эпизод + `meta.json` + `ffprobe` по mp4, если он есть);
- `quality_signals` — полностью (считается из тех же файлов);
- `episode.*` — из драфта, если он есть (`hash-tables`, `pipeline-tour`, `recursion-stack`,
  `ssh-basics`, `dns-basics` — есть; `tcp-handshake`, `binary-basics` — без драфта);
- `timing` — `null`, кроме `finished_at` = дата коммита эпизода;
- `runner` — `{"cli":"unknown"}`;
- `integrity.source` = `"backfill"`.

Так корпус для аналитика становится единообразным, а аналитик по полю `integrity.source`
понимает, где числа реальные, а где реконструированные, и не считает средние по этапам
на прогонах, где этапов нет.

---

## 3. Агрегированный период-отчёт

### 3.1. Разделение труда: числа считает Python, смысл пишет LLM

Тот же принцип, что и в §2: агент не должен складывать 105 чисел в уме — он ошибётся, а
проверить будет нечем.

**`tools/analytics.py`** — детерминированный агрегатор:

```
tools/analytics.py report --since 7d [--until ...] --out reports/2026-W32
tools/analytics.py topics                # таблица использованных тем (для сценариста)
tools/analytics.py compare --by model    # быстрый разрез моделей в терминал
```

Читает: `runs/index.jsonl` (быстрый проход) → манифесты попавших в период прогонов →
`git log --since` по путям `video/src`, `schema`, `.claude` → `episodes/*.json` для
исторического контекста → `metrics/*.json`, если они уже есть (фаза 2).

Пишет `reports/<YYYY-Www>.json`:

```jsonc
{
  "period": {"from":"2026-08-03","to":"2026-08-09","week":"2026-W32"},
  "episodes": {
    "produced": 92, "ok": 87, "failed": 5,
    "total_video_sec": 6420, "total_words": 11730,
    "by_category": {"networks": 24, "security": 19, "linux": 17, "web": 15, "crypto": 9, "hardware": 8},
    "by_device": {"Миф-бастер": 14, "Детектив": 12, "Versus": 11, "...": "..."},
    "list": [{"slug":"...","title":"...","date":"...","model":"...","new_visuals":2,"critic_rounds":0}]
  },
  "topics": {
    "new": ["hash-tables", "..."],
    "near_duplicates": [{"a":"dns-basics","b":"dns-cache","similarity":0.71}],
    "gaps_suggested": ["файловые системы", "планировщик задач", "кэш процессора"]
  },
  "library": {
    "visuals_before": 7, "visuals_after": 19, "delta": 12,
    "new": [{"name":"hash-table","first_seen":"2026-08-05","run_id":"...","model":"claude-sonnet-5",
             "used_in":["hash-tables","hash-resize"],"documented":true}],
    "created_but_unused": ["packet-storm"],
    "catalog_drift": {"in_schema_not_in_catalog": [], "in_catalog_not_in_schema": []},
    "roadmap_kpi": {"target":"≥8 визуалов на 10 роликов","actual":"12 на 92","met":false}
  },
  "timing": {
    "overall": {"wall_sec_total": 264500, "wall_sec_avg": 2875, "wall_sec_median": 2610, "p90": 4210},
    "by_stage": {
      "scriptwriter": {"sum":38000,"avg":413,"median":390,"p90":700,"share_pct":14.4},
      "director":     {"sum":90700,"avg":986,"median":905,"p90":1800,"share_pct":34.3},
      "tts":          {"sum":21500,"avg":234,"median":228,"p90":310,"share_pct":8.1},
      "validate":     {"sum":270,"avg":3,"median":2,"p90":6,"share_pct":0.1},
      "critic":       {"sum":58900,"avg":640,"median":580,"p90":1400,"share_pct":22.3},
      "render":       {"sum":101700,"avg":1105,"median":1080,"p90":1290,"share_pct":38.4},
      "telegram":     {"sum":3800,"avg":41,"median":38,"p90":60,"share_pct":1.4}
    },
    "coverage_pct_avg": 91.2,
    "unaccounted_sec_avg": 253
  },
  "by_runner": {
    "claude-code/claude-opus-5/max":  {"episodes":31,"wall_avg":2610,"new_visuals":6,
                                       "critic_rounds_avg":0.4,"failed":1,"cost_usd_total":66.3,
                                       "coverage_pct_avg":95.1},
    "claude-code/claude-sonnet-5/max":{"episodes":40,"wall_avg":2875,"new_visuals":4,
                                       "critic_rounds_avg":0.9,"failed":3,"cost_usd_total":41.0,
                                       "coverage_pct_avg":93.7},
    "codex-cli/gpt-5.6-luna/max":     {"episodes":21,"wall_avg":2940,"new_visuals":2,
                                       "critic_rounds_avg":0.6,"failed":1,"cost_usd_total":null,
                                       "coverage_pct_avg":78.2}
  },
  "quality": {
    "critic_rounds_distribution": {"0": 61, "1": 24, "2": 5, ">2": 2},
    "accepted_first_try_pct": 66.3,
    "anchors_resolved_pct": 98.1,
    "validate_failures_avg": 0.7,
    "scenes_without_impact_total": 12
  },
  "incidents": {
    "by_kind": {"fallback": 34, "validation_failed": 21, "command_failed": 5, "alignment_drift": 9},
    "tts_fallback_rate_pct": 37.0,
    "telegram_failures": 3,
    "top_details": [{"detail":"gemini-3.1-flash-tts-preview: 429","count":31}]
  },
  "engine": {
    "commits": 47, "commits_touching_video_src": 19,
    "render_realtime_ratio_avg": 15.1, "render_realtime_ratio_trend": -0.8
  },
  "resources": {
    "git_size_mb": 218, "disk_free_gb": 11.4,
    "audio_added_mb": 96, "mp4_produced_gb": 3.2, "mp4_archived_gb": 3.2
  }
}
```

### 3.2. Агент-аналитик

Новый агент `.claude/agents/analyst.md` (модель: sonnet — задача читательская) и скилл
`.claude/skills/weekly-report/SKILL.md`, который его запускает.

Инструкция агента, по сути:

1. Запусти `python3 tools/analytics.py report --since 7d --out reports/<YYYY-Www>` —
   **все числа берутся отсюда, считать самому запрещено**.
2. Прочитай `reports/<YYYY-Www>.json`, `git log --since=7.days --stat`,
   `.claude/skills/animator/catalog.md`, ROADMAP.md.
3. Выборочно прочитай 3–5 манифестов: самый быстрый прогон, самый долгий, все `failed`
   и все с `critic_rounds >= 2` — чтобы объяснить хвосты распределения.
4. Напиши `reports/<YYYY-Www>.md` по фиксированной структуре:
   - **Итог недели** — 3–5 предложений;
   - **Производство** — сколько сделано, сколько упало и почему;
   - **Рост языка визуалов** — какие визуалы появились, кем созданы, где применены,
     выполнен ли KPI ROADMAP «≥8 визуалов на 10 роликов»;
   - **Время** — таблица этапов (сумма/среднее/медиана/p90/доля), где узкое место;
   - **Модели** — таблица разрезов, кто быстрее, кто творит больше визуалов, кто чаще
     проходит критика с первого раза, кто дисциплинированнее логируется;
   - **Темы** — покрытые категории, найденные близкие дубли, предложение 10 тем на
     следующую неделю в очередь;
   - **Инциденты** — что ломалось системно (например, доля фолбэков TTS);
   - **Ресурсы** — рост `.git`, свободное место, стоимость;
   - **Три конкретных предложения** по изменению конвейера на следующую неделю.
5. Прочерк вместо числа, которого нет в JSON. Гипотезу помечай словом «гипотеза».

Запуск: вручную `/weekly-report`, либо cron-задачей в воскресенье (см. §4.4).

---

## 4. Встраивание в цикл автономного производства

### 4.1. Очередь тем вместо «агент придумывает на ходу»

```
queue/
  topics.jsonl     # {"topic":"...", "category":"...", "slug_hint":"...",
                   #  "status":"pending|claimed|done|failed|parked",
                   #  "attempts":0, "run_id":null, "added_at":"...", "added_by":"analyst|user"}
  policy.json      # {"max_runs_per_day":15, "max_cost_usd_per_run":3.0,
                   #  "max_cost_usd_per_day":30, "min_free_gb":5,
                   #  "run_timeout_min":90, "max_attempts":2,
                   #  "models":[{"cli":"claude","model":"opus","effort":"max","weight":1},
                   #            {"cli":"claude","model":"sonnet","effort":"max","weight":1},
                   #            {"cli":"codex","model":"gpt-5.6-luna","effort":"max","weight":1}]}
```

Очередь пополняет агент-аналитик в конце недели (у него на руках анализ пробелов) и
пользователь вручную. Ротация моделей по `weight` даёт равномерную выборку для сравнения,
а не «все ролики сделал Opus».

### 4.2. `tools/run_next.sh` — один тик цикла

1. `flock runs/.lock -n` — занято, значит предыдущий рендер ещё идёт, тихо выходим
   (главная защита Pi: тик не наслаивается на тик).
2. Проверить `policy.json`: прогонов сегодня по `runs/index.jsonl` < `max_runs_per_day`,
   сумма `cost_usd` за сегодня < `max_cost_usd_per_day`, свободного места ≥ `min_free_gb`.
3. Атомарно взять первую `pending` тему → `claimed`.
4. Выбрать модель по весам, вызвать `tools/run_episode.sh ... --budget-usd ...`.
5. По коду возврата: `done` / `failed` (+`attempts`; при `attempts >= max_attempts` →
   `parked`). Тема с ошибкой **не блокирует** очередь — следующий тик берёт следующую.
6. Сбойный прогон всё равно закрывается `finish --status failed`: манифест с
   `failed_stage` пишется и попадает в аналитику. Отвалившийся эпизод — это тоже данные.

Идемпотентность и устойчивость: состояние живёт в файлах, а не в памяти сессии.
Перезагрузка Pi, обрыв Wi-Fi, `kill` — следующий тик просто продолжает с очереди.

### 4.3. Чем планировать: сравнение доступных примитивов

| Примитив | Что это | Годится? |
|---|---|---|
| **systemd timer** → `tools/run_next.sh` | обычный системный таймер на хосте | **Да, основной вариант.** Пайплайну не нужна живая LLM-сессия-надзиратель: `run_episode.sh` сам поднимает headless CLI. Планировщик без LLM = ноль токенов на холостом ходу, переживает ребут, логи в journald, поведение полностью предсказуемо. |
| `CronCreate` / `CronList` | «выстрелить промптом по расписанию» из Claude Code | Годится как вариант без возни с systemd: `CronCreate` с выражением `5,35 * * * *` и промптом «запусти `tools/run_next.sh` и доложи». Минусы: поверх каждого тика поднимается лишняя LLM-сессия ради одного bash-вызова; рекуррентные задачи автоистекают через N дней (для недельного батча это, впрочем, скорее плюс — само выключится). Разумно использовать для **лёгких** задач: ночная сводка, воскресный отчёт. |
| Скилл `loop` | прогон промпта с интервалом внутри живой сессии | Нет для недельного батча: требует, чтобы сессия жила семь суток. Полезен для отладки — «сделай 3 ролика подряд и покажи» в течение одной сессии. |
| Скилл `schedule` (routines) | **облачные** агенты по cron | Нет: конвейеру нужны Remotion, `node_modules`, `venv` с faster-whisper, ffmpeg, ключи из локального `.env` и SD-карта с ассетами. Ничего этого в облачном окружении нет. |
| `ScheduleWakeup` | пробуждение динамического `loop` | Нет: это механика внутри `/loop`, а не независимый планировщик. |
| `Monitor` | стриминг событий из долгого процесса | Полезен **вокруг** цикла: `Monitor` на `tail -f` журнала прогонов с фильтром на `failed|429|Traceback`, чтобы падения всплывали сразу, а не в воскресном отчёте. |

**Рекомендация:** systemd timer каждые 30 минут (с `flock`, который сам пропускает тик,
если предыдущий не закончился) + `CronCreate` на воскресный `/weekly-report` +
`Monitor` на инциденты, когда пользователь в сессии.

Реалистичность «15 роликов в день» стоит проверить числами до запуска: один прогон Codex
занял 47 мин 55 сек; в этом уже есть рендер на Pi. 15 × ~48 мин = 12 часов чистого
машинного времени в сутки. Технически влезает, но Pi будет загружен наполовину постоянно.
Если рендер окажется узким местом (`timing.stages.render.share_pct` в отчёте это покажет
прямо) — выносить рендер на `toligrim` (SSD, свободный CPU, гигабитный линк) отдельным
шагом. Первую неделю разумно поставить `max_runs_per_day: 6–8` и поднять после первого
отчёта: `p90` времени прогона из отчёта — точный ответ на вопрос «сколько влезает».

### 4.4. Как не повторять темы

Три уровня, от дешёвого к надёжному:

1. **Механический запрет.** `run-start` отказывается стартовать, если
   `episodes/<slug>.json` уже есть (без `--rerun`). Прямые дубли невозможны.
2. **Контекст сценаристу.** `tools/analytics.py topics` печатает компактную таблицу
   `slug | title | category | device | дата` по всем эпизодам и всем `pending`-темам
   очереди. Одна команда в `scriptwriter.md` вместо «прочитай шесть JSON-ов» — и она
   продолжает работать, когда эпизодов станет сто.
3. **Детект близких дублей постфактум.** `topic_signature` в манифесте (нормализованные
   токены `title` + `category` + `slug`), попарное сходство по Жаккару; пары выше 0.6
   уходят в `topics.near_duplicates` недельного отчёта, аналитик решает, дубль это или
   сознательное углубление темы.

Правило про нарративный приём («не повторять приём последних 5 роликов») из
`scriptwriter.md` тоже становится проверяемым: `device` лежит в манифесте, отчёт строит
гистограмму приёмов, и «все 92 ролика — Миф-бастер» перестаёт быть незамеченным.

### 4.5. Ограничение рисков прогона

| Риск | Механизм |
|---|---|
| Один прогон съедает весь бюджет | `claude -p --max-budget-usd` из `policy.json`; выход по бюджету = отдельный `status`, тема уходит на ретрай |
| Дневная стоимость | сумма `cost_usd` по `runs/index.jsonl` за сегодня против `max_cost_usd_per_day` |
| Зависший прогон | `timeout 90m` в `run_episode.sh`; `finish --status failed` в `trap EXIT` |
| Забитая SD-карта | предполётная проверка `min_free_gb`; архивация mp4 на `toligrim` после отправки в Telegram |
| Каскадный сбой (сдох ключ Gemini) | `run_next.sh` останавливает цикл, если три последних прогона подряд `failed`, и шлёт сообщение в Telegram-бот |
| Параллельные рендеры на Pi | `flock runs/.lock` |
| Сломанный движок портит всю неделю | предполётный `npx tsc --noEmit` в `run_episode.sh`; красный tsc — прогон не стартует, тема остаётся `pending` |

---

## 5. Фаза 2 — соцметрики (кратко)

Ключ связи — тот же `slug`, он уже сквозной от драфта до mp4.

1. Публикация дописывает в манифест блок:
   ```json
   "publication": [
     {"platform":"youtube","video_id":"abc123","url":"...","published_at":"2026-08-06T09:00:00Z"},
     {"platform":"telegram","chat":"...","message_id":4812,"published_at":"..."}
   ]
   ```
2. Отдельный сборщик `tools/metrics_pull.py` (раз в сутки, тем же systemd timer) тянет
   YouTube Data API / Telegram-статистику и **аппендит** в `metrics/<slug>.jsonl`:
   ```json
   {"date":"2026-08-12","platform":"youtube","views":1840,"likes":92,"comments":7,
    "avg_view_pct":58.3,"shares":11}
   ```
   Именно append, а не перезапись: динамика просмотров по дням сама по себе информативна
   (всплеск на третий день — это алгоритм, а не качество ролика).
3. Аналитик джойнит по `slug` и строит корреляции против производственных сигналов,
   которые у него уже есть: `critic_rounds`, `library_growth.count`, `device`, `category`,
   `video_sec`, `wpm`, `quality_signals.*`, модель-исполнитель.

Обязательная оговорка в инструкции аналитика: выборка маленькая и сильно спутана
(алгоритм платформы, время публикации, тема), поэтому до ~30 роликов в каждой корзине
любые выводы формулируются как гипотезы и проверяются намеренным экспериментом
(например, неделя, где половина роликов идёт с приёмом A, половина с B), а не
наблюдением задним числом.

---

## 6. Порядок внедрения

| Шаг | Что | Сложность | Что даёт сразу |
|---|---|---|---|
| **0** | `tools/pipeline_log.py`: `run-start`, `stage-start/end`, `wrap`, `event`, `finish`, `runs/`, `runs/index.jsonl`, обновить `.gitignore` | ~1 ч, чистый Python без зависимостей | Полное wall-clock каждого прогона и каждой обёрнутой команды. Работает без единой правки агентов |
| **1** | `snapshot` + диф библиотеки (`library_growth`) | ~1 ч, парсинг схемы/каталога/sha1 файлов | «Новых визуалов: N» становится **измеренным фактом**, а не самоотчётом. Плюс автопроверка catalog_drift — Б4 из ROADMAP закрывается механически |
| **2** | Сборщик `manifest.json`: `composition`, `quality_signals`, `artifacts`, `incidents` + `backfill` для 6 старых эпизодов | ~2 ч, всё выводится из существующих файлов | Тот самый текстовый файл, ради которого всё затевалось. Ролик читается, а не смотрится |
| **3** | Правки инструкций: `wrap`-команды в `produce/SKILL.md`, `animator/SKILL.md`, `README.md`; по 2 строки в трёх агентов; гейт `finish` | ~30 мин, только markdown | Разбивка по этапам и ролям. Ноль изменений в коде конвейера |
| **4** | `tools/run_episode.sh` с `--runner claude\|codex` | ~1 ч, bash | Честное сравнение моделей одним прибором. Именно этого не хватает прямо сейчас, пока идут прогоны Codex/Sonnet/Opus |
| **5** | `tools/analytics.py report` + `reports/` + `.claude/agents/analyst.md` + `.claude/skills/weekly-report/` | ~3 ч | Недельный отчёт. Осмысленно после ~15–20 прогонов с манифестами |
| **6** | `queue/`, `tools/run_next.sh`, systemd timer, `policy.json` | ~3 ч + отладка | Автономный цикл. Включать только после того, как шаги 0–4 обкатаны вручную |
| **7** | Публикация, `tools/metrics_pull.py`, `metrics/`, корреляции в отчёте | отдельная фаза | Соцметрики. Требует Фазы 4 из ROADMAP (автозагрузка), которая пока отложена |

Шаги **0–4 = примерно 5–6 часов** и полностью закрывают исходный запрос «сохранять
структурированное описание того, из чего состоит ролик и как он был произведён».
Всё остальное надстраивается поверх и не требует переделки формата.

Порядок внутри 0–4 не произволен: 0 даёт пол измерений без чужой кооперации, 1 закрывает
самую спорную метрику (рост библиотеки), 2 делает файл читаемым для LLM, 3 добавляет
разбивку по ролям, 4 делает измерение переносимым между CLI. Каждый шаг полезен сам по
себе и не ломается, если следующий не сделан.

---

## 7. Риски и компромиссы

### 7.1. Разрастание репозитория при 15 роликах в день

Цифры на сегодня: 6 эпизодов, `.git` = 37 МБ, 5.9 МБ трекнутого mp3 (≈1 МБ на эпизод),
готовый mp4 ≈ 35 МБ на 9 сцен, на SD-карте 25 ГБ свободно.

Экстраполяция на 15 × 7 = 105 роликов в неделю:
- аудио: **~100 МБ в неделю в git навсегда** (mp3 не сжимается дельтами — каждый байт
  ложится в историю как есть);
- mp4: **~3.7 ГБ в неделю на диск** (в git не идут, `*.mp4` в `.gitignore`, но карту
  забьют за ~6 недель);
- манифесты и журналы: ~10–35 КБ на прогон → **~1–3 МБ в неделю**. Пренебрежимо, и это
  ровно то, что аналитику нужно.

Рекомендуемая политика:

1. **Коммитить**: `episodes/*.json`, `episodes/drafts/*.json`, `runs/*/manifest.json`,
   `runs/*/events.jsonl`, `runs/*/critic-*.md`, `runs/index.jsonl`, `reports/**`,
   `video/src/**`, `schema/**`, `catalog.md`, `video/public/episodes/*/meta.json`,
   `video/public/episodes/*/script.json`. Всё текстовое, всё нужно и всё хорошо жмётся.
2. **Перестать коммитить аудио**: добавить `video/public/episodes/*/audio/` в `.gitignore`.
   Аудио воспроизводимо из эпизода (не побитово — TTS недетерминирован, — но для
   перерендера этого достаточно, а точная запись нужна только чтобы перерендерить
   *тот же самый* ролик).
3. **Архив тяжёлого — на второй Pi.** `toligrim` (SSD, 163 ГБ свободно, гигабитный линк
   `10.10.10.2`) — естественное место: последним шагом `run_episode.sh` делает
   `rsync mp4 + audio → toligrim-eth:/srv/shortvideo/archive/<slug>/` и пишет путь в
   `artifacts.mp4.archived_to`. При 3.7 ГБ в неделю там помещается ~10 месяцев.
4. **Историю не переписывать.** Никаких `filter-repo`/BFG ради уже закоммиченных 5.9 МБ —
   риск больше выигрыша. Просто перестать добавлять.
5. **Одна коммит-точка на прогон**, сообщение машиночитаемое:
   `эпизод: <slug> [<cli>/<model>, визуалов +N, критик ×R]` — аналитик парсит git log
   без манифеста как перекрёстную проверку.

Компромисс явный: отказавшись коммитить аудио, мы теряем возможность точно перерендерить
старый ролик из чистого клона. Взамен репозиторий остаётся рабочим на годы. Для роликов,
которые реально опубликованы, точный mp4 всё равно лежит в архиве на `toligrim`.

### 7.2. Стоимость и токены при батч-прогонах

- Дорогие места — не то, что кажется: рендер стоит машинного времени, но не токенов;
  токены жрут круги критика (каждый круг — это 14 stills, прочитанных мультимодально) и
  кузница (итерации Preview). Поэтому в `policy.json` есть `max_cost_usd_per_run`, а в
  отчёте — `cost_usd` в разрезе моделей: если Opus стоит вдвое дороже Sonnet при том же
  числе новых визуалов и той же доле принятых с первого раза, это будет видно числом, а
  не ощущением.
- Ротация моделей по весам даёт сравнимые выборки; гонять неделю только на самой дорогой
  модели — потратить бюджет и не получить сравнения.
- `--effort` тоже параметр манифеста: сравнение `max` vs `high` на одной модели — дешёвый
  способ понять, окупается ли максимальный effort.

### 7.3. Ненадёжность самоотчётности LLM

Уже разобрано в §2, здесь — итог того, что где хранится:

| Данные | Источник | Можно ли модели соврать |
|---|---|---|
| Время этапов | `time.monotonic()` в `pipeline_log.py` | Нет. Можно только сдвинуть момент вызова |
| Состав ролика | вычислен из `episodes/*.json` + `meta.json` + `ffprobe` | Нет |
| Новые визуалы | диф схемы/каталога/файлов + git diff | Нет |
| Фолбэки TTS | регулярки по stderr в `wrap` | Нет |
| Круги и вердикты критика | `verdict` + сохранённый файл отчёта | Косвенно (вердикт — это мнение), но факт круга зафиксирован |
| `self_reported.*` | слова модели | Да — и это единственное место, где они лежат, помеченное |

Остаточный риск — **этап не размечен вовсе**. Он не устраняется, но становится видимым:
`coverage_pct` и `unaccounted_sec` в манифесте, разрез по моделям в отчёте. Плохая
разметка перестаёт быть невидимой и становится сравнительным показателем.

### 7.4. Goodhart: метрика «новых визуалов» начнёт накручиваться

Как только «новых визуалов: N» станет измеряемым и публикуемым, появится стимул плодить
формальные визуалы. Противоядия уже заложены в схему:
`library_growth.created_but_unused` (создан, но в эпизоде не применён),
`catalog_drift` (не описан в каталоге), а в недельном отчёте главная цифра — не «сколько
создано», а «сколько создано **и использовано** хотя бы в одном ролике». Плюс аналитик
обязан отдельно назвать визуалы, применённые больше чем в одном эпизоде — это разница
между ростом языка и мусором.

### 7.5. Совместимость со старыми эпизодами

- `meta.json` и `script.json` **не меняются вообще**. Формат заморожен: `meta.json`
  остаётся голым массивом (иначе ломается `calculateMetadata` в `Root.tsx`),
  `script.json` — побайтовой копией эпизода (иначе ломается `validate.py` из-за
  `additionalProperties: false`). Все шесть отрендеренных эпизодов продолжают рендериться
  без единой правки.
- `episodes/<slug>.json` и `schema/scenes.schema.json` не трогаются.
- Манифесты старых эпизодов реконструируются `backfill` (§2.9) и честно помечаются
  `integrity.source = "backfill"`; агрегатор исключает их из статистик по времени и
  включает в статистики по составу и темам.
- Версионирование: `schema_version` в манифесте с первого дня. При смене формата
  `analytics.py` читает обе версии, а не мигрирует файлы задним числом — манифест
  описывает прошлое, переписывать прошлое нельзя.

### 7.6. Мелкие, но реальные

- **`events.jsonl` и параллельная запись.** Под-агенты Claude Code могут писать
  одновременно. Каждая запись — `open(..., 'a')` + одна строка < 4 КБ + `flock` на файл:
  атомарность гарантирована, порядок восстанавливается по `mono`, а не по позиции в файле.
- **Часы Pi.** NTP на Raspberry Pi может прыгнуть. Поэтому в каждом событии есть и `ts`
  (UTC, для чтения человеком), и `mono` (монотонные секунды от старта прогона, для
  арифметики). Все длительности считаются по `mono`.
- **Логгер как точка отказа.** Снимается правилом «всё, кроме `finish`, завершается
  кодом 0 при любой внутренней ошибке».
- **Раздувание `runs/` числом каталогов.** 105 каталогов в неделю, ~5.5 тысяч в год.
  Файловой системе всё равно, но для удобства — годовая группировка
  `runs/2026/08/<run_id>/`, если каталогов станет неудобно много. `runs/index.jsonl`
  всё равно остаётся основной точкой входа.
