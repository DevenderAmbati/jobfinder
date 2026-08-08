import { clearSession, getStoredToken } from './auth';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let onUnauthorized: (() => void) | null = null;

/** Register a handler invoked on HTTP 401 (e.g. clear session + redirect). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData =
    typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const token = getStoredToken();
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      onUnauthorized?.();
    }
    const message =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      payload.error &&
      typeof payload.error === 'object' &&
      'message' in payload.error
        ? String((payload.error as { message: string }).message)
        : `HTTP ${response.status}`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export interface AuthUserDto {
  id: string;
  email: string;
  name: string | null;
}

export interface Company {
  id: string;
  name: string;
  provider: string;
  careerUrl: string;
  enabled: boolean;
  frequency: string;
  lastRun: string | null;
}

export interface JobListItem {
  id?: string;
  company: string;
  companyId?: string;
  title: string;
  location: string | null;
  description?: string | null;
  experience?: string | null;
  skills?: string | null;
  salary?: string | null;
  salaryEstimate?: string | null;
  postedDate?: string | null;
  applyUrl: string;
  provider: string;
  matchScore?: number | null;
  matchSource?: 'GEMINI' | 'KEYWORD' | null;
  recommendation?: string | null;
  matchReasons?: string[] | null;
  missingSkills?: string[] | null;
  createdAt?: string;
}

export interface JobFacets {
  locations: string[];
  roles: string[];
  skills: string[];
}

export interface ProviderHealthItem {
  id: string;
  provider: string;
  status: 'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILURE';
  lastRun: string | null;
  lastSuccess: string | null;
  averageExecutionTime: number;
  failureCount: number;
  lastError: string | null;
}

export interface ProviderLogItem {
  id: string;
  companyId: string | null;
  provider: string;
  startTime: string;
  endTime: string | null;
  jobsFound: number;
  jobsAdded: number;
  durationMs: number | null;
  error: string | null;
}

export interface NotificationLogItem {
  id: string;
  jobId: string;
  userId?: string | null;
  channel: string;
  success: boolean;
  payload: string | null;
  error: string | null;
  createdAt: string;
}

export interface RuleConfig {
  id: string;
  userId: string;
  experience: string | null;
  skills: string[];
  roles: string[];
  minMatchScore: number;
}

export type ApplicationStatus =
  | 'SAVED'
  | 'APPLIED'
  | 'INTERVIEW'
  | 'REJECTED'
  | 'OFFER'
  | 'JOINED';

export interface ApplicationItem {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  notes: string | null;
  jobTitle?: string;
  jobCompany?: string;
  jobApplyUrl?: string;
  updatedAt?: string;
}

export interface ResumeData {
  id: string;
  hasPdf: boolean;
  originalPdfPath: string | null;
  extractedText: string;
  markdown: string;
  hasEmbedding: boolean;
}

export interface PromptTemplateItem {
  id: string;
  name: string;
  version: number;
  content: string;
  enabled: boolean;
}

export interface SettingsStatus {
  geminiEnabled: boolean;
  geminiApiKeyConfigured: boolean;
  matchScoreThresholdEnv: number;
  ruleMinMatchScore: number | null;
  telegramConfigured: boolean;
  telegramBotConfigured?: boolean;
  enableDevTools: boolean;
  nodeEnv: string;
  note: string;
}

export interface TelegramLinkStatus {
  botConfigured: boolean;
  botUsername: string | null;
  linked: boolean;
  linkedAt: string | null;
  hasPendingToken: boolean;
}

export interface TelegramConnectResult {
  deepLink: string;
  token: string;
  botUsername: string;
}

export interface AnalyticsSummary {
  companiesTotal: number;
  companiesMonitored: number;
  jobsTotal: number;
  jobsCheckedToday: number;
  matchedJobs: number;
  ignoredJobs: number;
  notificationsTotal: number;
  notificationsToday: number;
  notificationsSuccess: number;
  applied: number;
  applicationsByStatus: Record<string, number>;
  matchScoreThresholdUsed: number;
  asOf: string;
}

export interface ApplicationAnalytics {
  total: number;
  bookmarked: number;
  applied: number;
  interview: number;
  rejected: number;
  offer: number;
  joined: number;
  appliedToday: number;
  byStatus: Record<string, number>;
  dailyApplied: Array<{ date: string; count: number }>;
  weeklyApplied: Array<{ weekStart: string; count: number }>;
  days: number;
  weeks: number;
  asOf: string;
}
