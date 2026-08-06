import { describe, expect, it, vi } from 'vitest';
import { CronScheduler } from './CronScheduler.js';

describe('CronScheduler', () => {
  it('reports stopped status before start', () => {
    const scheduleTick = { execute: vi.fn(async () => undefined) };
    const scheduler = new CronScheduler(scheduleTick as never, '0 */6 * * *');
    const status = scheduler.getStatus(new Date('2026-08-06T07:00:00.000Z'));
    expect(status.running).toBe(false);
    expect(status.expression).toBe('0 */6 * * *');
    expect(status.startedAt).toBeNull();
    expect(status.nextRunAt).toBeTruthy();
  });

  it('reports running after start and clears on stop', () => {
    const scheduleTick = { execute: vi.fn(async () => undefined) };
    const scheduler = new CronScheduler(scheduleTick as never, '*/5 * * * *');
    scheduler.start();
    expect(scheduler.getStatus().running).toBe(true);
    expect(scheduler.getStatus().startedAt).toBeTruthy();
    scheduler.stop();
    expect(scheduler.getStatus().running).toBe(false);
  });
});
