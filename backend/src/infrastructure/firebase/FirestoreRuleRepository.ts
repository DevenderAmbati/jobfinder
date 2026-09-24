import type { Rule } from '../../domain/entities/Rule.js';
import type {
  RuleRepository,
  RuleUpsertInput,
} from '../../domain/repositories/RuleRepository.js';
import { serializeStringList } from '../../shared/utils/stringList.js';
import { getFirestore } from './admin.js';
import { toRule } from './mappers.js';

export class FirestoreRuleRepository implements RuleRepository {
  private db = getFirestore();

  private ref(userId: string) {
    return this.db.collection('users').doc(userId).collection('rule').doc('current');
  }

  async findByUserId(userId: string): Promise<Rule | null> {
    const snap = await this.ref(userId).get();
    if (!snap.exists) {
      return null;
    }
    return toRule(snap.id, userId, snap.data() ?? {});
  }

  async upsertForUser(userId: string, input: RuleUpsertInput): Promise<Rule> {
    const ref = this.ref(userId);
    const existing = await ref.get();
    const now = new Date();
    const data: Record<string, unknown> = {
      userId,
      updatedAt: now,
    };

    if (input.experience !== undefined) {
      data.experience = input.experience;
    }
    if (input.skills !== undefined) {
      data.skills = serializeStringList(input.skills);
    }
    if (input.roles !== undefined) {
      data.roles = serializeStringList(input.roles);
    }
    if (input.minMatchScore !== undefined) {
      data.minMatchScore = input.minMatchScore;
    }

    if (!existing.exists) {
      await ref.set({
        userId,
        experience: input.experience ?? null,
        skills: serializeStringList(input.skills) ?? null,
        roles: serializeStringList(input.roles) ?? null,
        minMatchScore: input.minMatchScore ?? 50,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await ref.set(data, { merge: true });
    }

    const snap = await ref.get();
    return toRule(snap.id, userId, snap.data() ?? {});
  }
}
