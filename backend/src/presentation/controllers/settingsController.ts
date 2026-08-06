import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';

/**
 * Runtime settings visible to the dashboard. Secrets are never returned —
 * only whether they are configured.
 */
export function createSettingsController(container: AppContainer) {
  return {
    async get(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const rule = await container.rules.findActive();
        const { config } = container;

        res.status(200).json({
          data: {
            geminiEnabled: config.geminiEnabled,
            geminiApiKeyConfigured: Boolean(config.geminiApiKey),
            matchScoreThresholdEnv: config.matchScoreThreshold,
            ruleMinMatchScore: rule?.minMatchScore ?? null,
            telegramConfigured: Boolean(
              config.telegramBotToken && config.telegramChatId,
            ),
            enableDevTools: config.enableDevTools,
            nodeEnv: config.nodeEnv,
            logLevel: config.logLevel,
            logToFiles: config.logToFiles,
            cronDefaultExpression: config.cronDefaultExpression,
            escalationFitFloor: config.escalationFitFloor,
            maxEscalationsPerRun: config.maxEscalationsPerRun,
            maxNotificationsPerRun: config.maxNotificationsPerRun,
            note:
              'Secrets (GEMINI_API_KEY, TELEGRAM_*) live in server env only. Change runtime knobs via .env and restart. Edit live match threshold on Rules (minMatchScore).',
          },
        });
      } catch (error) {
        next(error);
      }
    },
  };
}
