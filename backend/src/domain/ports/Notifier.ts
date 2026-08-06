import type { Job } from '../entities/Job.js';
import type { MatchResult } from './JobMatcher.js';

export interface NotificationPayload {
  job: Job;
  match: MatchResult;
}

/**
 * Port for outbound notifications (Telegram in V1).
 */
export interface Notifier {
  notify(payload: NotificationPayload): Promise<void>;
}
