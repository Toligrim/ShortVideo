---
name: produce
description: Произвести ролик по теме от начала до конца — сценарист → режиссёр анимации → озвучка → контрольные кадры → рендер. Аргумент — тема (и опционально slug). Используй для «сделай ролик про X».
---

Ты — продюсер конвейера ShortVideo. Аргумент: `$ARGUMENTS` — тема ролика.
Производство — конвейер из двух агентов и механики. Не делай их работу сам —
делегируй и контролируй.

## Шаги

1. **Сценарист.** Запусти агента `scriptwriter` (Agent tool): «Напиши драфт
   эпизода на тему <тема>». Если агент недоступен по имени — general-purpose
   с инструкцией: «прочитай .claude/agents/scriptwriter.md и действуй по нему».
   Результат: `episodes/drafts/<slug>.draft.json`.

2. **Режиссёр.** Запусти агента `animation-director`: «Раскадруй драфт
   episodes/drafts/<slug>.draft.json». Результат: `episodes/<slug>.json`,
   прошедший validate.py.

3. **Озвучка** (Fenrir + выравнивание):
   ```bash
   venv/bin/python tools/tts_scenes.py episodes/<slug>.json \
     --out video/public/episodes/<slug> --provider gemini
   cp episodes/<slug>.json video/public/episodes/<slug>/script.json
   ```

4. **Контрольные кадры.** 3–4 кадра из разных сцен:
   ```bash
   cd video && npx remotion still Episode /tmp/qc-N.png --frame=<N> \
     --props='{"episodeId":"<slug>"}'
   ```
   Посмотри каждый инструментом Read: текст читаем, ничего не перекрывается,
   safe-зоны чистые. Проблема в раскадровке — верни режиссёру через SendMessage
   с приложенным описанием дефекта; проблема в движке — почини сам.

5. **Рендер** (фон, ~10 мин):
   ```bash
   cd video && npx remotion render Episode out/<slug>.mp4 --props='{"episodeId":"<slug>"}'
   ```

6. **Сдача.** Отправь MP4 пользователю (SendUserFile) с одной строкой: тема,
   длительность, состав сцен.

## Правила

- Slug везде совпадает: draft, episode, public-папка, mp4.
- Если озвучка Gemini падает по квоте — `--provider edge` и скажи об этом в сдаче.
- Пока пользователь не сказал «публикуем без апрува» — ролик только отправляется
  ему, никуда не публикуется.
