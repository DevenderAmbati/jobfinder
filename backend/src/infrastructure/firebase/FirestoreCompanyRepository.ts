import type { Company } from '../../domain/entities/Company.js';
import type {
  CompanyCreateInput,
  CompanyRepository,
  CompanyUpdateInput,
} from '../../domain/repositories/CompanyRepository.js';
import { FALLBACK_CRON_EXPRESSION } from '../../shared/config/defaults.js';
import { getFirestore, newId } from './admin.js';
import { toCompany } from './mappers.js';

export class FirestoreCompanyRepository implements CompanyRepository {
  private db = getFirestore();

  async findAll(): Promise<Company[]> {
    const snap = await this.db.collection('companies').orderBy('name').get();
    return snap.docs.map((doc) => toCompany(doc.id, doc.data()));
  }

  async findById(id: string): Promise<Company | null> {
    const snap = await this.db.collection('companies').doc(id).get();
    if (!snap.exists) {
      return null;
    }
    return toCompany(snap.id, snap.data() ?? {});
  }

  async findDueForRun(_now: Date): Promise<Company[]> {
    const snap = await this.db
      .collection('companies')
      .where('enabled', '==', true)
      .get();
    return snap.docs
      .map((doc) => toCompany(doc.id, doc.data()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(input: CompanyCreateInput): Promise<Company> {
    const id = newId();
    const now = new Date();
    const data = {
      name: input.name,
      provider: input.provider,
      careerUrl: input.careerUrl,
      enabled: input.enabled ?? true,
      frequency: input.frequency ?? FALLBACK_CRON_EXPRESSION,
      lastRun: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.collection('companies').doc(id).set(data);
    return toCompany(id, data);
  }

  async update(id: string, input: CompanyUpdateInput): Promise<Company> {
    const ref = this.db.collection('companies').doc(id);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.provider !== undefined) patch.provider = input.provider;
    if (input.careerUrl !== undefined) patch.careerUrl = input.careerUrl;
    if (input.enabled !== undefined) patch.enabled = input.enabled;
    if (input.frequency !== undefined) patch.frequency = input.frequency;
    await ref.set(patch, { merge: true });
    const snap = await ref.get();
    return toCompany(id, snap.data() ?? {});
  }

  async updateLastRun(id: string, lastRun: Date): Promise<void> {
    await this.db.collection('companies').doc(id).set(
      { lastRun, updatedAt: new Date() },
      { merge: true },
    );
  }
}
