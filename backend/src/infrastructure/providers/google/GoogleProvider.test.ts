import { describe, expect, it } from 'vitest';
import {
  extractGoogleJobsFromPayload,
  GoogleProvider,
  resolveGoogleSearchUrl,
} from './GoogleProvider.js';
import type { Company } from '../../../domain/entities/Company.js';

const company: Company = {
  id: 'co-goog',
  name: 'Google',
  provider: 'google',
  careerUrl:
    'https://www.google.com/about/careers/applications/jobs/results/?location=India&q=Software',
  enabled: true,
  frequency: '0 */6 * * *',
  lastRun: null,
};

describe('resolveGoogleSearchUrl', () => {
  it('keeps full URLs', () => {
    expect(resolveGoogleSearchUrl(company.careerUrl)).toBe(company.careerUrl);
  });

  it('builds a default India search from keywords', () => {
    const url = resolveGoogleSearchUrl('typescript');
    expect(url).toContain('google.com/about/careers');
    expect(url).toContain('typescript');
    expect(url).toContain('location=India');
  });
});

describe('extractGoogleJobsFromPayload', () => {
  it('finds nested job objects', () => {
    const jobs = extractGoogleJobsFromPayload({
      jobs: [
        {
          id: '123',
          title: 'Software Engineer',
          location: 'Bengaluru, India',
          summary: 'Build Search',
        },
      ],
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      jobId: '123',
      title: 'Software Engineer',
      location: 'Bengaluru, India',
    });
    expect(jobs[0]?.applyUrl).toContain('/jobs/results/123');
  });
});

describe('GoogleProvider', () => {
  it('normalizes listing fetcher results', async () => {
    const provider = new GoogleProvider({
      listingFetcher: async () => [
        {
          jobId: '1',
          title: 'Software Engineer',
          location: 'Hyderabad, India',
          description: '<p>TypeScript</p>',
          applyUrl:
            'https://www.google.com/about/careers/applications/jobs/results/1',
          postedDate: new Date('2026-01-01'),
        },
      ],
    });

    const jobs = await provider.fetchJobs(company);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      company: 'Google',
      provider: 'google',
      title: 'Software Engineer',
      description: 'TypeScript',
    });
  });
});
