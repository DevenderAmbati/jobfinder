import type { Company } from '../../../domain/entities/Company.js';
import type { Job } from '../../../domain/entities/Job.js';
import type { JobProvider } from '../../../domain/ports/JobProvider.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/utils/logger.js';

export interface GoldmanRoleLocation {
  primary?: boolean;
  state?: string | null;
  country?: string | null;
  city?: string | null;
}

export interface GoldmanRole {
  roleId?: string;
  corporateTitle?: string | null;
  jobTitle?: string;
  jobFunction?: string | null;
  locations?: GoldmanRoleLocation[];
  status?: string | null;
  division?: string | null;
  skills?: string[] | null;
}

export interface GoldmanBoardTarget {
  searchTerm: string;
  /** Top-level LOCATION filter value, e.g. "India". */
  location?: string;
  experiences: Array<'EARLY_CAREER' | 'PROFESSIONAL'>;
}

interface GoldmanProviderDeps {
  fetchImpl?: typeof fetch;
  pageSize?: number;
  maxPages?: number;
  graphqlUrl?: string;
}

const GET_ROLES_QUERY = `query GetRoles($searchQueryInput: RoleSearchQueryInput!) {
  roleSearch(searchQueryInput: $searchQueryInput) {
    totalCount
    items {
      roleId
      corporateTitle
      jobTitle
      jobFunction
      locations { primary state country city }
      status
      division
      skills
    }
  }
}`;

/**
 * Goldman Sachs higher.gs.com GraphQL adapter.
 * POST https://api-higher.gs.com/gateway/api/v1/graphql
 */
export class GoldmanProvider implements JobProvider {
  readonly name = 'goldman';
  private readonly fetchImpl: typeof fetch;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly graphqlUrl: string;

  constructor(deps: GoldmanProviderDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.pageSize = Math.min(deps.pageSize ?? 20, 50);
    this.maxPages = deps.maxPages ?? 40;
    this.graphqlUrl =
      deps.graphqlUrl ?? 'https://api-higher.gs.com/gateway/api/v1/graphql';
  }

  async fetchJobs(company: Company): Promise<Job[]> {
    const target = parseGoldmanCareerUrl(company.careerUrl);
    logger.provider.info('Fetching Goldman Sachs roles', {
      company: company.name,
      searchTerm: target.searchTerm,
      location: target.location ?? null,
    });

    const roles: GoldmanRole[] = [];
    const seen = new Set<string>();
    let total = Number.POSITIVE_INFINITY;

    for (let page = 0; page < this.maxPages; page += 1) {
      const payload = await this.fetchPage(target, page);
      if (page === 0) {
        total = payload.totalCount;
      }
      for (const item of payload.items) {
        const key = item.roleId ?? item.jobTitle;
        if (!key || seen.has(key)) {
          continue;
        }
        seen.add(key);
        roles.push(item);
      }
      if (payload.items.length === 0 || roles.length >= total) {
        break;
      }
    }

    return roles.map((role) => this.normalize(role, company));
  }

  private async fetchPage(
    target: GoldmanBoardTarget,
    pageNumber: number,
  ): Promise<{ totalCount: number; items: GoldmanRole[] }> {
    const filters = target.location
      ? [
          {
            filterCategoryType: 'LOCATION',
            filters: [{ filter: target.location }],
          },
        ]
      : [];

    const body = {
      operationName: 'GetRoles',
      variables: {
        searchQueryInput: {
          page: { pageSize: this.pageSize, pageNumber },
          sort: { sortStrategy: 'RELEVANCE', sortOrder: 'DESC' },
          filters,
          experiences: target.experiences,
          searchTerm: target.searchTerm,
        },
      },
      query: GET_ROLES_QUERY,
    };

    const response = await this.fetchImpl(this.graphqlUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: 'https://higher.gs.com',
        Referer: 'https://higher.gs.com/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        `Goldman GraphQL HTTP ${response.status}: ${text.slice(0, 200)}`,
        502,
      );
    }

    const json = (await response.json()) as {
      errors?: Array<{ message?: string }>;
      data?: {
        roleSearch?: { totalCount?: number; items?: GoldmanRole[] };
      };
    };

    if (json.errors?.length) {
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        `Goldman GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`,
        502,
      );
    }

    return {
      totalCount: json.data?.roleSearch?.totalCount ?? 0,
      items: json.data?.roleSearch?.items ?? [],
    };
  }

  normalize(role: GoldmanRole, company: Company): Job {
    const title = role.jobTitle?.trim();
    if (!title) {
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        'Goldman role is missing a jobTitle',
        502,
      );
    }
    const roleId = role.roleId?.trim();
    const sourceId = roleId?.split('_')[0];
    const applyUrl = sourceId
      ? `https://higher.gs.com/roles/${encodeURIComponent(sourceId)}`
      : 'https://higher.gs.com/';

    const location =
      role.locations
        ?.map((loc) =>
          [loc.city, loc.state, loc.country].filter(Boolean).join(', '),
        )
        .filter(Boolean)
        .join('; ') || null;

    const skills = role.skills?.filter(Boolean).join(', ') || null;
    const description = [
      role.division ? `Division: ${role.division}` : null,
      role.jobFunction ? `Function: ${role.jobFunction}` : null,
      role.corporateTitle ? `Title level: ${role.corporateTitle}` : null,
      skills ? `Skills: ${skills}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      company: company.name,
      companyId: company.id,
      title,
      location,
      description: description || null,
      experience: role.corporateTitle ?? null,
      skills,
      salary: null,
      postedDate: null,
      applyUrl,
      provider: this.name,
    };
  }
}

/**
 * Accepts higher.gs.com URLs with optional ?query=&location= query params.
 * Defaults to software + India to match the personal target profile.
 */
export function parseGoldmanCareerUrl(careerUrl: string): GoldmanBoardTarget {
  const trimmed = careerUrl.trim();
  if (!trimmed) {
    throw new AppError('INVALID_CAREER_URL', 'Goldman careerUrl is empty', 400);
  }
  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new AppError(
      'INVALID_CAREER_URL',
      `Invalid Goldman careerUrl: ${careerUrl}`,
      400,
    );
  }
  if (!/higher\.gs\.com$/i.test(url.hostname) && !/goldmansachs\.com$/i.test(url.hostname)) {
    throw new AppError(
      'INVALID_CAREER_URL',
      `Goldman careerUrl must be on higher.gs.com, got ${url.hostname}`,
      400,
    );
  }

  return {
    searchTerm: url.searchParams.get('query')?.trim() || 'software',
    location: url.searchParams.get('location')?.trim() || 'India',
    experiences: ['EARLY_CAREER', 'PROFESSIONAL'],
  };
}
