import { createHash } from 'node:crypto';

/**
 * Deduplication fingerprint for a job posting.
 * Hash input: normalized company | title | location
 */
export class DedupHash {
  private constructor(public readonly value: string) {}

  static fromParts(
    company: string,
    title: string,
    location: string | null | undefined,
  ): DedupHash {
    const payload = [
      DedupHash.normalize(company),
      DedupHash.normalize(title),
      DedupHash.normalize(location ?? ''),
    ].join('|');

    const value = createHash('sha256').update(payload, 'utf8').digest('hex');
    return new DedupHash(value);
  }

  static fromExisting(value: string): DedupHash {
    if (!/^[a-f0-9]{64}$/i.test(value)) {
      throw new Error('Invalid dedup hash format');
    }
    return new DedupHash(value.toLowerCase());
  }

  equals(other: DedupHash): boolean {
    return this.value === other.value;
  }

  private static normalize(input: string): string {
    return input.trim().toLowerCase().replace(/\s+/g, ' ');
  }
}
