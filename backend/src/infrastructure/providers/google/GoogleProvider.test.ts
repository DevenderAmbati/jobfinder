import { describe, expect, it } from 'vitest';
import {
  extractGoogleJobsFromPayload,
  GoogleProvider,
  parseGoogleCareersHtml,
  resolveGoogleSearchUrl,
  resolveListedLocation,
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

describe('parseGoogleCareersHtml', () => {
  const html = `
    <li class="lLd3Je" ssk="18:131666108921848518">
      <h3 class="QJPWVe">Software Engineer Manager, Engineering Productivity</h3>
      <span class="r0wTof ">Bengaluru, Karnataka, India</span>
      <span class="r0wTof ">Bengaluru, Karnataka, India</span>
      <a href="jobs/results/131666108921848518-software-engineer?location=India" aria-label="Learn more about Software Engineer Manager, Engineering Productivity"></a>
    </li>
    <li class="lLd3Je">
      <h3>Account Representative</h3>
      <span class="r0wTof ">Chicago, IL, USA</span>
      <a href="jobs/results/999111222333444555-account"></a>
    </li>
  `;

  it('reads the heading and India office from each card', () => {
    const jobs = parseGoogleCareersHtml(
      html,
      'https://www.google.com/about/careers/applications/jobs/results/?location=India&q=Software',
    );
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      jobId: '131666108921848518',
      title: 'Software Engineer Manager, Engineering Productivity',
      location: 'Bengaluru, Karnataka, India',
    });
    expect(jobs[0]?.applyUrl).toContain('/jobs/results/131666108921848518');
    expect(jobs[1]?.location).toBe('Chicago, IL, USA');
  });

  it('uses India only when a card has no place text on an India search', () => {
    expect(resolveListedLocation([], true)).toBe('India');
    expect(resolveListedLocation(['+3 more'], true)).toBe('India');
    expect(resolveListedLocation(['Chicago, IL, USA'], true)).toBe('Chicago, IL, USA');
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
