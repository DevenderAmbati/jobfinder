# syntax=docker/dockerfile:1
# Single-process Jobfinder image: Express + React build + Playwright Chromium + Prisma.
# Base image ships Chromium matching the Playwright npm version.

FROM mcr.microsoft.com/playwright:v1.62.1-jammy AS build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./frontend/
COPY backend/package.json backend/package-lock.json ./backend/
# Schema must exist before backend npm ci (postinstall runs `prisma generate`)
COPY backend/prisma ./backend/prisma

RUN npm ci --prefix frontend
RUN npm ci --prefix backend

COPY frontend ./frontend
COPY backend ./backend

# Vite build → backend/public, then compile the API
RUN npm run build --prefix backend

FROM mcr.microsoft.com/playwright:v1.62.1-jammy AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    LOG_TO_FILES=false \
    PLAYWRIGHT_HEADLESS=true \
    PLAYWRIGHT_NO_SANDBOX=true \
    ENABLE_DEV_TOOLS=false

COPY --from=build /app/backend/package.json /app/backend/package-lock.json ./
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/prisma ./prisma
COPY --from=build /app/backend/public ./public

# Drop local-only tooling from the runtime image
RUN npm prune --omit=dev

EXPOSE 3001

# Railway injects PORT + DATABASE_URL. Migrate before listen; do not seed here.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
