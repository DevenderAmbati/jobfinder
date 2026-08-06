import type { Company } from '../../domain/entities/Company.js';
import type {
  CompanyCreateInput,
  CompanyRepository,
  CompanyUpdateInput,
} from '../../domain/repositories/CompanyRepository.js';
import { FALLBACK_CRON_EXPRESSION } from '../../shared/config/defaults.js';
import { prisma } from './prismaClient.js';
import { toCompany } from './mappers.js';

export class PrismaCompanyRepository implements CompanyRepository {
  async findAll(): Promise<Company[]> {
    const rows = await prisma.company.findMany({ orderBy: { name: 'asc' } });
    return rows.map(toCompany);
  }

  async findById(id: string): Promise<Company | null> {
    const row = await prisma.company.findUnique({ where: { id } });
    return row ? toCompany(row) : null;
  }

  async findDueForRun(_now: Date): Promise<Company[]> {
    const rows = await prisma.company.findMany({
      where: { enabled: true },
      orderBy: { name: 'asc' },
    });
    return rows.map(toCompany);
  }

  async create(input: CompanyCreateInput): Promise<Company> {
    const row = await prisma.company.create({
      data: {
        name: input.name,
        provider: input.provider,
        careerUrl: input.careerUrl,
        enabled: input.enabled ?? true,
        frequency: input.frequency ?? FALLBACK_CRON_EXPRESSION,
      },
    });
    return toCompany(row);
  }

  async update(id: string, input: CompanyUpdateInput): Promise<Company> {
    const row = await prisma.company.update({
      where: { id },
      data: {
        name: input.name,
        provider: input.provider,
        careerUrl: input.careerUrl,
        enabled: input.enabled,
        frequency: input.frequency,
      },
    });
    return toCompany(row);
  }

  async updateLastRun(id: string, lastRun: Date): Promise<void> {
    await prisma.company.update({
      where: { id },
      data: { lastRun },
    });
  }
}
