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

function build(escalationFitFloor: number, primary: JobMatcher, baseline: JobMatcher) {
  return new JobScoringService({
    ruleEngine: new RuleEngine(),
    relevance: new RelevanceScorer(),
    primaryMatcher: primary,
    baselineMatcher: baseline,
    escalationFitFloor,
  });
}

describe('JobScoringService', () => {
  it('does not score a vetoed job', async () => {
    const primary = stubMatcher(90, 'GEMINI');
    const baseline = stubMatcher(50, 'KEYWORD');
    const service = build(0, primary, baseline);

    const outcome = await service.score(
      { ...job, title: 'Engineering Manager' },
      rule,
      'resume',
      { allowEscalation: true, minScore: 50 },
    );

    expect(outcome.match).toBeNull();
    expect(primary.match).not.toHaveBeenCalled();
    expect(baseline.match).not.toHaveBeenCalled();
  });

  it('blends the matcher score with rule fit', async () => {
    const service = build(200, stubMatcher(90, 'GEMINI'), stubMatcher(60, 'KEYWORD'));

    const outcome = await service.score(job, rule, 'resume', {
      allowEscalation: false,
      minScore: 50,
    });

    // Baseline resume score 60 at 70% plus perfect fit (100) at 30%.
    expect(outcome.match?.score).toBe(72);
  });

  it('ranks an in-area partial match above an out-of-area perfect match', async () => {
    const service = build(200, stubMatcher(90, 'GEMINI'), stubMatcher(50, 'KEYWORD'));

    const local = await service.score(
      { ...job, skills: 'React', description: 'React only' },
      rule,
      'resume',
      { allowEscalation: false, minScore: 50 },
    );
    const remoteCountry = await service.score(
      { ...job, location: 'Arlington, TX' },
      rule,
      'resume',
      { allowEscalation: false, minScore: 50 },
    );

    expect(local.match?.score).toBeGreaterThan(remoteCountry.match?.score ?? 0);
  });

  it('explains why an out-of-area job was scaled down', async () => {
    const service = build(200, stubMatcher(90, 'GEMINI'), stubMatcher(90, 'KEYWORD'));

    const outcome = await service.score(
      { ...job, location: 'US, Remote' },
      rule,
      'resume',
      { allowEscalation: false, minScore: 50 },
    );

    expect(outcome.match?.reasons.join(' ')).toContain('Outside target locations');
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

  it('does not spend an LLM call on an unreachable job', async () => {
    const primary = stubMatcher(90, 'GEMINI');
    const baseline = stubMatcher(60, 'KEYWORD');
    const service = build(0, primary, baseline);

    const outcome = await service.score(
      { ...job, location: 'Arlington, TX' },
      rule,
      'resume',
      { allowEscalation: true, minScore: 50 },
    );

    expect(outcome.escalated).toBe(false);
    expect(primary.match).not.toHaveBeenCalled();
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
    const service = build(200, stubMatcher(90, 'GEMINI'), stubMatcher(20, 'KEYWORD'));

    const outcome = await service.score(
      { ...job, location: 'Seattle, USA', skills: null, description: null },
      rule,
      'resume',
      { allowEscalation: false, minScore: 50 },
    );

    expect(outcome.match?.recommendation).toBe('SKIP');
  });

  it('treats every job as reachable when no location rules are configured', async () => {
    const service = build(200, stubMatcher(90, 'GEMINI'), stubMatcher(60, 'KEYWORD'));

    const outcome = await service.score(
      { ...job, location: 'Arlington, TX' },
      { ...rule, countries: [], cities: [] },
      'resume',
      { allowEscalation: false, minScore: 50 },
    );

    expect(outcome.match?.score).toBe(72);
  });
});
