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

3. **Озвучка**:
   ```bash
   venv/bin/python tools/tts_scenes.py episodes/<slug>.json \
     --out video/public/episodes/<slug> --provider gemini
   cp episodes/<slug>.json video/public/episodes/<slug>/script.json
   ```
   (Квота Gemini кончилась → `--provider edge`, упомяни в сдаче.)

4. **Критик** — агент `critic`: «Проверь эпизод <slug>». ПРАВКИ → передай
   список режиссёру (SendMessage), после исправлений — критик заново.
   Максимум 2 круга; не сошлось — отправь пользователю кадры и вопрос.

5. **Рендер** (фон): `cd video && npx remotion render Episode out/<slug>.mp4
   --props='{"episodeId":"<slug>"}'`

6. **Сдача**: `git add -A && git commit` (эпизод+ассеты), SendUserFile MP4:
   тема, длительность, состав сцен, **новых визуалов: N**, вердикт критика.

## Правила

- Slug сквозной: draft → episode → public → mp4.
- Без апрува пользователя ничего никуда не публикуется — только отправка ему.
- Каждый этап, меняющий файлы, заканчивается коммитом.

## Approval-gated social publishing

Для каждого нового рендера этот раздел заменяет старый пункт 6 с
`telegram_bot.py send-video`: после render вместо direct send агент создаёт
review, а bot service сам доставляет видео и карточку в Telegram. Обе команды
выполнять нельзя — это отправит пользователю дубликат.

1. Создать отдельный metadata JSON по образцу
   `examples/publish-metadata.example.json`.
2. Сначала проверить metadata:
   `python3 tools/publish.py validate-metadata <path>`.
3. Создать immutable review для живой публикации:
   `python3 tools/publish.py review --slug <slug> --video video/out/<slug>.mp4 --metadata <path> --mode live`.
4. Bot service доставит видео и review-карточку в Telegram. YouTube и Instagram
   не публикуются, пока пользователь не нажмёт `Approve`.

Для первичной проверки пайплайна используй тот же `review` с `--mode dry-run`.
Старую прямую команду `telegram_bot.py send-video` не используй для social
approval flow: она не создаёт immutable review и не является разрешением на
публикацию в соцсети.
