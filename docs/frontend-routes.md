# Frontend Routes (Phased)

App: Vite + React + TypeScript + Tailwind + React Router + TanStack Query.

Base: `/`

| Phase | Route | Page | Part |
|-------|-------|------|------|
| Stub | `/` | Redirect to `/jobs` | 0 |
| 1 | `/jobs` | Jobs list | UI Phase 1 |
| 1 | `/companies` | Company management | UI Phase 1 |
| 2 | `/providers/health` | Provider health | UI Phase 2 |
| 2 | `/logs` | Provider + notification logs | UI Phase 2 |
| 3 | `/rules` | Rule engine config | UI Phase 3 |
| 3 | `/applications` | Application tracker | UI Phase 3 |
| 4 | `/settings` | Resume, prompts, thresholds | UI Phase 4 |
| 4 | `/analytics` | Summary widgets | UI Phase 4 |
| Dev | `/dev` | Developer tools | Part 4 |

Part 8 delivers Settings and Analytics pages (no placeholders).
