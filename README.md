# Fsend Web — терминальный клиент

Веб-клиент мессенджера в стиле «приложение в терминале» (TUI): моноширинный
шрифт, фосфорно-зелёная палитра, окно-терминал и CRT-развёртка. При этом —
полностью функциональный: регистрация/вход, список диалогов, real-time чат
по WebSocket.

## Стек

- **React 18** (Create React App)
- **axios** — REST-клиент с JWT и авто-обновлением токена
- Нативный **WebSocket** (Django Channels), без socket.io
- Чистый CSS, без UI-библиотек

> Прежний план (MUI/Redux/libsodium/E2EE) убран ради лёгкого терминального
> клиента. Шифрование сейчас серверное «в покое» (см. backend), трафик — по WSS.

## Запуск

```bash
cd frontend/web
npm install
npm start          # http://localhost:3000
```

Нужен запущенный backend (см. `../../README.md` или `docker-compose up`).

## Переменные окружения (`.env`)

```
REACT_APP_API_URL=http://localhost:8000
REACT_APP_WS_URL=ws://localhost:8000/ws
```

## Структура

```
src/
├── config.js          # адреса API/WS
├── api.js             # axios + JWT + refresh + errText()
├── auth.js            # AuthProvider / useAuth (login, verify, logout)
├── ws.js              # useChatSocket() — WebSocket на выбранный диалог
├── App.js             # маршрутизация auth ↔ chat
├── components/
│   └── Terminal.js    # «окно терминала» (бар, статус)
└── screens/
    ├── Auth.js        # login / register / verify
    └── Chat.js        # сайдбар диалогов + лента + composer + поиск
```

## Поток аутентификации

1. `register` → бэкенд создаёт аккаунт и шлёт код подтверждения на email
   (в dev-режиме код виден в логе backend — EmailBackend=console).
2. `verify` → ввод кода, аккаунт становится верифицированным.
3. `login` → получение JWT (access/refresh), они хранятся в localStorage.

## Real-time

`useChatSocket` открывает `ws://…/ws/chat/<id>/?token=<access>`. Действия:
`message`, `typing`, `read_receipt`. События от сервера: `message`,
`user_typing`, `user_status`.

## Сборка

```bash
npm run build      # оптимизированная сборка в build/
```
Для Timeweb App Platform — приложение типа **Frontend (static)**, команда сборки
`npm run build`, каталог `build/`.
