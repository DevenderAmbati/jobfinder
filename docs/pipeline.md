# Job Pipeline Design

## Sequence

```mermaid
sequenceDiagram
  participant Cron as Scheduler
  participant Q as InMemoryJobQueue
  participant UC as JobPipelineUseCase
  participant P as JobProvider
  participant DB as Repositories
  participant R as RuleEngine
  participant M as JobMatcher
  participant N as Notifier
  participant H as ProviderHealth

  Cron->>Q: enqueue FetchCompanyJobs(companyId)
  Q->>UC: process(workItem)
  UC->>P: fetchJobs(company)
  P-->>UC: raw jobs
  UC->>UC: normalize to domain Job
  UC->>DB: dedup by SHA256(company+title+location)
  UC->>DB: save new jobs only
  loop each new job
    UC->>R: evaluate(job, rules)
    alt passes rules
      UC->>M: match(resume, job)
      Note over M: Gemini if enabled else Keyword; Gemini failure → Keyword
      UC->>DB: store match result
      alt score >= threshold
        UC->>N: notify(job, match)
        UC->>DB: NotificationLog
      end
    end
  end
  UC->>H: update metrics
  UC->>DB: ProviderLog
```

## Work item types (V1)

| Type | Payload | Handler |
|------|---------|---------|
| `FetchCompanyJobs` | `{ companyId }` | Full pipeline for one company |
| `NotifyOnly` (future) | `{ jobId }` | Re-send notification |

## In-memory queue (V1 constraints)

- Single process, FIFO
- Sequential processing (SQLite-friendly)
- On failure: log, update provider health, continue next item
- Lost on process restart (acceptable for V1; cron will re-enqueue due companies)

## Deduplication

```
hash = SHA256(normalize(company) + "|" + normalize(title) + "|" + normalize(location))
```

Ignore jobs whose hash already exists.

## Edge cases

| Case | Behavior |
|------|----------|
| Provider throws | Log, increment failureCount, do not crash worker |
| Empty job list | Success with 0 added |
| Duplicate hash | Skip insert |
| Rule fail | Skip match/notify |
| Gemini timeout/error | Log, keyword fallback, continue |
| Gemini disabled | Keyword matcher only |
| Notify already sent | Skip (idempotent via NotificationLog) |
| Telegram failure | Log; job + match already persisted |
