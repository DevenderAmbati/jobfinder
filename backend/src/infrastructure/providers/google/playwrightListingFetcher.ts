import type { Company } from '../../../domain/entities/Company.js';
import { withChromiumBrowser } from '../../playwright/browserSession.js';
import { logger } from '../../../shared/utils/logger.js';
import {
  extractGoogleJobsFromPayload,
  type GoogleJobItem,
  type GoogleListingFetcher,
} from './GoogleProvider.js';

interface PlaywrightFetcherOptions {
  headless?: boolean;
  timeoutMs?: number;
  maxJobs?: number;
}

/**
 * Live Google Careers fetcher using Playwright.
 * Intercepts JSON responses and falls back to DOM job-card scraping.
 */
export function createPlaywrightGoogleListingFetcher(
  options: PlaywrightFetcherOptions = {},
): GoogleListingFetcher {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const maxJobs = options.maxJobs ?? 120;
  const headless = options.headless ?? true;

  return async (_company: Company, searchUrl: string): Promise<GoogleJobItem[]> => {
    return withChromiumBrowser(async (browser) => {
      const collected = new Map<string, GoogleJobItem>();
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
            if (!/job|search|career/i.test(url)) {
              return;
            }
            const payload: unknown = await response.json();
            for (const job of extractGoogleJobsFromPayload(payload)) {
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
      await new Promise((resolve) => setTimeout(resolve, 3_000));

      // Scroll to encourage lazy-loaded result cards.
      for (let i = 0; i < 4; i += 1) {
        await page.evaluate('window.scrollBy(0, window.innerHeight)');
        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      const fromHtml = await page.evaluate(() => {
        // Browser context — cast around missing DOM libs in Node tsconfig.
        const doc = (globalThis as unknown as {
          document: {
            documentElement: { innerHTML: string };
            querySelector: (sel: string) => {
              href?: string;
              textContent?: string | null;
              getAttribute?: (name: string) => string | null;
              closest?: (sel: string) => { textContent?: string | null } | null;
            } | null;
          };
        }).document;
        const html = doc.documentElement.innerHTML;
        const matches = html.matchAll(/jobs\/results\/(\d{6,})/gi);
        const ids = [
          ...new Set(
            [...matches]
              .map((m) => m[1])
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        return ids.map((jobId) => {
          const link = doc.querySelector(`a[href*="/jobs/results/${jobId}"]`);
          const card =
            link?.closest?.('li, article, div[role="listitem"], li, div') ??
            link;
          const text = (card?.textContent ?? '').replace(/\s+/g, ' ').trim();
          const title =
            link?.getAttribute?.('aria-label')?.trim() ||
            link?.textContent?.trim() ||
            text.split(/Bengaluru|Hyderabad|Pune|India|Remote/i)[0]?.trim() ||
            `Google Job ${jobId}`;
          return {
            jobId,
            title: title.slice(0, 160) || `Google Job ${jobId}`,
            location: null as string | null,
            description: text.slice(0, 500) || null,
            applyUrl:
              link?.href ||
              `https://www.google.com/about/careers/applications/jobs/results/${jobId}`,
          };
        });
      });

      for (const raw of fromHtml) {
        const item: GoogleJobItem = {
          jobId: raw.jobId,
          title: raw.title,
          location: raw.location,
          description: raw.description,
          applyUrl: raw.applyUrl,
          postedDate: null,
        };
        collected.set(`${item.jobId}|${item.title}`, item);
      }

      const domJobs = await page.$$eval(
        'a[href*="/jobs/results/"]',
        (anchors) =>
          anchors.slice(0, 150).map((anchor, index) => {
            const card =
              anchor.closest('li, article, div[role="listitem"], li') ??
              anchor;
            const text = (card.textContent ?? '').replace(/\s+/g, ' ').trim();
            const title =
              anchor.getAttribute('aria-label')?.trim() ||
              anchor.textContent?.trim() ||
              text.slice(0, 120) ||
              `Google Job ${index + 1}`;
            const href = anchor.href;
            const jobIdMatch = href.match(/jobs\/results\/([^/?#]+)/i);
            return {
              jobId: jobIdMatch?.[1] ?? `dom-${index + 1}`,
              title,
              location: null as string | null,
              description: text.slice(0, 500) || null,
              applyUrl: href,
            };
          }),
      );

      for (const raw of domJobs) {
        const item: GoogleJobItem = {
          jobId: raw.jobId,
          title: raw.title,
          location: raw.location,
          description: raw.description,
          applyUrl: raw.applyUrl,
          postedDate: null,
        };
        collected.set(`${item.jobId}|${item.title}`, item);
      }

      const jobs = [...collected.values()].slice(0, maxJobs);
      logger.provider.info('Google Playwright fetch complete', {
        count: jobs.length,
        searchUrl,
      });
      return jobs;
    }, { headless });
  };
}
