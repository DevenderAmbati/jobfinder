import type { Company } from '../../../domain/entities/Company.js';
import type { Job } from '../../../domain/entities/Job.js';
import type { JobProvider } from '../../../domain/ports/JobProvider.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/utils/logger.js';
import { stripHtml } from '../../../shared/utils/html.js';
import { withChromiumBrowser } from '../../playwright/browserSession.js';

export interface EightfoldPosition {
  id?: string | number;
  name?: string;
  title?: string;
  location?: string;
  locations?: string[];
  department?: string;
  createdAt?: number | string;
  updatedAt?: number | string;
  publishedAt?: number | string;
  postedTs?: number;
  creationTs?: number;
  absolute_url?: string;
  canonicalPositionUrl?: string;
  positionUrl?: string;
  job_description?: string;
  jobDescription?: string;
  ats_job_id?: string;
}

export interface EightfoldJobsResponse {
  count?: number;
  positions?: EightfoldPosition[];
}

export interface EightfoldBoardTarget {
  host: string;
  domain: string;
  location?: string;
  /** Original careers page — used when the JSON API is blocked. */
  careerPageUrl: string;
}

interface EightfoldProviderDeps {
  fetchImpl?: typeof fetch;
  pageSize?: number;
  maxPages?: number;
  /**
   * When the public JSON API returns 403/401, fall back to loading the
   * careers page in Chromium and harvesting intercepted /api/apply/v2/jobs
   * responses. White-label tenants (Qualcomm) often gate bare fetch this way.
   */
  allowBrowserFallback?: boolean;
}

/**
 * Eightfold public careers API adapter.
 *
 * Supports both native hosts (`*.eightfold.ai`) and white-label careers
 * sites that still expose `/api/apply/v2/jobs?domain=…`.
 */
export class EightfoldProvider implements JobProvider {
  readonly name = 'eightfold';
  private readonly fetchImpl: typeof fetch;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly allowBrowserFallback: boolean;

  constructor(deps: EightfoldProviderDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.pageSize = Math.min(deps.pageSize ?? 50, 100);
    this.maxPages = deps.maxPages ?? 40;
    this.allowBrowserFallback = deps.allowBrowserFallback ?? true;
  }

  async fetchJobs(company: Company): Promise<Job[]> {
    const target = parseEightfoldCareerUrl(company.careerUrl);
    logger.provider.info('Fetching Eightfold jobs', {
      company: company.name,
      host: target.host,
      domain: target.domain,
      location: target.location ?? null,
    });

    try {
      const positions = await this.fetchViaApi(target);
      return positions.map((item) => this.normalize(item, company, target));
    } catch (error) {
      if (!this.allowBrowserFallback || !isBlockedApiError(error)) {
        throw error;
      }
      logger.provider.warn('Eightfold API blocked — falling back to browser harvest', {
        company: company.name,
        host: target.host,
        reason: error instanceof Error ? error.message : String(error),
      });
      const positions = await harvestEightfoldViaBrowser(target, {
        pageSize: this.pageSize,
        maxPages: this.maxPages,
      });
      return positions.map((item) => this.normalize(item, company, target));
    }
  }

  private async fetchViaApi(
    target: EightfoldBoardTarget,
  ): Promise<EightfoldPosition[]> {
    const positions: EightfoldPosition[] = [];
    const seen = new Set<string>();
    let total = Number.POSITIVE_INFINITY;
    const usePcsx = !target.host.includes('eightfold.ai');

    for (let page = 0; page < this.maxPages; page += 1) {
      const start = page * this.pageSize;
      const payload = usePcsx
        ? await this.fetchPcsxPage(target, start)
        : await this.fetchLegacyPage(target, start);
      if (page === 0 && typeof payload.count === 'number') {
        total = payload.count;
      }
      const batch = payload.positions ?? [];
      for (const item of batch) {
        const key = String(item.id ?? item.ats_job_id ?? item.name);
        if (!key || seen.has(key)) {
          continue;
        }
        seen.add(key);
        positions.push(item);
      }
      if (batch.length === 0 || start + batch.length >= total) {
        break;
      }
    }

    return positions;
  }

  /**
   * White-label PCSX search (Qualcomm and other branded careers hosts).
   * The older `/api/apply/v2/jobs` path returns 403 "Not authorized for PCSX"
   * on these tenants.
   */
  private async fetchPcsxPage(
    target: EightfoldBoardTarget,
    start: number,
  ): Promise<EightfoldJobsResponse> {
    const params = new URLSearchParams({
      domain: target.domain,
      query: '',
      start: String(start),
      num: String(this.pageSize),
    });
    if (target.location) {
      params.set('location', target.location);
    }
    const url = `https://${target.host}/api/pcsx/search?${params}`;
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: eightfoldHeaders(target.careerPageUrl),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        `Eightfold PCSX HTTP ${response.status} for ${target.domain}: ${body.slice(0, 200)}`,
        response.status === 401 || response.status === 403 ? 403 : 502,
      );
    }
    const json = (await response.json()) as {
      status?: number;
      data?: { positions?: EightfoldPosition[]; count?: number };
      positions?: EightfoldPosition[];
      count?: number;
    };
    return {
      count: json.data?.count ?? json.count,
      positions: json.data?.positions ?? json.positions ?? [],
    };
  }

  private async fetchLegacyPage(
    target: EightfoldBoardTarget,
    start: number,
  ): Promise<EightfoldJobsResponse> {
    const params = new URLSearchParams({
      domain: target.domain,
      start: String(start),
      num: String(this.pageSize),
    });
    if (target.location) {
      params.set('location', target.location);
    }
    const url = `https://${target.host}/api/apply/v2/jobs?${params}`;
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: eightfoldHeaders(target.careerPageUrl),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        `Eightfold HTTP ${response.status} for ${target.domain}: ${body.slice(0, 200)}`,
        response.status === 401 || response.status === 403 ? 403 : 502,
      );
    }
    return (await response.json()) as EightfoldJobsResponse;
  }

  normalize(
    item: EightfoldPosition,
    company: Company,
    target: EightfoldBoardTarget,
  ): Job {
    const title = (item.name || item.title || '').trim();
    if (!title) {
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        'Eightfold position is missing a title',
        502,
      );
    }
    const id = item.id ?? item.ats_job_id;
    const applyUrl =
      item.canonicalPositionUrl?.trim() ||
      item.absolute_url?.trim() ||
      (item.positionUrl
        ? new URL(item.positionUrl, `https://${target.host}`).toString()
        : null) ||
      (id
        ? `https://${target.host}/careers/job/${id}?domain=${encodeURIComponent(target.domain)}`
        : `https://${target.host}/careers?domain=${encodeURIComponent(target.domain)}`);

    const descriptionHtml = item.job_description || item.jobDescription || null;
    const postedRaw =
      item.publishedAt ??
      item.updatedAt ??
      item.createdAt ??
      item.postedTs ??
      item.creationTs;
    const postedDate = parseEightfoldDate(postedRaw);

    return {
      company: company.name,
      companyId: company.id,
      title,
      location:
        item.location?.trim() ||
        item.locations?.filter(Boolean).join('; ') ||
        null,
      description: descriptionHtml ? stripHtml(descriptionHtml) : null,
      experience: null,
      skills: item.department?.trim() || null,
      salary: null,
      postedDate,
      applyUrl,
      provider: this.name,
    };
  }
}

function eightfoldHeaders(referer: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Referer: referer,
    'Accept-Language': 'en-US,en;q=0.9',
  };
}

/**
 * Accepts:
 * - https://{tenant}.eightfold.ai/careers?domain=…
 * - https://careers.{company}.com/careers?domain=… (white-label)
 * - Query helpers: location=India
 */
export function parseEightfoldCareerUrl(careerUrl: string): EightfoldBoardTarget {
  const trimmed = careerUrl.trim();
  if (!trimmed) {
    throw new AppError(
      'INVALID_CAREER_URL',
      'Eightfold careerUrl is empty',
      400,
    );
  }
  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new AppError(
      'INVALID_CAREER_URL',
      `Invalid Eightfold careerUrl: ${careerUrl}`,
      400,
    );
  }

  const domainParam = url.searchParams.get('domain')?.trim();
  const isNative = url.hostname.includes('eightfold.ai');
  const isWhiteLabel = Boolean(domainParam) && /career/i.test(url.hostname + url.pathname);

  if (!isNative && !isWhiteLabel) {
    throw new AppError(
      'INVALID_CAREER_URL',
      `Eightfold careerUrl must be on *.eightfold.ai or a careers host with ?domain=, got ${url.hostname}`,
      400,
    );
  }

  const domain =
    domainParam ||
    url.hostname.replace(/\.eightfold\.ai$/i, '') + '.com';

  return {
    host: url.hostname,
    domain,
    location: url.searchParams.get('location')?.trim() || undefined,
    careerPageUrl: url.toString(),
  };
}

export function parseEightfoldDate(
  raw: number | string | undefined,
): Date | null {
  if (raw == null || raw === '') {
    return null;
  }
  if (typeof raw === 'number') {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && /^\d+$/.test(raw.trim())) {
    return parseEightfoldDate(asNumber);
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isBlockedApiError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.statusCode === 403 || /HTTP 403|HTTP 401/i.test(error.message);
  }
  return false;
}

/**
 * Loads the careers UI in Chromium so WAF-gated tenants still emit their
 * public JSON. Walks a few pagination offsets by rewriting the URL query.
 */
export async function harvestEightfoldViaBrowser(
  target: EightfoldBoardTarget,
  options: { pageSize: number; maxPages: number },
): Promise<EightfoldPosition[]> {
  return withChromiumBrowser(async (browser) => {
    const positions: EightfoldPosition[] = [];
    const seen = new Set<string>();

    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });

    page.on('response', (response) => {
      void (async () => {
        try {
          if (!response.url().includes('/api/apply/v2/jobs')) {
            return;
          }
          if (response.status() < 200 || response.status() >= 300) {
            return;
          }
          const payload = (await response.json()) as EightfoldJobsResponse;
          for (const item of payload.positions ?? []) {
            const key = String(item.id ?? item.ats_job_id ?? item.name);
            if (!key || seen.has(key)) {
              continue;
            }
            seen.add(key);
            positions.push(item);
          }
        } catch {
          // ignore parse errors on unrelated JSON
        }
      })();
    });

    for (let pageIndex = 0; pageIndex < options.maxPages; pageIndex += 1) {
      const start = pageIndex * options.pageSize;
      const before = positions.length;
      const url = new URL(target.careerPageUrl);
      url.searchParams.set('domain', target.domain);
      if (target.location) {
        url.searchParams.set('location', target.location);
      }
      url.searchParams.set('start', String(start));
      url.searchParams.set('num', String(options.pageSize));

      await page.goto(url.toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      await new Promise((resolve) => setTimeout(resolve, 4_000));

      // Explicit API pull from inside the page context — same origin, so the
      // browser's cookies / TLS fingerprint clear WAFs that block Node fetch.
      const batch = await page.evaluate(
        async ({ host, domain, location, start: offset, num }) => {
          const params = new URLSearchParams({
            domain,
            start: String(offset),
            num: String(num),
          });
          if (location) {
            params.set('location', location);
          }
          const response = await fetch(
            `https://${host}/api/apply/v2/jobs?${params.toString()}`,
            { credentials: 'include' },
          );
          if (!response.ok) {
            return {
              ok: false as const,
              status: response.status,
              positions: [] as Array<Record<string, unknown>>,
            };
          }
          const json = (await response.json()) as {
            count?: number;
            positions?: Array<Record<string, unknown>>;
          };
          return {
            ok: true as const,
            status: response.status,
            count: json.count,
            positions: json.positions ?? [],
          };
        },
        {
          host: target.host,
          domain: target.domain,
          location: target.location ?? null,
          start,
          num: options.pageSize,
        },
      );

      if (batch.ok) {
        for (const raw of batch.positions) {
          const item = raw as EightfoldPosition;
          const key = String(item.id ?? item.ats_job_id ?? item.name);
          if (!key || seen.has(key)) {
            continue;
          }
          seen.add(key);
          positions.push(item);
        }
        if (
          batch.positions.length === 0 ||
          (typeof batch.count === 'number' &&
            start + batch.positions.length >= batch.count)
        ) {
          break;
        }
      } else if (positions.length === before && pageIndex === 0) {
        throw new AppError(
          'PROVIDER_FETCH_FAILED',
          `Eightfold browser harvest HTTP ${batch.status} for ${target.domain}`,
          502,
        );
      } else {
        break;
      }
    }

    return positions;
  });
}
