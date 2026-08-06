import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';
import { createTtlCache } from '../../shared/utils/ttlCache.js';

const providerStatusCache = createTtlCache<{
  status: string;
  counts: Record<string, number>;
  providers: unknown[];
}>(15_000);

/**
 * Lightweight production probes — no heavy joins or scrapes.
 */
export function createHealthController(container: AppContainer) {
  return async function getHealth(
    _req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    const started = Date.now();
    try {
      await container.prisma.$queryRaw`SELECT 1`;
      res.status(200).json({
        status: 'ok',
        database: 'up',
        uptimeSec: Math.floor(process.uptime()),
        nodeEnv: container.config.nodeEnv,
        geminiEnabled: container.config.geminiEnabled,
        latencyMs: Date.now() - started,
      });
    } catch {
      res.status(503).json({
        status: 'degraded',
        database: 'down',
        uptimeSec: Math.floor(process.uptime()),
        nodeEnv: container.config.nodeEnv,
        geminiEnabled: container.config.geminiEnabled,
        latencyMs: Date.now() - started,
      });
    }
  };
}

export function createVersionController(container: AppContainer) {
  const version = readBackendVersion();

  return function getVersion(_req: Request, res: Response): void {
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json({
      name: 'jobfinder',
      version,
      nodeEnv: container.config.nodeEnv,
      node: process.version,
    });
  };
}

export function createCronStatusController(container: AppContainer) {
  return function getCronStatus(_req: Request, res: Response): void {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      data: container.scheduler.getStatus(),
    });
  };
}

export function createProviderStatusController(container: AppContainer) {
  return {
    async summary(
      _req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> {
      try {
        const cached = providerStatusCache.get();
        if (cached) {
          res.setHeader('Cache-Control', 'public, max-age=15');
          res.setHeader('X-Cache', 'HIT');
          res.status(200).json(cached);
          return;
        }

        const health = await container.providerHealth.findAll();
        const providers = health.map((row) => ({
          provider: row.provider,
          status: row.status,
          lastRun: row.lastRun,
          lastSuccess: row.lastSuccess,
          failureCount: row.failureCount,
          lastError: row.lastError,
        }));

        const counts = {
          total: providers.length,
          success: providers.filter((p) => p.status === 'SUCCESS').length,
          failure: providers.filter((p) => p.status === 'FAILURE').length,
          running: providers.filter((p) => p.status === 'RUNNING').length,
          idle: providers.filter((p) => p.status === 'IDLE').length,
        };

        const overall =
          counts.failure > 0
            ? 'degraded'
            : counts.running > 0
              ? 'running'
              : 'ok';

        const payload = {
          status: overall,
          counts,
          providers,
        };
        providerStatusCache.set(payload);
        res.setHeader('Cache-Control', 'public, max-age=15');
        res.setHeader('X-Cache', 'MISS');
        res.status(200).json(payload);
      } catch (error) {
        next(error);
      }
    },
  };
}

function readBackendVersion(): string {
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const raw = readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
