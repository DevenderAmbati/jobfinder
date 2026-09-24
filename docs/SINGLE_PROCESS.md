# Single-process notes

Historically Jobfinder ran Express + SPA + cron + Playwright in one process on Railway.

**Current model:** SPA on Firebase Hosting; API/worker (Express + Playwright + in-memory queue) on **one** Cloud Run service with `min-instances=1` so Telegram webhooks and the in-memory fetch queue stay consistent.

- Production cron: Cloud Scheduler → `POST /api/internal/schedule-tick`
- Local cron: `ENABLE_IN_PROCESS_CRON=true` (default outside production)
- Seed once: `npm run seed:firestore`
