# ShortVideo — план реализации v1 (согласован 19.07.2026)

Автономный конвейер вертикальных 1-мин роликов по информатике (ru+en), 0₽.
Стек: Remotion (анимация как код, самонаращиваемый язык сцен), Edge TTS (временно, до баттла TTS),
forced alignment для караоке-субтитров, рендер в GitHub Actions, SQLite-каталог, FFmpeg.

## v1 — движок анимации (начать по таймеру ~03:07)

1. Каркас: `video/` — Remotion-проект 1080×1920, 30fps.
2. Примитивы (`src/primitives/`): node (иконка+подпись, Lucide), arrow, packet (летящая подпись по пути),
   label, code-block, terminal, highlight-frame. Палитра: тёмный фон, неоновые акценты, danger=красный.
3. Сцены v1 (`src/scenes/`): hook, diagram (узлы+пакеты), terminal, code, outro.
4. Таймлайн: длительность сцены = длительность её реплики (из аудио); караоке-субтитры по word timings.
5. `schema/scenes.json` — JSON Schema всех типов сцен (валидация до рендера).
6. Скилл аниматора: `.claude/skills/animator/` — SKILL.md, catalog.md (сцены+параметры+когда использовать),
   style.md (safe-зоны, ≤4 элемента в кадре, размеры шрифтов), examples/.
7. Тестовый сценарий «Что такое TCP handshake» (ru) → озвучка Edge TTS (скилл /tts, ru-RU-DmitryNeural,
   edge-tts даёт word boundaries — alignment для v1 не нужен) → локальный рендер → готовый MP4 пользователю.

Рендер v1 гоняем локально на Pi (медленно — ок для теста); GitHub Actions — следующий шаг.

## Сделано после v1 (19.07.2026)
- Fenrir (Gemini TTS) — основной голос, forced alignment через faster-whisper (venv/).
- Моушн-слой: камера, тряска на импактах, частицы, шлейфы, пружинное караоке.
- Сцена story: биты по onWord (browser-click, devices-meet, handshake, title-slam).
- Двухагентная схема: .claude/agents/scriptwriter.md (текст) →
  .claude/agents/animation-director.md (раскадровка в episode JSON) →
  оркестрация .claude/skills/produce (озвучка → QC-кадры → рендер).

## Дальше (не в v1)
- TTS-баттл: Gemini TTS (нужен ключ AI Studio от пользователя) vs Kokoro vs Chatterbox vs Edge.
- canvas-сцена с якорями на слова (on_word), визуальный QC кадров через Gemini, самонаращивание библиотеки сцен.
- GitHub Actions рендер, SQLite-каталог тем/сценариев, агент-сценарист (Sonnet 5), Telegram-бот, публикация.

## Решения пользователя
- Язык роликов: ru + en из одного сценария. Платформы: YouTube Shorts, Telegram, Reels/TikTok.
- Полная автономность потом; сначала апрув через бота. Бюджет строго 0₽.
