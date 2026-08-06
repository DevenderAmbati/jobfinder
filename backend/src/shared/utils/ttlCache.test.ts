import { describe, expect, it, vi } from 'vitest';
import { createTtlCache } from './ttlCache.js';

describe('createTtlCache', () => {
  it('returns null when empty or expired', () => {
    vi.useFakeTimers();
    const cache = createTtlCache<string>(1000);
    expect(cache.get()).toBeNull();
    cache.set('ok');
    expect(cache.get()).toBe('ok');
    vi.advanceTimersByTime(1001);
    expect(cache.get()).toBeNull();
    vi.useRealTimers();
  });
});
