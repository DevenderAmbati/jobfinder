/**
 * One-shot Step 1 finisher:
 * start embedded Postgres → migrate → import SQLite export → leave cluster on disk.
 *
 * After this succeeds, run `npm run db:local-pg` (keep terminal open) then `npm run dev`.
 *
 * Usage (from backend/): node scripts/bootstrap-local-postgres.mjs
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
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
const databaseUrl = `postgresql://${user}:${password}@127.0.0.1:${port}/${database}?schema=public`;

mkdirSync(databaseDir, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir,
  user,
  password,
  port,
  persistent: true,
  // Windows defaults to WIN1252; force UTF-8 so resumes/jobs with emoji survive.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

function run(command, args) {
  console.log(`[bootstrap] $ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(' ')}`);
  }
}

async function main() {
  const exportPath = path.join(backendRoot, 'prisma', 'data-export.json');
  if (!existsSync(exportPath)) {
    throw new Error(
      `Missing ${exportPath}. Re-export from SQLite before switching, or restore the backup.`,
    );
  }

  const needsInit = !existsSync(path.join(databaseDir, 'PG_VERSION'));
  if (needsInit) {
    console.log(`[bootstrap] Initialising cluster at ${databaseDir}`);
    await pg.initialise();
  }

  console.log(`[bootstrap] Starting Postgres on :${port}`);
  await pg.start();

  try {
    await pg.createDatabase(database);
    console.log(`[bootstrap] Created database ${database}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists/i.test(message)) {
      console.warn(`[bootstrap] createDatabase: ${message}`);
    } else {
      console.log(`[bootstrap] Database ${database} already exists`);
    }
  }

  run('npx', ['prisma', 'generate']);
  run('npx', ['prisma', 'migrate', 'deploy']);
  run('npx', ['tsx', 'prisma/import-data.ts']);

  console.log('[bootstrap] Import complete. Stopping embedded server (data is persistent).');
  await pg.stop();
  console.log(`[bootstrap] Done. DATABASE_URL=${databaseUrl}`);
  console.log('[bootstrap] Next: npm run db:local-pg   (keep running)');
  console.log('[bootstrap] Then:  npm run dev');
}

main().catch(async (error) => {
  console.error('[bootstrap] Failed:', error);
  try {
    await pg.stop();
  } catch {
    // ignore
  }
  process.exit(1);
});
