import type { Job } from '../../domain/entities/Job.js';
import type {
  JobMatcher,
  MatchResult,
} from '../../domain/ports/JobMatcher.js';
import {
  buildTextIndex,
  contentTokens,
  findSkills,
  indexHasTerm,
  TITLE_NOISE,
  type SkillDefinition,
  type TextIndex,
} from '../../domain/services/skillVocabulary.js';

/**
 * Where a skill was named in the posting.
 *
 * Weighting by position matters because postings are not uniform: the title and
 * skills field state what the role is, a qualifications list states what it
 * demands, and body prose routinely inventories the entire organization's stack
 * ("our platform also uses …"). Counting all three equally let a long posting
 * bury its own requirements under technologies nobody is hiring for.
 */
const SOURCE_WEIGHT = { focus: 3, requirement: 2, description: 1 } as const;

/**
 * Headings that introduce what a posting actually requires. Matching on these
 * is heuristic — boards impose no structure — so a miss only costs the section
 * its extra weight rather than dropping the skills entirely.
 */
const REQUIREMENT_HEADING =
  /(?:requirements?|qualifications?|what (?:you'?l?l? need|we'?re looking for)|must[- ]haves?|skills? (?:required|needed)|technical skills|basic qualifications|preferred qualifications|you (?:have|should have)|desired skills)/i;

/** Characters of post-heading text treated as the requirements section. */
const REQUIREMENT_SECTION_LENGTH = 2500;

/**
 * Credit for a sibling technology when the exact one is missing — a React
 * developer facing an Angular posting is a partial, not a zero, match.
 */
const FAMILY_CREDIT = 0.4;

/**
 * Weighted coverage treated as a complete technical match.
 *
 * Nobody is expected to hold every technology a posting lists — the tail is
 * routinely "nice to have", adjacent tooling, or another team's stack. Scoring
 * against literal 100% coverage would mean no real posting ever reads as a
 * strong match, so coverage is measured against an achievable target instead.
 */
const SKILL_COVERAGE_TARGET = 0.7;

/**
 * Ceilings for postings that give us little to judge.
 *
 * Several boards return listings whose description is a single line, so a
 * comparison against the title and a stray technology can reach 100% while a
 * full posting whose requirements the resume genuinely covers lands in the
 * fifties. Left uncapped, those stubs monopolize the top of the feed and hide
 * the real matches. Capping ranks them for what they are — plausible but
 * unverified — instead of discarding them.
 */
const EVIDENCE_CAP = {
  /** Some technologies named, but no description to corroborate them. */
  noDescription: 70,
  /** Nothing but a job title. */
  titleOnly: 55,
} as const;

const COMPONENT_WEIGHT = {
  /** Named technology coverage: the strongest available signal. */
  skills: 60,
  /**
   * Does the resume speak to what the posting is titled? Weighted modestly
   * because titles carry team and org names ("… , Portfolio Management Group")
   * that no resume would contain.
   */
  title: 20,
  /** Remaining description vocabulary — domain terms, tools outside the vocabulary. */
  context: 20,
} as const;

/**
 * Shrinkage applied to every ratio below, expressed as prior evidence.
 *
 * A raw ratio is only as trustworthy as its denominator: a posting that names
 * one recognizable technology the resume happens to list scores 100% coverage
 * and outranks a posting naming twenty of which the resume covers fourteen.
 * Mixing in a fixed amount of average-case evidence leaves large denominators
 * essentially untouched while pulling small ones toward the middle, so
 * confidence and score move together.
 */
const PRIOR = {
  skills: { weight: 4, rate: 0.45 },
  title: { weight: 2, rate: 0.4 },
  context: { weight: 30, rate: 0.2 },
} as const;

function smoothedPercent(
  earned: number,
  possible: number,
  prior: { weight: number; rate: number },
): number {
  const numerator = earned + prior.weight * prior.rate;
  const denominator = possible + prior.weight;
  return (numerator / denominator) * 100;
}

interface RequiredSkill {
  skill: SkillDefinition;
  weight: number;
}

interface Component {
  weight: number;
  score: number;
}

/**
 * Deterministic resume↔posting matcher. Used whenever the LLM path is disabled,
 * over budget, or failing, which in practice is most of the time — so it has to
 * produce a defensible score on its own rather than a rough placeholder.
 *
 * Scores three things and blends them: which technologies the posting names and
 * the resume can back, how close the job title is to the resume's own
 * vocabulary, and how much of the rest of the description the resume covers.
 * Components with no signal are dropped and the remaining weights renormalized,
 * so a posting with an empty description is judged on what it does say instead
 * of being penalized for brevity.
 */
export class KeywordJobMatcher implements JobMatcher {
  async match(resumeText: string, job: Job): Promise<MatchResult> {
    // Without a resume there is nothing to compare against, and the priors
    // below would otherwise manufacture a mid-range score from thin air.
    if (!resumeText.trim()) {
      return {
        score: 0,
        reasons: ['No resume on file to compare against'],
        missingSkills: [],
        interviewDifficulty: null,
        salaryEstimate: job.salary,
        recommendation: 'SKIP',
        source: 'KEYWORD',
      };
    }

    const resume = buildTextIndex(resumeText);
    const resumeSkillList = findSkills(resumeText);
    const resumeSkills = new Set(resumeSkillList.map((skill) => skill.id));
    const resumeFamilies = new Set(
      resumeSkillList
        .map((skill) => skill.family)
        .filter((family): family is string => Boolean(family)),
    );

    const required = collectRequiredSkills(job);
    const matched: SkillDefinition[] = [];
    const missing: RequiredSkill[] = [];

    let earned = 0;
    let possible = 0;

    for (const { skill, weight } of required) {
      possible += weight;
      if (resumeSkills.has(skill.id)) {
        earned += weight;
        matched.push(skill);
        continue;
      }
      if (skill.family && resumeFamilies.has(skill.family)) {
        earned += weight * FAMILY_CREDIT;
      }
      missing.push({ skill, weight });
    }

    const components: Component[] = [];

    if (possible > 0) {
      const coverage =
        smoothedPercent(earned, possible, PRIOR.skills) / SKILL_COVERAGE_TARGET;
      components.push({
        weight: COMPONENT_WEIGHT.skills,
        score: Math.min(100, coverage),
      });
    }

    const titleScore = scoreTitle(job.title, resume);
    if (titleScore !== null) {
      components.push({ weight: COMPONENT_WEIGHT.title, score: titleScore });
    }

    const contextScore = scoreContext(job.description, resume);
    if (contextScore !== null) {
      components.push({ weight: COMPONENT_WEIGHT.context, score: contextScore });
    }

    const score = Math.min(
      blend(components),
      evidenceCap({ hasSkills: possible > 0, hasContext: contextScore !== null }),
    );

    const missingSkills = missing
      .sort((a, b) => b.weight - a.weight)
      .map((entry) => entry.skill.label)
      .slice(0, 8);

    return {
      score,
      reasons: buildReasons({
        matched,
        requiredCount: required.length,
        contextScore,
      }),
      missingSkills,
      interviewDifficulty: score >= 70 ? 'Medium' : 'Hard',
      salaryEstimate: job.salary,
      recommendation: score >= 60 ? 'APPLY' : 'SKIP',
      source: 'KEYWORD',
    };
  }
}

/** Skills the posting asks for, weighted by where each one appears. */
function collectRequiredSkills(job: Job): RequiredSkill[] {
  const weights = new Map<string, RequiredSkill>();

  const add = (skills: SkillDefinition[], weight: number): void => {
    for (const skill of skills) {
      const existing = weights.get(skill.id);
      if (!existing || existing.weight < weight) {
        weights.set(skill.id, { skill, weight });
      }
    }
  };

  // Ascending weight: a skill named in several places keeps its highest.
  add(findSkills(job.description), SOURCE_WEIGHT.description);
  add(
    findSkills(requirementsSection(job.description)),
    SOURCE_WEIGHT.requirement,
  );
  add(findSkills(`${job.title} ${job.skills ?? ''}`), SOURCE_WEIGHT.focus);

  return [...weights.values()];
}

/** Text following the first requirements-style heading, if the posting has one. */
function requirementsSection(description: string | null): string {
  if (!description) {
    return '';
  }
  const heading = REQUIREMENT_HEADING.exec(description);
  if (!heading) {
    return '';
  }
  return description.slice(
    heading.index,
    heading.index + REQUIREMENT_SECTION_LENGTH,
  );
}

/**
 * Share of the title's substantive words the resume also uses. Seniority and
 * location words are stripped first: every posting says "Senior Engineer,
 * Hyderabad", so matching on those inflates every score equally.
 * Returns null when nothing substantive is left to compare.
 */
function scoreTitle(title: string, resume: TextIndex): number | null {
  const tokens = contentTokens(title, TITLE_NOISE);
  if (tokens.size === 0) {
    return null;
  }
  const hits = [...tokens].filter((token) => indexHasTerm(resume, token));
  return smoothedPercent(hits.length, tokens.size, PRIOR.title);
}

/**
 * Share of the description's remaining vocabulary the resume covers.
 *
 * Real postings mix requirements with company copy, so full coverage is not
 * achievable and raw overlap lands far below what it implies about fit. The
 * ratio is rescaled against a realistic ceiling instead, and the component is
 * weighted lowest of the three because it is the noisiest.
 */
const CONTEXT_CEILING = 0.35;

function scoreContext(
  description: string | null,
  resume: TextIndex,
): number | null {
  const tokens = contentTokens(description);
  // Below this a "description" is a stub or a cookie banner, not a posting.
  if (tokens.size < 20) {
    return null;
  }
  const hits = [...tokens].filter((token) => indexHasTerm(resume, token));
  const coverage = smoothedPercent(hits.length, tokens.size, PRIOR.context) / 100;
  return Math.min(100, (coverage / CONTEXT_CEILING) * 100);
}

function evidenceCap(input: {
  hasSkills: boolean;
  hasContext: boolean;
}): number {
  if (input.hasContext) {
    return 100;
  }
  return input.hasSkills ? EVIDENCE_CAP.noDescription : EVIDENCE_CAP.titleOnly;
}

function blend(components: Component[]): number {
  if (components.length === 0) {
    return 0;
  }
  const totalWeight = components.reduce((sum, part) => sum + part.weight, 0);
  const weighted = components.reduce(
    (sum, part) => sum + part.weight * part.score,
    0,
  );
  return Math.min(100, Math.max(0, Math.round(weighted / totalWeight)));
}

function buildReasons(input: {
  matched: SkillDefinition[];
  requiredCount: number;
  contextScore: number | null;
}): string[] {
  const reasons: string[] = [];

  if (input.requiredCount > 0) {
    reasons.push(
      `Resume covers ${input.matched.length} of ${input.requiredCount} technologies named in the posting`,
    );
  } else {
    reasons.push('Posting names no recognizable technologies');
  }

  // One "Matched: <skill>" line per hit — the dashboard parses this prefix.
  for (const skill of input.matched.slice(0, 8)) {
    reasons.push(`Matched: ${skill.label}`);
  }

  if (input.contextScore !== null) {
    reasons.push(
      `Job description keyword coverage ${Math.round(input.contextScore)}%`,
    );
  }

  return reasons;
}
