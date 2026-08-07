import type { RequestHandler } from 'express';
import type { AppConfig } from '../../shared/config/env.js';
import { AppError } from '../../shared/errors/AppError.js';
import type { AuthedRequest } from './authMiddleware.js';

/** Only this account may call /api/dev/* (in addition to ENABLE_DEV_TOOLS). */
export const DEV_TOOLS_EMAIL = 'devenderambati888@gmail.com';

/**
 * Blocks /api/dev/* unless dev tools are enabled and the signed-in user is allowed.
 */
export function createDevToolsGuard(config: AppConfig): RequestHandler {
  return (req, _res, next) => {
    if (!config.enableDevTools) {
      next(
        new AppError(
          'DEV_TOOLS_DISABLED',
          'Developer tools are disabled in this environment',
          403,
        ),
      );
      return;
    }

    const email = (req as AuthedRequest).userEmail?.trim().toLowerCase();
    if (email !== DEV_TOOLS_EMAIL) {
      next(
        new AppError(
          'FORBIDDEN',
          'Developer tools are not available for this account',
          403,
        ),
      );
      return;
    }

    next();
  };
}
