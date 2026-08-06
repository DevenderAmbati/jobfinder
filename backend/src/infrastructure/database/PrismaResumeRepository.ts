import type { Resume } from '../../domain/entities/Resume.js';
import type {
  ResumeRepository,
  ResumeUpsertInput,
} from '../../domain/repositories/ResumeRepository.js';
import { prisma } from './prismaClient.js';
import { toResume } from './mappers.js';

export class PrismaResumeRepository implements ResumeRepository {
  async findCurrent(): Promise<Resume | null> {
    const row = await prisma.resume.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
    return row ? toResume(row) : null;
  }

  async upsertCurrent(input: ResumeUpsertInput): Promise<Resume> {
    const existing = await prisma.resume.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    const data = {
      originalPdfPath: input.originalPdfPath ?? null,
      extractedText: input.extractedText,
      markdown: input.markdown,
      embedding: input.embedding ?? null,
    };

    const row = existing
      ? await prisma.resume.update({ where: { id: existing.id }, data })
      : await prisma.resume.create({ data });

    return toResume(row);
  }
}
