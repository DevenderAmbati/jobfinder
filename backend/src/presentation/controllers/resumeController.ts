import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';
import { AppError } from '../../shared/errors/AppError.js';
import { logger } from '../../shared/utils/logger.js';
import { requireUserId } from '../middleware/authMiddleware.js';

function serializeResume(resume: {
  id: string;
  originalPdfPath: string | null;
  extractedText: string;
  markdown: string;
  embedding: string | null;
}) {
  return {
    id: resume.id,
    hasPdf: Boolean(resume.originalPdfPath),
    originalPdfPath: resume.originalPdfPath,
    extractedText: resume.extractedText,
    markdown: resume.markdown,
    hasEmbedding: Boolean(resume.embedding),
  };
}

export function createResumeController(container: AppContainer) {
  return {
    async get(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = requireUserId(req);
        const resume = await container.resumes.findCurrent(userId);
        res.status(200).json({ data: resume ? serializeResume(resume) : null });
      } catch (error) {
        next(error);
      }
    },

    async put(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = requireUserId(req);
        const body = req.body as Record<string, unknown>;
        const existing = await container.resumes.findCurrent(userId);

        const extractedText =
          typeof body.extractedText === 'string'
            ? body.extractedText
            : existing?.extractedText;
        const markdown =
          typeof body.markdown === 'string' ? body.markdown : existing?.markdown;

        if (extractedText === undefined || markdown === undefined) {
          throw new AppError(
            'VALIDATION_ERROR',
            'extractedText and markdown are required when no resume exists yet',
            400,
          );
        }

        const file = (req as Request & { file?: Express.Multer.File }).file;
        const originalPdfPath = file
          ? file.path
          : (existing?.originalPdfPath ?? null);

        const resume = await container.resumes.upsertCurrent(userId, {
          originalPdfPath,
          extractedText,
          markdown,
          embedding: existing?.embedding ?? null,
        });

        // Recompute this user's JobMatch rows against the shared catalog.
        void container.rescoreJobs
          .execute({ userId })
          .catch((error: unknown) => {
            logger.warn('Resume save rescore failed', {
              userId,
              error: error instanceof Error ? error.message : String(error),
            });
          });

        res.status(200).json({ data: serializeResume(resume) });
      } catch (error) {
        next(error);
      }
    },
  };
}
