import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';
import { AppError } from '../../shared/errors/AppError.js';

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
    async get(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const resume = await container.resumes.findCurrent();
        res.status(200).json({ data: resume ? serializeResume(resume) : null });
      } catch (error) {
        next(error);
      }
    },

    async put(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = req.body as Record<string, unknown>;
        const existing = await container.resumes.findCurrent();

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

        const resume = await container.resumes.upsertCurrent({
          originalPdfPath,
          extractedText,
          markdown,
          embedding: existing?.embedding ?? null,
        });

        res.status(200).json({ data: serializeResume(resume) });
      } catch (error) {
        next(error);
      }
    },
  };
}
