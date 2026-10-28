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

  it('keeps numbered career slugs such as D. E. Shaw postings', () => {
    const html = `
      <a href="/careers/lead-tech-hc-dev-6537">Lead Tech</a>
      <a href="/careers/benefits">Benefits</a>
    `;
    const jobs = extractJobLinksFromHtml(html, 'https://www.deshawindia.com');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.applyUrl).toContain('/careers/lead-tech-hc-dev-6537');
  });

  it('keeps an Indian city written next to the job link', () => {
    const html = `
      <a href="/jobs/opening-9">Backend Engineer Hyderabad</a>
    `;
    const jobs = extractJobLinksFromHtml(
      html,
      'https://careers.unitedhealthgroup.com/search-jobs/India',
    );
    expect(jobs[0]?.location).toBe('Hyderabad, India');
  });
});

describe('parseExaleadCareerHits', () => {
  it('keeps India Dassault hits and skips other countries', async () => {
    const { parseExaleadCareerHits } = await import('./custom/CustomProvider.js');
    const xml = `
      <Hit>
        <Meta name="content_title"><MetaString name="value">Java Developer</MetaString></Meta>
        <Meta name="content_cta_1_url"><MetaString name="value">https://www.3ds.com/careers/jobs/java-developer-1</MetaString></Meta>
        <Meta name="content_categories"><MetaString name="value">Country/India City/India, MH, Pune</MetaString></Meta>
        <Meta name="content_start_datetime"><MetaString name="value">2026/10/02 04:22:19</MetaString></Meta>
      </Hit>
      <Hit>
        <Meta name="content_title"><MetaString name="value">US Role</MetaString></Meta>
        <Meta name="content_cta_1_url"><MetaString name="value">https://www.3ds.com/careers/jobs/us-role-2</MetaString></Meta>
        <Meta name="content_categories"><MetaString name="value">Country/United States</MetaString></Meta>
      </Hit>
    `;
    const jobs = parseExaleadCareerHits(xml);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe('Java Developer');
    expect(jobs[0]?.location).toBe('India, MH, Pune');
  });
});
