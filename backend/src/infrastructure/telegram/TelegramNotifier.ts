import type {
  Notifier,
  NotificationPayload,
} from '../../domain/ports/Notifier.js';
import { logger } from '../../shared/utils/logger.js';

interface TelegramNotifierDeps {
  botToken: string;
  chatId: string;
  fetchImpl?: typeof fetch;
}

export class TelegramNotifier implements Notifier {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly deps: TelegramNotifierDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  async notify(payload: NotificationPayload): Promise<void> {
    const text = formatTelegramMessage(payload);
    const url = `https://api.telegram.org/bot${this.deps.botToken}/sendMessage`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.deps.chatId,
        text,
        disable_web_page_preview: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram HTTP ${response.status}: ${body}`);
    }

    logger.telegram.info('Telegram notification sent', {
      title: payload.job.title,
      score: payload.match.score,
    });
  }
}

export function formatTelegramMessage(payload: NotificationPayload): string {
  const { job, match } = payload;
  const reasons = match.reasons.map((r) => `✔ ${r}`).join('\n') || '—';
  const missing =
    match.missingSkills.map((s) => s).join(', ') || 'None listed';

  return [
    '🚀 New Job Found',
    '',
    `Company: ${job.company}`,
    `Role: ${job.title}`,
    `Location: ${job.location ?? 'N/A'}`,
    `Salary: ${match.salaryEstimate ?? job.salary ?? 'N/A'}`,
    `Match Score: ${match.score}% (${match.source})`,
    '',
    'Why it matches',
    reasons,
    '',
    `Missing: ${missing}`,
    '',
    `Apply: ${job.applyUrl}`,
  ].join('\n');
}
