import type { Company } from '../../../domain/entities/Company.js';
import type { Job } from '../../../domain/entities/Job.js';
import type { JobProvider } from '../../../domain/ports/JobProvider.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/utils/logger.js';
import { isIndiaLocation } from '../../../domain/services/indiaLocation.js';
import { decodeBasicEntities, stripHtml } from '../../../shared/utils/html.js';

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

const MORE_PLACES = /^\+\d+\s+more$/i;

export function cleanGoogleTitle(raw: string | null | undefined): string {
  return decodeBasicEntities(stripHtml(raw ?? ''))
    .replace(/^learn more about\s+/i, '')
    .trim();
}

/** Keep India offices when the card lists several. Fall back to "India" only when the search itself is India-scoped and the card has no place text. */
export function resolveListedLocation(
  places: string[],
  indiaScoped: boolean,
): string | null {
  const cleaned = [
    ...new Set(
      places
        .map((place) => decodeBasicEntities(place).replace(/\s+/g, ' ').trim())
        .filter((place) => place.length > 0 && !MORE_PLACES.test(place)),
    ),
  ];
  const india = cleaned.filter((place) => isIndiaLocation(place));
  if (india.length > 0) {
    return india.join('; ').slice(0, 240);
  }
  if (cleaned.length > 0) {
    return cleaned.join('; ').slice(0, 240);
  }
  return indiaScoped ? 'India' : null;
}

export function isIndiaScopedGoogleSearch(searchUrl: string): boolean {
  return /[?&]location=India(?:&|$)/i.test(searchUrl);
}

export function parseGoogleCareersHtml(
  html: string,
  searchUrl: string,
): GoogleJobItem[] {
  const indiaScoped = isIndiaScopedGoogleSearch(searchUrl);
  const jobs: GoogleJobItem[] = [];
  const seen = new Set<string>();
  for (const part of html.split('<li class="lLd3Je"').slice(1)) {
    const slice = part.slice(0, 20_000);
    const heading = slice.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ?? '';
    const aria = slice.match(/aria-label="(Learn more about [^"]+)"/i)?.[1] ?? '';
    const title = (cleanGoogleTitle(heading) || cleanGoogleTitle(aria)).slice(0, 160);
    const href = decodeBasicEntities(
      slice.match(/href="([^"]*jobs\/results\/[^"]+)"/i)?.[1] ?? '',
    );
    const jobId = href.match(/jobs\/results\/(\d{6,})/i)?.[1];
    if (!jobId || !title || seen.has(jobId)) {
      continue;
    }
    seen.add(jobId);
    const places = [...slice.matchAll(/class="r0wTof[^"]*">([^<]+)/gi)].map(
      (match) => match[1] ?? '',
    );
    jobs.push({
      jobId,
      title,
      location: resolveListedLocation(places, indiaScoped),
      description: null,
      applyUrl: toAbsoluteGoogleUrl(
        href,
        jobId,
        'https://www.google.com/about/careers/applications',
      ),
      postedDate: null,
    });
  }
  return jobs;
}

export async function fetchGoogleCareersListings(
  searchUrl: string,
  options: { maxPages?: number; fetchImpl?: typeof fetch } = {},
): Promise<GoogleJobItem[]> {
  const maxPages = options.maxPages ?? 6;
  const fetchImpl = options.fetchImpl ?? fetch;
  const collected = new Map<string, GoogleJobItem>();

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await fetchImpl(googleResultsPageUrl(searchUrl, page), {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        accept: 'text/html',
      },
    });
    if (!response.ok) {
      break;
    }
    const cards = parseGoogleCareersHtml(await response.text(), searchUrl);
    if (cards.length === 0) {
      break;
    }
    let added = 0;
    for (const card of cards) {
      if (collected.has(card.jobId)) {
        continue;
      }
      collected.set(card.jobId, card);
      added += 1;
    }
    if (added === 0) {
      break;
    }
  }

  return [...collected.values()];
}

function googleResultsPageUrl(searchUrl: string, page: number): string {
  const url = new URL(searchUrl);
  if (page <= 1) {
    url.searchParams.delete('page');
  } else {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}
