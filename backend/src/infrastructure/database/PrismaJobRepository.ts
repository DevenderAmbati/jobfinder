import type { Job } from '../../domain/entities/Job.js';
import type { MatchResult } from '../../domain/ports/JobMatcher.js';
import type {
  JobCreateInput,
  JobFacets,
  JobListOptions,
  JobRepository,
} from '../../domain/repositories/JobRepository.js';
import { prisma } from './prismaClient.js';
import { toJob } from './mappers.js';

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

/**
 * `scoreMin` and `scored` both constrain matchScore, so they are resolved
 * together — spreading them separately would let one silently overwrite the
 * other. `scored: false` wins over `scoreMin`, since an unscored job has no
 * score to compare against.
 */
function matchScoreFilter(
  options: JobListOptions | undefined,
): { matchScore?: { gte: number } | { not: null } | null } {
  if (options?.scored === false) {
    return { matchScore: null };
  }
  if (typeof options?.scoreMin === 'number') {
    return { matchScore: { gte: options.scoreMin } };
  }
  if (options?.scored === true) {
    return { matchScore: { not: null } };
  }
  return {};
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

export class PrismaJobRepository implements JobRepository {
  async existsByDedupHash(hash: string): Promise<boolean> {
    const count = await prisma.job.count({ where: { dedupHash: hash } });
    return count > 0;
  }

  async create(input: JobCreateInput): Promise<Job> {
    const row = await prisma.job.create({
      data: {
        companyId: input.companyId,
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
      },
      include: { company: true },
    });
    return toJob(row, row.company.name);
  }

  async saveMatchResult(jobId: string, match: MatchResult): Promise<void> {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        matchScore: match.score,
        matchReasons: JSON.stringify(match.reasons),
        missingSkills: JSON.stringify(match.missingSkills),
        interviewDifficulty: match.interviewDifficulty,
        salaryEstimate: match.salaryEstimate,
        recommendation: match.recommendation,
        matchSource: match.source,
      },
    });
  }

  async clearMatchResult(jobId: string): Promise<void> {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        matchScore: null,
        matchReasons: null,
        missingSkills: null,
        interviewDifficulty: null,
        salaryEstimate: null,
        recommendation: null,
        matchSource: null,
      },
    });
  }

  async findById(id: string): Promise<Job | null> {
    const row = await prisma.job.findUnique({
      where: { id },
      include: { company: true },
    });
    return row ? toJob(row, row.company.name) : null;
  }

  async findMany(options?: JobListOptions): Promise<Job[]> {
    const search = options?.search?.trim();
    const role = options?.role?.trim();
    const location = options?.location?.trim();
    const skills = options?.skills?.trim();
    const posted = options?.postedWithin
      ? postedWindowBounds(options.postedWithin)
      : null;

    const rows = await prisma.job.findMany({
      where: {
        ...(options?.companyId ? { companyId: options.companyId } : {}),
        ...(options?.provider ? { provider: options.provider } : {}),
        ...matchScoreFilter(options),
        ...(role ? { title: { contains: role } } : {}),
        ...(location ? { location: { contains: location } } : {}),
        ...(skills ? { skills: { contains: skills } } : {}),
        ...(posted
          ? {
              OR: [
                {
                  postedDate: {
                    ...(posted.gte ? { gte: posted.gte } : {}),
                    ...(posted.lt ? { lt: posted.lt } : {}),
                  },
                },
                {
                  AND: [
                    { postedDate: null },
                    {
                      createdAt: {
                        ...(posted.gte ? { gte: posted.gte } : {}),
                        ...(posted.lt ? { lt: posted.lt } : {}),
                      },
                    },
                  ],
                },
              ],
            }
          : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { location: { contains: search } },
                { skills: { contains: search } },
                { experience: { contains: search } },
                { company: { name: { contains: search } } },
              ],
            }
          : {}),
      },
      include: { company: true },
      // Recency is the primary feed order. Jobs without a provider posting
      // date naturally sort after dated jobs; createdAt keeps those stable and
      // newest-first, while score only breaks otherwise identical timestamps.
      orderBy: [
        { postedDate: 'desc' },
        { createdAt: 'desc' },
        { matchScore: 'desc' },
      ],
      take: options?.limit ?? 100,
    });
    return rows.map((row) => toJob(row, row.company.name));
  }

  async findFacets(): Promise<JobFacets> {
    const [locationRows, titleRows, skillRows, rule] = await Promise.all([
      prisma.job.findMany({
        where: { location: { not: null } },
        select: { location: true },
        distinct: ['location'],
        take: 200,
      }),
      prisma.job.findMany({
        select: { title: true },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
      prisma.job.findMany({
        where: { skills: { not: null } },
        select: { skills: true },
        take: 300,
      }),
      prisma.rule.findFirst({ where: { enabled: true } }),
    ]);

    const roleTokens = new Set<string>();
    for (const row of titleRows) {
      const head = row.title.split(/[|/·•\-–—]/)[0]?.trim();
      if (head && head.length >= 3 && head.length <= 60) {
        roleTokens.add(head);
      }
    }
    for (const role of (rule?.roles ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)) {
      roleTokens.add(role);
    }

    const skillTokens = new Set<string>();
    for (const row of skillRows) {
      for (const skill of splitSkills(row.skills)) {
        skillTokens.add(skill);
      }
    }
    for (const skill of (rule?.skills ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)) {
      skillTokens.add(skill);
    }

    return {
      locations: uniqueSorted(locationRows.map((row) => row.location)),
      roles: [...roleTokens].sort((a, b) => a.localeCompare(b)).slice(0, 80),
      skills: [...skillTokens].sort((a, b) => a.localeCompare(b)).slice(0, 80),
    };
  }
}
