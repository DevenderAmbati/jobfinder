# Deployment (Firebase + Cloud Run)

Postgres / Railway / Prisma are retired. Deploy path:

1. **Firebase project** — Auth (email/password), Firestore, Storage, Hosting  
2. **Cloud Run** — Playwright API/worker image ([Dockerfile](../Dockerfile))  
3. **Cloud Scheduler** — `POST /api/internal/schedule-tick`  
4. **Hosting** — Vite build + rewrite `/api/**` → Cloud Run  

Full steps: [FIREBASE.md](./FIREBASE.md)

## Health

`GET /api/health` — checks Firestore connectivity (`database: "firestore"`).

## Graceful shutdown

SIGTERM: stop HTTP → stop queue/cron/telegram → close Playwright browsers.
