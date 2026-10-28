import { Router } from 'express';
import type { AppContainer } from '../../infrastructure/di/container.js';
import {
  createCronStatusController,
  createHealthController,
  createProviderStatusController,
  createVersionController,
} from '../controllers/healthController.js';
import { createAuthController } from '../controllers/authController.js';
import { createCompanyController } from '../controllers/companyController.js';
import { createJobController } from '../controllers/jobController.js';
import { createProviderHealthController } from '../controllers/providerHealthController.js';
import { createLogsController } from '../controllers/logsController.js';
import { createRulesController } from '../controllers/rulesController.js';
import { createApplicationsController } from '../controllers/applicationsController.js';
import { createResumeController } from '../controllers/resumeController.js';
import { createPromptsController } from '../controllers/promptsController.js';
import { createSettingsController } from '../controllers/settingsController.js';
import { createAnalyticsController } from '../controllers/analyticsController.js';
import { createDevToolsController } from '../controllers/devToolsController.js';
import { createTelegramController } from '../controllers/telegramController.js';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';
import { createDevToolsGuard } from '../middleware/devToolsGuard.js';
import { resumeUpload } from '../middleware/resumeUpload.js';
import type { RequestHandler } from 'express';

export interface ApiRouterOptions {
  fetchRateLimiter?: RequestHandler;
}

/**
 * HTTP route map. Controllers only coordinate — use cases own orchestration.
 * Public: health, version, register, login, telegram webhook, internal scheduler.
 * Everything else requires Firebase ID token.
 */
export function createApiRouter(
  container: AppContainer,
  options: ApiRouterOptions = {},
): Router {
  const apiRouter = Router();
  const fetchLimit = options.fetchRateLimiter;
  const requireAuth = createAuthMiddleware(container.auth);
  const getHealth = createHealthController(container);
  const getVersion = createVersionController(container);
  const getCronStatus = createCronStatusController(container);
  const providerStatus = createProviderStatusController(container);
  const auth = createAuthController(container);
  const companies = createCompanyController(container);
  const jobs = createJobController(container);
  const providerHealth = createProviderHealthController(container);
  const logs = createLogsController(container);
  const rules = createRulesController(container);
  const applications = createApplicationsController(container);
  const resume = createResumeController(container);
  const prompts = createPromptsController(container);
  const settings = createSettingsController(container);
  const analytics = createAnalyticsController(container);
  const telegram = createTelegramController(container);
  const dev = createDevToolsController(container);
  const requireDevTools = createDevToolsGuard(container.config);

  apiRouter.get('/health', getHealth);
  apiRouter.get('/version', getVersion);
  apiRouter.post('/auth/register', (req, res, next) =>
    void auth.register(req, res, next),
  );
  apiRouter.post('/auth/login', (req, res, next) =>
    void auth.login(req, res, next),
  );

  // Telegram webhook (no user JWT). Optional secret via header.
  apiRouter.post('/telegram/webhook', (req, res, next) =>
    void telegram.webhook(req, res, next),
  );

  // Cloud Scheduler tick (OIDC audience or shared secret — no user JWT).
  // Body: { force?: boolean, wait?: boolean } — force enqueues all enabled.
  // wait defaults to true so Cloud Run keeps CPU until the in-memory queue
  // drains. Returning early lets the instance scale to zero and drop fetches.
  apiRouter.post('/internal/schedule-tick', (req, res, next) =>
    void (async () => {
      try {
        const secret = container.config.internalSchedulerSecret;
        const header =
          typeof req.headers['x-scheduler-secret'] === 'string'
            ? req.headers['x-scheduler-secret']
            : '';
        const authHeader = req.headers.authorization ?? '';
        const okSecret = Boolean(secret) && header === secret;
        // Cloud Scheduler OIDC: Authorization Bearer present is enough when no secret configured.
        const okOidc =
          !secret &&
          authHeader.startsWith('Bearer ') &&
          authHeader.length > 20;
        if (!okSecret && !okOidc) {
          res.status(401).json({
            error: { message: 'Unauthorized scheduler request' },
          });
          return;
        }
        const body =
          req.body && typeof req.body === 'object'
            ? (req.body as {
                force?: unknown;
                wait?: unknown;
                companyIds?: unknown;
              })
            : {};
        const force = body.force === true;
        const wait = body.wait !== false;
        const companyIds = Array.isArray(body.companyIds)
          ? body.companyIds.filter(
              (id): id is string => typeof id === 'string' && id.trim().length > 0,
            )
          : undefined;
        const result = await container.scheduleTick.execute(new Date(), {
          force,
          wait,
          companyIds,
        });
        res.status(200).json({
          data: {
            ...result,
            enqueuedCount: result.enqueued.length,
            waited: wait,
          },
        });
      } catch (error) {
        next(error);
      }
    })(),
  );

  apiRouter.use(requireAuth);

  apiRouter.get('/auth/me', (req, res, next) => void auth.me(req, res, next));
  apiRouter.get('/cron/status', getCronStatus);
  apiRouter.get('/providers/status', (req, res, next) =>
    void providerStatus.summary(req, res, next),
  );
  apiRouter.get('/companies', (req, res, next) => void companies.list(req, res, next));
  apiRouter.post('/companies', (req, res, next) => void companies.create(req, res, next));
  apiRouter.patch('/companies/:id', (req, res, next) =>
    void companies.update(req, res, next),
  );
  apiRouter.post(
    '/companies/:id/fetch',
    ...(fetchLimit ? [fetchLimit] : []),
    (req, res, next) => void companies.fetch(req, res, next),
  );
  apiRouter.get('/jobs', (req, res, next) => void jobs.list(req, res, next));
  apiRouter.get('/jobs/latest-fetch', (req, res, next) =>
    void jobs.latestFetch(req, res, next),
  );
  apiRouter.get('/jobs/facets', (req, res, next) =>
    void jobs.facets(req, res, next),
  );
  apiRouter.get('/providers/health', (req, res, next) =>
    void providerHealth.list(req, res, next),
  );
  apiRouter.get('/logs/providers', (req, res, next) =>
    void logs.listProviderLogs(req, res, next),
  );
  apiRouter.get('/logs/notifications', (req, res, next) =>
    void logs.listNotificationLogs(req, res, next),
  );
  apiRouter.get('/rules', (req, res, next) => void rules.get(req, res, next));
  apiRouter.put('/rules', (req, res, next) => void rules.put(req, res, next));
  apiRouter.get('/applications', (req, res, next) =>
    void applications.list(req, res, next),
  );
  apiRouter.post('/applications', (req, res, next) =>
    void applications.create(req, res, next),
  );
  apiRouter.patch('/applications/:id', (req, res, next) =>
    void applications.update(req, res, next),
  );
  apiRouter.delete('/applications/:id', (req, res, next) =>
    void applications.remove(req, res, next),
  );
  apiRouter.get('/resume', (req, res, next) => void resume.get(req, res, next));
  apiRouter.put(
    '/resume',
    resumeUpload.single('pdf'),
    (req, res, next) => void resume.put(req, res, next),
  );
  apiRouter.get('/prompts', (req, res, next) => void prompts.list(req, res, next));
  apiRouter.put('/prompts/:id', (req, res, next) =>
    void prompts.update(req, res, next),
  );
  apiRouter.get('/settings', (req, res, next) =>
    void settings.get(req, res, next),
  );
  apiRouter.get('/telegram/status', (req, res, next) =>
    void telegram.status(req, res, next),
  );
  apiRouter.post('/telegram/connect', (req, res, next) =>
    void telegram.connect(req, res, next),
  );
  apiRouter.delete('/telegram/connect', (req, res, next) =>
    void telegram.disconnect(req, res, next),
  );
  apiRouter.get('/analytics/summary', (req, res, next) =>
    void analytics.summary(req, res, next),
  );
  apiRouter.get('/analytics/applications', (req, res, next) =>
    void analytics.applications(req, res, next),
  );

  const devRouter = Router();
  devRouter.use(requireDevTools);
  if (fetchLimit) {
    devRouter.use(fetchLimit);
  }
  devRouter.post('/providers/:name/run', (req, res, next) =>
    void dev.runProvider(req, res, next),
  );
  devRouter.post('/scheduler/run', (req, res, next) =>
    void dev.runScheduler(req, res, next),
  );
  devRouter.post('/jobs/rescore', (req, res, next) =>
    void dev.rescoreJobs(req, res, next),
  );
  devRouter.post('/telegram/test', (req, res, next) =>
    void dev.testTelegram(req, res, next),
  );
  devRouter.post('/gemini/test', (req, res, next) =>
    void dev.testGemini(req, res, next),
  );
  devRouter.get('/providers/:name/raw', (req, res, next) =>
    void dev.rawProvider(req, res, next),
  );
  devRouter.get('/jobs/:id/normalized', (req, res, next) =>
    void dev.normalizedJob(req, res, next),
  );
  devRouter.get('/jobs/:id/rules', (req, res, next) =>
    void dev.ruleEvaluation(req, res, next),
  );
  devRouter.get('/jobs/:id/ai', (req, res, next) =>
    void dev.aiOutput(req, res, next),
  );
  devRouter.post('/db/clear', (req, res, next) => void dev.clearDb(req, res, next));
  devRouter.post('/logs/clear', (req, res, next) =>
    void dev.clearLogs(req, res, next),
  );
  devRouter.get('/logs/export', (req, res, next) =>
    void dev.exportLogs(req, res, next),
  );

  apiRouter.use('/dev', devRouter);

  return apiRouter;
}
