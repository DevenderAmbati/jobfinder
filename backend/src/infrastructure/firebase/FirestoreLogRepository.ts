import type { Firestore } from 'firebase-admin/firestore';
import type {
  NotificationLog,
  ProviderLog,
} from '../../domain/entities/Logs.js';
import type {
  LogRepository,
  NotificationLogCreateInput,
  ProviderLogCreateInput,
} from '../../domain/repositories/LogRepository.js';
import { getFirestore, newId } from './admin.js';
import { toNotificationLog, toProviderLog } from './mappers.js';

const LOG_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class FirestoreLogRepository implements LogRepository {
  private db = getFirestore();

  async createProviderLog(input: ProviderLogCreateInput): Promise<ProviderLog> {
    const id = newId();
    const now = new Date();
    const data = {
      companyId: input.companyId ?? null,
      provider: input.provider,
      startTime: input.startTime,
      endTime: input.endTime ?? null,
      jobsFound: input.jobsFound ?? 0,
      jobsAdded: input.jobsAdded ?? 0,
      durationMs: input.durationMs ?? null,
      error: input.error ?? null,
      createdAt: now,
      expireAt: new Date(now.getTime() + LOG_TTL_MS),
    };
    await this.db.collection('providerLogs').doc(id).set(data);
    return toProviderLog(id, data);
  }

  async listProviderLogs(limit = 100): Promise<ProviderLog[]> {
    const snap = await this.db
      .collection('providerLogs')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((doc) => toProviderLog(doc.id, doc.data()));
  }

  async createNotificationLog(
    input: NotificationLogCreateInput,
  ): Promise<NotificationLog> {
    const id = newId();
    const now = new Date();
    const data = {
      jobId: input.jobId,
      userId: input.userId ?? null,
      channel: input.channel ?? 'telegram',
      success: input.success,
      payload: input.payload ?? null,
      error: input.error ?? null,
      createdAt: now,
      expireAt: new Date(now.getTime() + LOG_TTL_MS),
    };
    await this.db.collection('notificationLogs').doc(id).set(data);
    return toNotificationLog(id, data);
  }

  async hasSuccessfulNotification(
    jobId: string,
    channel = 'telegram',
    userId?: string | null,
  ): Promise<boolean> {
    let query = this.db
      .collection('notificationLogs')
      .where('jobId', '==', jobId)
      .where('channel', '==', channel)
      .where('success', '==', true)
      .limit(1);

    if (userId) {
      query = this.db
        .collection('notificationLogs')
        .where('jobId', '==', jobId)
        .where('channel', '==', channel)
        .where('success', '==', true)
        .where('userId', '==', userId)
        .limit(1);
    }

    const snap = await query.get();
    return !snap.empty;
  }

  async listNotificationLogs(limit = 100): Promise<NotificationLog[]> {
    const snap = await this.db
      .collection('notificationLogs')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((doc) => toNotificationLog(doc.id, doc.data()));
  }

  async deleteAllProviderLogs(): Promise<number> {
    return deleteCollection(this.db, 'providerLogs');
  }

  async deleteAllNotificationLogs(): Promise<number> {
    return deleteCollection(this.db, 'notificationLogs');
  }
}

async function deleteCollection(db: Firestore, name: string): Promise<number> {
  let deleted = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await db.collection(name).limit(400).get();
    if (snap.empty) {
      break;
    }
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      deleted += 1;
    }
    await batch.commit();
  }
  return deleted;
}
