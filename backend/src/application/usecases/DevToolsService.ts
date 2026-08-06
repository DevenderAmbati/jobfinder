import type { CompanyRepository } from '../../domain/repositories/CompanyRepository.js';
import type { JobRepository } from '../../domain/repositories/JobRepository.js';
import type { RuleRepository } from '../../domain/repositories/RuleRepository.js';
import type { ResumeRepository } from '../../domain/repositories/ResumeRepository.js';
import type { LogRepository } from '../../domain/repositories/LogRepository.js';
import type { JobMatcher } from '../../domain/ports/JobMatcher.js';
import type { Notifier } from '../../domain/ports/Notifier.js';
import type { Job } from '../../domain/entities/Job.js';
import { RuleEngine } from '../../domain/services/RuleEngine.js';
import { resumeMatchText } from '../../domain/services/resumeText.js';
import type { ProviderRegistry } from '../../infrastructure/providers/ProviderRegistry.js';
import type { FetchCompanyJobsUseCase } from './FetchCompanyJobsUseCase.js';
import type {
  RescoreJobsOptions,
  RescoreJobsUseCase,
} from './RescoreJobsUseCase.js';
import type { ScheduleTickUseCase } from './ScheduleTickUseCase.js';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '../../shared/errors/AppError.js';
import { logger } from '../../shared/utils/logger.js';

export interface DevToolsDeps {
  prisma: PrismaClient;
  companies: CompanyRepository;
  jobs: JobRepository;
  rules: RuleRepository;
  resumes: ResumeRepository;
  logs: LogRepository;
  providers: ProviderRegistry;
  matcher: JobMatcher;
  notifier: Notifier;
  ruleEngine: RuleEngine;
  fetchCompanyJobs: FetchCompanyJobsUseCase;
  rescoreJobs: RescoreJobsUseCase;
  scheduleTick: ScheduleTickUseCase;
}

/**
 * Development-only orchestration helpers. Not used in production paths.
 */
export class DevToolsService {
  constructor(private readonly deps: DevToolsDeps) {}

  async runProvider(providerName: string, companyId: string) {
    const company = await this.deps.companies.findById(companyId);
    if (!company) {
      throw new AppError('COMPANY_NOT_FOUND', `Company ${companyId} not found`, 404);
    }
    if (company.provider.toLowerCase() !== providerName.toLowerCase()) {
      throw new AppError(
        'PROVIDER_MISMATCH',
        `Company provider is "${company.provider}", not "${providerName}"`,
        400,
      );
    }
    return this.deps.fetchCompanyJobs.execute(companyId);
  }

  async runScheduler() {
    return this.deps.scheduleTick.execute();
  }

  /**
   * Rescores stored jobs. Deduplication means re-fetching skips existing rows,
   * so this is the only way a scoring change reaches jobs already persisted.
   */
  async rescoreJobs(options: RescoreJobsOptions) {
    return this.deps.rescoreJobs.execute(options);
  }

  async testTelegram() {
    const sampleJob: Job = {
      id: 'dev-test-job',
      company: 'Dev Tools',
      title: 'Telegram Connectivity Test',
      location: 'Remote',
      description: 'Synthetic notification from developer tools',
      experience: null,
      skills: 'TypeScript',
      salary: null,
      postedDate: new Date(),
      applyUrl: 'https://example.com/dev-test',
      provider: 'stub',
    };

    await this.deps.notifier.notify({
      job: sampleJob,
      match: {
        score: 99,
        reasons: ['Developer tools connectivity check'],
        missingSkills: [],
        interviewDifficulty: 'Easy',
        salaryEstimate: null,
        recommendation: 'APPLY',
        source: 'KEYWORD',
      },
    });

    return { ok: true, message: 'Telegram/logging notifier invoked' };
  }

  async testGemini() {
    const resume = await this.deps.resumes.findCurrent();
    const resumeText =
      resumeMatchText(resume) ||
      'Software Engineer with TypeScript, React, and Node.js experience.';

    const sampleJob: Job = {
      company: 'Dev Tools',
      title: 'Software Engineer',
      location: 'Hyderabad, India',
      description:
        'Build TypeScript and React services with Node.js. Cloud experience preferred.',
      experience: '2-4 years',
      skills: 'TypeScript, React, Node.js',
      salary: null,
      postedDate: new Date(),
      applyUrl: 'https://example.com/dev-gemini',
      provider: 'stub',
    };

    const match = await this.deps.matcher.match(resumeText, sampleJob);
    return { ok: true, match };
  }

  async rawProviderResponse(providerName: string, companyId: string) {
    const company = await this.deps.companies.findById(companyId);
    if (!company) {
      throw new AppError('COMPANY_NOT_FOUND', `Company ${companyId} not found`, 404);
    }
    const provider = this.deps.providers.get(providerName);
    const jobs = await provider.fetchJobs(company);
    return {
      provider: provider.name,
      companyId: company.id,
      count: jobs.length,
      jobs,
    };
  }

  async normalizedJob(jobId: string) {
    const job = await this.deps.jobs.findById(jobId);
    if (!job) {
      throw new AppError('JOB_NOT_FOUND', `Job ${jobId} not found`, 404);
    }
    return job;
  }

  async ruleEvaluation(jobId: string) {
    const job = await this.deps.jobs.findById(jobId);
    if (!job) {
      throw new AppError('JOB_NOT_FOUND', `Job ${jobId} not found`, 404);
    }
    const rule = await this.deps.rules.findActive();
    const evaluation = this.deps.ruleEngine.evaluate(job, rule);
    return { job, rule, evaluation };
  }

  async aiOutput(jobId: string) {
    const row = await this.deps.prisma.job.findUnique({ where: { id: jobId } });
    if (!row) {
      throw new AppError('JOB_NOT_FOUND', `Job ${jobId} not found`, 404);
    }

    return {
      jobId: row.id,
      title: row.title,
      matchScore: row.matchScore,
      matchSource: row.matchSource,
      matchReasons: parseJsonArray(row.matchReasons),
      missingSkills: parseJsonArray(row.missingSkills),
      interviewDifficulty: row.interviewDifficulty,
      salaryEstimate: row.salaryEstimate,
      recommendation: row.recommendation,
    };
  }

  async clearLogs() {
    const notifications = await this.deps.prisma.notificationLog.deleteMany();
    const providers = await this.deps.prisma.providerLog.deleteMany();
    logger.warn('Dev tools cleared logs', {
      notifications: notifications.count,
      providers: providers.count,
    });
    return {
      deletedNotificationLogs: notifications.count,
      deletedProviderLogs: providers.count,
    };
  }

  async clearDatabase() {
    // Keep companies, rules, resume, prompts, provider health.
    const applications = await this.deps.prisma.application.deleteMany();
    const notifications = await this.deps.prisma.notificationLog.deleteMany();
    const providerLogs = await this.deps.prisma.providerLog.deleteMany();
    const jobs = await this.deps.prisma.job.deleteMany();

    logger.warn('Dev tools cleared database job data', {
      applications: applications.count,
      notifications: notifications.count,
      providerLogs: providerLogs.count,
      jobs: jobs.count,
    });

    return {
      deletedApplications: applications.count,
      deletedNotificationLogs: notifications.count,
      deletedProviderLogs: providerLogs.count,
      deletedJobs: jobs.count,
      preserved: ['companies', 'rules', 'resume', 'prompts', 'providerHealth'],
    };
  }

  async exportLogs() {
    const providerLogs = await this.deps.logs.listProviderLogs(1000);
    const notificationLogs = await this.deps.logs.listNotificationLogs(1000);
    return {
      exportedAt: new Date().toISOString(),
      providerLogs,
      notificationLogs,
    };
  }
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}
