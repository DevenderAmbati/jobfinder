import type { Job } from '../entities/Job.js';
import type { Rule } from '../entities/Rule.js';
import { LocationMatcher } from './LocationMatcher.js';
import {
  containsPhrase,
  containsTerm,
  expandRoles,
  normalizeText,
} from './textMatching.js';

export type FitDimension = 'role' | 'skills';

export interface FitSignal {
  dimension: FitDimension;
  /** Fraction of this dimension earned, 0–1. */
  earned: number;
  weight: number;
  detail: string;
}

export interface RuleEvaluation {
  /**
   * False only for explicit disqualifiers (excluded role in the title, or a
   * company outside the allow-list). Ineligible jobs are never scored.
   */
  eligible: boolean;
  vetoReason: string | null;
  /** Graded 0–100 relevance against the configured rule dimensions. */
  fitScore: number;
  locationMatched: boolean;
  signals: FitSignal[];
  reasons: string[];
}

/** Relative importance of each dimension, renormalized over those configured. */
const DIMENSION_WEIGHTS: Record<FitDimension, number> = {
  role: 40,
  skills: 60,
};

// `fitScore` intentionally covers role and skills only. Location is reported
// separately via `locationMatched` and applied by RelevanceScorer, so that it
// scales the final score instead of being averaged away.

/**
 * Evaluates a job against the active rule. Produces a narrow eligibility veto
 * plus a graded fit score, so rules rank jobs instead of silently discarding
 * them. No I/O; resume-aware scoring belongs to JobMatcher.
 */
export class RuleEngine {
  constructor(private readonly locations: LocationMatcher = new LocationMatcher()) {}

  evaluate(job: Job, rule: Rule | null): RuleEvaluation {
    if (!rule || !rule.enabled) {
      return {
        eligible: true,
        vetoReason: null,
        fitScore: 100,
        locationMatched: true,
        signals: [],
        reasons: ['No active rule — treated as a neutral match'],
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

    // Veto 1: an excluded role must appear in the *title*. Matching the
    // description would discard engineering roles that merely mention a
    // "product manager" stakeholder.
    const excluded = rule.excludedRoles.find((role) =>
      containsPhrase(title, role),
    );
    if (excluded) {
      return {
        eligible: false,
        vetoReason: `Title contains excluded role "${excluded}"`,
        fitScore: 0,
        locationMatched: false,
        signals: [],
        reasons: [`Excluded role in title: ${excluded}`],
      };
    }

    // Veto 2: an explicit company allow-list is an intentional hard filter.
    if (rule.companies.length > 0) {
      const allowed = rule.companies.some(
        (name) => name.trim().toLowerCase() === job.company.trim().toLowerCase(),
      );
      if (!allowed) {
        return {
          eligible: false,
          vetoReason: 'Company is not in the allow-list',
          fitScore: 0,
          locationMatched: false,
          signals: [],
          reasons: ['Company not in allow-list'],
        };
      }
    }

    const hasLocationRules =
      rule.countries.length > 0 || rule.cities.length > 0;
    const verdict = hasLocationRules
      ? this.locations.match(job.location, rule.countries, rule.cities)
      : { matched: true, detail: 'No location rules configured' };

    const signals: FitSignal[] = [];

    if (rule.roles.length > 0) {
      const variants = expandRoles(rule.roles);
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

    if (rule.skills.length > 0) {
      const hits = rule.skills.filter((skill) => containsTerm(haystack, skill));
      signals.push({
        dimension: 'skills',
        // Partial credit — one of three required skills is a weak but real signal.
        earned: hits.length / rule.skills.length,
        weight: DIMENSION_WEIGHTS.skills,
        detail:
          hits.length > 0
            ? `Skills matched: ${hits.join(', ')}`
            : 'None of the required skills found',
      });
    }

    const reasons = [verdict.detail, ...signals.map((signal) => signal.detail)];

    if (rule.experience) {
      reasons.push(
        containsTerm(haystack, rule.experience)
          ? `Experience hint matched: ${rule.experience}`
          : 'Experience hint not found (non-blocking)',
      );
    }

    return {
      eligible: true,
      vetoReason: null,
      fitScore: computeFitScore(signals),
      locationMatched: verdict.matched,
      signals,
      reasons,
    };
  }
}

/**
 * Weighted average over configured dimensions only, so a rule that sets just
 * skills is not penalized for leaving roles blank. With nothing configured
 * every job is a neutral 100 and location alone decides fit.
 */
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
