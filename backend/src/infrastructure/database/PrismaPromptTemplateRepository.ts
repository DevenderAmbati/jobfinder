import type { PromptTemplate } from '../../domain/entities/PromptTemplate.js';
import type { PromptTemplateRepository } from '../../domain/repositories/PromptTemplateRepository.js';
import { prisma } from './prismaClient.js';
import { toPromptTemplate } from './mappers.js';

export class PrismaPromptTemplateRepository implements PromptTemplateRepository {
  async findEnabledByName(name: string): Promise<PromptTemplate | null> {
    const row = await prisma.promptTemplate.findFirst({
      where: { name, enabled: true },
      orderBy: { version: 'desc' },
    });
    return row ? toPromptTemplate(row) : null;
  }

  async findAll(): Promise<PromptTemplate[]> {
    const rows = await prisma.promptTemplate.findMany({
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
    });
    return rows.map(toPromptTemplate);
  }

  async create(input: {
    name: string;
    version: number;
    content: string;
    enabled?: boolean;
  }): Promise<PromptTemplate> {
    const row = await prisma.promptTemplate.create({
      data: {
        name: input.name,
        version: input.version,
        content: input.content,
        enabled: input.enabled ?? true,
      },
    });
    return toPromptTemplate(row);
  }

  async update(
    id: string,
    input: { content?: string; enabled?: boolean },
  ): Promise<PromptTemplate> {
    const row = await prisma.promptTemplate.update({
      where: { id },
      data: {
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
    });
    return toPromptTemplate(row);
  }
}
