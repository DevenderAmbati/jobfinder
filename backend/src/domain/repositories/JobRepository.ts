import type { Job } from '../entities/Job.js';
import type { MatchResult } from '../ports/JobMatcher.js';

export interface JobCreateInput {
  companyId: string;
  company: string;
  title: string;
  location: string | null;
  description: string | null;
  experience: string | null;
  skills: string | null;
  salary: string | null;
  postedDate: Date | null;
  applyUrl: string;
  provider: string;
  dedupHash: string;
}

export interface JobListOptions {
  /** Required for match score fields and score filters. */
  userId: string;
  /** Single company (legacy). Prefer companyIds. */
  companyId?: string;
  companyIds?: string[];
  provider?: string;
  scoreMin?: number;
  search?: string;
  /** Single role substring (legacy). Prefer roles. */
  role?: string;
  roles?: string[];
  location?: string;
  skills?: string;
  postedWithin?: 'today' | 'yesterday' | 'week' | 'month';
  scored?: boolean;
  /**
   * Order results. `match-desc`/`match-asc` sort by the user's match score at
   * the DB layer (scored jobs only), so the row cap keeps the top matches
   * instead of only the most recent postings. Defaults to newest first.
   */
  sort?: 'latest' | 'match-desc' | 'match-asc';
  limit?: number;
  /** Skip the first N rows (for batched rescore / pagination). */
  offset?: number;
  /** Include job description text (needed for matching). List API omits it. */
  includeDescription?: boolean;
  /**
   * Internal catalog walks (rescore) — do not apply the HTTP list payload cap.
   */
  forInternalWalk?: boolean;
}

export interface JobFacets {
  locations: string[];
  roles: string[];
  skills: string[];
}

/**
 * Persistence contract for jobs. Listings are shared; match writes are per-user.
 */
export interface JobRepository {
  existsByDedupHash(hash: string): Promise<boolean>;
  create(input: JobCreateInput): Promise<Job>;
  saveMatchResult(
    jobId: string,
    match: MatchResult,
    userId: string,
  ): Promise<void>;
  clearMatchResult(jobId: string, userId: string): Promise<void>;
  findById(id: string, userId?: string): Promise<Job | null>;
  findMany(options: JobListOptions): Promise<Job[]>;
  findFacets(): Promise<JobFacets>;
}
