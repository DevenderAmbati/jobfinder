/**
 * Start a persistent local Postgres (embedded binaries) when Docker is unavailable.
 * Preferred long-term: `docker compose up -d` from the repo root.
 *
 * Usage (from backend/):
 *   node scripts/ensure-local-postgres.mjs
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseDir = path.resolve(
  backendRoot,
  process.env.PG_DATA_DIR ?? '.pgdata-utf8',
);
const port = Number(process.env.PG_PORT ?? 5432);
const user = process.env.PG_USER ?? 'jobfinder';
const password = process.env.PG_PASSWORD ?? 'jobfinder';
const database = process.env.PG_DATABASE ?? 'jobfinder';

const databaseUrl =
  process.env.DATABASE_URL ??
  `postgresql://${user}:${password}@127.0.0.1:${port}/${database}?schema=public`;

mkdirSync(databaseDir, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir,
  user,
  password,
  port,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

async function main() {
  const needsInit = !existsSync(path.join(databaseDir, 'PG_VERSION'));
  if (needsInit) {
    console.log(`[local-pg] Initialising cluster at ${databaseDir}`);
    await pg.initialise();
  }

  console.log(`[local-pg] Starting on port ${port}…`);
  try {
    await pg.start();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Already running is fine for idempotent "ensure".
    if (!/already running|could not bind|Address already in use/i.test(message)) {
      throw error;
    }
    console.log(`[local-pg] Server appears already running (${message})`);
  }

  try {
    await pg.createDatabase(database);
    console.log(`[local-pg] Database "${database}" ready`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists/i.test(message)) {
      // createDatabase may fail if default connection works differently; continue.
      console.warn(`[local-pg] createDatabase note: ${message}`);
    } else {
      console.log(`[local-pg] Database "${database}" already exists`);
    }
  }

  console.log(`[local-pg] DATABASE_URL=${databaseUrl}`);
  console.log(
    '[local-pg] Keep this process running, or start again later with the same command.',
  );

  // Keep the Node process alive so the embedded server stays up.
  process.on('SIGINT', () => {
    void pg.stop().finally(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    void pg.stop().finally(() => process.exit(0));
  });

  await new Promise(() => undefined);
}

main().catch((error) => {
  console.error('[local-pg] Failed:', error);
  process.exit(1);
});
