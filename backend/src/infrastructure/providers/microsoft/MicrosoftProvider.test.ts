import { describe, expect, it } from 'vitest';
import {
  extractMicrosoftJobsFromPayload,
  MicrosoftProvider,
  resolveMicrosoftSearchUrl,
} from './MicrosoftProvider.js';
import type { Company } from '../../../domain/entities/Company.js';

const company: Company = {
  id: 'co-ms',
  name: 'Microsoft',
  provider: 'microsoft',
  careerUrl:
    'https://jobs.careers.microsoft.com/global/en/search?q=software&l=en_us&pg=1&pgSz=20',
  enabled: true,
  frequency: '0 */6 * * *',
  lastRun: null,
};

describe('resolveMicrosoftSearchUrl', () => {
  it('keeps full URLs', () => {
    expect(resolveMicrosoftSearchUrl(company.careerUrl)).toBe(company.careerUrl);
  });

  it('builds a default search from keywords', () => {
    expect(resolveMicrosoftSearchUrl('typescript india')).toContain(
      'jobs.careers.microsoft.com',
    );
    expect(resolveMicrosoftSearchUrl('typescript india')).toContain(
      'typescript%20india',
    );
  });
});

describe('extractMicrosoftJobsFromPayload', () => {
  it('finds nested job objects', () => {
    const jobs = extractMicrosoftJobsFromPayload({
      data: {
        jobs: [
          {
            jobId: '1823456',
            title: 'Software Engineer',
            location: 'Hyderabad, India',
            descriptionTeaser: 'Build cloud services with TypeScript',
            category: 'Engineering',
          },
        ],
      },
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      jobId: '1823456',
      title: 'Software Engineer',
      location: 'Hyderabad, India',
      category: 'Engineering',
    });
    expect(jobs[0]?.applyUrl).toContain('/job/1823456');
  });
});

describe('MicrosoftProvider', () => {
  it('normalizes listing fetcher results', async () => {
    const provider = new MicrosoftProvider({
      listingFetcher: async () => [
        {
          jobId: '1',
          title: 'Software Engineer II',
          location: 'Hyderabad, India',
          description: '<p>TypeScript and React</p>',
          applyUrl: 'https://jobs.careers.microsoft.com/global/en/job/1',
          postedDate: new Date('2024-01-01'),
          category: 'Software Engineering',
        },
        {
          jobId: '2',
          title: 'Engineering Manager',
          location: 'Bangalore, India',
          description: 'Lead teams',
          applyUrl: 'https://jobs.careers.microsoft.com/global/en/job/2',
          postedDate: null,
          category: null,
        },
      ],
    });

    const jobs = await provider.fetchJobs(company);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      provider: 'microsoft',
      company: 'Microsoft',
      title: 'Software Engineer II',
      skills: 'Software Engineering',
    });
    expect(jobs[0]?.description).toBe('TypeScript and React');
  });
});
