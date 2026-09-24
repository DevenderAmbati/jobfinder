# Smoke checklist (Firebase)

- [ ] Firebase project created; Auth email/password enabled
- [ ] `firebase deploy --only firestore:rules,firestore:indexes,storage`
- [ ] Service account / ADC configured (`FIREBASE_PROJECT_ID`)
- [ ] `cd backend && npm install && npm run seed:firestore && npm run dev`
- [ ] `cd frontend &&` set `VITE_FIREBASE_*` && `npm install && npm run dev`
- [ ] Register / login via Firebase Auth
- [ ] Companies list loads; trigger a fetch
- [ ] Jobs list + applications CRUD
- [ ] Resume upload (Storage)
- [ ] Telegram connect (webhook or poll)
- [ ] Cloud Run health: `GET /api/health` → `database: "firestore"`
- [ ] Cloud Scheduler tick hits `/api/internal/schedule-tick`
