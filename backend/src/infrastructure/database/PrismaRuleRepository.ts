import type { Rule } from '../../domain/entities/Rule.js';
import type {
  RuleRepository,
  RuleUpsertInput,
} from '../../domain/repositories/RuleRepository.js';
import { serializeStringList } from '../../shared/utils/stringList.js';
import { prisma } from './prismaClient.js';
import { toRule } from './mappers.js';

export class PrismaRuleRepository implements RuleRepository {
  async findByUserId(userId: string): Promise<Rule | null> {
    const row = await prisma.rule.findUnique({ where: { userId } });
    return row ? toRule(row) : null;
  }

  async upsertForUser(userId: string, input: RuleUpsertInput): Promise<Rule> {
    const data = {
      experience:
        input.experience === undefined ? undefined : input.experience,
      skills:
        input.skills === undefined
          ? undefined
          : serializeStringList(input.skills),
      roles:
        input.roles === undefined ? undefined : serializeStringList(input.roles),
      minMatchScore: input.minMatchScore,
    };

    const row = await prisma.rule.upsert({
      where: { userId },
      create: {
        userId,
        experience: input.experience ?? null,
        skills: serializeStringList(input.skills) ?? null,
        roles: serializeStringList(input.roles) ?? null,
        minMatchScore: input.minMatchScore ?? 50,
      },
      update: {
        ...(data.experience !== undefined
          ? { experience: data.experience }
          : {}),
        ...(data.skills !== undefined ? { skills: data.skills } : {}),
        ...(data.roles !== undefined ? { roles: data.roles } : {}),
        ...(data.minMatchScore !== undefined
          ? { minMatchScore: data.minMatchScore }
          : {}),
      },
    });

    return toRule(row);
  }
}
