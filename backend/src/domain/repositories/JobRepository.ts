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
  companyId?: string;
  provider?: string;
  scoreMin?: number;
  search?: string;
  /** Substring match against job title (role) */
  role?: string;
  /** Substring match against location */
  location?: string;
  /** Substring match against skills text */
  skills?: string;
  /** Relative posted window using postedDate, else createdAt */
  postedWithin?: 'today' | 'yesterday' | 'week' | 'month';
  /** True for jobs already scored, false for jobs awaiting scoring */
  scored?: boolean;
  limit?: number;
}

export interface JobFacets {
  locations: string[];
  roles: string[];
  skills: string[];
}

/**
 * Persistence contract for jobs. Implemented by Prisma in infrastructure.
 */
export interface JobRepository {
  existsByDedupHash(hash: string): Promise<boolean>;
  create(input: JobCreateInput): Promise<Job>;
  saveMatchResult(jobId: string, match: MatchResult): Promise<void>;
  /** Drops a stale score so newly ineligible jobs leave the matched feed. */
  clearMatchResult(jobId: string): Promise<void>;
  findById(id: string): Promise<Job | null>;
  findMany(options?: JobListOptions): Promise<Job[]>;
  findFacets(): Promise<JobFacets>;
}
