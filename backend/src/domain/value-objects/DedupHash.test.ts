import { describe, expect, it } from 'vitest';
import { DedupHash } from './DedupHash.js';
import { MatchScore } from './MatchScore.js';

describe('DedupHash', () => {
  it('is stable for equivalent normalized inputs', () => {
    const a = DedupHash.fromParts('Acme', 'Software Engineer', 'Hyderabad');
    const b = DedupHash.fromParts('  acme ', 'software   engineer', ' hyderabad ');
    expect(a.equals(b)).toBe(true);
  });

  it('differs when title changes', () => {
    const a = DedupHash.fromParts('Acme', 'Software Engineer', 'Hyderabad');
    const b = DedupHash.fromParts('Acme', 'Senior Software Engineer', 'Hyderabad');
    expect(a.equals(b)).toBe(false);
  });

  it('treats null and empty location the same', () => {
    const a = DedupHash.fromParts('Acme', 'Engineer', null);
    const b = DedupHash.fromParts('Acme', 'Engineer', '');
    expect(a.equals(b)).toBe(true);
  });
});

describe('MatchScore', () => {
  it('accepts boundary values', () => {
    expect(MatchScore.of(0).value).toBe(0);
    expect(MatchScore.of(100).value).toBe(100);
  });

  it('rejects out of range values', () => {
    expect(() => MatchScore.of(-1)).toThrow();
    expect(() => MatchScore.of(101)).toThrow();
  });

  it('evaluates thresholds', () => {
    expect(MatchScore.of(80).meetsThreshold(80)).toBe(true);
    expect(MatchScore.of(79).meetsThreshold(80)).toBe(false);
  });
});
