import { describe, expect, it, vi } from 'vitest';
import {
  OracleProvider,
  parseOracleCareerUrl,
} from './OracleProvider.js';
import type { Company } from '../../../domain/entities/Company.js';

const company: Company = {
  id: 'co-1',
  name: 'Oracle',
  provider: 'oracle',
  careerUrl:
    'https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1?country=IN',
  enabled: true,
  frequency: '0 */12 * * *',
  lastRun: null,
};

describe('parseOracleCareerUrl', () => {
  it('parses site and country', () => {
    expect(parseOracleCareerUrl(company.careerUrl)).toMatchObject({
      host: 'eeho.fa.us2.oraclecloud.com',
      siteNumber: 'CX_1',
      country: 'IN',
    });
  });
});

describe('OracleProvider', () => {
  it('filters by country and normalizes', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                TotalJobsCount: 2,
                requisitionList: [
                  {
                    Id: '1',
                    Title: 'Cloud Engineer',
                    PrimaryLocation: 'Bengaluru, India',
                    PrimaryLocationCountry: 'IN',
                    PostedDate: '2026-08-01',
                    ShortDescriptionStr: '<p>Build OCI services</p>',
                  },
                  {
                    Id: '2',
                    Title: 'US Only Role',
                    PrimaryLocation: 'Austin, TX',
                    PrimaryLocationCountry: 'US',
                    PostedDate: '2026-08-01',
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    const provider = new OracleProvider({
      fetchImpl: fetchImpl as typeof fetch,
    });
    const jobs = await provider.fetchJobs(company);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: 'Cloud Engineer',
      location: 'Bengaluru, India',
      provider: 'oracle',
    });
    expect(jobs[0]?.description).toContain('OCI');
  });
});
