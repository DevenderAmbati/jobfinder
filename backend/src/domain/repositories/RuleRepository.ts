import type { Rule } from '../entities/Rule.js';

export interface RuleUpsertInput {
  name?: string;
  countries?: string[];
  cities?: string[];
  experience?: string | null;
  skills?: string[];
  roles?: string[];
  excludedRoles?: string[];
  companies?: string[];
  minMatchScore?: number;
  enabled?: boolean;
}

export interface RuleRepository {
  findActive(): Promise<Rule | null>;
  findById(id: string): Promise<Rule | null>;
  upsertDefault(input: RuleUpsertInput): Promise<Rule>;
}
