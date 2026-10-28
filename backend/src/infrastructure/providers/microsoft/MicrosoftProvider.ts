import type { Company } from '../../../domain/entities/Company.js';
import type { Job } from '../../../domain/entities/Job.js';
import type { JobProvider } from '../../../domain/ports/JobProvider.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/utils/logger.js';
import { stripHtml } from '../../../shared/utils/html.js';

export interface MicrosoftJobItem {
  jobId: string;
  title: string;
  location: string | null;
  description: string | null;
  applyUrl: string;
  postedDate: Date | null;
  category: string | null;
}

export type MicrosoftListingFetcher = (
  company: Company,
  searchUrl: string,
) => Promise<MicrosoftJobItem[]>;

interface MicrosoftProviderDeps {
  listingFetcher?: MicrosoftListingFetcher;
}

/**
 * Microsoft Careers adapter (Eightfold-backed portal).
 * Live fetches use an injectable listingFetcher (Playwright by default in DI).
 * Unit/integration tests inject a mock fetcher — no browser required.
 */
export class MicrosoftProvider implements JobProvider {
  readonly name = 'microsoft';
  private readonly listingFetcher: MicrosoftListingFetcher;

  constructor(deps: MicrosoftProviderDeps = {}) {
    this.listingFetcher =
      deps.listingFetcher ??
      (async () => {
        throw new AppError(
          'PROVIDER_MISCONFIGURED',
          'MicrosoftProvider requires a listingFetcher (Playwright or mock)',
          500,
        );
      });
  }

  async fetchJobs(company: Company): Promise<Job[]> {
    const searchUrl = resolveMicrosoftSearchUrl(company.careerUrl);
    logger.provider.info('Fetching Microsoft jobs', {
      company: company.name,
      searchUrl,
    });

    const items = await this.listingFetcher(company, searchUrl);
    return items.map((item) => this.normalize(item, company));
  }

  normalize(item: MicrosoftJobItem, company: Company): Job {
    return {
      company: company.name,
      companyId: company.id,
      title: item.title.trim(),
      location: item.location,
      description: item.description ? stripHtml(item.description) : null,
      experience: null,
      skills: item.category,
      salary: null,
      postedDate: item.postedDate,
      applyUrl: item.applyUrl,
      provider: this.name,
    };
  }
}

/**
 * Accepts a full Microsoft careers search URL, or builds a default global search.
 */
export function resolveMicrosoftSearchUrl(careerUrl: string): string {
  const trimmed = careerUrl.trim();
  if (!trimmed) {
    throw new AppError(
      'INVALID_CAREER_URL',
      'Microsoft careerUrl is empty',
      400,
    );
  }

  if (trimmed.includes('://')) {
    return trimmed;
  }

  const query = encodeURIComponent(trimmed);
  return `https://jobs.careers.microsoft.com/global/en/search?q=${query}&l=en_us&pg=1&pgSz=20&o=Relevance&flt=true`;
}

/**
 * Maps common Eightfold/Microsoft JSON blobs into MicrosoftJobItem[].
 * Used by Playwright network interception and tests.
 */
export function extractMicrosoftJobsFromPayload(
  payload: unknown,
  baseUrl = 'https://jobs.careers.microsoft.com',
): MicrosoftJobItem[] {
  const jobs: MicrosoftJobItem[] = [];
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
      'title',
      'jobTitle',
      'name',
      'positionName',
    ]);
    const jobId = firstString(record, [
      'jobId',
      'reqId',
      'id',
      'positionId',
      'atsJobId',
    ]);

    if (title && jobId) {
      const key = `${jobId}|${title}`;
      if (!seen.has(key)) {
        seen.add(key);
        const pathOrUrl = firstString(record, [
          'url',
          'applyUrl',
          'hostedUrl',
          'jobUrl',
          'seoUrl',
        ]);
        const applyUrl = toAbsoluteUrl(pathOrUrl, jobId, baseUrl);
        const location =
          firstString(record, ['location', 'locationsText', 'city']) ||
          joinLocations(record.locations) ||
          null;
        const description =
          firstString(record, [
            'description',
            'descriptionTeaser',
            'jobDescription',
            'snippet',
          ]) || null;
        const category =
          firstString(record, ['category', 'department', 'discipline']) || null;
        const postedRaw = firstString(record, [
          'postedDate',
          'datePosted',
          'createdDate',
          'postedOn',
        ]);
        const postedDate = postedRaw ? new Date(postedRaw) : null;

        jobs.push({
          jobId,
          title,
          location,
          description,
          applyUrl,
          postedDate:
            postedDate && !Number.isNaN(postedDate.getTime())
              ? postedDate
              : null,
          category,
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
        return firstString(record, ['city', 'location', 'name', 'displayName']);
      }
      return null;
    })
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(', ') : null;
}

export function parseMicrosoftSearchResponse(payload: unknown): MicrosoftJobItem[] {
  const data = (payload as { data?: { positions?: unknown[] } } | null)?.data;
  const positions = Array.isArray(data?.positions) ? data.positions : [];
  const jobs: MicrosoftJobItem[] = [];
  const seen = new Set<string>();

  for (const item of positions) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Record<string, unknown>;
    const title = typeof record.name === 'string' ? record.name.trim() : '';
    const jobId =
      firstString(record, ['displayJobId', 'atsJobId']) ||
      firstString(record, ['id']);
    if (!title || !jobId || seen.has(jobId)) {
      continue;
    }
    seen.add(jobId);
    const postedTs = typeof record.postedTs === 'number' ? record.postedTs : null;
    jobs.push({
      jobId,
      title: title.slice(0, 160),
      location: joinLocations(record.locations),
      description: null,
      applyUrl: `https://jobs.careers.microsoft.com/global/en/job/${encodeURIComponent(jobId)}`,
      postedDate: postedTs ? new Date(postedTs * 1000) : null,
      category: typeof record.department === 'string' ? record.department : null,
    });
  }

  return jobs;
}

export async function fetchMicrosoftCareersListings(
  searchUrl: string,
  options: { maxJobs?: number; fetchImpl?: typeof fetch } = {},
): Promise<MicrosoftJobItem[]> {
  const maxJobs = options.maxJobs ?? 150;
  const fetchImpl = options.fetchImpl ?? fetch;
  const { query, location } = microsoftSearchParams(searchUrl);
  const collected = new Map<string, MicrosoftJobItem>();
  let total = Number.POSITIVE_INFINITY;

  for (let start = 0; collected.size < maxJobs && start < total && start < 400; ) {
    const api = new URL('https://apply.careers.microsoft.com/api/pcsx/search');
    api.searchParams.set('domain', 'microsoft.com');
    api.searchParams.set('query', query);
    api.searchParams.set('location', location);
    api.searchParams.set('start', String(start));
    const response = await fetchImpl(api.toString(), {
      headers: {
        accept: 'application/json',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });
    if (!response.ok) {
      break;
    }
    const payload = (await response.json()) as {
      data?: { count?: number };
    };
    if (typeof payload.data?.count === 'number') {
      total = payload.data.count;
    }
    const page = parseMicrosoftSearchResponse(payload);
    if (page.length === 0) {
      break;
    }
    for (const job of page) {
      if (!collected.has(job.jobId)) {
        collected.set(job.jobId, job);
      }
    }
    start += page.length;
  }

  return [...collected.values()].slice(0, maxJobs);
}

function microsoftSearchParams(searchUrl: string): { query: string; location: string } {
  try {
    const url = new URL(searchUrl);
    return {
      query: url.searchParams.get('q') ?? url.searchParams.get('query') ?? '',
      location: url.searchParams.get('lc') ?? url.searchParams.get('location') ?? 'India',
    };
  } catch {
    return { query: '', location: 'India' };
  }
}

function toAbsoluteUrl(
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
  return `${baseUrl.replace(/\/$/, '')}/global/en/job/${encodeURIComponent(jobId)}`;
}
