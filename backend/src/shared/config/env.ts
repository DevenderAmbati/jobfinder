import { AppError } from '../errors/AppError.js';
import { FALLBACK_CRON_EXPRESSION } from './defaults.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  logLevel: LogLevel;
  /** Persist channel logs under logDir (error/cron/provider/telegram). */
  logToFiles: boolean;
  logDir: string;
  enableDevTools: boolean;
  geminiEnabled: boolean;
  geminiApiKey: string;
  matchScoreThreshold: number;
  /** Minimum rule fit before a job is worth an LLM call. */
  escalationFitFloor: number;
  /** Hard cap on LLM calls per pipeline run, protecting free-tier quota. */
  maxEscalationsPerRun: number;
  /** Hard cap on notifications per pipeline run. */
  maxNotificationsPerRun: number;
  telegramBotToken: string;
  telegramChatId: string;
  /**
   * Default cron for the process scheduler and new companies without a frequency.
   * Env: CRON_FREQUENCY or CRON_DEFAULT_EXPRESSION.
   */
  cronDefaultExpression: string;
  playwrightHeadless: boolean;
  playwrightMaxConcurrent: number;
  /** Comma-separated origins, `*` for reflect-all, or empty for same-origin (prod) / open (dev). */
  corsOrigin: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  rateLimitFetchMax: number;
  requestLogging: boolean;
}

const LOG_LEVELS = new Set<LogLevel>(['debug', 'info', 'warn', 'error']);

/**
 * Load and validate config from environment. Never hardcode secrets.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new AppError('CONFIG_ERROR', 'DATABASE_URL is required', 500);
  }

  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new AppError(
      'CONFIG_ERROR',
      'PORT must be an integer between 1 and 65535',
      500,
    );
  }

  const nodeEnv = env.NODE_ENV?.trim() || 'development';
  const logLevel = parseLogLevel(env.LOG_LEVEL, nodeEnv);
  const logToFiles = parseBool(
    env.LOG_TO_FILES,
    // Files help local debugging; Railway should set LOG_TO_FILES=false unless a volume is mounted.
    nodeEnv !== 'production',
  );
  const logDir = env.LOG_DIR?.trim() || 'logs';

  const matchScoreThreshold = Number(env.MATCH_SCORE_THRESHOLD ?? 80);
  if (
    !Number.isFinite(matchScoreThreshold) ||
    matchScoreThreshold < 0 ||
    matchScoreThreshold > 100
  ) {
    throw new AppError(
      'CONFIG_ERROR',
      'MATCH_SCORE_THRESHOLD must be between 0 and 100',
      500,
    );
  }

  const escalationFitFloor = readPercent(
    env.ESCALATION_FIT_FLOOR,
    60,
    'ESCALATION_FIT_FLOOR',
  );
  const maxEscalationsPerRun = readCount(
    env.MAX_ESCALATIONS_PER_RUN,
    40,
    'MAX_ESCALATIONS_PER_RUN',
  );
  const maxNotificationsPerRun = readCount(
    env.MAX_NOTIFICATIONS_PER_RUN,
    15,
    'MAX_NOTIFICATIONS_PER_RUN',
  );

  const geminiEnabled = env.GEMINI_ENABLED === 'true';
  const geminiApiKey = env.GEMINI_API_KEY?.trim() ?? '';
  if (geminiEnabled && !geminiApiKey) {
    throw new AppError(
      'CONFIG_ERROR',
      'GEMINI_API_KEY is required when GEMINI_ENABLED=true',
      500,
    );
  }

  const cronDefaultExpression = (
    env.CRON_FREQUENCY?.trim() ||
    env.CRON_DEFAULT_EXPRESSION?.trim() ||
    FALLBACK_CRON_EXPRESSION
  );

  const playwrightHeadless = parseBool(env.PLAYWRIGHT_HEADLESS, true);
  const playwrightMaxConcurrent = readCount(
    env.PLAYWRIGHT_MAX_CONCURRENT,
    2,
    'PLAYWRIGHT_MAX_CONCURRENT',
  );
  if (playwrightMaxConcurrent < 1) {
    throw new AppError(
      'CONFIG_ERROR',
      'PLAYWRIGHT_MAX_CONCURRENT must be >= 1',
      500,
    );
  }

  const corsOrigin = env.CORS_ORIGIN?.trim() ?? '';
  const rateLimitWindowMs = readCount(
    env.RATE_LIMIT_WINDOW_MS,
    15 * 60 * 1000,
    'RATE_LIMIT_WINDOW_MS',
  );
  const rateLimitMax = readCount(env.RATE_LIMIT_MAX, 300, 'RATE_LIMIT_MAX');
  const rateLimitFetchMax = readCount(
    env.RATE_LIMIT_FETCH_MAX,
    30,
    'RATE_LIMIT_FETCH_MAX',
  );
  const requestLogging = parseBool(env.REQUEST_LOGGING, true);

  return {
    port,
    nodeEnv,
    databaseUrl,
    logLevel,
    logToFiles,
    logDir,
    // Enabled in non-production by default; production requires explicit flag.
    enableDevTools:
      env.ENABLE_DEV_TOOLS === 'true' || nodeEnv !== 'production',
    geminiEnabled,
    geminiApiKey,
    matchScoreThreshold,
    escalationFitFloor,
    maxEscalationsPerRun,
    maxNotificationsPerRun,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN?.trim() ?? '',
    telegramChatId: env.TELEGRAM_CHAT_ID?.trim() ?? '',
    cronDefaultExpression,
    playwrightHeadless,
    playwrightMaxConcurrent,
    corsOrigin,
    rateLimitWindowMs,
    rateLimitMax,
    rateLimitFetchMax,
    requestLogging,
  };
}

function parseLogLevel(
  raw: string | undefined,
  nodeEnv: string,
): LogLevel {
  const fallback: LogLevel = nodeEnv === 'production' ? 'info' : 'debug';
  if (!raw?.trim()) return fallback;
  const value = raw.trim().toLowerCase() as LogLevel;
  if (!LOG_LEVELS.has(value)) {
    throw new AppError(
      'CONFIG_ERROR',
      'LOG_LEVEL must be one of: debug, info, warn, error',
      500,
    );
  }
  return value;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw.trim() === '') return fallback;
  const value = raw.trim().toLowerCase();
  if (value === 'true' || value === '1' || value === 'yes') return true;
  if (value === 'false' || value === '0' || value === 'no') return false;
  throw new AppError(
    'CONFIG_ERROR',
    'Boolean env vars must be true/false',
    500,
  );
}

function readPercent(
  raw: string | undefined,
  fallback: number,
  name: string,
): number {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new AppError('CONFIG_ERROR', `${name} must be between 0 and 100`, 500);
  }
  return value;
}

function readCount(
  raw: string | undefined,
  fallback: number,
  name: string,
): number {
  const value = Number(raw ?? fallback);
  if (!Number.isInteger(value) || value < 0) {
    throw new AppError(
      'CONFIG_ERROR',
      `${name} must be a non-negative integer`,
      500,
    );
  }
  return value;
}
