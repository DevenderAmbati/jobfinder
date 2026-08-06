# API Contracts (V1 draft)

Base URL: `http://localhost:3001/api`

All successful responses use JSON. Errors use a consistent envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": {}
  }
}
```

---

## Health & ops probes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness + DB ping (`ok` / `503 degraded`) |
| GET | `/version` | App version, Node version, `nodeEnv` |
| GET | `/cron/status` | Scheduler running flag, expression, next/last tick |
| GET | `/providers/status` | Lightweight provider rollup (alias summary; full detail remains `/providers/health`) |

---

## Companies

| Method | Path | Description |
|--------|------|-------------|
| GET | `/companies` | List companies |
| GET | `/companies/:id` | Get one |
| POST | `/companies` | Create (`name`, `provider`, `careerUrl`, `enabled`, `frequency`) |
| POST | `/companies/:id/fetch` | Run pipeline immediately for one company |
| PATCH | `/companies/:id` | Update (`name`, `provider`, `careerUrl`, `enabled`, `frequency`) |
| DELETE | `/companies/:id` | Soft-disable or delete |

---

## Jobs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/jobs` | List (filters: `companyId`, `provider`, `search`, `role`, `location`, `skills`, `postedWithin`, `scoreMin`, `scored`, `limit`). Always ordered by `postedDate` descending, then ingestion time; undated postings follow dated ones. `scored=true` returns only jobs that passed rule eligibility and were scored; `scored=false` returns jobs still awaiting scoring. |
| GET | `/jobs/facets` | Distinct locations / role & skill suggestions for filters |
| GET | `/jobs/:id` | Detail including match result |

---

## Rules

| Method | Path | Description |
|--------|------|-------------|
| GET | `/rules` | Active rule config |
| PUT | `/rules` | Replace/update rule config |

---

## Applications

| Method | Path | Description |
|--------|------|-------------|
| GET | `/applications` | List by status |
| POST | `/applications` | Create (jobId, status) |
| PATCH | `/applications/:id` | Transition status |

Statuses: `SAVED` \| `APPLIED` \| `INTERVIEW` \| `REJECTED` \| `OFFER` \| `JOINED`

---

## Provider health & logs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/providers/health` | All provider health metrics |
| GET | `/logs/providers` | Provider run logs |
| GET | `/logs/notifications` | Notification logs |

---

## Resume & prompts (Settings)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/resume` | Current resume metadata + text/markdown (not raw PDF by default) |
| PUT | `/resume` | Update text/markdown; optional PDF upload multipart field `pdf` |
| GET | `/prompts` | List prompt templates |
| PUT | `/prompts/:id` | Update content/enabled |
| GET | `/settings` | Runtime flags (Gemini/Telegram configured, thresholds) — no secrets |

---

## Analytics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/summary` | Dashboard counters |

---

## Dev tools (gated)

Require `ENABLE_DEV_TOOLS=true` (or non-production). Never expose in production without gate.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/dev/providers/:name/run` | Run one provider for a company |
| POST | `/dev/scheduler/run` | Trigger scheduler tick |
| POST | `/dev/telegram/test` | Send test message |
| POST | `/dev/gemini/test` | Run sample match |
| GET | `/dev/providers/:name/raw` | Raw provider response |
| POST | `/dev/jobs/rescore` | Rescore stored jobs against current rules/resume (`onlyUnscored`, `limit`). Never notifies. Required because deduplication means re-fetching skips jobs already persisted. |
| GET | `/dev/jobs/:id/normalized` | Normalized job view |
| GET | `/dev/jobs/:id/rules` | Rule evaluation dump |
| GET | `/dev/jobs/:id/ai` | AI/keyword match dump |
| POST | `/dev/db/clear` | Clear data (destructive) |
| POST | `/dev/logs/clear` | Clear logs |
| GET | `/dev/logs/export` | Export logs |

---

## Implementation note

Routes are implemented through Part 8 (settings, analytics, phased UI, and gated dev tools).
