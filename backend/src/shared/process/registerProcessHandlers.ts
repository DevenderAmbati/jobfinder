import type { Server } from 'node:http';
import { logger } from '../utils/logger.js';

export interface ShutdownTarget {
  stopWorkers: () => void;
  disconnect: () => Promise<void>;
}

/**
 * Process-level safety nets + graceful HTTP shutdown.
 */
export function registerProcessHandlers(options: {
  server: Server;
  target: ShutdownTarget;
  shutdownTimeoutMs?: number;
}): void {
  const { server, target } = options;
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? 15_000;
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Graceful shutdown started', { signal });

    const forceTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, shutdownTimeoutMs);
    forceTimer.unref();

    server.close((closeError) => {
      if (closeError) {
        logger.error('HTTP server close failed', {
          error: closeError.message,
        });
      }

      try {
        target.stopWorkers();
      } catch (error) {
        logger.error('Worker stop failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      void target
        .disconnect()
        .catch((error: unknown) => {
          logger.error('Disconnect failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          logger.info('Graceful shutdown complete');
          process.exit(closeError ? 1 : 0);
        });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      reason:
        reason instanceof Error
          ? { message: reason.message, stack: reason.stack }
          : String(reason),
    });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      message: error.message,
      stack: error.stack,
    });
    shutdown('uncaughtException');
  });
}
