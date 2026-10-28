# syntax=docker/dockerfile:1
# Cloud Run image: Express API + Playwright Chromium (Firestore via ADC).
# Frontend is served by Firebase Hosting; this image is API/worker only.

FROM mcr.microsoft.com/playwright:v1.62.1-jammy AS build

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./backend/
WORKDIR /app/backend
RUN npm ci
WORKDIR /app

COPY backend ./backend
WORKDIR /app/backend
RUN npm run build:server
WORKDIR /app

FROM mcr.microsoft.com/playwright:v1.62.1-jammy AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    LOG_TO_FILES=false \
    PLAYWRIGHT_HEADLESS=true \
    PLAYWRIGHT_NO_SANDBOX=true \
    ENABLE_DEV_TOOLS=false \
    ENABLE_IN_PROCESS_CRON=false \
    TELEGRAM_WEBHOOK_MODE=false

COPY --from=build /app/backend/package.json /app/backend/package-lock.json ./
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist

RUN npm prune --omit=dev

EXPOSE 3001

CMD ["node", "dist/server.js"]
