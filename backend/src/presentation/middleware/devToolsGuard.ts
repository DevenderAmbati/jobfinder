import type { RequestHandler } from 'express';
import type { AppConfig } from '../../shared/config/env.js';
import { AppError } from '../../shared/errors/AppError.js';

/**
 * Blocks /api/dev/* unless dev tools are enabled.
 */
export function createDevToolsGuard(config: AppConfig): RequestHandler {
  return (_req, _res, next) => {
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
    next();
  };
}
