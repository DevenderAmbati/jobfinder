# Deployment (Firebase + Cloud Run + GitHub Actions)

Postgres / Railway / Prisma are retired. Deploy path:

1. **Firebase project** — Auth (email/password), Firestore, Storage, Hosting  
2. **Cloud Run** — API image ([Dockerfile](../Dockerfile)) with **`--min-instances 0`**  
3. **GitHub Actions** — daily full scrape ([`daily-fetch.yml`](../.github/workflows/daily-fetch.yml))  
4. **Hosting** — Vite build + rewrite `/api/**` → Cloud Run  

Full steps: [FIREBASE.md](./FIREBASE.md)

**Do not** leave an always-on Cloud Run worker or an unused App Engine app running — those drove the previous bill. Pause Cloud Scheduler if Actions owns the cron.

## Health

`GET /api/health` — checks Firestore connectivity (`database: "firestore"`).

## Graceful shutdown

SIGTERM: stop HTTP → stop queue/cron/telegram → close Playwright browsers.
