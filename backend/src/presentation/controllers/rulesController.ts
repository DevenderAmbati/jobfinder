import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';
import { AppError } from '../../shared/errors/AppError.js';
import { requireUserId } from '../middleware/authMiddleware.js';

function parseCsv(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function createRulesController(container: AppContainer) {
  return {
    async get(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = requireUserId(req);
        const rule = await container.rules.findByUserId(userId);
        res.status(200).json({ data: rule });
      } catch (error) {
        next(error);
      }
    },

    async put(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = requireUserId(req);
        const body = req.body as Record<string, unknown>;
        const minMatchScore =
          typeof body.minMatchScore === 'number'
            ? body.minMatchScore
            : typeof body.minMatchScore === 'string'
              ? Number(body.minMatchScore)
              : undefined;

        if (
          minMatchScore !== undefined &&
          (!Number.isFinite(minMatchScore) ||
            minMatchScore < 0 ||
            minMatchScore > 100)
        ) {
          throw new AppError(
            'VALIDATION_ERROR',
            'minMatchScore must be between 0 and 100',
            400,
          );
        }

        const rule = await container.rules.upsertForUser(userId, {
          experience:
            body.experience === null
              ? null
              : typeof body.experience === 'string'
                ? body.experience
                : undefined,
          skills: parseCsv(body.skills),
          roles: parseCsv(body.roles),
          minMatchScore,
        });

        // Preferences changed — refresh this user's JobMatch scores.
        void container.rescoreJobs
          .execute({ userId })
          .catch(() => undefined);

        res.status(200).json({ data: rule });
      } catch (error) {
        next(error);
      }
    },
  };
}
