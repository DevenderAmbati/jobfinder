import { describe, expect, it, vi } from 'vitest';
import {
  parseWorkdayCareerUrl,
  parseWorkdayPostedOn,
  WorkdayProvider,
} from './WorkdayProvider.js';
import type { Company } from '../../../domain/entities/Company.js';

const company: Company = {
  id: 'co-wd',
  name: 'Nvidia Demo',
  provider: 'workday',
  careerUrl:
    'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite',
  enabled: true,
  frequency: '0 */6 * * *',
  lastRun: null,
};

describe('parseWorkdayCareerUrl', () => {
  it('parses locale + site URLs', () => {
    expect(
      parseWorkdayCareerUrl(
        'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite',
      ),
    ).toEqual({
      host: 'nvidia.wd5.myworkdayjobs.com',
      tenant: 'nvidia',
      site: 'NVIDIAExternalCareerSite',
    });
  });

  it('parses CXS paths', () => {
    expect(
      parseWorkdayCareerUrl(
        'https://acme.wd3.myworkdayjobs.com/wday/cxs/acme/External/jobs',
      ),
    ).toEqual({
      host: 'acme.wd3.myworkdayjobs.com',
      tenant: 'acme',
      site: 'External',
    });
  });
});

describe('parseWorkdayPostedOn', () => {
  it('returns null for relative posted labels', () => {
    expect(parseWorkdayPostedOn('Posted 30+ Days Ago')).toBeNull();
  });
});

describe('WorkdayProvider', () => {
  it('paginates list endpoint and normalizes with details', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/jobs') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { offset: number };
        if (body.offset === 0) {
          return new Response(
            JSON.stringify({
              total: 2,
              jobPostings: [
                {
                  title: 'Software Engineer',
                  externalPath: '/job/Hyderabad/Software-Engineer_R1',
                  locationsText: 'Hyderabad, India',
                  bulletFields: ['JR1'],
                },
                {
                  title: 'Backend Engineer',
                  externalPath: '/job/Remote/Backend-Engineer_R2',
                  locationsText: 'Remote, India',
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({ total: 0, jobPostings: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/job/')) {
        return new Response(
          JSON.stringify({
            jobPostingInfo: {
              title: 'Software Engineer',
              jobDescription: '<p>Build <b>TypeScript</b> services</p>',
              location: 'Hyderabad, India',
              startDate: '2024-05-01',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('unexpected', { status: 500 });
    });

    const provider = new WorkdayProvider({
      fetchImpl: fetchImpl as typeof fetch,
      includeDetails: true,
    });
    const jobs = await provider.fetchJobs(company);

    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      title: 'Software Engineer',
      location: 'Hyderabad, India',
      provider: 'workday',
      company: 'Nvidia Demo',
    });
    expect(jobs[0]?.description).toContain('Build TypeScript services');
    expect(jobs[0]?.applyUrl).toContain('NVIDIAExternalCareerSite');
  });

  it('refetches large boards with the India country facet', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        offset: number;
        appliedFacets: { Country?: string[] };
      };
      if (!body.appliedFacets.Country) {
        return new Response(
          JSON.stringify({
            total: 400,
            jobPostings: [
              {
                title: 'Ignored global role',
                externalPath: '/job/Austin/Role_R0',
                locationsText: 'Austin, TX',
              },
            ],
            facets: [
              {
                facetParameter: 'Country',
                values: [{ descriptor: 'India', id: 'india-1', count: 3 }],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          total: 1,
          jobPostings: [
            {
              title: 'Pune Engineer',
              externalPath: '/job/Pune/Engineer_R1',
              locationsText: 'Pune, India',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const provider = new WorkdayProvider({
      fetchImpl: fetchImpl as typeof fetch,
      includeDetails: false,
    });
    const jobs = await provider.fetchJobs(company);

    expect(jobs.map((job) => job.title)).toEqual(['Pune Engineer']);
    const secondBody = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body)) as {
      appliedFacets: { Country: string[] };
    };
    expect(secondBody.appliedFacets.Country).toEqual(['india-1']);
  });

  it('rejects an HTML job list instead of parsing it', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('<!DOCTYPE html><html></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
    );
    const provider = new WorkdayProvider({
      fetchImpl: fetchImpl as typeof fetch,
      includeDetails: false,
    });
    await expect(provider.fetchJobs(company)).rejects.toThrow(
      /page instead of job data/,
    );
  });

  it('throws on list HTTP errors', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('blocked', { status: 403 }),
    );
    const provider = new WorkdayProvider({
      fetchImpl: fetchImpl as typeof fetch,
      includeDetails: false,
    });
    await expect(provider.fetchJobs(company)).rejects.toThrow(/Workday HTTP 403/);
  });
});
