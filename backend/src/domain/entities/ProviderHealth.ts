export type ProviderRunStatus = 'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILURE';

export interface ProviderHealth {
  id: string;
  provider: string;
  status: ProviderRunStatus;
  lastRun: Date | null;
  lastSuccess: Date | null;
  averageExecutionTime: number;
  failureCount: number;
  lastError: string | null;
}
