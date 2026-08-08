import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';
import type { JobListOptions } from '../../domain/repositories/JobRepository.js';
import { requireUserId } from '../middleware/authMiddleware.js';

const POSTED_WITHIN = new Set(['today', 'yesterday', 'week', 'month']);

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Accepts repeated query params and/or comma-separated values. */
function queryStringList(value: unknown): string[] | undefined {
  const parts: string[] = [];
  const push = (raw: string) => {
    for (const piece of raw.split(',')) {
      const trimmed = piece.trim();
      if (trimmed) {
        parts.push(trimmed);
      }
    }
  };
  if (typeof value === 'string') {
    push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        push(item);
      }
    }
  }
  return parts.length > 0 ? parts : undefined;
}

export function createJobController(container: AppContainer) {
  return {
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = requireUserId(req);
        const scoreMinRaw = queryString(req.query.scoreMin);
        const scoreMin = scoreMinRaw ? Number(scoreMinRaw) : undefined;
        const limitRaw = queryString(req.query.limit);
        const limitParsed = limitRaw ? Number(limitRaw) : undefined;
        const limit =
          typeof limitParsed === 'number' && Number.isFinite(limitParsed)
            ? Math.min(Math.max(1, Math.floor(limitParsed)), 2_500)
            : undefined;
        const postedRaw = queryString(req.query.postedWithin);
        const postedWithin =
          postedRaw && POSTED_WITHIN.has(postedRaw)
            ? (postedRaw as NonNullable<JobListOptions['postedWithin']>)
            : undefined;

        const scoredRaw = queryString(req.query.scored);
        const scored =
          scoredRaw === 'true' ? true : scoredRaw === 'false' ? false : undefined;

        const sortRaw = queryString(req.query.sort);
        const sort =
          sortRaw === 'match-desc' || sortRaw === 'match-asc'
            ? sortRaw
            : sortRaw === 'latest'
              ? 'latest'
              : undefined;

        // Roles must not be comma-split (titles can contain commas) — only
        // repeated `role=` params. Company IDs may be comma-joined.
        const roles = (() => {
          const raw = req.query.role;
          if (typeof raw === 'string' && raw.trim()) {
            return [raw.trim()];
          }
          if (Array.isArray(raw)) {
            return raw
              .filter((item): item is string => typeof item === 'string')
              .map((item) => item.trim())
              .filter(Boolean);
          }
          return undefined;
        })();

        const jobs = await container.jobs.findMany({
          userId,
          scored,
          companyIds: queryStringList(req.query.companyId),
          provider: queryString(req.query.provider),
          search: queryString(req.query.search),
          roles,
          location: queryString(req.query.location),
          skills: queryString(req.query.skills),
          postedWithin,
          scoreMin: Number.isFinite(scoreMin) ? scoreMin : undefined,
          sort,
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
