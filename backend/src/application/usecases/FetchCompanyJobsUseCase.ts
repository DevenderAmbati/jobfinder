import type { CompanyRepository } from '../../domain/repositories/CompanyRepository.js';
import type { JobRepository } from '../../domain/repositories/JobRepository.js';
import type { RuleRepository } from '../../domain/repositories/RuleRepository.js';
import type { ResumeRepository } from '../../domain/repositories/ResumeRepository.js';
import type { UserRepository } from '../../domain/repositories/UserRepository.js';
import type { ProviderHealthRepository } from '../../domain/repositories/ProviderHealthRepository.js';
import type { LogRepository } from '../../domain/repositories/LogRepository.js';
import type { Notifier } from '../../domain/ports/Notifier.js';
import type { MatchResult } from '../../domain/ports/JobMatcher.js';
import { JobDeduplicationService } from '../../domain/services/JobDeduplicationService.js';
import { MatchScore } from '../../domain/value-objects/MatchScore.js';
import { resumeMatchText } from '../../domain/services/resumeText.js';
import type { JobScoringService } from '../services/JobScoringService.js';
import type { ProviderRegistry } from '../../infrastructure/providers/ProviderRegistry.js';
import { logger } from '../../shared/utils/logger.js';
import { AppError } from '../../shared/errors/AppError.js';
import { resolveExperienceLabel } from '../../shared/utils/experience.js';

export interface FetchCompanyJobsResult {
  companyId: string;
  jobsFound: number;
  jobsAdded: number;
  notified: number;
  skippedDuplicates: number;
  /** Jobs vetoed as ineligible — excluded title or off the company allow-list. */
  skippedByRules: number;
  /** Eligible jobs that received a score and are now visible in the feed. */
  scored: number;
  /** Jobs that cleared the fit floor and spent an LLM call. */
  escalated: number;
}

export interface FetchCompanyJobsDeps {
  companies: CompanyRepository;
  jobs: JobRepository;
  rules: RuleRepository;
  resumes: ResumeRepository;
  users: UserRepository;
  providerHealth: ProviderHealthRepository;
  logs: LogRepository;
  providers: ProviderRegistry;
  notifier: Notifier;
  deduplication: JobDeduplicationService;
  scoring: JobScoringService;
  matchScoreThreshold: number;
  /** Caps LLM calls per run to protect free-tier quota. */
  maxEscalationsPerRun: number;
  /** Caps notifications per run so a rules change cannot flood Telegram. */
  maxNotificationsPerRun: number;
}

/**
 * Full job pipeline for one company.
 * fetch → normalize/dedup → persist → rules → match → notify
 */
export class FetchCompanyJobsUseCase {
  constructor(private readonly deps: FetchCompanyJobsDeps) {}

  async execute(companyId: string): Promise<FetchCompanyJobsResult> {
    const company = await this.deps.companies.findById(companyId);
    if (!company) {
      throw new AppError('COMPANY_NOT_FOUND', `Company ${companyId} not found`, 404);
    }

    const startTime = new Date();
    let jobsFound = 0;
    let jobsAdded = 0;
    let notified = 0;
    let skippedDuplicates = 0;
    let skippedByRules = 0;
    let scored = 0;
    let escalated = 0;
    let errorMessage: string | null = null;

    await this.deps.providerHealth.recordRun(company.provider, {
      status: 'RUNNING',
      lastRun: startTime,
    });

    try {
      const provider = this.deps.providers.get(company.provider);
      const fetched = await provider.fetchJobs(company);
      jobsFound = fetched.length;

      const userIds = await this.deps.users.listIdsWithResume();
      const resumesByUser = new Map<string, string>();
      const rulesByUser = new Map<
        string,
        Awaited<ReturnType<typeof this.deps.rules.findByUserId>>
      >();
      for (const userId of userIds) {
        const resume = await this.deps.resumes.findCurrent(userId);
        const text = resumeMatchText(resume);
        if (text) {
          resumesByUser.set(userId, text);
          rulesByUser.set(userId, await this.deps.rules.findByUserId(userId));
        }
      }

      for (const raw of fetched) {
        const normalized = {
          ...raw,
          company: company.name,
          companyId: company.id,
          provider: provider.name,
        };
        const hash = this.deps.deduplication.computeHash(normalized);

        if (await this.deps.jobs.existsByDedupHash(hash.value)) {
          skippedDuplicates += 1;
          continue;
        }

        const saved = await this.deps.jobs.create({
          companyId: company.id,
          company: company.name,
          title: normalized.title,
          location: normalized.location,
          description: normalized.description,
          experience: resolveExperienceLabel(
            normalized.experience,
            normalized.description,
            normalized.title,
          ),
          skills: normalized.skills,
          salary: normalized.salary,
          postedDate: normalized.postedDate,
          applyUrl: normalized.applyUrl,
          provider: provider.name,
          dedupHash: hash.value,
        });
        jobsAdded += 1;

        if (!saved.id) {
          continue;
        }

        if (resumesByUser.size === 0) {
          logger.warn('No user resumes on file — skipping match/notify', {
            jobId: saved.id,
          });
          continue;
        }

        const minScoreFallback = this.deps.matchScoreThreshold;
        const notifyCandidates: Array<{ userId: string; match: MatchResult }> =
          [];
        let anyScored = false;
        let vetoedForAll = true;

        for (const [userId, resumeText] of resumesByUser) {
          const rule = rulesByUser.get(userId) ?? null;
          const minScore = rule?.minMatchScore ?? minScoreFallback;
          const outcome = await this.deps.scoring.score(saved, rule, resumeText, {
            allowEscalation: escalated < this.deps.maxEscalationsPerRun,
            minScore,
          });

          if (!outcome.match) {
            continue;
          }

          vetoedForAll = false;
          if (outcome.escalated) {
            escalated += 1;
          }

          await this.deps.jobs.saveMatchResult(saved.id, outcome.match, userId);
          anyScored = true;

          if (MatchScore.of(outcome.match.score).meetsThreshold(minScore)) {
            notifyCandidates.push({ userId, match: outcome.match });
          }
        }

        if (vetoedForAll) {
          skippedByRules += 1;
          logger.info('Job vetoed as ineligible for all users', {
            title: saved.title,
          });
          continue;
        }

        if (anyScored) {
          scored += 1;
        }

        for (const { userId, match } of notifyCandidates) {
          if (notified >= this.deps.maxNotificationsPerRun) {
            break;
          }

          const chatId = await this.deps.users.getTelegramChatId(userId);
          if (!chatId) {
            continue;
          }

          const alreadyNotified =
            await this.deps.logs.hasSuccessfulNotification(
              saved.id,
              'telegram',
              userId,
            );
          if (alreadyNotified) {
            continue;
          }

          try {
            await this.deps.notifier.notify({
              job: saved,
              match,
              chatId,
            });
            await this.deps.logs.createNotificationLog({
              jobId: saved.id,
              userId,
              success: true,
              payload: JSON.stringify({
                score: match.score,
                source: match.source,
              }),
            });
            notified += 1;
          } catch (notifyError) {
            await this.deps.logs.createNotificationLog({
              jobId: saved.id,
              userId,
              success: false,
              error:
                notifyError instanceof Error
                  ? notifyError.message
                  : String(notifyError),
            });
            logger.error('Notification failed — job still persisted', {
              jobId: saved.id,
              userId,
              error:
                notifyError instanceof Error
                  ? notifyError.message
                  : String(notifyError),
            });
          }
        }
      }

      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();
      await this.deps.companies.updateLastRun(company.id, endTime);
      await this.deps.providerHealth.recordRun(company.provider, {
        status: 'SUCCESS',
        lastRun: endTime,
        lastSuccess: endTime,
        executionTimeMs: durationMs,
        lastError: null,
      });
      await this.deps.logs.createProviderLog({
        companyId: company.id,
        provider: company.provider,
        startTime,
        endTime,
        jobsFound,
        jobsAdded,
        durationMs,
      });

      return {
        companyId: company.id,
        jobsFound,
        jobsAdded,
        notified,
        skippedDuplicates,
        skippedByRules,
        scored,
        escalated,
      };
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();

      await this.deps.providerHealth.recordRun(company.provider, {
        status: 'FAILURE',
        lastRun: endTime,
        executionTimeMs: durationMs,
        lastError: errorMessage,
        incrementFailure: true,
      });
      await this.deps.logs.createProviderLog({
        companyId: company.id,
        provider: company.provider,
        startTime,
        endTime,
        jobsFound,
        jobsAdded,
        durationMs,
        error: errorMessage,
      });
      await this.deps.companies.updateLastRun(company.id, endTime).catch(() => undefined);

      throw error;
    }
  }
}
