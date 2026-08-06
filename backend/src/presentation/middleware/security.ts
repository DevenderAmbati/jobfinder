import type { Express, RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import type { AppConfig } from '../../shared/config/env.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * Security + observability middleware for the HTTP edge.
 * Env validation remains in loadConfig() — call that before createApp wiring.
 */
export function applySecurityMiddleware(
  app: Express,
  config: AppConfig,
): void {
  // Railway / reverse proxies — required for correct client IPs in rate limits.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      // Personal SPA uses Google Fonts + hashed Vite assets; full CSP is a follow-up.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(compression());

  app.use(
    cors({
      origin: resolveCorsOrigin(config),
      credentials: false,
    }),
  );

  app.use(createRequestLogger(config));
}

export function createApiRateLimiter(config: AppConfig): RequestHandler {
  return rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests — try again later',
      },
    },
  });
}

/** Stricter cap for expensive provider fetches. */
export function createFetchRateLimiter(config: AppConfig): RequestHandler {
  return rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitFetchMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many fetch requests — try again later',
      },
    },
  });
}

function resolveCorsOrigin(
  config: AppConfig,
): boolean | string | string[] {
  const raw = config.corsOrigin.trim();
  if (!raw) {
    // Same-origin SPA in production; open during local Vite + API split.
    return config.nodeEnv === 'production' ? false : true;
  }
  if (raw === '*') return true;
  const list = raw.split(',').map((v) => v.trim()).filter(Boolean);
  return list.length === 1 ? list[0]! : list;
}

function createRequestLogger(config: AppConfig): RequestHandler {
  return (req, res, next) => {
    if (!config.requestLogging) {
      next();
      return;
    }
    // Skip noisy probes in production logs if desired — still log failures.
    const started = Date.now();
    res.on('finish', () => {
      const isHealth =
        req.path === '/health' || req.path === '/api/health';
      if (
        config.nodeEnv === 'production' &&
        isHealth &&
        res.statusCode < 400
      ) {
        return;
      }
      logger.info('HTTP request', {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - started,
        ip: req.ip,
      });
    });
    next();
  };
}
