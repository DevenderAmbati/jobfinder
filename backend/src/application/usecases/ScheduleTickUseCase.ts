import type { CompanyRepository } from '../../domain/repositories/CompanyRepository.js';
import type { JobQueue } from '../../domain/ports/JobQueue.js';
import { isCompanyDue } from '../../domain/services/CompanySchedulePolicy.js';
import { logger } from '../../shared/utils/logger.js';

export interface ScheduleTickDeps {
  companies: CompanyRepository;
  queue: JobQueue;
  parseCronNext: (expression: string, currentDate: Date) => Date;
}

export interface ScheduleTickOptions {
  /** When true, enqueue every enabled company regardless of lastRun / cron. */
  force?: boolean;
  /**
   * When true, wait until the in-memory queue finishes all enqueued fetches.
   * Keeps Cloud Run CPU allocated for the duration of the request.
   */
  wait?: boolean;
  /**
   * When set, only these company ids are enqueued, even if they are not due.
   * The regular scheduler tick omits this and still uses the cron schedule.
   */
  companyIds?: string[];
}

/**
 * Application orchestration for a scheduler tick.
 * Finds due companies and enqueues work — no fetch/match/notify here.
 */
export class ScheduleTickUseCase {
  constructor(private readonly deps: ScheduleTickDeps) {}

  async execute(
    now = new Date(),
    options: ScheduleTickOptions = {},
  ): Promise<{ enqueued: string[]; forced: boolean }> {
    const force = options.force === true;
    const onlyIds =
      options.companyIds && options.companyIds.length > 0
        ? new Set(options.companyIds)
        : null;
    const companies = await this.deps.companies.findDueForRun(now);
    const enqueued: string[] = [];

    for (const company of companies) {
      if (onlyIds && !onlyIds.has(company.id)) {
        continue;
      }
      if (
        !force &&
        !onlyIds &&
        !isCompanyDue(company, now, this.deps.parseCronNext)
      ) {
        continue;
      }

      const id = await this.deps.queue.enqueue({
        type: 'FetchCompanyJobs',
        payload: { companyId: company.id },
      });
      enqueued.push(id);
      logger.cron.info('Enqueued company fetch', {
        companyId: company.id,
        name: company.name,
        queueItemId: id,
        force,
      });
    }

    if (options.wait && enqueued.length > 0) {
      await this.deps.queue.idle();
    }

    return { enqueued, forced: force };
  }
}
