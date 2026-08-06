import { describe, expect, it } from 'vitest';
import { parseStringList, serializeStringList } from './stringList.js';

describe('stringList utils', () => {
  it('round-trips JSON lists', () => {
    const raw = serializeStringList(['React', 'Node.js']);
    expect(parseStringList(raw)).toEqual(['React', 'Node.js']);
  });

  it('falls back to comma-separated values', () => {
    expect(parseStringList('React, Node.js')).toEqual(['React', 'Node.js']);
  });

  it('returns empty for null/empty', () => {
    expect(parseStringList(null)).toEqual([]);
    expect(serializeStringList([])).toBeNull();
  });
});
