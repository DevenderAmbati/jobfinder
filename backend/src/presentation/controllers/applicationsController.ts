import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';
import type { ApplicationStatus } from '../../domain/entities/Application.js';
import { AppError } from '../../shared/errors/AppError.js';
import { requireUserId } from '../middleware/authMiddleware.js';

const STATUSES: ApplicationStatus[] = [
  'SAVED',
  'APPLIED',
  'INTERVIEW',
  'REJECTED',
  'OFFER',
  'JOINED',
];

function isStatus(value: unknown): value is ApplicationStatus {
  return typeof value === 'string' && STATUSES.includes(value as ApplicationStatus);
}

function readId(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  return value?.[0];
}

export function createApplicationsController(container: AppContainer) {
  return {
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = requireUserId(req);
        const statusFilter =
          typeof req.query.status === 'string' ? req.query.status : undefined;
        let applications = await container.applications.findAll(userId);
        if (statusFilter && isStatus(statusFilter)) {
          applications = applications.filter((app) => app.status === statusFilter);
        }
        res.status(200).json({ data: applications });
      } catch (error) {
        next(error);
      }
    },

    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = requireUserId(req);
        const { jobId, status, notes } = req.body as {
          jobId?: string;
          status?: string;
          notes?: string | null;
        };

        if (!jobId) {
          throw new AppError('VALIDATION_ERROR', 'jobId is required', 400);
        }

        const job = await container.jobs.findById(jobId);
        if (!job) {
          throw new AppError('JOB_NOT_FOUND', `Job ${jobId} not found`, 404);
        }

        const existing = await container.applications.findByJobId(userId, jobId);
        const appStatus = isStatus(status) ? status : 'SAVED';

        if (existing) {
          // Don't downgrade past APPLIED when re-bookmarking, etc.
          const rank: Record<ApplicationStatus, number> = {
            SAVED: 1,
            APPLIED: 2,
            INTERVIEW: 3,
            OFFER: 4,
            JOINED: 5,
            REJECTED: 0,
          };
          const nextStatus =
            rank[appStatus] >= rank[existing.status] ? appStatus : existing.status;
          const application = await container.applications.updateStatus(
            userId,
            existing.id,
            nextStatus,
            notes !== undefined ? notes : existing.notes,
          );
          res.status(200).json({ data: application });
          return;
        }

        const application = await container.applications.create(
          userId,
          jobId,
          appStatus,
          notes ?? null,
        );
        res.status(201).json({ data: application });
      } catch (error) {
        next(error);
      }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = requireUserId(req);
        const id = readId(req.params.id);
        if (!id) {
          throw new AppError('VALIDATION_ERROR', 'application id required', 400);
        }

        const { status, notes } = req.body as {
          status?: string;
          notes?: string | null;
        };

        if (!isStatus(status)) {
          if (status === '__clear__' || status === 'CLEAR' || status === 'clear') {
            try {
              await container.applications.delete(userId, id);
            } catch (error) {
              if (
                error instanceof Error &&
                error.message === 'APPLICATION_NOT_FOUND'
              ) {
                throw new AppError(
                  'APPLICATION_NOT_FOUND',
                  `Application ${id} not found`,
                  404,
                );
              }
              throw error;
            }
            res.status(204).send();
            return;
          }
          throw new AppError(
            'VALIDATION_ERROR',
            `status must be one of: ${STATUSES.join(', ')}`,
            400,
          );
        }

        const application = await container.applications.updateStatus(
          userId,
          id,
          status,
          notes,
        );
        res.status(200).json({ data: application });
      } catch (error) {
        next(error);
      }
    },

    async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = requireUserId(req);
        const id = readId(req.params.id);
        if (!id) {
          throw new AppError('VALIDATION_ERROR', 'application id required', 400);
        }

        try {
          await container.applications.delete(userId, id);
        } catch (error) {
          if (error instanceof Error && error.message === 'APPLICATION_NOT_FOUND') {
            throw new AppError(
              'APPLICATION_NOT_FOUND',
              `Application ${id} not found`,
              404,
            );
          }
          throw error;
        }
        res.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  };
}
