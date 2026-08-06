# Environment variables

All runtime configuration is loaded by `backend/src/shared/config/env.ts` via `loadConfig()`. Secrets never appear in API responses.

Copy `.env.example` → `backend/.env`.

## Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | HTTP listen port (1–65535), default `3001` |
| `NODE_ENV` | `development` \| `production` \| … |

## Logging

| Variable | Description |
|----------|-------------|
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error`. Default: `debug` (dev), `info` (production) |
| `LOG_TO_FILES` | `true`/`false`. Default: `true` outside production. Writes `error.log`, `cron.log`, `provider.log`, `telegram.log` under `LOG_DIR`. On Railway use stdout (`false`) unless a volume is mounted. |
| `LOG_DIR` | Log directory (default `logs`) |

Channels: `logger` (app), `logger.cron`, `logger.provider`, `logger.telegram`. Errors always also append to `error.log` when file logging is on. Timestamps are ISO-8601.

## Scheduler

| Variable | Description |
|----------|-------------|
| `CRON_FREQUENCY` | Preferred default cron (scheduler + new companies) |
| `CRON_DEFAULT_EXPRESSION` | Alias if `CRON_FREQUENCY` is unset |

## Matching / AI

| Variable | Description |
|----------|-------------|
| `GEMINI_ENABLED` | `true` to use Gemini matcher |
| `GEMINI_API_KEY` | Required when Gemini is enabled |
| `MATCH_SCORE_THRESHOLD` | Fallback 0–100 when no active rule |
| `ESCALATION_FIT_FLOOR` | Min rule fit before LLM call |
| `MAX_ESCALATIONS_PER_RUN` | Cap LLM calls per pipeline run |
| `MAX_NOTIFICATIONS_PER_RUN` | Cap Telegram sends per run |

## Telegram

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token |
| `TELEGRAM_CHAT_ID` | Destination chat |

## Playwright

| Variable | Description |
|----------|-------------|
| `PLAYWRIGHT_HEADLESS` | Default `true` |
| `PLAYWRIGHT_MAX_CONCURRENT` | Max Chromium processes (default `2`) |
| `PLAYWRIGHT_NO_SANDBOX` | `true` adds `--no-sandbox` (also auto on Linux) |

Browsers are launched via `withChromiumBrowser()` — always closed in `finally`, concurrency-capped, and force-closed on graceful shutdown.

## Security

| Variable | Description |
|----------|-------------|
| `CORS_ORIGIN` | Empty (same-origin in prod / open in dev), `*`, or comma-separated origins |
| `RATE_LIMIT_WINDOW_MS` | Window size (default 900000 = 15m) |
| `RATE_LIMIT_MAX` | Max API requests per IP per window (default 300) |
| `RATE_LIMIT_FETCH_MAX` | Stricter cap for company fetch + dev tools (default 30) |
| `REQUEST_LOGGING` | Log each HTTP request (default true; successful `/health` skipped in production) |

**Auth:** This personal dashboard has **no login**. Anyone with the public URL can call the API. Keep `ENABLE_DEV_TOOLS=false` in production and treat the Railway URL as private (or put Basic Auth / Cloudflare Access in front later).

Env validation is enforced at boot by `loadConfig()` — invalid values fail fast.

## Prisma pool

| Variable | Description |
|----------|-------------|
| `PRISMA_CONNECTION_LIMIT` | Added to `DATABASE_URL` if missing (default `5`) |
| `PRISMA_POOL_TIMEOUT` | Seconds (default `10`) |

Prefer Railway’s pooled URL when available; keep limits low on small instances.

## Dev tools

| Variable | Description |
|----------|-------------|
| `ENABLE_DEV_TOOLS` | In production must be `true` to expose `/api/dev/*`. On by default outside production. |

## Frontend (dev only)

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Documented for Vite; production UI uses same-origin `/api` |

Dashboard **Settings** shows non-secret runtime flags (`logLevel`, cron, Gemini/Telegram configured, etc.).
