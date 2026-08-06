import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';
import { AppError } from '../../shared/errors/AppError.js';

function readStringParam(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  return value?.[0];
}

export function createDevToolsController(container: AppContainer) {
  const dev = container.devTools;

  return {
    async runProvider(req: Request, res: Response, next: NextFunction) {
      try {
        const name = readStringParam(req.params.name);
        const companyId =
          typeof req.body?.companyId === 'string'
            ? req.body.companyId
            : undefined;
        if (!name || !companyId) {
          throw new AppError(
            'VALIDATION_ERROR',
            'provider name and body.companyId are required',
            400,
          );
        }
        const result = await dev.runProvider(name, companyId);
        res.status(200).json({ data: result });
      } catch (error) {
        next(error);
      }
    },

    async runScheduler(_req: Request, res: Response, next: NextFunction) {
      try {
        const result = await dev.runScheduler();
        res.status(200).json({ data: result });
      } catch (error) {
        next(error);
      }
    },

    async rescoreJobs(req: Request, res: Response, next: NextFunction) {
      try {
        const limitRaw: unknown = req.body?.limit;
        const limit = typeof limitRaw === 'number' ? limitRaw : undefined;
        if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
          throw new AppError(
            'VALIDATION_ERROR',
            'body.limit must be a positive integer',
            400,
          );
        }
        const result = await dev.rescoreJobs({
          onlyUnscored: req.body?.onlyUnscored === true,
          limit,
        });
        res.status(200).json({ data: result });
      } catch (error) {
        next(error);
      }
    },

    async testTelegram(_req: Request, res: Response, next: NextFunction) {
      try {
        const result = await dev.testTelegram();
        res.status(200).json({ data: result });
      } catch (error) {
        next(error);
      }
    },

    async testGemini(_req: Request, res: Response, next: NextFunction) {
      try {
        const result = await dev.testGemini();
        res.status(200).json({ data: result });
      } catch (error) {
        next(error);
      }
    },

    async rawProvider(req: Request, res: Response, next: NextFunction) {
      try {
        const name = readStringParam(req.params.name);
        const companyId =
          typeof req.query.companyId === 'string'
            ? req.query.companyId
            : undefined;
        if (!name || !companyId) {
          throw new AppError(
            'VALIDATION_ERROR',
            'provider name and query.companyId are required',
            400,
          );
        }
        const result = await dev.rawProviderResponse(name, companyId);
        res.status(200).json({ data: result });
      } catch (error) {
        next(error);
      }
    },

    async normalizedJob(req: Request, res: Response, next: NextFunction) {
      try {
        const id = readStringParam(req.params.id);
        if (!id) {
          throw new AppError('VALIDATION_ERROR', 'job id required', 400);
        }
        const result = await dev.normalizedJob(id);
        res.status(200).json({ data: result });
      } catch (error) {
        next(error);
      }
    },

    async ruleEvaluation(req: Request, res: Response, next: NextFunction) {
      try {
        const id = readStringParam(req.params.id);
        if (!id) {
          throw new AppError('VALIDATION_ERROR', 'job id required', 400);
        }
        const result = await dev.ruleEvaluation(id);
        res.status(200).json({ data: result });
      } catch (error) {
        next(error);
      }
    },

    async aiOutput(req: Request, res: Response, next: NextFunction) {
      try {
        const id = readStringParam(req.params.id);
        if (!id) {
          throw new AppError('VALIDATION_ERROR', 'job id required', 400);
        }
        const result = await dev.aiOutput(id);
        res.status(200).json({ data: result });
      } catch (error) {
        next(error);
      }
    },

    async clearDb(_req: Request, res: Response, next: NextFunction) {
      try {
        const result = await dev.clearDatabase();
        res.status(200).json({ data: result });
      } catch (error) {
        next(error);
      }
    },

    async clearLogs(_req: Request, res: Response, next: NextFunction) {
      try {
        const result = await dev.clearLogs();
        res.status(200).json({ data: result });
      } catch (error) {
        next(error);
      }
    },

    async exportLogs(_req: Request, res: Response, next: NextFunction) {
      try {
        const result = await dev.exportLogs();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="jobfinder-logs-${Date.now()}.json"`,
        );
        res.status(200).send(JSON.stringify(result, null, 2));
      } catch (error) {
        next(error);
      }
    },
  };
}
