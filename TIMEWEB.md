# Timeweb App Platform: Web

Deploy this repository as a frontend/static React application.

## App settings

- Repository: `fsend-web`
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `build`
- Public domain: `app.example.com`

## Environment variables

Copy variables from `.env.production.example` into the Timeweb App Platform environment settings.

```env
REACT_APP_API_URL=https://api.example.com
REACT_APP_WS_URL=wss://api.example.com/ws
REACT_APP_ENV=production
```

The backend must allow this frontend domain in `CORS_ALLOWED_ORIGINS`.
