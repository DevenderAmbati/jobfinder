import type { Resume } from '../../domain/entities/Resume.js';
import type {
  ResumeRepository,
  ResumeUpsertInput,
} from '../../domain/repositories/ResumeRepository.js';
import { prisma } from './prismaClient.js';
import { toResume } from './mappers.js';

export class PrismaResumeRepository implements ResumeRepository {
  async findCurrent(userId: string): Promise<Resume | null> {
    const row = await prisma.resume.findUnique({ where: { userId } });
    return row ? toResume(row) : null;
  }

  async upsertCurrent(
    userId: string,
    input: ResumeUpsertInput,
  ): Promise<Resume> {
    const data = {
      originalPdfPath: input.originalPdfPath ?? null,
      extractedText: input.extractedText,
      markdown: input.markdown,
      embedding: input.embedding ?? null,
    };

    const row = await prisma.resume.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    return toResume(row);
  }
}
