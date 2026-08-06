import type { NotificationLog, ProviderLog } from '../entities/Logs.js';

export interface ProviderLogCreateInput {
  companyId?: string | null;
  provider: string;
  startTime: Date;
  endTime?: Date | null;
  jobsFound?: number;
  jobsAdded?: number;
  durationMs?: number | null;
  error?: string | null;
}

export interface NotificationLogCreateInput {
  jobId: string;
  channel?: string;
  success: boolean;
  payload?: string | null;
  error?: string | null;
}

export interface LogRepository {
  createProviderLog(input: ProviderLogCreateInput): Promise<ProviderLog>;
  listProviderLogs(limit?: number): Promise<ProviderLog[]>;
  createNotificationLog(input: NotificationLogCreateInput): Promise<NotificationLog>;
  hasSuccessfulNotification(jobId: string, channel?: string): Promise<boolean>;
  listNotificationLogs(limit?: number): Promise<NotificationLog[]>;
}
