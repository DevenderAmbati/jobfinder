import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';
import type { JobListOptions } from '../../domain/repositories/JobRepository.js';

const POSTED_WITHIN = new Set(['today', 'yesterday', 'week', 'month']);

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function createJobController(container: AppContainer) {
  return {
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const scoreMinRaw = queryString(req.query.scoreMin);
        const scoreMin = scoreMinRaw ? Number(scoreMinRaw) : undefined;
        const limitRaw = queryString(req.query.limit);
        const limit = limitRaw ? Number(limitRaw) : undefined;
        const postedRaw = queryString(req.query.postedWithin);
        const postedWithin =
          postedRaw && POSTED_WITHIN.has(postedRaw)
            ? (postedRaw as NonNullable<JobListOptions['postedWithin']>)
            : undefined;

        const scoredRaw = queryString(req.query.scored);
        const scored =
          scoredRaw === 'true' ? true : scoredRaw === 'false' ? false : undefined;

        const jobs = await container.jobs.findMany({
          scored,
          companyId: queryString(req.query.companyId),
          provider: queryString(req.query.provider),
          search: queryString(req.query.search),
          role: queryString(req.query.role),
          location: queryString(req.query.location),
          skills: queryString(req.query.skills),
          postedWithin,
          scoreMin: Number.isFinite(scoreMin) ? scoreMin : undefined,
          limit: Number.isFinite(limit) ? limit : undefined,
        });
        res.status(200).json({ data: jobs });
      } catch (error) {
        next(error);
      }
    },

    async facets(
      _req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> {
      try {
        const data = await container.jobs.findFacets();
        res.status(200).json({ data });
      } catch (error) {
        next(error);
      }
    },
  };
}
