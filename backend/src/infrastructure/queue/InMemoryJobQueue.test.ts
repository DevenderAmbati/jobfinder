import { describe, expect, it } from 'vitest';
import { InMemoryJobQueue } from './InMemoryJobQueue.js';

describe('InMemoryJobQueue', () => {
  it('enqueues work items and reports size', async () => {
    const queue = new InMemoryJobQueue();
    const id = await queue.enqueue({
      type: 'FetchCompanyJobs',
      payload: { companyId: 'company-1' },
    });

    expect(id).toBeTruthy();
    expect(queue.size()).toBe(1);
  });

  it('processes items with the registered handler', async () => {
    const queue = new InMemoryJobQueue();
    const seen: string[] = [];

    queue.start(async (item) => {
      seen.push(item.payload.companyId);
    });

    await queue.enqueue({
      type: 'FetchCompanyJobs',
      payload: { companyId: 'company-42' },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen).toEqual(['company-42']);
    expect(queue.size()).toBe(0);
  });

  it('toggles running flag on start/stop', () => {
    const queue = new InMemoryJobQueue();
    expect(queue.isRunning()).toBe(false);
    queue.start(async () => undefined);
    expect(queue.isRunning()).toBe(true);
    queue.stop();
    expect(queue.isRunning()).toBe(false);
  });
});
