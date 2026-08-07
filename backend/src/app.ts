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
import { prisma } from './infrastructure/database/prismaClient.js';
import { ensureBootstrapOwner } from './infrastructure/database/ensureBootstrapOwner.js';
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
const container = createContainer(config);
const app = express();

applySecurityMiddleware(app, config);
app.use(express.json({ limit: '1mb' }));
app.use('/api', createApiRateLimiter(config));
app.use(
  '/api',
  createApiRouter(container, {
    fetchRateLimiter: createFetchRateLimiter(config),
  }),
);
app.use('/api', apiNotFoundHandler);

const publicDir = resolveFrontendPublicDir();
if (publicDir) {
  mountFrontendStatic(app, publicDir);
} else {
  app.use(fallbackNotFoundHandler);
}

app.use(errorHandler);

export function startServer(): Server {
  container.startWorkers();
  // Bind all interfaces — required behind Railway/Docker (default can miss healthchecks).
  const server = app.listen(config.port, '0.0.0.0', () => {
    logger.info('Server listening', {
      port: config.port,
      host: '0.0.0.0',
      env: config.nodeEnv,
      logLevel: config.logLevel,
      logToFiles: config.logToFiles,
      logDir: config.logDir,
      ui: publicDir ?? 'not-built',
    });
    void ensureBootstrapOwner().catch((error: unknown) => {
      logger.error('Bootstrap owner failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  });

  registerProcessHandlers({
    server,
    target: {
      stopWorkers: () => container.stopWorkers(),
      disconnect: async () => {
        await closeAllPlaywrightBrowsers();
        await prisma.$disconnect();
      },
    },
  });

  return server;
}

export { app, container, config };
