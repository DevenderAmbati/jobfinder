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
  userId: 'user-1',
  experience: null,
  skills: ['TypeScript', 'React', 'Node.js'],
  roles: ['Software Engineer'],
  minMatchScore: 50,
};

describe('RuleEngine', () => {
  const engine = new RuleEngine();

  it('scores a fully matching job highly', () => {
    const result = engine.evaluate(baseJob, baseRule);
    expect(result.eligible).toBe(true);
    expect(result.applyRuleFit).toBe(true);
    expect(result.fitScore).toBeGreaterThanOrEqual(70);
  });

  it('does not veto excluded-looking titles anymore', () => {
    const result = engine.evaluate(
      { ...baseJob, title: 'Engineering Manager' },
      baseRule,
    );
    expect(result.eligible).toBe(true);
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

  it('gives partial credit for a subset of preferred skills', () => {
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

  it('treats empty preferences as resume-only', () => {
    const result = engine.evaluate(baseJob, {
      ...baseRule,
      roles: [],
      skills: [],
      experience: null,
    });
    expect(result.applyRuleFit).toBe(false);
    expect(result.fitScore).toBe(100);
  });

  it('treats every job as neutral when no rule is active', () => {
    const result = engine.evaluate(baseJob, null);
    expect(result.eligible).toBe(true);
    expect(result.applyRuleFit).toBe(false);
    expect(result.fitScore).toBe(100);
  });
});
