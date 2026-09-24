import type { NextFunction, Request, Response } from 'express';
import type { AuthService } from '../../application/services/AuthService.js';
import { AppError } from '../../shared/errors/AppError.js';

export type AuthedRequest = Request & {
  userId: string;
  userEmail: string;
};

/**
 * Requires `Authorization: Bearer <Firebase ID token>` on protected routes.
 */
export function createAuthMiddleware(auth: AuthService) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    void (async () => {
      try {
        const header = req.headers.authorization;
        if (!header?.startsWith('Bearer ')) {
          throw new AppError('UNAUTHORIZED', 'Sign in required', 401);
        }
        const token = header.slice('Bearer '.length).trim();
        if (!token) {
          throw new AppError('UNAUTHORIZED', 'Sign in required', 401);
        }
        const payload = await auth.verify(token);
        await auth.ensureProfile(payload);
        (req as AuthedRequest).userId = payload.sub;
        (req as AuthedRequest).userEmail = payload.email;
        next();
      } catch (error) {
        next(error);
      }
    })();
  };
}

export function requireUserId(req: Request): string {
  const userId = (req as AuthedRequest).userId;
  if (!userId) {
    throw new AppError('UNAUTHORIZED', 'Sign in required', 401);
  }
  return userId;
}
