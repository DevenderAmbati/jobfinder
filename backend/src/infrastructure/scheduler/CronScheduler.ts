import cron, { type ScheduledTask } from 'node-cron';
import type { ScheduleTickUseCase } from '../../application/usecases/ScheduleTickUseCase.js';
import { logger } from '../../shared/utils/logger.js';
import { parseCronNext } from './cronNext.js';

export interface CronSchedulerStatus {
  running: boolean;
  expression: string;
  startedAt: string | null;
  lastTickAt: string | null;
  lastTickError: string | null;
  nextRunAt: string | null;
}

/**
 * Infrastructure scheduler — enqueues only via ScheduleTickUseCase.
 */
export class CronScheduler {
  private task: ScheduledTask | null = null;
  private startedAt: Date | null = null;
  private lastTickAt: Date | null = null;
  private lastTickError: string | null = null;

  constructor(
    private readonly scheduleTick: ScheduleTickUseCase,
    private readonly expression: string,
  ) {}

  start(): void {
    if (this.task) {
      return;
    }
    if (!cron.validate(this.expression)) {
      throw new Error(`Invalid cron expression: ${this.expression}`);
    }

    this.task = cron.schedule(this.expression, () => {
      this.lastTickAt = new Date();
      this.lastTickError = null;
      void this.scheduleTick.execute().catch((error: unknown) => {
        this.lastTickError =
          error instanceof Error ? error.message : String(error);
        logger.cron.error('Scheduler tick failed', {
          error: this.lastTickError,
        });
      });
    });

    this.startedAt = new Date();
    logger.cron.info('Scheduler started', { expression: this.expression });
  }

  stop(): void {
    this.task?.stop();
    this.task = null;
    this.startedAt = null;
  }

  getStatus(now: Date = new Date()): CronSchedulerStatus {
    let nextRunAt: string | null = null;
    try {
      if (cron.validate(this.expression)) {
        nextRunAt = parseCronNext(this.expression, now).toISOString();
      }
    } catch {
      nextRunAt = null;
    }

    return {
      running: this.task !== null,
      expression: this.expression,
      startedAt: this.startedAt?.toISOString() ?? null,
      lastTickAt: this.lastTickAt?.toISOString() ?? null,
      lastTickError: this.lastTickError,
      nextRunAt,
    };
  }
}
