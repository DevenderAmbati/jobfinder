import { describe, expect, it } from 'vitest';
import {
  AppleProvider,
  applePostLocationId,
  extractAppleJobsFromPayload,
  locationFromAppleCard,
  parseAppleSearchHtml,
  pickAppleTitle,
  resolveAppleSearchUrl,
  withIndiaFallback,
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

describe('Apple listing text', () => {
  it('strips link chrome and keeps the role title', () => {
    expect(
      pickAppleTitle(
        'See full role description',
        'See full role description: Software Eng - Content Management Systems',
      ),
    ).toBe('Software Eng - Content Management Systems');
  });

  it('reads India locations from the card text', () => {
    expect(
      locationFromAppleCard('IN-Business Expert Location Various Locations within India'),
    ).toBe('Various Locations within India');
    expect(locationFromAppleCard('Software Engineer Bengaluru, Karnataka, India')).toBe(
      'Bengaluru, Karnataka, India',
    );
  });

  it('maps the public India search URL onto the jobs API filter', () => {
    expect(
      applePostLocationId('https://jobs.apple.com/en-us/search?location=india-INDC'),
    ).toBe('postLocation-INDC');
    expect(withIndiaFallback(null, 'https://jobs.apple.com/en-us/search?location=india-INDC')).toBe(
      'India',
    );
  });
});

describe('parseAppleSearchHtml', () => {
  it('reads title, city, and team from a job card', () => {
    const html = `
      <div class="job-title job-list-item">
        <h3><a href="/en-us/details/200684375-1052/integration-engineering-software-engineer?team=SFTWR">Integration Engineering - Software Engineer</a></h3>
        <span class="team-name mt-0">Software and Services</span>
        <span class="job-posted-date">Sep 18, 2026</span>
        <span id="search-store-name-container-1">Hyderabad</span>
      </div>
    `;
    const jobs = parseAppleSearchHtml(
      html,
      'https://jobs.apple.com/en-us/search?location=india-INDC',
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      jobId: '200684375-1052',
      title: 'Integration Engineering - Software Engineer',
      location: 'Hyderabad, India',
      team: 'Software and Services',
    });
    expect(jobs[0]?.applyUrl).toContain('/details/200684375-1052/');
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
