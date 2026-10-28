# Jobfinder — Job Intelligence Platform

Personal always-on job monitor: ATS providers → normalize/dedup → rules → Gemini or keyword match → Telegram.

**Stack:** Firebase Auth + Firestore + Storage + Hosting · Cloud Run API (scale-to-zero) · GitHub Actions daily scrape · Telegram · Gemini

---

## Architecture

```
Internet
   │
   ▼
┌────────────────────┐     ┌──────────────────────────────────┐
│ Firebase Hosting   │────▶│ Cloud Run (Express + Playwright) │
│ React SPA          │     │ REST /api/*, scrape, match, TG   │
└─────────┬──────────┘     └──────────────┬───────────────────┘
          │                               │
          ▼                               ▼
   Firebase Auth                   Firestore + Storage
   (ID tokens)                     (catalog + user data)
```

Clean Architecture dependency rule:

```
presentation → application → domain ← infrastructure
```

| Layer | Role |
|-------|------|
| `domain` | Entities, ports (`JobProvider`, matcher, notifier), pure services |
| `application` | Use cases (fetch pipeline, schedule tick, …) |
| `infrastructure` | Firestore, ATS adapters, cron/queue, Playwright, Telegram, Gemini |
| `presentation` | HTTP routes, middleware |

Details: [docs/FIREBASE.md](docs/FIREBASE.md) · [docs/architecture.md](docs/architecture.md) · Pipeline: [docs/pipeline.md](docs/pipeline.md)

---

## Monorepo & scripts

| Path | Role |
|------|------|
| `backend/` | API + scrape worker (Cloud Run) |
| `frontend/` | Vite React SPA (Firebase Hosting) |
| `firebase.json` | Hosting rewrites, Firestore/Storage rules |

### Backend

```bash
cd backend
cp ../.env.example .env   # set FIREBASE_PROJECT_ID + credentials
npm install
npm run seed:firestore
npm run dev
```

### Frontend

```bash
cd frontend
cp .env.example .env.local   # set VITE_FIREBASE_*
npm install
npm run dev                  # proxies /api → :3001
```

### Deploy

See [docs/FIREBASE.md](docs/FIREBASE.md) for Cloud Run + Hosting + GitHub Actions daily fetch (and the GCP cost-cut checklist).

```bash
# API worker
gcloud run deploy jobfinder-api --source .

# SPA
cd frontend && npm run build
firebase deploy --only hosting,firestore:rules,storage
```

---

## Auth

Email/password via **Firebase Auth**. The SPA signs in with the client SDK and sends `Authorization: Bearer <ID token>` to the API. Cloud Run verifies tokens with the Admin SDK.

---

## Env

See [`.env.example`](.env.example) and [docs/ENV.md](docs/ENV.md). Required: `FIREBASE_PROJECT_ID` (plus ADC / service account for Admin SDK).
