import type { Job } from '../entities/Job.js';
import type { MatchResult } from './JobMatcher.js';

export interface NotificationPayload {
  job: Job;
  match: MatchResult;
  /** Per-user Telegram chat id. Required for real delivery. */
  chatId?: string;
}

/**
 * Port for outbound notifications (Telegram).
 */
export interface Notifier {
  notify(payload: NotificationPayload): Promise<void>;
}
