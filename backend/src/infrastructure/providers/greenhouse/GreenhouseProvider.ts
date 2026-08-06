import type { Company } from '../../../domain/entities/Company.js';
import type { Job } from '../../../domain/entities/Job.js';
import type { JobProvider } from '../../../domain/ports/JobProvider.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/utils/logger.js';
import {
  decodeBasicEntities,
  stripHtml,
} from '../../../shared/utils/html.js';

export { stripHtml } from '../../../shared/utils/html.js';

export interface GreenhouseJobApiItem {
  id: number;
  title: string;
  absolute_url: string;
  updated_at?: string;
  first_published?: string | null;
  location?: { name?: string };
  content?: string;
  departments?: Array<{ name?: string }>;
  offices?: Array<{ name?: string }>;
  metadata?: Array<{ name?: string; value?: unknown }>;
}

export interface GreenhouseJobsResponse {
  jobs?: GreenhouseJobApiItem[];
}

interface GreenhouseProviderDeps {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

/**
 * Greenhouse Job Board API adapter.
 * https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true
 */
export class GreenhouseProvider implements JobProvider {
  readonly name = 'greenhouse';
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(deps: GreenhouseProviderDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.baseUrl = deps.baseUrl ?? 'https://boards-api.greenhouse.io/v1/boards';
  }

  async fetchJobs(company: Company): Promise<Job[]> {
    const boardToken = extractGreenhouseBoardToken(company.careerUrl);
    const url = `${this.baseUrl}/${encodeURIComponent(boardToken)}/jobs?content=true`;

    logger.provider.info('Fetching Greenhouse jobs', {
      company: company.name,
      boardToken,
    });

    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        `Greenhouse HTTP ${response.status} for board "${boardToken}": ${body.slice(0, 200)}`,
        502,
      );
    }

    const payload = (await response.json()) as GreenhouseJobsResponse;
    const items = payload.jobs ?? [];

    return items.map((item) => this.normalize(item, company));
  }

  /** Exposed for unit tests */
  normalize(item: GreenhouseJobApiItem, company: Company): Job {
    const descriptionHtml = item.content ?? null;
    const description = descriptionHtml
      ? stripHtml(decodeBasicEntities(descriptionHtml))
      : null;

    const departmentNames = (item.departments ?? [])
      .map((d) => d.name)
      .filter((name): name is string => Boolean(name));

    const officeNames = (item.offices ?? [])
      .map((o) => o.name)
      .filter((name): name is string => Boolean(name));

    const location =
      item.location?.name?.trim() ||
      officeNames.join(', ') ||
      null;

    const postedRaw = item.first_published || item.updated_at || null;
    const postedDate = postedRaw ? new Date(postedRaw) : null;

    return {
      company: company.name,
      companyId: company.id,
      title: item.title.trim(),
      location,
      description,
      experience: extractMetadataString(item.metadata, [
        'experience',
        'years of experience',
      ]),
      skills:
        departmentNames.length > 0 ? departmentNames.join(', ') : null,
      salary: extractMetadataString(item.metadata, ['salary', 'compensation']),
      postedDate:
        postedDate && !Number.isNaN(postedDate.getTime()) ? postedDate : null,
      applyUrl: item.absolute_url,
      provider: this.name,
    };
  }
}

/**
 * Accepts:
 * - https://boards.greenhouse.io/{token}
 * - https://job-boards.greenhouse.io/{token}
 * - https://boards-api.greenhouse.io/v1/boards/{token}/...
 * - raw token string
 */
export function extractGreenhouseBoardToken(careerUrl: string): string {
  const trimmed = careerUrl.trim();
  if (!trimmed) {
    throw new AppError(
      'INVALID_CAREER_URL',
      'Greenhouse careerUrl is empty',
      400,
    );
  }

  try {
    if (trimmed.includes('://')) {
      const url = new URL(trimmed);
      const parts = url.pathname.split('/').filter(Boolean);

      if (url.hostname.includes('boards-api.greenhouse.io')) {
        const boardsIdx = parts.indexOf('boards');
        const token = boardsIdx >= 0 ? parts[boardsIdx + 1] : undefined;
        if (token) {
          return token;
        }
      }

      if (
        url.hostname.includes('greenhouse.io') ||
        url.hostname.includes('greenhouse.com')
      ) {
        const token = parts[0];
        if (token && token !== 'v1' && token !== 'embed') {
          return token;
        }
      }
    }
  } catch {
    // fall through to raw token
  }

  if (/^[a-z0-9_-]+$/i.test(trimmed)) {
    return trimmed;
  }

  throw new AppError(
    'INVALID_CAREER_URL',
    `Could not parse Greenhouse board token from careerUrl: ${careerUrl}`,
    400,
  );
}

function extractMetadataString(
  metadata: GreenhouseJobApiItem['metadata'],
  keys: string[],
): string | null {
  if (!metadata || metadata.length === 0) {
    return null;
  }
  const lowered = keys.map((k) => k.toLowerCase());
  for (const entry of metadata) {
    const name = entry.name?.toLowerCase() ?? '';
    if (!lowered.includes(name)) {
      continue;
    }
    if (typeof entry.value === 'string' && entry.value.trim()) {
      return entry.value.trim();
    }
    if (typeof entry.value === 'number') {
      return String(entry.value);
    }
  }
  return null;
}
