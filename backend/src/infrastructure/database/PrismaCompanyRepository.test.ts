import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaCompanyRepository } from './PrismaCompanyRepository.js';
import { PrismaJobRepository } from './PrismaJobRepository.js';
import { DedupHash } from '../../domain/value-objects/DedupHash.js';

/**
 * Integration-style repo tests against the configured PostgreSQL database.
 * Requires migrate + generate before running.
 */
describe('Prisma repositories', () => {
  const prisma = new PrismaClient();
  const companies = new PrismaCompanyRepository();
  const jobs = new PrismaJobRepository();
  let companyId = '';

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (companyId) {
      await prisma.job.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('creates a company and persists a deduplicated job', async () => {
    const company = await companies.create({
      name: `Test Co ${Date.now()}`,
      provider: 'stub',
      careerUrl: 'https://example.com/careers',
    });
    companyId = company.id;

    const hash = DedupHash.fromParts(company.name, 'Backend Engineer', 'Remote');
    expect(await jobs.existsByDedupHash(hash.value)).toBe(false);

    const job = await jobs.create({
      companyId: company.id,
      company: company.name,
      title: 'Backend Engineer',
      location: 'Remote',
      description: 'Build APIs',
      experience: '2-4 years',
      skills: 'TypeScript,Node.js',
      salary: null,
      postedDate: null,
      applyUrl: 'https://example.com/jobs/1',
      provider: 'stub',
      dedupHash: hash.value,
    });

    expect(job.id).toBeTruthy();
    expect(await jobs.existsByDedupHash(hash.value)).toBe(true);
    expect(await jobs.findById(job.id!)).toMatchObject({
      title: 'Backend Engineer',
      company: company.name,
    });
  });
});
