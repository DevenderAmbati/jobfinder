import type { JobProvider } from '../../domain/ports/JobProvider.js';
import { AppError } from '../../shared/errors/AppError.js';
import { StubProvider } from './StubProvider.js';

/**
 * Maps company.provider string → JobProvider adapter.
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, JobProvider>();

  constructor(providers: JobProvider[] = [new StubProvider()]) {
    for (const provider of providers) {
      this.providers.set(provider.name.toLowerCase(), provider);
    }
  }

  register(provider: JobProvider): void {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  get(name: string): JobProvider {
    const provider = this.providers.get(name.toLowerCase());
    if (!provider) {
      throw new AppError(
        'PROVIDER_NOT_FOUND',
        `No provider registered for "${name}"`,
        404,
      );
    }
    return provider;
  }

  list(): string[] {
    return [...this.providers.keys()];
  }
}
