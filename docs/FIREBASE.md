# Firebase deployment

Jobfinder uses Firebase Auth, Firestore, Storage, and Hosting, with a Playwright-capable Cloud Run service for scraping, matching, Telegram, and query-heavy APIs.

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

## Cloud Run (API + worker)

Build and deploy the Playwright image:

```bash
gcloud run deploy jobfinder-api \
  --source . \
  --region us-central1 \
  --memory 2Gi \
  --timeout 3600 \
  --min-instances 1 \
  --set-env-vars "NODE_ENV=production,FIREBASE_PROJECT_ID=YOUR_PROJECT,LOG_TO_FILES=false,PLAYWRIGHT_HEADLESS=true,PLAYWRIGHT_NO_SANDBOX=true" \
  --set-secrets "GEMINI_API_KEY=gemini-api-key:latest,TELEGRAM_BOT_TOKEN=telegram-bot-token:latest"
```

Point Hosting rewrites in [`firebase.json`](../firebase.json) at this service (`serviceId` / `region`).

## Cloud Scheduler

Replace in-process cron with an OIDC-authenticated tick:

```bash
gcloud scheduler jobs create http jobfinder-schedule-tick \
  --schedule="0 */6 * * *" \
  --uri="https://YOUR_CLOUD_RUN_URL/api/internal/schedule-tick" \
  --http-method=POST \
  --oidc-service-account-email=YOUR_SCHEDULER_SA@YOUR_PROJECT.iam.gserviceaccount.com
```

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
