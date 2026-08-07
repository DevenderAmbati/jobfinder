import type {
  Notifier,
  NotificationPayload,
} from '../../domain/ports/Notifier.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * Dry-run notifier used when Telegram bot token is absent.
 */
export class LoggingNotifier implements Notifier {
  async notify(payload: NotificationPayload): Promise<void> {
    logger.telegram.info('Notification (dry-run)', {
      company: payload.job.company,
      title: payload.job.title,
      score: payload.match.score,
      source: payload.match.source,
      applyUrl: payload.job.applyUrl,
      chatId: payload.chatId ?? null,
    });
  }
}
