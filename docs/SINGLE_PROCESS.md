# Single-process notes

Historically Jobfinder ran Express + SPA + cron + Playwright in one process on Railway.

**Current model (cost-minimal):**

- SPA on **Firebase Hosting**
- API on **Cloud Run** with **`min-instances=0`** (scale to zero when idle; cold starts OK)
- Daily full scrape on **GitHub Actions** → [`scripts/fetch-all.ts`](../backend/scripts/fetch-all.ts) (all enabled companies + one `--retry-failed` pass)
- Data on **Firestore** (+ Auth / Storage)

Do **not** keep Cloud Run warm (`min-instances=1`) unless you need always-on Telegram webhooks; outbound job alerts are sent from the Actions run with `TELEGRAM_WEBHOOK_MODE=false`.

- Production cron: GitHub Actions **Daily fetch** workflow (pause/delete Cloud Scheduler to avoid double runs)
- Local cron: `ENABLE_IN_PROCESS_CRON=true` (default outside production), or `npx tsx scripts/fetch-all.ts`
- Seed once: `npm run seed:firestore`

Ops checklist (min-instances, Scheduler, App Engine): [FIREBASE.md](./FIREBASE.md#cost-cut-checklist-do-this-in-gcp).
