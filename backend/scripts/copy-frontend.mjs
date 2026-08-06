/**
 * Copy Vite build output into backend/public so Express can serve a single process.
 *
 * Usage (from backend/): node scripts/copy-frontend.mjs
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(backendRoot, '../frontend/dist');
const target = path.resolve(backendRoot, 'public');

if (!existsSync(path.join(source, 'index.html'))) {
  console.error(
    `[copy-frontend] Missing ${path.join(source, 'index.html')}. Run frontend build first.`,
  );
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log(`[copy-frontend] ${source} → ${target}`);
