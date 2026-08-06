import type { RequestHandler } from 'express';

/**
 * JSON 404 for unmatched `/api/*` routes. Register after the API router
 * and before SPA static fallback.
 */
export const apiNotFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route ${req.method} ${req.originalUrl}`,
    },
  });
};

/**
 * Catch-all when no SPA is mounted (API-only process).
 */
export const fallbackNotFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route ${req.method} ${req.originalUrl}`,
    },
  });
};
