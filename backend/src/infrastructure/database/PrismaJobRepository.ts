import type { Job } from '../../domain/entities/Job.js';
import type { MatchResult } from '../../domain/ports/JobMatcher.js';
import type {
  JobCreateInput,
  JobFacets,
  JobListOptions,
  JobRepository,
} from '../../domain/repositories/JobRepository.js';
import { prisma } from './prismaClient.js';
import { toJob, toJobWithMatch } from './mappers.js';

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

function matchRelationFilter(
  userId: string,
  options: JobListOptions,
):
  | { matches: { some: { userId: string; matchScore?: { gte: number } } } }
  | { matches: { none: { userId: string } } }
  | Record<string, never> {
  if (options.scored === false) {
    return { matches: { none: { userId } } };
  }
  if (typeof options.scoreMin === 'number') {
    return {
      matches: {
        some: { userId, matchScore: { gte: options.scoreMin } },
      },
    };
  }
  if (options.scored === true) {
    return { matches: { some: { userId } } };
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

type MatchRow = {
  matchScore: number;
  matchReasons: string | null;
  missingSkills: string | null;
  interviewDifficulty: string | null;
  salaryEstimate: string | null;
  recommendation: string | null;
  matchSource: 'GEMINI' | 'KEYWORD' | null;
};

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

  async saveMatchResult(
    jobId: string,
    match: MatchResult,
    userId: string,
  ): Promise<void> {
    await prisma.jobMatch.upsert({
      where: { userId_jobId: { userId, jobId } },
      create: {
        userId,
        jobId,
        matchScore: match.score,
        matchReasons: JSON.stringify(match.reasons),
        missingSkills: JSON.stringify(match.missingSkills),
        interviewDifficulty: match.interviewDifficulty,
        salaryEstimate: match.salaryEstimate,
        recommendation: match.recommendation,
        matchSource: match.source,
      },
      update: {
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

  async clearMatchResult(jobId: string, userId: string): Promise<void> {
    await prisma.jobMatch.deleteMany({ where: { jobId, userId } });
  }

  async findById(id: string, userId?: string): Promise<Job | null> {
    const row = await prisma.job.findUnique({
      where: { id },
      include: {
        company: true,
        ...(userId
          ? { matches: { where: { userId }, take: 1 } }
          : {}),
      },
    });
    if (!row) {
      return null;
    }
    const match = 'matches' in row ? (row.matches as MatchRow[])[0] : undefined;
    return toJobWithMatch(row, row.company.name, match);
  }

  async findMany(options: JobListOptions): Promise<Job[]> {
    const search = options.search?.trim();
    const location = options.location?.trim();
    const skills = options.skills?.trim();
    const posted = options.postedWithin
      ? postedWindowBounds(options.postedWithin)
      : null;
    const userId = options.userId;
    const companyIds = [
      ...(options.companyIds ?? []),
      ...(options.companyId ? [options.companyId] : []),
    ].filter(Boolean);
    const roles = [
      ...(options.roles ?? []),
      ...(options.role ? [options.role] : []),
    ]
      .map((role) => role.trim())
      .filter(Boolean);

    // Filters that apply to Job rows only (no match relation). Reused by the
    // score-sorted path, which queries from the JobMatch side instead.
    const andFilters: object[] = [];

    if (companyIds.length === 1) {
      andFilters.push({ companyId: companyIds[0] });
    } else if (companyIds.length > 1) {
      andFilters.push({ companyId: { in: companyIds } });
    }

    if (options.provider) {
      andFilters.push({ provider: options.provider });
    }

    if (roles.length === 1) {
      andFilters.push({
        title: { contains: roles[0], mode: 'insensitive' },
      });
    } else if (roles.length > 1) {
      andFilters.push({
        OR: roles.map((roleName) => ({
          title: { contains: roleName, mode: 'insensitive' },
        })),
      });
    }

    if (location) {
      andFilters.push({
        location: { contains: location, mode: 'insensitive' },
      });
    }

    if (skills) {
      andFilters.push({
        skills: { contains: skills, mode: 'insensitive' },
      });
    }

    if (posted) {
      andFilters.push({
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
      });
    }

    if (search) {
      andFilters.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { location: { contains: search, mode: 'insensitive' } },
          { skills: { contains: search, mode: 'insensitive' } },
          { experience: { contains: search, mode: 'insensitive' } },
          {
            company: {
              name: { contains: search, mode: 'insensitive' },
            },
          },
        ],
      });
    }

    const take = options.forInternalWalk
      ? Math.max(1, options.limit ?? 100)
      : Math.min(Math.max(1, options.limit ?? 100), 2_500);

    const jobWhere = andFilters.length > 0 ? { AND: andFilters } : {};

    // Score-sorted path: query from the JobMatch side so the row cap keeps the
    // top matches (Prisma can't orderBy a to-many relation scalar on Job).
    if (options.sort === 'match-desc' || options.sort === 'match-asc') {
      const direction = options.sort === 'match-desc' ? 'desc' : 'asc';
      const matchRows = await prisma.jobMatch.findMany({
        where: {
          userId,
          ...(typeof options.scoreMin === 'number'
            ? { matchScore: { gte: options.scoreMin } }
            : {}),
          job: jobWhere,
        },
        select: {
          matchScore: true,
          matchReasons: true,
          missingSkills: true,
          interviewDifficulty: true,
          salaryEstimate: true,
          recommendation: true,
          matchSource: true,
          job: {
            select: {
              id: true,
              companyId: true,
              title: true,
              location: true,
              description: Boolean(options.includeDescription),
              experience: true,
              skills: true,
              salary: true,
              postedDate: true,
              applyUrl: true,
              provider: true,
              dedupHash: true,
              createdAt: true,
              updatedAt: true,
              company: { select: { name: true } },
            },
          },
        },
        orderBy: [{ matchScore: direction }, { job: { postedDate: 'desc' } }],
        take,
        ...(typeof options.offset === 'number' && options.offset > 0
          ? { skip: options.offset }
          : {}),
      });
      return matchRows.map((match) =>
        toJobWithMatch(
          {
            id: match.job.id,
            companyId: match.job.companyId,
            title: match.job.title,
            location: match.job.location,
            description: match.job.description ?? null,
            experience: match.job.experience,
            skills: match.job.skills,
            salary: match.job.salary,
            postedDate: match.job.postedDate,
            applyUrl: match.job.applyUrl,
            provider: match.job.provider,
            dedupHash: match.job.dedupHash,
            createdAt: match.job.createdAt,
            updatedAt: match.job.updatedAt,
          },
          match.job.company.name,
          match,
        ),
      );
    }

    // Default path: newest first. Match relation filter (scored / scoreMin)
    // applies here too.
    const matchFilter = matchRelationFilter(userId, options);
    const defaultWhere =
      Object.keys(matchFilter).length > 0
        ? { AND: [...andFilters, matchFilter] }
        : jobWhere;

    const rows = await prisma.job.findMany({
      where: defaultWhere,
      select: {
        id: true,
        companyId: true,
        title: true,
        location: true,
        description: Boolean(options.includeDescription),
        experience: true,
        skills: true,
        salary: true,
        postedDate: true,
        applyUrl: true,
        provider: true,
        dedupHash: true,
        createdAt: true,
        updatedAt: true,
        company: { select: { name: true } },
        matches: {
          where: { userId },
          take: 1,
          select: {
            matchScore: true,
            matchReasons: true,
            missingSkills: true,
            interviewDifficulty: true,
            salaryEstimate: true,
            recommendation: true,
            matchSource: true,
          },
        },
      },
      orderBy: [{ postedDate: 'desc' }, { createdAt: 'desc' }],
      take,
      ...(typeof options.offset === 'number' && options.offset > 0
        ? { skip: options.offset }
        : {}),
    });
    return rows.map((row) =>
      toJobWithMatch(
        {
          id: row.id,
          companyId: row.companyId,
          title: row.title,
          location: row.location,
          description: row.description ?? null,
          experience: row.experience,
          skills: row.skills,
          salary: row.salary,
          postedDate: row.postedDate,
          applyUrl: row.applyUrl,
          provider: row.provider,
          dedupHash: row.dedupHash,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
        row.company.name,
        row.matches[0],
      ),
    );
  }

  async findFacets(): Promise<JobFacets> {
    const [locationRows, titleRows, skillRows] = await Promise.all([
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
    ]);

    const roleTokens = new Set<string>();
    for (const row of titleRows) {
      const head = row.title.split(/[|/·•\-–—]/)[0]?.trim();
      if (head && head.length >= 3 && head.length <= 60) {
        roleTokens.add(head);
      }
    }

    const skillTokens = new Set<string>();
    for (const row of skillRows) {
      for (const skill of splitSkills(row.skills)) {
        skillTokens.add(skill);
      }
    }

    return {
      locations: uniqueSorted(locationRows.map((row) => row.location)),
      roles: [...roleTokens].sort((a, b) => a.localeCompare(b)).slice(0, 80),
      skills: [...skillTokens].sort((a, b) => a.localeCompare(b)).slice(0, 80),
    };
  }
}
