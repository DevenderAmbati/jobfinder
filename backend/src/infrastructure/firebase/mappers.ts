import type { Application } from '../../domain/entities/Application.js';
import type { Company } from '../../domain/entities/Company.js';
import type { Job } from '../../domain/entities/Job.js';
import type {
  NotificationLog,
  ProviderLog,
} from '../../domain/entities/Logs.js';
import type { PromptTemplate } from '../../domain/entities/PromptTemplate.js';
import type { ProviderHealth } from '../../domain/entities/ProviderHealth.js';
import type { Resume } from '../../domain/entities/Resume.js';
import type { Rule } from '../../domain/entities/Rule.js';
import { parseStringList } from '../../shared/utils/stringList.js';
import { asDate, asDateRequired } from './admin.js';

export function toCompany(id: string, data: Record<string, unknown>): Company {
  return {
    id,
    name: String(data.name ?? ''),
    provider: String(data.provider ?? ''),
    careerUrl: String(data.careerUrl ?? ''),
    enabled: data.enabled !== false,
    frequency: String(data.frequency ?? '0 */6 * * *'),
    lastRun: asDate(data.lastRun),
  };
}

export function toJob(
  id: string,
  data: Record<string, unknown>,
  companyName?: string,
): Job {
  return {
    id,
    companyId: String(data.companyId ?? ''),
    company: companyName ?? String(data.companyName ?? data.companyId ?? ''),
    title: String(data.title ?? ''),
    location: (data.location as string | null | undefined) ?? null,
    description: (data.description as string | null | undefined) ?? null,
    experience: (data.experience as string | null | undefined) ?? null,
    skills: (data.skills as string | null | undefined) ?? null,
    salary: (data.salary as string | null | undefined) ?? null,
    salaryEstimate: null,
    postedDate: asDate(data.postedDate),
    applyUrl: String(data.applyUrl ?? ''),
    provider: String(data.provider ?? ''),
    dedupHash: String(data.dedupHash ?? ''),
    matchScore: null,
    matchSource: null,
    recommendation: null,
    matchReasons: null,
    missingSkills: null,
    createdAt: asDateRequired(data.createdAt),
  };
}

export type MatchDoc = {
  matchScore: number;
  matchReasons: string | null;
  missingSkills: string | null;
  interviewDifficulty: string | null;
  salaryEstimate: string | null;
  recommendation: string | null;
  matchSource: 'GEMINI' | 'KEYWORD' | null;
};

export function toJobWithMatch(
  id: string,
  data: Record<string, unknown>,
  companyName: string | undefined,
  match: MatchDoc | null | undefined,
): Job {
  const base = toJob(id, data, companyName);
  if (!match) {
    return base;
  }
  return {
    ...base,
    matchScore: match.matchScore,
    matchSource: match.matchSource,
    recommendation: match.recommendation,
    matchReasons: parseJsonStringArray(match.matchReasons),
    missingSkills: parseJsonStringArray(match.missingSkills),
    salaryEstimate: match.salaryEstimate,
  };
}

function parseJsonStringArray(raw: string | null | undefined): string[] | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }
    const values = parsed
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    return values.length > 0 ? values : null;
  } catch {
    return null;
  }
}

export function toRule(
  id: string,
  userId: string,
  data: Record<string, unknown>,
): Rule {
  return {
    id,
    userId,
    experience: (data.experience as string | null | undefined) ?? null,
    skills: parseStringList(
      typeof data.skills === 'string'
        ? data.skills
        : Array.isArray(data.skills)
          ? JSON.stringify(data.skills)
          : null,
    ),
    roles: parseStringList(
      typeof data.roles === 'string'
        ? data.roles
        : Array.isArray(data.roles)
          ? JSON.stringify(data.roles)
          : null,
    ),
    minMatchScore:
      typeof data.minMatchScore === 'number' ? data.minMatchScore : 50,
  };
}

export function toResume(id: string, data: Record<string, unknown>): Resume {
  return {
    id,
    originalPdfPath: (data.originalPdfPath as string | null | undefined) ?? null,
    extractedText: String(data.extractedText ?? ''),
    markdown: String(data.markdown ?? ''),
    embedding: (data.embedding as string | null | undefined) ?? null,
  };
}

export function toPromptTemplate(
  id: string,
  data: Record<string, unknown>,
): PromptTemplate {
  return {
    id,
    name: String(data.name ?? ''),
    version: typeof data.version === 'number' ? data.version : 1,
    content: String(data.content ?? ''),
    enabled: data.enabled !== false,
  };
}

export function toProviderHealth(
  id: string,
  data: Record<string, unknown>,
): ProviderHealth {
  return {
    id,
    provider: String(data.provider ?? id),
    status: (data.status as ProviderHealth['status']) ?? 'IDLE',
    lastRun: asDate(data.lastRun),
    lastSuccess: asDate(data.lastSuccess),
    averageExecutionTime:
      typeof data.averageExecutionTime === 'number'
        ? data.averageExecutionTime
        : 0,
    failureCount:
      typeof data.failureCount === 'number' ? data.failureCount : 0,
    lastError: (data.lastError as string | null | undefined) ?? null,
  };
}

export function toProviderLog(
  id: string,
  data: Record<string, unknown>,
): ProviderLog {
  return {
    id,
    companyId: (data.companyId as string | null | undefined) ?? null,
    provider: String(data.provider ?? ''),
    startTime: asDateRequired(data.startTime),
    endTime: asDate(data.endTime),
    jobsFound: typeof data.jobsFound === 'number' ? data.jobsFound : 0,
    jobsAdded: typeof data.jobsAdded === 'number' ? data.jobsAdded : 0,
    durationMs: (data.durationMs as number | null | undefined) ?? null,
    error: (data.error as string | null | undefined) ?? null,
  };
}

export function toNotificationLog(
  id: string,
  data: Record<string, unknown>,
): NotificationLog {
  return {
    id,
    jobId: String(data.jobId ?? ''),
    userId: (data.userId as string | null | undefined) ?? null,
    channel: String(data.channel ?? 'telegram'),
    success: Boolean(data.success),
    payload: (data.payload as string | null | undefined) ?? null,
    error: (data.error as string | null | undefined) ?? null,
    createdAt: asDateRequired(data.createdAt),
  };
}

export function toApplication(
  id: string,
  data: Record<string, unknown>,
  job?: { title: string; companyName: string; applyUrl: string },
): Application {
  return {
    id,
    jobId: String(data.jobId ?? ''),
    status: (data.status as Application['status']) ?? 'SAVED',
    notes: (data.notes as string | null | undefined) ?? null,
    jobTitle: job?.title,
    jobCompany: job?.companyName,
    jobApplyUrl: job?.applyUrl,
    updatedAt: asDate(data.updatedAt) ?? undefined,
  };
}
