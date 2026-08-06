# SQLite → PostgreSQL (Step 1)

## Status

**Complete on this machine.** Data was exported from SQLite and imported into PostgreSQL with matching counts (55 companies, 14,555 jobs, etc.).

## What we did

1. Exported live SQLite data to `backend/prisma/data-export.json` (gitignored).
2. Copied `dev.db` → `backend/prisma/backups/dev.sqlite.backup` (gitignored).
3. Switched `schema.prisma` provider to `postgresql`.
4. Replaced SQLite migration history with `20260806120000_init_postgresql`.
5. Added `prisma/import-data.ts` to restore rows (IDs + relations preserved).
6. Added root `docker-compose.yml` for local Postgres 16 (preferred when Docker is available).
7. Added embedded Postgres fallback (`npm run db:bootstrap` / `npm run db:local-pg`) because Docker/winget installs were unavailable here.

## Daily local use (embedded Postgres)

```bash
cd backend
npm run db:local-pg   # keep this terminal open
# other terminal:
npm run dev
```

`DATABASE_URL` in `backend/.env`:

```
postgresql://jobfinder:jobfinder@127.0.0.1:5432/jobfinder?schema=public
```

## Preferred: Docker

```bash
# from repo root
docker compose up -d
cd backend
npm run migrate
# import only needed once if DB is empty:
npm run db:import
npm run dev
```

## One-shot bootstrap (empty machine)

```bash
cd backend
npm run db:bootstrap   # init UTF-8 cluster → migrate → import → stop
npm run db:local-pg    # start again for app use
```

## Counts at export / import

| Table | Rows |
|-------|------|
| companies | 55 |
| jobs | 14555 |
| rules | 1 |
| resumes | 1 |
| applications | 0 |
| notificationLogs | 46 |
| providerLogs | 74 |
| providerHealth | 14 |
| promptTemplates | 1 |

`npm run seed` is **not** required after a successful import.

## Safety

- Original SQLite file remains at `backend/prisma/dev.db` until you delete it.
- Import uses `skipDuplicates` and is safe to re-run.
- Embedded data lives in `backend/.pgdata-utf8/` (gitignored). Use UTF-8 init (`--encoding=UTF8 --locale=C`) so emoji in resumes/jobs work on Windows.
