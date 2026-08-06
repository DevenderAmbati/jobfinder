import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';

function startOfUtcDay(date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function createAnalyticsController(container: AppContainer) {
  return {
    async summary(
      _req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> {
      try {
        const todayStart = startOfUtcDay();
        const rule = await container.rules.findActive();
        const minScore =
          rule?.minMatchScore ?? container.config.matchScoreThreshold;

        const [
          companiesTotal,
          companiesMonitored,
          jobsTotal,
          jobsCheckedToday,
          matchedJobs,
          ignoredJobs,
          notificationsTotal,
          notificationsToday,
          notificationsSuccess,
          applications,
        ] = await Promise.all([
          container.prisma.company.count(),
          container.prisma.company.count({ where: { enabled: true } }),
          container.prisma.job.count(),
          container.prisma.providerLog.aggregate({
            where: { startTime: { gte: todayStart } },
            _sum: { jobsFound: true },
          }),
          container.prisma.job.count({
            where: { matchScore: { gte: minScore } },
          }),
          container.prisma.job.count({
            where: {
              OR: [
                { recommendation: 'SKIP' },
                { matchScore: { lt: minScore } },
                { matchScore: null },
              ],
            },
          }),
          container.prisma.notificationLog.count(),
          container.prisma.notificationLog.count({
            where: { createdAt: { gte: todayStart } },
          }),
          container.prisma.notificationLog.count({
            where: { success: true },
          }),
          container.prisma.application.groupBy({
            by: ['status'],
            _count: { _all: true },
          }),
        ]);

        const applicationsByStatus = Object.fromEntries(
          applications.map((row) => [row.status, row._count._all]),
        ) as Record<string, number>;

        const applied =
          (applicationsByStatus.APPLIED ?? 0) +
          (applicationsByStatus.INTERVIEW ?? 0) +
          (applicationsByStatus.OFFER ?? 0) +
          (applicationsByStatus.JOINED ?? 0);

        res.status(200).json({
          data: {
            companiesTotal,
            companiesMonitored,
            jobsTotal,
            jobsCheckedToday: jobsCheckedToday._sum.jobsFound ?? 0,
            matchedJobs,
            ignoredJobs,
            notificationsTotal,
            notificationsToday,
            notificationsSuccess,
            applied,
            applicationsByStatus,
            matchScoreThresholdUsed: minScore,
            asOf: new Date().toISOString(),
          },
        });
      } catch (error) {
        next(error);
      }
    },
  };
}
