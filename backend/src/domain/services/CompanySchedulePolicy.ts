import type { Company } from '../entities/Company.js';

/**
 * Determines whether a company is due to run based on its cron frequency.
 */
export function isCompanyDue(
  company: Pick<Company, 'frequency' | 'lastRun'>,
  now: Date,
  parseCron: (expression: string, currentDate: Date) => Date,
): boolean {
  if (!company.lastRun) {
    return true;
  }

  try {
    const next = parseCron(company.frequency, company.lastRun);
    return next.getTime() <= now.getTime();
  } catch {
    const sixHoursMs = 6 * 60 * 60 * 1000;
    return now.getTime() - company.lastRun.getTime() >= sixHoursMs;
  }
}
