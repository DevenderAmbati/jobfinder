import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { LogLevel } from '../config/env.js';

export type LogChannel = 'app' | 'cron' | 'provider' | 'telegram';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const CHANNEL_FILE: Record<Exclude<LogChannel, 'app'>, string> = {
  cron: 'cron.log',
  provider: 'provider.log',
  telegram: 'telegram.log',
};

export interface LoggerOptions {
  level: LogLevel;
  /** Write channel files under logDir. Default false (stdout-only; best for Railway). */
  logToFiles?: boolean;
  /** Directory for log files. Default `logs` under cwd. */
  logDir?: string;
}

interface ChannelLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

let minLevel: LogLevel = 'info';
let logToFiles = false;
let logDir = path.resolve(process.cwd(), 'logs');

/** Call once at process start after loadConfig(). */
export function configureLogger(options: LoggerOptions): void {
  minLevel = options.level;
  logToFiles = options.logToFiles === true;
  logDir = path.resolve(options.logDir ?? path.join(process.cwd(), 'logs'));
  if (logToFiles) {
    mkdirSync(logDir, { recursive: true });
  }
}

function enabled(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[minLevel];
}

function formatLine(
  level: LogLevel,
  channel: LogChannel,
  message: string,
  meta?: Record<string, unknown>,
): string {
  const base = `${new Date().toISOString()} [${level}] [${channel}] ${message}`;
  if (!meta || Object.keys(meta).length === 0) {
    return base;
  }
  try {
    return `${base} ${JSON.stringify(meta)}`;
  } catch {
    return `${base} [meta:unserializable]`;
  }
}

function writeConsole(level: LogLevel, line: string): void {
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line);
    return;
  }
  if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(line);
    return;
  }
  if (level === 'debug') {
    // eslint-disable-next-line no-console
    console.debug(line);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(line);
}

function appendFile(fileName: string, line: string): void {
  if (!logToFiles) return;
  try {
    appendFileSync(path.join(logDir, fileName), `${line}\n`, 'utf8');
  } catch {
    // Never crash the app on log I/O failure.
  }
}

function write(
  level: LogLevel,
  channel: LogChannel,
  message: string,
  meta?: Record<string, unknown>,
): void {
  if (!enabled(level)) return;
  const line = formatLine(level, channel, message, meta);
  writeConsole(level, line);

  if (!logToFiles) return;

  if (level === 'error') {
    appendFile('error.log', line);
  }
  if (channel !== 'app') {
    appendFile(CHANNEL_FILE[channel], line);
  }
}

function createChannelLogger(channel: LogChannel): ChannelLogger {
  return {
    debug(message, meta) {
      write('debug', channel, message, meta);
    },
    info(message, meta) {
      write('info', channel, message, meta);
    },
    warn(message, meta) {
      write('warn', channel, message, meta);
    },
    error(message, meta) {
      write('error', channel, message, meta);
    },
  };
}

const appLogger = createChannelLogger('app');

export const logger: ChannelLogger & {
  cron: ChannelLogger;
  provider: ChannelLogger;
  telegram: ChannelLogger;
} = {
  ...appLogger,
  cron: createChannelLogger('cron'),
  provider: createChannelLogger('provider'),
  telegram: createChannelLogger('telegram'),
};
