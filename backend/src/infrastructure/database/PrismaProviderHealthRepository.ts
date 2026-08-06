import type { ProviderHealth } from '../../domain/entities/ProviderHealth.js';
import type {
  ProviderHealthRepository,
  ProviderHealthUpdateInput,
} from '../../domain/repositories/ProviderHealthRepository.js';
import { prisma } from './prismaClient.js';
import { toProviderHealth } from './mappers.js';

export class PrismaProviderHealthRepository implements ProviderHealthRepository {
  async findAll(): Promise<ProviderHealth[]> {
    const rows = await prisma.providerHealth.findMany({
      orderBy: { provider: 'asc' },
    });
    return rows.map(toProviderHealth);
  }

  async findByProvider(provider: string): Promise<ProviderHealth | null> {
    const row = await prisma.providerHealth.findUnique({ where: { provider } });
    return row ? toProviderHealth(row) : null;
  }

  async ensureProvider(provider: string): Promise<ProviderHealth> {
    const existing = await this.findByProvider(provider);
    if (existing) {
      return existing;
    }
    const row = await prisma.providerHealth.create({
      data: { provider },
    });
    return toProviderHealth(row);
  }

  async recordRun(
    provider: string,
    input: ProviderHealthUpdateInput,
  ): Promise<ProviderHealth> {
    const current = await this.ensureProvider(provider);
    const runCountApprox =
      current.averageExecutionTime > 0 || current.lastSuccess || current.lastRun
        ? Math.max(1, current.failureCount + (current.lastSuccess ? 1 : 0))
        : 0;

    let averageExecutionTime = current.averageExecutionTime;
    if (typeof input.executionTimeMs === 'number') {
      if (runCountApprox <= 0) {
        averageExecutionTime = input.executionTimeMs;
      } else {
        averageExecutionTime =
          (current.averageExecutionTime * runCountApprox + input.executionTimeMs) /
          (runCountApprox + 1);
      }
    }

    const row = await prisma.providerHealth.update({
      where: { provider },
      data: {
        status: input.status,
        lastRun: input.lastRun ?? new Date(),
        lastSuccess:
          input.lastSuccess === undefined
            ? input.status === 'SUCCESS'
              ? new Date()
              : current.lastSuccess
            : input.lastSuccess,
        averageExecutionTime,
        failureCount: input.incrementFailure
          ? current.failureCount + 1
          : current.failureCount,
        lastError:
          input.lastError === undefined ? current.lastError : input.lastError,
      },
    });

    return toProviderHealth(row);
  }
}
