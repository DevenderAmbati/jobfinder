import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';
import { AppError } from '../../shared/errors/AppError.js';
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

    async webhook(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const secret = container.config.telegramWebhookSecret;
        if (secret) {
          const header = req.headers['x-telegram-bot-api-secret-token'];
          if (header !== secret) {
            throw new AppError('UNAUTHORIZED', 'Invalid Telegram webhook secret', 401);
          }
        }
        await container.telegramLink.handleUpdate(
          req.body as {
            update_id: number;
            message?: {
              text?: string;
              chat?: { id: number | string };
            };
          },
        );
        res.status(200).json({ ok: true });
      } catch (error) {
        next(error);
      }
    },
  };
}
