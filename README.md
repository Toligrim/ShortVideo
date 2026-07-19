# ShortVideo — конвейер вертикальных роликов по информатике

Автономный пайплайн: сценарий (JSON сцен) → озвучка (Edge TTS + тайминги слов) →
анимация и монтаж (Remotion, детерминированно) → MP4 1080×1920.

## Структура

```
episodes/            сценарии эпизодов (JSON, источник правды)
schema/              JSON Schema языка сцен
tools/
  validate.py        валидация эпизода (схема + смысловые проверки)
  tts_scenes.py      озвучка посценно + word boundaries → meta.json
video/               Remotion-проект (движок рендера)
  src/primitives/    атомы: узлы, пакеты, терминал, код, бейджи
  src/scenes/        сцены: hook, diagram, terminal, code, outro
  src/lib/           тема, таймлайн, караоке-субтитры, типы
  public/episodes/   собранные ассеты эпизода (audio + meta + script)
.claude/skills/animator/   скилл: как писать эпизоды (каталог сцен, стайлгайд)
PLAN.md              дорожная карта
```

## Произвести эпизод

```bash
python3 tools/validate.py episodes/<slug>.json
/home/toligrim/projects/TTS/venv/bin/python tools/tts_scenes.py \
  episodes/<slug>.json --out video/public/episodes/<slug>
cp episodes/<slug>.json video/public/episodes/<slug>/script.json
cd video && npx remotion render Episode out/<slug>.mp4 --props='{"episodeId":"<slug>"}'
```

Ключевой принцип: тайминги не пишутся руками — длительность сцены равна длительности
её реплики, элементы синхронизируются якорями `onWord` на слова диктора.
