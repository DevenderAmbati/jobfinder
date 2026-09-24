# Environment variables

Copy [`.env.example`](../.env.example) to `backend/.env`. Never commit secrets.

## Core

| Variable | Notes |
|----------|--------|
| `FIREBASE_PROJECT_ID` | Firebase / GCP project id (required in production) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local path to service-account JSON (Cloud Run uses ADC) |
| `PORT` | Listen port (default `3001`; Cloud Run injects `PORT`) |
| `NODE_ENV` | `development` / `production` |

## Scheduler

| Variable | Notes |
|----------|--------|
| `CRON_FREQUENCY` | Default company cron expression |
| `ENABLE_IN_PROCESS_CRON` | `true` locally; `false` in production (use Cloud Scheduler) |
| `INTERNAL_SCHEDULER_SECRET` | Optional shared secret for `POST /api/internal/schedule-tick` |

## Telegram

| Variable | Notes |
|----------|--------|
| `TELEGRAM_BOT_TOKEN` | Bot API token |
| `TELEGRAM_CHAT_ID` | Optional fallback for Dev Tools |
| `TELEGRAM_WEBHOOK_MODE` | Production default `true`; local default `false` (long-poll) |
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

## Frontend (`frontend/.env.local`)

| Variable | Notes |
|----------|--------|
| `VITE_FIREBASE_API_KEY` | Web app config |
| `VITE_FIREBASE_AUTH_DOMAIN` | |
| `VITE_FIREBASE_PROJECT_ID` | |
| `VITE_FIREBASE_STORAGE_BUCKET` | |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | |
| `VITE_FIREBASE_APP_ID` | |
