import { describe, expect, it } from 'vitest';
import { latestFetchWindow } from './latestFetchWindow.js';

function log(start: string, end: string | null = null) {
  return {
    startTime: new Date(start),
    endTime: end ? new Date(end) : null,
  };
}

describe('latestFetchWindow', () => {
  it('returns null when there are no logs', () => {
    expect(latestFetchWindow([])).toBeNull();
  });

  it('uses a single company fetch as the window', () => {
    const window = latestFetchWindow([
      log('2026-10-04T01:00:00.000Z', '2026-10-04T01:12:00.000Z'),
    ]);
    expect(window?.startedAt.toISOString()).toBe('2026-10-04T01:00:00.000Z');
    expect(window?.fetchedAt.toISOString()).toBe('2026-10-04T01:12:00.000Z');
  });

  it('joins back-to-back company fetches from the same run', () => {
    const window = latestFetchWindow([
      log('2026-10-04T00:00:00.000Z', '2026-10-04T00:20:00.000Z'),
      log('2026-10-04T06:00:00.000Z', '2026-10-04T06:10:00.000Z'),
      log('2026-10-04T06:10:00.000Z', '2026-10-04T06:25:00.000Z'),
      log('2026-10-04T06:25:00.000Z', '2026-10-04T06:40:00.000Z'),
    ]);
    expect(window?.startedAt.toISOString()).toBe('2026-10-04T06:00:00.000Z');
    expect(window?.fetchedAt.toISOString()).toBe('2026-10-04T06:40:00.000Z');
  });

  it('keeps only the newest run when a later fetch stands apart', () => {
    const window = latestFetchWindow([
      log('2026-10-04T06:00:00.000Z', '2026-10-04T06:40:00.000Z'),
      log('2026-10-04T08:00:00.000Z', '2026-10-04T08:05:00.000Z'),
    ]);
    expect(window?.startedAt.toISOString()).toBe('2026-10-04T08:00:00.000Z');
    expect(window?.fetchedAt.toISOString()).toBe('2026-10-04T08:05:00.000Z');
  });

  it('treats a missing end time as the start time', () => {
    const window = latestFetchWindow([log('2026-10-04T03:00:00.000Z')]);
    expect(window?.fetchedAt.toISOString()).toBe('2026-10-04T03:00:00.000Z');
  });
});
