import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';
import { AppError } from '../errors/AppError.js';

function baseEnv(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    FIREBASE_PROJECT_ID: 'demo-jobfinder',
    PORT: '3001',
    NODE_ENV: 'development',
    ...overrides,
  };
}

describe('loadConfig', () => {
  it('requires FIREBASE_PROJECT_ID in production', () => {
    expect(() =>
      loadConfig(
        baseEnv({
          NODE_ENV: 'production',
          FIREBASE_PROJECT_ID: '',
          GCLOUD_PROJECT: '',
          GOOGLE_CLOUD_PROJECT: '',
        }),
      ),
    ).toThrow(AppError);
  });

  it('accepts CRON_FREQUENCY as alias for CRON_DEFAULT_EXPRESSION', () => {
    const config = loadConfig(
      baseEnv({ CRON_FREQUENCY: '0 */3 * * *', CRON_DEFAULT_EXPRESSION: '' }),
    );
    expect(config.cronDefaultExpression).toBe('0 */3 * * *');
  });

  it('prefers CRON_FREQUENCY over CRON_DEFAULT_EXPRESSION', () => {
    const config = loadConfig(
      baseEnv({
        CRON_FREQUENCY: '0 * * * *',
        CRON_DEFAULT_EXPRESSION: '0 */6 * * *',
      }),
    );
    expect(config.cronDefaultExpression).toBe('0 * * * *');
  });

  it('parses LOG_LEVEL and defaults by NODE_ENV', () => {
    expect(
      loadConfig(baseEnv({ NODE_ENV: 'production' })).logLevel,
    ).toBe('info');
    expect(loadConfig(baseEnv({ NODE_ENV: 'development' })).logLevel).toBe(
      'debug',
    );
    expect(loadConfig(baseEnv({ LOG_LEVEL: 'warn' })).logLevel).toBe('warn');
  });

  it('disables in-process cron by default in production', () => {
    expect(
      loadConfig(baseEnv({ NODE_ENV: 'production' })).enableInProcessCron,
    ).toBe(false);
  });

  it('rejects invalid LOG_LEVEL and PORT', () => {
    expect(() => loadConfig(baseEnv({ LOG_LEVEL: 'verbose' }))).toThrow(
      AppError,
    );
    expect(() => loadConfig(baseEnv({ PORT: '0' }))).toThrow(AppError);
  });

  it('requires GEMINI_API_KEY when Gemini is enabled', () => {
    expect(() =>
      loadConfig(baseEnv({ GEMINI_ENABLED: 'true', GEMINI_API_KEY: '' })),
    ).toThrow(AppError);
  });
});
