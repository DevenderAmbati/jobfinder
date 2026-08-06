# Final deployment flow

Production path for the personal Job Intelligence Platform.

```
Git push
   ↓
GitHub
   ↓
Railway auto-deploy (Dockerfile build)
   ↓
Container start
   ↓
prisma migrate deploy
   ↓
node dist/server.js  (Express)
   ↓
Cron starts + Playwright ready
   ↓
Dashboard live  (same origin SPA + /api)
```

**Manual steps after the first setup:** environment variables only (plus a one-time seed if the database is empty).

---

## One-time Railway setup

1. Push this repo to GitHub (`main` or `master`).
2. Railway → **New Project** → deploy from that GitHub repo.
3. Add the **PostgreSQL** plugin; link `DATABASE_URL` to the web service.
4. Set service variables (see [ENV.md](./ENV.md) and [RAILWAY.md](./RAILWAY.md)):

| Must set | Typical value |
|----------|----------------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | from Postgres plugin |
| `ENABLE_DEV_TOOLS` | `false` |
| `LOG_TO_FILES` | `false` |
| `PLAYWRIGHT_HEADLESS` | `true` |
| `PLAYWRIGHT_NO_SANDBOX` | `true` |

Optional: `TELEGRAM_*`, `GEMINI_*`, `CRON_FREQUENCY`, rate limits.

5. Deploy. Railway builds the Dockerfile and runs:

```bash
npx prisma migrate deploy && node dist/server.js
```

6. **First deploy only** — if tables are empty, seed once (Railway shell or local with prod URL):

```bash
cd backend && npm run seed
```

Do **not** put seed in the start command.

---

## Every subsequent push

1. `git push` to the connected branch.  
2. CI runs on GitHub (`.github/workflows/ci.yml`).  
3. Railway rebuilds and restarts.  
4. Migrations apply automatically.  
5. Cron and Playwright come up with the process.  
6. Open `https://<your-app>.up.railway.app`.

No other manual steps.

---

## Go-live verification

```bash
curl -s https://<app>/api/health
curl -s https://<app>/api/version
curl -s https://<app>/api/cron/status
curl -s https://<app>/api/providers/status
```

Browser: open the same host — Jobs / Companies should load (SPA served by Express).

| Check | Expect |
|-------|--------|
| `/api/health` | `status: ok`, `database: up` |
| `/api/cron/status` | `data.running: true` |
| Dashboard | Loads without a separate frontend URL |
| Fetch now | Completes; Provider Health updates |

---

## What the start sequence does

| Step | Component |
|------|-----------|
| Migrate | Prisma applies `backend/prisma/migrations` |
| Listen | Express on `PORT` (Railway-injected) |
| Workers | In-memory queue + `CronScheduler.start()` |
| UI | Static files from `backend/public` |
| Browsers | Chromium via Playwright image + `withChromiumBrowser()` |

Graceful shutdown (SIGTERM): stop HTTP → stop cron/queue → close Playwright → `prisma.$disconnect`.

---

## Related docs

- [RAILWAY.md](./RAILWAY.md) — detailed Railway notes  
- [ENV.md](./ENV.md) — all variables  
- [SMOKE_CHECKLIST.md](./SMOKE_CHECKLIST.md) — local + prod checks  
- [SINGLE_PROCESS.md](./SINGLE_PROCESS.md) — why one Express process  
