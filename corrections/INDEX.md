# Индекс исторических правок

Формат и правила — см. `corrections/CLAUDE.md`. Новую строку добавлять при
каждой новой записи или дополнении существующей.

| дата | slug | дефект(ы) | затронутые системные файлы |
|---|---|---|---|
| 2026-08-31 | [auto-20260831-050001](auto-20260831-050001/REPORT.md) | буквальный «SHOW» на экране (4 сцены), грамматика в сцене 2, ошибка произношения TTS «цифроной»/«цифровой» в сцене 5 | `tools/validate.py`, `tools/tts_scenes.py`, `tools/run_episode.sh`, `tools/producer_scheduler.py`, `.claude/skills/animator/{SKILL,style}.md`, `~/.profile`, `~/.codex/config.toml`; новый `tools/check_tts_stt.py` |
| 2026-08-31 | [publisher-approve-ack](publisher-approve-ack/REPORT.md) | кнопка Approve/Reject в Telegram молча ничего не делала при сетевом флапе хоста — упавший answerCallbackQuery ронял apply_telegram_action | `tools/publishing/telegram.py`, `tools/test_publishing_telegram.py` |
| 2026-08-31 | [topic-deduplication-gap](topic-deduplication-gap/REPORT.md) | автопродюсер трижды выпустил тему избыточности QR-кода под разными заголовками — дедупликация была только мягкой промпт-инструкцией «не повторяй последние (подряд)» без детерминированного списка прошлых тем | `tools/producer_scheduler.py`, `tools/test_producer_scheduler.py` |
