import { PrismaClient } from '@prisma/client';

/**
 * Shared Prisma client. Created once per process.
 * Applies conservative pool defaults for Railway / small Postgres plans
 * when the URL does not already set them.
 */
function datasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw || raw.startsWith('file:')) {
    return raw;
  }

  try {
    const url = new URL(raw);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set(
        'connection_limit',
        process.env.PRISMA_CONNECTION_LIMIT?.trim() || '5',
      );
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set(
        'pool_timeout',
        process.env.PRISMA_POOL_TIMEOUT?.trim() || '10',
      );
    }
    return url.toString();
  } catch {
    return raw;
  }
}

const url = datasourceUrl();

export const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === 'production'
      ? ['error']
      : ['warn', 'error'],
  ...(url ? { datasources: { db: { url } } } : {}),
});

export type { PrismaClient };
