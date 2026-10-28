/**
 * Enqueue a fetch for every enabled company (same Firestore as prod).
 *
 * Usage:
 *   npx tsx scripts/fetch-all.ts
 *   npx tsx scripts/fetch-all.ts --retry-failed
 *   npx tsx scripts/fetch-all.ts --no-retry
 *
 * Prints daily analytics and exits non-zero if any company still failed
 * after the optional auto-retry, so CI can alert and re-run.
 */
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createContainer } from '../src/infrastructure/di/container.js';
import { loadConfig } from '../src/shared/config/env.js';
import type { Company } from '../src/domain/entities/Company.js';
import type { AppConfig } from '../src/shared/config/env.js';

type FetchOutcome = {
  companyId: string;
  companyName: string;
  ok: boolean;
  error?: string;
  jobsFound?: number;
  jobsAdded?: number;
};

export type DailyFetchAnalytics = {
  date: string;
  mode: 'full' | 'retry-failed';
  enqueued: number;
  companiesFetched: number;
  companiesCouldNotFetch: number;
  companiesNewJobsFound: number;
  companiesNoJobsFound: number;
  totalJobsFound: number;
  totalJobsAdded: number;
  failed: Array<{ companyId: string; companyName: string; error?: string }>;
  incomplete: string[];
  withNewJobs: Array<{ companyName: string; jobsAdded: number; jobsFound: number }>;
  withNoJobs: Array<{ companyName: string }>;
};

function parseArgs(argv: string[]): {
  retryFailed: boolean;
  autoRetry: boolean;
} {
  return {
    retryFailed: argv.includes('--retry-failed'),
    autoRetry: !argv.includes('--no-retry') && !argv.includes('--retry-failed'),
  };
}

async function selectCompanies(
  container: ReturnType<typeof createContainer>,
  retryFailed: boolean,
  onlyIds?: Set<string>,
): Promise<Company[]> {
  const enabled = (await container.companies.findAll()).filter((c) => c.enabled);

  if (onlyIds && onlyIds.size > 0) {
    return enabled.filter((c) => onlyIds.has(c.id));
  }

  if (!retryFailed) {
    return enabled;
  }

  const logs = await container.logs.listProviderLogs(2000);
  const latestByCompany = new Map<
    string,
    { startTime: Date; error: string | null }
  >();
  for (const log of logs) {
    if (!log.companyId) continue;
    const existing = latestByCompany.get(log.companyId);
    if (!existing || log.startTime > existing.startTime) {
      latestByCompany.set(log.companyId, {
        startTime: log.startTime,
        error: log.error,
      });
    }
  }

  const retry = enabled.filter((company) => {
    const latest = latestByCompany.get(company.id);
    if (!latest) return true;
    return Boolean(latest.error);
  });

  // eslint-disable-next-line no-console
  console.log(
    `[fetch-all] --retry-failed: ${retry.length} of ${enabled.length} enabled companies need retry`,
  );
  return retry;
}

function mergeOutcomes(
  previous: FetchOutcome[],
  next: FetchOutcome[],
): FetchOutcome[] {
  const byId = new Map(previous.map((o) => [o.companyId, o]));
  for (const outcome of next) {
    byId.set(outcome.companyId, outcome);
  }
  return [...byId.values()];
}

function buildAnalytics(
  companies: Company[],
  outcomes: FetchOutcome[],
  pending: Set<string>,
  mode: DailyFetchAnalytics['mode'],
): DailyFetchAnalytics {
  const succeeded = outcomes.filter((o) => o.ok);
  const failed = outcomes.filter((o) => !o.ok);
  const withNewJobs = succeeded.filter((o) => (o.jobsAdded ?? 0) > 0);
  const withNoJobs = succeeded.filter((o) => (o.jobsFound ?? 0) === 0);

  return {
    date: new Date().toISOString().slice(0, 10),
    mode,
    enqueued: companies.length,
    companiesFetched: succeeded.length,
    companiesCouldNotFetch: failed.length + pending.size,
    companiesNewJobsFound: withNewJobs.length,
    companiesNoJobsFound: withNoJobs.length,
    totalJobsFound: succeeded.reduce((sum, o) => sum + (o.jobsFound ?? 0), 0),
    totalJobsAdded: succeeded.reduce((sum, o) => sum + (o.jobsAdded ?? 0), 0),
    failed: failed.map((f) => ({
      companyId: f.companyId,
      companyName: f.companyName,
      error: f.error,
    })),
    incomplete: [...pending],
    withNewJobs: withNewJobs.map((o) => ({
      companyName: o.companyName,
      jobsAdded: o.jobsAdded ?? 0,
      jobsFound: o.jobsFound ?? 0,
    })),
    withNoJobs: withNoJobs.map((o) => ({ companyName: o.companyName })),
  };
}

function formatAnalyticsMarkdown(analytics: DailyFetchAnalytics): string {
  const lines = [
    `## Daily fetch analytics (${analytics.date})`,
    '',
    `| Metric | Count |`,
    `| --- | ---: |`,
    `| Companies fetched | ${analytics.companiesFetched} |`,
    `| Companies couldn't fetch | ${analytics.companiesCouldNotFetch} |`,
    `| Companies with new jobs | ${analytics.companiesNewJobsFound} |`,
    `| Companies with no jobs found | ${analytics.companiesNoJobsFound} |`,
    `| Total jobs seen | ${analytics.totalJobsFound} |`,
    `| Total new jobs added | ${analytics.totalJobsAdded} |`,
    '',
  ];

  if (analytics.failed.length > 0) {
    lines.push('### Failed companies', '');
    for (const f of analytics.failed) {
      lines.push(`- ${f.companyName}: ${f.error ?? 'unknown error'}`);
    }
    lines.push('');
  }

  if (analytics.withNewJobs.length > 0) {
    lines.push('### Companies with new jobs', '');
    for (const c of analytics.withNewJobs) {
      lines.push(
        `- ${c.companyName}: +${c.jobsAdded} new (of ${c.jobsFound} listed)`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatAnalyticsText(analytics: DailyFetchAnalytics): string {
  return [
    `Daily fetch analytics (${analytics.date})`,
    `• Companies fetched: ${analytics.companiesFetched}`,
    `• Companies couldn't fetch: ${analytics.companiesCouldNotFetch}`,
    `• Companies with new jobs: ${analytics.companiesNewJobsFound}`,
    `• Companies with no jobs found: ${analytics.companiesNoJobsFound}`,
    `• Total jobs seen: ${analytics.totalJobsFound}`,
    `• Total new jobs added: ${analytics.totalJobsAdded}`,
  ].join('\n');
}

async function writeAnalyticsArtifacts(
  analytics: DailyFetchAnalytics,
): Promise<void> {
  const outDir = path.resolve(process.cwd(), 'logs');
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'fetch-analytics.json');
  const mdPath = path.join(outDir, 'fetch-analytics.md');
  await writeFile(jsonPath, JSON.stringify(analytics, null, 2), 'utf8');
  await writeFile(mdPath, formatAnalyticsMarkdown(analytics), 'utf8');

  const summaryFile = process.env.GITHUB_STEP_SUMMARY?.trim();
  if (summaryFile) {
    await writeFile(summaryFile, formatAnalyticsMarkdown(analytics), {
      encoding: 'utf8',
      flag: 'a',
    });
  }

  // eslint-disable-next-line no-console
  console.log(`[fetch-all] Wrote analytics → ${jsonPath}`);
}

async function sendTelegramAnalytics(
  config: AppConfig,
  container: ReturnType<typeof createContainer>,
  analytics: DailyFetchAnalytics,
): Promise<void> {
  const token = config.telegramBotToken;
  if (!token) {
    // eslint-disable-next-line no-console
    console.log('[fetch-all] Skipping Telegram analytics (no TELEGRAM_BOT_TOKEN)');
    return;
  }

  const chatIds = new Set<string>();
  if (config.telegramChatId) {
    chatIds.add(config.telegramChatId);
  }

  const userIds = await container.users.listIdsWithResume();
  for (const userId of userIds) {
    const chatId = await container.users.getTelegramChatId(userId);
    if (chatId) chatIds.add(chatId);
  }

  if (chatIds.size === 0) {
    // eslint-disable-next-line no-console
    console.log(
      '[fetch-all] Skipping Telegram analytics (no TELEGRAM_CHAT_ID / linked users)',
    );
    return;
  }

  const text = formatAnalyticsText(analytics);
  for (const chatId of chatIds) {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      },
    );
    if (!response.ok) {
      const body = await response.text();
      // eslint-disable-next-line no-console
      console.error(
        `[fetch-all] Telegram analytics failed for ${chatId}: ${response.status} ${body}`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(`[fetch-all] Telegram analytics sent to ${chatId}`);
    }
  }
}

async function runFetchPass(
  container: ReturnType<typeof createContainer>,
  companies: Company[],
): Promise<{ outcomes: FetchOutcome[]; pending: Set<string> }> {
  const outcomes: FetchOutcome[] = [];
  const pending = new Set(companies.map((c) => c.id));

  if (companies.length === 0) {
    return { outcomes, pending };
  }

  container.queue.start(async (item) => {
    if (item.type !== 'FetchCompanyJobs') {
      return;
    }
    const companyId = item.payload.companyId;
    const company = companies.find((c) => c.id === companyId);
    const companyName = company?.name ?? companyId;
    try {
      const result = await container.fetchCompanyJobs.execute(companyId);
      pending.delete(companyId);
      outcomes.push({
        companyId,
        companyName,
        ok: true,
        jobsFound: result.jobsFound,
        jobsAdded: result.jobsAdded,
      });
      // eslint-disable-next-line no-console
      console.log(
        `[fetch-all] OK  ${companyName} (found=${result.jobsFound}, added=${result.jobsAdded})`,
      );
    } catch (error: unknown) {
      pending.delete(companyId);
      const message = error instanceof Error ? error.message : String(error);
      outcomes.push({ companyId, companyName, ok: false, error: message });
      // eslint-disable-next-line no-console
      console.error(`[fetch-all] FAIL ${companyName}: ${message}`);
    }
  });

  // eslint-disable-next-line no-console
  console.log(
    `[fetch-all] Enqueueing ${companies.length} compan${companies.length === 1 ? 'y' : 'ies'}…`,
  );

  for (const company of companies) {
    await container.queue.enqueue({
      type: 'FetchCompanyJobs',
      payload: { companyId: company.id },
    });
  }

  // eslint-disable-next-line no-console
  console.log('[fetch-all] Waiting for queue to drain (this can take a while)…');
  await container.queue.idle();
  container.queue.stop();

  return { outcomes, pending };
}

async function main(): Promise<void> {
  const { retryFailed, autoRetry } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const container = createContainer(config);

  const companies = await selectCompanies(container, retryFailed);
  if (companies.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[fetch-all] Nothing to fetch.');
    const empty = buildAnalytics([], [], new Set(), retryFailed ? 'retry-failed' : 'full');
    // eslint-disable-next-line no-console
    console.log(formatAnalyticsText(empty));
    await writeAnalyticsArtifacts(empty);
    return;
  }

  let { outcomes, pending } = await runFetchPass(container, companies);
  let trackedCompanies = companies;

  const failedIds = new Set(
    outcomes.filter((o) => !o.ok).map((o) => o.companyId),
  );
  for (const id of pending) failedIds.add(id);

  if (autoRetry && failedIds.size > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[fetch-all] Auto-retrying ${failedIds.size} failed/incomplete compan${failedIds.size === 1 ? 'y' : 'ies'}…`,
    );
    const retryCompanies = await selectCompanies(
      container,
      false,
      failedIds,
    );
    const retryPass = await runFetchPass(container, retryCompanies);
    outcomes = mergeOutcomes(outcomes, retryPass.outcomes);
    pending = retryPass.pending;
    // Keep original enqueued set for "attempted today" denominator in analytics.
    trackedCompanies = companies;
  }

  const analytics = buildAnalytics(
    trackedCompanies,
    outcomes,
    pending,
    retryFailed ? 'retry-failed' : 'full',
  );

  // eslint-disable-next-line no-console
  console.log(`\n${formatAnalyticsText(analytics)}\n`);
  await writeAnalyticsArtifacts(analytics);
  await sendTelegramAnalytics(config, container, analytics);

  if (
    analytics.companiesCouldNotFetch > 0 ||
    analytics.companiesFetched !== analytics.enqueued
  ) {
    if (analytics.failed.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        '[fetch-all] Failed companies:\n' +
          analytics.failed
            .map((f) => `  - ${f.companyName} (${f.companyId}): ${f.error}`)
            .join('\n'),
      );
    }
    if (analytics.incomplete.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        '[fetch-all] Incomplete (never finished):\n' +
          analytics.incomplete.map((id) => `  - ${id}`).join('\n'),
      );
    }
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
