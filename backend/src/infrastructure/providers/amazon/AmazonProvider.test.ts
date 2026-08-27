import { describe, expect, it } from 'vitest';
import {
  AmazonProvider,
  resolveAmazonSearchUrl,
  withAmazonOffset,
} from './AmazonProvider.js';
import type { Company } from '../../../domain/entities/Company.js';

const company: Company = {
  id: 'co-amz',
  name: 'Amazon',
  provider: 'amazon',
  careerUrl:
    'https://www.amazon.jobs/en/search.json?base_query=&country[]=IND&offset=0&result_limit=100',
  enabled: true,
  frequency: '0 */6 * * *',
  lastRun: null,
};

describe('resolveAmazonSearchUrl', () => {
  it('keeps amazon.jobs JSON URLs', () => {
    expect(resolveAmazonSearchUrl(company.careerUrl)).toContain(
      'amazon.jobs',
    );
    expect(resolveAmazonSearchUrl(company.careerUrl)).toContain('search.json');
  });

  it('normalizes HTML search paths to search.json', () => {
    const url = resolveAmazonSearchUrl(
      'https://www.amazon.jobs/en/search?country[]=IND',
    );
    expect(url).toContain('search.json');
  });
});

describe('withAmazonOffset', () => {
  it('updates offset and limit', () => {
    const next = withAmazonOffset(company.careerUrl, 100, 50);
    expect(next).toContain('offset=100');
    expect(next).toContain('result_limit=50');
  });
});

describe('AmazonProvider', () => {
  it('paginates and normalizes listings', async () => {
    const pages: Record<string, unknown> = {
      '0': {
        hits: 2,
        jobs: [
          {
            id: '1',
            title: 'SDE II',
            location: 'IN, KA, Bengaluru',
            description_short: 'Build services',
            job_path: '/en/jobs/1/sde-ii',
            posted_date: 'August 1, 2026',
            job_category: 'Software Development',
          },
        ],
      },
      '1': {
        hits: 2,
        jobs: [
          {
            id: '2',
            title: 'SDE I',
            location: 'IN, TS, Hyderabad',
            job_path: '/en/jobs/2/sde-i',
            url_next_step: 'https://account.amazon.jobs/jobs/2/apply',
          },
        ],
      },
    };

    const provider = new AmazonProvider({
      pageSize: 1,
      maxPages: 3,
      fetchImpl: async (input) => {
        const url = String(input);
        const offset = new URL(url).searchParams.get('offset') ?? '0';
        const body = pages[offset] ?? { hits: 2, jobs: [] };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    const jobs = await provider.fetchJobs(company);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      title: 'SDE II',
      company: 'Amazon',
      provider: 'amazon',
      location: 'IN, KA, Bengaluru',
      skills: 'Software Development',
    });
    expect(jobs[0]?.applyUrl).toContain('/en/jobs/1/');
    expect(jobs[1]?.applyUrl).toContain('account.amazon.jobs');
  });
});
