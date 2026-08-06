import type { Job } from '../entities/Job.js';
import type { Company } from '../entities/Company.js';

/**
 * Port for ATS adapters. Infrastructure implements one adapter per provider.
 * Domain/application depend on this abstraction only (Dependency Inversion).
 */
export interface JobProvider {
  readonly name: string;
  fetchJobs(company: Company): Promise<Job[]>;
}
