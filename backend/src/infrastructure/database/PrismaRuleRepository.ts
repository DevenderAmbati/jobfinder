import type { Rule } from '../../domain/entities/Rule.js';
import type {
  RuleRepository,
  RuleUpsertInput,
} from '../../domain/repositories/RuleRepository.js';
import { serializeStringList } from '../../shared/utils/stringList.js';
import { prisma } from './prismaClient.js';
import { toRule } from './mappers.js';

export class PrismaRuleRepository implements RuleRepository {
  async findActive(): Promise<Rule | null> {
    const row = await prisma.rule.findFirst({
      where: { enabled: true },
      orderBy: { updatedAt: 'desc' },
    });
    return row ? toRule(row) : null;
  }

  async findById(id: string): Promise<Rule | null> {
    const row = await prisma.rule.findUnique({ where: { id } });
    return row ? toRule(row) : null;
  }

  async upsertDefault(input: RuleUpsertInput): Promise<Rule> {
    const existing = await prisma.rule.findFirst({
      where: { name: input.name ?? 'default' },
    });

    const data = {
      name: input.name ?? 'default',
      countries: serializeStringList(input.countries),
      cities: serializeStringList(input.cities),
      experience: input.experience ?? null,
      skills: serializeStringList(input.skills),
      roles: serializeStringList(input.roles),
      excludedRoles: serializeStringList(input.excludedRoles),
      companies: serializeStringList(input.companies),
      minMatchScore: input.minMatchScore ?? 80,
      enabled: input.enabled ?? true,
    };

    const row = existing
      ? await prisma.rule.update({ where: { id: existing.id }, data })
      : await prisma.rule.create({ data });

    return toRule(row);
  }
}
