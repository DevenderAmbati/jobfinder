import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';

export function createProviderHealthController(container: AppContainer) {
  return {
    async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const health = await container.providerHealth.findAll();
        res.status(200).json({ data: health });
      } catch (error) {
        next(error);
      }
    },
  };
}
