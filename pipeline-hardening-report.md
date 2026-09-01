# Production-hardening пайплайна ShortVideo — итоговый отчёт

Дата: 2026-09-01. Базовая диагностика: `pipeline-diagnostics.md`. Задача от ChatGPT (14 этапов) выполнена
оркестратором (Claude Code) через параллельное делегирование четырём codex MCP-сессиям в изолированных git
worktree, плюс один прямой хостовый фикс (AppArmor) и один самостоятельно выполненный интеграционный аудит
(после того как две попытки делегировать его отдельной codex-сессии подряд упёрлись в 30-минутный
MCP-таймаут — подробности в разделе «Известные ограничения»).

---

## 1. Root causes (кратко, полный разбор — `pipeline-diagnostics.md`)

| # | Проблема | Причина | Раздел диагностики |
|---|---|---|---|
| 1 | `RTM_NEWADDR` в sandbox, 100% детерминированно | AppArmor-профиль `/etc/apparmor.d/codex-bwrap` покрывал только npm-путь Codex; продакшн с 22-23.08 использует standalone-дистрибутив по другому пути — профиль осиротел | §1.1, §2, §3 |
| 2 | Ложные `worktree_path_violation`/`worktree_conflict` | `git()`-обёртка в `delegate_worktree.py` безусловно вызывала `.strip()` над machine-readable git-выводом (`-z`-протокол и blob-содержимое) | §8 |
| 3 | `youtube_final_chunk_timeout` | Код маппил ЛЮБОЙ `OSError` на финальном чанке в «timeout», без проверки реального исхода на стороне YouTube | §9 |
| 4 | Instagram "not configured safely" без деталей | `live.py` ловил содержательные `InstagramConfigurationError` и переподнимал как generic `PermanentPublishError(...) from None`, обрывая cause chain | §10 |
| 5 | `gpt-5.2-codex`, `SyntaxError: Unexpected identifier 'totp'` | Оркестратор сам генерировал JS-вызовы `tools.mcp__codex__codex(...)` руками — произвольный model override и незаэкранированные backticks внутри JS template literal | §4.3, §11 |

---

## 2. Что сделано, по направлениям

### AppArmor (оркестратор напрямую на хосте — раздел 3 ниже)
Единственная не-делегированная часть — системный файл вне репозитория, требовал sudo.

### Agent A — `tools/delegate_worktree.py` (worktree-safety)
- `.strip()` полностью убран из machine-readable путей. Новый `git_raw()` возвращает bytes без нормализации,
  `git()` оставлен только для scalar-текста (commit SHA и т.п.).
- `changed_paths()` переписан на `git diff --name-only -z --no-renames` + `git ls-files --others --exclude-standard -z`
  вместо хрупкого парсинга `git status --porcelain -z`.
- Новый явный тип `FileState(exists, content, kind, mode)` — конфликт-детектор сравнивает состояния побайтово
  через `git cat-file`/`Path.read_bytes()`, различая «нет файла» и «пустой файл» через `git ls-tree`, а не через
  `blob == ""`.
- Explicit change-type классификация (add/modify/delete/rename-как-delete+add/symlink); неподдерживаемые типы
  дают machine-readable `worktree_unsupported_change_type`, не теряются молча.
- 20 regression-тестов в новом `tools/test_delegate_worktree.py`.

### Agent B — control plane, telemetry, sandbox preflight
- `tools/codex_sandbox_doctor.py` — детерминированный preflight: резолвит реальный `codex`/vendored `bwrap` через
  PATH, безопасный `--unshare-net --unshare-user` smoke-test, классы `ok`/`codex_not_found`/
  `vendored_bwrap_not_found`/`bwrap_userns_denied`/`bwrap_rtm_newaddr`/`bwrap_unknown_failure`.
- `tools/run_episode.sh` вызывает doctor ДО первого delegate/LLM-токена; non-`ok` → `pipeline_log finish
  --result-class infrastructure_failure --error-code codex_sandbox_unavailable`, `exit 78`, без единой попытки
  делегата (проверено вживую, раздел 4).
- `tools/delegate_invoke.py` (1110 строк) — детерминированный bridge вокруг `mcp__codex__codex`. **Investigation
  finding**: JS-исполнение внутри `exec`-тула codex — sandboxed V8 без Node `fs`/`require`/`process`; отдельного
  native API для вложенных MCP-вызовов не найдено. Bridge читает prompt через `cat -- <path>` (`tools.exec_command`),
  не `readFileSync`.
- `tools/delegate_policy.json` — единственный источник role→model/role→sandbox (scriptwriter/animation-director/
  critic), CLI `render` физически не принимает `--model`/`--sandbox`/`--cwd` от вызывающего.
- `tools/agent_log.py` — `RESULT_CLASSES` (success/semantic_failure/infrastructure_failure/control_plane_failure/
  policy_failure), `delegate-start`/`delegate-result`, раздельные infrastructure/semantic attempt-счётчики,
  circuit breaker.
- `tools/pipeline_log.py` — команда `telemetry`, 12 структурированных событий с алиасами старых имён
  (`worktree_open`→`worktree_opened` и т.п.) для обратной совместимости.

### Agent C — `tools/publishing/adapters/youtube.py` (+ точечно `worker.py`)
- Transport-ошибка на финальном чанке → status probe (`Content-Length: 0`, `Content-Range: bytes */TOTAL`) вместо
  немедленного `reconciliation_required`. Обрабатывает completed/308-resume/5xx+Retry-After/404-expired.
- Новое имя ошибки `youtube_final_chunk_outcome_unknown` (старое `youtube_final_chunk_timeout` не мигрируется,
  остаётся читаемым — worker принимает решения по durable state, не по строке кода).
- Состояние `processing` между upload-complete и `published`, поллинг `processingDetails.processingStatus`,
  configurable SLA, `youtube_processing_stuck` без дублирования upload.
- Сохранение исходной transport-диагностики (класс исключения/стадия/elapsed/HTTP-статус) без Authorization
  headers и без полного session URI.
- **Operator-visible изменение**: OAuth-скоуп расширен `youtube.upload` → `youtube.upload + youtube.readonly`
  (нужен для поллинга processing status). Раздел 11.

### Agent D — Instagram doctor (`live.py`, `instagram.py`, `publish.py`)
- `raise ... from None` убран — cause chain сохраняется.
- Doctor собирает ВСЕ найденные проблемы конфигурации за один проход, не останавливается на первой.
- Высокоуровневый код `instagram_configuration_invalid` сохранён (обратная совместимость), плюс конкретные
  reason-коды (список — раздел 9) и человекочитаемый guidance-текст в CLI-выводе.

---

## 3. AppArmor change (сделал оркестратор напрямую на хосте, не делегат)

- Бэкап оригинала: `/etc/apparmor.d/codex-bwrap.bak.20260901T121923Z`.
- Добавлен профиль `codex-bwrap-standalone`, покрывающий
  `/home/toligrim/.codex/packages/standalone/releases/*/codex-resources/bwrap` (version-independent glob —
  следующий standalone-релиз не потребует ручной правки профиля).
- Существующие `codex-bwrap-local`/`codex-bwrap-usr` (npm-пути) не тронуты.
- `kernel.apparmor_restrict_unprivileged_userns=1` не менялся ни разу за весь прогон — проверено многократно
  (последняя проверка — прямо перед этим отчётом).
- Acceptance test (воспроизведён многократно за время работы, не только один раз): 10 последовательных + 3
  параллельных запуска standalone bwrap — 100% успех; контрольные npm-пути — тоже без регрессии.

---

## 4. Список изменённых файлов

```
docs/delegate-invocation-protocol.md   (новый)
tools/agent_log.py                     (изменён)
tools/codex_sandbox_doctor.py          (новый)
tools/delegate_invoke.py               (новый)
tools/delegate_policy.json             (новый)
tools/delegate_worktree.py             (изменён)
tools/pipeline_log.py                  (изменён)
tools/publish.py                       (изменён)
tools/publishing/adapters/instagram.py (изменён)
tools/publishing/adapters/live.py      (изменён)
tools/publishing/adapters/youtube.py   (изменён)
tools/publishing/worker.py             (изменён)
tools/run_episode.sh                   (изменён)
tools/test_codex_sandbox_doctor.py     (новый)
tools/test_delegate_invoke.py          (новый)
tools/test_delegate_worktree.py        (новый)
tools/test_publishing_instagram.py     (изменён)
tools/test_publishing_youtube.py       (изменён)
tools/test_structured_telemetry.py     (новый)
```
Вне репозитория: `/etc/apparmor.d/codex-bwrap` (системный файл, раздел 3).

---

## 5. Commits по направлениям (все — на ветке `feature/telegram-social-publishing`)

**Agent A** (worktree-safety): `de11086` → `94d7601` → `eaa54fc` (codex-сессия), `f4a6c8c` (ручной bootstrap-merge
оркестратором — см. раздел 7 «Известные ограничения»), смержено коммитом `ada484e`.

**Agent D** (instagram-doctor): `1f03c0d` → смержено коммитом `0ecab78`.

**Agent C** (youtube), после одного восстановления после таймаута: `410897a`, `a8463e7`, `df2196f` → смержено
коммитом `4ce278a`.

**Agent B** (control-plane), после ДВУХ восстановлений после таймаута: `631d2dc`, `e77e9c7`, `f01d0d8`, `cf55246`,
`16b6aa9`, `39fbf0c`, `b8bdb88`, `e26d64f` (оркестратор — убрал случайно закоммиченный референсный файл) →
смержено коммитом `f08991f`.

Порядок merge в ROOT: A → D → C → B, каждый — чистый merge без конфликтов (кроме bootstrap-случая A, см. ниже).

---

## 6. Тесты и их результаты (независимый прогон, не пересказ чужих слов)

Прогнано лично оркестратором на актуальном ROOT (не в изолированном worktree), дважды подряд стабильно:

```
python3 -m pytest tools/ -v
296 passed, 5 skipped, 18 subtests passed
```

5 skipped — намеренно: `tools/test_delegate_invoke.py`, `delegation`-fixture пропускает себя строкой `"the isolated
worktree has no delegate base marker"`, когда тест запускается НЕ изнутри реального delegate-worktree (у ROOT
нет файла `.delegate-base` — он появляется только внутри `git worktree`-каталогов, созданных
`delegate_worktree.py open`). Не маскирует проблему: те же 5 тестов лично прогонялись мной ИЗНУТРИ worktree
Agent B во время ревью его работы и все проходили (14/14 вместе с остальными тестами того файла).

Live-проверка sandbox doctor из ROOT прямо перед этим отчётом:
```json
{"error_class": "ok", "smoke_sequential_count": 10, "smoke_parallel_count": 3,
 "smoke_exit_codes": [0,0,0,0,0,0,0,0,0,0,0,0,0]}
```

### Failure-injection (лично, не через отдельную сессию)

1. `PATH=/nonexistent python3 tools/codex_sandbox_doctor.py` → `{"error_class": "codex_not_found", ...}`, exit 1.
   Подтверждено чтением `run_episode.sh`: non-`ok` doctor → `pipeline_log finish --result-class
   infrastructure_failure --error-code codex_sandbox_unavailable`, `exit 78`, до первого delegate/LLM-токена.
2. Попытка вызвать `delegate_invoke.py render` с ролью, не совпадающей с зарегистрированной при `open` (`scriptwriter`
   вместо реально открытой `smoke`) → отказ `policy_violation: "task, role, and lease identity disagree"`, JS не
   сгенерирован. (Это вскрылось случайно при подготовке E2E-теста, а не было спланировано заранее — тем ценнее
   как находка.)
3. YouTube final-chunk-outcome-unknown → status-probe путь: не перепроверялся отдельно вживую сверх уже зелёных
   9 сценариев в `tools/test_publishing_youtube.py` (мокированные сети) — реальных сетевых вызовов к YouTube не
   делал, как и требовалось.

---

## 7. E2E результат (по каждому пункту чеклиста)

Все шаги ниже выполнены лично оркестратором (не отдельной codex-сессией — см. раздел «Известные ограничения»
про причину), после каждого — ROOT возвращён в чистое состояние (`git revert`/`abandon`, без утечки тестовых
файлов в реальную историю).

| Пункт | Результат |
|---|---|
| Sandbox preflight | ✅ `ok` |
| Delegate happy path | ✅ Открыт temp worktree, реальный MCP-делегат (`mcp__codex__codex`) прочитал marker, создал результат-файл с трудным содержимым (backticks, `${...}`, кириллица, `totp-window`), `close --allow` смержил без ложных срабатываний. Смерженный тестовый коммит затем `git revert`, дерево чисто. |
| Negative — path violation | ✅ Делегат (сымитирован вручную в worktree) изменил незаявленный путь; `close` без него в `--allow` вернул `path_violation`, `merged: false`, классифицирован как `policy_violation`, semantic/infrastructure счётчики НЕ увеличены. |
| Negative — concurrency conflict | ✅ **Критическая проверка пройдена**: после открытия worktree тот же путь изменён в ОСНОВНОМ дереве другим содержимым; `close` вернул настоящий `worktree_conflict`, `merged: false` — фикс ложных срабатываний не сломал реальную защиту. |
| Infrastructure retry ≠ semantic attempts | ✅ Подтверждено дважды через `agent_log.py abandon`: `infrastructure_counted: true, semantic_counted: false` для инфраструктурных отказов (неверная роль, истёкшая лиза). |
| Serialization | ✅ `delegate_invoke.py render` с prompt, содержащим backticks/`${...}`/кавычки/слэши/кириллицу/`totp-window` → `node --check` проходит, ни одна подстрока prompt (включая `totp-window`) не попала в сгенерированный JS (`grep -c` = 0). |
| Model override невозможен | ✅ Структурно подтверждено: `delegate_invoke.py render --help`/argparse не содержит `--model`/`--sandbox`/`--cwd` вообще — не «не пробрасывается», а физически отсутствует как параметр. |
| YouTube/Instagram | Не проверялось отдельно живыми сетевыми вызовами (как и требовалось) — покрытие остаётся на уровне mock-тестов направлений C/D, которые перепрогнаны и зелёные. |
| Semantic-attempt-инкремент через полный JS-bridge путь | ⚠️ Не проверено end-to-end (см. ограничения ниже) — проверен только сам `agent_log.py`-слой напрямую. |

---

## 8. Новые state machines

**YouTube target**: `queued → uploading → (processing ⟲ poll) → published` (успех) / `→ reconciliation_required`
(неразрешимая неопределённость: session 404/expired) / `→ youtube_processing_stuck` (SLA превышен, video_id
сохранён, без автосоздания дубликата) / terminal processing failure с сохранённым video_id.

**Worktree change classification** (`delegate_worktree.py`): `add` / `modify` / `delete` / rename → трактуется как
`delete`+`add` / `symlink`, `binary` → неявно поддержаны как `modify`/`add` (побайтовое сравнение без декодирования
текста) / неподдерживаемый тип → явный `worktree_unsupported_change_type`.

**Delegation result** (`agent_log.py`): `success` / `semantic_failure` / `infrastructure_failure` /
`control_plane_failure` / `policy_failure`, с раздельными infrastructure-attempt (bounded budget + circuit
breaker) и semantic-attempt счётчиками.

---

## 9. Новые error codes (по направлениям)

**Sandbox**: `ok`, `codex_not_found`, `vendored_bwrap_not_found`, `bwrap_userns_denied`, `bwrap_rtm_newaddr`,
`bwrap_unknown_failure`.

**Control plane / delegation** (`agent_log.py`/`delegate_invoke.py`): `codex_sandbox_unavailable`,
`mcp_transport_timeout`, `delegate_startup_timeout`, `model_unavailable`, `worktree_missing`,
`worktree_not_visible`, `mcp_invocation_invalid`, `policy_violation`, `role_not_allowed`, `policy_config_invalid`.

**Worktree safety**: `worktree_path_violation`, `worktree_conflict` (сохранены, теперь без ложных срабатываний),
`worktree_unsupported_change_type` (новый).

**YouTube**: `youtube_final_chunk_outcome_unknown` (заменяет вводящее в заблуждение `youtube_final_chunk_timeout`,
старые записи не мигрируются, остаются читаемыми), `youtube_processing_stuck`.

**Instagram**: высокоуровневый `instagram_configuration_invalid` сохранён; конкретные reason-коды:
`instagram_state_directory_unsafe`, `instagram_user_id_missing`, `instagram_user_id_placeholder`,
`instagram_user_id_invalid`, `instagram_api_version_missing`, `instagram_api_version_placeholder`,
`instagram_api_version_invalid`, `instagram_token_path_missing`, `instagram_token_path_placeholder`,
`instagram_token_path_not_absolute`, `instagram_token_file_missing`, `instagram_token_file_unsafe`,
`instagram_token_file_unreadable`, `instagram_token_file_empty`, `instagram_token_file_invalid`,
`instagram_http_timeout_invalid`, `instagram_configuration_check_failed`, `r2_configuration_incomplete`,
`r2_account_id_invalid`, `r2_bucket_invalid`, `r2_ttl_invalid`, `r2_ttl_out_of_range`,
`r2_configuration_check_failed`.

---

## 10. Новые structured events (12, `pipeline_log.py telemetry`)

`delegate_requested`, `worktree_opened`, `delegate_invocation_started`, `mcp_request_started`, `delegate_started`,
`delegate_first_event`, `delegate_last_event`, `delegate_completed`, `delegate_failed`, `worktree_close_started`,
`worktree_closed`, `worktree_abandoned`. Каждое несёт (где применимо): timestamp, run_id, task_id, agent_id, role,
infrastructure/semantic attempt number, worktree_path, base_sha, codex_version, effective_model,
effective_sandbox_policy, phase, duration_ms, result_class, error_code. Prompt целиком не логируется (только путь
к payload-файлу), credentials не логируются.

**Известное ограничение** (зафиксировано Agent B, не мной изобретено): MCP-internal события (реальный момент
старта модели внутри вложенной сессии, первый/последний внутренний tool-call) недоступны из текущего API вызывающей
стороне — логируются только границы, реально видимые снаружи (invocation started/completed), честно помечено
`observability: "caller_boundary"` в самих событиях, а не выдано за более глубокую видимость, чем есть на самом
деле.

---

## 11. Operator action — обязательно, до следующего реального прогона

1. **Instagram/R2**: реальные credentials всё ещё не настроены (`~/.config/shortvideo/publisher.env` держит
   плейсхолдеры `REPLACE_WITH_...`/`/home/USER/...`) — агент НЕ придумывал и не заполнял их сам. `publish.py doctor
   instagram` теперь покажет полный список того, что именно нужно заполнить.
2. **YouTube OAuth**: существующий production refresh-token выдан только под `youtube.upload`. Новый код требует
   `youtube.upload + youtube.readonly` для post-upload processing polling. Нужно выполнить `publish.py
   youtube-authorize` заново ДО следующего реального прогона — иначе `youtube_doctor`/`publish` начнут падать на
   проверке scope.
3. Cron продюсера, по памяти оператора, был сознательно отключён ранее для ручного тестирования — не
   перевключался в рамках этой задачи, решение о повторном включении — за оператором.

---

## 12. Известные ограничения / что не удалось

- **JS-exec V8-sandbox**: подтверждено экспериментально (Agent B), что `exec`-тул codex предоставляет JS-движок
  БЕЗ Node `fs`/`require`/`process`/`performance`-полноты — единственный canonical способ передать prompt делегату
  без интерполяции в JS-текст — через `tools.exec_command` + `cat`, не `readFileSync`, как изначально
  предполагалось в постановке задачи. Bridge адаптирован под этот реальный, не предполагаемый, констрейнт.
- **Инвариант 1 (Этап 3) реализован с честной оговоркой**: сам факт, что оркестратор вообще исполняет JS через
  `exec`-тул для вызова вложенного MCP — платформенное ограничение Codex CLI, не то, что можно устранить из этого
  репозитория. Ключевой инвариант («произвольный LLM-generated prompt не становится частью JS source») выполнен
  строго: единственная переменная часть сгенерированного JS — безопасный файловый путь (без пробелов/спецсимволов,
  формируемый детерминированно), сам текст prompt никогда не проходит через генерацию JS-исходника. Подтверждено
  живым тестом в разделе 7.
- **Semantic-attempt-инкремент через ПОЛНЫЙ путь** (реальный вложенный `exec`-тул исполняет сгенерированный JS,
  который сам вызывает `delegate_invoke.py mark-started`/`result`) — НЕ проверен end-to-end в этом прогоне. Я
  тестировал happy path, вызывая делегата напрямую через `mcp__codex__codex` (минуя сгенерированный JS-сниппет),
  поэтому телеметрийные callback'и из самого сниппета не срабатывали. Сам layer `agent_log.py`
  (infra vs semantic accounting) проверен независимо и корректно. Разрыв между «код написан и юнит-тестами
  покрыт» и «весь путь живьём через реальный вложенный exec-JS» — честно не закрыт.
- **Интеграционный аудит делегировать не получилось**: изначальный план (Этап 11) предполагал отдельную свежую
  codex-сессию для независимого аудита. Три попытки подряд (control-plane, дважды) и одна попытка интеграционного
  аудита упёрлись в 30-минутный MCP idle-timeout без ответа. Проверенная (не окончательно доказанная) гипотеза —
  вложенные/рекурсивные MCP-вызовы (когда уже вызванная через MCP codex-сессия сама пытается вызвать
  `mcp__codex__codex`) особенно склонны зависать; интеграционный аудит просил именно такой вложенный вызов как
  часть E2E-чеклиста. Для трёх из четырёх зависаний (worktree-safety не зависал вовсе; control-plane дважды,
  youtube один раз) реальная работа почти или полностью сохранялась на диске в незакоммиченном виде — потеряна не
  была, я лично проверял и, где нужно, доводил/чинил перед мержем. Интеграционный аудит в итоге выполнен мной
  напрямую (этот отчёт — его результат), без делегирования отдельной сессии.
- **Полное сканирование истории на предмет частоты каждого класса инцидента** (запрошено диагностикой,
  раздел 11 `pipeline-diagnostics.md`) не проводилось повторно в рамках этой задачи — не требовалось для hardening,
  диагностика уже пометила это ограничение явно.

---

## 13. Реальные баги, найденные при аудите (НЕ исправлены мной — только задокументированы)

Не найдено ни одного нового бага в ходе этого прохода. Единственное несоответствие, которое поначалу выглядело
как межнаправленческий конфликт (`delegate_invoke.py` читает `claim.get("base_sha")`, которого
`delegate_worktree.py`'s `delegate-claim` не пишет в реестр), при внимательном чтении оказалось корректно
спроектированным: `_read_base_sha()` приоритетно читает файл `.delegate-base` внутри самого worktree (который
`delegate_worktree.py` действительно создаёт) и использует `claim.get("base_sha")` только как опциональную
дополнительную сверку, а не как обязательный источник. Ложная тревога, задокументирована как таковая, не как
баг.

Единственный найденный за время работы дефект — **исправлен по ходу, не оставлен «на будущее»**:
bootstrap-самоссылка при мерже фикса `delegate_worktree.py` (сам ещё-не-пофикшенный файл ложно определял
конфликт на самом себе через собственный Bug B) — разобрана и устранена вручную оркестратором в момент мержа
(коммит `f4a6c8c`), задокументирована в истории коммитов.

---

*Отчёт подготовлен 2026-09-01. Все 4 направления смержены в `feature/telegram-social-publishing`. AppArmor
изменён на хосте напрямую (не через git). `kernel.apparmor_restrict_unprivileged_userns` не менялся ни разу.*
