import { describe, expect, it, vi } from 'vitest';
import {
  SmartRecruitersProvider,
  formatSmartRecruitersLocation,
  parseSmartRecruitersCareerUrl,
} from './SmartRecruitersProvider.js';
import type { Company } from '../../../domain/entities/Company.js';

const company: Company = {
  id: 'co-1',
  name: 'Freshworks',
  provider: 'smartrecruiters',
  careerUrl: 'https://careers.smartrecruiters.com/Freshworks?country=in',
  enabled: true,
  frequency: '0 */6 * * *',
  lastRun: null,
};

describe('parseSmartRecruitersCareerUrl', () => {
  it('parses careers host + country query', () => {
    expect(
      parseSmartRecruitersCareerUrl(
        'https://careers.smartrecruiters.com/Freshworks?country=in',
      ),
    ).toEqual({ companyId: 'Freshworks', country: 'in' });
  });

  it('parses API postings paths', () => {
    expect(
      parseSmartRecruitersCareerUrl(
        'https://api.smartrecruiters.com/v1/companies/BoschGroup/postings?country=in',
      ),
    ).toEqual({ companyId: 'BoschGroup', country: 'in' });
  });

  it('accepts raw company ids', () => {
    expect(parseSmartRecruitersCareerUrl('BoschGroup')).toEqual({
      companyId: 'BoschGroup',
    });
  });
});

describe('formatSmartRecruitersLocation', () => {
  it('prefers fullLocation', () => {
    expect(
      formatSmartRecruitersLocation({
        city: 'Bengaluru',
        country: 'in',
        fullLocation: 'Bengaluru, , India',
      }),
    ).toBe('Bengaluru, India');
  });

  it('falls back to remote', () => {
    expect(formatSmartRecruitersLocation({ remote: true })).toBe('Remote');
  });
});

describe('SmartRecruitersProvider', () => {
  it('paginates, fetches details, and normalizes', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/postings?') && !url.includes('/postings/')) {
        return new Response(
          JSON.stringify({
            totalFound: 1,
            content: [
              {
                id: '111',
                name: 'Senior Backend Engineer',
                releasedDate: '2026-08-01T00:00:00.000Z',
                location: {
                  city: 'Bengaluru',
                  country: 'in',
                  fullLocation: 'Bengaluru, India',
                },
                function: { label: 'Engineering' },
                experienceLevel: { label: 'Senior' },
                ref: 'https://api.smartrecruiters.com/v1/companies/Freshworks/postings/111',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          id: '111',
          name: 'Senior Backend Engineer',
          applyUrl: 'https://jobs.smartrecruiters.com/Freshworks/111',
          experienceLevel: { label: 'Senior' },
          function: { label: 'Engineering' },
          jobAd: {
            sections: {
              jobDescription: {
                title: 'About the role',
                text: '<p>Build Node and TypeScript services.</p>',
              },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const provider = new SmartRecruitersProvider({
      fetchImpl: fetchImpl as typeof fetch,
    });
    const jobs = await provider.fetchJobs(company);

    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      '/companies/Freshworks/postings?',
    );
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('country=in');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: 'Senior Backend Engineer',
      location: 'Bengaluru, India',
      experience: 'Senior',
      provider: 'smartrecruiters',
      applyUrl: 'https://jobs.smartrecruiters.com/Freshworks/111',
    });
    expect(jobs[0]?.description).toContain('Node');
  });

  it('builds apply URLs from board company id when detail is skipped', () => {
    const provider = new SmartRecruitersProvider({ includeDetails: false });
    const job = provider.normalize(
      {
        id: '99',
        name: 'Engineer',
        location: { fullLocation: 'Pune, India' },
      },
      company,
      'Freshworks',
    );
    expect(job.applyUrl).toBe(
      'https://jobs.smartrecruiters.com/Freshworks/99',
    );
  });

  it('throws on non-OK list responses', async () => {
    const provider = new SmartRecruitersProvider({
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
