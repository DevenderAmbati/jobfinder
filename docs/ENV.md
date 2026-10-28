# Environment variables

Copy [`.env.example`](../.env.example) to `backend/.env`. Never commit secrets.

## Core

| Variable | Notes |
|----------|--------|
| `FIREBASE_PROJECT_ID` | Firebase / GCP project id (required in production) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local path to service-account JSON (Cloud Run uses ADC; Actions writes this from `FIREBASE_SERVICE_ACCOUNT`) |
| `PORT` | Listen port (default `3001`; Cloud Run injects `PORT`) |
| `NODE_ENV` | `development` / `production` |

## Scheduler

| Variable | Notes |
|----------|--------|
| `CRON_FREQUENCY` | Default company cron expression (local in-process cron) |
| `ENABLE_IN_PROCESS_CRON` | `true` locally; **`false` in production / GitHub Actions** (daily scrape is Actions `fetch-all.ts`) |
| `INTERNAL_SCHEDULER_SECRET` | Optional shared secret for `POST /api/internal/schedule-tick` (legacy Scheduler) |

## Telegram

| Variable | Notes |
|----------|--------|
| `TELEGRAM_BOT_TOKEN` | Bot API token |
| `TELEGRAM_CHAT_ID` | Optional fallback for Dev Tools / notify |
| `TELEGRAM_WEBHOOK_MODE` | **`false` for GitHub Actions** (outbound alerts only). `true` only if Cloud Run serves `/api/telegram/webhook` |
| `TELEGRAM_WEBHOOK_URL` | Public `https://…/api/telegram/webhook` |
| `TELEGRAM_WEBHOOK_SECRET` | Optional `X-Telegram-Bot-Api-Secret-Token` |

## Matching / AI

| Variable | Notes |
|----------|--------|
| `GEMINI_ENABLED` | `true` to use Gemini |
| `GEMINI_API_KEY` | Required when Gemini enabled |
| `MATCH_SCORE_THRESHOLD` | Fallback notify threshold |
| `ESCALATION_FIT_FLOOR` | Min keyword fit before LLM |
| `MAX_ESCALATIONS_PER_RUN` | Cap LLM calls per fetch |
| `MAX_NOTIFICATIONS_PER_RUN` | Cap Telegram sends per fetch |

## Playwright / security / logging

See `.env.example` for `PLAYWRIGHT_*`, `CORS_ORIGIN`, rate limits, `LOG_*`, `ENABLE_DEV_TOOLS`, `FIREBASE_STORAGE_BUCKET`.

## GitHub Actions (Daily fetch)

Set these as **repository secrets** (Settings → Secrets and variables → Actions). Used by [`.github/workflows/daily-fetch.yml`](../.github/workflows/daily-fetch.yml):

| Secret | Required | Notes |
|--------|----------|--------|
| `FIREBASE_PROJECT_ID` | yes | Same as backend env |
| `FIREBASE_SERVICE_ACCOUNT` | yes | Entire service-account JSON (workflow writes it to a temp file and sets `GOOGLE_APPLICATION_CREDENTIALS`) |
| `TELEGRAM_BOT_TOKEN` | yes (for alerts) | Outbound notify during scrape |
| `TELEGRAM_CHAT_ID` | recommended | Fallback chat |
| `GEMINI_ENABLED` | optional | Defaults off if unset / not `true` |
| `GEMINI_API_KEY` | if Gemini on | |

The workflow hard-codes `TELEGRAM_WEBHOOK_MODE=false`, `ENABLE_IN_PROCESS_CRON=false`, and Playwright headless flags. Manual run supports “retry failed only.”

Each run prints daily analytics (companies fetched / couldn't fetch / with new jobs / with no jobs found), uploads `fetch-analytics.json` as an artifact, and sends the same summary on Telegram when a bot token + chat (secret or linked user) is available.

Local equivalent:

```bash
cd backend
npx tsx scripts/fetch-all.ts              # full catalog + auto-retry failures
npx tsx scripts/fetch-all.ts --retry-failed
npx tsx scripts/fetch-all.ts --no-retry   # skip auto-retry
```

## Frontend (`frontend/.env.local`)

| Variable | Notes |
|----------|--------|
| `VITE_FIREBASE_API_KEY` | Web app config |
| `VITE_FIREBASE_AUTH_DOMAIN` | |
| `VITE_FIREBASE_PROJECT_ID` | |
| `VITE_FIREBASE_STORAGE_BUCKET` | |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | |
| `VITE_FIREBASE_APP_ID` | |
