import type {
  Notifier,
  NotificationPayload,
} from '../../domain/ports/Notifier.js';
import { logger } from '../../shared/utils/logger.js';

interface TelegramNotifierDeps {
  botToken: string;
  /** Optional fallback chat (legacy / DevTools). Prefer payload.chatId. */
  defaultChatId?: string;
  fetchImpl?: typeof fetch;
}

export class TelegramNotifier implements Notifier {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly deps: TelegramNotifierDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  async notify(payload: NotificationPayload): Promise<void> {
    const chatId = payload.chatId?.trim() || this.deps.defaultChatId?.trim();
    if (!chatId) {
      throw new Error(
        'Telegram chat id missing — link Telegram in Settings or set TELEGRAM_CHAT_ID for DevTools',
      );
    }

    const text = formatTelegramMessage(payload);
    const url = `https://api.telegram.org/bot${this.deps.botToken}/sendMessage`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
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
      chatId,
    });
  }
}

function formatPosted(postedDate: Date | null, createdAt?: Date): string {
  const raw = postedDate ?? createdAt ?? null;
  if (!raw) {
    return 'N/A';
  }
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  const now = new Date();
  const startToday = Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startThen = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const days = Math.round((startToday - startThen) / (24 * 60 * 60 * 1000));

  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return '1 month ago';
  return `${Math.floor(days / 30)} months ago`;
}

export function formatTelegramMessage(payload: NotificationPayload): string {
  const { job, match } = payload;
  const reasons = match.reasons.map((r) => `✔ ${r}`).join('\n') || '—';
  const missing =
    match.missingSkills.map((s) => s).join(', ') || 'None listed';
  const ctc =
    job.salary?.trim() || match.salaryEstimate?.trim() || 'N/A';

  return [
    '🚀 New Job Found',
    '',
    `Role: ${job.title}`,
    `Company: ${job.company}`,
    `Location: ${job.location ?? 'N/A'}`,
    `Experience: ${job.experience ?? 'N/A'}`,
    `CTC: ${ctc}`,
    `Posted: ${formatPosted(job.postedDate, job.createdAt)}`,
    `Match: ${match.score}% (${match.source})`,
    '',
    'Why it matches',
    reasons,
    '',
    `Missing: ${missing}`,
    '',
    `Apply: ${job.applyUrl}`,
  ].join('\n');
}
