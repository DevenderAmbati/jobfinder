import type { Company } from '../../../domain/entities/Company.js';
import type { Job } from '../../../domain/entities/Job.js';
import type { JobProvider } from '../../../domain/ports/JobProvider.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/utils/logger.js';
import { stripHtml } from '../../../shared/utils/html.js';

export interface SapBoardTarget {
  baseUrl: string;
  /** locationsearch query, e.g. India */
  locationSearch?: string;
}

interface SapProviderDeps {
  fetchImpl?: typeof fetch;
  pageSize?: number;
  maxPages?: number;
  includeDetails?: boolean;
  detailConcurrency?: number;
}

/**
 * SAP jobs.sap.com adapter (legacy SuccessFactors career portal HTML).
 * List: /search/?locationsearch=India
 * Detail: /job/{slug}/{id}/
 */
export class SapProvider implements JobProvider {
  readonly name = 'sap';
  private readonly fetchImpl: typeof fetch;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly includeDetails: boolean;
  private readonly detailConcurrency: number;

  constructor(deps: SapProviderDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.pageSize = deps.pageSize ?? 25;
    this.maxPages = deps.maxPages ?? 20;
    this.includeDetails = deps.includeDetails ?? true;
    this.detailConcurrency = Math.max(1, deps.detailConcurrency ?? 6);
  }

  async fetchJobs(company: Company): Promise<Job[]> {
    const target = parseSapCareerUrl(company.careerUrl);
    logger.provider.info('Fetching SAP jobs.sap.com listings', {
      company: company.name,
      locationSearch: target.locationSearch ?? null,
    });

    const listings: Array<{ path: string; title: string; locationHint: string | null }> =
      [];
    const seen = new Set<string>();

    for (let page = 0; page < this.maxPages; page += 1) {
      const startrow = page * this.pageSize;
      const url = buildSapSearchUrl(target, startrow);
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
          `SAP search HTTP ${response.status}`,
          502,
        );
      }
      const html = await response.text();
      const batch = parseSapSearchHtml(html);
      for (const item of batch) {
        if (seen.has(item.path)) {
          continue;
        }
        seen.add(item.path);
        listings.push(item);
      }
      if (batch.length === 0) {
        break;
      }
    }

    const details = this.includeDetails
      ? await this.fetchDetailsInBatches(target.baseUrl, listings)
      : listings.map(() => null);

    return listings.map((item, index) =>
      this.normalize(item, details[index], company, target.baseUrl),
    );
  }

  private async fetchDetailsInBatches(
    baseUrl: string,
    listings: Array<{ path: string }>,
  ): Promise<Array<{ description: string | null; postedDate: Date | null; location: string | null } | null>> {
    const results: Array<{
      description: string | null;
      postedDate: Date | null;
      location: string | null;
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
            return parseSapDetailHtml(await response.text());
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
    listing: { path: string; title: string; locationHint: string | null },
    detail:
      | {
          description: string | null;
          postedDate: Date | null;
          location: string | null;
        }
      | null
      | undefined,
    company: Company,
    baseUrl: string,
  ): Job {
    return {
      company: company.name,
      companyId: company.id,
      title: listing.title,
      location: detail?.location || listing.locationHint,
      description: detail?.description ?? null,
      experience: null,
      skills: null,
      salary: null,
      postedDate: detail?.postedDate ?? null,
      applyUrl: `${baseUrl}${listing.path}`,
      provider: this.name,
    };
  }
}

export function parseSapCareerUrl(careerUrl: string): SapBoardTarget {
  const trimmed = careerUrl.trim();
  if (!trimmed) {
    throw new AppError('INVALID_CAREER_URL', 'SAP careerUrl is empty', 400);
  }
  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new AppError(
      'INVALID_CAREER_URL',
      `Invalid SAP careerUrl: ${careerUrl}`,
      400,
    );
  }
  if (!url.hostname.includes('jobs.sap.com')) {
    throw new AppError(
      'INVALID_CAREER_URL',
      `SAP provider expects jobs.sap.com, got ${url.hostname}`,
      400,
    );
  }
  return {
    baseUrl: `https://${url.hostname}`,
    locationSearch:
      url.searchParams.get('locationsearch')?.trim() ||
      url.searchParams.get('location')?.trim() ||
      undefined,
  };
}

export function buildSapSearchUrl(
  target: SapBoardTarget,
  startrow: number,
): string {
  const params = new URLSearchParams({
    createNewAlert: 'false',
    q: '',
    locationsearch: target.locationSearch ?? '',
    startrow: String(startrow),
  });
  return `${target.baseUrl}/search/?${params.toString()}`;
}

export function parseSapSearchHtml(
  html: string,
): Array<{ path: string; title: string; locationHint: string | null }> {
  const results: Array<{
    path: string;
    title: string;
    locationHint: string | null;
  }> = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(
    /href="(\/job\/([^"/]+)\/\d+\/?)"[^>]*>[\s\S]*?<\/a>/gi,
  )) {
    const path = match[1].replace(/&amp;/g, '&');
    if (seen.has(path)) {
      continue;
    }
    seen.add(path);
    const slug = decodeURIComponent((match[2] || '').replace(/&amp;/g, '&'));
    const titleFromSlug = slug
      .replace(/^[A-Za-z-]+-/, '') // drop city prefix when present
      .replace(/-\d+$/, '')
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const cityHint = slug.split('-')[0] || null;
    results.push({
      path,
      title: titleFromSlug || path,
      locationHint: cityHint ? `${cityHint}, India` : null,
    });
  }

  // Prefer visible titles when present next to job links
  for (const match of html.matchAll(
    /href="(\/job\/[^"]+)"[\s\S]{0,400}?jobTitle[\s\S]*?>\s*([^<]+)\s*</gi,
  )) {
    const path = match[1].replace(/&amp;/g, '&');
    const title = decodeHtml(match[2].trim());
    const existing = results.find((item) => item.path === path);
    if (existing && title) {
      existing.title = title;
    }
  }
  return results;
}

export function parseSapDetailHtml(html: string): {
  description: string | null;
  postedDate: Date | null;
  location: string | null;
} {
  const ogTitle = html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1];
  const descMatch =
    html.match(/itemprop="description"[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/class="[^"]*jobdescription[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const description = descMatch?.[1]
    ? stripHtml(descMatch[1]).trim()
    : ogTitle
      ? null
      : null;

  const postedRaw = html.match(
    /itemprop="datePosted"[^>]*(?:content="([^"]+)"|>([^<]+))/i,
  );
  const postedText = postedRaw?.[1] || postedRaw?.[2] || null;
  const postedDate = postedText ? new Date(postedText) : null;

  const locality = html.match(
    /itemprop="addressLocality"[^>]*>([^<]+)</i,
  )?.[1];
  const region = html.match(/itemprop="addressRegion"[^>]*>([^<]+)</i)?.[1];
  const country = html.match(
    /itemprop="addressCountry"[^>]*>([^<]+)</i,
  )?.[1];
  const location = [locality, region, country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');

  return {
    description: description || null,
    postedDate:
      postedDate && !Number.isNaN(postedDate.getTime()) ? postedDate : null,
    location: location || null,
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
