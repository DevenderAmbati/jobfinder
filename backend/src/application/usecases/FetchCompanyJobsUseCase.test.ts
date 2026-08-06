import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { FetchCompanyJobsUseCase } from './FetchCompanyJobsUseCase.js';
import { JobScoringService } from '../services/JobScoringService.js';
import { JobDeduplicationService } from '../../domain/services/JobDeduplicationService.js';
import { RelevanceScorer } from '../../domain/services/RelevanceScorer.js';
import { RuleEngine } from '../../domain/services/RuleEngine.js';
import { PrismaCompanyRepository } from '../../infrastructure/database/PrismaCompanyRepository.js';
import { PrismaJobRepository } from '../../infrastructure/database/PrismaJobRepository.js';
import { PrismaRuleRepository } from '../../infrastructure/database/PrismaRuleRepository.js';
import { PrismaResumeRepository } from '../../infrastructure/database/PrismaResumeRepository.js';
import { PrismaProviderHealthRepository } from '../../infrastructure/database/PrismaProviderHealthRepository.js';
import { PrismaLogRepository } from '../../infrastructure/database/PrismaLogRepository.js';
import { ProviderRegistry } from '../../infrastructure/providers/ProviderRegistry.js';
import { StubProvider } from '../../infrastructure/providers/StubProvider.js';
import { KeywordJobMatcher } from '../../infrastructure/matching/KeywordJobMatcher.js';
import { LoggingNotifier } from '../../infrastructure/telegram/LoggingNotifier.js';

describe('FetchCompanyJobsUseCase (stub provider)', () => {
  const prisma = new PrismaClient();
  let companyId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const company = await prisma.company.create({
      data: {
        name: `Pipeline Stub ${Date.now()}`,
        provider: 'stub',
        careerUrl: 'https://example.com/careers',
        enabled: true,
        frequency: '* * * * *',
      },
    });
    companyId = company.id;

    const resume = await prisma.resume.findFirst();
    if (!resume) {
      await prisma.resume.create({
        data: {
          extractedText:
            'Software Engineer TypeScript React Node.js backend APIs',
          markdown:
            '# Resume\nSoftware Engineer TypeScript React Node.js backend APIs',
        },
      });
    }

    const rule = await prisma.rule.findFirst({ where: { name: 'default' } });
    if (!rule) {
      await prisma.rule.create({
        data: {
          name: 'default',
          countries: JSON.stringify(['India', 'Remote']),
          cities: JSON.stringify(['Hyderabad', 'Bangalore', 'Remote']),
          skills: JSON.stringify(['TypeScript', 'React', 'Node.js']),
          roles: JSON.stringify(['Software Engineer', 'Backend Engineer']),
          excludedRoles: JSON.stringify(['Manager']),
          minMatchScore: 50,
          enabled: true,
        },
      });
    } else {
      await prisma.rule.update({
        where: { id: rule.id },
        data: { minMatchScore: 50 },
      });
    }
  });

  afterAll(async () => {
    if (companyId) {
      const jobs = await prisma.job.findMany({ where: { companyId } });
      const jobIds = jobs.map((job) => job.id);
      if (jobIds.length > 0) {
        await prisma.notificationLog.deleteMany({
          where: { jobId: { in: jobIds } },
        });
      }
      await prisma.providerLog.deleteMany({ where: { companyId } });
      await prisma.job.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
    }
    await prisma.$disconnect();
  });

  it('fetches, dedups, scores, and notifies via stub provider', async () => {
    const keywordMatcher = new KeywordJobMatcher();
    const useCase = new FetchCompanyJobsUseCase({
      companies: new PrismaCompanyRepository(),
      jobs: new PrismaJobRepository(),
      rules: new PrismaRuleRepository(),
      resumes: new PrismaResumeRepository(),
      providerHealth: new PrismaProviderHealthRepository(),
      logs: new PrismaLogRepository(),
      providers: new ProviderRegistry([new StubProvider()]),
      notifier: new LoggingNotifier(),
      deduplication: new JobDeduplicationService(),
      scoring: new JobScoringService({
        ruleEngine: new RuleEngine(),
        relevance: new RelevanceScorer(),
        primaryMatcher: keywordMatcher,
        baselineMatcher: keywordMatcher,
        escalationFitFloor: 60,
      }),
      matchScoreThreshold: 50,
      maxEscalationsPerRun: 40,
      maxNotificationsPerRun: 15,
    });

    const first = await useCase.execute(companyId);
    expect(first.jobsFound).toBe(3);
    expect(first.jobsAdded).toBe(3);
    // The stub's "Engineering Manager" is the only veto; the other two are
    // eligible and therefore scored rather than discarded.
    expect(first.skippedByRules).toBe(1);
    expect(first.scored).toBe(2);
    expect(first.notified).toBeGreaterThanOrEqual(1);

    const second = await useCase.execute(companyId);
    expect(second.jobsAdded).toBe(0);
    expect(second.skippedDuplicates).toBe(3);

    const health = await prisma.providerHealth.findUnique({
      where: { provider: 'stub' },
    });
    expect(health?.status).toBe('SUCCESS');
  });
});
