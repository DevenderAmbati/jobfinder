import { describe, expect, it, vi } from 'vitest';
import { JobScoringService } from './JobScoringService.js';
import { RelevanceScorer } from '../../domain/services/RelevanceScorer.js';
import { RuleEngine } from '../../domain/services/RuleEngine.js';
import type { Job } from '../../domain/entities/Job.js';
import type { Rule } from '../../domain/entities/Rule.js';
import type { JobMatcher, MatchResult } from '../../domain/ports/JobMatcher.js';

function stubMatcher(score: number, source: MatchResult['source']): JobMatcher {
  return {
    match: vi.fn(async () => ({
      score,
      reasons: ['stub reason'],
      missingSkills: [],
      interviewDifficulty: null,
      salaryEstimate: null,
      recommendation: 'APPLY' as const,
      source,
    })),
  };
}

const job: Job = {
  company: 'Acme',
  title: 'Software Engineer',
  location: 'Hyderabad, India',
  description: 'TypeScript React Node.js',
  experience: '2-4 years',
  skills: 'TypeScript, React, Node.js',
  salary: null,
  postedDate: null,
  applyUrl: 'https://example.com',
  provider: 'stub',
};

const rule: Rule = {
  id: '1',
  userId: 'user-1',
  experience: null,
  skills: ['TypeScript', 'React', 'Node.js'],
  roles: ['Software Engineer'],
  minMatchScore: 50,
};

function build(
  escalationFitFloor: number,
  primary: JobMatcher,
  baseline: JobMatcher,
) {
  return new JobScoringService({
    ruleEngine: new RuleEngine(),
    relevance: new RelevanceScorer(),
    primaryMatcher: primary,
    baselineMatcher: baseline,
    escalationFitFloor,
  });
}

describe('JobScoringService', () => {
  it('blends the matcher score with rule fit when preferences exist', async () => {
    const service = build(
      200,
      stubMatcher(90, 'GEMINI'),
      stubMatcher(60, 'KEYWORD'),
    );

    const outcome = await service.score(job, rule, 'resume', {
      allowEscalation: false,
      minScore: 50,
    });

    // Baseline resume 60 at 60% plus perfect fit 100 at 40% → 76.
    expect(outcome.match?.score).toBe(76);
  });

  it('uses resume score only when no preference rules are set', async () => {
    const service = build(
      200,
      stubMatcher(90, 'GEMINI'),
      stubMatcher(60, 'KEYWORD'),
    );

    const outcome = await service.score(job, null, 'resume', {
      allowEscalation: false,
      minScore: 50,
    });

    expect(outcome.match?.score).toBe(60);
    expect(outcome.match?.reasons.join(' ')).toContain('resume only');
  });

  it('uses the free baseline matcher when fit is below the floor', async () => {
    const primary = stubMatcher(90, 'GEMINI');
    const baseline = stubMatcher(60, 'KEYWORD');
    const service = build(90, primary, baseline);

    const outcome = await service.score(
      { ...job, skills: 'React', description: 'React only' },
      rule,
      'resume',
      { allowEscalation: true, minScore: 50 },
    );

    expect(outcome.escalated).toBe(false);
    expect(primary.match).not.toHaveBeenCalled();
    expect(baseline.match).toHaveBeenCalled();
  });

  it('escalates to the primary matcher when fit clears the floor', async () => {
    const primary = stubMatcher(90, 'GEMINI');
    const baseline = stubMatcher(60, 'KEYWORD');
    const service = build(80, primary, baseline);

    const outcome = await service.score(job, rule, 'resume', {
      allowEscalation: true,
      minScore: 50,
    });

    expect(outcome.escalated).toBe(true);
    expect(primary.match).toHaveBeenCalled();
  });

  it('never escalates when the caller has exhausted its budget', async () => {
    const primary = stubMatcher(90, 'GEMINI');
    const service = build(0, primary, stubMatcher(60, 'KEYWORD'));

    const outcome = await service.score(job, rule, 'resume', {
      allowEscalation: false,
      minScore: 50,
    });

    expect(outcome.escalated).toBe(false);
    expect(primary.match).not.toHaveBeenCalled();
  });

  it('recommends SKIP when the blended score misses the threshold', async () => {
    const service = build(
      200,
      stubMatcher(90, 'GEMINI'),
      stubMatcher(20, 'KEYWORD'),
    );

    const outcome = await service.score(
      { ...job, skills: null, description: null, title: 'Accountant' },
      rule,
      'resume',
      { allowEscalation: false, minScore: 50 },
    );

    expect(outcome.match?.recommendation).toBe('SKIP');
  });
});
