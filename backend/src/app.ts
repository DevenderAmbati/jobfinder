import 'dotenv/config';
import type { Server } from 'node:http';
import express from 'express';
import { createApiRouter } from './presentation/routes/index.js';
import { errorHandler } from './presentation/middleware/errorHandler.js';
import {
  apiNotFoundHandler,
  fallbackNotFoundHandler,
} from './presentation/middleware/notFoundHandler.js';
import {
  applySecurityMiddleware,
  createApiRateLimiter,
  createFetchRateLimiter,
} from './presentation/middleware/security.js';
import {
  mountFrontendStatic,
  resolveFrontendPublicDir,
} from './presentation/staticFrontend.js';
import { loadConfig } from './shared/config/env.js';
import { configureLogger, logger } from './shared/utils/logger.js';
import { registerProcessHandlers } from './shared/process/registerProcessHandlers.js';
import { createContainer } from './infrastructure/di/container.js';
import { initFirebaseAdmin } from './infrastructure/firebase/admin.js';
import { ensureBootstrapOwner } from './infrastructure/firebase/ensureBootstrapOwner.js';
import {
  closeAllPlaywrightBrowsers,
  configurePlaywrightRuntime,
} from './infrastructure/playwright/browserSession.js';

const config = loadConfig();
configureLogger({
  level: config.logLevel,
  logToFiles: config.logToFiles,
  logDir: config.logDir,
});
configurePlaywrightRuntime({
  headless: config.playwrightHeadless,
  maxConcurrent: config.playwrightMaxConcurrent,
});
initFirebaseAdmin(config.firebaseProjectId);
const container = createContainer(config);
const app = express();

applySecurityMiddleware(app, config);
app.use((req, res, next) => {
  if (req.path !== '/api/internal/schedule-tick') {
    express.json({ limit: '1mb' })(req, res, next);
    return;
  }
  // Cloud Scheduler sometimes posts a body our JSON parser rejects with 400,
  // which skips the whole tick. A missing or unreadable body still means "run".
  express.text({ type: () => true, limit: '1mb' })(req, res, (err) => {
    if (err) {
      logger.warn('Scheduler tick body unreadable', {
        message: err instanceof Error ? err.message : String(err),
      });
      req.body = {};
      next();
      return;
    }
    const raw = typeof req.body === 'string' ? req.body.trim() : '';
    if (!raw) {
      req.body = {};
      next();
      return;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      req.body =
        parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
          ? parsed
          : {};
    } catch (parseError) {
      logger.warn('Scheduler tick body was not JSON', {
        message:
          parseError instanceof Error ? parseError.message : String(parseError),
        bytes: raw.length,
      });
      req.body = {};
    }
    next();
  });
});
app.use('/api', createApiRateLimiter(config));
app.use(
  '/api',
  createApiRouter(container, {
    fetchRateLimiter: createFetchRateLimiter(config),
  }),
);
app.use('/api', apiNotFoundHandler);

// Production UI is Firebase Hosting; local/dev may still serve a bundled SPA.
const serveStatic =
  config.nodeEnv !== 'production' || process.env.SERVE_STATIC_FRONTEND === 'true';
const publicDir = serveStatic ? resolveFrontendPublicDir() : null;
if (publicDir) {
  mountFrontendStatic(app, publicDir);
} else {
  app.use(fallbackNotFoundHandler);
}

app.use(errorHandler);

export function startServer(): Server {
  container.startWorkers();
  const server = app.listen(config.port, '0.0.0.0', () => {
    logger.info('Server listening', {
      port: config.port,
      host: '0.0.0.0',
      env: config.nodeEnv,
      logLevel: config.logLevel,
      logToFiles: config.logToFiles,
      logDir: config.logDir,
      ui: publicDir ?? 'firebase-hosting',
      firestore: config.firebaseProjectId,
    });
    void ensureBootstrapOwner(container.users).catch((error: unknown) => {
      logger.error('Bootstrap owner failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    });

    if (
      config.telegramWebhookMode &&
      config.telegramBotToken &&
      process.env.TELEGRAM_WEBHOOK_URL?.trim()
    ) {
      void container.telegramLink
        .setWebhook(
          process.env.TELEGRAM_WEBHOOK_URL.trim(),
          config.telegramWebhookSecret || undefined,
        )
        .catch((error: unknown) => {
          logger.error('Telegram setWebhook failed', {
            message: error instanceof Error ? error.message : String(error),
          });
        });
    }
  });

  registerProcessHandlers({
    server,
    target: {
      stopWorkers: () => container.stopWorkers(),
      disconnect: async () => {
        await closeAllPlaywrightBrowsers();
      },
    },
  });

  return server;
}

export { app, container, config };
