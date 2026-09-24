import type { PromptTemplate } from '../../domain/entities/PromptTemplate.js';
import type { PromptTemplateRepository } from '../../domain/repositories/PromptTemplateRepository.js';
import { getFirestore, newId } from './admin.js';
import { toPromptTemplate } from './mappers.js';

export class FirestorePromptTemplateRepository
  implements PromptTemplateRepository
{
  private db = getFirestore();

  async findEnabledByName(name: string): Promise<PromptTemplate | null> {
    const snap = await this.db
      .collection('promptTemplates')
      .where('name', '==', name)
      .where('enabled', '==', true)
      .orderBy('version', 'desc')
      .limit(1)
      .get();
    if (snap.empty) {
      return null;
    }
    const doc = snap.docs[0];
    return toPromptTemplate(doc.id, doc.data());
  }

  async findAll(): Promise<PromptTemplate[]> {
    const snap = await this.db.collection('promptTemplates').get();
    return snap.docs
      .map((doc) => toPromptTemplate(doc.id, doc.data()))
      .sort((a, b) => {
        const byName = a.name.localeCompare(b.name);
        if (byName !== 0) return byName;
        return b.version - a.version;
      });
  }

  async create(input: {
    name: string;
    version: number;
    content: string;
    enabled?: boolean;
  }): Promise<PromptTemplate> {
    const id = newId();
    const now = new Date();
    const data = {
      name: input.name,
      version: input.version,
      content: input.content,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.collection('promptTemplates').doc(id).set(data);
    return toPromptTemplate(id, data);
  }

  async update(
    id: string,
    input: { content?: string; enabled?: boolean },
  ): Promise<PromptTemplate> {
    const ref = this.db.collection('promptTemplates').doc(id);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.content !== undefined) patch.content = input.content;
    if (input.enabled !== undefined) patch.enabled = input.enabled;
    await ref.set(patch, { merge: true });
    const snap = await ref.get();
    return toPromptTemplate(id, snap.data() ?? {});
  }
}
