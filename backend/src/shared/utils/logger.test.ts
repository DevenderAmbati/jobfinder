import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { configureLogger, logger } from './logger.js';

describe('logger channels', () => {
  let dir: string;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes channel and error files when enabled', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'jobfinder-logs-'));
    configureLogger({ level: 'info', logToFiles: true, logDir: dir });

    logger.cron.info('tick ok', { n: 1 });
    logger.provider.warn('slow board', { provider: 'workday' });
    logger.telegram.error('send failed', { code: 400 });

    const cron = readFileSync(path.join(dir, 'cron.log'), 'utf8');
    const provider = readFileSync(path.join(dir, 'provider.log'), 'utf8');
    const telegram = readFileSync(path.join(dir, 'telegram.log'), 'utf8');
    const error = readFileSync(path.join(dir, 'error.log'), 'utf8');

    expect(cron).toContain('[cron]');
    expect(cron).toContain('tick ok');
    expect(provider).toContain('[provider]');
    expect(telegram).toContain('send failed');
    expect(error).toContain('send failed');
    expect(error).toContain('[error]');
  });
});
