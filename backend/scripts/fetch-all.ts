/**
 * Enqueue a fetch for every enabled company (same Firestore as prod).
 *
 * Usage:
 *   npx tsx scripts/fetch-all.ts
 */
import 'dotenv/config';
import { createContainer } from '../src/infrastructure/di/container.js';
import { loadConfig } from '../src/shared/config/env.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const container = createContainer(config);
  container.startWorkers();

  const companies = (await container.companies.findAll()).filter((c) => c.enabled);
  // eslint-disable-next-line no-console
  console.log(`[fetch-all] Enqueueing ${companies.length} enabled companies…`);

  for (const company of companies) {
    await container.queue.enqueue({
      type: 'FetchCompanyJobs',
      payload: { companyId: company.id },
    });
  }

  // eslint-disable-next-line no-console
  console.log('[fetch-all] Waiting for queue to drain (this can take a while)…');
  await container.queue.idle();
  container.stopWorkers();
  // eslint-disable-next-line no-console
  console.log('[fetch-all] Done.');
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
