import type { Page } from 'playwright';
import type { Company } from '../../../domain/entities/Company.js';
import { withChromiumBrowser } from '../../playwright/browserSession.js';
import { logger } from '../../../shared/utils/logger.js';
import {
  applePostLocationId,
  extractAppleJobsFromPayload,
  fetchAppleSearchListings,
  locationFromAppleCard,
  pickAppleTitle,
  withIndiaFallback,
  type AppleJobItem,
  type AppleListingFetcher,
} from './AppleProvider.js';

interface PlaywrightFetcherOptions {
  headless?: boolean;
  timeoutMs?: number;
  maxJobs?: number;
}

/**
 * Live Apple Jobs fetcher using Playwright.
 * Intercepts JSON search responses and falls back to DOM scraping.
 */
export function createPlaywrightAppleListingFetcher(
  options: PlaywrightFetcherOptions = {},
): AppleListingFetcher {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const maxJobs = options.maxJobs ?? 200;
  const headless = options.headless ?? true;

  return async (_company: Company, searchUrl: string): Promise<AppleJobItem[]> => {
    try {
      const fromHttp = await fetchAppleSearchListings(searchUrl, { maxPages: 10 });
      if (fromHttp.length > 0) {
        const jobs = fromHttp.slice(0, maxJobs);
        logger.provider.info('Apple search HTML fetch complete', {
          count: jobs.length,
          searchUrl,
        });
        return jobs;
      }
    } catch (error) {
      logger.provider.warn('Apple search HTML fetch failed', {
        message: error instanceof Error ? error.message : 'unknown',
      });
    }

    return withChromiumBrowser(async (browser) => {
      const collected = new Map<string, AppleJobItem>();
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
            const url = response.url();
            if (!/role\/search|job|search/i.test(url)) {
              return;
            }
            const payload: unknown = await response.json();
            for (const job of extractAppleJobsFromPayload(payload)) {
              remember(collected, {
                ...job,
                title: pickAppleTitle(job.title) || job.title,
                location: withIndiaFallback(job.location, searchUrl),
              });
            }
          } catch {
            // ignore non-JSON or aborted responses
          }
        })();
      });

      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });
      await new Promise((resolve) => setTimeout(resolve, 3_500));

      const locationId = applePostLocationId(searchUrl);
      if (locationId) {
        try {
          const payload = await fetchAppleSearchPages(page, locationId);
          for (const job of extractAppleJobsFromPayload({ searchResults: payload })) {
            remember(collected, {
              ...job,
              title: pickAppleTitle(job.title) || job.title,
              location: withIndiaFallback(job.location, searchUrl),
            });
          }
        } catch (error) {
          logger.provider.warn('Apple search API fetch failed', {
            message: error instanceof Error ? error.message : 'unknown',
          });
        }
      }

      const domJobs = await page.$$eval(
        'a[href*="/details/"], a[href*="/en-us/details/"]',
        (anchors) =>
          anchors.slice(0, 150).map((anchor, index) => {
            const card =
              anchor.closest('li, article, div[role="listitem"]') ??
              anchor.parentElement ??
              anchor;
            const heading = card.querySelector('h1, h2, h3')?.textContent ?? '';
            const text = (card.textContent ?? '').replace(/\s+/g, ' ').trim();
            const title =
              heading.trim() ||
              anchor.getAttribute('aria-label')?.trim() ||
              anchor.textContent?.trim() ||
              text.slice(0, 120) ||
              `Apple Job ${index + 1}`;
            const href = anchor.href;
            const jobIdMatch = href.match(/details\/([^/?#]+)/i);
            return {
              jobId: jobIdMatch?.[1] ?? `dom-${index + 1}`,
              title,
              cardText: text,
              description: text.slice(0, 500) || null,
              applyUrl: href,
              team: null as string | null,
            };
          }),
      );

      for (const raw of domJobs) {
        const title = pickAppleTitle(raw.title) || raw.title;
        remember(collected, {
          jobId: raw.jobId,
          title,
          location: withIndiaFallback(locationFromAppleCard(raw.cardText), searchUrl),
          description: raw.description,
          applyUrl: raw.applyUrl,
          postedDate: null,
          team: raw.team,
        });
      }

      const jobs = [...collected.values()].slice(0, maxJobs);
      logger.provider.info('Apple Playwright fetch complete', {
        count: jobs.length,
        searchUrl,
      });
      return jobs;
    }, { headless });
  };
}

async function fetchAppleSearchPages(
  page: Page,
  locationId: string,
): Promise<unknown[]> {
  const results: unknown[] = [];
  for (let pageNum = 1; pageNum <= 8; pageNum += 1) {
    const response = await page.request.post('https://jobs.apple.com/api/role/search', {
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      data: {
        query: '',
        locale: 'en-us',
        filters: { postingpostLocation: [locationId] },
        page: pageNum,
      },
    });
    if (!response.ok()) {
      logger.provider.warn('Apple search API page failed', {
        page: pageNum,
        status: response.status(),
      });
      break;
    }
    const data = (await response.json()) as {
      searchResults?: unknown[];
      totalRecords?: number;
    };
    const batch = Array.isArray(data.searchResults) ? data.searchResults : [];
    if (batch.length === 0) {
      break;
    }
    results.push(...batch);
    if (data.totalRecords && results.length >= data.totalRecords) {
      break;
    }
  }
  return results;
}

function remember(collected: Map<string, AppleJobItem>, item: AppleJobItem): void {
  const title = item.title.trim();
  if (!item.jobId || !title || /^apple job\b/i.test(title)) {
    return;
  }
  const existing = collected.get(item.jobId);
  if (!existing) {
    collected.set(item.jobId, { ...item, title });
    return;
  }
  const score = (job: AppleJobItem): number =>
    (job.location ? 2 : 0) + (job.description ? 1 : 0);
  if (score(item) > score(existing)) {
    collected.set(item.jobId, { ...item, title });
  }
}
