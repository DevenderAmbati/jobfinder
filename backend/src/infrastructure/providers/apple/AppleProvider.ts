import type { Company } from '../../../domain/entities/Company.js';
import type { Job } from '../../../domain/entities/Job.js';
import type { JobProvider } from '../../../domain/ports/JobProvider.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/utils/logger.js';
import { stripHtml } from '../../../shared/utils/html.js';

export interface AppleJobItem {
  jobId: string;
  title: string;
  location: string | null;
  description: string | null;
  applyUrl: string;
  postedDate: Date | null;
  team: string | null;
}

export type AppleListingFetcher = (
  company: Company,
  searchUrl: string,
) => Promise<AppleJobItem[]>;

interface AppleProviderDeps {
  listingFetcher?: AppleListingFetcher;
}

const DEFAULT_INDIA_SEARCH =
  'https://jobs.apple.com/en-us/search?location=india-INDC';

/**
 * Apple Jobs adapter.
 * Live fetches use an injectable listingFetcher (Playwright by default in DI).
 */
export class AppleProvider implements JobProvider {
  readonly name = 'apple';
  private readonly listingFetcher: AppleListingFetcher;

  constructor(deps: AppleProviderDeps = {}) {
    this.listingFetcher =
      deps.listingFetcher ??
      (async () => {
        throw new AppError(
          'PROVIDER_MISCONFIGURED',
          'AppleProvider requires a listingFetcher (Playwright or mock)',
          500,
        );
      });
  }

  async fetchJobs(company: Company): Promise<Job[]> {
    const searchUrl = resolveAppleSearchUrl(company.careerUrl);
    logger.provider.info('Fetching Apple jobs', {
      company: company.name,
      searchUrl,
    });

    const items = await this.listingFetcher(company, searchUrl);
    return items.map((item) => this.normalize(item, company));
  }

  normalize(item: AppleJobItem, company: Company): Job {
    return {
      company: company.name,
      companyId: company.id,
      title: item.title.trim(),
      location: item.location,
      description: item.description ? stripHtml(item.description) : null,
      experience: null,
      skills: item.team,
      salary: null,
      postedDate: item.postedDate,
      applyUrl: item.applyUrl,
      provider: this.name,
    };
  }
}

export function resolveAppleSearchUrl(careerUrl: string): string {
  const trimmed = careerUrl.trim();
  if (!trimmed) {
    throw new AppError('INVALID_CAREER_URL', 'Apple careerUrl is empty', 400);
  }

  if (trimmed.includes('://')) {
    return trimmed;
  }

  return DEFAULT_INDIA_SEARCH;
}

export function extractAppleJobsFromPayload(
  payload: unknown,
  baseUrl = 'https://jobs.apple.com',
): AppleJobItem[] {
  const jobs: AppleJobItem[] = [];
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
    const title = firstString(record, [
      'postingTitle',
      'title',
      'jobTitle',
      'positionTitle',
      'name',
    ]);
    const jobId = firstString(record, [
      'positionId',
      'id',
      'jobId',
      'reqId',
      'postingId',
    ]);

    if (title && jobId) {
      const key = `${jobId}|${title}`;
      if (!seen.has(key)) {
        seen.add(key);
        const pathOrUrl = firstString(record, [
          'url',
          'applyUrl',
          'transformedUrl',
          'detailUrl',
        ]);
        jobs.push({
          jobId,
          title,
          location:
            firstString(record, ['locations', 'location', 'city']) ||
            joinLocations(record.locations) ||
            null,
          description:
            firstString(record, [
              'jobSummary',
              'description',
              'summary',
              'postingDescription',
            ]) || null,
          applyUrl: toAbsoluteAppleUrl(pathOrUrl, jobId, baseUrl),
          postedDate: parseDate(
            firstString(record, [
              'postingDate',
              'postedDate',
              'datePosted',
              'postedOn',
            ]),
          ),
          team:
            firstString(record, ['team', 'teamName', 'homeOffice', 'pipeline']) ||
            null,
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
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
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
          'name',
          'city',
          'location',
          'displayName',
          'localeName',
        ]);
      }
      return null;
    })
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(', ') : null;
}

function toAbsoluteAppleUrl(
  pathOrUrl: string | null,
  jobId: string,
  baseUrl: string,
): string {
  if (pathOrUrl?.startsWith('http')) {
    return pathOrUrl;
  }
  if (pathOrUrl?.startsWith('/')) {
    return `${baseUrl.replace(/\/$/, '')}${pathOrUrl}`;
  }
  return `${baseUrl.replace(/\/$/, '')}/en-us/details/${encodeURIComponent(jobId)}`;
}

function parseDate(raw: string | null): Date | null {
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
