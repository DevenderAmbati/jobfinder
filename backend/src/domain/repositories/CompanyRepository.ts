import type { Company } from '../entities/Company.js';

export interface CompanyCreateInput {
  name: string;
  provider: string;
  careerUrl: string;
  enabled?: boolean;
  frequency?: string;
}

export interface CompanyUpdateInput {
  name?: string;
  provider?: string;
  careerUrl?: string;
  enabled?: boolean;
  frequency?: string;
}

/**
 * Persistence contract for companies. Implemented by Prisma in infrastructure.
 */
export interface CompanyRepository {
  findAll(): Promise<Company[]>;
  findById(id: string): Promise<Company | null>;
  /** Enabled companies; Part 2 scheduler applies cron due-filtering. */
  findDueForRun(_now: Date): Promise<Company[]>;
  create(input: CompanyCreateInput): Promise<Company>;
  update(id: string, input: CompanyUpdateInput): Promise<Company>;
  updateLastRun(id: string, lastRun: Date): Promise<void>;
}
