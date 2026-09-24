import type {
  Application,
  ApplicationStatus,
} from '../../domain/entities/Application.js';
import type { ApplicationRepository } from '../../domain/repositories/ApplicationRepository.js';
import { asDate, getFirestore, newId } from './admin.js';
import { toApplication } from './mappers.js';

export class FirestoreApplicationRepository implements ApplicationRepository {
  private db = getFirestore();

  private apps(userId: string) {
    return this.db.collection('users').doc(userId).collection('applications');
  }

  private async jobMeta(
    jobId: string,
  ): Promise<{ title: string; companyName: string; applyUrl: string } | null> {
    const snap = await this.db.collection('jobs').doc(jobId).get();
    if (!snap.exists) {
      return null;
    }
    const data = snap.data() ?? {};
    let companyName = String(data.companyName ?? '');
    if (!companyName && data.companyId) {
      const company = await this.db
        .collection('companies')
        .doc(String(data.companyId))
        .get();
      companyName = String(company.data()?.name ?? data.companyId);
    }
    return {
      title: String(data.title ?? ''),
      companyName,
      applyUrl: String(data.applyUrl ?? ''),
    };
  }

  async findAll(userId: string): Promise<Application[]> {
    const snap = await this.apps(userId).orderBy('updatedAt', 'desc').get();
    const results: Application[] = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      const meta = await this.jobMeta(String(data.jobId ?? ''));
      results.push(toApplication(doc.id, data, meta ?? undefined));
    }
    return results;
  }

  async findByJobId(
    userId: string,
    jobId: string,
  ): Promise<Application | null> {
    const snap = await this.apps(userId)
      .where('jobId', '==', jobId)
      .limit(1)
      .get();
    if (snap.empty) {
      return null;
    }
    const doc = snap.docs[0];
    const meta = await this.jobMeta(jobId);
    return toApplication(doc.id, doc.data(), meta ?? undefined);
  }

  async create(
    userId: string,
    jobId: string,
    status: ApplicationStatus = 'SAVED',
    notes: string | null = null,
  ): Promise<Application> {
    const existing = await this.findByJobId(userId, jobId);
    if (existing) {
      return existing;
    }

    const id = newId();
    const now = new Date();
    const data = {
      jobId,
      status,
      notes,
      appliedAt: status === 'SAVED' ? null : now,
      createdAt: now,
      updatedAt: now,
    };
    await this.apps(userId).doc(id).set(data);
    const meta = await this.jobMeta(jobId);
    return toApplication(id, data, meta ?? undefined);
  }

  async updateStatus(
    userId: string,
    id: string,
    status: ApplicationStatus,
    notes?: string | null,
  ): Promise<Application> {
    const ref = this.apps(userId).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new Error('APPLICATION_NOT_FOUND');
    }
    const existing = snap.data() ?? {};
    let appliedAt = asDate(existing.appliedAt);
    if (status === 'SAVED') {
      appliedAt = null;
    } else if (!appliedAt) {
      appliedAt = new Date();
    }

    const patch: Record<string, unknown> = {
      status,
      appliedAt,
      updatedAt: new Date(),
    };
    if (notes !== undefined) {
      patch.notes = notes;
    }
    await ref.set(patch, { merge: true });
    const updated = await ref.get();
    const data = updated.data() ?? {};
    const meta = await this.jobMeta(String(data.jobId ?? ''));
    return toApplication(id, data, meta ?? undefined);
  }

  async delete(userId: string, id: string): Promise<void> {
    const ref = this.apps(userId).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new Error('APPLICATION_NOT_FOUND');
    }
    await ref.delete();
  }
}
