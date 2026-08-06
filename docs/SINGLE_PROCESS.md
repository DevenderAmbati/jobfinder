# Single-process UI (Step 2)

Production serves the Vite build from the Express process — no separate frontend host.

```
Internet → Express (:PORT)
            ├── /api/*     REST + health
            ├── static     backend/public (copied from frontend/dist)
            └── SPA        index.html for client routes
```

## Local development (unchanged)

From repo root (or `cd` into each package):

```bash
npm run dev          # API only (no UI bundle required)
npm run dev:web      # Vite on :5173, proxies /api → :3001
```

## Production / preview on one port

```bash
npm run build    # builds frontend → copies to public/ → compiles TypeScript
npm run start    # http://localhost:3001  (UI + /api)
npm run migrate  # prisma migrate deploy (run before first start / on deploy)
npm run seed     # optional catalog seed — not on every deploy
```

Server-only compile (CI typecheck path): `npm run build:server`.

`resolveFrontendPublicDir()` looks for `backend/public/index.html`, then `frontend/dist/index.html`. If neither exists, the API still starts (useful for API-only local runs).
