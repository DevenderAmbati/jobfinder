import { describe, expect, it, vi } from 'vitest';
import {
  SuccessFactorsProvider,
  buildSuccessFactorsDetailUrl,
  discoverCategoryIds,
  formatSuccessFactorsLocation,
  parseSuccessFactorsCareerUrl,
  parseSuccessFactorsDate,
} from './SuccessFactorsProvider.js';
import type { Company } from '../../../domain/entities/Company.js';

const company: Company = {
  id: 'co-1',
  name: 'Demo CSB',
  provider: 'successfactors',
  careerUrl: 'https://wlgore.jobs.hr.cloud.sap',
  enabled: true,
  frequency: '0 */12 * * *',
  lastRun: null,
};

describe('parseSuccessFactorsCareerUrl', () => {
  it('accepts CSB cloud hosts', () => {
    expect(
      parseSuccessFactorsCareerUrl('https://wlgore.jobs.hr.cloud.sap/'),
    ).toBe('https://wlgore.jobs.hr.cloud.sap');
  });

  it('rejects legacy successfactors hosts', () => {
    expect(() =>
      parseSuccessFactorsCareerUrl(
        'https://career2.successfactors.eu/career?company=siemens',
      ),
    ).toThrow(/Career Site Builder/);
  });
});

describe('discoverCategoryIds', () => {
  it('extracts /go category paths', () => {
    expect(
      discoverCategoryIds(
        '<a href="/go/Engineering/123/">Engineering</a><a href="/go/Sales/456">Sales</a>',
      ),
    ).toEqual([123, 456]);
  });

  it('falls back to category 0', () => {
    expect(discoverCategoryIds('<html></html>')).toEqual([0]);
  });
});

describe('formatSuccessFactorsLocation', () => {
  it('strips br tags from short location', () => {
    expect(
      formatSuccessFactorsLocation({
        jobLocationShort: ['Bengaluru<br/>India'],
      }),
    ).toBe('Bengaluru, India');
  });
});

describe('parseSuccessFactorsDate', () => {
  it('parses US short dates', () => {
    expect(parseSuccessFactorsDate('8/5/26')?.toISOString()).toBe(
      '2026-08-05T00:00:00.000Z',
    );
  });
});

describe('buildSuccessFactorsDetailUrl', () => {
  it('builds job deep links', () => {
    expect(
      buildSuccessFactorsDetailUrl('https://wlgore.jobs.hr.cloud.sap', {
        id: 99,
        unifiedUrlTitle: 'Software-Engineer',
        supportedLocales: ['en_US'],
      }),
    ).toBe(
      'https://wlgore.jobs.hr.cloud.sap/job/Software-Engineer/99-en_US',
    );
  });
});

describe('SuccessFactorsProvider', () => {
  it('opens a session, searches, and normalizes', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('.cloud.sap') || url.endsWith('.cloud.sap/')) {
        return new Response(
          '<html><meta name="csrf-token" content="tok-1" /><a href="/go/All/0/">All</a></html>',
          {
            status: 200,
            headers: {
              'Content-Type': 'text/html',
              'Set-Cookie': 'JSESSIONID=abc; Path=/',
            },
          },
        );
      }
      if (url.includes('/services/recruiting/v1/jobs') && init?.method === 'POST') {
        expect((init.headers as Record<string, string>)['x-csrf-token']).toBe(
          'tok-1',
        );
        return new Response(
          JSON.stringify({
            totalJobs: 1,
            jobSearchResult: [
              {
                response: {
                  id: 42,
                  unifiedStandardTitle: 'Software Engineer',
                  unifiedUrlTitle: 'Software-Engineer',
                  jobLocationShort: ['Bengaluru, India'],
                  unifiedStandardStart: '8/1/26',
                  supportedLocales: ['en_US'],
                  businessUnit_obj: ['Engineering'],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        '<div class="job-description"><p>Build React apps.</p></div>',
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    });

    const provider = new SuccessFactorsProvider({
      fetchImpl: fetchImpl as typeof fetch,
    });
    const jobs = await provider.fetchJobs(company);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: 'Software Engineer',
      location: 'Bengaluru, India',
      provider: 'successfactors',
      skills: 'Engineering',
    });
    expect(jobs[0]?.applyUrl).toContain('/job/Software-Engineer/42-en_US');
    expect(jobs[0]?.description).toContain('React');
  });

  it('throws on search failures', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes('/services/')) {
        return new Response('<html></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return new Response('nope', { status: 403 });
    });

    const provider = new SuccessFactorsProvider({
      fetchImpl: fetchImpl as typeof fetch,
      includeDetails: false,
    });

    await expect(provider.fetchJobs(company)).rejects.toMatchObject({
      code: 'PROVIDER_FETCH_FAILED',
    });
  });
});
