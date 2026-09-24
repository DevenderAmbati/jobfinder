import type { Firestore } from 'firebase-admin/firestore';
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
import type { FirestoreJobRepository } from '../../infrastructure/firebase/FirestoreJobRepository.js';
import type { FirestoreLogRepository } from '../../infrastructure/firebase/FirestoreLogRepository.js';
import { getFirestore } from '../../infrastructure/firebase/admin.js';
import { AppError } from '../../shared/errors/AppError.js';
import { logger } from '../../shared/utils/logger.js';

export interface DevToolsDeps {
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

  async rescoreJobs(options: RescoreJobsOptions) {
    return this.deps.rescoreJobs.execute(options);
  }

  async testTelegram(chatId?: string) {
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
      chatId,
    });

    return { ok: true, message: 'Telegram/logging notifier invoked' };
  }

  async testGemini(userId: string) {
    const resume = await this.deps.resumes.findCurrent(userId);
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

  async ruleEvaluation(jobId: string, userId: string) {
    const job = await this.deps.jobs.findById(jobId);
    if (!job) {
      throw new AppError('JOB_NOT_FOUND', `Job ${jobId} not found`, 404);
    }
    const rule = await this.deps.rules.findByUserId(userId);
    const evaluation = this.deps.ruleEngine.evaluate(job, rule);
    return { job, rule, evaluation };
  }

  async aiOutput(jobId: string, userId: string) {
    const job = await this.deps.jobs.findById(jobId, userId);
    if (!job) {
      throw new AppError('JOB_NOT_FOUND', `Job ${jobId} not found`, 404);
    }

    return {
      jobId: job.id,
      title: job.title,
      matchScore: job.matchScore ?? null,
      matchSource: job.matchSource ?? null,
      matchReasons: job.matchReasons ?? [],
      missingSkills: job.missingSkills ?? [],
      interviewDifficulty: null,
      salaryEstimate: job.salaryEstimate ?? null,
      recommendation: job.recommendation ?? null,
    };
  }

  async clearLogs() {
    const logs = this.deps.logs as FirestoreLogRepository;
    const notifications = await logs.deleteAllNotificationLogs();
    const providers = await logs.deleteAllProviderLogs();
    logger.warn('Dev tools cleared logs', { notifications, providers });
    return {
      deletedNotificationLogs: notifications,
      deletedProviderLogs: providers,
    };
  }

  async clearDatabase() {
    const jobsRepo = this.deps.jobs as FirestoreJobRepository;
    const logs = this.deps.logs as FirestoreLogRepository;

    const appsDeleted = await deleteCollectionGroup(getFirestore(), 'applications');
    const jobData = await jobsRepo.deleteAllJobsAndMatches();
    const notifications = await logs.deleteAllNotificationLogs();
    const providerLogs = await logs.deleteAllProviderLogs();

    logger.warn('Dev tools cleared database job data', {
      applications: appsDeleted,
      matches: jobData.matches,
      notifications,
      providerLogs,
      jobs: jobData.jobs,
    });

    return {
      deletedApplications: appsDeleted,
      deletedJobMatches: jobData.matches,
      deletedNotificationLogs: notifications,
      deletedProviderLogs: providerLogs,
      deletedJobs: jobData.jobs,
      preserved: [
        'companies',
        'rules',
        'users',
        'resumes',
        'prompts',
        'providerHealth',
      ],
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

async function deleteCollectionGroup(
  db: Firestore,
  name: string,
): Promise<number> {
  let deleted = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await db.collectionGroup(name).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      deleted += 1;
    }
    await batch.commit();
  }
  return deleted;
}
