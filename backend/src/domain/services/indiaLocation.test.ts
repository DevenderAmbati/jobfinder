import { describe, expect, it } from 'vitest';
import { isIndiaLocation, shouldPersistJobLocation } from './indiaLocation.js';

describe('isIndiaLocation', () => {
  it('matches country and major cities', () => {
    expect(isIndiaLocation('Hyderabad, India')).toBe(true);
    expect(isIndiaLocation('Bengaluru')).toBe(true);
    expect(isIndiaLocation('Bangalore, KA')).toBe(true);
    expect(isIndiaLocation('Remote, India')).toBe(true);
  });

  it('matches Amazon-style IN country codes', () => {
    expect(isIndiaLocation('IN, KA, Bengaluru')).toBe(true);
    expect(isIndiaLocation('IN')).toBe(true);
    expect(isIndiaLocation('KA, IN')).toBe(true);
  });

  it('rejects non-India locations', () => {
    expect(isIndiaLocation('Seattle, WA')).toBe(false);
    expect(isIndiaLocation('US, Remote')).toBe(false);
    expect(isIndiaLocation('Singapore')).toBe(false);
    expect(isIndiaLocation('London, UK')).toBe(false);
    expect(isIndiaLocation('Indiana, United States')).toBe(false);
    expect(isIndiaLocation('Indianapolis, IN')).toBe(false);
    expect(isIndiaLocation('Austin, IN')).toBe(false);
  });

  it('returns false for empty', () => {
    expect(isIndiaLocation(null)).toBe(false);
    expect(isIndiaLocation('')).toBe(false);
    expect(isIndiaLocation('   ')).toBe(false);
  });
});

describe('shouldPersistJobLocation', () => {
  it('keeps empty / unknown locations', () => {
    expect(shouldPersistJobLocation(null)).toBe(true);
    expect(shouldPersistJobLocation('')).toBe(true);
  });

  it('keeps India and skips others', () => {
    expect(shouldPersistJobLocation('Pune, India')).toBe(true);
    expect(shouldPersistJobLocation('Austin, TX')).toBe(false);
  });
});
