import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_JOB_MATCH_PROMPT,
  DEFAULT_PROVIDERS,
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

  const existingRule = await prisma.rule.findFirst({
    where: { name: 'default' },
  });

  if (!existingRule) {
    await prisma.rule.create({
      data: {
        name: 'default',
        countries: JSON.stringify(['India', 'Remote']),
        cities: JSON.stringify(['Hyderabad', 'Bangalore', 'Pune', 'Remote']),
        skills: JSON.stringify(['TypeScript', 'React', 'Node.js']),
        roles: JSON.stringify([
          'Software Engineer',
          'Backend Engineer',
          'Full Stack',
        ]),
        excludedRoles: JSON.stringify(['Manager', 'Director', 'Intern']),
        // Keyword fallback scores are typically lower than Gemini — 50 is V1 default.
        minMatchScore: 50,
        enabled: true,
      },
    });
  } else {
    await prisma.rule.update({
      where: { id: existingRule.id },
      data: { minMatchScore: 50 },
    });
  }

  const existingResume = await prisma.resume.findFirst();
  if (!existingResume) {
    await prisma.resume.create({
      data: {
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

  // eslint-disable-next-line no-console
  console.log(
    `[seed] Target companies ready — created ${created}, updated ${updated}, unsupported ${UNSUPPORTED_TARGET_COMPANIES.length}.`,
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
