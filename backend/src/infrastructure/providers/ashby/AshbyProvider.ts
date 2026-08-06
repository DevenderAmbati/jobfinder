import type { Company } from '../../../domain/entities/Company.js';
import type { Job } from '../../../domain/entities/Job.js';
import type { JobProvider } from '../../../domain/ports/JobProvider.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/utils/logger.js';
import { stripHtml } from '../../../shared/utils/html.js';

export interface AshbySecondaryLocation {
  location?: string;
}

export interface AshbyPostalAddress {
  addressRegion?: string;
  addressCountry?: string;
  addressLocality?: string;
}

export interface AshbyCompensation {
  compensationTierSummary?: string | null;
  scrapeableCompensationSalarySummary?: string | null;
}

export interface AshbyJob {
  id?: string;
  title?: string;
  department?: string | null;
  team?: string | null;
  employmentType?: string | null;
  location?: string | null;
  secondaryLocations?: AshbySecondaryLocation[];
  publishedAt?: string | null;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string | null;
  address?: {
    postalAddress?: AshbyPostalAddress;
  };
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string | null;
  descriptionPlain?: string | null;
  compensation?: AshbyCompensation | null;
}

export interface AshbyJobBoardResponse {
  jobs?: AshbyJob[];
  apiVersion?: number | string;
}

interface AshbyProviderDeps {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

/**
 * Ashby public Job Postings API adapter.
 * GET https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true
 */
export class AshbyProvider implements JobProvider {
  readonly name = 'ashby';
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(deps: AshbyProviderDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.baseUrl =
      deps.baseUrl ?? 'https://api.ashbyhq.com/posting-api/job-board';
  }

  async fetchJobs(company: Company): Promise<Job[]> {
    const board = extractAshbyBoardSlug(company.careerUrl);
    const url = `${this.baseUrl}/${encodeURIComponent(board)}?includeCompensation=true`;

    logger.provider.info('Fetching Ashby jobs', { company: company.name, board });

    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        `Ashby HTTP ${response.status} for board "${board}": ${body.slice(0, 200)}`,
        502,
      );
    }

    const payload = (await response.json()) as AshbyJobBoardResponse;
    const jobs = payload.jobs ?? [];
    if (!Array.isArray(jobs)) {
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        `Ashby returned unexpected payload for board "${board}"`,
        502,
      );
    }

    return jobs
      .filter((job) => job.isListed !== false)
      .map((job) => this.normalize(job, company));
  }

  /** Exposed for unit tests */
  normalize(item: AshbyJob, company: Company): Job {
    const title = item.title?.trim();
    if (!title) {
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        'Ashby job is missing a title',
        502,
      );
    }

    const applyUrl = item.applyUrl?.trim() || item.jobUrl?.trim() || '';
    if (!applyUrl) {
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        `Ashby job "${title}" is missing applyUrl/jobUrl`,
        502,
      );
    }

    const description =
      item.descriptionPlain?.trim() ||
      (item.descriptionHtml ? stripHtml(item.descriptionHtml) : null) ||
      null;

    const postedDate = item.publishedAt
      ? new Date(item.publishedAt)
      : null;

    return {
      company: company.name,
      companyId: company.id,
      title,
      location: formatAshbyLocation(item),
      description,
      experience: null,
      skills: formatAshbySkills(item),
      salary: formatAshbySalary(item),
      postedDate:
        postedDate && !Number.isNaN(postedDate.getTime()) ? postedDate : null,
      applyUrl,
      provider: this.name,
    };
  }
}

/**
 * Accepts:
 * - https://jobs.ashbyhq.com/{board}
 * - https://api.ashbyhq.com/posting-api/job-board/{board}
 * - raw board slug
 */
export function extractAshbyBoardSlug(careerUrl: string): string {
  const trimmed = careerUrl.trim();
  if (!trimmed) {
    throw new AppError('INVALID_CAREER_URL', 'Ashby careerUrl is empty', 400);
  }

  try {
    if (trimmed.includes('://')) {
      const url = new URL(trimmed);
      const parts = url.pathname.split('/').filter(Boolean);

      if (url.hostname.includes('api.ashbyhq.com')) {
        const boardIdx = parts.indexOf('job-board');
        const board = boardIdx >= 0 ? parts[boardIdx + 1] : undefined;
        if (board) {
          return board;
        }
      }

      if (url.hostname.includes('ashbyhq.com')) {
        const board = parts[0];
        if (board) {
          return board;
        }
      }
    }
  } catch {
    // fall through
  }

  if (/^[a-z0-9_-]+$/i.test(trimmed)) {
    return trimmed;
  }

  throw new AppError(
    'INVALID_CAREER_URL',
    `Could not parse Ashby board slug from careerUrl: ${careerUrl}`,
    400,
  );
}

export function formatAshbyLocation(item: AshbyJob): string | null {
  const primary = item.location?.trim() || null;
  const secondary = (item.secondaryLocations ?? [])
    .map((entry) => entry.location?.trim())
    .filter((value): value is string => Boolean(value));

  const parts = [primary, ...secondary].filter(Boolean) as string[];
  if (parts.length > 0) {
    return [...new Set(parts)].join('; ');
  }

  const postal = item.address?.postalAddress;
  const structured = [
    postal?.addressLocality,
    postal?.addressRegion,
    postal?.addressCountry,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (structured.length > 0) {
    return structured.join(', ');
  }

  if (item.isRemote || item.workplaceType?.toLowerCase() === 'remote') {
    return 'Remote';
  }

  return null;
}

export function formatAshbySkills(item: AshbyJob): string | null {
  const bits = [item.department, item.team, item.employmentType]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return bits.length > 0 ? [...new Set(bits)].join(', ') : null;
}

export function formatAshbySalary(item: AshbyJob): string | null {
  const compensation = item.compensation;
  if (!compensation) {
    return null;
  }
  return (
    compensation.scrapeableCompensationSalarySummary?.trim() ||
    compensation.compensationTierSummary?.trim() ||
    null
  );
}
