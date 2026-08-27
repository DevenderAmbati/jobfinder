import type { Company } from '../../../domain/entities/Company.js';
import type { Job } from '../../../domain/entities/Job.js';
import type { JobProvider } from '../../../domain/ports/JobProvider.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/utils/logger.js';
import { stripHtml } from '../../../shared/utils/html.js';

export interface AmazonJobListing {
  id?: string;
  title?: string;
  location?: string;
  city?: string;
  state?: string;
  country_code?: string;
  description_short?: string;
  description?: string;
  basic_qualifications?: string;
  preferred_qualifications?: string;
  job_path?: string;
  posted_date?: string;
  job_category?: string;
  url_next_step?: string;
}

export interface AmazonSearchResponse {
  hits?: number;
  jobs?: AmazonJobListing[];
}

interface AmazonProviderDeps {
  fetchImpl?: typeof fetch;
  pageSize?: number;
  maxPages?: number;
}

const DEFAULT_INDIA_SEARCH =
  'https://www.amazon.jobs/en/search.json?base_query=&country[]=IND&category[]=software-development&offset=0&result_limit=100&sort=relevant';

/**
 * Amazon.jobs public JSON search adapter.
 * GET https://www.amazon.jobs/en/search.json?...
 */
export class AmazonProvider implements JobProvider {
  readonly name = 'amazon';
  private readonly fetchImpl: typeof fetch;
  private readonly pageSize: number;
  private readonly maxPages: number;

  constructor(deps: AmazonProviderDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.pageSize = Math.min(deps.pageSize ?? 100, 100);
    this.maxPages = deps.maxPages ?? 10;
  }

  async fetchJobs(company: Company): Promise<Job[]> {
    const searchUrl = resolveAmazonSearchUrl(company.careerUrl);
    logger.provider.info('Fetching Amazon jobs', {
      company: company.name,
      searchUrl,
    });

    const jobs: Job[] = [];
    const seen = new Set<string>();

    for (let page = 0; page < this.maxPages; page += 1) {
      const offset = page * this.pageSize;
      const pageUrl = withAmazonOffset(searchUrl, offset, this.pageSize);
      const payload = await this.fetchPage(pageUrl);
      const listings = payload.jobs ?? [];

      for (const listing of listings) {
        const normalized = this.normalize(listing, company);
        const key = `${normalized.applyUrl}|${normalized.title}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        jobs.push(normalized);
      }

      const total = payload.hits ?? jobs.length;
      if (listings.length === 0 || jobs.length >= total || listings.length < this.pageSize) {
        break;
      }
    }

    return jobs;
  }

  normalize(listing: AmazonJobListing, company: Company): Job {
    const title = listing.title?.trim();
    if (!title) {
      throw new AppError(
        'PROVIDER_PARSE_FAILED',
        'Amazon job listing missing title',
        502,
      );
    }

    const applyUrl = resolveAmazonApplyUrl(listing);
    const descriptionParts = [
      listing.description_short,
      listing.description,
      listing.basic_qualifications,
      listing.preferred_qualifications,
    ].filter((part): part is string => Boolean(part?.trim()));

    const postedDate = listing.posted_date
      ? new Date(listing.posted_date)
      : null;

    return {
      company: company.name,
      companyId: company.id,
      title,
      location:
        listing.location?.trim() ||
        [listing.city, listing.state, listing.country_code]
          .filter(Boolean)
          .join(', ') ||
        null,
      description:
        descriptionParts.length > 0
          ? stripHtml(descriptionParts.join('\n\n'))
          : null,
      experience: null,
      skills: listing.job_category?.trim() || null,
      salary: null,
      postedDate:
        postedDate && !Number.isNaN(postedDate.getTime()) ? postedDate : null,
      applyUrl,
      provider: this.name,
    };
  }

  private async fetchPage(url: string): Promise<AmazonSearchResponse> {
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (compatible; JobFinder/1.0; +https://localhost)',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        `Amazon HTTP ${response.status}: ${body.slice(0, 200)}`,
        502,
      );
    }

    return (await response.json()) as AmazonSearchResponse;
  }
}

/**
 * Accepts a full amazon.jobs search URL (json or html) or builds the India default.
 */
export function resolveAmazonSearchUrl(careerUrl: string): string {
  const trimmed = careerUrl.trim();
  if (!trimmed) {
    throw new AppError('INVALID_CAREER_URL', 'Amazon careerUrl is empty', 400);
  }

  if (!trimmed.includes('://')) {
    return DEFAULT_INDIA_SEARCH;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new AppError(
      'INVALID_CAREER_URL',
      `Invalid Amazon careerUrl: ${careerUrl}`,
      400,
    );
  }

  if (!url.hostname.includes('amazon.jobs')) {
    throw new AppError(
      'INVALID_CAREER_URL',
      `Amazon careerUrl host not recognized: ${url.hostname}`,
      400,
    );
  }

  if (!url.pathname.includes('search.json')) {
    url.pathname = '/en/search.json';
  }

  if (!url.searchParams.has('result_limit')) {
    url.searchParams.set('result_limit', '100');
  }
  if (!url.searchParams.has('offset')) {
    url.searchParams.set('offset', '0');
  }

  return url.toString();
}

export function withAmazonOffset(
  searchUrl: string,
  offset: number,
  resultLimit: number,
): string {
  const url = new URL(searchUrl);
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('result_limit', String(resultLimit));
  return url.toString();
}

function resolveAmazonApplyUrl(listing: AmazonJobListing): string {
  if (listing.url_next_step?.startsWith('http')) {
    return listing.url_next_step;
  }
  if (listing.job_path?.startsWith('http')) {
    return listing.job_path;
  }
  if (listing.job_path?.startsWith('/')) {
    return `https://www.amazon.jobs${listing.job_path}`;
  }
  if (listing.id) {
    return `https://www.amazon.jobs/en/jobs/${encodeURIComponent(listing.id)}`;
  }
  throw new AppError(
    'PROVIDER_PARSE_FAILED',
    'Amazon job listing missing apply URL',
    502,
  );
}
