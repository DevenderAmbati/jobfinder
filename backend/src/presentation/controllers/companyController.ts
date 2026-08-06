import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';
import { AppError } from '../../shared/errors/AppError.js';

function readId(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  return value?.[0];
}

export function createCompanyController(container: AppContainer) {
  return {
    async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const companies = await container.companies.findAll();
        res.status(200).json({ data: companies });
      } catch (error) {
        next(error);
      }
    },

    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { name, provider, careerUrl, enabled, frequency } = req.body as {
          name?: string;
          provider?: string;
          careerUrl?: string;
          enabled?: boolean;
          frequency?: string;
        };

        if (!name || !provider || !careerUrl) {
          throw new AppError(
            'VALIDATION_ERROR',
            'name, provider, and careerUrl are required',
            400,
          );
        }

        container.providers.get(provider);

        const company = await container.companies.create({
          name,
          provider,
          careerUrl,
          enabled,
          frequency,
        });
        res.status(201).json({ data: company });
      } catch (error) {
        next(error);
      }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = readId(req.params.id);
        if (!id) {
          throw new AppError('VALIDATION_ERROR', 'Company id required', 400);
        }

        const { name, provider, careerUrl, enabled, frequency } = req.body as {
          name?: string;
          provider?: string;
          careerUrl?: string;
          enabled?: boolean;
          frequency?: string;
        };

        if (provider) {
          container.providers.get(provider);
        }

        const company = await container.companies.update(id, {
          name,
          provider,
          careerUrl,
          enabled,
          frequency,
        });
        res.status(200).json({ data: company });
      } catch (error) {
        next(error);
      }
    },

    async fetch(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = readId(req.params.id);
        if (!id) {
          throw new AppError('VALIDATION_ERROR', 'Company id required', 400);
        }

        const result = await container.fetchCompanyJobs.execute(id);
        res.status(200).json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  };
}
