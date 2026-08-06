import type { Company } from '../../../domain/entities/Company.js';
import type { Job } from '../../../domain/entities/Job.js';
import type { JobProvider } from '../../../domain/ports/JobProvider.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/utils/logger.js';
import { stripHtml } from '../../../shared/utils/html.js';

export interface OracleRequisition {
  Id?: string | number;
  Title?: string;
  PostedDate?: string;
  PrimaryLocation?: string;
  PrimaryLocationCountry?: string;
  ShortDescriptionStr?: string;
  ExternalQualificationsStr?: string;
  ExternalResponsibilitiesStr?: string;
  HotJobFlag?: boolean;
}

export interface OracleSearchItem {
  TotalJobsCount?: number;
  SiteNumber?: string;
  requisitionList?: OracleRequisition[];
}

export interface OracleSearchResponse {
  items?: OracleSearchItem[];
}

export interface OracleBoardTarget {
  host: string;
  siteNumber: string;
  /** Optional location id from Candidate Experience (e.g. India). */
  locationId?: string;
  /** Optional keyword narrowing the board. */
  keyword?: string;
  /** When set, keep only matching PrimaryLocationCountry codes (e.g. IN). */
  country?: string;
}

interface OracleProviderDeps {
  fetchImpl?: typeof fetch;
  pageSize?: number;
  maxPages?: number;
}

/**
 * Oracle Cloud HCM Candidate Experience adapter.
 * GET {host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions
 */
export class OracleProvider implements JobProvider {
  readonly name = 'oracle';
  private readonly fetchImpl: typeof fetch;
  private readonly pageSize: number;
  private readonly maxPages: number;

  constructor(deps: OracleProviderDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.pageSize = Math.min(deps.pageSize ?? 50, 100);
    this.maxPages = deps.maxPages ?? 40;
  }

  async fetchJobs(company: Company): Promise<Job[]> {
    const target = parseOracleCareerUrl(company.careerUrl);
    logger.provider.info('Fetching Oracle HCM jobs', {
      company: company.name,
      host: target.host,
      siteNumber: target.siteNumber,
      country: target.country ?? null,
    });

    const listings: OracleRequisition[] = [];
    const seen = new Set<string>();

    for (let page = 0; page < this.maxPages; page += 1) {
      const offset = page * this.pageSize;
      const payload = await this.fetchPage(target, offset);
      const batch = payload.items?.[0]?.requisitionList ?? [];
      const total = payload.items?.[0]?.TotalJobsCount ?? 0;

      for (const item of batch) {
        const id = item.Id == null ? null : String(item.Id);
        if (!id || seen.has(id)) {
          continue;
        }
        if (
          target.country &&
          item.PrimaryLocationCountry &&
          item.PrimaryLocationCountry.toUpperCase() !==
            target.country.toUpperCase()
        ) {
          continue;
        }
        seen.add(id);
        listings.push(item);
      }

      if (batch.length === 0 || offset + batch.length >= total) {
        break;
      }
    }

    return listings.map((item) => this.normalize(item, company, target));
  }

  private async fetchPage(
    target: OracleBoardTarget,
    offset: number,
  ): Promise<OracleSearchResponse> {
    const parts = [
      `siteNumber=${target.siteNumber}`,
      `limit=${this.pageSize}`,
      `offset=${offset}`,
    ];
    if (target.locationId) {
      parts.push(`locationId=${target.locationId}`);
    }
    if (target.keyword) {
      parts.push(`keyword=${encodeURIComponent(target.keyword)}`);
    }
    const finder = `findReqs;${parts.join(',')}`;
    const url =
      `https://${target.host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
      `?onlyData=true&expand=requisitionList.secondaryLocations&finder=${finder}`;

    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; JobFinder/1.0)',
      },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        `Oracle HCM HTTP ${response.status}: ${body.slice(0, 200)}`,
        502,
      );
    }
    return (await response.json()) as OracleSearchResponse;
  }

  normalize(
    item: OracleRequisition,
    company: Company,
    target: OracleBoardTarget,
  ): Job {
    const title = item.Title?.trim();
    if (!title) {
      throw new AppError(
        'PROVIDER_FETCH_FAILED',
        'Oracle requisition is missing a title',
        502,
      );
    }
    const id = String(item.Id);
    const applyUrl = `https://${target.host}/hcmUI/CandidateExperience/en/sites/${encodeURIComponent(target.siteNumber)}/job/${encodeURIComponent(id)}`;
    const description = [
      item.ShortDescriptionStr,
      item.ExternalResponsibilitiesStr,
      item.ExternalQualificationsStr,
    ]
      .filter(Boolean)
      .map((html) => stripHtml(String(html)))
      .join('\n\n')
      .trim();

    const postedDate = item.PostedDate ? new Date(item.PostedDate) : null;

    return {
      company: company.name,
      companyId: company.id,
      title,
      location: item.PrimaryLocation?.trim() || null,
      description: description || null,
      experience: null,
      skills: null,
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
 * - https://{host}/hcmUI/CandidateExperience/en/sites/{site}
 * - https://{host}/hcmUI/CandidateExperience/en/sites/{site}/requisitions?...
 * - Query helpers: ?country=IN&locationId=...&keyword=...
 */
export function parseOracleCareerUrl(careerUrl: string): OracleBoardTarget {
  const trimmed = careerUrl.trim();
  if (!trimmed) {
    throw new AppError('INVALID_CAREER_URL', 'Oracle careerUrl is empty', 400);
  }

  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new AppError(
      'INVALID_CAREER_URL',
      `Invalid Oracle careerUrl: ${careerUrl}`,
      400,
    );
  }

  const parts = url.pathname.split('/').filter(Boolean);
  const sitesIdx = parts.findIndex((part) => part.toLowerCase() === 'sites');
  const siteNumber = sitesIdx >= 0 ? parts[sitesIdx + 1] : undefined;
  if (!siteNumber) {
    throw new AppError(
      'INVALID_CAREER_URL',
      `Oracle careerUrl must include /sites/{siteNumber}: ${careerUrl}`,
      400,
    );
  }

  return {
    host: url.hostname,
    siteNumber,
    locationId: url.searchParams.get('locationId')?.trim() || undefined,
    keyword: url.searchParams.get('keyword')?.trim() || undefined,
    country: url.searchParams.get('country')?.trim()?.toUpperCase() || undefined,
  };
}
