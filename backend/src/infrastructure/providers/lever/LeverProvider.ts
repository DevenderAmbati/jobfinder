import type { Company } from '../../../domain/entities/Company.js';
import type { Job } from '../../../domain/entities/Job.js';
import type { JobProvider } from '../../../domain/ports/JobProvider.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/utils/logger.js';
import { stripHtml } from '../../../shared/utils/html.js';

export interface LeverSalaryRange {
  currency?: string;
  interval?: string;
  min?: number;
  max?: number;
}

export interface LeverPosting {
  id: string;
  text: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  categories?: {
    location?: string;
    commitment?: string;
    team?: string;
    department?: string;
    allLocations?: string[];
  };
  country?: string | null;
  description?: string;
  descriptionPlain?: string;
  opening?: string;
  openingPlain?: string;
  descriptionBody?: string;
  descriptionBodyPlain?: string;
  lists?: Array<{ text?: string; content?: string }>;
  workplaceType?: string;
  salaryRange?: LeverSalaryRange | null;
  salaryDescriptionPlain?: string;
}

interface LeverProviderDeps {
  fetchImpl?: typeof fetch;
  /** Defaults to US host; set to https://api.eu.lever.co/v0/postings for EU. */
  baseUrl?: string;
  pageSize?: number;
}

/**
 * Lever Postings API adapter.
 * https://api.lever.co/v0/postings/{site}?mode=json
 */
export class LeverProvider implements JobProvider {
  readonly name = 'lever';
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly pageSize: number;

  constructor(deps: LeverProviderDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.baseUrl = deps.baseUrl ?? 'https://api.lever.co/v0/postings';
    this.pageSize = deps.pageSize ?? 100;
  }

  async fetchJobs(company: Company): Promise<Job[]> {
    const site = extractLeverSiteSlug(company.careerUrl);
    const all: LeverPosting[] = [];
    let skip = 0;

    logger.provider.info('Fetching Lever jobs', { company: company.name, site });

    for (;;) {
      const url = `${this.baseUrl}/${encodeURIComponent(site)}?mode=json&limit=${this.pageSize}&skip=${skip}`;
      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new AppError(
          'PROVIDER_FETCH_FAILED',
          `Lever HTTP ${response.status} for site "${site}": ${body.slice(0, 200)}`,
          502,
        );
      }

      const page = (await response.json()) as LeverPosting[];
      if (!Array.isArray(page)) {
        throw new AppError(
          'PROVIDER_FETCH_FAILED',
          `Lever returned unexpected payload for site "${site}"`,
          502,
        );
      }

      all.push(...page);
      if (page.length < this.pageSize) {
        break;
      }
      skip += this.pageSize;
    }

    return all.map((item) => this.normalize(item, company));
  }

  /** Exposed for unit tests */
  normalize(item: LeverPosting, company: Company): Job {
    const location =
      item.categories?.location?.trim() ||
      item.categories?.allLocations?.filter(Boolean).join(', ') ||
      (item.workplaceType === 'remote' ? 'Remote' : null) ||
      (item.country ? item.country : null);

    const description =
      item.descriptionPlain?.trim() ||
      [item.openingPlain, item.descriptionBodyPlain]
        .filter(Boolean)
        .join('\n\n')
        .trim() ||
      (item.description ? stripHtml(item.description) : null) ||
      null;

    const listText = (item.lists ?? [])
      .map((list) => {
        const title = list.text?.trim() ?? '';
        const content = list.content ? stripHtml(list.content) : '';
        return [title, content].filter(Boolean).join(': ');
      })
      .filter(Boolean)
      .join('\n');

    const fullDescription = [description, listText].filter(Boolean).join('\n\n') || null;

    const skillBits = [
      item.categories?.team,
      item.categories?.department,
      item.categories?.commitment,
    ].filter((value): value is string => Boolean(value));

    const postedDate =
      typeof item.createdAt === 'number' ? new Date(item.createdAt) : null;

    return {
      company: company.name,
      companyId: company.id,
      title: item.text.trim(),
      location,
      description: fullDescription,
      experience: null,
      skills: skillBits.length > 0 ? skillBits.join(', ') : null,
      salary: formatLeverSalary(item),
      postedDate:
        postedDate && !Number.isNaN(postedDate.getTime()) ? postedDate : null,
      applyUrl: item.applyUrl || item.hostedUrl || '',
      provider: this.name,
    };
  }
}

/**
 * Accepts:
 * - https://jobs.lever.co/{site}
 * - https://jobs.eu.lever.co/{site}
 * - https://api.lever.co/v0/postings/{site}
 * - raw site slug
 */
export function extractLeverSiteSlug(careerUrl: string): string {
  const trimmed = careerUrl.trim();
  if (!trimmed) {
    throw new AppError('INVALID_CAREER_URL', 'Lever careerUrl is empty', 400);
  }

  try {
    if (trimmed.includes('://')) {
      const url = new URL(trimmed);
      const parts = url.pathname.split('/').filter(Boolean);

      if (url.hostname.includes('api.') && url.hostname.includes('lever.co')) {
        const postingsIdx = parts.indexOf('postings');
        const site = postingsIdx >= 0 ? parts[postingsIdx + 1] : undefined;
        if (site) {
          return site;
        }
      }

      if (url.hostname.includes('lever.co')) {
        const site = parts[0];
        if (site) {
          return site;
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
    `Could not parse Lever site slug from careerUrl: ${careerUrl}`,
    400,
  );
}

export function formatLeverSalary(item: LeverPosting): string | null {
  if (item.salaryDescriptionPlain?.trim()) {
    return item.salaryDescriptionPlain.trim();
  }
  const range = item.salaryRange;
  if (!range || (range.min == null && range.max == null)) {
    return null;
  }
  const currency = range.currency ?? '';
  const interval = range.interval ? ` / ${range.interval}` : '';
  if (range.min != null && range.max != null) {
    return `${currency} ${range.min}-${range.max}${interval}`.trim();
  }
  if (range.min != null) {
    return `${currency} ${range.min}+${interval}`.trim();
  }
  return `${currency} ${range.max}${interval}`.trim();
}
