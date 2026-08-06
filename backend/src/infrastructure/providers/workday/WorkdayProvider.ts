import type { Company } from '../../../domain/entities/Company.js';
import type { Job } from '../../../domain/entities/Job.js';
import type { JobProvider } from '../../../domain/ports/JobProvider.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/utils/logger.js';
import { decodeBasicEntities, stripHtml } from '../../../shared/utils/html.js';

export interface WorkdayJobPosting {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
}

export interface WorkdayJobsResponse {
  total?: number;
  jobPostings?: WorkdayJobPosting[];
}

export interface WorkdayJobDetailResponse {
  jobPostingInfo?: {
    title?: string;
    jobDescription?: string;
    location?: string;
    startDate?: string;
    timeType?: string;
  };
}

export interface WorkdayBoardTarget {
  host: string;
  tenant: string;
  site: string;
}

interface WorkdayProviderDeps {
  fetchImpl?: typeof fetch;
  /** Workday hard-caps page size at 20. */
  pageSize?: number;
  /** Safety cap — 50 pages = 1000 jobs. */
  maxPages?: number;
  /** When true, GET each posting for HTML description. */
  includeDetails?: boolean;
  /**
   * Parallel detail GETs. Sequential detail fetches on a 1000-posting board
   * keep the request open for many minutes.
   */
  detailConcurrency?: number;
}

/**
 * Workday Candidate Experience (CXS) adapter.
 * POST https://{host}/wday/cxs/{tenant}/{site}/jobs
 */
export class WorkdayProvider implements JobProvider {
  readonly name = 'workday';
  private readonly fetchImpl: typeof fetch;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly includeDetails: boolean;
  private readonly detailConcurrency: number;

  constructor(deps: WorkdayProviderDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.pageSize = Math.min(deps.pageSize ?? 20, 20);
    this.maxPages = deps.maxPages ?? 50;
    this.includeDetails = deps.includeDetails ?? true;
    this.detailConcurrency = Math.max(1, deps.detailConcurrency ?? 8);
  }

  async fetchJobs(company: Company): Promise<Job[]> {
    const target = parseWorkdayCareerUrl(company.careerUrl);
    const jobsUrl = `https://${target.host}/wday/cxs/${encodeURIComponent(target.tenant)}/${encodeURIComponent(target.site)}/jobs`;

    logger.provider.info('Fetching Workday jobs', {
      company: company.name,
      host: target.host,
      site: target.site,
    });

    const postings: WorkdayJobPosting[] = [];
    let total = Number.POSITIVE_INFINITY;
    let offset = 0;

    for (let page = 0; page < this.maxPages; page += 1) {
      const payload = await this.fetchJobsPage(jobsUrl, target, offset);
      const batch = payload.jobPostings ?? [];

      if (page === 0 && typeof payload.total === 'number' && payload.total > 0) {
        total = payload.total;
      }

      postings.push(...batch);

      if (batch.length === 0) {
        break;
      }
      offset += this.pageSize;
      if (offset >= total) {
        break;
      }
      if (batch.length < this.pageSize) {
        break;
      }
    }

    const details = this.includeDetails
      ? await this.fetchDetailsInBatches(target, postings)
      : postings.map(() => null);

    return postings.map((posting, index) =>
      this.normalize(posting, company, target, details[index] ?? null),
    );
  }

  private async fetchDetailsInBatches(
    target: WorkdayBoardTarget,
    postings: WorkdayJobPosting[],
  ): Promise<(WorkdayJobDetailResponse | null)[]> {
    const results: (WorkdayJobDetailResponse | null)[] = new Array(
      postings.length,
    ).fill(null);

    for (let i = 0; i < postings.length; i += this.detailConcurrency) {
      const slice = postings.slice(i, i + this.detailConcurrency);
      const batch = await Promise.all(
        slice.map((posting) =>
          posting.externalPath
            ? this.fetchJobDetail(target, posting.externalPath)
            : Promise.resolve(null),
        ),
      );
      for (let j = 0; j < batch.length; j += 1) {
        results[i + j] = batch[j] ?? null;
      }
    }
    return results;
  }

  /** Exposed for unit tests */
  normalize(
    posting: WorkdayJobPosting,
    company: Company,
    target: WorkdayBoardTarget,
    detail: WorkdayJobDetailResponse | null = null,
  ): Job {
    const info = detail?.jobPostingInfo;
    // Prefer listing fields for identity (title/location) so detail failures
    // or generic detail payloads cannot collapse distinct postings into one dedup hash.
    const title = (posting.title || info?.title || '').trim();
    const location =
      posting.locationsText?.trim() ||
      info?.location?.trim() ||
      null;

    const descriptionHtml = info?.jobDescription ?? null;
    const description = descriptionHtml
      ? stripHtml(decodeBasicEntities(descriptionHtml))
      : null;

    const postedRaw = info?.startDate || posting.postedOn || null;
    const postedDate = postedRaw ? parseWorkdayPostedOn(postedRaw) : null;

    const applyPath = posting.externalPath ?? '';
    const applyUrl = applyPath
      ? `https://${target.host}/en-US/${target.site}${applyPath.startsWith('/') ? '' : '/'}${applyPath}`
      : `https://${target.host}/${target.site}`;

    return {
      company: company.name,
      companyId: company.id,
      title,
      location,
      description,
      experience: info?.timeType?.trim() || null,
      skills: posting.bulletFields?.join(', ') ?? null,
      salary: null,
      postedDate,
      applyUrl,
      provider: this.name,
    };
  }

  private async fetchJobsPage(
    jobsUrl: string,
    target: WorkdayBoardTarget,
    offset: number,
  ): Promise<WorkdayJobsResponse> {
    const response = await this.fetchImpl(jobsUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (compatible; Jobfinder/0.1; +https://localhost)',
        Referer: `https://${target.host}/en-US/${target.site}`,
      },
      body: JSON.stringify({
        appliedFacets: {},
        limit: this.pageSize,
        offset,
        searchText: '',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        `Workday HTTP ${response.status} for ${target.site}: ${body.slice(0, 200)}`,
        502,
      );
    }

    return (await response.json()) as WorkdayJobsResponse;
  }

  private async fetchJobDetail(
    target: WorkdayBoardTarget,
    externalPath: string,
  ): Promise<WorkdayJobDetailResponse | null> {
    const path = externalPath.startsWith('/')
      ? externalPath
      : `/${externalPath}`;
    const url = `https://${target.host}/wday/cxs/${encodeURIComponent(target.tenant)}/${encodeURIComponent(target.site)}${path}`;

    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (compatible; Jobfinder/0.1; +https://localhost)',
        },
      });
      if (!response.ok) {
        logger.provider.warn('Workday detail fetch failed', {
          status: response.status,
          path,
        });
        return null;
      }
      return (await response.json()) as WorkdayJobDetailResponse;
    } catch (error) {
      logger.provider.warn('Workday detail fetch error', {
        path,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

/**
 * Accepts:
 * - https://{tenant}.wd5.myworkdayjobs.com/{site}
 * - https://{tenant}.wd5.myworkdayjobs.com/en-US/{site}
 * - https://{host}/wday/cxs/{tenant}/{site}/jobs
 */
export function parseWorkdayCareerUrl(careerUrl: string): WorkdayBoardTarget {
  const trimmed = careerUrl.trim();
  if (!trimmed) {
    throw new AppError('INVALID_CAREER_URL', 'Workday careerUrl is empty', 400);
  }

  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new AppError(
      'INVALID_CAREER_URL',
      `Invalid Workday careerUrl: ${careerUrl}`,
      400,
    );
  }

  const host = url.hostname.toLowerCase();
  if (!host.includes('myworkdayjobs.com') && !host.includes('workdayjobs.com')) {
    throw new AppError(
      'INVALID_CAREER_URL',
      `Workday careerUrl host not recognized: ${host}`,
      400,
    );
  }

  const parts = url.pathname.split('/').filter(Boolean);
  const cxsIdx = parts.findIndex((part) => part.toLowerCase() === 'cxs');
  if (cxsIdx >= 0 && parts[cxsIdx + 1] && parts[cxsIdx + 2]) {
    return {
      host,
      tenant: parts[cxsIdx + 1],
      site: parts[cxsIdx + 2],
    };
  }

  const tenant = host.split('.')[0];
  if (!tenant) {
    throw new AppError(
      'INVALID_CAREER_URL',
      `Could not parse Workday tenant from host: ${host}`,
      400,
    );
  }

  const localeLike = /^(en|fr|de|es|pt|ja|zh)(-[A-Z]{2})?$/i;
  const siteParts = parts.filter((part) => !localeLike.test(part));
  const site = siteParts[0];
  if (!site) {
    throw new AppError(
      'INVALID_CAREER_URL',
      `Could not parse Workday site from careerUrl: ${careerUrl}`,
      400,
    );
  }

  return { host, tenant, site };
}

export function parseWorkdayPostedOn(raw: string): Date | null {
  // e.g. "Posted 30+ Days Ago" — not a real date
  if (/posted/i.test(raw) || /ago/i.test(raw)) {
    return null;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
