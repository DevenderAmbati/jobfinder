import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';
import { AppError } from '../../shared/errors/AppError.js';

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
    async get(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const rule = await container.rules.findActive();
        res.status(200).json({ data: rule });
      } catch (error) {
        next(error);
      }
    },

    async put(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
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

        const rule = await container.rules.upsertDefault({
          name: typeof body.name === 'string' ? body.name : undefined,
          countries: parseCsv(body.countries),
          cities: parseCsv(body.cities),
          experience:
            body.experience === null
              ? null
              : typeof body.experience === 'string'
                ? body.experience
                : undefined,
          skills: parseCsv(body.skills),
          roles: parseCsv(body.roles),
          excludedRoles: parseCsv(body.excludedRoles),
          companies: parseCsv(body.companies),
          minMatchScore,
          enabled:
            typeof body.enabled === 'boolean' ? body.enabled : undefined,
        });

        res.status(200).json({ data: rule });
      } catch (error) {
        next(error);
      }
    },
  };
}
