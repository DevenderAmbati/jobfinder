/**
 * Seed Firestore: prompt templates, provider health, TARGET_COMPANIES catalog.
 * Fresh project — does not migrate Postgres data.
 *
 * Usage: npm run seed:firestore
 * Requires FIREBASE_PROJECT_ID + GOOGLE_APPLICATION_CREDENTIALS (or ADC).
 */
import 'dotenv/config';
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
import { initFirebaseAdmin, getFirestore } from '../src/infrastructure/firebase/admin.js';

async function seed(): Promise<void> {
  initFirebaseAdmin(process.env.FIREBASE_PROJECT_ID);
  const db = getFirestore();

  const prompts = await db
    .collection('promptTemplates')
    .where('name', '==', JOB_MATCH_PROMPT_NAME)
    .where('version', '==', 1)
    .limit(1)
    .get();

  if (prompts.empty) {
    await db.collection('promptTemplates').add({
      name: JOB_MATCH_PROMPT_NAME,
      version: 1,
      content: DEFAULT_JOB_MATCH_PROMPT,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    // eslint-disable-next-line no-console
    console.log('[seed] Created default job-match prompt template');
  }

  for (const provider of DEFAULT_PROVIDERS) {
    await db.collection('providerHealth').doc(provider).set(
      {
        provider,
        status: 'IDLE',
        lastRun: null,
        lastSuccess: null,
        averageExecutionTime: 0,
        failureCount: 0,
        lastError: null,
        updatedAt: new Date(),
      },
      { merge: true },
    );
  }

  for (const name of DEMO_COMPANIES_TO_REMOVE) {
    const snap = await db
      .collection('companies')
      .where('name', '==', name)
      .limit(1)
      .get();
    for (const doc of snap.docs) {
      await doc.ref.delete();
      // eslint-disable-next-line no-console
      console.log(`[seed] Removed demo company ${name}`);
    }
  }

  let created = 0;
  let updated = 0;

  for (const target of TARGET_COMPANIES) {
    const existing = await db
      .collection('companies')
      .where('name', '==', target.name)
      .limit(1)
      .get();

    const payload = {
      name: target.name,
      provider: target.provider,
      careerUrl: target.careerUrl,
      enabled: target.enabled,
      frequency: target.frequency ?? FALLBACK_CRON_EXPRESSION,
      updatedAt: new Date(),
    };

    if (!existing.empty) {
      await existing.docs[0].ref.set(payload, { merge: true });
      updated += 1;
      continue;
    }

    await db.collection('companies').add({
      ...payload,
      lastRun: null,
      createdAt: new Date(),
    });
    created += 1;
  }

  await db.collection('meta').doc('facets').set(
    {
      locations: [],
      roles: [],
      skills: [],
      updatedAt: new Date(),
    },
    { merge: true },
  );

  // eslint-disable-next-line no-console
  console.log(
    `[seed] Target companies ready — created ${created}, updated ${updated}, unsupported ${UNSUPPORTED_TARGET_COMPANIES.length}.`,
  );
}

seed().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[seed] Failed', error);
  process.exitCode = 1;
});
