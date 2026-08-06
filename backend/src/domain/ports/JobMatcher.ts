import type { Job } from '../entities/Job.js';

export type MatchSource = 'GEMINI' | 'KEYWORD';

export interface MatchResult {
  score: number;
  reasons: string[];
  missingSkills: string[];
  interviewDifficulty: string | null;
  salaryEstimate: string | null;
  recommendation: 'APPLY' | 'SKIP';
  source: MatchSource;
}

/**
 * Port for job matching. Gemini and keyword matchers implement this.
 */
export interface JobMatcher {
  match(resumeText: string, job: Job): Promise<MatchResult>;
}
