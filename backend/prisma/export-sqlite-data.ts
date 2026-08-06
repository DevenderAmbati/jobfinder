/**
 * One-shot export of all app tables from the current DATABASE_URL (SQLite).
 * Run BEFORE switching Prisma provider to PostgreSQL.
 *
 * Usage: npx tsx prisma/export-sqlite-data.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, 'data-export.json');

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const [
      companies,
      jobs,
      rules,
      resumes,
      applications,
      notificationLogs,
      providerLogs,
      providerHealth,
      promptTemplates,
    ] = await Promise.all([
      prisma.company.findMany(),
      prisma.job.findMany(),
      prisma.rule.findMany(),
      prisma.resume.findMany(),
      prisma.application.findMany(),
      prisma.notificationLog.findMany(),
      prisma.providerLog.findMany(),
      prisma.providerHealth.findMany(),
      prisma.promptTemplate.findMany(),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      source: process.env.DATABASE_URL ?? 'unknown',
      counts: {
        companies: companies.length,
        jobs: jobs.length,
        rules: rules.length,
        resumes: resumes.length,
        applications: applications.length,
        notificationLogs: notificationLogs.length,
        providerLogs: providerLogs.length,
        providerHealth: providerHealth.length,
        promptTemplates: promptTemplates.length,
      },
      data: {
        companies,
        jobs,
        rules,
        resumes,
        applications,
        notificationLogs,
        providerLogs,
        providerHealth,
        promptTemplates,
      },
    };

    mkdirSync(__dirname, { recursive: true });
    writeFileSync(outPath, JSON.stringify(payload), 'utf8');
    console.log(`[export] Wrote ${outPath}`);
    console.log(`[export] Counts: ${JSON.stringify(payload.counts)}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[export] Failed:', error);
  process.exit(1);
});
