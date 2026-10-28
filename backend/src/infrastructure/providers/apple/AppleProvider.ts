import type { Company } from '../../../domain/entities/Company.js';
import type { Job } from '../../../domain/entities/Job.js';
import type { JobProvider } from '../../../domain/ports/JobProvider.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/utils/logger.js';
import { isIndiaLocation } from '../../../domain/services/indiaLocation.js';
import { decodeBasicEntities, stripHtml } from '../../../shared/utils/html.js';

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
          'cityName',
          'location',
          'displayName',
          'localeName',
          'countryName',
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

export function cleanAppleTitle(raw: string | null | undefined): string {
  return decodeBasicEntities(stripHtml(raw ?? ''))
    .replace(/^see full role description:\s*/i, '')
    .replace(/^where we're hiring\s*/i, '')
    .trim();
}

export function pickAppleTitle(
  ...candidates: Array<string | null | undefined>
): string {
  const cleaned = candidates
    .map((value) => cleanAppleTitle(value))
    .filter((value) => value.length > 0);
  const useful = cleaned.find(
    (value) =>
      !/^(see full role description|where we're hiring|actions)$/i.test(value),
  );
  return (useful || cleaned[0] || '').slice(0, 160);
}

const APPLE_CITY =
  /\b(Bengaluru|Bangalore|Hyderabad|Pune|Mumbai|Chennai|New Delhi|Noida|Gurugram|Gurgaon|Kolkata|Delhi)\b(?:\s*,\s*[^,|]{2,40}){0,2}/i;

export function locationFromAppleCard(
  text: string | null | undefined,
): string | null {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  if (/various locations within india/i.test(flat)) {
    return 'Various Locations within India';
  }
  const city = flat.match(APPLE_CITY)?.[0]?.replace(/\s+/g, ' ').trim();
  if (city) {
    return city.slice(0, 200);
  }
  if (isIndiaLocation(flat) || /\bindia\b/i.test(flat)) {
    return 'India';
  }
  return null;
}

/** `location=india-INDC` on the public search URL → `postLocation-INDC` for the jobs API. */
export function applePostLocationId(searchUrl: string): string | null {
  try {
    const code = new URL(searchUrl).searchParams.get('location')?.split('-').pop();
    if (!code || !/^[A-Za-z0-9]+$/.test(code)) {
      return null;
    }
    return `postLocation-${code}`;
  } catch {
    return null;
  }
}

export function withIndiaFallback(
  location: string | null,
  searchUrl: string,
): string | null {
  if (location?.trim()) {
    return location.trim();
  }
  return /india/i.test(searchUrl) ? 'India' : null;
}

export function applePlaceLabel(raw: string | null | undefined): string | null {
  const text = decodeBasicEntities(stripHtml(raw ?? '')).replace(/\s+/g, ' ').trim();
  if (!text) {
    return null;
  }
  if (/various locations within india/i.test(text)) {
    return 'Various Locations within India';
  }
  if (isIndiaLocation(text) && !/\bindia\b/i.test(text)) {
    return `${text}, India`;
  }
  return text;
}

export function parseAppleSearchHtml(
  html: string,
  searchUrl: string,
): AppleJobItem[] {
  const jobs: AppleJobItem[] = [];
  const seen = new Set<string>();
  for (const part of html.split('job-list-item').slice(1)) {
    const slice = part.slice(0, 5_000);
    const href = decodeBasicEntities(
      slice.match(/href="([^"]*\/details\/[^"]+)"/i)?.[1] ?? '',
    );
    const jobId = href.match(/\/details\/([^/?#]+)/i)?.[1];
    const title = cleanAppleTitle(
      slice.match(/<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? '',
    ).slice(0, 160);
    if (!jobId || !title || seen.has(jobId)) {
      continue;
    }
    seen.add(jobId);
    const place = slice.match(/id="search-store-name[^"]*">([^<]*)</i)?.[1];
    const team = decodeBasicEntities(
      slice.match(/class="team-name[^"]*">([^<]*)</i)?.[1] ?? '',
    ).trim();
    const posted = slice.match(/class="job-posted-date"[^>]*>([^<]*)</i)?.[1] ?? null;
    jobs.push({
      jobId,
      title,
      location: withIndiaFallback(applePlaceLabel(place), searchUrl),
      description: null,
      applyUrl: href.startsWith('http')
        ? href
        : `https://jobs.apple.com${href.startsWith('/') ? href : `/${href}`}`,
      postedDate: parseDate(posted),
      team: team || null,
    });
  }
  return jobs;
}

export async function fetchAppleSearchListings(
  searchUrl: string,
  options: { maxPages?: number; fetchImpl?: typeof fetch } = {},
): Promise<AppleJobItem[]> {
  const maxPages = options.maxPages ?? 10;
  const fetchImpl = options.fetchImpl ?? fetch;
  const collected = new Map<string, AppleJobItem>();

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await fetchImpl(appleSearchPageUrl(searchUrl, page), {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        accept: 'text/html',
      },
    });
    if (!response.ok) {
      break;
    }
    const cards = parseAppleSearchHtml(await response.text(), searchUrl);
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

function appleSearchPageUrl(searchUrl: string, page: number): string {
  const url = new URL(searchUrl);
  if (page <= 1) {
    url.searchParams.delete('page');
  } else {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}
