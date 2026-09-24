import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';
import { requireUserId } from '../middleware/authMiddleware.js';

export function createAnalyticsController(container: AppContainer) {
  return {
    async summary(
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> {
      try {
        const userId = requireUserId(req);
        const rule = await container.rules.findByUserId(userId);
        const minScore =
          rule?.minMatchScore ?? container.config.matchScoreThreshold;
        const data = await container.analytics.summary(userId, minScore);
        res.status(200).json({ data });
      } catch (error) {
        next(error);
      }
    },

    async applications(
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> {
      try {
        const userId = requireUserId(req);
        const daysRaw =
          typeof req.query.days === 'string' ? Number(req.query.days) : 14;
        const days = Number.isFinite(daysRaw)
          ? Math.min(90, Math.max(7, Math.floor(daysRaw)))
          : 14;
        const weeksRaw =
          typeof req.query.weeks === 'string' ? Number(req.query.weeks) : 8;
        const weeks = Number.isFinite(weeksRaw)
          ? Math.min(26, Math.max(4, Math.floor(weeksRaw)))
          : 8;

        const data = await container.analytics.applications(userId, days, weeks);
        res.status(200).json({ data });
      } catch (error) {
        next(error);
      }
    },
  };
}
