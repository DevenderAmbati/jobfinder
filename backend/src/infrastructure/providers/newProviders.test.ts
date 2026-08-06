import { describe, expect, it } from 'vitest';
import {
  parseEightfoldCareerUrl,
  parseEightfoldDate,
} from './eightfold/EightfoldProvider.js';
import { parseAvatureSearchHtml } from './avature/AvatureProvider.js';
import { parseSapSearchHtml } from './sap/SapProvider.js';
import { extractJobLinksFromHtml } from './custom/CustomProvider.js';

describe('parseEightfoldCareerUrl', () => {
  it('reads domain and location from careers URL', () => {
    expect(
      parseEightfoldCareerUrl(
        'https://aexp.eightfold.ai/careers?domain=aexp.com&location=India',
      ),
    ).toEqual({
      host: 'aexp.eightfold.ai',
      domain: 'aexp.com',
      location: 'India',
      careerPageUrl:
        'https://aexp.eightfold.ai/careers?domain=aexp.com&location=India',
    });
  });

  it('accepts white-label careers hosts with domain query', () => {
    expect(
      parseEightfoldCareerUrl(
        'https://careers.qualcomm.com/careers?domain=qualcomm.com&location=India',
      ),
    ).toEqual({
      host: 'careers.qualcomm.com',
      domain: 'qualcomm.com',
      location: 'India',
      careerPageUrl:
        'https://careers.qualcomm.com/careers?domain=qualcomm.com&location=India',
    });
  });
});

describe('parseEightfoldDate', () => {
  it('handles epoch seconds', () => {
    expect(parseEightfoldDate(1_700_000_000)?.toISOString()).toBe(
      '2023-11-14T22:13:20.000Z',
    );
  });
});

describe('parseAvatureSearchHtml', () => {
  it('extracts JobDetail ids and titles', () => {
    const html = `
      <a data-jobname="Software Engineer" href="/en_US/externaljobs/JobDetail/513160">x</a>
      JobDetail/513160
      <a data-jobname="Intern" href="https://jobs.siemens.com/en_US/externaljobs/JobDetail/99">y</a>
    `;
    const jobs = parseAvatureSearchHtml(html);
    expect(jobs.some((job) => job.id === '513160')).toBe(true);
    expect(jobs.find((job) => job.id === '513160')?.title).toContain('Software');
  });
});

describe('parseSapSearchHtml', () => {
  it('extracts /job paths', () => {
    const html = `
      <a href="/job/Bangalore-Backend-Engineer-123/1407751433/">Backend Engineer</a>
    `;
    const jobs = parseSapSearchHtml(html);
    expect(jobs[0]?.path).toContain('/job/Bangalore-Backend-Engineer-123/1407751433');
  });
});

describe('extractJobLinksFromHtml', () => {
  it('keeps career job links', () => {
    const html = `
      <a href="/jobs/opening-42">Frontend Engineer</a>
      <a href="/about">About us</a>
    `;
    const jobs = extractJobLinksFromHtml(html, 'https://careers.example.com');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe('Frontend Engineer');
  });
});
