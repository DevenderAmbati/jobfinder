import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_JOB_MATCH_PROMPT,
  DEFAULT_PROVIDERS,
  FALLBACK_CRON_EXPRESSION,
  JOB_MATCH_PROMPT_NAME,
} from '../src/shared/config/defaults.js';
import {
  DEMO_COMPANIES_TO_REMOVE,
  TARGET_COMPANIES,
  UNSUPPORTED_TARGET_COMPANIES,
} from '../src/shared/config/targetCompanies.js';

const prisma = new PrismaClient();

async function seed(): Promise<void> {
  const existingPrompt = await prisma.promptTemplate.findFirst({
    where: { name: JOB_MATCH_PROMPT_NAME, version: 1 },
  });

  if (!existingPrompt) {
    await prisma.promptTemplate.create({
      data: {
        name: JOB_MATCH_PROMPT_NAME,
        version: 1,
        content: DEFAULT_JOB_MATCH_PROMPT,
        enabled: true,
      },
    });
  }

  // Per-user preference rules for the legacy owner (optional defaults).
  const defaultUser = await prisma.user.upsert({
    where: { email: 'owner@localhost' },
    create: {
      id: 'legacy_default_user',
      email: 'owner@localhost',
      passwordHash:
        '$2b$10$yOLAbH1ekbaVf4mp/kxlZupCghYNOK5wtexe5PVFOSlBY/jFLBFSC',
      name: 'Owner',
    },
    update: {},
  });

  await prisma.rule.upsert({
    where: { userId: defaultUser.id },
    create: {
      user: { connect: { id: defaultUser.id } },
      skills: JSON.stringify(['TypeScript', 'React', 'Node.js']),
      roles: JSON.stringify([
        'Software Engineer',
        'Backend Engineer',
        'Full Stack',
      ]),
      experience: '2-4 years',
      minMatchScore: 50,
    },
    update: {
      minMatchScore: 50,
    },
  });

  const existingResume = await prisma.resume.findUnique({
    where: { userId: defaultUser.id },
  });
  if (!existingResume) {
    await prisma.resume.create({
      data: {
        user: { connect: { id: defaultUser.id } },
        extractedText:
          'Software Engineer with experience in TypeScript, React, and Node.js.',
        markdown:
          '# Resume\n\nSoftware Engineer with experience in **TypeScript**, **React**, and **Node.js**.',
        embedding: null,
        originalPdfPath: null,
      },
    });
  }

  for (const provider of DEFAULT_PROVIDERS) {
    await prisma.providerHealth.upsert({
      where: { provider },
      create: { provider },
      update: {},
    });
  }

  // Remove leftover demo boards so they no longer appear in Companies.
  for (const name of DEMO_COMPANIES_TO_REMOVE) {
    const demo = await prisma.company.findFirst({ where: { name } });
    if (!demo) {
      continue;
    }
    const jobs = await prisma.job.findMany({
      where: { companyId: demo.id },
      select: { id: true },
    });
    const jobIds = jobs.map((job) => job.id);
    if (jobIds.length > 0) {
      await prisma.notificationLog.deleteMany({
        where: { jobId: { in: jobIds } },
      });
      await prisma.application.deleteMany({
        where: { jobId: { in: jobIds } },
      });
      await prisma.job.deleteMany({ where: { companyId: demo.id } });
    }
    await prisma.providerLog.deleteMany({ where: { companyId: demo.id } });
    await prisma.company.delete({ where: { id: demo.id } });
  }

  let created = 0;
  let updated = 0;

  for (const target of TARGET_COMPANIES) {
    const existing = await prisma.company.findFirst({
      where: { name: target.name },
    });

    if (existing) {
      await prisma.company.update({
        where: { id: existing.id },
        data: {
          provider: target.provider,
          careerUrl: target.careerUrl,
          enabled: target.enabled,
          frequency: target.frequency,
        },
      });
      updated += 1;
      continue;
    }

    // Migrate the old Microsoft demo row onto the canonical name once.
    if (target.name === 'Microsoft') {
      const legacy = await prisma.company.findFirst({
        where: { name: 'Microsoft Careers' },
      });
      if (legacy) {
        await prisma.company.update({
          where: { id: legacy.id },
          data: {
            name: target.name,
            provider: target.provider,
            careerUrl: target.careerUrl,
            enabled: target.enabled,
            frequency: target.frequency,
          },
        });
        updated += 1;
        continue;
      }
    }

    // Migrate the old NVIDIA demo row onto the canonical name once.
    if (target.name === 'NVIDIA') {
      const legacy = await prisma.company.findFirst({
        where: { name: 'Workday Demo (NVIDIA careers URL)' },
      });
      if (legacy) {
        await prisma.company.update({
          where: { id: legacy.id },
          data: {
            name: target.name,
            provider: target.provider,
            careerUrl: target.careerUrl,
            enabled: target.enabled,
            frequency: target.frequency,
          },
        });
        updated += 1;
        continue;
      }
    }

    await prisma.company.create({
      data: {
        name: target.name,
        provider: target.provider,
        careerUrl: target.careerUrl,
        enabled: target.enabled,
        frequency: target.frequency,
      },
    });
    created += 1;
  }

  const frequencySync = await prisma.company.updateMany({
    where: { NOT: { frequency: FALLBACK_CRON_EXPRESSION } },
    data: { frequency: FALLBACK_CRON_EXPRESSION },
  });

  // eslint-disable-next-line no-console
  console.log(
    `[seed] Target companies ready — created ${created}, updated ${updated}, unsupported ${UNSUPPORTED_TARGET_COMPANIES.length}, frequency synced ${frequencySync.count}.`,
  );
}

seed()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[seed] Failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
