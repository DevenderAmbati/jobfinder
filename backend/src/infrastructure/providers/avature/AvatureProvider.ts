import type { Company } from '../../../domain/entities/Company.js';
import type { Job } from '../../../domain/entities/Job.js';
import type { JobProvider } from '../../../domain/ports/JobProvider.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/utils/logger.js';
import { stripHtml } from '../../../shared/utils/html.js';

export interface AvatureListing {
  id: string;
  title: string;
  path: string;
}

export interface AvatureBoardTarget {
  baseUrl: string;
  searchPath: string;
  locationKeyword?: string;
}

interface AvatureProviderDeps {
  fetchImpl?: typeof fetch;
  pageSize?: number;
  maxPages?: number;
  includeDetails?: boolean;
  detailConcurrency?: number;
}

/**
 * Avature career marketplace HTML adapter (Siemens-style).
 * Lists JobDetail IDs from SearchJobs pages and enriches via detail HTML.
 */
export class AvatureProvider implements JobProvider {
  readonly name = 'avature';
  private readonly fetchImpl: typeof fetch;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly includeDetails: boolean;
  private readonly detailConcurrency: number;

  constructor(deps: AvatureProviderDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.pageSize = deps.pageSize ?? 50;
    this.maxPages = deps.maxPages ?? 30;
    this.includeDetails = deps.includeDetails ?? true;
    this.detailConcurrency = Math.max(1, deps.detailConcurrency ?? 6);
  }

  async fetchJobs(company: Company): Promise<Job[]> {
    const target = parseAvatureCareerUrl(company.careerUrl);
    logger.provider.info('Fetching Avature jobs', {
      company: company.name,
      baseUrl: target.baseUrl,
      locationKeyword: target.locationKeyword ?? null,
    });

    const listings: AvatureListing[] = [];
    const seen = new Set<string>();

    for (let page = 1; page <= this.maxPages; page += 1) {
      const url = buildAvatureSearchUrl(target, page, this.pageSize);
      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'text/html',
          'User-Agent': 'Mozilla/5.0 (compatible; JobFinder/1.0)',
        },
      });
      if (!response.ok) {
        throw new AppError(
          'PROVIDER_FETCH_FAILED',
          `Avature search HTTP ${response.status}`,
          502,
        );
      }
      const html = await response.text();
      const batch = parseAvatureSearchHtml(html);
      let added = 0;
      for (const item of batch) {
        if (seen.has(item.id)) {
          continue;
        }
        seen.add(item.id);
        listings.push(item);
        added += 1;
      }
      if (batch.length === 0 || added === 0) {
        break;
      }
    }

    const details = this.includeDetails
      ? await this.fetchDetailsInBatches(target.baseUrl, listings)
      : listings.map(() => null);

    return listings.map((item, index) =>
      this.normalize(item, details[index], company, target),
    );
  }

  private async fetchDetailsInBatches(
    baseUrl: string,
    listings: AvatureListing[],
  ): Promise<
    Array<{
      description: string | null;
      location: string | null;
      title: string | null;
    } | null>
  > {
    const results: Array<{
      description: string | null;
      location: string | null;
      title: string | null;
    } | null> = new Array(listings.length).fill(null);

    for (let i = 0; i < listings.length; i += this.detailConcurrency) {
      const slice = listings.slice(i, i + this.detailConcurrency);
      const batch = await Promise.all(
        slice.map(async (item) => {
          try {
            const response = await this.fetchImpl(`${baseUrl}${item.path}`, {
              method: 'GET',
              headers: {
                Accept: 'text/html',
                'User-Agent': 'Mozilla/5.0 (compatible; JobFinder/1.0)',
              },
            });
            if (!response.ok) {
              return null;
            }
            return parseAvatureDetailHtml(await response.text());
          } catch {
            return null;
          }
        }),
      );
      for (let j = 0; j < batch.length; j += 1) {
        results[i + j] = batch[j];
      }
    }
    return results;
  }

  normalize(
    listing: AvatureListing,
    detail:
      | {
          description: string | null;
          location: string | null;
          title: string | null;
        }
      | null
      | undefined,
    company: Company,
    target: AvatureBoardTarget,
  ): Job {
    return {
      company: company.name,
      companyId: company.id,
      title: detail?.title?.trim() || listing.title,
      location: detail?.location ?? null,
      description: detail?.description ?? null,
      experience: null,
      skills: null,
      salary: null,
      postedDate: null,
      applyUrl: `${target.baseUrl}${listing.path}`,
      provider: this.name,
    };
  }
}

export function parseAvatureCareerUrl(careerUrl: string): AvatureBoardTarget {
  const trimmed = careerUrl.trim();
  if (!trimmed) {
    throw new AppError('INVALID_CAREER_URL', 'Avature careerUrl is empty', 400);
  }
  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new AppError(
      'INVALID_CAREER_URL',
      `Invalid Avature careerUrl: ${careerUrl}`,
      400,
    );
  }
  const searchPath = url.pathname.includes('SearchJobs')
    ? url.pathname
    : url.pathname.includes('externaljobs')
      ? `${url.pathname.replace(/\/$/, '')}/SearchJobs/`
      : '/en_US/externaljobs/SearchJobs/';

  return {
    baseUrl: `${url.protocol}//${url.host}`,
    searchPath,
    locationKeyword:
      url.searchParams.get('location')?.trim() ||
      url.searchParams.get('keywords')?.trim() ||
      undefined,
  };
}

export function buildAvatureSearchUrl(
  target: AvatureBoardTarget,
  page: number,
  pageSize: number,
): string {
  const params = new URLSearchParams({
    listFilterMode: '1',
    folderRecordsPerPage: String(pageSize),
    page: String(page),
  });
  if (target.locationKeyword) {
    params.set('keywords', target.locationKeyword);
  }
  return `${target.baseUrl}${target.searchPath}?${params.toString()}`;
}

export function parseAvatureSearchHtml(html: string): AvatureListing[] {
  const byId = new Map<string, AvatureListing>();

  for (const match of html.matchAll(
    /data-jobname="([^"]+)"[\s\S]{0,500}?JobDetail\/(\d+)/gi,
  )) {
    const title = decodeHtml(match[1].trim());
    const id = match[2];
    byId.set(id, {
      id,
      title,
      path: `/en_US/externaljobs/JobDetail/${id}`,
    });
  }

  for (const match of html.matchAll(/JobDetail\/(\d+)/g)) {
    const id = match[1];
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        title: `Job ${id}`,
        path: `/en_US/externaljobs/JobDetail/${id}`,
      });
    }
  }
  return [...byId.values()];
}

export function parseAvatureDetailHtml(html: string): {
  description: string | null;
  location: string | null;
  title: string | null;
} {
  const title =
    html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1] ||
    html.match(/<h1[^>]*>\s*([^<]+)\s*<\/h1>/i)?.[1] ||
    null;
  const descriptionHtml =
    html.match(
      /class="[^"]*(?:job-description|jobDescription|description)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    )?.[1] ||
    html.match(/property="og:description"\s+content="([^"]+)"/i)?.[1] ||
    null;
  const location =
    html.match(/data-joblocation="([^"]*)"/i)?.[1] ||
    html.match(
      /(?:Location|City)\s*[:\-]\s*([^<\n]+(?:India|Remote)[^<\n]*)/i,
    )?.[1] ||
    null;

  return {
    title: title ? decodeHtml(title.trim()) : null,
    description: descriptionHtml
      ? stripHtml(descriptionHtml).trim() || null
      : null,
    location: location?.trim() || null,
  };
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
