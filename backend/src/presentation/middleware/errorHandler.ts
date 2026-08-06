import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../../shared/errors/AppError.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * Centralized Express error middleware. Must be registered last.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('Application error', {
        code: err.code,
        message: err.message,
        path: req.path,
        method: req.method,
      });
    }
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
      },
    });
    return;
  }

  // express.json() parse failures
  if (
    err instanceof SyntaxError &&
    'status' in err &&
    (err as { status?: number }).status === 400
  ) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid JSON body',
      },
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unknown error';
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error('Unhandled request error', {
    message,
    path: req.path,
    method: req.method,
    stack,
  });

  const expose =
    process.env.NODE_ENV !== 'production' ? message : 'Internal server error';

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: expose,
    },
  });
};
