import { randomBytes } from 'node:crypto';
import type { UserRepository } from '../../domain/repositories/UserRepository.js';
import { logger } from '../../shared/utils/logger.js';
import { AppError } from '../../shared/errors/AppError.js';

export interface TelegramLinkStatus {
  botConfigured: boolean;
  botUsername: string | null;
  linked: boolean;
  linkedAt: string | null;
  hasPendingToken: boolean;
}

export interface TelegramConnectResult {
  deepLink: string;
  token: string;
  botUsername: string;
}

interface TelegramLinkServiceDeps {
  botToken: string;
  users: UserRepository;
  fetchImpl?: typeof fetch;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat?: { id: number | string };
  };
}

/**
 * Issues deep-link tokens and binds Telegram chat ids when users /start the bot.
 * Uses long-polling (getUpdates) so local/dev works without a public webhook URL.
 */
export class TelegramLinkService {
  private readonly fetchImpl: typeof fetch;
  private botUsername: string | null = null;
  private offset = 0;
  private running = false;
  private loopPromise: Promise<void> | null = null;

  constructor(private readonly deps: TelegramLinkServiceDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  get isConfigured(): boolean {
    return Boolean(this.deps.botToken.trim());
  }

  async getStatus(userId: string): Promise<TelegramLinkStatus> {
    const link = await this.deps.users.getTelegramLink(userId);
    const username = this.isConfigured ? await this.ensureBotUsername() : null;
    return {
      botConfigured: this.isConfigured,
      botUsername: username,
      linked: link?.linked ?? false,
      linkedAt: link?.linkedAt?.toISOString() ?? null,
      hasPendingToken: link?.hasPendingToken ?? false,
    };
  }

  async createConnectLink(userId: string): Promise<TelegramConnectResult> {
    if (!this.isConfigured) {
      throw new AppError(
        'TELEGRAM_NOT_CONFIGURED',
        'TELEGRAM_BOT_TOKEN is not set on the server',
        503,
      );
    }

    const botUsername = await this.ensureBotUsername();
    if (!botUsername) {
      throw new AppError(
        'TELEGRAM_BOT_UNAVAILABLE',
        'Could not resolve Telegram bot username — check TELEGRAM_BOT_TOKEN',
        503,
      );
    }

    const token = randomBytes(16).toString('hex');
    await this.deps.users.issueTelegramLinkToken(userId, token);

    return {
      deepLink: `https://t.me/${botUsername}?start=${token}`,
      token,
      botUsername,
    };
  }

  async disconnect(userId: string): Promise<void> {
    await this.deps.users.clearTelegramLink(userId);
  }

  /**
   * Process a single Telegram update (webhook or poll). Returns true if handled.
   */
  async handleUpdate(update: TelegramUpdate): Promise<boolean> {
    const text = update.message?.text?.trim() ?? '';
    const chatIdRaw = update.message?.chat?.id;
    if (!text || chatIdRaw == null) {
      return false;
    }

    const match = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(.+))?$/i.exec(text);
    if (!match) {
      return false;
    }

    const token = match[1]?.trim();
    const chatId = String(chatIdRaw);

    if (!token) {
      await this.sendMessage(
        chatId,
        'Open JobFinder → Settings → Connect Telegram, then tap the link so I can bind this chat to your account.',
      );
      return true;
    }

    const userId = await this.deps.users.completeTelegramLink(token, chatId);
    if (!userId) {
      await this.sendMessage(
        chatId,
        'That link expired or is invalid. Generate a new Connect Telegram link in JobFinder Settings.',
      );
      return true;
    }

    await this.sendMessage(
      chatId,
      '✅ Linked to JobFinder. You will get job match alerts in this chat.',
    );
    logger.telegram.info('Telegram account linked', { userId, chatId });
    return true;
  }

  startPolling(): void {
    if (!this.isConfigured || this.running) {
      return;
    }
    this.running = true;
    this.loopPromise = this.pollLoop();
    logger.telegram.info('Telegram link poller started');
  }

  async stopPolling(): Promise<void> {
    this.running = false;
    if (this.loopPromise) {
      await this.loopPromise.catch(() => undefined);
      this.loopPromise = null;
    }
  }

  private async pollLoop(): Promise<void> {
    try {
      await this.deleteWebhook();
    } catch (error) {
      logger.telegram.warn('deleteWebhook failed — continuing with getUpdates', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    while (this.running) {
      try {
        const updates = await this.getUpdates();
        for (const update of updates) {
          this.offset = update.update_id + 1;
          try {
            await this.handleUpdate(update);
          } catch (error) {
            logger.telegram.error('Failed handling Telegram update', {
              updateId: update.update_id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } catch (error) {
        logger.telegram.error('Telegram getUpdates failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        await sleep(5_000);
      }
    }
  }

  private async ensureBotUsername(): Promise<string | null> {
    if (this.botUsername) {
      return this.botUsername;
    }
    if (!this.isConfigured) {
      return null;
    }

    const response = await this.fetchImpl(
      `https://api.telegram.org/bot${this.deps.botToken}/getMe`,
    );
    if (!response.ok) {
      const body = await response.text();
      logger.telegram.error('getMe failed', {
        status: response.status,
        body,
      });
      return null;
    }

    const json = (await response.json()) as {
      ok?: boolean;
      result?: { username?: string };
    };
    const username = json.result?.username?.trim() || null;
    this.botUsername = username;
    return username;
  }

  private async deleteWebhook(): Promise<void> {
    const response = await this.fetchImpl(
      `https://api.telegram.org/bot${this.deps.botToken}/deleteWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drop_pending_updates: false }),
      },
    );
    if (!response.ok) {
      throw new Error(`deleteWebhook HTTP ${response.status}`);
    }
  }

  private async getUpdates(): Promise<TelegramUpdate[]> {
    const url = new URL(
      `https://api.telegram.org/bot${this.deps.botToken}/getUpdates`,
    );
    url.searchParams.set('timeout', '25');
    url.searchParams.set('offset', String(this.offset));
    url.searchParams.set('allowed_updates', JSON.stringify(['message']));

    const response = await this.fetchImpl(url, {
      signal: AbortSignal.timeout(35_000),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`getUpdates HTTP ${response.status}: ${body}`);
    }

    const json = (await response.json()) as {
      ok?: boolean;
      result?: TelegramUpdate[];
    };
    return json.result ?? [];
  }

  private async sendMessage(chatId: string, text: string): Promise<void> {
    const response = await this.fetchImpl(
      `https://api.telegram.org/bot${this.deps.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      },
    );
    if (!response.ok) {
      const body = await response.text();
      logger.telegram.warn('Failed to send link confirmation', {
        chatId,
        status: response.status,
        body,
      });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
