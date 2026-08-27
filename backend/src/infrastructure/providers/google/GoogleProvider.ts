import type { Company } from '../../../domain/entities/Company.js';
import type { Job } from '../../../domain/entities/Job.js';
import type { JobProvider } from '../../../domain/ports/JobProvider.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/utils/logger.js';
import { stripHtml } from '../../../shared/utils/html.js';

export interface GoogleJobItem {
  jobId: string;
  title: string;
  location: string | null;
  description: string | null;
  applyUrl: string;
  postedDate: Date | null;
}

export type GoogleListingFetcher = (
  company: Company,
  searchUrl: string,
) => Promise<GoogleJobItem[]>;

interface GoogleProviderDeps {
  listingFetcher?: GoogleListingFetcher;
}

/**
 * Google Careers adapter.
 * Live fetches use an injectable listingFetcher (Playwright by default in DI).
 */
export class GoogleProvider implements JobProvider {
  readonly name = 'google';
  private readonly listingFetcher: GoogleListingFetcher;

  constructor(deps: GoogleProviderDeps = {}) {
    this.listingFetcher =
      deps.listingFetcher ??
      (async () => {
        throw new AppError(
          'PROVIDER_MISCONFIGURED',
          'GoogleProvider requires a listingFetcher (Playwright or mock)',
          500,
        );
      });
  }

  async fetchJobs(company: Company): Promise<Job[]> {
    const searchUrl = resolveGoogleSearchUrl(company.careerUrl);
    logger.provider.info('Fetching Google jobs', {
      company: company.name,
      searchUrl,
    });

    const items = await this.listingFetcher(company, searchUrl);
    return items.map((item) => this.normalize(item, company));
  }

  normalize(item: GoogleJobItem, company: Company): Job {
    return {
      company: company.name,
      companyId: company.id,
      title: item.title.trim(),
      location: item.location,
      description: item.description ? stripHtml(item.description) : null,
      experience: null,
      skills: null,
      salary: null,
      postedDate: item.postedDate,
      applyUrl: item.applyUrl,
      provider: this.name,
    };
  }
}

export function resolveGoogleSearchUrl(careerUrl: string): string {
  const trimmed = careerUrl.trim();
  if (!trimmed) {
    throw new AppError('INVALID_CAREER_URL', 'Google careerUrl is empty', 400);
  }

  if (trimmed.includes('://')) {
    return trimmed;
  }

  const query = encodeURIComponent(trimmed);
  return `https://www.google.com/about/careers/applications/jobs/results/?location=India&q=${query}`;
}

export function extractGoogleJobsFromPayload(
  payload: unknown,
  baseUrl = 'https://www.google.com/about/careers/applications',
): GoogleJobItem[] {
  const jobs: GoogleJobItem[] = [];
  const seen = new Set<string>();

  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    const record = node as Record<string, unknown>;
    const title = firstString(record, ['title', 'jobTitle', 'name']);
    const jobId = firstString(record, [
      'id',
      'jobId',
      'requisitionId',
      'reqId',
    ]);

    if (title && jobId) {
      const key = `${jobId}|${title}`;
      if (!seen.has(key)) {
        seen.add(key);
        const pathOrUrl = firstString(record, [
          'url',
          'applyUrl',
          'jobUrl',
          'canonicalUrl',
          'shareUrl',
        ]);
        jobs.push({
          jobId,
          title,
          location:
            firstString(record, ['location', 'locationsText', 'city']) ||
            joinLocations(record.locations) ||
            null,
          description:
            firstString(record, [
              'description',
              'summary',
              'snippet',
              'descriptionTeaser',
            ]) || null,
          applyUrl: toAbsoluteGoogleUrl(pathOrUrl, jobId, baseUrl),
          postedDate: parseDate(
            firstString(record, ['postedDate', 'datePosted', 'publishDate']),
          ),
        });
      }
    }

    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') {
        visit(value);
      }
    }
  };

  visit(payload);
  return jobs;
}

function firstString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number') {
      return String(value);
    }
  }
  return null;
}

function joinLocations(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const parts = value
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        return firstString(record, [
          'display',
          'city',
          'location',
          'name',
          'displayName',
        ]);
      }
      return null;
    })
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(', ') : null;
}

function toAbsoluteGoogleUrl(
  pathOrUrl: string | null,
  jobId: string,
  baseUrl: string,
): string {
  if (pathOrUrl?.startsWith('http')) {
    return pathOrUrl;
  }
  if (pathOrUrl?.startsWith('/')) {
    return `https://www.google.com${pathOrUrl}`;
  }
  return `${baseUrl.replace(/\/$/, '')}/jobs/results/${encodeURIComponent(jobId)}`;
}

function parseDate(raw: string | null): Date | null {
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
