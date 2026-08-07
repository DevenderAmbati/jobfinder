import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';
import { requireUserId } from '../middleware/authMiddleware.js';

/**
 * Runtime settings visible to the dashboard. Secrets are never returned —
 * only whether they are configured.
 */
export function createSettingsController(container: AppContainer) {
  return {
    async get(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const rule = await container.rules.findByUserId(requireUserId(req));
        const { config } = container;

        res.status(200).json({
          data: {
            geminiEnabled: config.geminiEnabled,
            geminiApiKeyConfigured: Boolean(config.geminiApiKey),
            matchScoreThresholdEnv: config.matchScoreThreshold,
            ruleMinMatchScore: rule?.minMatchScore ?? null,
            telegramBotConfigured: Boolean(config.telegramBotToken),
            telegramConfigured: Boolean(config.telegramBotToken),
            enableDevTools: config.enableDevTools,
            nodeEnv: config.nodeEnv,
            logLevel: config.logLevel,
            logToFiles: config.logToFiles,
            cronDefaultExpression: config.cronDefaultExpression,
            escalationFitFloor: config.escalationFitFloor,
            maxEscalationsPerRun: config.maxEscalationsPerRun,
            maxNotificationsPerRun: config.maxNotificationsPerRun,
            note:
              'Secrets (GEMINI_API_KEY, TELEGRAM_BOT_TOKEN) live in server env. Each user links their own Telegram in Settings. Edit your notify threshold on Rules.',
          },
        });
      } catch (error) {
        next(error);
      }
    },
  };
}
