import type { Job } from '../../domain/entities/Job.js';
import type {
  JobMatcher,
  MatchResult,
} from '../../domain/ports/JobMatcher.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * Tries primary matcher (Gemini); on disable/failure uses keyword fallback.
 */
export class ResilientJobMatcher implements JobMatcher {
  constructor(
    private readonly primary: JobMatcher | null,
    private readonly fallback: JobMatcher,
  ) {}

  async match(resumeText: string, job: Job): Promise<MatchResult> {
    if (!this.primary) {
      return this.fallback.match(resumeText, job);
    }

    try {
      return await this.primary.match(resumeText, job);
    } catch (error) {
      logger.warn('Primary matcher failed — using keyword fallback', {
        title: job.title,
        error: error instanceof Error ? error.message : String(error),
      });
      return this.fallback.match(resumeText, job);
    }
  }
}
