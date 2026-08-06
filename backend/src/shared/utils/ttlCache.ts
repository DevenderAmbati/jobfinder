/**
 * Tiny in-memory TTL cache for cheap, read-mostly API responses.
 */
export function createTtlCache<T>(ttlMs: number) {
  let entry: { value: T; expiresAt: number } | null = null;

  return {
    get(): T | null {
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        entry = null;
        return null;
      }
      return entry.value;
    },
    set(value: T): void {
      entry = { value, expiresAt: Date.now() + ttlMs };
    },
    clear(): void {
      entry = null;
    },
  };
}
