import type { Company } from '../../../domain/entities/Company.js';
import type { Job } from '../../../domain/entities/Job.js';
import type { JobProvider } from '../../../domain/ports/JobProvider.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/utils/logger.js';
import { stripHtml } from '../../../shared/utils/html.js';

export interface SmartRecruitersLocation {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  fullLocation?: string | null;
  remote?: boolean;
  hybrid?: boolean;
}

export interface SmartRecruitersPostingSummary {
  id?: string;
  name?: string;
  refNumber?: string;
  releasedDate?: string;
  location?: SmartRecruitersLocation;
  applyUrl?: string;
  postingUrl?: string;
  ref?: string;
  experienceLevel?: { label?: string };
  function?: { label?: string };
  industry?: { label?: string };
  typeOfEmployment?: { label?: string };
}

export interface SmartRecruitersPostingsResponse {
  offset?: number;
  limit?: number;
  totalFound?: number;
  content?: SmartRecruitersPostingSummary[];
}

export interface SmartRecruitersJobAdSection {
  title?: string | null;
  text?: string | null;
}

export interface SmartRecruitersPostingDetail extends SmartRecruitersPostingSummary {
  jobAd?: {
    sections?: Record<string, SmartRecruitersJobAdSection | undefined>;
  };
}

export interface SmartRecruitersBoardTarget {
  companyId: string;
  /** Optional ISO country filter, e.g. "in" for India-only boards. */
  country?: string;
}

interface SmartRecruitersProviderDeps {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  pageSize?: number;
  maxPages?: number;
  /** When true, GET each posting ref for full jobAd HTML. */
  includeDetails?: boolean;
  /** Parallel detail GETs (list endpoint has no description / applyUrl). */
  detailConcurrency?: number;
}

/**
 * SmartRecruiters public postings API adapter.
 * GET https://api.smartrecruiters.com/v1/companies/{id}/postings
 */
export class SmartRecruitersProvider implements JobProvider {
  readonly name = 'smartrecruiters';
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly includeDetails: boolean;
  private readonly detailConcurrency: number;

  constructor(deps: SmartRecruitersProviderDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.baseUrl =
      deps.baseUrl ?? 'https://api.smartrecruiters.com/v1/companies';
    this.pageSize = Math.min(deps.pageSize ?? 100, 100);
    this.maxPages = deps.maxPages ?? 30;
    this.includeDetails = deps.includeDetails ?? true;
    this.detailConcurrency = Math.max(1, deps.detailConcurrency ?? 8);
  }

  async fetchJobs(company: Company): Promise<Job[]> {
    const target = parseSmartRecruitersCareerUrl(company.careerUrl);
    logger.provider.info('Fetching SmartRecruiters jobs', {
      company: company.name,
      companyId: target.companyId,
      country: target.country ?? null,
    });

    const summaries: SmartRecruitersPostingSummary[] = [];
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;

    for (let page = 0; page < this.maxPages; page += 1) {
      const params = new URLSearchParams({
        limit: String(this.pageSize),
        offset: String(offset),
      });
      if (target.country) {
        params.set('country', target.country);
      }

      const url = `${this.baseUrl}/${encodeURIComponent(target.companyId)}/postings?${params}`;
      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new AppError(
          'PROVIDER_FETCH_FAILED',
          `SmartRecruiters HTTP ${response.status} for "${target.companyId}": ${body.slice(0, 200)}`,
          502,
        );
      }

      const payload = (await response.json()) as SmartRecruitersPostingsResponse;
      const batch = payload.content ?? [];
      if (page === 0 && typeof payload.totalFound === 'number') {
        total = payload.totalFound;
      }
      summaries.push(...batch);

      if (batch.length === 0) {
        break;
      }
      offset += batch.length;
      if (offset >= total || batch.length < this.pageSize) {
        break;
      }
    }

    const details = this.includeDetails
      ? await this.fetchDetailsInBatches(summaries)
      : summaries.map(() => null);

    return summaries.map((summary, index) => {
      const detail = details[index];
      const merged = detail
        ? {
            ...summary,
            ...detail,
            location: detail.location ?? summary.location,
            name: detail.name ?? summary.name,
            experienceLevel: detail.experienceLevel ?? summary.experienceLevel,
            function: detail.function ?? summary.function,
            industry: detail.industry ?? summary.industry,
            typeOfEmployment:
              detail.typeOfEmployment ?? summary.typeOfEmployment,
          }
        : summary;
      return this.normalize(merged, company, target.companyId);
    });
  }

  private async fetchDetailsInBatches(
    summaries: SmartRecruitersPostingSummary[],
  ): Promise<(SmartRecruitersPostingDetail | null)[]> {
    const results: (SmartRecruitersPostingDetail | null)[] = new Array(
      summaries.length,
    ).fill(null);

    for (let i = 0; i < summaries.length; i += this.detailConcurrency) {
      const slice = summaries.slice(i, i + this.detailConcurrency);
      const batch = await Promise.all(
        slice.map((summary) =>
          summary.ref ? this.fetchDetail(summary.ref) : Promise.resolve(null),
        ),
      );
      for (let j = 0; j < batch.length; j += 1) {
        results[i + j] = batch[j] ?? null;
      }
    }
    return results;
  }

  private async fetchDetail(
    refUrl: string,
  ): Promise<SmartRecruitersPostingDetail | null> {
    try {
      const response = await this.fetchImpl(refUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as SmartRecruitersPostingDetail;
    } catch {
      return null;
    }
  }

  /** Exposed for unit tests */
  normalize(
    item: SmartRecruitersPostingSummary | SmartRecruitersPostingDetail,
    company: Company,
    boardCompanyId?: string,
  ): Job {
    const title = item.name?.trim();
    if (!title) {
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        'SmartRecruiters posting is missing a name/title',
        502,
      );
    }

    const boardId =
      boardCompanyId?.trim() ||
      company.name.replace(/\s+/g, '');
    const applyUrl =
      item.applyUrl?.trim() ||
      item.postingUrl?.trim() ||
      (item.id
        ? `https://jobs.smartrecruiters.com/${boardId}/${item.id}`
        : '');

    if (!applyUrl) {
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        `SmartRecruiters posting "${title}" is missing applyUrl`,
        502,
      );
    }

    const postedDate = item.releasedDate ? new Date(item.releasedDate) : null;
    const detail = item as SmartRecruitersPostingDetail;

    return {
      company: company.name,
      companyId: company.id,
      title,
      location: formatSmartRecruitersLocation(item.location),
      description: formatSmartRecruitersDescription(detail),
      experience: item.experienceLevel?.label?.trim() || null,
      skills: formatSmartRecruitersSkills(item),
      salary: null,
      postedDate:
        postedDate && !Number.isNaN(postedDate.getTime()) ? postedDate : null,
      applyUrl,
      provider: this.name,
    };
  }
}

/**
 * Accepts:
 * - https://careers.smartrecruiters.com/{companyId}
 * - https://jobs.smartrecruiters.com/{companyId}
 * - https://api.smartrecruiters.com/v1/companies/{companyId}/postings
 * - raw companyId
 * Optional query: ?country=in
 */
export function parseSmartRecruitersCareerUrl(
  careerUrl: string,
): SmartRecruitersBoardTarget {
  const trimmed = careerUrl.trim();
  if (!trimmed) {
    throw new AppError(
      'INVALID_CAREER_URL',
      'SmartRecruiters careerUrl is empty',
      400,
    );
  }

  try {
    if (trimmed.includes('://') || trimmed.includes('?')) {
      const url = new URL(
        trimmed.includes('://') ? trimmed : `https://placeholder.local/${trimmed}`,
      );
      const country = url.searchParams.get('country')?.trim() || undefined;
      const parts = url.pathname.split('/').filter(Boolean);

      if (url.hostname.includes('api.smartrecruiters.com')) {
        const companiesIdx = parts.indexOf('companies');
        const companyId = companiesIdx >= 0 ? parts[companiesIdx + 1] : undefined;
        if (companyId) {
          return { companyId, country };
        }
      }

      if (url.hostname.includes('smartrecruiters.com')) {
        const companyId = parts[0];
        if (companyId) {
          return { companyId, country };
        }
      }

      if (url.hostname === 'placeholder.local' && parts[0]) {
        return { companyId: parts[0], country };
      }
    }
  } catch {
    // fall through
  }

  if (/^[a-z0-9_-]+$/i.test(trimmed)) {
    return { companyId: trimmed };
  }

  throw new AppError(
    'INVALID_CAREER_URL',
    `Could not parse SmartRecruiters company id from careerUrl: ${careerUrl}`,
    400,
  );
}

export function formatSmartRecruitersLocation(
  location: SmartRecruitersLocation | undefined,
): string | null {
  if (!location) {
    return null;
  }
  if (location.fullLocation?.trim()) {
    return location.fullLocation.trim().replace(/,\s*,/g, ',').replace(/,\s*$/, '');
  }
  const parts = [location.city, location.region, location.country]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (parts.length > 0) {
    return parts.join(', ');
  }
  if (location.remote) {
    return 'Remote';
  }
  return null;
}

export function formatSmartRecruitersSkills(
  item: SmartRecruitersPostingSummary,
): string | null {
  const bits = [
    item.function?.label,
    item.industry?.label,
    item.typeOfEmployment?.label,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return bits.length > 0 ? [...new Set(bits)].join(', ') : null;
}

export function formatSmartRecruitersDescription(
  item: SmartRecruitersPostingDetail,
): string | null {
  const sections = item.jobAd?.sections;
  if (!sections) {
    return null;
  }
  const chunks: string[] = [];
  for (const section of Object.values(sections)) {
    if (!section) {
      continue;
    }
    const title = section.title?.trim();
    const text = section.text ? stripHtml(section.text) : '';
    if (!text) {
      continue;
    }
    chunks.push(title ? `${title}\n${text}` : text);
  }
  return chunks.length > 0 ? chunks.join('\n\n') : null;
}
