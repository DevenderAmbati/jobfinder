import type { Company } from '../../../domain/entities/Company.js';
import { withChromiumBrowser } from '../../playwright/browserSession.js';
import { logger } from '../../../shared/utils/logger.js';
import {
  extractMicrosoftJobsFromPayload,
  type MicrosoftJobItem,
  type MicrosoftListingFetcher,
} from './MicrosoftProvider.js';

interface PlaywrightFetcherOptions {
  headless?: boolean;
  timeoutMs?: number;
  maxJobs?: number;
}

/**
 * Live Microsoft careers fetcher using Playwright.
 * Intercepts JSON responses and falls back to DOM job-card scraping.
 */
export function createPlaywrightMicrosoftListingFetcher(
  options: PlaywrightFetcherOptions = {},
): MicrosoftListingFetcher {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const maxJobs = options.maxJobs ?? 100;
  const headless = options.headless ?? true;

  return async (_company: Company, searchUrl: string): Promise<MicrosoftJobItem[]> => {
    return withChromiumBrowser(async (browser) => {
      const collected = new Map<string, MicrosoftJobItem>();
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
            if (!/search|job|position|pcs/i.test(url)) {
              return;
            }
            const payload: unknown = await response.json();
            for (const job of extractMicrosoftJobsFromPayload(payload)) {
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
      await new Promise((resolve) => setTimeout(resolve, 2_500));

      const domJobs = await page.$$eval(
        'a[href*="/job/"], a[href*="/jobs/"], a[href*="jobId="]',
        (anchors) =>
          anchors.slice(0, 100).map((anchor, index) => {
            const card =
              anchor.closest('li, article, div[role="listitem"], div') ??
              anchor;
            const text = (card.textContent ?? '').replace(/\s+/g, ' ').trim();
            const title =
              anchor.getAttribute('aria-label')?.trim() ||
              anchor.textContent?.trim() ||
              text.slice(0, 120) ||
              `Microsoft Job ${index + 1}`;
            const href = anchor.href;
            const jobIdMatch =
              href.match(/job\/([^/?#]+)/i) || href.match(/jobId=([^&]+)/i);
            return {
              jobId: jobIdMatch?.[1] ?? `dom-${index + 1}`,
              title,
              location: null as string | null,
              description: text.slice(0, 500) || null,
              applyUrl: href,
              postedDate: null as string | null,
              category: null as string | null,
            };
          }),
      );

      for (const raw of domJobs) {
        const item: MicrosoftJobItem = {
          jobId: raw.jobId,
          title: raw.title,
          location: raw.location,
          description: raw.description,
          applyUrl: raw.applyUrl,
          postedDate: null,
          category: raw.category,
        };
        collected.set(`${item.jobId}|${item.title}`, item);
      }

      const jobs = [...collected.values()].slice(0, maxJobs);
      logger.provider.info('Microsoft Playwright fetch complete', {
        count: jobs.length,
        searchUrl,
      });
      return jobs;
    }, { headless });
  };
}
