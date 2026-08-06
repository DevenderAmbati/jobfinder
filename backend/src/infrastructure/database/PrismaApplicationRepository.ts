import type {
  Application,
  ApplicationStatus,
} from '../../domain/entities/Application.js';
import type { ApplicationRepository } from '../../domain/repositories/ApplicationRepository.js';
import { prisma } from './prismaClient.js';
import { toApplication } from './mappers.js';

export class PrismaApplicationRepository implements ApplicationRepository {
  async findAll(): Promise<Application[]> {
    const rows = await prisma.application.findMany({
      include: { job: { include: { company: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) =>
      toApplication(row, {
        title: row.job.title,
        companyName: row.job.company.name,
        applyUrl: row.job.applyUrl,
      }),
    );
  }

  async findByJobId(jobId: string): Promise<Application | null> {
    const row = await prisma.application.findUnique({
      where: { jobId },
      include: { job: { include: { company: true } } },
    });
    if (!row) {
      return null;
    }
    return toApplication(row, {
      title: row.job.title,
      companyName: row.job.company.name,
      applyUrl: row.job.applyUrl,
    });
  }

  async create(
    jobId: string,
    status: ApplicationStatus = 'SAVED',
    notes: string | null = null,
  ): Promise<Application> {
    const row = await prisma.application.create({
      data: { jobId, status, notes },
      include: { job: { include: { company: true } } },
    });
    return toApplication(row, {
      title: row.job.title,
      companyName: row.job.company.name,
      applyUrl: row.job.applyUrl,
    });
  }

  async updateStatus(
    id: string,
    status: ApplicationStatus,
    notes?: string | null,
  ): Promise<Application> {
    const row = await prisma.application.update({
      where: { id },
      data: {
        status,
        ...(notes !== undefined ? { notes } : {}),
      },
      include: { job: { include: { company: true } } },
    });
    return toApplication(row, {
      title: row.job.title,
      companyName: row.job.company.name,
      applyUrl: row.job.applyUrl,
    });
  }
}
