import type { Company } from '../../domain/entities/Company.js';
import type { Job } from '../../domain/entities/Job.js';
import type { JobProvider } from '../../domain/ports/JobProvider.js';

/**
 * Deterministic fake ATS for pipeline development and tests.
 */
export class StubProvider implements JobProvider {
  readonly name = 'stub';

  async fetchJobs(company: Company): Promise<Job[]> {
    const now = new Date();
    return [
      {
        company: company.name,
        companyId: company.id,
        title: 'Software Engineer',
        location: 'Hyderabad, India',
        description:
          'Build TypeScript and React services with Node.js. Experience with APIs and cloud.',
        experience: '2-4 years',
        skills: 'TypeScript, React, Node.js',
        salary: '20-30 LPA',
        postedDate: now,
        applyUrl: `${company.careerUrl.replace(/\/$/, '')}/jobs/stub-se-1`,
        provider: this.name,
      },
      {
        company: company.name,
        companyId: company.id,
        title: 'Engineering Manager',
        location: 'Bangalore, India',
        description: 'Lead a team of engineers. People management focus.',
        experience: '8+ years',
        skills: 'Leadership, Mentoring',
        salary: '40-50 LPA',
        postedDate: now,
        applyUrl: `${company.careerUrl.replace(/\/$/, '')}/jobs/stub-em-1`,
        provider: this.name,
      },
      {
        company: company.name,
        companyId: company.id,
        title: 'Backend Engineer',
        location: 'Remote, India',
        description:
          'Design Node.js services. TypeScript, PostgreSQL, messaging.',
        experience: '3-5 years',
        skills: 'TypeScript, Node.js, PostgreSQL',
        salary: '25-35 LPA',
        postedDate: now,
        applyUrl: `${company.careerUrl.replace(/\/$/, '')}/jobs/stub-be-1`,
        provider: this.name,
      },
    ];
  }
}
