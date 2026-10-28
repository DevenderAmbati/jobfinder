import type { Firestore, QuerySnapshot } from 'firebase-admin/firestore';
import type { Job } from '../../domain/entities/Job.js';
import type { MatchResult } from '../../domain/ports/JobMatcher.js';
import type {
  JobCreateInput,
  JobFacets,
  JobListOptions,
  JobRepository,
} from '../../domain/repositories/JobRepository.js';
import { asDate, getFirestore, newId } from './admin.js';
import { toJob, toJobWithMatch, type MatchDoc } from './mappers.js';

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function postedWindowBounds(
  within: NonNullable<JobListOptions['postedWithin']>,
): { gte?: Date; lt?: Date } {
  const today = startOfUtcDay(new Date());
  const dayMs = 24 * 60 * 60 * 1000;

  switch (within) {
    case 'today':
      return { gte: today };
    case 'yesterday':
      return {
        gte: new Date(today.getTime() - dayMs),
        lt: today,
      };
    case 'week':
      return { gte: new Date(today.getTime() - 7 * dayMs) };
    case 'month':
      return { gte: new Date(today.getTime() - 30 * dayMs) };
    default:
      return {};
  }
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      set.add(trimmed);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function splitSkills(raw: string | null | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(/[,|/·•]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && part.length <= 40);
}

function containsInsensitive(
  haystack: string | null | undefined,
  needle: string,
): boolean {
  if (!haystack) {
    return false;
  }
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export class FirestoreJobRepository implements JobRepository {
  private db = getFirestore();

  async existsByDedupHash(hash: string): Promise<boolean> {
    const snap = await this.db.collection('jobDedup').doc(hash).get();
    return snap.exists;
  }

  async create(input: JobCreateInput): Promise<Job> {
    const id = newId();
    const now = new Date();
    const companyName = input.company;
    const data = {
      companyId: input.companyId,
      companyName,
      title: input.title,
      location: input.location,
      description: input.description,
      experience: input.experience,
      skills: input.skills,
      salary: input.salary,
      postedDate: input.postedDate,
      applyUrl: input.applyUrl,
      provider: input.provider,
      dedupHash: input.dedupHash,
      createdAt: now,
      updatedAt: now,
    };

    const jobRef = this.db.collection('jobs').doc(id);
    const dedupRef = this.db.collection('jobDedup').doc(input.dedupHash);

    await this.db.runTransaction(async (tx) => {
      const existing = await tx.get(dedupRef);
      if (existing.exists) {
        throw new Error('DEDUP_HASH_EXISTS');
      }
      tx.set(dedupRef, { jobId: id, createdAt: now });
      tx.set(jobRef, data);
    });

    void this.refreshFacets().catch(() => undefined);
    return toJob(id, data, companyName);
  }

  async saveMatchResult(
    jobId: string,
    match: MatchResult,
    userId: string,
  ): Promise<void> {
    const now = new Date();
    await this.db
      .collection('users')
      .doc(userId)
      .collection('matches')
      .doc(jobId)
      .set(
        {
          jobId,
          matchScore: match.score,
          matchReasons: JSON.stringify(match.reasons),
          missingSkills: JSON.stringify(match.missingSkills),
          interviewDifficulty: match.interviewDifficulty,
          salaryEstimate: match.salaryEstimate,
          recommendation: match.recommendation,
          matchSource: match.source,
          updatedAt: now,
          createdAt: now,
        },
        { merge: true },
      );
  }

  async clearMatchResult(jobId: string, userId: string): Promise<void> {
    await this.db
      .collection('users')
      .doc(userId)
      .collection('matches')
      .doc(jobId)
      .delete()
      .catch(() => undefined);
  }

  async findById(id: string, userId?: string): Promise<Job | null> {
    const snap = await this.db.collection('jobs').doc(id).get();
    if (!snap.exists) {
      return null;
    }
    const data = snap.data() ?? {};
    let match: MatchDoc | undefined;
    if (userId) {
      const matchSnap = await this.db
        .collection('users')
        .doc(userId)
        .collection('matches')
        .doc(id)
        .get();
      if (matchSnap.exists) {
        match = matchSnap.data() as MatchDoc;
      }
    }
    return toJobWithMatch(
      id,
      data,
      String(data.companyName ?? ''),
      match,
    );
  }

  async findMany(options: JobListOptions): Promise<Job[]> {
    const take = options.forInternalWalk
      ? Math.max(1, options.limit ?? 100)
      : Math.min(Math.max(1, options.limit ?? 100), 2_500);
    const offset = options.offset ?? 0;
    const userId = options.userId;

    const matchesSnap = await this.db
      .collection('users')
      .doc(userId)
      .collection('matches')
      .get();
    const matchByJob = new Map<string, MatchDoc>();
    for (const doc of matchesSnap.docs) {
      matchByJob.set(doc.id, doc.data() as MatchDoc);
    }

    // Load jobs — prefer company/provider filters when present to reduce reads.
    let jobsSnap: QuerySnapshot;
    const companyIds = [
      ...(options.companyIds ?? []),
      ...(options.companyId ? [options.companyId] : []),
    ].filter(Boolean);

    if (companyIds.length === 1) {
      jobsSnap = await this.db
        .collection('jobs')
        .where('companyId', '==', companyIds[0])
        .get();
    } else if (options.provider) {
      jobsSnap = await this.db
        .collection('jobs')
        .where('provider', '==', options.provider)
        .get();
    } else {
      jobsSnap = await this.db.collection('jobs').get();
    }

    const roles = [
      ...(options.roles ?? []),
      ...(options.role ? [options.role] : []),
    ]
      .map((role) => role.trim())
      .filter(Boolean);
    const search = options.search?.trim();
    const locations = [
      ...(options.locations ?? []),
      ...(options.location ? [options.location] : []),
    ]
      .map((value) => value.trim())
      .filter(Boolean);
    const skills = options.skills?.trim();
    const posted = options.postedWithin
      ? postedWindowBounds(options.postedWithin)
      : null;

    type Row = { id: string; data: Record<string, unknown>; match?: MatchDoc };
    let rows: Row[] = [];

    for (const doc of jobsSnap.docs) {
      const data = doc.data();
      if (companyIds.length > 1 && !companyIds.includes(String(data.companyId))) {
        continue;
      }
      if (options.provider && data.provider !== options.provider) {
        continue;
      }
      if (companyIds.length === 1 && data.companyId !== companyIds[0]) {
        continue;
      }

      if (options.createdFrom || options.createdTo) {
        const createdAt = asDate(data.createdAt);
        if (!createdAt) continue;
        if (options.createdFrom && createdAt < options.createdFrom) continue;
        if (options.createdTo && createdAt > options.createdTo) continue;
      }

      if (roles.length > 0) {
        const title = String(data.title ?? '');
        const hit = roles.some((role) => containsInsensitive(title, role));
        if (!hit) continue;
      }

      if (
        locations.length > 0 &&
        !locations.some((value) =>
          containsInsensitive(String(data.location ?? ''), value),
        )
      ) {
        continue;
      }
      if (skills && !containsInsensitive(String(data.skills ?? ''), skills)) {
        continue;
      }

      if (posted) {
        const postedDate = asDate(data.postedDate) ?? asDate(data.createdAt);
        if (!postedDate) continue;
        if (posted.gte && postedDate < posted.gte) continue;
        if (posted.lt && postedDate >= posted.lt) continue;
      }

      if (search) {
        const hay = [
          data.title,
          data.location,
          data.skills,
          data.experience,
          data.companyName,
        ]
          .map((v) => String(v ?? ''))
          .join(' ');
        if (!containsInsensitive(hay, search)) continue;
      }

      const match = matchByJob.get(doc.id);
      if (options.scored === false && match) continue;
      if (options.scored === true && !match) continue;
      if (
        typeof options.scoreMin === 'number' &&
        (!match || match.matchScore < options.scoreMin)
      ) {
        continue;
      }
      if (
        typeof options.scoreAbove === 'number' &&
        (!match || !(match.matchScore > options.scoreAbove))
      ) {
        continue;
      }

      rows.push({ id: doc.id, data, match });
    }

    if (options.sort === 'match-desc' || options.sort === 'match-asc') {
      rows = rows.filter((row) => row.match);
      const dir = options.sort === 'match-desc' ? -1 : 1;
      rows.sort((a, b) => {
        const scoreDiff =
          ((a.match?.matchScore ?? 0) - (b.match?.matchScore ?? 0)) * dir;
        if (scoreDiff !== 0) return scoreDiff;
        const aDate =
          asDate(a.data.postedDate)?.getTime() ??
          asDate(a.data.createdAt)?.getTime() ??
          0;
        const bDate =
          asDate(b.data.postedDate)?.getTime() ??
          asDate(b.data.createdAt)?.getTime() ??
          0;
        return bDate - aDate;
      });
    } else if (options.sort === 'created') {
      rows.sort((a, b) => {
        const aDate = asDate(a.data.createdAt)?.getTime() ?? 0;
        const bDate = asDate(b.data.createdAt)?.getTime() ?? 0;
        return bDate - aDate;
      });
    } else {
      rows.sort((a, b) => {
        const aDate =
          asDate(a.data.postedDate)?.getTime() ??
          asDate(a.data.createdAt)?.getTime() ??
          0;
        const bDate =
          asDate(b.data.postedDate)?.getTime() ??
          asDate(b.data.createdAt)?.getTime() ??
          0;
        return bDate - aDate;
      });
    }

    const sliced = rows.slice(offset, offset + take);
    return sliced.map((row) => {
      const data = options.includeDescription
        ? row.data
        : { ...row.data, description: null };
      return toJobWithMatch(
        row.id,
        data,
        String(row.data.companyName ?? ''),
        row.match,
      );
    });
  }

  async findFacets(): Promise<JobFacets> {
    const meta = await this.db.collection('meta').doc('facets').get();
    if (meta.exists) {
      const data = meta.data() ?? {};
      return {
        locations: Array.isArray(data.locations)
          ? (data.locations as string[])
          : [],
        roles: Array.isArray(data.roles) ? (data.roles as string[]) : [],
        skills: Array.isArray(data.skills) ? (data.skills as string[]) : [],
      };
    }
    return this.computeAndStoreFacets();
  }

  async refreshFacets(): Promise<JobFacets> {
    return this.computeAndStoreFacets();
  }

  private async computeAndStoreFacets(): Promise<JobFacets> {
    const snap = await this.db.collection('jobs').limit(500).get();
    const locations: string[] = [];
    const roleTokens = new Set<string>();
    const skillTokens = new Set<string>();

    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.location) locations.push(String(data.location));
      const head = String(data.title ?? '').split(/[|/·•\-–—]/)[0]?.trim();
      if (head && head.length >= 3 && head.length <= 60) {
        roleTokens.add(head);
      }
      for (const skill of splitSkills(
        data.skills as string | null | undefined,
      )) {
        skillTokens.add(skill);
      }
    }

    const facets: JobFacets = {
      locations: uniqueSorted(locations).slice(0, 200),
      roles: [...roleTokens].sort((a, b) => a.localeCompare(b)).slice(0, 80),
      skills: [...skillTokens].sort((a, b) => a.localeCompare(b)).slice(0, 80),
    };

    await this.db.collection('meta').doc('facets').set({
      ...facets,
      updatedAt: new Date(),
    });
    return facets;
  }

  async countJobs(): Promise<number> {
    const snap = await this.db.collection('jobs').count().get();
    return snap.data().count;
  }

  async deleteAllJobsAndMatches(): Promise<{
    jobs: number;
    matches: number;
    dedup: number;
  }> {
    const matches = await deleteCollectionGroup(this.db, 'matches');
    const jobs = await deleteCollection(this.db, 'jobs');
    const dedup = await deleteCollection(this.db, 'jobDedup');
    await this.db.collection('meta').doc('facets').set({
      locations: [],
      roles: [],
      skills: [],
      updatedAt: new Date(),
    });
    return { jobs, matches, dedup };
  }
}

async function deleteCollection(
  db: Firestore,
  name: string,
): Promise<number> {
  let deleted = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await db.collection(name).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      deleted += 1;
    }
    await batch.commit();
  }
  return deleted;
}

async function deleteCollectionGroup(
  db: Firestore,
  name: string,
): Promise<number> {
  let deleted = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await db.collectionGroup(name).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      deleted += 1;
    }
    await batch.commit();
  }
  return deleted;
}
