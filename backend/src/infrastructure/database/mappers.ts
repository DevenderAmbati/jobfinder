import type {
  Application as PrismaApplication,
  Company as PrismaCompany,
  Job as PrismaJob,
  NotificationLog as PrismaNotificationLog,
  PromptTemplate as PrismaPromptTemplate,
  ProviderHealth as PrismaProviderHealth,
  ProviderLog as PrismaProviderLog,
  Resume as PrismaResume,
  Rule as PrismaRule,
} from '@prisma/client';
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

export function toCompany(row: PrismaCompany): Company {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    careerUrl: row.careerUrl,
    enabled: row.enabled,
    frequency: row.frequency,
    lastRun: row.lastRun,
  };
}

export function toJob(row: PrismaJob, companyName?: string): Job {
  return {
    id: row.id,
    companyId: row.companyId,
    company: companyName ?? row.companyId,
    title: row.title,
    location: row.location,
    description: row.description,
    experience: row.experience,
    skills: row.skills,
    salary: row.salary,
    salaryEstimate: row.salaryEstimate,
    postedDate: row.postedDate,
    applyUrl: row.applyUrl,
    provider: row.provider,
    dedupHash: row.dedupHash,
    matchScore: row.matchScore,
    matchSource: row.matchSource,
    recommendation: row.recommendation,
    matchReasons: parseJsonStringArray(row.matchReasons),
    missingSkills: parseJsonStringArray(row.missingSkills),
    createdAt: row.createdAt,
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

export function toRule(row: PrismaRule): Rule {
  return {
    id: row.id,
    name: row.name,
    countries: parseStringList(row.countries),
    cities: parseStringList(row.cities),
    experience: row.experience,
    skills: parseStringList(row.skills),
    roles: parseStringList(row.roles),
    excludedRoles: parseStringList(row.excludedRoles),
    companies: parseStringList(row.companies),
    minMatchScore: row.minMatchScore,
    enabled: row.enabled,
  };
}

export function toResume(row: PrismaResume): Resume {
  return {
    id: row.id,
    originalPdfPath: row.originalPdfPath,
    extractedText: row.extractedText,
    markdown: row.markdown,
    embedding: row.embedding,
  };
}

export function toPromptTemplate(row: PrismaPromptTemplate): PromptTemplate {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    content: row.content,
    enabled: row.enabled,
  };
}

export function toProviderHealth(row: PrismaProviderHealth): ProviderHealth {
  return {
    id: row.id,
    provider: row.provider,
    status: row.status,
    lastRun: row.lastRun,
    lastSuccess: row.lastSuccess,
    averageExecutionTime: row.averageExecutionTime,
    failureCount: row.failureCount,
    lastError: row.lastError,
  };
}

export function toProviderLog(row: PrismaProviderLog): ProviderLog {
  return {
    id: row.id,
    companyId: row.companyId,
    provider: row.provider,
    startTime: row.startTime,
    endTime: row.endTime,
    jobsFound: row.jobsFound,
    jobsAdded: row.jobsAdded,
    durationMs: row.durationMs,
    error: row.error,
  };
}

export function toNotificationLog(row: PrismaNotificationLog): NotificationLog {
  return {
    id: row.id,
    jobId: row.jobId,
    channel: row.channel,
    success: row.success,
    payload: row.payload,
    error: row.error,
    createdAt: row.createdAt,
  };
}

export function toApplication(
  row: PrismaApplication,
  job?: { title: string; companyName: string; applyUrl: string },
): Application {
  return {
    id: row.id,
    jobId: row.jobId,
    status: row.status,
    notes: row.notes,
    jobTitle: job?.title,
    jobCompany: job?.companyName,
    jobApplyUrl: job?.applyUrl,
    updatedAt: row.updatedAt,
  };
}
