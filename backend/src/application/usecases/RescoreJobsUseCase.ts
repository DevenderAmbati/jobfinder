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
  /** Score for this user only — match rows are per-account. */
  userId: string;
  onlyUnscored?: boolean;
  /** Optional cap (dev tools). Omit to walk the full shared catalog. */
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

const BATCH_SIZE = 250;

/**
 * Rescores shared jobs against one user's resume into JobMatch rows.
 * Walks the catalog in batches so older listings get scores too — not just
 * the newest few thousand.
 */
export class RescoreJobsUseCase {
  constructor(private readonly deps: RescoreJobsDeps) {}

  async execute(options: RescoreJobsOptions): Promise<RescoreJobsResult> {
    const resume = await this.deps.resumes.findCurrent(options.userId);
    const resumeText = resumeMatchText(resume);
    if (!resumeText) {
      throw new AppError(
        'RESUME_REQUIRED',
        'Add a resume before rescoring — matching has nothing to compare against',
        400,
      );
    }

    const rule = await this.deps.rules.findByUserId(options.userId);
    const minScore = rule?.minMatchScore ?? this.deps.matchScoreThreshold;
    const maxJobs = options.limit ?? Number.POSITIVE_INFINITY;

    let examined = 0;
    let scored = 0;
    let vetoed = 0;
    let escalated = 0;
    let offset = 0;

    while (examined < maxJobs) {
      const take = Math.min(BATCH_SIZE, maxJobs - examined);
      const jobs = await this.deps.jobs.findMany({
        userId: options.userId,
        ...(options.onlyUnscored ? { scored: false } : {}),
        limit: take,
        // onlyUnscored shrinks the unscored set each batch — always read from start.
        // Full rescore uses offset so every catalog row is visited once.
        ...(options.onlyUnscored ? {} : { offset }),
      });

      if (jobs.length === 0) {
        break;
      }

      for (const job of jobs) {
        if (!job.id) {
          continue;
        }

        examined += 1;

        const outcome = await this.deps.scoring.score(job, rule, resumeText, {
          allowEscalation: escalated < this.deps.maxEscalationsPerRun,
          minScore,
        });

        if (!outcome.match) {
          await this.deps.jobs.clearMatchResult(job.id, options.userId);
          vetoed += 1;
          continue;
        }

        if (outcome.escalated) {
          escalated += 1;
        }

        await this.deps.jobs.saveMatchResult(
          job.id,
          outcome.match,
          options.userId,
        );
        scored += 1;
      }

      if (options.onlyUnscored) {
        // Next batch is whatever remains unscored; do not advance offset.
        continue;
      }

      offset += jobs.length;
      if (jobs.length < take) {
        break;
      }
    }

    logger.info('Rescore complete', {
      userId: options.userId,
      examined,
      scored,
      vetoed,
      escalated,
    });

    return { examined, scored, vetoed, escalated };
  }
}
