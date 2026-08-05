# Публикация в YouTube и Instagram

## Поток и безопасный запуск

Поток неизменяемый: `render` → `review` (нормализованная копия и снимок metadata) → карточка Telegram → approve/reject → durable outbox → worker. Цели YouTube и Instagram независимы: сбой одной не отменяет другую.

Сначала всегда проверьте локальный режим `dry-run`; он не создаёт сетевых вызовов к провайдерам:

```bash
python3 -m venv venv
. venv/bin/activate
python3 -m pip install -r requirements-publishing.txt
# Установите системные зависимости ffmpeg и ffprobe через пакетный менеджер ОС.
export PYTHONPATH=tools
python3 tools/publish.py init-db
python3 tools/publish.py validate-metadata examples/publish-metadata.example.json --json
python3 tools/publish.py review --slug example-short --video /absolute/path/video.mp4 \
  --metadata examples/publish-metadata.example.json --mode dry-run
python3 tools/publish.py status --slug example-short --json
```

Для реальной публикации используйте тот же `review` с `--mode live`. Только бот принимает решение approve/reject; worker не публикует без уже сохранённого approve.

## Команды оператора

```bash
python3 tools/publish.py bot --once                 # один цикл Telegram; без --once long-polling
python3 tools/publish.py worker --once              # обработать готовые platform jobs
python3 tools/publish.py status --publication-id ID --json
python3 tools/publish.py retry --publication-id ID --target youtube
python3 tools/publish.py reconcile --publication-id ID --target instagram \
  --outcome mark-published --external-id ID --external-url URL
python3 tools/publish.py reconcile --publication-id ID --target instagram \
  --outcome requeue --confirm-not-published
python3 tools/publish.py doctor youtube
python3 tools/publish.py doctor instagram
python3 tools/publish.py youtube-authorize
```

`retry` — только явная повторная постановка failed target. Для неоднозначного результата не делайте blind retry: сначала проверьте провайдера, затем `reconcile`. `mark-published` требует подтверждённые ID и URL; `requeue` требует `--confirm-not-published`. При ошибке очистки временного R2-объекта reconcile не меняет БД — устраните проблему очистки и повторите ту же reconcile-команду.

## Учетные данные и окружение

Скопируйте `deploy/publisher.env.example` в `%h/.config/shortvideo/publisher.env`, заполните вне репозитория и ограничьте доступ:

```bash
install -d -m 700 "$HOME/.config/shortvideo" "$HOME/.local/share/shortvideo/secrets"
install -m 600 deploy/publisher.env.example "$HOME/.config/shortvideo/publisher.env"
# После создания файлов credentials ограничьте каждый обычный файл в secrets.
find "$HOME/.local/share/shortvideo/secrets" -type f -exec chmod 600 {} +
```

Укажите `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_ID` и `TELEGRAM_ALLOWED_USER_ID`: callback approve/reject принимается только из этого чата и от этого пользователя.

YouTube: создайте OAuth Desktop client с loopback redirect в Google Cloud, задайте либо `SHORTVIDEO_YOUTUBE_CLIENT_SECRETS_FILE`, либо `SHORTVIDEO_YOUTUBE_CLIENT_ID` и `SHORTVIDEO_YOUTUBE_CLIENT_SECRET`. Задайте `SHORTVIDEO_YOUTUBE_TOKEN_FILE` как внешний файл `0600`, вне `SHORTVIDEO_PUBLISH_STATE_DIR`, затем вручную выполните `youtube-authorize`. Требуемый scope — YouTube upload; токен никогда не кладётся в репозиторий или state directory.

Instagram: нужен Professional account и Instagram Login с разрешениями `instagram_business_basic` и `instagram_business_content_publish`. Получите long-lived token, запишите его в файл `0600` вне state directory и укажите `SHORTVIDEO_INSTAGRAM_ACCESS_TOKEN_FILE`, ID профессионального пользователя в `SHORTVIDEO_INSTAGRAM_USER_ID` и явную поддерживаемую версию API в `SHORTVIDEO_INSTAGRAM_API_VERSION`. Текущую поддерживаемую версию берите из официальной документации Meta, не фиксируйте её в runbook. Перед live запуском выполните `doctor instagram`.

R2: задайте отдельные scoped credentials (`SHORTVIDEO_R2_ACCOUNT_ID`, `SHORTVIDEO_R2_BUCKET`, `SHORTVIDEO_R2_ACCESS_KEY_ID`, `SHORTVIDEO_R2_SECRET_ACCESS_KEY`). Worker создаёт только короткоживущий presigned URL (`SHORTVIDEO_R2_TTL`) для Instagram и удаляет временный объект после завершения. Настройте lifecycle policy бакета как дополнительную защиту от оставшихся объектов; не считайте её заменой cleanup.

## Systemd user units

Не устанавливайте и не запускайте units автоматически. Команды ниже используют `venv` проекта и не зависят от активированного окружения в shell systemd:

```bash
project_dir=$(pwd -P)
test -x "$project_dir/venv/bin/python"
install -d -m 700 "$HOME/.config/systemd/user"
sed -e "s|@PROJECT_DIR@|$project_dir|g" -e "s|@PYTHON@|$project_dir/venv/bin/python|g" \
  deploy/systemd/shortvideo-publisher-bot.service \
  > "$HOME/.config/systemd/user/shortvideo-publisher-bot.service"
sed -e "s|@PROJECT_DIR@|$project_dir|g" -e "s|@PYTHON@|$project_dir/venv/bin/python|g" \
  deploy/systemd/shortvideo-publisher-worker.service \
  > "$HOME/.config/systemd/user/shortvideo-publisher-worker.service"
systemctl --user daemon-reload
systemctl --user enable --now shortvideo-publisher-bot.service shortvideo-publisher-worker.service
```

Проверяйте журналы через `journalctl --user -u shortvideo-publisher-bot.service -f` и аналогично для worker. Эти инструкции и примеры не выполняли реальные credentials или сетевые вызовы.

## Официальные источники

- [Google OAuth 2.0 для desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app) и [resumable upload YouTube](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol); публикация использует [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert).
- [Meta Instagram Login: content publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing/).
- [Cloudflare R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) и [boto3 для R2](https://developers.cloudflare.com/r2/examples/aws/boto3/).
