import type { Job } from '../entities/Job.js';
import { ruleHasPreferences, type Rule } from '../entities/Rule.js';
import {
  containsPhrase,
  containsTerm,
  expandRoles,
  normalizeText,
} from './textMatching.js';

export type FitDimension = 'role' | 'skills' | 'experience';

export interface FitSignal {
  dimension: FitDimension;
  /** Fraction of this dimension earned, 0–1. */
  earned: number;
  weight: number;
  detail: string;
}

export interface RuleEvaluation {
  /**
   * Always true for the simplified preference rules — scoring never vetoes
   * solely on preferences (resume match still ranks every eligible listing).
   */
  eligible: boolean;
  vetoReason: string | null;
  /** Graded 0–100 against configured roles / skills / experience. */
  fitScore: number;
  /** Kept for scoring API compatibility; location is not part of user rules. */
  locationMatched: boolean;
  signals: FitSignal[];
  reasons: string[];
  /** Whether roles/skills/experience were set (drives 60/40 vs resume-only). */
  applyRuleFit: boolean;
}

const DIMENSION_WEIGHTS: Record<FitDimension, number> = {
  role: 40,
  skills: 40,
  experience: 20,
};

/**
 * Evaluates a job against a user's preference rule (roles, skills, experience).
 */
export class RuleEngine {
  evaluate(job: Job, rule: Rule | null): RuleEvaluation {
    if (!ruleHasPreferences(rule)) {
      return {
        eligible: true,
        vetoReason: null,
        fitScore: 100,
        locationMatched: true,
        signals: [],
        reasons: ['No preference rules — resume match only'],
        applyRuleFit: false,
      };
    }

    const title = normalizeText(job.title);
    const haystack = normalizeText(
      [
        job.title,
        job.location ?? '',
        job.description ?? '',
        job.skills ?? '',
        job.experience ?? '',
      ].join(' '),
    );

    const signals: FitSignal[] = [];

    if (rule!.roles.length > 0) {
      const variants = expandRoles(rule!.roles);
      const hit = variants.find((variant) => containsPhrase(title, variant));
      signals.push({
        dimension: 'role',
        earned: hit ? 1 : 0,
        weight: DIMENSION_WEIGHTS.role,
        detail: hit
          ? `Title matched role family via "${hit}"`
          : 'Title outside target role families',
      });
    }

    if (rule!.skills.length > 0) {
      const hits = rule!.skills.filter((skill) => containsTerm(haystack, skill));
      signals.push({
        dimension: 'skills',
        earned: hits.length / rule!.skills.length,
        weight: DIMENSION_WEIGHTS.skills,
        detail:
          hits.length > 0
            ? `Skills matched: ${hits.join(', ')}`
            : 'None of the preferred skills found',
      });
    }

    if (rule!.experience?.trim()) {
      const hint = rule!.experience.trim();
      const matched = containsTerm(haystack, hint);
      signals.push({
        dimension: 'experience',
        earned: matched ? 1 : 0,
        weight: DIMENSION_WEIGHTS.experience,
        detail: matched
          ? `Experience hint matched: ${hint}`
          : `Experience hint not found: ${hint}`,
      });
    }

    return {
      eligible: true,
      vetoReason: null,
      fitScore: computeFitScore(signals),
      locationMatched: true,
      signals,
      reasons: signals.map((signal) => signal.detail),
      applyRuleFit: true,
    };
  }
}

function computeFitScore(signals: FitSignal[]): number {
  if (signals.length === 0) {
    return 100;
  }
  const possible = signals.reduce((sum, signal) => sum + signal.weight, 0);
  if (possible === 0) {
    return 100;
  }
  const earned = signals.reduce(
    (sum, signal) => sum + signal.weight * signal.earned,
    0,
  );
  return Math.round((earned / possible) * 100);
}
