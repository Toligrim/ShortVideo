---
name: produce
description: Произвести ролик по теме от начала до конца — сценарист → режиссёр → озвучка → критик → рендер. Аргумент — тема (и опционально slug). Используй для «сделай ролик про X».
---

Ты — продюсер конвейера ShortVideo. Аргумент: `$ARGUMENTS` — тема ролика.
Делегируй и контролируй; сам контент не пиши.

## Конвейер

1. **Сценарист** — агент `scriptwriter`: «Напиши драфт эпизода на тему <тема>».
   (Агент недоступен по имени → general-purpose + «прочитай
   .claude/agents/scriptwriter.md и действуй по нему».)
   Результат: `episodes/drafts/<slug>.draft.json`. Проверь отчёт: приём не
   повторяет последние ролики? вау-факт есть?

2. **Режиссёр** — агент `animation-director`: «Раскадруй драфт <путь>».
   Результат: валидный `episodes/<slug>.json` + отчёт с gap-сканом.
   **Контроль роста: если в gap-скане есть оценки ≤3, а новых визуалов 0 —
   верни работу режиссёру (SendMessage), не пропускай дальше.**

3. **Озвучка** (Gemini TTS; при исчерпанной дневной квоте на всех моделях
   Gemini скрипт сам и видимо переключается на Yandex SpeechKit — не тихая
   деградация, провайдер записан в `meta.json` каждой сцены и в логе):
   ```bash
   venv/bin/python tools/tts_scenes.py episodes/<slug>.json \
     --out video/public/episodes/<slug>
   cp episodes/<slug>.json video/public/episodes/<slug>/script.json
   ```
   Квота/сеть Gemini недоступны → скрипт падает с ошибкой. Не подменяй озвучку
   другим провайдером — останавливай сдачу и явно сообщи пользователю причину
   и когда стоит попробовать снова.

4. **Критик** — агент `critic`: «Проверь эпизод <slug>». ПРАВКИ → передай
   список режиссёру (SendMessage), после исправлений — критик заново.
   Максимум 2 круга; не сошлось — отправь пользователю кадры и вопрос.

5. **Рендер** (фон): `cd video && npx remotion render Episode out/<slug>.mp4
   --props='{"episodeId":"<slug>"}'`

6. **Автоотправка в Telegram** — ОБЯЗАТЕЛЬНЫЙ шаг сразу после рендера, не опция:
   `python3 tools/telegram_bot.py send-video video/out/<slug>.mp4 --caption "<тема>"`.
   Токен/chat_id бот берёт из `.env` сам. Если отправка упала (сеть, лимит 50 МБ
   и т.п.) — не блокируй сдачу, но явно сообщи об этом в отчёте пользователю.

7. **Сдача**: `git add -A && git commit` (эпизод+ассеты), SendUserFile MP4:
   тема, длительность, состав сцен, **новых визуалов: N**, вердикт критика,
   статус отправки в Telegram-бот.

## Правила

- Slug сквозной: draft → episode → public → mp4.
- Без апрува пользователя ничего никуда не публикуется вовне — кроме
  Telegram-бота: туда каждый готовый эпизод уходит автоматически, апрув не нужен.
- Каждый этап, меняющий файлы, заканчивается коммитом.

## Approval-gated social publishing

Для каждого нового рендера этот раздел заменяет старый пункт 6 с
`telegram_bot.py send-video`: после render вместо direct send агент создаёт
review, а bot service сам доставляет видео и карточку в Telegram. Обе команды
выполнять нельзя — это отправит пользователю дубликат.

1. Создать отдельный metadata JSON по образцу
   `examples/publish-metadata.example.json`. По умолчанию `privacy_status: "public"`
   — ролик должен уйти сразу в паблик по Approve, без ручного шага. Ставь
   `private`/`unlisted` только если пользователь явно попросил об этом для
   конкретного ролика.
   **В `description`/`caption` строго запрещено** упоминать, что ролик
   произведён автономным конвейером, называть модель/движок (Codex, Claude,
   gpt-*, Gemini и т.п.) или иначе намекать на ИИ-производство текста —
   зрителю это не показываем. Только тема ролика по существу.
2. Сначала проверить metadata:
   `python3 tools/publish.py validate-metadata <path>`.
3. Создать immutable review для живой публикации:
   `python3 tools/publish.py review --slug <slug> --video video/out/<slug>.mp4 --metadata <path> --mode live`.
4. Bot service доставит видео и review-карточку в Telegram. YouTube и Instagram
   не публикуются, пока пользователь не нажмёт `Approve`. Bot- и worker-сервисы
   (`systemctl --user`, см. раздел «Systemd user units» в
   `docs/social-publishing.md`) держим постоянно запущенными — тогда после
   `Approve` публикация уходит на YouTube автоматически, без ручного
   `worker --once`.

Для первичной проверки пайплайна используй тот же `review` с `--mode dry-run`.
Старую прямую команду `telegram_bot.py send-video` не используй для social
approval flow: она не создаёт immutable review и не является разрешением на
публикацию в соцсети.
