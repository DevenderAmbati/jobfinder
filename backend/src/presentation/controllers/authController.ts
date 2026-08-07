import type { NextFunction, Request, Response } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';
import { AppError } from '../../shared/errors/AppError.js';
import { requireUserId } from '../middleware/authMiddleware.js';

function serializeUser(user: { id: string; email: string; name: string | null }) {
  return { id: user.id, email: user.email, name: user.name };
}

export function createAuthController(container: AppContainer) {
  return {
    async register(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = req.body as Record<string, unknown>;
        const email = typeof body.email === 'string' ? body.email : '';
        const password = typeof body.password === 'string' ? body.password : '';
        const name = typeof body.name === 'string' ? body.name : undefined;
        const result = await container.auth.register({ email, password, name });
        res.status(201).json({
          data: { user: serializeUser(result.user), token: result.token },
        });
      } catch (error) {
        next(error);
      }
    },

    async login(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = req.body as Record<string, unknown>;
        const email = typeof body.email === 'string' ? body.email : '';
        const password = typeof body.password === 'string' ? body.password : '';
        if (!email || !password) {
          throw new AppError('VALIDATION_ERROR', 'Email and password are required', 400);
        }
        const result = await container.auth.login({ email, password });
        res.status(200).json({
          data: { user: serializeUser(result.user), token: result.token },
        });
      } catch (error) {
        next(error);
      }
    },

    async me(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = requireUserId(req);
        const user = await container.users.findById(userId);
        if (!user) {
          throw new AppError('UNAUTHORIZED', 'Account not found', 401);
        }
        res.status(200).json({ data: serializeUser(user) });
      } catch (error) {
        next(error);
      }
    },
  };
}
