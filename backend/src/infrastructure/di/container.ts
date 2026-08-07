import type { AppConfig } from '../../shared/config/env.js';
import { JobDeduplicationService } from '../../domain/services/JobDeduplicationService.js';
import { RuleEngine } from '../../domain/services/RuleEngine.js';
import { RelevanceScorer } from '../../domain/services/RelevanceScorer.js';
import type { CompanyRepository } from '../../domain/repositories/CompanyRepository.js';
import type { JobRepository } from '../../domain/repositories/JobRepository.js';
import type { RuleRepository } from '../../domain/repositories/RuleRepository.js';
import type { ResumeRepository } from '../../domain/repositories/ResumeRepository.js';
import type { PromptTemplateRepository } from '../../domain/repositories/PromptTemplateRepository.js';
import type { ProviderHealthRepository } from '../../domain/repositories/ProviderHealthRepository.js';
import type { LogRepository } from '../../domain/repositories/LogRepository.js';
import type { ApplicationRepository } from '../../domain/repositories/ApplicationRepository.js';
import type { UserRepository } from '../../domain/repositories/UserRepository.js';
import type { JobQueue } from '../../domain/ports/JobQueue.js';
import type { JobMatcher } from '../../domain/ports/JobMatcher.js';
import type { Notifier } from '../../domain/ports/Notifier.js';
import { InMemoryJobQueue } from '../queue/InMemoryJobQueue.js';
import { PrismaCompanyRepository } from '../database/PrismaCompanyRepository.js';
import { PrismaJobRepository } from '../database/PrismaJobRepository.js';
import { PrismaRuleRepository } from '../database/PrismaRuleRepository.js';
import { PrismaResumeRepository } from '../database/PrismaResumeRepository.js';
import { PrismaUserRepository } from '../database/PrismaUserRepository.js';
import { PrismaPromptTemplateRepository } from '../database/PrismaPromptTemplateRepository.js';
import { PrismaProviderHealthRepository } from '../database/PrismaProviderHealthRepository.js';
import { PrismaLogRepository } from '../database/PrismaLogRepository.js';
import { PrismaApplicationRepository } from '../database/PrismaApplicationRepository.js';
import { prisma } from '../database/prismaClient.js';
import { AuthService } from '../../application/services/AuthService.js';
import { TelegramLinkService } from '../../application/services/TelegramLinkService.js';
import { ProviderRegistry } from '../providers/ProviderRegistry.js';
import { StubProvider } from '../providers/StubProvider.js';
import { GreenhouseProvider } from '../providers/greenhouse/GreenhouseProvider.js';
import { LeverProvider } from '../providers/lever/LeverProvider.js';
import { WorkdayProvider } from '../providers/workday/WorkdayProvider.js';
import { MicrosoftProvider } from '../providers/microsoft/MicrosoftProvider.js';
import { AshbyProvider } from '../providers/ashby/AshbyProvider.js';
import { SmartRecruitersProvider } from '../providers/smartrecruiters/SmartRecruitersProvider.js';
import { SuccessFactorsProvider } from '../providers/successfactors/SuccessFactorsProvider.js';
import { OracleProvider } from '../providers/oracle/OracleProvider.js';
import { EightfoldProvider } from '../providers/eightfold/EightfoldProvider.js';
import { AvatureProvider } from '../providers/avature/AvatureProvider.js';
import { SapProvider } from '../providers/sap/SapProvider.js';
import { GoldmanProvider } from '../providers/goldman/GoldmanProvider.js';
import {
  CustomProvider,
  createPlaywrightCustomListingFetcher,
} from '../providers/custom/CustomProvider.js';
import { createPlaywrightMicrosoftListingFetcher } from '../providers/microsoft/playwrightListingFetcher.js';
import { KeywordJobMatcher } from '../matching/KeywordJobMatcher.js';
import { ResilientJobMatcher } from '../matching/ResilientJobMatcher.js';
import { GeminiJobMatcher } from '../gemini/GeminiJobMatcher.js';
import { TelegramNotifier } from '../telegram/TelegramNotifier.js';
import { LoggingNotifier } from '../telegram/LoggingNotifier.js';
import { JobScoringService } from '../../application/services/JobScoringService.js';
import { FetchCompanyJobsUseCase } from '../../application/usecases/FetchCompanyJobsUseCase.js';
import { RescoreJobsUseCase } from '../../application/usecases/RescoreJobsUseCase.js';
import { ScheduleTickUseCase } from '../../application/usecases/ScheduleTickUseCase.js';
import { DevToolsService } from '../../application/usecases/DevToolsService.js';
import { CronScheduler } from '../scheduler/CronScheduler.js';
import { parseCronNext } from '../scheduler/cronNext.js';
import { logger } from '../../shared/utils/logger.js';

export interface AppContainer {
  config: AppConfig;
  prisma: typeof prisma;
  queue: JobQueue;
  users: UserRepository;
  auth: AuthService;
  telegramLink: TelegramLinkService;
  companies: CompanyRepository;
  jobs: JobRepository;
  rules: RuleRepository;
  resumes: ResumeRepository;
  prompts: PromptTemplateRepository;
  providerHealth: ProviderHealthRepository;
  logs: LogRepository;
  applications: ApplicationRepository;
  jobDeduplication: JobDeduplicationService;
  ruleEngine: RuleEngine;
  relevance: RelevanceScorer;
  providers: ProviderRegistry;
  matcher: JobMatcher;
  scoring: JobScoringService;
  notifier: Notifier;
  fetchCompanyJobs: FetchCompanyJobsUseCase;
  rescoreJobs: RescoreJobsUseCase;
  scheduleTick: ScheduleTickUseCase;
  scheduler: CronScheduler;
  devTools: DevToolsService;
  startWorkers: () => void;
  stopWorkers: () => void;
}

/**
 * Composition root — wires domain ports to infrastructure adapters.
 */
export function createContainer(config: AppConfig): AppContainer {
  const queue = new InMemoryJobQueue();
  const users = new PrismaUserRepository();
  const auth = new AuthService({
    users,
    jwtSecret: config.jwtSecret,
  });
  const telegramLink = new TelegramLinkService({
    botToken: config.telegramBotToken,
    users,
  });
  const companies = new PrismaCompanyRepository();
  const jobs = new PrismaJobRepository();
  const rules = new PrismaRuleRepository();
  const resumes = new PrismaResumeRepository();
  const prompts = new PrismaPromptTemplateRepository();
  const providerHealth = new PrismaProviderHealthRepository();
  const logs = new PrismaLogRepository();
  const applications = new PrismaApplicationRepository();
  const jobDeduplication = new JobDeduplicationService();
  const ruleEngine = new RuleEngine();
  const relevance = new RelevanceScorer();
  const providers = new ProviderRegistry([
    new StubProvider(),
    new GreenhouseProvider(),
    new LeverProvider(),
    new WorkdayProvider(),
    new MicrosoftProvider({
      listingFetcher: createPlaywrightMicrosoftListingFetcher(),
    }),
    new AshbyProvider(),
    new SmartRecruitersProvider(),
    new SuccessFactorsProvider(),
    new OracleProvider(),
    new EightfoldProvider(),
    new AvatureProvider(),
    new SapProvider(),
    new GoldmanProvider(),
    new CustomProvider({
      listingFetcher: createPlaywrightCustomListingFetcher(),
    }),
  ]);

  const keywordMatcher = new KeywordJobMatcher();
  const geminiMatcher =
    config.geminiEnabled && config.geminiApiKey
      ? new GeminiJobMatcher({
          apiKey: config.geminiApiKey,
          prompts,
        })
      : null;
  const matcher = new ResilientJobMatcher(geminiMatcher, keywordMatcher);

  // Two tiers: the keyword matcher is free so it can score every eligible job,
  // while the resilient (Gemini) matcher is reserved for high-fit jobs.
  const scoring = new JobScoringService({
    ruleEngine,
    relevance,
    primaryMatcher: matcher,
    baselineMatcher: keywordMatcher,
    escalationFitFloor: config.escalationFitFloor,
  });

  const notifier = config.telegramBotToken
    ? new TelegramNotifier({
        botToken: config.telegramBotToken,
        defaultChatId: config.telegramChatId || undefined,
      })
    : new LoggingNotifier();

  if (!config.telegramBotToken) {
    logger.warn(
      'TELEGRAM_BOT_TOKEN missing — using LoggingNotifier (dry-run)',
    );
  }

  const fetchCompanyJobs = new FetchCompanyJobsUseCase({
    companies,
    jobs,
    rules,
    resumes,
    users,
    providerHealth,
    logs,
    providers,
    notifier,
    deduplication: jobDeduplication,
    scoring,
    matchScoreThreshold: config.matchScoreThreshold,
    maxEscalationsPerRun: config.maxEscalationsPerRun,
    maxNotificationsPerRun: config.maxNotificationsPerRun,
  });

  const rescoreJobs = new RescoreJobsUseCase({
    jobs,
    rules,
    resumes,
    scoring,
    matchScoreThreshold: config.matchScoreThreshold,
    maxEscalationsPerRun: config.maxEscalationsPerRun,
  });

  const scheduleTick = new ScheduleTickUseCase({
    companies,
    queue,
    parseCronNext,
  });

  const scheduler = new CronScheduler(
    scheduleTick,
    config.cronDefaultExpression,
  );

  const devTools = new DevToolsService({
    prisma,
    companies,
    jobs,
    rules,
    resumes,
    logs,
    providers,
    matcher,
    notifier,
    ruleEngine,
    fetchCompanyJobs,
    rescoreJobs,
    scheduleTick,
  });

  const startWorkers = (): void => {
    queue.start(async (item) => {
      if (item.type === 'FetchCompanyJobs') {
        await fetchCompanyJobs.execute(item.payload.companyId);
      }
    });
    scheduler.start();
    telegramLink.startPolling();
  };

  const stopWorkers = (): void => {
    scheduler.stop();
    queue.stop();
    void telegramLink.stopPolling();
  };

  return {
    config,
    prisma,
    queue,
    users,
    auth,
    telegramLink,
    companies,
    jobs,
    rules,
    resumes,
    prompts,
    providerHealth,
    logs,
    applications,
    jobDeduplication,
    ruleEngine,
    relevance,
    providers,
    matcher,
    scoring,
    notifier,
    fetchCompanyJobs,
    rescoreJobs,
    scheduleTick,
    scheduler,
    devTools,
    startWorkers,
    stopWorkers,
  };
}
