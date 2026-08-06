import type { CompanyRepository } from '../../domain/repositories/CompanyRepository.js';
import type { JobQueue } from '../../domain/ports/JobQueue.js';
import { isCompanyDue } from '../../domain/services/CompanySchedulePolicy.js';
import { logger } from '../../shared/utils/logger.js';

export interface ScheduleTickDeps {
  companies: CompanyRepository;
  queue: JobQueue;
  parseCronNext: (expression: string, currentDate: Date) => Date;
}

/**
 * Application orchestration for a scheduler tick.
 * Finds due companies and enqueues work — no fetch/match/notify here.
 */
export class ScheduleTickUseCase {
  constructor(private readonly deps: ScheduleTickDeps) {}

  async execute(now = new Date()): Promise<{ enqueued: string[] }> {
    const companies = await this.deps.companies.findDueForRun(now);
    const enqueued: string[] = [];

    for (const company of companies) {
      if (
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
      });
    }

    return { enqueued };
  }
}
