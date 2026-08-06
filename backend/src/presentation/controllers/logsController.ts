import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';

export function createLogsController(container: AppContainer) {
  return {
    async listProviderLogs(
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> {
      try {
        const limit =
          typeof req.query.limit === 'string'
            ? Number(req.query.limit)
            : undefined;
        const logs = await container.logs.listProviderLogs(
          Number.isFinite(limit) ? limit : 100,
        );
        res.status(200).json({ data: logs });
      } catch (error) {
        next(error);
      }
    },

    async listNotificationLogs(
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> {
      try {
        const limit =
          typeof req.query.limit === 'string'
            ? Number(req.query.limit)
            : undefined;
        const logs = await container.logs.listNotificationLogs(
          Number.isFinite(limit) ? limit : 100,
        );
        res.status(200).json({ data: logs });
      } catch (error) {
        next(error);
      }
    },
  };
}
