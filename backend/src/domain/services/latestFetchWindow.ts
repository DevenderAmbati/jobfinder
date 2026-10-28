import type { ProviderLog } from '../entities/Logs.js';

/** Gap that separates one scheduler run from the next. */
export const LATEST_FETCH_GAP_MS = 30 * 60 * 1000;

export interface FetchWindow {
  startedAt: Date;
  fetchedAt: Date;
}

/**
 * The newest run of company fetches.
 * A tick writes one provider log per company, back to back. Logs belong to
 * the same run while each older log ends within `gapMs` of the window start.
 */
export function latestFetchWindow(
  logs: Array<Pick<ProviderLog, 'startTime' | 'endTime'>>,
  gapMs = LATEST_FETCH_GAP_MS,
): FetchWindow | null {
  const timed = logs
    .map((log) => ({
      start: log.startTime,
      end: log.endTime ?? log.startTime,
    }))
    .filter(
      (log) =>
        !Number.isNaN(log.start.getTime()) && !Number.isNaN(log.end.getTime()),
    )
    .sort((a, b) => b.end.getTime() - a.end.getTime());

  const newest = timed[0];
  if (!newest) {
    return null;
  }

  let startedAt = newest.start;
  let fetchedAt = newest.end;

  for (let index = 1; index < timed.length; index += 1) {
    const log = timed[index];
    if (!log) {
      break;
    }
    const gap = startedAt.getTime() - log.end.getTime();
    if (gap > gapMs) {
      break;
    }
    if (log.start.getTime() < startedAt.getTime()) {
      startedAt = log.start;
    }
    if (log.end.getTime() > fetchedAt.getTime()) {
      fetchedAt = log.end;
    }
  }

  return { startedAt, fetchedAt };
}
