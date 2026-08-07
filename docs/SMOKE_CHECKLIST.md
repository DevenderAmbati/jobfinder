# Smoke checklist (V1)

Manual pass/fail after a fresh seed. Run backend on `:3001` and frontend on `:5173`.

## Bootstrap

- [ ] `docker compose up -d` (Postgres)
- [ ] `cd backend && npm install && npx prisma migrate deploy && npm run db:import` (or `npm run seed` on empty DB) `&& npm run dev`
- [ ] `cd frontend && npm install && npm run dev`
- [ ] `GET /api/health` returns `status: ok` and database connected
- [ ] `GET /api/version` returns app version
- [ ] Sign in at the UI (`owner@localhost` / `changeme` after migration, or register a new account)
- [ ] `GET /api/cron/status` with `Authorization: Bearer <token>` shows scheduler `running: true`
- [ ] Unauthenticated `GET /api/jobs` returns 401
- [ ] Stop the process with Ctrl+C and confirm logs show graceful shutdown

## Pipeline

- [ ] Companies page lists Stub Corp (or seed companies)
- [ ] Enable a company → **Fetch now** → jobs appear on Jobs page
- [ ] Provider Health shows a SUCCESS (or FAILURE with error) for that provider
- [ ] Logs → Provider tab shows a run; Notification tab after a match ≥ threshold

## Matching & rules

- [ ] Rules page loads default rule; save `minMatchScore` and confirm it persists
- [ ] Settings → Runtime status shows Gemini/Telegram flags (no secrets)
- [ ] Settings → save resume text/markdown; optional PDF upload succeeds; Jobs scores refresh for that user only
- [ ] Register a second user, upload a different resume, confirm company list is shared but match scores differ
- [ ] Settings → edit an enabled prompt template and save

## Tracker & analytics

- [ ] Applications → create SAVED from a job → transition to APPLIED
- [ ] Analytics shows non-zero companies monitored after enable; matched/ignored update after fetches

## Dev tools (non-production)

- [ ] `/dev` loads; scheduler tick and provider run complete without crashing the API

## Build gates

- [ ] `cd backend && npm run typecheck && npm test`
- [ ] `cd frontend && npm run lint && npm run build`
- [ ] `cd backend && npm run build &&` confirm `public/index.html` exists (single-process UI)
- [ ] GitHub Actions CI green on push/PR (`.github/workflows/ci.yml`)

## Production go-live (Railway)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full flow.

- [ ] GitHub repo connected; Railway service uses Dockerfile
- [ ] Postgres plugin linked (`DATABASE_URL`)
- [ ] `NODE_ENV=production`, `ENABLE_DEV_TOOLS=false`, `LOG_TO_FILES=false`, `JWT_SECRET` set (≥24 chars)
- [ ] Deploy succeeds; `GET /api/health` → `ok`
- [ ] `GET /api/cron/status` → `running: true`
- [ ] SPA loads on the Railway URL (Jobs page)
- [ ] One-time `npm run seed` (or import) if DB was empty
- [ ] Company **Fetch now** works; Provider Health updates
