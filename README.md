# ShortVideo — конвейер вертикальных роликов по информатике

Автономный пайплайн: сценарий (JSON сцен) → озвучка (Gemini TTS + forced
alignment через faster-whisper) → анимация и монтаж (Remotion, детерминированно)
→ MP4 1080×1920.

## Структура

```
episodes/            сценарии эпизодов (JSON, источник правды)
schema/              JSON Schema языка сцен
tools/
  validate.py        валидация эпизода (схема + смысловые проверки)
  tts_scenes.py      озвучка посценно + word boundaries → meta.json
  telegram_bot.py    отправка готового MP4 в Telegram (send-video)
video/               Remotion-проект (движок рендера)
  src/primitives/    атомы: узлы, пакеты, терминал, код, бейджи
  src/scenes/        сцены: hook, diagram, terminal, code, outro
  src/lib/           тема, таймлайн, караоке-субтитры, типы
  public/episodes/   собранные ассеты эпизода (audio + meta + script)
corrections/         историческая база багов конвейера (найденных пользователем
                      в готовых роликах) — по эпизоду, с root cause и списком
                      правок; см. corrections/CLAUDE.md
.claude/skills/animator/   скилл: как писать эпизоды (каталог сцен, стайлгайд)
PLAN.md              дорожная карта
```

## Произвести эпизод

```bash
python3 tools/validate.py episodes/<slug>.json
venv/bin/python tools/tts_scenes.py \
  episodes/<slug>.json --out video/public/episodes/<slug>
cp episodes/<slug>.json video/public/episodes/<slug>/script.json
cd video && npx remotion render Episode out/<slug>.mp4 --props='{"episodeId":"<slug>"}'
cd .. && python3 tools/telegram_bot.py send-video video/out/<slug>.mp4 --caption "<тема>"
```

Ключевой принцип: тайминги не пишутся руками — длительность сцены равна длительности
её реплики, элементы синхронизируются якорями `onWord` на слова диктора.

Токен и chat_id бота — в `.env` (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_ID`),
`telegram_bot.py` подхватывает их сам. **Каждый готовый рендер отправляется в бот
автоматически** — это последний шаг производства эпизода, а не опция по запросу.
