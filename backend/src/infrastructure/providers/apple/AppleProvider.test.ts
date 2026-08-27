import { describe, expect, it } from 'vitest';
import {
  AppleProvider,
  extractAppleJobsFromPayload,
  resolveAppleSearchUrl,
} from './AppleProvider.js';
import type { Company } from '../../../domain/entities/Company.js';

const company: Company = {
  id: 'co-apple',
  name: 'Apple',
  provider: 'apple',
  careerUrl: 'https://jobs.apple.com/en-us/search?location=india-INDC',
  enabled: true,
  frequency: '0 */6 * * *',
  lastRun: null,
};

describe('resolveAppleSearchUrl', () => {
  it('keeps full URLs', () => {
    expect(resolveAppleSearchUrl(company.careerUrl)).toBe(company.careerUrl);
  });

  it('falls back to India search for bare keywords', () => {
    expect(resolveAppleSearchUrl('software')).toContain('jobs.apple.com');
    expect(resolveAppleSearchUrl('software')).toContain('india-INDC');
  });
});

describe('extractAppleJobsFromPayload', () => {
  it('finds nested job objects', () => {
    const jobs = extractAppleJobsFromPayload({
      searchResults: [
        {
          positionId: '200123456',
          postingTitle: 'Software Engineer',
          locations: [{ name: 'Bengaluru' }],
          teamName: 'IS&T',
          jobSummary: 'Build internal tools',
        },
      ],
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      jobId: '200123456',
      title: 'Software Engineer',
      location: 'Bengaluru',
      team: 'IS&T',
    });
    expect(jobs[0]?.applyUrl).toContain('/details/200123456');
  });
});

describe('AppleProvider', () => {
  it('normalizes listing fetcher results', async () => {
    const provider = new AppleProvider({
      listingFetcher: async () => [
        {
          jobId: '1',
          title: 'ML Engineer',
          location: 'Hyderabad, India',
          description: '<p>PyTorch</p>',
          applyUrl: 'https://jobs.apple.com/en-us/details/1',
          postedDate: new Date('2026-02-01'),
          team: 'AIML',
        },
      ],
    });

    const jobs = await provider.fetchJobs(company);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      company: 'Apple',
      provider: 'apple',
      title: 'ML Engineer',
      description: 'PyTorch',
      skills: 'AIML',
    });
  });
});
