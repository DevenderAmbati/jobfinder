import { describe, expect, it } from 'vitest';
import { RuleEngine } from './RuleEngine.js';
import type { Job } from '../entities/Job.js';
import type { Rule } from '../entities/Rule.js';

const baseJob: Job = {
  company: 'Acme',
  title: 'Software Engineer',
  location: 'Hyderabad, India',
  description: 'TypeScript and React',
  experience: '2-4 years',
  skills: 'TypeScript, React',
  salary: null,
  postedDate: null,
  applyUrl: 'https://example.com',
  provider: 'stub',
};

const baseRule: Rule = {
  id: '1',
  name: 'default',
  countries: ['India'],
  cities: ['Hyderabad'],
  experience: null,
  skills: ['TypeScript', 'React', 'Node.js'],
  roles: ['Software Engineer'],
  excludedRoles: ['Manager'],
  companies: [],
  minMatchScore: 50,
  enabled: true,
};

describe('RuleEngine', () => {
  const engine = new RuleEngine();

  it('scores a fully matching job highly', () => {
    const result = engine.evaluate(baseJob, baseRule);
    expect(result.eligible).toBe(true);
    // Location and role are full credit; 2 of 3 skills are present.
    expect(result.fitScore).toBeGreaterThanOrEqual(70);
  });

  it('vetoes an excluded role in the title', () => {
    const result = engine.evaluate(
      { ...baseJob, title: 'Engineering Manager' },
      baseRule,
    );
    expect(result.eligible).toBe(false);
    expect(result.vetoReason).toContain('Manager');
  });

  it('does not veto when an excluded role appears only in the description', () => {
    const result = engine.evaluate(
      {
        ...baseJob,
        description: 'Partner with your product manager to ship TypeScript',
      },
      baseRule,
    );
    expect(result.eligible).toBe(true);
  });

  it('reports a location mismatch without discarding the job', () => {
    const result = engine.evaluate(
      { ...baseJob, location: 'Seattle, USA' },
      baseRule,
    );
    expect(result.eligible).toBe(true);
    expect(result.locationMatched).toBe(false);
  });

  it('keeps fitScore about role and skills only, leaving location to the scorer', () => {
    const inArea = engine.evaluate(baseJob, baseRule);
    const outOfArea = engine.evaluate(
      { ...baseJob, location: 'Arlington, TX' },
      baseRule,
    );
    expect(outOfArea.fitScore).toBe(inArea.fitScore);
  });

  it('does not treat US-remote as satisfying a Remote preference', () => {
    const result = engine.evaluate(
      { ...baseJob, location: 'US, Remote' },
      { ...baseRule, countries: ['India', 'Remote'], cities: ['Remote'] },
    );
    expect(result.locationMatched).toBe(false);
  });

  it('accepts role synonyms outside the configured wording', () => {
    const result = engine.evaluate(
      { ...baseJob, title: 'Full Stack Developer' },
      { ...baseRule, roles: ['Full Stack Engineer'] },
    );
    const roleSignal = result.signals.find(
      (signal) => signal.dimension === 'role',
    );
    expect(roleSignal?.earned).toBe(1);
  });

  it('gives partial credit for a subset of required skills', () => {
    const result = engine.evaluate(
      { ...baseJob, description: 'React only', skills: 'React' },
      baseRule,
    );
    const skillSignal = result.signals.find(
      (signal) => signal.dimension === 'skills',
    );
    expect(skillSignal?.earned).toBeGreaterThan(0);
    expect(skillSignal?.earned).toBeLessThan(1);
  });

  it('vetoes a company outside the allow-list', () => {
    const result = engine.evaluate(baseJob, {
      ...baseRule,
      companies: ['Other Corp'],
    });
    expect(result.eligible).toBe(false);
  });

  it('treats every job as neutral when no rule is active', () => {
    const result = engine.evaluate(baseJob, null);
    expect(result.eligible).toBe(true);
    expect(result.fitScore).toBe(100);
  });
});
