import { describe, expect, it, vi } from 'vitest';
import {
  extractGreenhouseBoardToken,
  GreenhouseProvider,
  stripHtml,
} from './GreenhouseProvider.js';
import type { Company } from '../../../domain/entities/Company.js';

const company: Company = {
  id: 'co-1',
  name: 'Acme',
  provider: 'greenhouse',
  careerUrl: 'https://boards.greenhouse.io/acme',
  enabled: true,
  frequency: '0 */6 * * *',
  lastRun: null,
};

describe('extractGreenhouseBoardToken', () => {
  it('parses boards.greenhouse.io URLs', () => {
    expect(
      extractGreenhouseBoardToken('https://boards.greenhouse.io/stripe'),
    ).toBe('stripe');
  });

  it('parses boards-api paths', () => {
    expect(
      extractGreenhouseBoardToken(
        'https://boards-api.greenhouse.io/v1/boards/notion/jobs',
      ),
    ).toBe('notion');
  });

  it('accepts raw tokens', () => {
    expect(extractGreenhouseBoardToken('anthropic')).toBe('anthropic');
  });
});

describe('stripHtml', () => {
  it('removes tags and collapses whitespace', () => {
    expect(stripHtml('<p>Hello <b>World</b></p>')).toBe('Hello World');
  });
});

describe('GreenhouseProvider', () => {
  it('fetches and normalizes jobs via mocked API', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          jobs: [
            {
              id: 1,
              title: 'Software Engineer',
              absolute_url: 'https://boards.greenhouse.io/acme/jobs/1',
              first_published: '2024-01-15T10:00:00.000Z',
              location: { name: 'Hyderabad, India' },
              content:
                '<div>Build &amp; ship <b>TypeScript</b> services with React.</div>',
              departments: [{ name: 'Engineering' }],
              metadata: [{ name: 'Salary', value: '30 LPA' }],
            },
            {
              id: 2,
              title: 'Engineering Manager',
              absolute_url: 'https://boards.greenhouse.io/acme/jobs/2',
              updated_at: '2024-02-01T10:00:00.000Z',
              location: { name: 'Remote' },
              content: '<p>Lead teams</p>',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const provider = new GreenhouseProvider({ fetchImpl: fetchImpl as typeof fetch });
    const jobs = await provider.fetchJobs(company);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      '/boards/acme/jobs?content=true',
    );
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      title: 'Software Engineer',
      location: 'Hyderabad, India',
      provider: 'greenhouse',
      company: 'Acme',
      salary: '30 LPA',
      skills: 'Engineering',
      applyUrl: 'https://boards.greenhouse.io/acme/jobs/1',
    });
    expect(jobs[0]?.description).toContain('Build & ship TypeScript services');
    expect(jobs[0]?.description).not.toContain('<b>');
  });

  it('throws on non-OK responses', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('not found', { status: 404 }),
    );
    const provider = new GreenhouseProvider({ fetchImpl: fetchImpl as typeof fetch });
    await expect(provider.fetchJobs(company)).rejects.toThrow(/Greenhouse HTTP 404/);
  });
});
