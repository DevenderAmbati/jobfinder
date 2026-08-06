import { describe, expect, it } from 'vitest';
import { createDevToolsGuard } from './devToolsGuard.js';
import type { AppConfig } from '../../shared/config/env.js';
import { AppError } from '../../shared/errors/AppError.js';

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3001,
    nodeEnv: 'development',
    databaseUrl: 'postgresql://jobfinder:jobfinder@127.0.0.1:5432/jobfinder',
    logLevel: 'info',
    logToFiles: false,
    logDir: 'logs',
    enableDevTools: true,
    geminiEnabled: false,
    geminiApiKey: '',
    matchScoreThreshold: 80,
    escalationFitFloor: 60,
    maxEscalationsPerRun: 40,
    maxNotificationsPerRun: 15,
    telegramBotToken: '',
    telegramChatId: '',
    cronDefaultExpression: '0 */6 * * *',
    playwrightHeadless: true,
    playwrightMaxConcurrent: 2,
    corsOrigin: '',
    rateLimitWindowMs: 15 * 60 * 1000,
    rateLimitMax: 300,
    rateLimitFetchMax: 30,
    requestLogging: true,
    ...overrides,
  };
}

describe('createDevToolsGuard', () => {
  it('allows requests when enabled', () => {
    const guard = createDevToolsGuard(baseConfig({ enableDevTools: true }));
    let called = false;
    guard({} as never, {} as never, () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it('rejects when disabled', () => {
    const guard = createDevToolsGuard(baseConfig({ enableDevTools: false }));
    let error: unknown;
    guard({} as never, {} as never, (err) => {
      error = err;
    });
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(403);
  });
});
