/**
 * Import data-export.json (from export-sqlite-data.ts) into PostgreSQL.
 * Preserves primary keys and relations. Idempotent via skipDuplicates where unique.
 *
 * Prerequisites:
 *   1. DATABASE_URL points at an empty (migrated) Postgres database
 *   2. npx prisma migrate deploy
 *   3. prisma/data-export.json exists
 *
 * Usage: npx tsx prisma/import-data.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PrismaClient,
  type ApplicationStatus,
  type MatchSource,
  type ProviderRunStatus,
} from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const exportPath = join(__dirname, 'data-export.json');
const JOB_BATCH = 250;

interface ExportFile {
  counts: Record<string, number>;
  data: {
    companies: Array<Record<string, unknown>>;
    jobs: Array<Record<string, unknown>>;
    rules: Array<Record<string, unknown>>;
    resumes: Array<Record<string, unknown>>;
    applications: Array<Record<string, unknown>>;
    notificationLogs: Array<Record<string, unknown>>;
    providerLogs: Array<Record<string, unknown>>;
    providerHealth: Array<Record<string, unknown>>;
    promptTemplates: Array<Record<string, unknown>>;
  };
}

function asDate(value: unknown): Date | null {
  if (value == null) return null;
  return new Date(String(value));
}

function asRequiredDate(value: unknown): Date {
  const date = asDate(value);
  if (!date || Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${String(value)}`);
  }
  return date;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl || databaseUrl.startsWith('file:')) {
    throw new Error(
      'DATABASE_URL must be a PostgreSQL connection string before import.',
    );
  }

  const raw = readFileSync(exportPath, 'utf8');
  const payload = JSON.parse(raw) as ExportFile;
  const prisma = new PrismaClient();

  console.log('[import] Source counts:', payload.counts);

  try {
    const { data } = payload;

    if (data.companies.length > 0) {
      await prisma.company.createMany({
        data: data.companies.map((row) => ({
          id: String(row.id),
          name: String(row.name),
          provider: String(row.provider),
          careerUrl: String(row.careerUrl),
          enabled: Boolean(row.enabled),
          frequency: String(row.frequency),
          lastRun: asDate(row.lastRun),
          createdAt: asRequiredDate(row.createdAt),
          updatedAt: asRequiredDate(row.updatedAt),
        })),
        skipDuplicates: true,
      });
      console.log(`[import] companies: ${data.companies.length}`);
    }

    if (data.rules.length > 0) {
      await prisma.rule.createMany({
        data: data.rules.map((row) => ({
          id: String(row.id),
          name: String(row.name),
          countries: row.countries == null ? null : String(row.countries),
          cities: row.cities == null ? null : String(row.cities),
          experience: row.experience == null ? null : String(row.experience),
          skills: row.skills == null ? null : String(row.skills),
          roles: row.roles == null ? null : String(row.roles),
          excludedRoles:
            row.excludedRoles == null ? null : String(row.excludedRoles),
          companies: row.companies == null ? null : String(row.companies),
          minMatchScore: Number(row.minMatchScore),
          enabled: Boolean(row.enabled),
          createdAt: asRequiredDate(row.createdAt),
          updatedAt: asRequiredDate(row.updatedAt),
        })),
        skipDuplicates: true,
      });
      console.log(`[import] rules: ${data.rules.length}`);
    }

    if (data.resumes.length > 0) {
      await prisma.resume.createMany({
        data: data.resumes.map((row) => ({
          id: String(row.id),
          originalPdfPath:
            row.originalPdfPath == null ? null : String(row.originalPdfPath),
          extractedText: String(row.extractedText),
          markdown: String(row.markdown),
          embedding: row.embedding == null ? null : String(row.embedding),
          createdAt: asRequiredDate(row.createdAt),
          updatedAt: asRequiredDate(row.updatedAt),
        })),
        skipDuplicates: true,
      });
      console.log(`[import] resumes: ${data.resumes.length}`);
    }

    if (data.promptTemplates.length > 0) {
      await prisma.promptTemplate.createMany({
        data: data.promptTemplates.map((row) => ({
          id: String(row.id),
          name: String(row.name),
          version: Number(row.version),
          content: String(row.content),
          enabled: Boolean(row.enabled),
          createdAt: asRequiredDate(row.createdAt),
          updatedAt: asRequiredDate(row.updatedAt),
        })),
        skipDuplicates: true,
      });
      console.log(`[import] promptTemplates: ${data.promptTemplates.length}`);
    }

    if (data.providerHealth.length > 0) {
      await prisma.providerHealth.createMany({
        data: data.providerHealth.map((row) => ({
          id: String(row.id),
          provider: String(row.provider),
          status: String(row.status) as ProviderRunStatus,
          lastRun: asDate(row.lastRun),
          lastSuccess: asDate(row.lastSuccess),
          averageExecutionTime: Number(row.averageExecutionTime ?? 0),
          failureCount: Number(row.failureCount ?? 0),
          lastError: row.lastError == null ? null : String(row.lastError),
          updatedAt: asRequiredDate(row.updatedAt),
        })),
        skipDuplicates: true,
      });
      console.log(`[import] providerHealth: ${data.providerHealth.length}`);
    }

    for (let i = 0; i < data.jobs.length; i += JOB_BATCH) {
      const slice = data.jobs.slice(i, i + JOB_BATCH);
      await prisma.job.createMany({
        data: slice.map((row) => ({
          id: String(row.id),
          companyId: String(row.companyId),
          title: String(row.title),
          location: row.location == null ? null : String(row.location),
          description:
            row.description == null ? null : String(row.description),
          experience: row.experience == null ? null : String(row.experience),
          skills: row.skills == null ? null : String(row.skills),
          salary: row.salary == null ? null : String(row.salary),
          postedDate: asDate(row.postedDate),
          applyUrl: String(row.applyUrl),
          provider: String(row.provider),
          dedupHash: String(row.dedupHash),
          matchScore: row.matchScore == null ? null : Number(row.matchScore),
          matchReasons:
            row.matchReasons == null ? null : String(row.matchReasons),
          missingSkills:
            row.missingSkills == null ? null : String(row.missingSkills),
          interviewDifficulty:
            row.interviewDifficulty == null
              ? null
              : String(row.interviewDifficulty),
          salaryEstimate:
            row.salaryEstimate == null ? null : String(row.salaryEstimate),
          recommendation:
            row.recommendation == null ? null : String(row.recommendation),
          matchSource:
            row.matchSource == null
              ? null
              : (String(row.matchSource) as MatchSource),
          createdAt: asRequiredDate(row.createdAt),
          updatedAt: asRequiredDate(row.updatedAt),
        })),
        skipDuplicates: true,
      });
      console.log(
        `[import] jobs: ${Math.min(i + JOB_BATCH, data.jobs.length)}/${data.jobs.length}`,
      );
    }

    if (data.applications.length > 0) {
      await prisma.application.createMany({
        data: data.applications.map((row) => ({
          id: String(row.id),
          jobId: String(row.jobId),
          status: String(row.status) as ApplicationStatus,
          notes: row.notes == null ? null : String(row.notes),
          createdAt: asRequiredDate(row.createdAt),
          updatedAt: asRequiredDate(row.updatedAt),
        })),
        skipDuplicates: true,
      });
      console.log(`[import] applications: ${data.applications.length}`);
    }

    if (data.notificationLogs.length > 0) {
      await prisma.notificationLog.createMany({
        data: data.notificationLogs.map((row) => ({
          id: String(row.id),
          jobId: String(row.jobId),
          channel: String(row.channel),
          success: Boolean(row.success),
          payload: row.payload == null ? null : String(row.payload),
          error: row.error == null ? null : String(row.error),
          createdAt: asRequiredDate(row.createdAt),
        })),
        skipDuplicates: true,
      });
      console.log(`[import] notificationLogs: ${data.notificationLogs.length}`);
    }

    if (data.providerLogs.length > 0) {
      await prisma.providerLog.createMany({
        data: data.providerLogs.map((row) => ({
          id: String(row.id),
          companyId: row.companyId == null ? null : String(row.companyId),
          provider: String(row.provider),
          startTime: asRequiredDate(row.startTime),
          endTime: asDate(row.endTime),
          jobsFound: Number(row.jobsFound ?? 0),
          jobsAdded: Number(row.jobsAdded ?? 0),
          durationMs: row.durationMs == null ? null : Number(row.durationMs),
          error: row.error == null ? null : String(row.error),
          createdAt: asRequiredDate(row.createdAt),
        })),
        skipDuplicates: true,
      });
      console.log(`[import] providerLogs: ${data.providerLogs.length}`);
    }

    const counts = {
      companies: await prisma.company.count(),
      jobs: await prisma.job.count(),
      rules: await prisma.rule.count(),
      resumes: await prisma.resume.count(),
      applications: await prisma.application.count(),
      notificationLogs: await prisma.notificationLog.count(),
      providerLogs: await prisma.providerLog.count(),
      providerHealth: await prisma.providerHealth.count(),
      promptTemplates: await prisma.promptTemplate.count(),
    };
    console.log('[import] Postgres counts:', counts);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[import] Failed:', error);
  process.exit(1);
});
