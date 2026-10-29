import { asDate, getFirestore } from './admin.js';

function startOfUtcDay(date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type DailyAnalyticsPoint = {
  date: string;
  companiesFetched: number;
  companiesCouldNotFetch: number;
  companiesNewJobsFound: number;
  companiesNoJobsFound: number;
  jobsChecked: number;
  jobsScoreAbove50: number;
  jobsApplied: number;
};

type CompanyDayLog = {
  startTime: Date;
  error: string | null;
  jobsFound: number;
  jobsAdded: number;
};

export class FirestoreAnalytics {
  private db = getFirestore();

  async summary(userId: string, minScore: number, days = 14) {
    const trendDays = Math.min(90, Math.max(7, Math.floor(days)));
    const todayStart = startOfUtcDay();
    const rangeStart = new Date(todayStart);
    rangeStart.setUTCDate(todayStart.getUTCDate() - (trendDays - 1));

    const [
      companiesSnap,
      jobsCountSnap,
      providerLogsSnap,
      matchesSnap,
      notifSnap,
      appsSnap,
    ] = await Promise.all([
      this.db.collection('companies').get(),
      this.db.collection('jobs').count().get(),
      this.db
        .collection('providerLogs')
        .where('startTime', '>=', rangeStart)
        .get(),
      this.db.collection('users').doc(userId).collection('matches').get(),
      this.db.collection('notificationLogs').get(),
      this.db.collection('users').doc(userId).collection('applications').get(),
    ]);

    const companiesTotal = companiesSnap.size;
    const enabledIds = companiesSnap.docs
      .filter((d) => d.data().enabled !== false)
      .map((d) => d.id);
    const companiesMonitored = enabledIds.length;
    const jobsTotal = jobsCountSnap.data().count;

    /** date -> companyId -> latest log that day */
    const logsByDayCompany = new Map<string, Map<string, CompanyDayLog>>();
    const jobsCheckedByDay = new Map<string, number>();

    for (const doc of providerLogsSnap.docs) {
      const data = doc.data();
      const startTime = asDate(data.startTime);
      if (!startTime || startTime < rangeStart) continue;
      const day = utcDayKey(startTime);
      jobsCheckedByDay.set(
        day,
        (jobsCheckedByDay.get(day) ?? 0) + Number(data.jobsFound ?? 0),
      );

      const companyId =
        typeof data.companyId === 'string' ? data.companyId.trim() : '';
      if (!companyId) continue;

      let byCompany = logsByDayCompany.get(day);
      if (!byCompany) {
        byCompany = new Map();
        logsByDayCompany.set(day, byCompany);
      }
      const existing = byCompany.get(companyId);
      if (existing && existing.startTime >= startTime) continue;
      byCompany.set(companyId, {
        startTime,
        error:
          data.error == null || data.error === ''
            ? null
            : String(data.error),
        jobsFound: Number(data.jobsFound ?? 0),
        jobsAdded: Number(data.jobsAdded ?? 0),
      });
    }

    const scoreAbove50ByDay = new Map<string, number>();
    let matchedJobs = 0;
    let ignoredJobs = 0;
    let jobsScoreAbove50 = 0;
    let jobsScoreAbove50Today = 0;
    const matchedIds = new Set<string>();

    for (const doc of matchesSnap.docs) {
      const data = doc.data();
      const score = Number(data.matchScore ?? 0);
      const rec = String(data.recommendation ?? '');
      matchedIds.add(doc.id);
      if (score >= minScore) {
        matchedJobs += 1;
      }
      if (rec === 'SKIP' || score < minScore) {
        ignoredJobs += 1;
      }
      if (score > 50) {
        jobsScoreAbove50 += 1;
        const stamped = asDate(data.updatedAt) ?? asDate(data.createdAt);
        if (stamped && stamped >= rangeStart) {
          const day = utcDayKey(stamped);
          scoreAbove50ByDay.set(day, (scoreAbove50ByDay.get(day) ?? 0) + 1);
          if (stamped >= todayStart) {
            jobsScoreAbove50Today += 1;
          }
        }
      }
    }
    ignoredJobs += Math.max(0, jobsTotal - matchedIds.size);

    const appliedByDay = new Map<string, number>();
    let jobsAppliedToday = 0;
    const applicationsByStatus: Record<string, number> = {};

    for (const doc of appsSnap.docs) {
      const data = doc.data();
      const status = String(data.status ?? 'SAVED');
      applicationsByStatus[status] = (applicationsByStatus[status] ?? 0) + 1;
      const appliedAt = asDate(data.appliedAt);
      if (!appliedAt || appliedAt < rangeStart) continue;
      // Count pipeline applications (not bookmarks).
      if (status === 'SAVED') continue;
      const day = utcDayKey(appliedAt);
      appliedByDay.set(day, (appliedByDay.get(day) ?? 0) + 1);
      if (appliedAt >= todayStart) {
        jobsAppliedToday += 1;
      }
    }

    const applied =
      (applicationsByStatus.APPLIED ?? 0) +
      (applicationsByStatus.INTERVIEW ?? 0) +
      (applicationsByStatus.OFFER ?? 0) +
      (applicationsByStatus.JOINED ?? 0);

    let notificationsToday = 0;
    let notificationsSuccess = 0;
    for (const doc of notifSnap.docs) {
      const data = doc.data();
      if (data.success) notificationsSuccess += 1;
      const created = asDate(data.createdAt);
      if (created && created >= todayStart) notificationsToday += 1;
    }

    const dailyTrend: DailyAnalyticsPoint[] = [];
    for (let i = trendDays - 1; i >= 0; i -= 1) {
      const dayDate = new Date(todayStart);
      dayDate.setUTCDate(todayStart.getUTCDate() - i);
      const day = utcDayKey(dayDate);
      const byCompany = logsByDayCompany.get(day) ?? new Map();

      let companiesFetched = 0;
      let companiesCouldNotFetch = 0;
      let companiesNewJobsFound = 0;
      let companiesNoJobsFound = 0;

      for (const log of byCompany.values()) {
        if (log.error) {
          companiesCouldNotFetch += 1;
          continue;
        }
        companiesFetched += 1;
        if (log.jobsAdded > 0) companiesNewJobsFound += 1;
        if (log.jobsFound === 0) companiesNoJobsFound += 1;
      }

      // Only treat missing companies as "couldn't fetch" when this day
      // actually had at least one provider log (a run started). Otherwise a
      // missed schedule shows every company as failed.
      if (byCompany.size > 0) {
        for (const id of enabledIds) {
          if (!byCompany.has(id)) {
            companiesCouldNotFetch += 1;
          }
        }
      }

      dailyTrend.push({
        date: day,
        companiesFetched,
        companiesCouldNotFetch,
        companiesNewJobsFound,
        companiesNoJobsFound,
        jobsChecked: jobsCheckedByDay.get(day) ?? 0,
        jobsScoreAbove50: scoreAbove50ByDay.get(day) ?? 0,
        jobsApplied: appliedByDay.get(day) ?? 0,
      });
    }

    const todayPoint = dailyTrend[dailyTrend.length - 1];

    return {
      companiesTotal,
      companiesMonitored,
      jobsTotal,
      jobsCheckedToday: todayPoint?.jobsChecked ?? 0,
      companiesFetchedToday: todayPoint?.companiesFetched ?? 0,
      companiesCouldNotFetchToday: todayPoint?.companiesCouldNotFetch ?? 0,
      companiesNewJobsFoundToday: todayPoint?.companiesNewJobsFound ?? 0,
      companiesNoJobsFoundToday: todayPoint?.companiesNoJobsFound ?? 0,
      jobsScoreAbove50,
      jobsScoreAbove50Today,
      jobsAppliedToday,
      matchedJobs,
      ignoredJobs,
      notificationsTotal: notifSnap.size,
      notificationsToday,
      notificationsSuccess,
      applied,
      applicationsByStatus,
      matchScoreThresholdUsed: minScore,
      days: trendDays,
      dailyTrend,
      asOf: new Date().toISOString(),
    };
  }

  async applications(userId: string, days: number, weeks: number) {
    const todayStart = startOfUtcDay();
    const dailyRangeStart = new Date(todayStart);
    dailyRangeStart.setUTCDate(todayStart.getUTCDate() - (days - 1));

    const weekRangeStart = startOfUtcWeek(new Date());
    weekRangeStart.setUTCDate(weekRangeStart.getUTCDate() - (weeks - 1) * 7);

    const appsSnap = await this.db
      .collection('users')
      .doc(userId)
      .collection('applications')
      .get();

    const byStatus: Record<string, number> = {};
    const stamps: Date[] = [];
    let appliedToday = 0;

    for (const doc of appsSnap.docs) {
      const data = doc.data();
      const status = String(data.status ?? 'SAVED');
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      const appliedAt = asDate(data.appliedAt);
      if (appliedAt) {
        stamps.push(appliedAt);
        if (appliedAt >= todayStart) appliedToday += 1;
      }
    }

    const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
    const bookmarked = byStatus.SAVED ?? 0;
    const applied =
      (byStatus.APPLIED ?? 0) +
      (byStatus.INTERVIEW ?? 0) +
      (byStatus.OFFER ?? 0) +
      (byStatus.JOINED ?? 0);

    const dailyStamps = stamps.filter((s) => s >= dailyRangeStart);
    const weeklyStamps = stamps.filter((s) => s >= weekRangeStart);

    return {
      total,
      bookmarked,
      applied,
      interview: byStatus.INTERVIEW ?? 0,
      rejected: byStatus.REJECTED ?? 0,
      offer: byStatus.OFFER ?? 0,
      joined: byStatus.JOINED ?? 0,
      appliedToday,
      byStatus,
      dailyApplied: buildDailySeries(days, dailyStamps),
      weeklyApplied: buildWeeklySeries(weeks, weeklyStamps),
      days,
      weeks,
      asOf: new Date().toISOString(),
    };
  }
}

function startOfUtcWeek(date: Date): Date {
  const day = startOfUtcDay(date);
  const weekday = day.getUTCDay();
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
