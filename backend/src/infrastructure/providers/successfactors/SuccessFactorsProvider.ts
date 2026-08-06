import type { Company } from '../../../domain/entities/Company.js';
import type { Job } from '../../../domain/entities/Job.js';
import type { JobProvider } from '../../../domain/ports/JobProvider.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/utils/logger.js';
import { stripHtml } from '../../../shared/utils/html.js';

export interface SuccessFactorsJobResponse {
  id?: string | number;
  unifiedStandardTitle?: string;
  unifiedUrlTitle?: string;
  urlTitle?: string;
  jobLocationShort?: string[];
  jobLocationState?: string[];
  jobLocationCountry?: string[];
  businessUnit_obj?: string[];
  filter2?: string[];
  unifiedStandardStart?: string;
  supportedLocales?: string[];
}

export interface SuccessFactorsSearchItem {
  response?: SuccessFactorsJobResponse;
}

export interface SuccessFactorsSearchResponse {
  totalJobs?: number;
  jobSearchResult?: SuccessFactorsSearchItem[];
}

interface SuccessFactorsProviderDeps {
  fetchImpl?: typeof fetch;
  pageSizeHint?: number;
  maxPages?: number;
  /** When true, GET each job HTML page for the description body. */
  includeDetails?: boolean;
}

/**
 * SAP SuccessFactors Career Site Builder adapter.
 *
 * Only modern CSB hosts are supported:
 * - https://{tenant}.jobs.hr.cloud.sap
 * - https://{tenant}.jobs.hr.sapcloud.cn
 *
 * Legacy career*.successfactors.com portals are intentionally unsupported —
 * they require signed XHRs with no stable public JSON contract.
 */
export class SuccessFactorsProvider implements JobProvider {
  readonly name = 'successfactors';
  private readonly fetchImpl: typeof fetch;
  private readonly maxPages: number;
  private readonly includeDetails: boolean;
  private readonly jobsPerPage: number;

  constructor(deps: SuccessFactorsProviderDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.maxPages = deps.maxPages ?? 40;
    this.includeDetails = deps.includeDetails ?? true;
    this.jobsPerPage = deps.pageSizeHint ?? 50;
  }

  async fetchJobs(company: Company): Promise<Job[]> {
    const baseUrl = parseSuccessFactorsCareerUrl(company.careerUrl);
    logger.provider.info('Fetching SuccessFactors CSB jobs', {
      company: company.name,
      baseUrl,
    });

    const session = await this.openSession(baseUrl);
    const categoryIds = discoverCategoryIds(session.html);
    const listings: SuccessFactorsJobResponse[] = [];
    const seen = new Set<string>();

    for (const categoryId of categoryIds) {
      for (let page = 0; page < this.maxPages; page += 1) {
        const payload = await this.searchPage(
          baseUrl,
          session,
          categoryId,
          page,
        );
        const batch = (payload.jobSearchResult ?? [])
          .map((item) => item.response)
          .filter((job): job is SuccessFactorsJobResponse => Boolean(job?.id));

        for (const job of batch) {
          const id = String(job.id);
          if (seen.has(id)) {
            continue;
          }
          seen.add(id);
          listings.push(job);
        }

        const total = payload.totalJobs ?? 0;
        const fetched = page * this.jobsPerPage + batch.length;
        if (batch.length === 0 || (total > 0 && fetched >= total)) {
          break;
        }
      }
    }

    const jobs: Job[] = [];
    for (const listing of listings) {
      let description: string | null = null;
      if (this.includeDetails) {
        description = await this.fetchDescription(baseUrl, session, listing);
      }
      jobs.push(this.normalize(listing, company, baseUrl, description));
    }
    return jobs;
  }

  private async openSession(baseUrl: string): Promise<{
    cookie: string;
    csrfToken: string | null;
    html: string;
  }> {
    const response = await this.fetchImpl(baseUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; JobFinder/1.0)',
      },
    });
    if (!response.ok) {
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        `SuccessFactors homepage HTTP ${response.status} for ${baseUrl}`,
        502,
      );
    }
    const html = await response.text();
    return {
      cookie: collectSetCookie(response.headers),
      csrfToken: extractCsrfToken(html),
      html,
    };
  }

  private async searchPage(
    baseUrl: string,
    session: { cookie: string; csrfToken: string | null },
    categoryId: number,
    pageNumber: number,
  ): Promise<SuccessFactorsSearchResponse> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; JobFinder/1.0)',
    };
    if (session.cookie) {
      headers.Cookie = session.cookie;
    }
    if (session.csrfToken) {
      headers['x-csrf-token'] = session.csrfToken;
    }

    const response = await this.fetchImpl(
      `${baseUrl}/services/recruiting/v1/jobs`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          locale: 'en_US',
          pageNumber,
          sortBy: '',
          keywords: '',
          location: '',
          facetFilters: {},
          brand: '',
          skills: [],
          categoryId,
          alertId: '',
          rcmCandidateId: '',
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        `SuccessFactors search HTTP ${response.status}: ${body.slice(0, 200)}`,
        502,
      );
    }

    return (await response.json()) as SuccessFactorsSearchResponse;
  }

  private async fetchDescription(
    baseUrl: string,
    session: { cookie: string },
    listing: SuccessFactorsJobResponse,
  ): Promise<string | null> {
    const detailUrl = buildSuccessFactorsDetailUrl(baseUrl, listing);
    if (!detailUrl) {
      return null;
    }
    try {
      const headers: Record<string, string> = {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 (compatible; JobFinder/1.0)',
      };
      if (session.cookie) {
        headers.Cookie = session.cookie;
      }
      const response = await this.fetchImpl(detailUrl, {
        method: 'GET',
        headers,
      });
      if (!response.ok) {
        return null;
      }
      const html = await response.text();
      return extractJobDescription(html);
    } catch {
      return null;
    }
  }

  /** Exposed for unit tests */
  normalize(
    item: SuccessFactorsJobResponse,
    company: Company,
    baseUrl: string,
    description: string | null,
  ): Job {
    const title =
      item.unifiedStandardTitle?.trim() ||
      item.unifiedUrlTitle?.trim() ||
      item.urlTitle?.trim();
    if (!title) {
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        'SuccessFactors job is missing a title',
        502,
      );
    }

    const applyUrl = buildSuccessFactorsDetailUrl(baseUrl, item) ?? baseUrl;
    const postedDate = parseSuccessFactorsDate(item.unifiedStandardStart);

    return {
      company: company.name,
      companyId: company.id,
      title,
      location: formatSuccessFactorsLocation(item),
      description,
      experience: null,
      skills: formatSuccessFactorsSkills(item),
      salary: null,
      postedDate,
      applyUrl,
      provider: this.name,
    };
  }
}

export function parseSuccessFactorsCareerUrl(careerUrl: string): string {
  const trimmed = careerUrl.trim();
  if (!trimmed) {
    throw new AppError(
      'INVALID_CAREER_URL',
      'SuccessFactors careerUrl is empty',
      400,
    );
  }

  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new AppError(
      'INVALID_CAREER_URL',
      `Invalid SuccessFactors careerUrl: ${careerUrl}`,
      400,
    );
  }

  const host = url.hostname.toLowerCase();
  const isCsb =
    host.endsWith('.jobs.hr.cloud.sap') ||
    host.endsWith('.jobs.hr.sapcloud.cn');
  if (!isCsb) {
    throw new AppError(
      'INVALID_CAREER_URL',
      `SuccessFactors careerUrl must be a Career Site Builder host (*.jobs.hr.cloud.sap), got: ${host}`,
      400,
    );
  }

  return `https://${host}`;
}

export function discoverCategoryIds(html: string): number[] {
  const ids = new Set<number>();
  for (const match of html.matchAll(/\/go\/[^/"']+\/(\d+)\/?/g)) {
    ids.add(Number(match[1]));
  }
  if (ids.size === 0) {
    for (const match of html.matchAll(/"categoryId"\s*:\s*(\d+)/g)) {
      ids.add(Number(match[1]));
    }
  }
  return ids.size > 0 ? [...ids].sort((a, b) => a - b) : [0];
}

export function extractCsrfToken(html: string): string | null {
  const patterns = [
    /<meta\s+name="csrf-token"\s+content="([^"]+)"/i,
    /data-csrf-token="([^"]+)"/i,
    /x-csrf-token:\s*([a-f0-9-]+)/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

export function formatSuccessFactorsLocation(
  item: SuccessFactorsJobResponse,
): string | null {
  const short = item.jobLocationShort?.[0];
  if (short?.trim()) {
    return short
      .replace(/<br\s*\/?>/gi, ', ')
      .replace(/\s+/g, ' ')
      .replace(/,\s*,/g, ',')
      .trim();
  }
  const parts = [
    item.jobLocationState?.[0],
    item.jobLocationCountry?.[0],
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(', ') : null;
}

export function formatSuccessFactorsSkills(
  item: SuccessFactorsJobResponse,
): string | null {
  const bits = [
    ...(item.businessUnit_obj ?? []),
    ...(item.filter2 ?? []),
  ]
    .map((value) => value.trim())
    .filter(Boolean);
  return bits.length > 0 ? [...new Set(bits)].join(', ') : null;
}

export function buildSuccessFactorsDetailUrl(
  baseUrl: string,
  item: SuccessFactorsJobResponse,
): string | null {
  if (item.id == null) {
    return null;
  }
  const slug =
    item.unifiedUrlTitle?.trim() ||
    item.urlTitle?.trim() ||
    'job';
  const locale = item.supportedLocales?.[0] || 'en_US';
  return `${baseUrl}/job/${encodeURIComponent(slug)}/${item.id}-${locale}`;
}

export function parseSuccessFactorsDate(raw: string | undefined): Date | null {
  if (!raw?.trim()) {
    return null;
  }
  // CSB often emits US M/d/yy or M/d/yyyy.
  const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) {
      year += 2000;
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function extractJobDescription(html: string): string | null {
  const patterns = [
    /<div[^>]*class="[^"]*job-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*\bjob\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const text = stripHtml(match[1]);
      if (text.trim()) {
        return text.trim();
      }
    }
  }
  return null;
}

function collectSetCookie(headers: Headers): string {
  const getSetCookie = (
    headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie;
  const raw =
    typeof getSetCookie === 'function'
      ? getSetCookie.call(headers)
      : [headers.get('set-cookie')].filter(Boolean);
  return raw
    .flatMap((value) => String(value).split(/,(?=[^;]+?=)/))
    .map((part) => part.split(';')[0]?.trim())
    .filter((part): part is string => Boolean(part))
    .join('; ');
}
