import { DedupHash } from '../value-objects/DedupHash.js';
import type { Job } from '../entities/Job.js';

/**
 * Domain service for computing job identity hashes.
 * Pure — no I/O.
 */
export class JobDeduplicationService {
  computeHash(job: Pick<Job, 'company' | 'title' | 'location'>): DedupHash {
    return DedupHash.fromParts(job.company, job.title, job.location);
  }
}
