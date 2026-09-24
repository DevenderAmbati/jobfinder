import { asDate, getFirestore } from './admin.js';

function startOfUtcDay(date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export class FirestoreAnalytics {
  private db = getFirestore();

  async summary(userId: string, minScore: number) {
    const todayStart = startOfUtcDay();

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
        .where('startTime', '>=', todayStart)
        .get(),
      this.db.collection('users').doc(userId).collection('matches').get(),
      this.db.collection('notificationLogs').get(),
      this.db.collection('users').doc(userId).collection('applications').get(),
    ]);

    const companiesTotal = companiesSnap.size;
    const companiesMonitored = companiesSnap.docs.filter(
      (d) => d.data().enabled !== false,
    ).length;
    const jobsTotal = jobsCountSnap.data().count;

    let jobsCheckedToday = 0;
    for (const doc of providerLogsSnap.docs) {
      jobsCheckedToday += Number(doc.data().jobsFound ?? 0);
    }

    let matchedJobs = 0;
    let ignoredJobs = 0;
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
    }
    ignoredJobs += Math.max(0, jobsTotal - matchedIds.size);

    let notificationsTotal = notifSnap.size;
    let notificationsToday = 0;
    let notificationsSuccess = 0;
    for (const doc of notifSnap.docs) {
      const data = doc.data();
      if (data.success) notificationsSuccess += 1;
      const created = asDate(data.createdAt);
      if (created && created >= todayStart) notificationsToday += 1;
    }
    void notificationsTotal;

    const applicationsByStatus: Record<string, number> = {};
    for (const doc of appsSnap.docs) {
      const status = String(doc.data().status ?? 'SAVED');
      applicationsByStatus[status] = (applicationsByStatus[status] ?? 0) + 1;
    }

    const applied =
      (applicationsByStatus.APPLIED ?? 0) +
      (applicationsByStatus.INTERVIEW ?? 0) +
      (applicationsByStatus.OFFER ?? 0) +
      (applicationsByStatus.JOINED ?? 0);

    return {
      companiesTotal,
      companiesMonitored,
      jobsTotal,
      jobsCheckedToday,
      matchedJobs,
      ignoredJobs,
      notificationsTotal: notifSnap.size,
      notificationsToday,
      notificationsSuccess,
      applied,
      applicationsByStatus,
      matchScoreThresholdUsed: minScore,
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

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
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
