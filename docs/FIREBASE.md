# Firebase deployment

Jobfinder uses Firebase Auth, Firestore, Storage, and Hosting, with a Playwright-capable Cloud Run service for the **API only** (scale-to-zero). The **daily full scrape** runs on [GitHub Actions](../.github/workflows/daily-fetch.yml) so you are not billed for an always-on Cloud Run worker.

## One-time project setup

1. Create a Firebase project (Blaze plan required for Cloud Run + Hosting rewrites).
2. Enable **Email/Password** under Authentication.
3. Create a Firestore database (production mode) and a default Storage bucket.
4. Update [`.firebaserc`](../.firebaserc) `default` project id.
5. Deploy rules and indexes:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

6. Create a service account with Cloud Datastore User + Storage Admin (or use Cloud Run default ADC).
7. For local Admin SDK: set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account JSON, or set `FIREBASE_PROJECT_ID`.

## Cloud Run (API only — scale to zero)

Build and deploy the Playwright image for interactive API / Hosting rewrites. **Do not keep a warm instance** — scrapes run in GitHub Actions.

```bash
gcloud run deploy jobfinder-api \
  --source . \
  --region asia-south1 \
  --memory 2Gi \
  --timeout 3600 \
  --min-instances 0 \
  --set-env-vars "NODE_ENV=production,FIREBASE_PROJECT_ID=YOUR_PROJECT,LOG_TO_FILES=false,PLAYWRIGHT_HEADLESS=true,PLAYWRIGHT_NO_SANDBOX=true,ENABLE_IN_PROCESS_CRON=false,TELEGRAM_WEBHOOK_MODE=false" \
  --set-secrets "GEMINI_API_KEY=gemini-api-key:latest,TELEGRAM_BOT_TOKEN=telegram-bot-token:latest"
```

Point Hosting rewrites in [`firebase.json`](../firebase.json) at this service (`serviceId` / `region`). Expect a cold start on the first `/api/**` request after idle.

To update an existing service:

```bash
gcloud run services update jobfinder-api \
  --region asia-south1 \
  --min-instances 0
```

## Daily scrape (GitHub Actions)

Scrapes run on **GitHub Actions** ([`daily-fetch.yml`](../.github/workflows/daily-fetch.yml)):

- **Primary trigger:** [cron-job.org → workflow_dispatch](./CRON_JOB_ORG.md) at **07:00 IST** (reliable; free)
- **Backup:** GitHub `schedule: '30 1 * * *'` (can skip under load)
- **Optional GCP backup:** [`scripts/setup-gcp-github-dispatch-cron.ps1`](../scripts/setup-gcp-github-dispatch-cron.ps1)
- Runs `npx tsx scripts/fetch-all.ts` (all enabled companies + one auto-retry of failures)
- Prints **daily analytics**, writes `backend/logs/fetch-analytics.*`, Telegram-notifies linked users
- Manual: Actions → Daily fetch → Run workflow (optional “retry failed only”)

### Required GitHub secrets

| Secret | Purpose |
|--------|---------|
| `FIREBASE_PROJECT_ID` | GCP / Firebase project id |
| `FIREBASE_SERVICE_ACCOUNT` | Full JSON key for a service account with Firestore (+ Storage if used) |
| `TELEGRAM_BOT_TOKEN` | Bot API token for outbound job alerts |
| `TELEGRAM_CHAT_ID` | Optional fallback chat id |
| `GEMINI_ENABLED` | `true` / `false` |
| `GEMINI_API_KEY` | Required when Gemini enabled |

Workflow env forces `TELEGRAM_WEBHOOK_MODE=false` and `ENABLE_IN_PROCESS_CRON=false` (send-only batch; no webhook server / in-process cron).

See [ENV.md](./ENV.md) for the full variable list.

## Cost cut checklist (do this in GCP)

Complete these once so idle compute stops billing:

1. **Cloud Run** — set `--min-instances 0` on `jobfinder-api` (command above).
2. **Cloud Scheduler** — pause or delete `jobfinder-schedule-tick` (and any other tick jobs) so you do **not** double-scrape with Actions:

   ```bash
   gcloud scheduler jobs pause jobfinder-schedule-tick --location=asia-south1
   # or: gcloud scheduler jobs delete jobfinder-schedule-tick --location=asia-south1
   ```

   (Use the location where the job was created; check with `gcloud scheduler jobs list`.)

3. **App Engine** — this repo does **not** deploy App Engine. If Billing shows App Engine charges, disable/delete leftover services in the GCP console (App Engine → Versions / Settings → Disable application) so you are not billed for unused instances.

4. Confirm **Artifact Registry** only keeps images you need; old tags are cheap but can be cleaned up.

## Cloud Scheduler (optional / legacy)

Prefer GitHub Actions. If you temporarily need a Scheduler tick instead:

```bash
gcloud scheduler jobs create http jobfinder-schedule-tick \
  --schedule="0 1 * * *" \
  --uri="https://YOUR_CLOUD_RUN_URL/api/internal/schedule-tick" \
  --http-method=POST \
  --oidc-service-account-email=YOUR_SCHEDULER_SA@YOUR_PROJECT.iam.gserviceaccount.com
```

Body should force a full run and wait, e.g. `{"force":true,"wait":true}`. Remember Cloud Run’s **3600s** timeout can truncate a full ~147-company Playwright pass — Actions (up to 6h) is safer for “no missed companies.”

## Seed

```bash
cd backend
npm run seed:firestore
```

## Frontend

```bash
# Set VITE_FIREBASE_* in frontend/.env.production (see .env.example)
cd frontend && npm run build
firebase deploy --only hosting
```
