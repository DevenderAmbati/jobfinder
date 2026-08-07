import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';
import { requireUserId } from '../middleware/authMiddleware.js';

export function createTelegramController(container: AppContainer) {
  return {
    async status(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const data = await container.telegramLink.getStatus(requireUserId(req));
        res.status(200).json({ data });
      } catch (error) {
        next(error);
      }
    },

    async connect(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const data = await container.telegramLink.createConnectLink(
          requireUserId(req),
        );
        res.status(200).json({ data });
      } catch (error) {
        next(error);
      }
    },

    async disconnect(
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> {
      try {
        await container.telegramLink.disconnect(requireUserId(req));
        res.status(200).json({ data: { ok: true } });
      } catch (error) {
        next(error);
      }
    },
  };
}
