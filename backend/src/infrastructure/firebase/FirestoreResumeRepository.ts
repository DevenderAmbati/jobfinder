import type { Resume } from '../../domain/entities/Resume.js';
import type {
  ResumeRepository,
  ResumeUpsertInput,
} from '../../domain/repositories/ResumeRepository.js';
import { getFirestore } from './admin.js';
import { toResume } from './mappers.js';

export class FirestoreResumeRepository implements ResumeRepository {
  private db = getFirestore();

  private ref(userId: string) {
    return this.db
      .collection('users')
      .doc(userId)
      .collection('resume')
      .doc('current');
  }

  async findCurrent(userId: string): Promise<Resume | null> {
    const snap = await this.ref(userId).get();
    if (!snap.exists) {
      return null;
    }
    return toResume(snap.id, snap.data() ?? {});
  }

  async upsertCurrent(
    userId: string,
    input: ResumeUpsertInput,
  ): Promise<Resume> {
    const ref = this.ref(userId);
    const now = new Date();
    const data = {
      userId,
      originalPdfPath: input.originalPdfPath ?? null,
      extractedText: input.extractedText,
      markdown: input.markdown,
      embedding: input.embedding ?? null,
      updatedAt: now,
    };
    const existing = await ref.get();
    if (!existing.exists) {
      await ref.set({ ...data, createdAt: now });
    } else {
      await ref.set(data, { merge: true });
    }
    const snap = await ref.get();
    return toResume(snap.id, snap.data() ?? {});
  }
}
