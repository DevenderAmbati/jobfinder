# Jobfinder — Job Intelligence Platform

Personal always-on job monitor: ATS providers → normalize/dedup → rules → Gemini or keyword match → Telegram.

**Stack:** Express + React (single process) · Prisma · PostgreSQL · node-cron · Playwright · Telegram · Gemini

---

## Architecture

```
Internet
   │
   ▼
┌──────────────────────────────────────────┐
│  Express (one Node process)              │
│  ├── React SPA (backend/public)          │
│  ├── REST /api/*                         │
│  ├── node-cron scheduler                 │
│  ├── in-memory job queue                 │
│  ├── Playwright (browser providers)      │
│  └── Telegram / Gemini adapters          │
└───────────────┬──────────────────────────┘
                │
                ▼
           PostgreSQL
```

Clean Architecture dependency rule:

```
presentation → application → domain ← infrastructure
```

| Layer | Role |
|-------|------|
| `domain` | Entities, ports (`JobProvider`, matcher, notifier), pure services |
| `application` | Use cases (fetch pipeline, schedule tick, …) |
| `infrastructure` | Prisma, ATS adapters, cron, Playwright, Telegram, Gemini |
| `presentation` | HTTP routes, middleware, static SPA |

Details: [docs/architecture.md](docs/architecture.md) · Pipeline: [docs/pipeline.md](docs/pipeline.md)

---

## Monorepo & scripts

| Path | Role |
|------|------|
| `backend/` | API, cron, providers, Prisma |
| `frontend/` | Vite React dashboard (built into `backend/public`) |
| `docs/` | Contracts, env, Railway, smoke checklist |

From **repo root** (after `npm run install:all`):

| Script | Purpose |
|--------|---------|
| `npm run dev` | API hot-reload |
| `npm run dev:web` | Vite UI (`:5173`, proxies `/api`) |
| `npm run build` | UI → `backend/public` + compile API |
| `npm run start` | Single process (needs build first) |
| `npm run start:prod` | `migrate deploy` then start |
| `npm run migrate` | Prisma migrate deploy |
| `npm run seed` | Catalog / defaults (not on every deploy) |

---

## Local setup

```bash
# 1) Postgres
docker compose up -d
# or without Docker (keep terminal open):
#   npm run db:local-pg

# 2) Env
cp .env.example backend/.env
# DATABASE_URL=postgresql://jobfinder:jobfinder@localhost:5432/jobfinder?schema=public

# 3) Install + migrate
npm run install:all
npm run migrate

# 4) Data
npm run seed
# or restore a prior SQLite export: npm run db:import
# (see docs/POSTGRES_MIGRATION.md)

# 5) Run
npm run dev          # http://localhost:3001/api/health
npm run dev:web      # http://localhost:5173
```

**Single-process preview** (UI + API on one port):

```bash
npm run build && npm run start
# http://localhost:3001
```

---

## Production deployment (Railway)

```
Git push → GitHub → Railway auto-deploy (Dockerfile)
                 → prisma migrate deploy
                 → Express + cron + Playwright
                 → Dashboard at https://<app>.up.railway.app
```

**Canonical checklist:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)  
**Railway details:** [docs/RAILWAY.md](docs/RAILWAY.md) · **Env:** [docs/ENV.md](docs/ENV.md)

1. Push this repo to GitHub  
2. Railway → New project → Deploy from GitHub  
3. Add **PostgreSQL** plugin (`DATABASE_URL`)  
4. Set env vars (`NODE_ENV=production`, Telegram/Gemini as needed)  
5. Deploy; seed **once** if the DB is empty  

Image start command:

```bash
npx prisma migrate deploy && node dist/server.js
```

**Do not** auto-seed on every deploy.

---

## Environment variables

Required: `DATABASE_URL`, `PORT` (Railway injects `PORT`), `NODE_ENV`.

Common: `LOG_LEVEL`, `CRON_FREQUENCY`, `TELEGRAM_*`, `GEMINI_*`, `PLAYWRIGHT_*`, `RATE_LIMIT_*`, `CORS_ORIGIN`.

Complete table: [docs/ENV.md](docs/ENV.md)

---

## Database migration

- Provider: **PostgreSQL** (Prisma)  
- Apply: `npm run migrate` → `prisma migrate deploy`  
- History: `backend/prisma/migrations/`  
- SQLite → Postgres cutover + data import: [docs/POSTGRES_MIGRATION.md](docs/POSTGRES_MIGRATION.md)

---

## How cron works

1. `CronScheduler` runs on `CRON_FREQUENCY` (default every 6 hours).  
2. Tick → `ScheduleTickUseCase` loads enabled companies and enqueues those **due** by their own `frequency`.  
3. In-memory queue runs `FetchCompanyJobs` **sequentially** (fetch → dedup → rules → match → notify).  
4. Inspect: `GET /api/cron/status`.  
5. Manual tick (dev tools): `POST /api/dev/scheduler/run` when `ENABLE_DEV_TOOLS` allows.

Scheduler only **enqueues** — no provider logic inside cron.

---

## How providers work

Each company has a `provider` string and `careerUrl`. The DI `ProviderRegistry` maps name → `JobProvider.fetchJobs(company)`.

Supported (wired in `container.ts`):  
`stub`, `greenhouse`, `lever`, `workday`, `microsoft`, `ashby`, `smartrecruiters`, `successfactors`, `oracle`, `eightfold`, `avature`, `sap`, `goldman`, `custom`.

Some use HTTP JSON APIs; Microsoft / Eightfold / custom may use **Playwright**.

Ops: `GET /api/providers/status` · full detail `GET /api/providers/health`  
Catalog: [docs/COMPANY_CATALOG.md](docs/COMPANY_CATALOG.md)

### Add a new provider

1. Implement `JobProvider` under `backend/src/infrastructure/providers/<name>/`.  
2. Register in `backend/src/infrastructure/di/container.ts` (`ProviderRegistry` list).  
3. Add the name to seed/UI provider lists if needed (`defaults.ts` / Companies page).  
4. Add a company with that `provider` + parseable `careerUrl`, then **Fetch now**.

Port contract: [docs/PROVIDERS.md](docs/PROVIDERS.md)

---

## Ops probes

| Path | Purpose |
|------|---------|
| `GET /api/health` | Liveness + DB |
| `GET /api/version` | App / Node version |
| `GET /api/cron/status` | Scheduler state |
| `GET /api/providers/status` | Provider rollup |

---

## CI & smoke

- GitHub Actions: `.github/workflows/ci.yml` (Prisma validate, typecheck, tests, lint, frontend + single-process builds)  
- Manual: [docs/SMOKE_CHECKLIST.md](docs/SMOKE_CHECKLIST.md)

---

## Docs index

| Doc | Topic |
|-----|--------|
| [architecture.md](docs/architecture.md) | Layers & folders |
| [pipeline.md](docs/pipeline.md) | Fetch → match → notify |
| [api-contracts.md](docs/api-contracts.md) | HTTP API |
| [ENV.md](docs/ENV.md) | Environment variables |
| [RAILWAY.md](docs/RAILWAY.md) | Railway deploy |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Final go-live flow |
| [POSTGRES_MIGRATION.md](docs/POSTGRES_MIGRATION.md) | SQLite → Postgres |
| [SINGLE_PROCESS.md](docs/SINGLE_PROCESS.md) | Express serves SPA |
| [PROVIDERS.md](docs/PROVIDERS.md) | Provider adapters |
| [COMPANY_CATALOG.md](docs/COMPANY_CATALOG.md) | Seeded companies |
| [frontend-routes.md](docs/frontend-routes.md) | UI routes |
| [project.md](project.md) | Product spec |
