# Гарантированная очистка процессов прогона ShortVideo — дизайн

> Исследование и дизайн выполнены агентом Opus 5, 27 августа 2026, по задаче:
> продумать, как гарантировать, что весь дочерний процесс-хвост одного прогона
> пайплайна (сценарий → озвучка → рендер → QC → отправка) — включая chrome-headless-shell,
> его потомков и любые фоновые `remotion still/render` — гарантированно закрывается
> сразу по завершении прогона (успех/ошибка/таймаут), а не подметается перед стартом
> следующего. Реализация ещё не выполнена — это план на будущее.
>
> Найденный повод: два осиротевших процесса `node .../remotion still`
> (PPID=1, живут с 25.08.2026 — один от кронового прогона, другой от ручного запуска
> из tmux), ~291 МБ RAM впустую, никем не отслеживаемые.

## 0. Главное, что изменило картину по сравнению с исходной гипотезой

Три факта, проверенные вживую, переворачивают предложенный в задаче план «PGID + trap»:

**(а) GNU `timeout` УЖЕ убивает группу процессов, а не только прямого потомка.** Coreutils `timeout` делает `setpgid(0,0)` и шлёт сигнал всей своей группе. Проверено:
```
timeout 2 bash -c 'setsid sleep 555 & bash -c "sleep 556" & sleep 60'  → rc=124
# sleep 556 (обычный внук)  → УБИТ
# sleep 555 (через setsid)  → ВЫЖИЛ
```
То есть текущая формулировка проблемы («timeout сигналит только непосредственного потомка») неточна. Реальные дыры другие — см. §1.

**(б) Chrome принципиально не ловится по PGID/SID.** `video/node_modules/@remotion/renderer/dist/browser/BrowserRunner.js:83-88`:
```js
detached: process.platform !== 'win32',
```
Node `detached:true` = `setsid()`. Chrome-headless-shell всегда становится лидером собственной сессии и группы. Любой `kill -TERM -$PGID` прогона его **гарантированно не достанет**. PGID как единственный механизм провален по построению.

**(в) Зато в remotion 4.0.491 уже есть штатная защита от осиротения chrome.** `dist/linux/wrap-with-setpriv.js` оборачивает браузер в `setpriv --pdeathsig SIGKILL` (комментарий прямо ссылается на remotion issue #7207), `/usr/bin/setpriv` на машине есть. Плюс BrowserRunner вешает обработчики `exit/SIGINT/SIGTERM/SIGHUP` → `process.kill(-chromePid, SIGKILL)`. Поэтому **chrome — не главная утечка**: подтверждено тем, что у обоих найденных сирот chrome уже нет, остались только node и compositor.

Вывод: изобретать надо не «убийцу chrome», а **контейнер, из которого не может уйти ничто** — и это cgroup, а не process group.

---

## 1. Фактическое дерево процессов одного прогона

Два входных пути, оба подтверждены cgroup-ами живых сирот:

```
[cron-путь]  cron.service (cgroup /system.slice/cron.service — ОБЩИЙ для всех крон-джобов машины)
 └─ tools/producer_cron.sh          (правит PATH, LC_ALL, SHORTVIDEO_PUBLISH_STATE_DIR)
     └─ exec python3 tools/producer_scheduler.py    (тот же PID)
         └─ subprocess.run(bash tools/run_episode.sh …)   ← синхронно, без своего timeout/PG
             ├─ flock runs/.lock (fd 9, держится весь прогон)
             ├─ python3 tools/pipeline_log.py run-start / snapshot   (короткоживущие)
             └─ timeout 180m                       ← своя новая PGID
                 └─ codex exec … (или claude -p …)
                     ├─ codex mcp-server / codex-code-mode-host      (долгоживущие хелперы)
                     └─ bash (Bash-tool, по одному на команду)
                         ├─ venv/bin/python tools/tts_scenes.py
                         │    ├─ faster-whisper (ct2, OpenMP-потоки ВНУТРИ процесса, не отдельные PID)
                         │    └─ ffmpeg  (tts_scenes.py:118, синхронно, на сцену)
                         ├─ node video/node_modules/.bin/remotion still|render   ← ГЛАВНЫЙ ИСТОЧНИК СИРОТ
                         │    ├─ @remotion/compositor-linux-arm64-gnu   (та же PGID)
                         │    └─ headless_shell  ⟵ setsid, СОБСТВЕННЫЕ PGID и SID
                         │         ├─ --type=zygote ×2
                         │         ├─ --type=gpu-process
                         │         ├─ --type=utility (network.mojom.NetworkService)
                         │         └─ --type=renderer
                         └─ node video/scripts/check-overlaps.cjs      ← свой openBrowser() → ещё один chrome

[ручной путь]  tmux-home.service (cgroup /system.slice/tmux-home.service) → та же ветка ниже codex/claude
```

Живые сироты на момент исследования (27.08.2026):

| PID | что | PPID | PGID/SID | cgroup | возраст | RSS |
|---|---|---|---|---|---|---|
| 1696013 | `node …/.bin/remotion still --help` | 1 | 1695998/1695998 | `/system.slice/**cron.service**` | 2д 11ч | 143 МБ |
| 1751749 | `node …/.bin/remotion still Episode …/qc-2-a.png --frame=816` | 1 | 1751728/1750547 | `/system.slice/**tmux-home.service**` | 2д 08ч | 142 МБ |
| 1752111 | `@remotion/compositor-linux-arm64-gnu` (ребёнок 1751749) | 1751749 | 1751728 | то же | 2д 08ч | 5,8 МБ |

Итого ~291 МБ RAM. Обе сироты — **node-процессы CLI**, chrome при них уже нет (pdeathsig отработал). Один пришёл из крона, второй — из ручной tmux-сессии: покрывать надо оба пути.

### Реальные дыры (а не те, что предполагались)

1. **`timeout` срабатывает только по таймауту.** При нормальном (или ошибочном) выходе `codex`/`claude` группу никто не сигналит. А `.claude/skills/produce/SKILL.md:36` и `.claude/skills/animator/SKILL.md:38` прямым текстом велят агенту: **«Рендер (фон)»**. Агент запускает `remotion render &` и выходит — и `timeout` тут бессилен по определению. Это и есть фабрика тех сирот.
2. **Нет `trap` в `run_episode.sh` вообще.** `set -e`-падение, любой сигнал, смерть планировщика — всё оставляет дерево жить.
3. **Нет `--kill-after`** у `timeout`: зависший на I/O процесс проигнорирует SIGTERM и переживёт таймаут-путь.
4. **`subprocess.run()` в `producer_scheduler.py:420` без `timeout=`** — планировщик может залипнуть навсегда, держа `tick.lock`.
5. **SIGKILL по `run_episode.sh`** (OOM-killer на Pi, делящем 15 ГБ с десятком проектов) обходит любой `trap` по построению.
6. **Всё, что делает `setsid`** (chrome; завтра — что угодно ещё), из PGID уходит навсегда.

---

## 2. Механизм: транзиентный systemd-юнит (cgroup), а не process group

### Почему cgroup

cgroup v2 (`stat -fc %T /sys/fs/cgroup` → `cgroup2fs`) — единственная граница, которую **не пробивают** `setsid`, `setpgid`, `fork`, `exec`, перепривязка к PID 1 и переименование процесса. Процесс не может уйти из своей cgroup без явной записи в чужой `cgroup.procs`.

Всё для этого на машине уже есть и проверено:
- `user@1000.service` жив, `loginctl show-user toligrim -p Linger` → **`Linger=yes`** (значит user-manager переживает выход из сессий и доступен из крона);
- systemd 255.4;
- `systemd-run --user` работает — **но только если задать окружение**, которого у крона нет:
  ```
  без переменных: Failed to connect to bus: No medium found
  с XDG_RUNTIME_DIR=/run/user/1000 и DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus: работает
  ```

### Что проверено экспериментально (это и есть доказательство дизайна)

```bash
# 1. Реап setsid-внука при выходе main-процесса
systemd-run --user --collect --unit=sv-leak-test2 -p KillMode=control-group -p TimeoutStopSec=5 \
  bash -c "setsid sleep 777 & sleep 1; echo done"
→ через 4 с: "NONE — systemd reaped the setsid grandchild"

# 2. RuntimeMaxSec убивает всю cgroup, включая detached-ребёнка
systemd-run --user --collect --unit=sv-timeout-test -p RuntimeMaxSec=4 -p TimeoutStopSec=3 \
  bash -c "setsid sleep 888 & exec sleep 999"
→ "NONE — RuntimeMaxSec killed whole cgroup incl. detached child"

# 3. Прозрачность для кода вызывающего
systemd-run --user --collect --wait --pipe --unit=sv-rc-test bash -c 'echo OUT; echo ERR>&2; exit 7'
→ rc=7, stdout="OUT", stderr="ERR"   (потоки разделены, код выхода сохранён)

# 4. Но: таймаут по RuntimeMaxSec даёт rc=1, а НЕ 124
systemd-run --user --collect --wait --pipe -p RuntimeMaxSec=2 sleep 60 → rc=1
```

Пункт 4 — причина оставить внутренний GNU `timeout`: он сохраняет привычный `exit 124`, который читают логи и `pipeline_log.py finish --exit-code`.

### Конструкция

**Уровень 1 — cgroup-контейнер (жёсткая гарантия, работает даже при SIGKILL по скрипту).**
`run_episode.sh` в самом начале перезапускает сам себя внутрь транзиентного **user-сервиса** (не scope — scope не сносится сам, пока его cgroup не опустеет, что при утечке значит «никогда»):

```
exec systemd-run --user --quiet --collect --wait --pipe \
  --unit="sv-run-${SLUG}-$(date +%s)" \
  -p Description="ShortVideo run ${SLUG}" \
  -p KillMode=control-group \        # снести ВСЁ в cgroup при остановке юнита
  -p TimeoutStopSec=30s \            # SIGTERM → 30 с → SIGKILL
  -p RuntimeMaxSec=$((TIMEOUT_MIN*60+300)) \   # аварийный потолок ВЫШЕ внутреннего timeout
  -p WorkingDirectory="$ROOT" \
  -p MemoryMax=6G \                  # см. ниже, отдельная выгода
  --setenv=SV_RUN_SCOPE=1 --setenv=... \
  -- bash "$0" "$@"
```

Ключевая семантика: у сервиса при выходе главного процесса systemd **сам** шлёт SIGTERM всей оставшейся cgroup и через `TimeoutStopSec` добивает SIGKILL. Это происходит **в момент окончания прогона**, любым исходом — успех, ошибка, `RuntimeMaxSec`, OOM-kill главного процесса, `systemctl stop`. Никакого «подметания перед следующим прогоном». Требование выполняется механизмом ядра+systemd, а не доброй волей trap-а.

**Уровень 2 — trap внутри (быстрая очистка + деградационный режим).** Даже с systemd полезно убить группу самому: очистка наступает на секунды раньше, а если systemd-шина недоступна (`--user` не поднялся, юзер-менеджер перезапускается), это единственная защита.

```
RUN_PGID=$(ps -o pgid= -p $$ | tr -d ' ')
trap 'sv_cleanup' EXIT INT TERM HUP
sv_cleanup() {
  [[ -n ${SV_CLEANED:-} ]] && return; SV_CLEANED=1
  <снять отчёт: перечислить cgroup.procs / членов PGID, записать в pipeline_log>
  trap '' TERM                # ← ОБЯЗАТЕЛЬНО: иначе шелл убьёт сам себя своим же broadcast
  kill -TERM -"$RUN_PGID" 2>/dev/null || true
  <ожидание опустошения cgroup до 15 с, пуллинг cgroup.procs>
  kill -KILL -"$RUN_PGID" 2>/dev/null || true
}
```
Подводный камень, который нужно заложить сразу: `kill -TERM -$PGID` бьёт и по самому шеллу — поэтому непосредственно перед рассылкой ставится `trap '' TERM`. Второй камень: `SV_CLEANED`-идемпотентность, иначе `trap ... EXIT` + `trap ... TERM` отработают дважды.

**Уровень 3 — сохранить и усилить `timeout`.** Заменить
`timeout "${TIMEOUT_MIN}m"` → `timeout --kill-after=60s "${TIMEOUT_MIN}m"`.
Оставить именно GNU timeout (а не только `RuntimeMaxSec`) ради `exit 124`; `RuntimeMaxSec` ставится на 5 минут выше и играет роль страховки на случай, если сам `timeout` окажется зомби.

**Побочная, но существенная выгода `MemoryMax=`.** Сейчас, когда прогон (chrome + faster-whisper + node) распухает, OOM-killer ядра выбирает жертву глобально и **может убить чужой проект**. `MemoryMax=` на cgroup прогона превращает это в локальный OOM внутри юнита: systemd остановит юнит → cgroup-kill → соседи не пострадают. На машине с десятком co-tenant проектов это, возможно, даже более ценно, чем сама очистка.

### Где именно ставить обёртку — в `run_episode.sh`, не в `producer_scheduler.py`

Обоснование: сироту №2 (1751749) породил **не крон**, а ручная tmux-сессия. Обёртка в планировщике покрыла бы только один из двух наблюдаемых путей. `run_episode.sh` — единая точка входа для обоих, и самозаворачивание там автоматически защищает и ручные запуски.

Точное место: **сразу после `ROOT=…; cd "$ROOT"` и парсинга аргументов, но СТРОГО ДО `exec 9>runs/.lock; flock -n 9`.** Причина: файловые дескрипторы наследуются через `exec`, и если flock взять раньше, блокировку унаследует клиент `systemd-run`, а не процесс внутри юнита — семантика «замок держится, пока идёт прогон» поедет. При правильном порядке `runs/.lock` берётся уже внутри юнита, и это даёт бесплатный бонус: даже если клиент `systemd-run` убьют, второй прогон всё равно не стартует, потому что замок держит живой процесс внутри юнита.

### Главная ловушка реализации: окружение транзиентного юнита

Транзиентный сервис **не наследует** окружение вызывающего (в отличие от scope). Нужно явно пробросить whitelist через повторяемый `--setenv=VAR=VAL`: `PATH`, `HOME`, `USER`, `LANG`, `LC_ALL`, `SHORTVIDEO_PUBLISH_STATE_DIR`, `XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`, плюс все `SV_*`. Критичен `HOME` — из него `codex` и `claude` берут `~/.codex`, `~/.claude`, а `tools/tts_scenes.py` и `publish.py` читают `.env` из репозитория (это уже относительно `ROOT`, поэтому важен `WorkingDirectory=`). Проверять это надо не «на глаз», а прогоном фейкового раннера, печатающего `env` (см. §6).

---

## 3. Как отличить «свои» процессы от чужих

Ранжирование по надёжности, с обоснованием отказа от альтернатив.

**1. cgroup — рекомендуемый (единственный достаточный).**
Признак: `/proc/<pid>/cgroup` оканчивается на `sv-run-<slug>-<ts>.service`. Не подделывается, не теряется при `setsid`/`setpgid`/reparent/exec/переименовании. Перечисление — тривиальное чтение файла:
```
/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice/sv-run-*.service/cgroup.procs
```
Дополнительная страховка от промаха: сторож обязан требовать префикс имени `sv-run-` — он физически не может тронуть cgroup, которую этот пайплайн не создавал.

**2. PGID — годится как быстрый первый проход в trap, но не как основа.**
Два дефекта: (а) доказано, что chrome через `setsid` вне группы — то есть механизм заведомо неполон; (б) PGID = PID лидера, а PID переиспользуются ядром — на долгоживущем Pi несвежий PGID может совпасть с посторонней группой. Внутри trap-а он безопасен (группа заведомо живая и своя), как основа очистки — нет.

**3. PID/PGID-файлы прогона — отвергнуть.**
Не дают ничего сверх PGID, но добавляют: устаревание после краха (файл есть, процесса нет), невозможность валидации из-за переиспользования PID (нужна сверка `starttime` из `/proc/<pid>/stat`, то есть ручная реализация того, что cgroup даёт бесплатно), и ручную синхронизацию записи/удаления. Строго хуже cgroup по всем осям.

**4. Совпадение по имени/cmdline (`pkill -f`) — запретить категорически.**
Экспонат с этой самой машины. Прямо сейчас работает чужой сервис:
```
# ~/.config/systemd/user/browser-harness-cdp.service
Description=Headless Chromium CDP endpoint for browser-harness (browser-use)
ExecStart=/home/toligrim/projects/ShortVideo/video/node_modules/.remotion/chrome-headless-shell/
          linux-arm64/chrome-headless-shell-linux-arm64/headless_shell --remote-debugging-port=9222 …
```
Другой проект (browser-use) одолжил **бинарь chrome из репозитория ShortVideo**. Поэтому не спасает даже «аккуратный» `pkill -f`, ограниченный полным путём внутри `projects/ShortVideo/video/node_modules/…` — он снесёт чужой постоянный сервис. Это ровно тот класс ошибки, о котором предупреждал заказчик задачи, и он здесь не гипотетический.

---

## 4. Существующие сироты

Отдельным шагом, **до** правок кода — они нужны как чистая базовая линия для тестов (§6) и как немедленные 291 МБ.

Порядок: перепроверить каждый PID по трём признакам одновременно (cmdline содержит `projects/ShortVideo/video/node_modules`, `PPID == 1`, `starttime` совпадает с ожидаемым — 25 августа), затем адресно `kill -TERM <pid>`, через 10 с `kill -KILL` по выжившим. Целей три: `1696013`, `1751749`, и `1752111` (compositor — умрёт сам вслед за родителем 1751749, отдельно бить не нужно, но проверить).

Никаких `pkill`. Никакого «заодно почистим chrome» — chrome, который сейчас виден в `ps`, это `browser-harness-cdp.service` чужого проекта, его трогать нельзя.

Отдельно стоит зафиксировать в логе, что сирота 1696013 — это `remotion still --help`: то есть утечь может даже мгновенная справочная команда. Значит, механизм не должен опираться ни на какие предположения о «долгих» и «коротких» вызовах.

---

## 5. Нужен ли сторож — да, но с другой мотивировкой, чем в постановке

В постановке сторож предлагался «на случай, если `run_episode.sh` умрёт от SIGKILL/OOM». **Именно этот сценарий cgroup-дизайн уже закрывает**: OOM-killer убивает главный процесс юнита → systemd видит смерть main → останавливает юнит → `KillMode=control-group` сносит остаток cgroup. Trap не нужен, потому что работает systemd, а не скрипт.

Настоящее обоснование сторожа другое — **запуски мимо обёртки**. Сирота 1751749 родилась в ручной tmux-сессии, где `run_episode.sh` вообще не участвовал: человек или агент в интерактивной сессии просто вызвал `npx remotion still`. Обёртка это по определению не покрывает. Плюс остаточные щели: перезапуск user-менеджера в середине прогона; убитый клиент `systemd-run` (частично покрыт `RuntimeMaxSec`).

Дизайн сторожа, прицельный по родословной, а не по имени:

- **user**-таймер `shortvideo-reaper.timer`, `OnUnitActiveSec=10min` (это НЕ «подметание перед прогоном» — таймер независим от расписания производства и работает как раз в простое, что и требовалось).
- Кандидат должен удовлетворять **всем** условиям сразу:
  1. `exe`/`cmdline` лежит под `<repo>/video/node_modules` (remotion CLI, compositor) либо это chrome, запущенный remotion-ом;
  2. `PPID == 1` **или** PPID == PID user-менеджера (`systemd --user`, здесь 1402) — то есть процесс реально осиротел; у живого прогона родитель всегда жив, поэтому здоровые процессы структурно вне выборки;
  3. его cgroup **не** является ни одним живым `sv-run-*.service`;
  4. его cgroup **не** является чужим `*.service` — единственное исключение из правила «убиваем только сирот»; это условие в одиночку защищает `browser-harness-cdp.service`;
  5. возраст > 15 мин.
- Действие: `kill -TERM`, через 20 с `kill -KILL` по выжившим. По одному PID, `kill` по списку, **никогда** `pkill`/`killall`.
- Режим по умолчанию — `--dry-run`; каждое решение (и каждый отвергнутый кандидат с причиной отказа) пишется в лог сторожа с полным cmdline и cgroup. Без этого журнала невозможно доказать, что сторож не съел соседа.

Сторож остаётся страховкой второго эшелона: в норме он всегда должен находить ноль кандидатов, и ненулевая находка — это сигнал, что где-то есть путь запуска мимо обёртки, который надо чинить в источнике.

---

## 6. План проверки

Заканчивать каждый сценарий одним и тем же ассертом «не задели соседей» — это главная проверка на этой машине.

1. **База.** Снимок `systemd-cgls --user`, список PID в cgroup `browser-harness-cdp.service`, счётчик node-процессов чужих проектов.
2. **Юнит-уровень (уже проведён, зафиксировать как воспроизводимый тест).** Транзиентный юнит, main порождает `setsid sleep`, main выходит → `sleep` исчезает. Плюс `RuntimeMaxSec` на зависшем main с detached-ребёнком. Обе проверки уже дали ожидаемый результат.
3. **Фейковый раннер.** Добавить в `run_episode.sh` тест-шов (по образцу существующего `SV_SCHEDULER_FAKE_LAUNCH` в `producer_scheduler.py:63`), подменяющий `codex`/`claude` скриптом. Сценарии:
   - **3a. Фоновый рендер** — раннер запускает `npx remotion still Preview … &` и сразу выходит с кодом 0. Это точная репродукция утечки, предписанной `produce/SKILL.md:36`.
   - **3b. Зависший still** — запустить `remotion still`, послать ему `SIGSTOP`, раннер выходит. Проверяет, что SIGTERM недостаточно и SIGKILL-эскалация реально нужна (SIGSTOP-нутый процесс не обработает TERM).
   - **3c. Ошибка** — раннер выходит с кодом 1, оставив фоновый `remotion render`.
   - **3d. Таймаут** — `--timeout-min 1`, раннер спит 5 минут; ожидание: `exit 124` сохранён.
   - Ассерт после каждого: `cgroup.procs` юнита пуст (или сам юнит исчез), нет процессов с путём репозитория и `PPID==1`, exit-код совпал с ожидаемым.
4. **OOM-имитация.** Найти PID `run_episode.sh` внутри юнита, `kill -9`. Ожидание: вся cgroup снесена за ≤ `TimeoutStopSec`, включая `setsid`-ребёнка. Это тот случай, который trap принципиально не покрывает.
5. **Отсутствие шины.** Запустить `run_episode.sh` с `DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent` — проверить, что скрипт печатает предупреждение, продолжает в деградационном режиме (trap+PGID) и всё равно чистит сценарии 3a/3c (3b он честно не вытянет — это и есть цена деградации, её надо задокументировать).
6. **Окружение.** Фейковый раннер, печатающий `env` и `pwd`, — сверить, что `HOME`, `PATH`, `SHORTVIDEO_PUBLISH_STATE_DIR`, `SV_RUN_ID`, `SV_RUN_DIR` и рабочий каталог внутри юнита те же, что были до обёртки. Это самый вероятный источник регрессии.
7. **Сторож.** Из обычного tmux-шелла породить `remotion still --help`, убить родителя (репродукция сироты 1696013), прогнать сторожа `--dry-run` (должен опознать) и боевым (должен убить). Отдельно: убедиться, что при живом прогоне сторож находит ноль кандидатов.
8. **Ассерт «соседи целы»** во всех пунктах: `systemctl --user is-active browser-harness-cdp` = `active`, его PID не менялся (перезапуск по `Restart=on-failure` замаскировал бы убийство — сравнивать именно PID), счётчики чужих node-процессов не изменились.

---

## 7. Точки правки

### `tools/run_episode.sh` (основной файл)
- **(A) после `cd "$ROOT"` и парсинга аргументов, ДО `exec 9>runs/.lock` (сейчас строка 39).** Гвард самозаворачивания: если `SV_RUN_SCOPE` не выставлен и `systemd-run --user` доступен (проверять `command -v systemd-run` + успешный `systemctl --user is-system-running`), — `exec systemd-run --user --collect --wait --pipe --unit=sv-run-… -p KillMode=control-group -p TimeoutStopSec=30s -p RuntimeMaxSec=$((TIMEOUT_MIN*60+300)) -p WorkingDirectory="$ROOT" -p MemoryMax=… --setenv=… -- bash "$0" "$@"`. Иначе — предупреждение в stderr и продолжение в деградационном режиме. Порядок относительно flock — критичен (см. §2).
- **(B) сразу после flock и preflight-проверок.** Вычислить `RUN_PGID`, зафиксировать путь своей cgroup, повесить `trap sv_cleanup EXIT INT TERM HUP`.
- **(C) новая функция `sv_cleanup()`.** Идемпотентность через флаг; сначала **снять отчёт** (перечислить оставшиеся PID из `cgroup.procs`/группы с cmdline) и записать событие в `pipeline_log.py`, потом `trap '' TERM`, `kill -TERM -$RUN_PGID`, ожидание опустошения cgroup с поллингом до 15 с, `kill -KILL -$RUN_PGID`. Отчёт снимать ДО убийства, иначе логировать будет нечего.
- **(D) строки 90 и 100.** `timeout "${TIMEOUT_MIN}m"` → `timeout --kill-after=60s "${TIMEOUT_MIN}m"`.
- **(E) между блоком раннера (строка 106) и `pipeline_log.py finish` (строка 114).** Явный шаг «слива»: ограниченное ожидание опустошения cgroup, подсчёт остатка, передача числа остатков в `finish` — чтобы утечка попадала в манифест как метрика, а не терялась молча.

### `tools/producer_cron.sh`
- **После блока `export PATH=…` (строка 15).** Обязательно: `export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"` и `export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=${XDG_RUNTIME_DIR}/bus}"`. Без этого крон-путь молча свалится в деградационный режим — проверено, что без переменных `systemd-run --user` даёт `Failed to connect to bus: No medium found`.

### `tools/producer_scheduler.py`
- Структурно менять не нужно — обёртка живёт в `run_episode.sh`, и это осознанный выбор (покрывает и ручные запуски).
- **Строка 420, `subprocess.run(...)`:** добавить `timeout=TIMEOUT_MIN*60 + 600` и обработку `TimeoutExpired` (залипший клиент `systemd-run` не должен вечно держать `tick.lock`).
- Опционально `start_new_session=True` — полезно только в деградационном режиме без systemd.
- В `action_validate` добавить в вывод `systemd_user_bus: ok|unavailable` и имя схемы юнита — чтобы `tools/producer_cron.sh --validate` показывал, будет ли прогон изолирован, ещё до запуска.

### `tools/pipeline_log.py`
- Естественное место для отчёта об очистке — инфраструктура уже есть. Новый вид события (`cmd_event` уже принимает произвольный `kind`, но лучше добавить явный `cleanup` в словарь и в сборку манифеста) и секция в `manifest.json` (`cmd_finish`, строки ~510-560): `cleanup: {method: "cgroup"|"pgid-fallback", unit, terminated: [{pid, cmd, signal}], leftovers_after, duration_sec}`. Тогда утечка становится наблюдаемой метрикой прогона, а не находкой раз в две недели.

### Новое: `deploy/systemd/shortvideo-reaper.{service,timer}` (user-юниты) + `tools/reap_orphans.py`
Реализация правил §5, `--dry-run` по умолчанию, собственный лог решений.

### Инструкции агентов — источник проблемы, а не только следствие
- `.claude/skills/produce/SKILL.md:36` — «**Рендер (фон)**» и `.claude/skills/animator/SKILL.md:38` — «Полный рендер (долгий — **в фоне**)». Это буквальное указание порождать процесс, переживающий агента. Даже с cgroup-обёрткой такой рендер будет убит на середине в момент выхода агента — то есть инструкция не просто течёт, она **несовместима** с новым механизмом и даст испорченные mp4. Переформулировать на синхронный вызов (естественно — через уже существующий `pipeline_log.py wrap render -- …`, который даёт и тайминги, и лог).

---

## Дополнительные источники утечек (сверх remotion/chrome)

- **`video/scripts/check-overlaps.cjs`** — второй, независимый от CLI источник chrome: `openBrowser()` на строке 59, `puppeteerInstance.close()` только на строке 93. Исключение между ними оставляет браузер. Это гейт, который `producer_scheduler.py` в промпте объявляет **обязательным** перед каждым вердиктом критика, то есть выполняется по несколько раз за прогон. Покрывается cgroup-ом и pdeathsig, но стоит поправить и на месте (`try/finally`).
- **`tools/tts_scenes.py:118`** — `ffmpeg` на каждую сцену через `subprocess.run` (синхронно, риск низкий, cgroup покрывает).
- **`tools/tts_scenes.py:143-145`** — **faster-whisper** (forced alignment) грузится в тот же python-процесс: отдельных PID нет, но есть пул OpenMP/ct2-потоков и модель в RAM. Отдельного «сиротства» не создаёт, зато это главный кандидат на OOM внутри прогона — ещё один аргумент за `MemoryMax=` на cgroup (локальный OOM вместо глобального выбора жертвы среди чужих проектов).
- **`codex mcp-server` / `codex-code-mode-host`** — долгоживущие хелперы. В `ps` сейчас видно несколько таких возрастом 3-4 суток (PID 979960, 1213493, 2570478), привязанных к чужим/старым сессиям. Если прогон оставит такой хелпер, cgroup-обёртка снесёт его вместе с прогоном — побочный выигрыш. Существующие трогать не надо, они принадлежат живым интерактивным сессиям других проектов.
- **Не найдено** отдельных процессов aeneas/внешнего whisper — выравнивание целиком внутрипроцессное.
