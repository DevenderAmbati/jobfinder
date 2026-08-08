import { describe, expect, it, vi } from 'vitest';
import {
  extractLeverSiteSlug,
  formatLeverSalary,
  LeverProvider,
  resolveLeverApiBase,
} from './LeverProvider.js';
import type { Company } from '../../../domain/entities/Company.js';

const company: Company = {
  id: 'co-lever',
  name: 'Lever Co',
  provider: 'lever',
  careerUrl: 'https://jobs.lever.co/demo',
  enabled: true,
  frequency: '0 */6 * * *',
  lastRun: null,
};

describe('extractLeverSiteSlug', () => {
  it('parses jobs.lever.co URLs', () => {
    expect(extractLeverSiteSlug('https://jobs.lever.co/netflix')).toBe('netflix');
  });

  it('parses jobs.eu.lever.co URLs', () => {
    expect(extractLeverSiteSlug('https://jobs.eu.lever.co/olx')).toBe('olx');
  });

  it('parses API paths', () => {
    expect(
      extractLeverSiteSlug('https://api.lever.co/v0/postings/spotify'),
    ).toBe('spotify');
  });

  it('accepts raw slugs', () => {
    expect(extractLeverSiteSlug('leverdemo')).toBe('leverdemo');
  });
});

describe('resolveLeverApiBase', () => {
  it('uses EU API for jobs.eu.lever.co', () => {
    expect(resolveLeverApiBase('https://jobs.eu.lever.co/olx')).toBe(
      'https://api.eu.lever.co/v0/postings',
    );
  });

  it('uses US API for jobs.lever.co', () => {
    expect(resolveLeverApiBase('https://jobs.lever.co/meesho')).toBe(
      'https://api.lever.co/v0/postings',
    );
  });
});

describe('formatLeverSalary', () => {
  it('formats min/max ranges', () => {
    expect(
      formatLeverSalary({
        id: '1',
        text: 'Role',
        salaryRange: { currency: 'USD', interval: 'year', min: 100000, max: 140000 },
      }),
    ).toBe('USD 100000-140000 / year');
  });
});

describe('LeverProvider', () => {
  it('fetches with pagination and normalizes jobs', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('skip=0')) {
        return new Response(
          JSON.stringify([
            {
              id: 'a',
              text: 'Software Engineer',
              applyUrl: 'https://jobs.lever.co/demo/a/apply',
              hostedUrl: 'https://jobs.lever.co/demo/a',
              createdAt: 1_700_000_000_000,
              categories: {
                location: 'Hyderabad, India',
                team: 'Engineering',
                department: 'Product',
              },
              descriptionPlain: 'Build TypeScript and React apps.',
              workplaceType: 'hybrid',
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const provider = new LeverProvider({
      fetchImpl: fetchImpl as typeof fetch,
      pageSize: 1,
    });
    const jobs = await provider.fetchJobs(company);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: 'Software Engineer',
      location: 'Hyderabad, India',
      provider: 'lever',
      company: 'Lever Co',
      skills: 'Engineering, Product',
      applyUrl: 'https://jobs.lever.co/demo/a/apply',
    });
    expect(jobs[0]?.description).toContain('TypeScript');
  });

  it('throws on non-OK responses', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('missing', { status: 404 }),
    );
    const provider = new LeverProvider({ fetchImpl: fetchImpl as typeof fetch });
    await expect(provider.fetchJobs(company)).rejects.toThrow(/Lever HTTP 404/);
  });
});
