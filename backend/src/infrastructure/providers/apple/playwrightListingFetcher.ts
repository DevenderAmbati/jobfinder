import type { Company } from '../../../domain/entities/Company.js';
import { withChromiumBrowser } from '../../playwright/browserSession.js';
import { logger } from '../../../shared/utils/logger.js';
import {
  extractAppleJobsFromPayload,
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
  const maxJobs = options.maxJobs ?? 120;
  const headless = options.headless ?? true;

  return async (_company: Company, searchUrl: string): Promise<AppleJobItem[]> => {
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
              collected.set(`${job.jobId}|${job.title}`, job);
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

      const domJobs = await page.$$eval(
        'a[href*="/details/"], a[href*="/en-us/details/"]',
        (anchors) =>
          anchors.slice(0, 150).map((anchor, index) => {
            const card =
              anchor.closest('li, article, div[role="listitem"], div') ??
              anchor;
            const text = (card.textContent ?? '').replace(/\s+/g, ' ').trim();
            const title =
              anchor.getAttribute('aria-label')?.trim() ||
              anchor.textContent?.trim() ||
              text.slice(0, 120) ||
              `Apple Job ${index + 1}`;
            const href = anchor.href;
            const jobIdMatch = href.match(/details\/([^/?#]+)/i);
            return {
              jobId: jobIdMatch?.[1] ?? `dom-${index + 1}`,
              title,
              location: null as string | null,
              description: text.slice(0, 500) || null,
              applyUrl: href,
              team: null as string | null,
            };
          }),
      );

      for (const raw of domJobs) {
        const item: AppleJobItem = {
          jobId: raw.jobId,
          title: raw.title,
          location: raw.location,
          description: raw.description,
          applyUrl: raw.applyUrl,
          postedDate: null,
          team: raw.team,
        };
        collected.set(`${item.jobId}|${item.title}`, item);
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
