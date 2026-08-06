/**
 * Mount the Vite production build as a same-origin SPA behind Express.
 * Must be registered AFTER `/api` routes and BEFORE the error handler.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Express, RequestHandler } from 'express';
import express from 'express';

export function resolveFrontendPublicDir(
  cwd: string = process.cwd(),
): string | null {
  const candidates = [
    path.resolve(cwd, 'public'),
    path.resolve(cwd, '../frontend/dist'),
  ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
  }
  return null;
}

export function mountFrontendStatic(app: Express, publicDir: string): void {
  app.use(
    express.static(publicDir, {
      index: false,
      fallthrough: true,
    }),
  );

  const spaFallback: RequestHandler = (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(publicDir, 'index.html'), (error) => {
      if (error) next(error);
    });
  };

  app.get(/.*/, spaFallback);
}
