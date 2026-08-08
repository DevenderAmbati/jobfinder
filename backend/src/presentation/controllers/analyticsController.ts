import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';
import { requireUserId } from '../middleware/authMiddleware.js';

function startOfUtcDay(date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Monday 00:00 UTC for the week containing `date`. */
function startOfUtcWeek(date: Date): Date {
  const day = startOfUtcDay(date);
  const weekday = day.getUTCDay(); // 0 Sun … 6 Sat
  const offset = weekday === 0 ? 6 : weekday - 1;
  day.setUTCDate(day.getUTCDate() - offset);
  return day;
}

function buildDailySeries(
  days: number,
  timestamps: Date[],
): Array<{ date: string; count: number }> {
  const today = startOfUtcDay();
  const counts = new Map<string, number>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setUTCDate(today.getUTCDate() - i);
    counts.set(utcDayKey(day), 0);
  }
  for (const stamp of timestamps) {
    const key = utcDayKey(stamp);
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries()).map(([date, count]) => ({ date, count }));
}

function buildWeeklySeries(
  weeks: number,
  timestamps: Date[],
): Array<{ weekStart: string; count: number }> {
  const thisWeek = startOfUtcWeek(new Date());
  const counts = new Map<string, number>();
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const week = new Date(thisWeek);
    week.setUTCDate(thisWeek.getUTCDate() - i * 7);
    counts.set(utcDayKey(week), 0);
  }
  for (const stamp of timestamps) {
    const key = utcDayKey(startOfUtcWeek(stamp));
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries()).map(([weekStart, count]) => ({
    weekStart,
    count,
  }));
}

export function createAnalyticsController(container: AppContainer) {
  return {
    async summary(
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> {
      try {
        const userId = requireUserId(req);
        const todayStart = startOfUtcDay();
        const rule = await container.rules.findByUserId(userId);
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
          container.prisma.jobMatch.count({
            where: { userId, matchScore: { gte: minScore } },
          }),
          container.prisma.job.count({
            where: {
              OR: [
                { matches: { none: { userId } } },
                {
                  matches: {
                    some: {
                      userId,
                      OR: [
                        { recommendation: 'SKIP' },
                        { matchScore: { lt: minScore } },
                      ],
                    },
                  },
                },
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
            where: { userId },
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

    async applications(
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> {
      try {
        const userId = requireUserId(req);
        const daysRaw =
          typeof req.query.days === 'string' ? Number(req.query.days) : 14;
        const days = Number.isFinite(daysRaw)
          ? Math.min(90, Math.max(7, Math.floor(daysRaw)))
          : 14;
        const weeksRaw =
          typeof req.query.weeks === 'string' ? Number(req.query.weeks) : 8;
        const weeks = Number.isFinite(weeksRaw)
          ? Math.min(26, Math.max(4, Math.floor(weeksRaw)))
          : 8;

        const todayStart = startOfUtcDay();
        const dailyRangeStart = new Date(todayStart);
        dailyRangeStart.setUTCDate(todayStart.getUTCDate() - (days - 1));

        const weekRangeStart = startOfUtcWeek(new Date());
        weekRangeStart.setUTCDate(weekRangeStart.getUTCDate() - (weeks - 1) * 7);

        const fetchFrom =
          dailyRangeStart < weekRangeStart ? dailyRangeStart : weekRangeStart;

        const [grouped, appliedInRange, appliedToday] = await Promise.all([
          container.prisma.application.groupBy({
            by: ['status'],
            where: { userId },
            _count: { _all: true },
          }),
          container.prisma.application.findMany({
            where: {
              userId,
              appliedAt: { gte: fetchFrom },
            },
            select: { appliedAt: true },
          }),
          container.prisma.application.count({
            where: {
              userId,
              appliedAt: { gte: todayStart },
            },
          }),
        ]);

        const byStatus = Object.fromEntries(
          grouped.map((row) => [row.status, row._count._all]),
        ) as Record<string, number>;

        const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
        const bookmarked = byStatus.SAVED ?? 0;
        const applied =
          (byStatus.APPLIED ?? 0) +
          (byStatus.INTERVIEW ?? 0) +
          (byStatus.OFFER ?? 0) +
          (byStatus.JOINED ?? 0);
        const interview = byStatus.INTERVIEW ?? 0;
        const rejected = byStatus.REJECTED ?? 0;
        const offer = byStatus.OFFER ?? 0;
        const joined = byStatus.JOINED ?? 0;

        const stamps = appliedInRange
          .map((row) => row.appliedAt)
          .filter((value): value is Date => value instanceof Date);

        const dailyStamps = stamps.filter((stamp) => stamp >= dailyRangeStart);
        const weeklyStamps = stamps.filter((stamp) => stamp >= weekRangeStart);

        const dailyApplied = buildDailySeries(days, dailyStamps);
        const weeklyApplied = buildWeeklySeries(weeks, weeklyStamps);

        res.status(200).json({
          data: {
            total,
            bookmarked,
            applied,
            interview,
            rejected,
            offer,
            joined,
            appliedToday,
            byStatus,
            dailyApplied,
            weeklyApplied,
            days,
            weeks,
            asOf: new Date().toISOString(),
          },
        });
      } catch (error) {
        next(error);
      }
    },
  };
}
