import type { JobRepository } from '../../domain/repositories/JobRepository.js';
import type { RuleRepository } from '../../domain/repositories/RuleRepository.js';
import type { ResumeRepository } from '../../domain/repositories/ResumeRepository.js';
import type { JobScoringService } from '../services/JobScoringService.js';
import { resumeMatchText } from '../../domain/services/resumeText.js';
import { logger } from '../../shared/utils/logger.js';
import { AppError } from '../../shared/errors/AppError.js';

export interface RescoreJobsResult {
  examined: number;
  scored: number;
  vetoed: number;
  escalated: number;
}

export interface RescoreJobsOptions {
  /** Only touch jobs that have never been scored. */
  onlyUnscored?: boolean;
  limit?: number;
}

export interface RescoreJobsDeps {
  jobs: JobRepository;
  rules: RuleRepository;
  resumes: ResumeRepository;
  scoring: JobScoringService;
  matchScoreThreshold: number;
  maxEscalationsPerRun: number;
}

const DEFAULT_LIMIT = 2000;

/**
 * Rescores jobs already in the database against the current rules and resume.
 *
 * Required because deduplication makes re-fetching a no-op for stored jobs: a
 * scoring change would otherwise never reach the rows already persisted.
 * Deliberately never notifies — a backfill touching thousands of rows must not
 * emit thousands of messages.
 */
export class RescoreJobsUseCase {
  constructor(private readonly deps: RescoreJobsDeps) {}

  async execute(options: RescoreJobsOptions = {}): Promise<RescoreJobsResult> {
    const resume = await this.deps.resumes.findCurrent();
    const resumeText = resumeMatchText(resume);
    if (!resumeText) {
      throw new AppError(
        'RESUME_REQUIRED',
        'Add a resume before rescoring — matching has nothing to compare against',
        400,
      );
    }

    const rule = await this.deps.rules.findActive();
    const minScore = rule?.minMatchScore ?? this.deps.matchScoreThreshold;

    const jobs = await this.deps.jobs.findMany({
      ...(options.onlyUnscored ? { scored: false } : {}),
      limit: options.limit ?? DEFAULT_LIMIT,
    });

    let scored = 0;
    let vetoed = 0;
    let escalated = 0;

    // Sequential on purpose: SQLite writes serialize anyway, and this keeps
    // LLM calls paced instead of bursting into rate limits.
    for (const job of jobs) {
      if (!job.id) {
        continue;
      }

      const outcome = await this.deps.scoring.score(job, rule, resumeText, {
        allowEscalation: escalated < this.deps.maxEscalationsPerRun,
        minScore,
      });

      if (!outcome.match) {
        // Clear any score from a previous ruleset so newly ineligible jobs
        // drop out of the matched feed instead of lingering.
        await this.deps.jobs.clearMatchResult(job.id);
        vetoed += 1;
        continue;
      }

      if (outcome.escalated) {
        escalated += 1;
      }

      await this.deps.jobs.saveMatchResult(job.id, outcome.match);
      scored += 1;
    }

    logger.info('Rescore complete', {
      examined: jobs.length,
      scored,
      vetoed,
      escalated,
    });

    return { examined: jobs.length, scored, vetoed, escalated };
  }
}
