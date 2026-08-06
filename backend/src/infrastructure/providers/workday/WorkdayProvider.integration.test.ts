import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { FetchCompanyJobsUseCase } from '../../../application/usecases/FetchCompanyJobsUseCase.js';
import { JobScoringService } from '../../../application/services/JobScoringService.js';
import { JobDeduplicationService } from '../../../domain/services/JobDeduplicationService.js';
import { RelevanceScorer } from '../../../domain/services/RelevanceScorer.js';
import { RuleEngine } from '../../../domain/services/RuleEngine.js';
import type { Job } from '../../../domain/entities/Job.js';
import type {
  JobMatcher,
  MatchResult,
} from '../../../domain/ports/JobMatcher.js';
import type { Notifier } from '../../../domain/ports/Notifier.js';
import { PrismaCompanyRepository } from '../../database/PrismaCompanyRepository.js';
import { PrismaJobRepository } from '../../database/PrismaJobRepository.js';
import { PrismaRuleRepository } from '../../database/PrismaRuleRepository.js';
import { PrismaResumeRepository } from '../../database/PrismaResumeRepository.js';
import { PrismaProviderHealthRepository } from '../../database/PrismaProviderHealthRepository.js';
import { PrismaLogRepository } from '../../database/PrismaLogRepository.js';
import { ProviderRegistry } from '../ProviderRegistry.js';
import { WorkdayProvider } from './WorkdayProvider.js';

class MockMatcher implements JobMatcher {
  async match(_resumeText: string, _job: Job): Promise<MatchResult> {
    return {
      score: 91,
      reasons: ['Mocked Workday AI match'],
      missingSkills: [],
      interviewDifficulty: 'Medium',
      salaryEstimate: null,
      recommendation: 'APPLY',
      source: 'GEMINI',
    };
  }
}

class MockNotifier implements Notifier {
  public calls = 0;
  async notify(): Promise<void> {
    this.calls += 1;
  }
}

describe('Workday provider pipeline integration', () => {
  const prisma = new PrismaClient();
  let companyId = '';
  const notifier = new MockNotifier();

  beforeAll(async () => {
    await prisma.$connect();
    const company = await prisma.company.create({
      data: {
        name: `Workday Test ${Date.now()}`,
        provider: 'workday',
        careerUrl: 'https://acme.wd3.myworkdayjobs.com/en-US/External',
        enabled: true,
        frequency: '0 0 1 1 *',
      },
    });
    companyId = company.id;

    const resume = await prisma.resume.findFirst();
    if (!resume) {
      await prisma.resume.create({
        data: {
          extractedText: 'Software Engineer TypeScript React Node.js',
          markdown: '# Resume\nSoftware Engineer TypeScript React Node.js',
        },
      });
    }

    const rule = await prisma.rule.findFirst({ where: { name: 'default' } });
    if (rule) {
      await prisma.rule.update({
        where: { id: rule.id },
        data: {
          minMatchScore: 50,
          excludedRoles: JSON.stringify(['Manager']),
          roles: JSON.stringify(['Software Engineer', 'Backend Engineer']),
          countries: JSON.stringify(['India', 'Remote']),
          cities: JSON.stringify(['Hyderabad', 'Remote', 'Bangalore']),
          skills: JSON.stringify(['TypeScript', 'React', 'Node.js']),
        },
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

  it('runs fetch → normalize → dedup → rules → AI → notify → persist', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/jobs') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            total: 3,
            jobPostings: [
              {
                title: 'Software Engineer',
                externalPath: '/job/Hyderabad/SE_1',
                locationsText: 'Hyderabad, India',
              },
              {
                title: 'Engineering Manager',
                externalPath: '/job/Bangalore/EM_1',
                locationsText: 'Bangalore, India',
              },
              {
                title: 'Backend Engineer',
                externalPath: '/job/Remote/BE_1',
                locationsText: 'Remote, India',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({
          jobPostingInfo: {
            title: 'Role',
            jobDescription: '<p>TypeScript React Node.js</p>',
            location: 'Hyderabad, India',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const matcher = new MockMatcher();
    const useCase = new FetchCompanyJobsUseCase({
      companies: new PrismaCompanyRepository(),
      jobs: new PrismaJobRepository(),
      rules: new PrismaRuleRepository(),
      resumes: new PrismaResumeRepository(),
      providerHealth: new PrismaProviderHealthRepository(),
      logs: new PrismaLogRepository(),
      providers: new ProviderRegistry([
        new WorkdayProvider({
          fetchImpl: fetchImpl as typeof fetch,
          includeDetails: true,
        }),
      ]),
      notifier,
      deduplication: new JobDeduplicationService(),
      scoring: new JobScoringService({
        ruleEngine: new RuleEngine(),
        relevance: new RelevanceScorer(),
        primaryMatcher: matcher,
        baselineMatcher: matcher,
        escalationFitFloor: 60,
      }),
      matchScoreThreshold: 50,
      maxEscalationsPerRun: 40,
      maxNotificationsPerRun: 15,
    });

    const first = await useCase.execute(companyId);
    expect(first.jobsFound).toBe(3);
    expect(first.jobsAdded).toBe(3);
    // Only "Engineering Manager" is vetoed; the other two are scored.
    expect(first.skippedByRules).toBe(1);
    expect(first.scored).toBe(2);
    expect(first.notified).toBeGreaterThanOrEqual(1);
    expect(notifier.calls).toBeGreaterThanOrEqual(1);

    const persisted = await prisma.job.findMany({ where: { companyId } });
    expect(persisted).toHaveLength(3);
    expect(persisted.every((job) => job.provider === 'workday')).toBe(true);

    // Mocked resume score 91 at 70% plus perfect rule fit (100) at 30%.
    const engineer = persisted.find((job) => job.title === 'Software Engineer');
    expect(engineer?.matchScore).toBe(94);

    const manager = persisted.find((job) => job.title === 'Engineering Manager');
    expect(manager?.matchScore).toBeNull();

    const second = await useCase.execute(companyId);
    expect(second.jobsAdded).toBe(0);
    expect(second.skippedDuplicates).toBe(3);

    const health = await prisma.providerHealth.findUnique({
      where: { provider: 'workday' },
    });
    expect(health?.status).toBe('SUCCESS');
  });
});
