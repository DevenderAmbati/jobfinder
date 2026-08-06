import type { Browser, LaunchOptions } from 'playwright';
import { logger } from '../../shared/utils/logger.js';

export interface PlaywrightRuntimeOptions {
  headless?: boolean;
  /** Max concurrent Chromium processes. Default 2. */
  maxConcurrent?: number;
}

const activeBrowsers = new Set<Browser>();
let inFlight = 0;
let maxConcurrent = 2;
let headlessDefault = true;
let shuttingDown = false;

const waiters: Array<{
  resolve: () => void;
  reject: (error: Error) => void;
}> = [];

/**
 * Configure Playwright process limits. Call once at boot from loadConfig().
 */
export function configurePlaywrightRuntime(
  options: PlaywrightRuntimeOptions = {},
): void {
  shuttingDown = false;
  if (options.maxConcurrent != null && options.maxConcurrent >= 1) {
    maxConcurrent = options.maxConcurrent;
  }
  if (options.headless != null) {
    headlessDefault = options.headless;
  }
}

function releaseSlot(): void {
  inFlight = Math.max(0, inFlight - 1);
  const next = waiters.shift();
  if (next) {
    inFlight += 1;
    next.resolve();
  }
}

async function acquireSlot(): Promise<void> {
  if (shuttingDown) {
    throw new Error('Playwright is shutting down');
  }
  if (inFlight < maxConcurrent) {
    inFlight += 1;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    waiters.push({ resolve, reject });
  });
}

export function chromiumLaunchOptions(
  overrides: LaunchOptions = {},
): LaunchOptions {
  const isLinux = process.platform === 'linux';
  const productionArgs = [
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-zygote',
  ];
  if (isLinux || process.env.PLAYWRIGHT_NO_SANDBOX === 'true') {
    productionArgs.push('--no-sandbox', '--disable-setuid-sandbox');
  }

  const { args: overrideArgs, headless: overrideHeadless, ...rest } = overrides;

  return {
    ...rest,
    headless: overrideHeadless ?? headlessDefault,
    args: [...productionArgs, ...(overrideArgs ?? [])],
  };
}

/**
 * Launch Chromium, run work, always close the browser (and track for shutdown).
 */
export async function withChromiumBrowser<T>(
  work: (browser: Browser) => Promise<T>,
  launchOverrides: LaunchOptions = {},
): Promise<T> {
  await acquireSlot();
  const { chromium } = await import('playwright');
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch(chromiumLaunchOptions(launchOverrides));
    activeBrowsers.add(browser);
    return await work(browser);
  } finally {
    if (browser) {
      activeBrowsers.delete(browser);
      try {
        await browser.close();
      } catch (error) {
        logger.provider.warn('Playwright browser.close failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    releaseSlot();
  }
}

/** Close any browsers still open (graceful shutdown). */
export async function closeAllPlaywrightBrowsers(): Promise<void> {
  shuttingDown = true;
  const pending = waiters.splice(0, waiters.length);
  for (const waiter of pending) {
    waiter.reject(new Error('Playwright is shutting down'));
  }

  const browsers = [...activeBrowsers];
  activeBrowsers.clear();
  await Promise.all(
    browsers.map(async (browser) => {
      try {
        await browser.close();
      } catch (error) {
        logger.provider.warn('Playwright shutdown close failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );
  inFlight = 0;
}

export function getPlaywrightActiveCount(): number {
  return activeBrowsers.size;
}
