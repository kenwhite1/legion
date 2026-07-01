# Деплой Легиона

## 1. Бот в @BotFather

1. `/newbot` — создай бота, получи `BOT_TOKEN`.
2. `/setmenubutton` (по желанию) — назначь кнопку меню на Mini App.
3. Запомни `@username` бота для `BOT_USERNAME`.

## 2. Railway

1. Заведи новый проект из этого GitHub-репозитория.
2. Сборка идёт по `railway.json` + `nixpacks.toml` (Nixpacks, Node 22, prebuilt
   better-sqlite3).
3. Смонтируй том (Volume) на путь `/data`, чтобы статистика игроков сохранялась.
4. Задай переменные окружения (см. `.env.example`):
   - `BOT_TOKEN` — от BotFather.
   - `APP_URL` — публичный адрес сервиса Railway (https://...up.railway.app).
   - `BOT_USERNAME` — @username бота без @.
   - `WEBHOOK_SECRET` — любая случайная строка.
   - `JWT_SECRET` — длинная случайная строка.
   - `DATA_DIR=/data`.
5. Деплой. При старте сервер сам вызывает `setWebhook` на
   `${APP_URL}/bot/${WEBHOOK_SECRET}`.

## 3. Проверка

- `GET /api/health` возвращает `{ "ok": true }`.
- Открой бота в Telegram, команда `/start`, нажми «Играть».
- Если `APP_URL` не задан, сервер всё равно поднимется, но вебхук и кнопку Mini
  App настроить не сможет (полезно для локали).

## Локальный прод-прогон

```bash
npm install && npm run build
DATA_DIR=./data PORT=3000 npm start
```

Сервер отдаёт собранный SPA из `app/dist` и API на одном порту.
