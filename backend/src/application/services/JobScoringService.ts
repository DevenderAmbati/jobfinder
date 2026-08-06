import type { Job } from '../../domain/entities/Job.js';
import type { Rule } from '../../domain/entities/Rule.js';
import type { JobMatcher, MatchResult } from '../../domain/ports/JobMatcher.js';
import type { RelevanceScorer } from '../../domain/services/RelevanceScorer.js';
import type {
  RuleEngine,
  RuleEvaluation,
} from '../../domain/services/RuleEngine.js';

export interface JobScoringDeps {
  ruleEngine: RuleEngine;
  relevance: RelevanceScorer;
  /** May call an LLM. Reserved for jobs that clear the fit floor. */
  primaryMatcher: JobMatcher;
  /** Free, local, always safe to run. */
  baselineMatcher: JobMatcher;
  /** Minimum rule fit required to spend an LLM call on a job. */
  escalationFitFloor: number;
}

export interface JobScoreOutcome {
  evaluation: RuleEvaluation;
  /** Null when the job was vetoed and therefore never scored. */
  match: MatchResult | null;
  escalated: boolean;
}

export interface ScoreOptions {
  /** Caller owns the LLM budget, so escalation is granted per call. */
  allowEscalation: boolean;
  /** Drives the APPLY/SKIP recommendation on the blended score. */
  minScore: number;
}

/**
 * Scores one job: rule evaluation, then resume matching for eligible jobs,
 * then blending. Shared by the fetch pipeline and the rescore backfill so the
 * two cannot diverge. Depends on the JobMatcher port, never on a concrete
 * matcher implementation.
 */
export class JobScoringService {
  constructor(private readonly deps: JobScoringDeps) {}

  async score(
    job: Job,
    rule: Rule | null,
    resumeText: string,
    options: ScoreOptions,
  ): Promise<JobScoreOutcome> {
    const evaluation = this.deps.ruleEngine.evaluate(job, rule);

    if (!evaluation.eligible) {
      return { evaluation, match: null, escalated: false };
    }

    // An unreachable job is never worth an LLM call, however well its skills
    // line up, so location gates escalation alongside the fit floor.
    const escalated =
      options.allowEscalation &&
      evaluation.locationMatched &&
      evaluation.fitScore >= this.deps.escalationFitFloor;
    const matcher = escalated
      ? this.deps.primaryMatcher
      : this.deps.baselineMatcher;

    const raw = await matcher.match(resumeText, job);
    const blended = this.deps.relevance.score({
      resumeScore: raw.score,
      fitScore: evaluation.fitScore,
      locationMatched: evaluation.locationMatched,
    });

    return {
      evaluation,
      escalated,
      match: {
        ...raw,
        score: blended.score,
        reasons: [...blended.reasons, ...evaluation.reasons, ...raw.reasons],
        recommendation: blended.score >= options.minScore ? 'APPLY' : 'SKIP',
      },
    };
  }
}
