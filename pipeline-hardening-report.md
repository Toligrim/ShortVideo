# Интеграционный аудит production-hardening пайплайна ShortVideo

Дата аудита: 2026-09-01. Аудит проведён с чистого взгляда на актуальном ROOT
`/home/toligrim/projects/ShortVideo`, без продолжения предыдущих четырёх
сессий.

Объём: `905fd25df590203c65c5e83d7e18a539c41d4a05..HEAD`, HEAD
`f08991fe6eaa6b8f5bacf064f0013db9e63e22d9`, 19 файлов, 5988 добавлений и
240 удалений. Базовая диагностика прочитана непосредственно из
`pipeline-diagnostics.md` в ROOT. Это только отчёт об аудите и тестах: код
пайплайна в рамках аудита не исправлялся.

## 1. Root causes

| Причина | Что было установлено | Ссылка на диагностику |
|---|---|---|
| Codex sandbox падал на `RTM_NEWADDR` | Профиль AppArmor покрывал npm-путь, но не фактически используемый standalone `bwrap`; отказ был детерминированным | `pipeline-diagnostics.md` §§1.1–1.3, 2–3, 12.1 |
| Ложные `worktree_path_violation`/`worktree_conflict` | `delegate_worktree.py` применял `.strip()` к NUL-разделённому git-выводу и содержимому blob; пустой файл также смешивался с отсутствующим | §§8, 12.2 |
| Неопределённый результат последнего YouTube chunk | Любой `OSError` при финальной отправке трактовался как timeout, без status probe и durable processing state | §§9, 12.3 |
| Instagram configuration error был generic | `live.py` терял конкретную причину при повторном выбросе; оператор не видел, какой credential/configuration пункт сломан | §§10, 12.4 |
| Ручной JS bridge был хрупким | Prompt с backtick ломал JS, а модель могла быть подменена в сгенерированном вызове; инфраструктурный отказ не имел отдельной классификации/счётчика | §§4.3, 5–7, 11, 12.5 |

По межнаправленческой архитектуре существенного конфликта не найдено. `open`
записывает lease, worktree и `.delegate-base`; `delegate_invoke.py` проверяет
именно эти lease/path/base-инварианты и берёт model/sandbox/timeout из
`tools/delegate_policy.json`. Свежий MCP smoke подтвердил, что cwd и marker
соответствуют созданному worktree. YouTube-only путь не требует Instagram/R2
configuration: это подтверждено mock-тестом worker'а и focused-прогоном.

## 2. Какие изменения сделаны по четырём направлениям

### Worktree safety

- Machine-readable git-команды переведены на `git_raw()` и NUL-протокол без
  нормализации; scalar-вывод остаётся в `git()`.
- `changed_paths()` использует `git diff --name-only -z --no-renames` и
  `git ls-files --others --exclude-standard -z`.
- Добавлены `FileState` и явное сравнение `exists`, типа, режима и байтового
  содержимого. Пустой blob теперь отличим от отсутствующего пути.
- Изменения классифицируются как `add`, `modify`, `delete`; rename виден как
  delete+add. Symlink/directory/submodule/прочие неподдержанные типы не
  вливаются и получают явный `worktree_unsupported_change_type`.
- Добавлен regression-набор `tools/test_delegate_worktree.py`.

### Instagram doctor

- `InstagramSettings` и `live.py` проверяют placeholders, user ID, API version,
  внешний owner-only token file, private path и R2 configuration.
- Doctor собирает все независимые причины за один проход и печатает guidance,
  не раскрывая token.
- Сохраняется общий `instagram_configuration_invalid`, а конкретная причина
  доступна через `reason_codes`; cause chain больше не отбрасывается.

### YouTube

- Неизвестный исход финального resumable PUT сначала разрешается status probe;
  повторная отправка байтов происходит только после подтверждения допустимого
  offset.
- Добавлены durable checkpoint-фазы и отдельное `processing`-состояние с
  последующим polling `processingDetails`, SLA и безопасным сохранением
  `video_id` при reconciliation/stuck/failure.
- Transport diagnostics ограничены классом исключения, стадией, elapsed,
  HTTP status и fingerprint; Authorization/session URI в события не попадают.
- OAuth требует ровно `youtube.upload` и `youtube.readonly`.

### Control plane / sandbox / telemetry

- `codex_sandbox_doctor.py` проверяет выбранный через PATH Codex, его
  vendored bwrap и namespace smoke до первого LLM/delegate процесса.
- `run_episode.sh` записывает preflight в manifest и не тратит semantic attempt
  при infrastructure отказе.
- `delegate_invoke.py` стал deterministic bridge: lease, role, path, base SHA,
  policy, timeout и retry circuit проверяются до генерации JavaScript; модель,
  sandbox и cwd не являются caller-controlled аргументами.
- `agent_log.py` разделяет semantic/infrastructure attempts и добавляет
  result classes; `pipeline_log.py` добавляет canonical telemetry events.

## 3. AppArmor change

Изменение сделано оркестратором напрямую на хосте, не делегатом и не в git:

- файл: `/etc/apparmor.d/codex-bwrap`;
- backup: `/etc/apparmor.d/codex-bwrap.bak.20260901T121923Z`;
- добавлен профиль `codex-bwrap-standalone` для
  `/home/toligrim/.codex/packages/standalone/releases/*/codex-resources/bwrap`;
- существующие npm-профили не изменялись;
- `kernel.apparmor_restrict_unprivileged_userns` не менялся.

Текущий standalone bwrap path, разрешённый этим профилем, прошёл
`codex_sandbox_doctor.py`: `error_class=ok`, 10 sequential и 3 parallel smoke
запуска завершились с кодом 0.

## 4. Список изменённых файлов

```text
docs/delegate-invocation-protocol.md
tools/agent_log.py
tools/codex_sandbox_doctor.py
tools/delegate_invoke.py
tools/delegate_policy.json
tools/delegate_worktree.py
tools/pipeline_log.py
tools/publish.py
tools/publishing/adapters/instagram.py
tools/publishing/adapters/live.py
tools/publishing/adapters/youtube.py
tools/publishing/worker.py
tools/run_episode.sh
tools/test_codex_sandbox_doctor.py
tools/test_delegate_invoke.py
tools/test_delegate_worktree.py
tools/test_publishing_instagram.py
tools/test_publishing_youtube.py
tools/test_structured_telemetry.py
```

Вне списка и вне git: `/etc/apparmor.d/codex-bwrap` и его backup.

## 5. Commits по независимым направлениям

Наблюдаемая история диапазона состоит из пяти последовательных commits:

- worktree-safety regression tests: `ada484e8c6317b5a1045586f64799537734906ca`;
- реализация и bootstrap-fix `delegate_worktree.py`:
  `f4a6c8cf49dfa8fdf399bde1685e9b4007e93838`;
- instagram-doctor: `0ecab78293acfc1667d6abfb9b7eef93fed0f0af`;
- youtube: `4ce278a9e55d14ec69cea6cc9a0a205d690501e2`;
- control-plane: `f08991fe6eaa6b8f5bacf064f0013db9e63e22d9`.

## 6. Тесты и результаты независимых прогонов

Полный required suite:

```text
python3 -m pytest tools/ -v
collected 301 items
296 passed, 5 skipped, 18 subtests passed in 39.31s
```

Focused mock-прогон publishing:

```text
python3 -m pytest tools/test_publishing_youtube.py tools/test_publishing_instagram.py -v
66 passed, 11 subtests passed in 11.73s
```

`git diff --check 905fd25df590203c65c5e83d7e18a539c41d4a05..HEAD` также прошёл
без замечаний.

Пять skipped — это ровно следующие тесты из `tools/test_delegate_invoke.py`:

- `test_explicit_run_id_honors_isolated_run_dir`;
- `test_prompt_serialization_survives_node_check_and_runtime`;
- `test_startup_control_failure_is_classified_before_close`;
- `test_model_sandbox_and_cwd_are_not_bridge_arguments`;
- `test_policy_and_worktree_refusals_emit_no_javascript`.

Причина у всех одинаковая: fixture требует `.delegate-base` и пропускает тест,
если pytest запущен из ROOT, который не является delegate worktree. Это
environment-gated coverage, а не зелёная маскировка: те же 9 тестов (4 обычных
и эти 5) независимо запущены из реально созданного delegate worktree — `9
passed in 0.89s`.

Безопасные локальные doctor-прогоны:

- `python3 tools/codex_sandbox_doctor.py` — JSON `error_class=ok`, exit 0.
- `PATH=/nonexistent /usr/bin/python3 tools/codex_sandbox_doctor.py` —
  `error_class=codex_not_found`, exit 1.
- `python3 tools/publish.py doctor instagram` — ожидаемый fail-closed результат
  `instagram_configuration_invalid` с причинами `instagram_user_id_missing`,
  `instagram_api_version_missing`, `instagram_token_path_missing`,
  `r2_configuration_incomplete`.
- `python3 tools/publish.py doctor youtube` — локальная ошибка
  `SHORTVIDEO_YOUTUBE_CLIENT_ID is required`; сетевой вызов не выполнялся.

## 7. Failure-injection и E2E результат

### Failure-injection

1. Вызов sandbox doctor с `PATH=/nonexistent` корректно классифицирован как
   `codex_not_found`. В изолированной копии `run_episode.sh` с тем же отсутствием
   Codex завершился с exit 78; manifest получил
   `status=failed`, `result_class=infrastructure_failure`,
   `error_code=codex_sandbox_unavailable`. До запуска CLI/delegate процесса
   управление не дошло.
2. Для открытой через `delegate_worktree.py open` lease вручную выставлен
   `expires_at=0`. `delegate_invoke.py render` вернул exit 22, stdout был пуст,
   stderr содержал JSON с `result_class=infrastructure_failure` и
   `error_code=delegate_startup_timeout`; JavaScript не был сгенерирован.
3. Для YouTube использован отдельный fake `HttpTransport`: token POST, session
   initiation POST, финальный PUT выбросил `ConnectionResetError`, status probe
   вернул mock 403. Получено `youtube_final_chunk_outcome_unknown`, исходный
   session URI сохранился; фактического запроса к YouTube не было. Наблюдались
   методы `POST, POST, PUT, PUT`, а последний range был `bytes */262144`.

Дополнительные инъекции:

- Через `delegate_invoke.py result` записан классифицированный
  `infrastructure_failure`/`mcp_transport_timeout`: результат показал
  `infrastructure_attempt=1`, `semantic_attempt=0`; после release — один
  infrastructure attempt и ноль semantic attempts.
- Prompt с `` `totp-window` ``, `${foo}`, кавычками и `\slashes\` прошёл
  `delegate_invoke.py render`; сгенерированный файл прошёл
  `~/.local/bin/node --check`. В mock runtime подтверждены
  `runtime_prompt_roundtrip=True`, правильный cwd, policy model
  `gpt-5.6-luna` и sandbox `workspace-write`; в JS используется `cat`, а не
  `readFileSync`.
- `delegate_invoke.py render --model gpt-5.2-codex` отвергнут argparse с exit 2
  (`unrecognized arguments`); произвольный model override через этот CLI
  физически недоступен.

### E2E checklist

| Пункт | Результат |
|---|---|
| Sandbox | **Пройден**: doctor на текущей машине вернул `ok`. |
| Delegate happy path | **Пройден**: создан свежий worktree с `--role smoke`; свежий `mcp__codex__codex` получил именно его cwd, прочитал `.delegate-base`, изменил ровно разрешённый `tools/test_delegate_worktree.py`; `close --allow ... --no-commit` перенёс изменение без ложных path/conflict отказов. ROOT-файл затем восстановлен byte-for-byte и не попал в историю. |
| Path violation | **Пройден**: вручную изменён `tools/delegate_invoke.py`, разрешён был только другой путь; `close` вернул exit 6, `reason=path_violation`, `merged=false`, root не изменился. |
| Concurrency conflict | **Пройден**: после открытия worktree в ROOT создан `tools/_integration_audit_scratch.txt` с `root-side`, а в worktree — тот же путь с `worktree-side`; `close` вернул exit 2 и настоящий `conflicts=[...]`, root-side остался, merge не состоялся. Проверено, что untracked main-side поддерживается. |
| Infrastructure retry | **Пройден**: infrastructure counter вырос, semantic counter остался нулём. |
| Serialization | **Пройден** на render + `node --check` + mock runtime; точный prompt round-trip подтверждён. |
| Model override | **Пройден negative test**: `--model` не принимается parser'ом и не может попасть в bridge. |
| YouTube/Instagram real publish | **Намеренно не выполнялся**: нет реального видео, credentials или сетевого вызова; оба mock-набора выше зелёные, YouTube status path дополнительно проверен отдельным fake transport. |

После E2E все созданные мной worktree с именами `integration-audit-*` удалены
точечно и проверены через `git worktree list`; pre-existing worktree других
прогонов не трогались. При этом smoke выявил ограничение cleanup, описанное в
разделах 12 и 13: штатный `close` сообщил `worktree_removed=false` из-за
служебного marker-файла, поэтому созданный мной каталог пришлось удалить
отдельной точечной `git worktree remove --force` cleanup-операцией.

## 8. Новые state machines

### YouTube processing

Общий путь: `queued → uploading → processing → published`. Resumable checkpoint
имеет фазы `session_recorded`, `uploading`, `resuming`,
`final_chunk_inflight`. Для финального chunk сначала существует неопределённый
outcome, затем status probe приводит к одному из безопасных путей: confirmed
completion, дозагрузка подтверждённого tail, retryable probe/upload failure или
reconciliation.

В `processingDetails.processingStatus` явно обрабатываются `processing`,
`succeeded`, `failed`, `terminated` и unknown. `processing` возвращает работу в
outbox на следующий poll; SLA превышает границу `youtube_processing_stuck` и
не запускает новый upload. `video_id` и известная provider-side ambiguity
сохраняются для operator reconciliation.

### Worktree change classification

Для каждого touched path сравниваются BASE, delegate и main как
`FileState(exists, content, kind, mode)`. Поддержаны `add`, `modify`, `delete`;
rename намеренно раскладывается в delete+add. Regular binary/text files идут
по одинаковому byte-for-byte пути. Symlink, directory, submodule, `other` и
аномальный `unknown` останавливают close с
`worktree_unsupported_change_type`.

### Delegation outcome

`success`, `semantic_failure`, `infrastructure_failure`,
`control_plane_failure`, `policy_failure` — разные result classes. Semantic и
infrastructure attempts считаются отдельно; для infrastructure действует
bounded budget и circuit breaker.

## 9. Новые error codes

Ниже полный vocabulary hardening-пути в актуальном коде. `ok` — это успешный
`codex_sandbox_doctor` error class, не error code.

**Sandbox error classes:** `codex_not_found`, `vendored_bwrap_not_found`,
`bwrap_userns_denied`, `bwrap_rtm_newaddr`, `bwrap_unknown_failure`.

**Control plane / delegation:** `codex_sandbox_unavailable`,
`mcp_transport_timeout`, `delegate_startup_timeout`, `model_unavailable`,
`worktree_missing`, `worktree_not_visible`,
`infrastructure_budget_exhausted`, `mcp_invocation_invalid`,
`role_not_allowed`, `policy_config_invalid`, `policy_violation`,
`worktree_path_violation`, `worktree_conflict`, `task_already_claimed`,
`worktree_unsupported_change_type`.

**Worker/shared publishing:** `immutable_snapshot_invalid`,
`unexpected_adapter_outcome`, `retry_attempts_exhausted`,
`invalid_resumable_checkpoint`, `invalid_instagram_checkpoint`,
`invalid_adapter_result`, `live_adapter_unavailable`, `publish_cancelled`,
`lease_expired_after_publish_started`, `resumable_session_resume_unavailable`.

**Instagram doctor/R2:** `instagram_configuration_invalid`,
`instagram_state_directory_unsafe`, `instagram_user_id_missing`,
`instagram_user_id_placeholder`, `instagram_user_id_invalid`,
`instagram_api_version_missing`, `instagram_api_version_placeholder`,
`instagram_api_version_invalid`, `instagram_token_path_missing`,
`instagram_token_path_placeholder`, `instagram_token_path_not_absolute`,
`instagram_token_file_missing`, `instagram_token_file_unsafe`,
`instagram_token_file_unreadable`, `instagram_token_file_empty`,
`instagram_token_file_invalid`, `instagram_http_timeout_invalid`,
`instagram_configuration_check_failed`, `r2_configuration_incomplete`,
`r2_account_id_invalid`, `r2_bucket_invalid`, `r2_ttl_invalid`,
`r2_ttl_out_of_range`, `r2_configuration_check_failed`.

**Instagram provider:** `instagram_platform_mismatch`,
`instagram_container_reconciliation_required`,
`instagram_publish_reconciliation_required`, `instagram_r2_configuration`,
`instagram_r2_asset_invalid`, `instagram_r2_unavailable`,
`instagram_url_expired`, `instagram_container_ambiguous`,
`instagram_container_rejected`, `instagram_status_unavailable`,
`instagram_status_rejected`, `instagram_status_ambiguous`,
`instagram_processing`, `instagram_container_failed`,
`instagram_publish_ambiguous`, `instagram_metadata_invalid`,
`instagram_asset_unreadable`, `instagram_empty_asset`,
`instagram_lease_too_short`, `instagram_checkpoint_invalid`,
`instagram_lease_lost`, `instagram_lease_unknown`,
`instagram_lease_lost_during_request`, `instagram_checkpoint_not_durable`,
`instagram_cleanup_required`.

**YouTube provider and processing:** `youtube_asset_changed`,
`youtube_asset_unreadable`, `youtube_authorization_required`,
`youtube_completion_unknown`, `youtube_configuration_invalid`,
`youtube_early_success_response`, `youtube_empty_asset`,
`youtube_final_chunk_outcome_unknown`, `youtube_final_chunk_session_expired`,
`youtube_initiation_ambiguous`, `youtube_initiation_rejected`,
`youtube_invalid_resume_range`, `youtube_lease_lost`,
`youtube_lease_lost_during_request`, `youtube_lease_too_short`,
`youtube_lease_unknown`, `youtube_malformed_success_response`,
`youtube_metadata_invalid`, `youtube_metadata_missing`,
`youtube_oauth_malformed_response`, `youtube_oauth_unavailable`,
`youtube_platform_mismatch`, `youtube_privacy_status_mismatch`,
`youtube_processing_configuration_invalid`, `youtube_processing_failed`,
`youtube_processing_invariant_violation`,
`youtube_processing_poll_unavailable`, `youtube_processing_pending`,
`youtube_processing_reference_conflict`,
`youtube_processing_reference_invalid`, `youtube_processing_result_invalid`,
`youtube_processing_session_conflict`, `youtube_processing_state_unknown`,
`youtube_processing_status_unknown`, `youtube_processing_stuck`,
`youtube_processing_terminated`, `youtube_processing_unauthorized`,
`youtube_processing_video_not_found`, `youtube_progress_not_durable`,
`youtube_rate_limited`, `youtube_resume_checkpoint_invalid`,
`youtube_resume_probe_unavailable`, `youtube_resume_stalled`,
`youtube_retry_after`, `youtube_scope_not_granted`,
`youtube_server_unavailable`, `youtube_session_not_durable`,
`youtube_session_not_found`, `youtube_unauthorized`,
`youtube_unexpected_response`, `youtube_upload_rejected`,
`youtube_upload_unavailable`.

`youtube_final_chunk_outcome_unknown` и
`youtube_final_chunk_session_expired` — актуальные имена для новых final-chunk
outcomes. Старые persisted значения вроде
`youtube_final_chunk_timeout`, `youtube_final_chunk_probe_unconfirmed` и
`youtube_session_missing_after_final_chunk` автоматически не мигрируются.

## 10. Новые structured events

Ровно 12 canonical delegate telemetry events:

`delegate_requested`, `worktree_opened`, `delegate_invocation_started`,
`mcp_request_started`, `delegate_started`, `delegate_first_event`,
`delegate_last_event`, `delegate_completed`, `delegate_failed`,
`worktree_close_started`, `worktree_closed`, `worktree_abandoned`.

У событий единый набор structured fields (часть полей закономерно `null` на
ранней/поздней границе): `timestamp`, `run_id`, `task_id`, `agent_id`, `role`,
`infrastructure_attempt`, `semantic_attempt`, `worktree_path`, `base_sha`,
`codex_version`, `effective_model`, `effective_sandbox_policy`, `phase`,
`duration_ms`, `result_class`, `error_code`, `timeout_seconds`,
`observability`, `prompt_path`.

Старые lifecycle names поддерживаются aliases: `worktree_open` →
`worktree_opened`, `worktree_close` → `worktree_closed`, `worktree_abandon` →
`worktree_abandoned`. Отдельный temporary telemetry прогон подтвердил 12
имён и отсутствие missing structured fields. Provider event
`youtube_transport_error` не является одним из этих 12 delegate events.

## 11. Что осталось как operator action

1. **Instagram/R2 credentials нужно настроить вручную оператору.** Реальные
   Instagram access token, Professional account user ID, Meta API version и
   R2 account/bucket/access/secret значения по-прежнему не настроены; аудит их
   не придумывал и не записывал.
2. **YouTube OAuth-токен нужно переавторизовать** командой
   `publish.py youtube-authorize` до следующего реального publish. Требуемый
   scope теперь ровно `youtube.upload + youtube.readonly`; старый токен только
   под upload не пройдёт проверку.
3. До production-использования нужно отдельно разобрать найденные lifecycle
   дефекты из раздела 13, прежде всего expired-lease heartbeat и cleanup
   worktree.

## 12. Известные ограничения / что не удалось

- JS-exec runtime — V8 sandbox без доступных Node `fs`/`require` (и без
  полноценного Node runtime). Поэтому prompt нельзя безопасно читать через
  `fs.readFileSync`; bridge читает его через
  `tools.exec_command` + `cat -- <validated-path>`. Prompt не встраивается в
  JS source.
- Вживую через свежий `mcp__codex__codex` проверен delegate happy path. Для
  serialization дополнительно проверены render, `node --check` и mock runtime
  с точным round-trip prompt; полный запуск именно сгенерированного snippet
  внутри внешнего `functions.exec` не выполнялся, чтобы не создавать новые
  записи в dirty ROOT и не запускать лишнюю реальную LLM-сессию. Это честный
  пробел между bridge unit/mock проверкой и полным generated-JS E2E.
- Полный suite из ROOT оставляет 5 environment-gated skips, потому что ROOT
  не имеет `.delegate-base`; все 9 bridge tests отдельно прошли из настоящего
  delegate worktree.
- Реальные YouTube/Instagram publish не выполнялись: в текущем окружении
  `doctor instagram` сообщает отсутствие локальной конфигурации, а
  `doctor youtube` — отсутствие client ID. Никакие реальные credentials,
  видео или provider network endpoints не использовались.
- AppArmor является host-side состоянием, не частью git commit. Его наличие
  проверено текущим doctor, но откат/дальнейшее управление профилем остаётся
  операторской задачей.
- Во время одного промежуточного cleanup fixture аудиторский скрипт ошибочно
  попытался удалить `root.parent` для temporary root, то есть `/tmp`; операция
  немедленно остановилась на `PermissionError` внутри systemd-private каталога.
  После этого temporary root и каждый собственный integration worktree были
  удалены точными путями; финальные проверки не нашли собственных
  `integration-audit-*` worktree и не показали изменений production-файлов.

## 13. Реальные баги, найденные при аудите (не исправлены)

### 13.1. Codex preflight блокирует документированный `--runner claude`

- **Файл/место:** `tools/run_episode.sh:130–158`.
- **Симптом:** новый unconditional Codex doctor запускается после `run-start`
  для обоих допустимых runner values. При `--runner claude` ветка запуска
  Claude находится ниже, но до неё управление не доходит, если Codex
  отсутствует/сломана его sandbox.
- **Воспроизведение:** в изолированной копии скрипта с PATH без `codex`
  запустить `run_episode.sh --runner claude ...`; результат: exit 78,
  manifest `infrastructure_failure/codex_sandbox_unavailable`, runner process
  не запускается. `--runner claude` остаётся документированным контрактом в
  `docs/observability-and-analytics-plan.md`.
- **Серьёзность:** средняя — полностью блокирует альтернативный
  documented runner, хотя codex production path от этого не страдает.
- **Статус:** это регрессия из audited control-plane commit; не исправлялась.

### 13.2. `.delegate-base` делает штатное удаление worktree невозможным

- **Файл/место:** `tools/delegate_worktree.py:397`, `503–516`.
- **Симптом:** `close` исключает `.delegate-base` из allowlist, но не удаляет
  сам marker перед `git worktree remove`. Git считает его untracked и
  отказывается удалять каталог без `--force`; функция возвращает
  `worktree_removed=false`, а `gc` оставляет каталог.
- **Воспроизведение:** открыть worktree, изменить один разрешённый файл и
  выполнить `close --allow <file> --no-commit`; наблюдается `merged=true` при
  `worktree_removed=false`, после чего `git worktree remove <path>` сообщает
  `contains modified or untracked files` из-за `.delegate-base`.
- **Серьёзность:** средняя — результат можно влить, но stale worktree
  накапливаются и автоматическая уборка не выполняет обещанный lifecycle.
- **Статус:** defect существовал до audited range (blame указывает на
  pre-existing worktree implementation); E2E потребовал безопасного
  точечного force cleanup. Не исправлялся.

### 13.3. `open` не откатывает lease при ошибке `git worktree add`

- **Файл/место:** `tools/delegate_worktree.py:349–365`.
- **Симптом:** claim записывается до физического создания worktree; исключение
  из `git worktree add` выходит traceback'ом, но claim остаётся `state=running`.
- **Воспроизведение:** заранее создать обычный blocking file по ожидаемому
  worktree path и выполнить `open` с этим `agent_id`: `open_rc=1`, git сообщает
  path already exists, в `delegations.json` остаётся running claim.
- **Серьёзность:** средняя — задача блокируется до истечения lease, а журнал
  ложно показывает живого делегата.
- **Статус:** pre-existing до audited range; не исправлялся.

### 13.4. Heartbeat может воскресить истёкшую lease

- **Файл/место:** `tools/agent_log.py:436–456`.
- **Симптом:** `delegate-heartbeat` не проверяет terminal state или
  `expires_at`; любой обладатель старого `agent_id` может продлить уже
  истёкшую lease.
- **Воспроизведение:** вручную выставить claim `expires_at=0`, затем вызвать
  `agent_log.py delegate-heartbeat --agent-id ...`: rc 0, state остаётся
  `running`, новый expiry оказывается в будущем.
- **Серьёзность:** высокая для safety boundary — stale actor может
  продолжить считаться владельцем задачи.
- **Статус:** pre-existing, не регрессия этого диапазона; не исправлялся.

### 13.5. Повреждённый registry silently заменяется пустым

- **Файл/место:** `tools/agent_log.py:238–245`, `Registry._read()`.
- **Симптом:** malformed JSON/ошибка чтения превращается в пустой registry, а
  следующий mutating command сохраняет его поверх исходного файла. Активные
  claims теряются без отказа.
- **Воспроизведение:** записать в изолированный `delegations.json`
  `BROKEN_SENTINEL`, затем выполнить `delegate-claim`: rc 0, sentinel исчезает,
  появляется новый JSON только с новым claim.
- **Серьёзность:** высокая для auditability и duplicate-work protection;
  потенциально теряется safety state.
- **Статус:** pre-existing, не регрессия этого диапазона; не исправлялся.

Других подтверждённых межнаправленческих багов в YouTube/Instagram mock-пути,
lease-aware worker или bridge serialization сверх перечисленного не найдено.
