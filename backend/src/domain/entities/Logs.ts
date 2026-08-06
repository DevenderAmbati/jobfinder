export interface ProviderLog {
  id: string;
  companyId: string | null;
  provider: string;
  startTime: Date;
  endTime: Date | null;
  jobsFound: number;
  jobsAdded: number;
  durationMs: number | null;
  error: string | null;
}

export interface NotificationLog {
  id: string;
  jobId: string;
  channel: string;
  success: boolean;
  payload: string | null;
  error: string | null;
  createdAt: Date;
}
