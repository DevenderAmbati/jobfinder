import { describe, expect, it } from 'vitest';
import {
  GoldmanProvider,
  parseGoldmanCareerUrl,
} from './GoldmanProvider.js';

describe('parseGoldmanCareerUrl', () => {
  it('defaults to software + India', () => {
    expect(parseGoldmanCareerUrl('https://higher.gs.com/')).toEqual({
      searchTerm: 'software',
      location: 'India',
      experiences: ['EARLY_CAREER', 'PROFESSIONAL'],
    });
  });

  it('reads query and location params', () => {
    expect(
      parseGoldmanCareerUrl(
        'https://higher.gs.com/?query=engineer&location=United%20Kingdom',
      ),
    ).toMatchObject({
      searchTerm: 'engineer',
      location: 'United Kingdom',
    });
  });
});

describe('GoldmanProvider.normalize', () => {
  it('builds a higher.gs.com apply URL from the role id', () => {
    const provider = new GoldmanProvider({
      fetchImpl: async () => new Response('{}'),
    });
    const job = provider.normalize(
      {
        roleId: '180200_GS_MID_CAREER',
        jobTitle: 'Software Engineer',
        division: 'Engineering',
        locations: [{ city: 'Bengaluru', country: 'India' }],
        skills: ['Java'],
      },
      {
        id: '1',
        name: 'Goldman Sachs',
        provider: 'goldman',
        careerUrl: 'https://higher.gs.com/',
        enabled: true,
        frequency: '0 */12 * * *',
        lastRun: null,
      },
    );
    expect(job.applyUrl).toBe('https://higher.gs.com/roles/180200');
    expect(job.location).toContain('India');
    expect(job.provider).toBe('goldman');
  });
});
