/**
 * Combines resume relevance with optional rule fit into the persisted score.
 *
 * - No preference rules → 100% resume
 * - With skills/roles/experience set → 60% resume + 40% rule fit
 */
export const RESUME_WEIGHT_WITH_RULES = 0.6;
export const FIT_WEIGHT_WITH_RULES = 0.4;

export interface RelevanceInput {
  resumeScore: number;
  fitScore: number;
  /** When false, ignore fit and return resume score only. */
  applyRuleFit: boolean;
}

export interface BlendedRelevance {
  score: number;
  reasons: string[];
}

export class RelevanceScorer {
  score(input: RelevanceInput): BlendedRelevance {
    const resume = clampPercent(input.resumeScore);

    if (!input.applyRuleFit) {
      return {
        score: resume,
        reasons: [
          `Resume relevance ${resume}% (no preference rules — resume only)`,
        ],
      };
    }

    const fit = clampPercent(input.fitScore);
    const blended = clampPercent(
      Math.round(
        resume * RESUME_WEIGHT_WITH_RULES + fit * FIT_WEIGHT_WITH_RULES,
      ),
    );

    return {
      score: blended,
      reasons: [
        `Resume ${resume}% (60%) and rule fit ${fit}% (40%) blended to ${blended}%`,
      ],
    };
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}
