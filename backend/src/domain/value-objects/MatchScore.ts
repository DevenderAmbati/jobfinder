/**
 * Match score in 0–100 range used for thresholds and notifications.
 */
export class MatchScore {
  private constructor(public readonly value: number) {}

  static of(value: number): MatchScore {
    if (!Number.isFinite(value)) {
      throw new Error('Match score must be a finite number');
    }
    if (value < 0 || value > 100) {
      throw new Error('Match score must be between 0 and 100');
    }
    return new MatchScore(value);
  }

  meetsThreshold(threshold: number): boolean {
    return this.value >= threshold;
  }
}
