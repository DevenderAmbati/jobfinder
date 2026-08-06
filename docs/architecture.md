# Architecture — Job Intelligence Platform

## Goal

Continuously monitor company career portals, detect new jobs, evaluate fit against a personal profile, and notify via Telegram — without missing relevant software engineering roles.

## Dependency direction (Clean Architecture + DDD)

```
presentation  →  application  →  domain
                      ↑
               infrastructure
```

| Layer | Responsibility | May import |
|-------|----------------|------------|
| `domain` | Entities, value objects, repository **interfaces**, domain services, ports (`JobProvider`) | Nothing outside domain/shared types |
| `application` | Use cases / orchestration | `domain`, `shared` |
| `infrastructure` | Prisma repos, ATS adapters, Telegram, Gemini, cron, in-memory queue | `domain`, `application` (composition), `shared` |
| `presentation` | HTTP controllers, routes, middleware | `application`, `shared` |
| `shared` | Config, utils, cross-cutting types | Nothing from other layers |

**Rule:** Domain never imports Express, Prisma, Axios, Playwright, Gemini SDK, or Telegram.

## Folder map

```
backend/src/
  domain/
    entities/
    value-objects/
    repositories/       # interfaces only
    services/           # pure domain logic (dedup hash, rule evaluation)
    ports/              # JobProvider, Matcher, Notifier, Queue
  application/
    usecases/
  infrastructure/
    database/           # Prisma client + repository implementations
    providers/          # ATS adapters (Greenhouse, Lever, Workday, …)
    playwright/         # shared Chromium session helper
    telegram/
    gemini/
    scheduler/          # node-cron — enqueue only
    queue/              # in-memory async queue (V1)
    di/                 # composition root
  presentation/
    controllers/
    routes/
    middleware/
  shared/
    types/
    utils/
    config/
    errors/
```

## Core ports

- **`JobProvider`** — `fetchJobs(company): Promise<Job[]>`
- **`JobRepository` / `CompanyRepository` / …** — persistence contracts
- **`JobMatcher`** — score a job (Gemini or keyword)
- **`Notifier`** — send notification (Telegram)
- **`JobQueue`** — enqueue / process pipeline work items

Adapters live under `infrastructure/` and are wired in the DI composition root.

## Scheduler vs pipeline

The scheduler **must not** contain business logic.

1. Cron ticks → load due companies → **enqueue** `FetchCompanyJobs` work items
2. In-memory queue worker → runs **Job Pipeline** use case
3. Pipeline: fetch → normalize → dedup → persist → rules → match → notify → update provider health

Inspect live state: `GET /api/cron/status`.

## Matching strategy

```
Rule Engine → if Gemini enabled → Gemini (versioned PromptTemplate)
            → else / on Gemini failure → Keyword Matcher
            → Notification if score ≥ threshold
```

Gemini never blocks or crashes the worker.

## Provider health

Each provider run updates: `status`, `lastRun`, `lastSuccess`, `averageExecutionTime`, `failureCount`, `lastError`. Exposed via API and later Dashboard Phase 2.

## Extending with a new ATS

1. Implement `JobProvider` in `infrastructure/providers/<name>/`
2. Register in provider registry
3. Insert `Company` rows with that provider key
4. Add integration tests (fetch → notify path)

No changes to scheduler, rules, or notification use cases.
