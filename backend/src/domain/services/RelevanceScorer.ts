/**
 * Combines resume relevance with rule fit into the score persisted on a job.
 *
 * Resume relevance leads because it compares the actual resume against the
 * actual posting, while rule fit measures agreement with a short hand-written
 * list — a rule naming three skills scores every Java or Python posting at zero
 * on that dimension no matter how well the resume covers what the job asks for.
 * An equal split let that flatten the whole feed into a narrow low band.
 *
 * Fit still carries weight rather than being dropped: it encodes intent the
 * resume cannot, above all whether the title belongs to a role family worth
 * applying to, which keeps adjacent-but-wrong roles from ranking on vocabulary
 * overlap alone.
 */
export const RESUME_WEIGHT = 0.7;
export const FIT_WEIGHT = 0.3;

/**
 * Applied to the blended score when a posting is outside the configured areas.
 *
 * Location scales the final score rather than acting as one input among
 * several, because averaging lets a strong skills match outweigh being in an
 * unreachable country — an out-of-area job scoring higher than a local one is
 * worse than useless. Kept well above zero so those jobs stay ranked and
 * visible if the threshold is lowered, rather than silently disappearing.
 */
export const OUT_OF_AREA_FACTOR = 0.4;

export interface RelevanceInput {
  resumeScore: number;
  fitScore: number;
  locationMatched: boolean;
}

export interface BlendedRelevance {
  score: number;
  reasons: string[];
}

export class RelevanceScorer {
  score(input: RelevanceInput): BlendedRelevance {
    const resume = clampPercent(input.resumeScore);
    const fit = clampPercent(input.fitScore);
    const blended = resume * RESUME_WEIGHT + fit * FIT_WEIGHT;
    const factor = input.locationMatched ? 1 : OUT_OF_AREA_FACTOR;
    const score = clampPercent(Math.round(blended * factor));

    const reasons = [
      `Resume relevance ${resume}% and rule fit ${fit}% blended to ${Math.round(
        blended,
      )}%`,
    ];
    if (!input.locationMatched) {
      reasons.push(
        `Outside target locations — scaled to ${score}% because the role is not reachable`,
      );
    }

    return { score, reasons };
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}
