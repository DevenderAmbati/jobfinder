import type {
  NotificationLog,
  ProviderLog,
} from '../../domain/entities/Logs.js';
import type {
  LogRepository,
  NotificationLogCreateInput,
  ProviderLogCreateInput,
} from '../../domain/repositories/LogRepository.js';
import { prisma } from './prismaClient.js';
import { toNotificationLog, toProviderLog } from './mappers.js';

export class PrismaLogRepository implements LogRepository {
  async createProviderLog(input: ProviderLogCreateInput): Promise<ProviderLog> {
    const row = await prisma.providerLog.create({
      data: {
        companyId: input.companyId ?? null,
        provider: input.provider,
        startTime: input.startTime,
        endTime: input.endTime ?? null,
        jobsFound: input.jobsFound ?? 0,
        jobsAdded: input.jobsAdded ?? 0,
        durationMs: input.durationMs ?? null,
        error: input.error ?? null,
      },
    });
    return toProviderLog(row);
  }

  async listProviderLogs(limit = 100): Promise<ProviderLog[]> {
    const rows = await prisma.providerLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toProviderLog);
  }

  async createNotificationLog(
    input: NotificationLogCreateInput,
  ): Promise<NotificationLog> {
    const row = await prisma.notificationLog.create({
      data: {
        jobId: input.jobId,
        channel: input.channel ?? 'telegram',
        success: input.success,
        payload: input.payload ?? null,
        error: input.error ?? null,
      },
    });
    return toNotificationLog(row);
  }

  async hasSuccessfulNotification(
    jobId: string,
    channel = 'telegram',
  ): Promise<boolean> {
    const count = await prisma.notificationLog.count({
      where: { jobId, channel, success: true },
    });
    return count > 0;
  }

  async listNotificationLogs(limit = 100): Promise<NotificationLog[]> {
    const rows = await prisma.notificationLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toNotificationLog);
  }
}
