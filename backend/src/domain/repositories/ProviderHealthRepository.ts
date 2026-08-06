import type {
  ProviderHealth,
  ProviderRunStatus,
} from '../entities/ProviderHealth.js';

export interface ProviderHealthUpdateInput {
  status: ProviderRunStatus;
  lastRun?: Date;
  lastSuccess?: Date | null;
  executionTimeMs?: number;
  lastError?: string | null;
  incrementFailure?: boolean;
}

export interface ProviderHealthRepository {
  findAll(): Promise<ProviderHealth[]>;
  findByProvider(provider: string): Promise<ProviderHealth | null>;
  ensureProvider(provider: string): Promise<ProviderHealth>;
  recordRun(provider: string, input: ProviderHealthUpdateInput): Promise<ProviderHealth>;
}
