import { describe, expect, it } from 'vitest';
import type { Job } from '../../domain/entities/Job.js';
import { KeywordJobMatcher } from './KeywordJobMatcher.js';

const RESUME = `
Senior Full-Stack Engineer
Built and shipped production web applications with TypeScript, React and Redux
on the front end, and Node.js with Express on the back end. Designed REST APIs
backed by PostgreSQL and Prisma, cached hot paths in Redis, and ran services on
Docker containers in AWS. Wrote unit tests with Jest and set up CI/CD in GitHub
Actions. Comfortable with Git, Linux and system design discussions.
`;

function job(overrides: Partial<Job> = {}): Job {
  return {
    company: 'Acme',
    title: 'Software Engineer',
    location: 'Hyderabad, India',
    description: null,
    experience: null,
    skills: null,
    salary: null,
    postedDate: null,
    applyUrl: 'https://example.com/job',
    provider: 'stub',
    ...overrides,
  };
}

const matcher = new KeywordJobMatcher();

describe('KeywordJobMatcher', () => {
  it('scores a posting built on the resume stack highly', async () => {
    const result = await matcher.match(
      RESUME,
      job({
        title: 'Full Stack Engineer',
        skills: 'TypeScript, React, Node.js, PostgreSQL',
        description: `
          We are growing the platform group in Hyderabad and looking for a full
          stack engineer to own customer-facing features end to end.

          What you will do: build React front ends in TypeScript, design and ship
          Node.js services with Express, and model data in PostgreSQL. You will
          own your services in production, containerised with Docker and running
          on AWS, and you will keep the REST APIs behind them documented and
          versioned.

          Requirements: strong TypeScript and React, production Node.js
          experience, comfortable writing SQL against PostgreSQL, familiarity
          with Docker and AWS, and a habit of unit testing with Jest. Experience
          with CI/CD pipelines and Git-based review workflows is expected.
        `,
      }),
    );

    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.recommendation).toBe('APPLY');
    expect(result.missingSkills).not.toContain('TypeScript');
    expect(result.missingSkills).not.toContain('React');
    expect(result.missingSkills).not.toContain('Node.js');
  });

  it('caps a posting that names technologies but has no real description', async () => {
    const result = await matcher.match(
      RESUME,
      job({
        title: 'Full Stack Engineer',
        skills: 'TypeScript, React, Node.js, PostgreSQL',
        description: 'Apply online.',
      }),
    );

    // Every named technology matches, but nothing corroborates the listing, so
    // it must not outrank a full posting the resume genuinely covers.
    expect(result.score).toBeLessThanOrEqual(70);
    expect(result.score).toBeGreaterThan(50);
  });

  it('scores an unrelated stack far below a matching one', async () => {
    const unrelated = await matcher.match(
      RESUME,
      job({
        title: 'Embedded Firmware Engineer',
        skills: 'C++, RTOS, Verilog',
        description:
          'Develop firmware in C++ for RTOS targets. Verilog and hardware bring-up experience required, plus board-level debugging with oscilloscopes and JTAG probes on custom silicon.',
      }),
    );
    const related = await matcher.match(
      RESUME,
      job({
        title: 'Backend Engineer',
        skills: 'Node.js, PostgreSQL, AWS',
        description:
          'Build Node.js services against PostgreSQL and deploy them to AWS with Docker. REST API design experience required.',
      }),
    );

    expect(unrelated.score).toBeLessThan(40);
    expect(related.score).toBeGreaterThan(unrelated.score + 25);
  });

  it('reports the technologies the resume does not back', async () => {
    const result = await matcher.match(
      RESUME,
      job({
        title: 'Backend Engineer',
        skills: 'Java, Spring Boot, Kafka',
      }),
    );

    expect(result.missingSkills).toContain('Spring Boot');
    expect(result.missingSkills).toContain('Kafka');
    expect(result.missingSkills).not.toContain('TypeScript');
  });

  it('gives partial credit for a sibling framework instead of zero', async () => {
    const sibling = await matcher.match(
      RESUME,
      job({ title: 'Frontend Engineer', skills: 'Angular' }),
    );
    const foreign = await matcher.match(
      RESUME,
      job({ title: 'Mainframe Engineer', skills: 'COBOL' }),
    );

    expect(sibling.score).toBeGreaterThan(foreign.score);
  });

  it('weights the title and skills field above passing mentions in the description', async () => {
    const named = await matcher.match(
      RESUME,
      job({
        title: 'React Engineer',
        skills: 'React, TypeScript',
        description:
          'Our team also works with Kafka, Spark, Cassandra, Hadoop, Airflow and Scala across the wider data platform, alongside many other internal systems and tools used day to day.',
      }),
    );

    // The resume backs the title requirements even though most description
    // technologies are unfamiliar, so this must not read as a poor match.
    expect(named.score).toBeGreaterThan(45);
  });

  it('matches technologies across spelling variants', async () => {
    const result = await matcher.match(
      RESUME,
      job({ title: 'NodeJS Developer', skills: 'nodejs, postgres, ts' }),
    );

    expect(result.missingSkills).toHaveLength(0);
    expect(result.reasons).toContain('Matched: Node.js');
    expect(result.reasons).toContain('Matched: PostgreSQL');
  });

  it('judges a posting on its title alone when it has no description', async () => {
    const result = await matcher.match(
      RESUME,
      job({ title: 'React Developer', description: null, skills: null }),
    );

    expect(result.score).toBeGreaterThan(0);
    expect(result.reasons).toContain('Matched: React');
  });

  it('scores zero when there is no resume to compare against', async () => {
    const result = await matcher.match(
      '',
      job({ title: 'React Developer', skills: 'React, Node.js' }),
    );

    expect(result.score).toBe(0);
    expect(result.recommendation).toBe('SKIP');
  });
});
