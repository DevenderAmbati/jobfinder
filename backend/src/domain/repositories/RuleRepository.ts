import type { Rule } from '../entities/Rule.js';

export interface RuleUpsertInput {
  experience?: string | null;
  skills?: string[];
  roles?: string[];
  minMatchScore?: number;
}

export interface RuleRepository {
  findByUserId(userId: string): Promise<Rule | null>;
  upsertForUser(userId: string, input: RuleUpsertInput): Promise<Rule>;
}
