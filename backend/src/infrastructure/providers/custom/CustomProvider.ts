import type { Company } from '../../../domain/entities/Company.js';
import type { Job } from '../../../domain/entities/Job.js';
import type { JobProvider } from '../../../domain/ports/JobProvider.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/utils/logger.js';
import { stripHtml } from '../../../shared/utils/html.js';
import { withChromiumBrowser } from '../../playwright/browserSession.js';

export interface CustomScrapedJob {
  title: string;
  applyUrl: string;
  location?: string | null;
  description?: string | null;
  postedDate?: Date | null;
}

export type CustomListingFetcher = (
  company: Company,
  careerUrl: string,
) => Promise<CustomScrapedJob[]>;

interface CustomProviderDeps {
  listingFetcher?: CustomListingFetcher;
  maxJobs?: number;
}

/**
 * Generic careers-page adapter for sites without a public ATS JSON API.
 * Prefer injecting a Playwright listing fetcher in production wiring.
 */
export class CustomProvider implements JobProvider {
  readonly name = 'custom';
  private readonly listingFetcher: CustomListingFetcher;
  private readonly maxJobs: number;

  constructor(deps: CustomProviderDeps = {}) {
    this.listingFetcher =
      deps.listingFetcher ?? createDefaultHtmlListingFetcher();
    this.maxJobs = deps.maxJobs ?? 150;
  }

  async fetchJobs(company: Company): Promise<Job[]> {
    if (!company.careerUrl?.trim()) {
      throw new AppError(
        'INVALID_CAREER_URL',
        'Custom provider requires a careerUrl',
        400,
      );
    }
    logger.provider.info('Fetching custom careers page', {
      company: company.name,
      careerUrl: company.careerUrl,
    });
    const scraped = await this.listingFetcher(company, company.careerUrl);
    return scraped.slice(0, this.maxJobs).map((item) => ({
      company: company.name,
      companyId: company.id,
      title: item.title,
      location: item.location ?? null,
      description: item.description ?? null,
      experience: null,
      skills: null,
      salary: null,
      postedDate: item.postedDate ?? null,
      applyUrl: item.applyUrl,
      provider: this.name,
    }));
  }
}

/**
 * Lightweight HTML crawl: collect likely job detail links from the careers page.
 * Used as a fallback when Playwright is unavailable.
 */
export function createDefaultHtmlListingFetcher(
  fetchImpl: typeof fetch = fetch,
): CustomListingFetcher {
  return async (_company, careerUrl) => {
    const response = await fetchImpl(careerUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 (compatible; JobFinder/1.0)',
      },
    });
    if (!response.ok) {
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        `Custom careers HTTP ${response.status} for ${careerUrl}`,
        502,
      );
    }
    const html = await response.text();
    return extractJobLinksFromHtml(html, careerUrl);
  };
}

export function createPlaywrightCustomListingFetcher(options?: {
  timeoutMs?: number;
  maxJobs?: number;
}): CustomListingFetcher {
  const timeoutMs = options?.timeoutMs ?? 45_000;
  const maxJobs = options?.maxJobs ?? 120;

  return async (_company, careerUrl) => {
    const collected = await withChromiumBrowser(async (browser) => {
      const jobs = new Map<string, CustomScrapedJob>();
      const page = await browser.newPage();
      page.on('response', (response) => {
        void (async () => {
          try {
            const contentType = response.headers()['content-type'] ?? '';
            if (!contentType.includes('application/json')) {
              return;
            }
            if (response.status() < 200 || response.status() >= 300) {
              return;
            }
            const payload: unknown = await response.json();
            for (const job of extractJobsFromUnknownJson(payload, careerUrl)) {
              jobs.set(job.applyUrl, job);
            }
          } catch {
            // ignore
          }
        })();
      });

      await page.goto(careerUrl, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });
      await new Promise((resolve) => setTimeout(resolve, 3_000));

      const domJobs = await page.$$eval(
        'a[href*="job"], a[href*="career"], a[href*="position"], a[href*="opening"]',
        (anchors) =>
          anchors.slice(0, 200).map((anchor) => {
            const el = anchor as unknown as {
              href: string;
              textContent: string | null;
            };
            const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
            return {
              href: el.href,
              text,
            };
          }),
      );

      for (const item of domJobs) {
        if (!item.href || !looksLikeJobUrl(item.href) || item.text.length < 4) {
          continue;
        }
        if (!jobs.has(item.href)) {
          jobs.set(item.href, {
            title: item.text.slice(0, 160),
            applyUrl: item.href,
            location: null,
            description: null,
            postedDate: null,
          });
        }
      }

      return jobs;
    });

    return [...collected.values()].slice(0, maxJobs);
  };
}

export function extractJobLinksFromHtml(
  html: string,
  careerUrl: string,
): CustomScrapedJob[] {
  const base = new URL(careerUrl);
  const jobs = new Map<string, CustomScrapedJob>();

  for (const match of html.matchAll(
    /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const hrefRaw = match[1];
    const text = stripHtml(match[2]).trim();
    if (!hrefRaw || text.length < 4) {
      continue;
    }
    let absolute: string;
    try {
      absolute = new URL(hrefRaw, base).toString();
    } catch {
      continue;
    }
    if (!looksLikeJobUrl(absolute)) {
      continue;
    }
    if (!jobs.has(absolute)) {
      jobs.set(absolute, {
        title: text.slice(0, 160),
        applyUrl: absolute,
        location: null,
        description: null,
        postedDate: null,
      });
    }
  }
  return [...jobs.values()];
}

export function extractJobsFromUnknownJson(
  payload: unknown,
  careerUrl: string,
): CustomScrapedJob[] {
  const out: CustomScrapedJob[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 6 || node == null) {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item, depth + 1);
      }
      return;
    }
    if (typeof node !== 'object') {
      return;
    }
    const record = node as Record<string, unknown>;
    const title = firstString(record, [
      'title',
      'name',
      'jobTitle',
      'positionTitle',
    ]);
    const url = firstString(record, [
      'absolute_url',
      'applyUrl',
      'url',
      'hostedUrl',
      'jobUrl',
      'canonicalPositionUrl',
    ]);
    if (title && url) {
      try {
        const applyUrl = new URL(url, careerUrl).toString();
        out.push({
          title,
          applyUrl,
          location: firstString(record, ['location', 'locationsText']) || null,
          description: firstString(record, [
            'description',
            'job_description',
            'jobDescription',
          ]),
          postedDate: null,
        });
      } catch {
        // ignore bad urls
      }
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') {
        visit(value, depth + 1);
      }
    }
  };
  visit(payload, 0);
  return out;
}

function looksLikeJobUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /job|opening|position|requisition|vacanc|opportunity/i.test(path);
  } catch {
    return /job|opening|position|requisition|vacanc|opportunity/i.test(url);
  }
}

function firstString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}
