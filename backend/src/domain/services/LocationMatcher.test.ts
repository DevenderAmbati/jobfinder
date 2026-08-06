import { describe, expect, it } from 'vitest';
import { LocationMatcher } from './LocationMatcher.js';

const countries = ['India', 'Remote'];
const cities = ['Hyderabad', 'Remote', 'Bangalore'];

describe('LocationMatcher', () => {
  const matcher = new LocationMatcher();

  it('matches an explicit target country', () => {
    expect(matcher.match('India, Bengaluru', countries, cities).matched).toBe(
      true,
    );
  });

  it('matches an explicit target city', () => {
    expect(matcher.match('Hyderabad, India', countries, cities).matched).toBe(
      true,
    );
  });

  it('matches unrestricted remote', () => {
    expect(matcher.match('Remote', countries, cities).matched).toBe(true);
  });

  it('matches remote anchored to a target country', () => {
    expect(matcher.match('Remote, India', countries, cities).matched).toBe(true);
  });

  it('rejects remote scoped to an untargeted country', () => {
    const verdict = matcher.match('US, Remote', countries, cities);
    expect(verdict.matched).toBe(false);
    expect(verdict.detail).toContain('scoped to');
  });

  it('rejects US-remote written without a comma', () => {
    expect(matcher.match('US Remote', countries, cities).matched).toBe(false);
  });

  it('rejects a remote role scoped to another country entirely', () => {
    expect(matcher.match('Vietnam, Remote', countries, cities).matched).toBe(
      false,
    );
  });

  it('rejects an unrelated onsite location', () => {
    expect(matcher.match('Arlington, TX', countries, cities).matched).toBe(
      false,
    );
  });

  it('treats a missing location as no evidence', () => {
    expect(matcher.match(null, countries, cities).matched).toBe(false);
    expect(matcher.match('', countries, cities).matched).toBe(false);
  });

  it('does not mistake a city ending in "us" for the United States', () => {
    expect(matcher.match('Columbus, OH', countries, cities).matched).toBe(false);
  });
});
