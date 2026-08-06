import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';
import { AppError } from '../../shared/errors/AppError.js';

export function createPromptsController(container: AppContainer) {
  return {
    async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const prompts = await container.prompts.findAll();
        res.status(200).json({ data: prompts });
      } catch (error) {
        next(error);
      }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = req.params.id;
        if (!id || typeof id !== 'string') {
          throw new AppError('VALIDATION_ERROR', 'Prompt id is required', 400);
        }

        const body = req.body as Record<string, unknown>;
        if (
          body.content !== undefined &&
          typeof body.content !== 'string'
        ) {
          throw new AppError('VALIDATION_ERROR', 'content must be a string', 400);
        }
        if (
          body.enabled !== undefined &&
          typeof body.enabled !== 'boolean'
        ) {
          throw new AppError(
            'VALIDATION_ERROR',
            'enabled must be a boolean',
            400,
          );
        }

        if (body.content === undefined && body.enabled === undefined) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Provide content and/or enabled',
            400,
          );
        }

        try {
          const prompt = await container.prompts.update(id, {
            content:
              typeof body.content === 'string' ? body.content : undefined,
            enabled:
              typeof body.enabled === 'boolean' ? body.enabled : undefined,
          });
          res.status(200).json({ data: prompt });
        } catch {
          throw new AppError('NOT_FOUND', `Prompt ${id} not found`, 404);
        }
      } catch (error) {
        next(error);
      }
    },
  };
}
