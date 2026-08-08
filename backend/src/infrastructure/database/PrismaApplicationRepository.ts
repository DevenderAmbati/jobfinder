import type {
  Application,
  ApplicationStatus,
} from '../../domain/entities/Application.js';
import type { ApplicationRepository } from '../../domain/repositories/ApplicationRepository.js';
import { prisma } from './prismaClient.js';
import { toApplication } from './mappers.js';

export class PrismaApplicationRepository implements ApplicationRepository {
  async findAll(userId: string): Promise<Application[]> {
    const rows = await prisma.application.findMany({
      where: { userId },
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

  async findByJobId(
    userId: string,
    jobId: string,
  ): Promise<Application | null> {
    const row = await prisma.application.findUnique({
      where: { userId_jobId: { userId, jobId } },
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
    userId: string,
    jobId: string,
    status: ApplicationStatus = 'SAVED',
    notes: string | null = null,
  ): Promise<Application> {
    const row = await prisma.application.create({
      data: {
        userId,
        jobId,
        status,
        notes,
        appliedAt: status === 'SAVED' ? null : new Date(),
      },
      include: { job: { include: { company: true } } },
    });
    return toApplication(row, {
      title: row.job.title,
      companyName: row.job.company.name,
      applyUrl: row.job.applyUrl,
    });
  }

  async updateStatus(
    userId: string,
    id: string,
    status: ApplicationStatus,
    notes?: string | null,
  ): Promise<Application> {
    const existing = await prisma.application.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new Error('APPLICATION_NOT_FOUND');
    }

    let appliedAt = existing.appliedAt;
    if (status === 'SAVED') {
      appliedAt = null;
    } else if (!appliedAt) {
      appliedAt = new Date();
    }

    const row = await prisma.application.update({
      where: { id },
      data: {
        status,
        appliedAt,
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

  async delete(userId: string, id: string): Promise<void> {
    const existing = await prisma.application.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new Error('APPLICATION_NOT_FOUND');
    }
    await prisma.application.delete({ where: { id } });
  }
}
