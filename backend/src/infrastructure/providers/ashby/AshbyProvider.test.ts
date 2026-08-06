import { describe, expect, it, vi } from 'vitest';
import {
  AshbyProvider,
  extractAshbyBoardSlug,
  formatAshbyLocation,
  formatAshbySalary,
} from './AshbyProvider.js';
import type { Company } from '../../../domain/entities/Company.js';

const company: Company = {
  id: 'co-1',
  name: 'Sarvam AI',
  provider: 'ashby',
  careerUrl: 'https://jobs.ashbyhq.com/sarvam',
  enabled: true,
  frequency: '0 */6 * * *',
  lastRun: null,
};

describe('extractAshbyBoardSlug', () => {
  it('parses jobs.ashbyhq.com URLs', () => {
    expect(extractAshbyBoardSlug('https://jobs.ashbyhq.com/sarvam')).toBe(
      'sarvam',
    );
  });

  it('parses posting-api paths', () => {
    expect(
      extractAshbyBoardSlug(
        'https://api.ashbyhq.com/posting-api/job-board/sarvam?includeCompensation=true',
      ),
    ).toBe('sarvam');
  });

  it('accepts raw board slugs', () => {
    expect(extractAshbyBoardSlug('sarvam')).toBe('sarvam');
  });
});

describe('formatAshbyLocation', () => {
  it('joins primary and secondary locations', () => {
    expect(
      formatAshbyLocation({
        location: 'Bengaluru',
        secondaryLocations: [{ location: 'Delhi' }],
      }),
    ).toBe('Bengaluru; Delhi');
  });

  it('falls back to remote when flagged', () => {
    expect(formatAshbyLocation({ isRemote: true })).toBe('Remote');
  });
});

describe('formatAshbySalary', () => {
  it('prefers scrapeable compensation summary', () => {
    expect(
      formatAshbySalary({
        compensation: {
          scrapeableCompensationSalarySummary: '₹30–50 LPA',
          compensationTierSummary: 'ignored',
        },
      }),
    ).toBe('₹30–50 LPA');
  });
});

describe('AshbyProvider', () => {
  it('fetches and normalizes listed jobs via mocked API', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            jobs: [
              {
                id: '1',
                title: 'Frontend Engineer',
                department: 'Engineering',
                team: 'Product',
                employmentType: 'FullTime',
                location: 'Bengaluru',
                publishedAt: '2026-06-03T17:19:08.998+00:00',
                isListed: true,
                isRemote: false,
                applyUrl: 'https://jobs.ashbyhq.com/sarvam/1/application',
                jobUrl: 'https://jobs.ashbyhq.com/sarvam/1',
                descriptionPlain:
                  'Build React and TypeScript product surfaces.',
                compensation: {
                  scrapeableCompensationSalarySummary: '₹30–45 LPA',
                },
              },
              {
                id: '2',
                title: 'Hidden Role',
                isListed: false,
                applyUrl: 'https://jobs.ashbyhq.com/sarvam/2/application',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    const provider = new AshbyProvider({
      fetchImpl: fetchImpl as typeof fetch,
    });
    const jobs = await provider.fetchJobs(company);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      '/posting-api/job-board/sarvam',
    );
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      'includeCompensation=true',
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: 'Frontend Engineer',
      location: 'Bengaluru',
      salary: '₹30–45 LPA',
      provider: 'ashby',
      skills: 'Engineering, Product, FullTime',
    });
    expect(jobs[0]?.description).toContain('React');
  });

  it('throws on non-OK responses', async () => {
    const provider = new AshbyProvider({
      fetchImpl: vi.fn(
        async () =>
          new Response('missing', {
            status: 404,
            headers: { 'Content-Type': 'text/plain' },
          }),
      ) as typeof fetch,
    });

    await expect(provider.fetchJobs(company)).rejects.toMatchObject({
      code: 'PROVIDER_FETCH_FAILED',
    });
  });
});
