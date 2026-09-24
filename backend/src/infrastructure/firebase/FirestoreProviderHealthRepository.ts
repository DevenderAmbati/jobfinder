import type { ProviderHealth } from '../../domain/entities/ProviderHealth.js';
import type {
  ProviderHealthRepository,
  ProviderHealthUpdateInput,
} from '../../domain/repositories/ProviderHealthRepository.js';
import { getFirestore } from './admin.js';
import { toProviderHealth } from './mappers.js';

export class FirestoreProviderHealthRepository
  implements ProviderHealthRepository
{
  private db = getFirestore();

  async findAll(): Promise<ProviderHealth[]> {
    const snap = await this.db.collection('providerHealth').get();
    return snap.docs
      .map((doc) => toProviderHealth(doc.id, doc.data()))
      .sort((a, b) => a.provider.localeCompare(b.provider));
  }

  async findByProvider(provider: string): Promise<ProviderHealth | null> {
    const snap = await this.db.collection('providerHealth').doc(provider).get();
    if (!snap.exists) {
      return null;
    }
    return toProviderHealth(snap.id, snap.data() ?? {});
  }

  async ensureProvider(provider: string): Promise<ProviderHealth> {
    const existing = await this.findByProvider(provider);
    if (existing) {
      return existing;
    }
    const now = new Date();
    const data = {
      provider,
      status: 'IDLE',
      lastRun: null,
      lastSuccess: null,
      averageExecutionTime: 0,
      failureCount: 0,
      lastError: null,
      updatedAt: now,
    };
    await this.db.collection('providerHealth').doc(provider).set(data);
    return toProviderHealth(provider, data);
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
          (current.averageExecutionTime * runCountApprox +
            input.executionTimeMs) /
          (runCountApprox + 1);
      }
    }

    const lastSuccess =
      input.lastSuccess === undefined
        ? input.status === 'SUCCESS'
          ? new Date()
          : current.lastSuccess
        : input.lastSuccess;

    const data = {
      provider,
      status: input.status,
      lastRun: input.lastRun ?? new Date(),
      lastSuccess,
      averageExecutionTime,
      failureCount: input.incrementFailure
        ? current.failureCount + 1
        : current.failureCount,
      lastError:
        input.lastError === undefined ? current.lastError : input.lastError,
      updatedAt: new Date(),
    };

    await this.db.collection('providerHealth').doc(provider).set(data, {
      merge: true,
    });
    return toProviderHealth(provider, data);
  }
}
