# Railway deployment

Single service: **Express + React (`backend/public`) + cron + Playwright + PostgreSQL**.

**End-to-end go-live checklist:** [DEPLOYMENT.md](./DEPLOYMENT.md)

```
Git push → Railway build (Dockerfile) → migrate deploy → node dist/server.js
         → cron starts → Playwright ready → dashboard at https://<app>.up.railway.app
```

## 1. Create the project

1. Push this repo to GitHub.
2. [Railway](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. Add a **PostgreSQL** plugin to the same project.
4. Railway will set `DATABASE_URL` on the service automatically (use the **Postgres** variable reference).

Root config:

| File | Role |
|------|------|
| `Dockerfile` | Multi-stage build with Playwright Chromium image |
| `railway.toml` / `railway.json` | Dockerfile builder + `/api/health` check |
| `.dockerignore` | Keeps local DB/logs/node_modules out of the context |

## 2. Build & start (already in the image)

**Build:** `npm run build` in `backend/` (Vite → `public/` + `tsc`).

**Start (Dockerfile `CMD`):**

```bash
npx prisma migrate deploy && node dist/server.js
```

- Applies Prisma migrations on every deploy.
- **Does not seed** (avoids wiping/duplicating production data). Seed once manually if needed.

Local equivalent: `npm run start:prod` from repo root or `backend/`.

## 3. Environment variables

Set these on the Railway **service** (not only locally):

### Required

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | From Railway Postgres plugin |
| `NODE_ENV` | `production` |
| `PORT` | Railway injects this — do not hardcode |

### Recommended production

| Variable | Value |
|----------|--------|
| `LOG_TO_FILES` | `false` (use Railway logs) |
| `LOG_LEVEL` | `info` |
| `ENABLE_DEV_TOOLS` | `false` |
| `PLAYWRIGHT_HEADLESS` | `true` |
| `PLAYWRIGHT_NO_SANDBOX` | `true` (set in image; keep if you override) |
| `CRON_FREQUENCY` | e.g. `0 */6 * * *` |
| `REQUEST_LOGGING` | `true` |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_FETCH_MAX` | Optional tighten |
| `CORS_ORIGIN` | Leave empty for same-origin SPA |

### Optional product features

| Variable | Notes |
|----------|--------|
| `TELEGRAM_BOT_TOKEN` | Shared bot; users link their own chat in Settings |
| `TELEGRAM_CHAT_ID` | Optional Dev Tools fallback only |
| `GEMINI_ENABLED` / `GEMINI_API_KEY` | AI matching |
| `MATCH_SCORE_THRESHOLD`, `ESCALATION_*`, `MAX_*` | See [ENV.md](./ENV.md) |

Full list: [ENV.md](./ENV.md).

## 4. First-time data

Migrations create empty tables. Then either:

```bash
# From a one-off Railway shell / local against prod DATABASE_URL:
cd backend
npm run seed          # company catalog + defaults
# OR, if you still have prisma/data-export.json:
npm run db:import
```

Prefer **seed** for a clean catalog; use **import** only to restore a prior export.

## 5. Verify

```bash
curl https://<your-app>.up.railway.app/api/health
curl https://<your-app>.up.railway.app/api/version
curl https://<your-app>.up.railway.app/api/cron/status
```

Open the same host in a browser — the SPA is served by Express.

## 6. Resource notes

- Playwright Chromium needs **~1–2 GB RAM**; pick a Railway plan accordingly.
- `PLAYWRIGHT_MAX_CONCURRENT` defaults to `2` — lower it if the instance is small.
- Health check path: `/api/health` (see `railway.toml`).

## 7. Local Docker smoke (optional)

```bash
docker build -t jobfinder .
docker run --rm -p 3001:3001 \
  -e DATABASE_URL="postgresql://..." \
  -e NODE_ENV=production \
  -e PORT=3001 \
  jobfinder
```
