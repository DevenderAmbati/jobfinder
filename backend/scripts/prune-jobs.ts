/**
 * Prune old / non-India jobs from Firestore.
 *
 * Usage:
 *   npx tsx scripts/prune-jobs.ts           # dry-run
 *   npx tsx scripts/prune-jobs.ts --execute
 */
import 'dotenv/config';
import { initFirebaseAdmin, getFirestore, asDate } from '../src/infrastructure/firebase/admin.js';
import { isIndiaLocation } from '../src/domain/services/indiaLocation.js';

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
const execute = process.argv.includes('--execute');

async function main(): Promise<void> {
  initFirebaseAdmin(process.env.FIREBASE_PROJECT_ID);
  const db = getFirestore();
  const cutoff = new Date(Date.now() - THREE_MONTHS_MS);

  const snap = await db.collection('jobs').get();
  const toDelete: string[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const posted =
      asDate(data.postedDate) ?? asDate(data.createdAt) ?? new Date(0);
    const location = (data.location as string | null | undefined) ?? null;
    const stale = posted < cutoff;
    const nonIndia = location ? !isIndiaLocation(location) : false;
    if (stale || nonIndia) {
      toDelete.push(doc.id);
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[prune] Candidates: ${toDelete.length} / ${snap.size} (execute=${execute})`,
  );

  if (!execute || toDelete.length === 0) {
    return;
  }

  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 400) {
    const chunk = toDelete.slice(i, i + 400);
    const batch = db.batch();
    for (const id of chunk) {
      const jobRef = db.collection('jobs').doc(id);
      const jobSnap = await jobRef.get();
      const dedup = jobSnap.data()?.dedupHash;
      batch.delete(jobRef);
      if (typeof dedup === 'string' && dedup) {
        batch.delete(db.collection('jobDedup').doc(dedup));
      }
      deleted += 1;
    }
    await batch.commit();
  }

  // eslint-disable-next-line no-console
  console.log(`[prune] Deleted ${deleted} jobs`);
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[prune] Failed', error);
  process.exitCode = 1;
});
