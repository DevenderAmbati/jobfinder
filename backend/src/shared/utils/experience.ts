/**
 * Pull required years of experience out of free-text JD / title / experience fields.
 * Prefers concrete year ranges over ATS level labels like "Mid-Senior Level".
 */

const YEAR_PATTERNS: RegExp[] = [
  // 3-5 years / 3 – 5 years / 3 to 5 years of experience
  /(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+(?:experience|exp\.?))?/i,
  // 5+ years / 5 + years experience
  /(\d{1,2})\s*\+\s*(?:years?|yrs?)(?:\s+of)?(?:\s+(?:experience|exp\.?))?/i,
  // minimum / at least / min 5 years
  /(?:minimum|min\.?|at\s+least)\s+(\d{1,2})\s*\+?\s*(?:years?|yrs?)/i,
  // 5 years of experience / 5 yrs experience
  /(\d{1,2})\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp\.?)/i,
  // experience: 5+ years / Experience - 3-5 years
  /experience\s*[:\-–—]\s*(\d{1,2})\s*(?:\+|to|-|–|—)\s*(\d{1,2})?\s*(?:years?|yrs?)?/i,
];

const LEVEL_ONLY = new Set([
  'full time',
  'full-time',
  'part time',
  'part-time',
  'contract',
  'permanent',
  'temporary',
  'internship',
  'entry level',
  'entry-level',
  'associate',
  'mid-senior level',
  'mid senior level',
  'mid level',
  'senior level',
  'director',
  'executive',
  'not applicable',
  'na',
  'n/a',
]);

export function looksLikeExperienceYears(value: string): boolean {
  return /\d/.test(value) && /(?:year|yr)/i.test(value);
}

export function isAtsLevelLabel(value: string): boolean {
  return LEVEL_ONLY.has(value.trim().toLowerCase());
}

/**
 * Returns a short display string like "3–5 years" or "5+ years", or null.
 */
export function extractExperienceYears(
  ...texts: Array<string | null | undefined>
): string | null {
  for (const text of texts) {
    const hit = extractFromText(text);
    if (hit) {
      return hit;
    }
  }
  return null;
}

function extractFromText(text: string | null | undefined): string | null {
  if (!text?.trim()) {
    return null;
  }
  // Prefer the Experience / Qualifications sections when present.
  const prioritized = sliceRelevantSections(text);
  for (const chunk of prioritized) {
    const formatted = matchYears(chunk);
    if (formatted) {
      return formatted;
    }
  }
  return matchYears(text);
}

function sliceRelevantSections(text: string): string[] {
  const sections: string[] = [];
  const patterns = [
    /(?:^|\n)\s*(?:experience|years of experience|required experience|minimum qualifications|qualifications|requirements|what you.?ll need)[:\s]*([\s\S]{0,600})/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]?.trim()) {
        sections.push(match[1]);
      }
    }
  }
  return sections;
}

function matchYears(text: string): string | null {
  for (const pattern of YEAR_PATTERNS) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }
    const a = match[1] ? Number(match[1]) : NaN;
    const b = match[2] ? Number(match[2]) : NaN;
    if (!Number.isFinite(a) || a < 0 || a > 40) {
      continue;
    }
    if (Number.isFinite(b) && b >= a && b <= 40) {
      return `${a}–${b} years`;
    }
    // Patterns with a lone + (5+) or "minimum 5"
    if (/\+/.test(match[0]) || /minimum|min\.?|at\s+least/i.test(match[0])) {
      return `${a}+ years`;
    }
    if (/years?|yrs?/i.test(match[0])) {
      return `${a} years`;
    }
  }
  return null;
}

/**
 * Best experience label for UI / storage: years from JD when available,
 * otherwise a non-ATS stored value, otherwise null.
 */
export function resolveExperienceLabel(
  experience: string | null | undefined,
  description?: string | null,
  title?: string | null,
): string | null {
  if (experience && looksLikeExperienceYears(experience)) {
    return normalizeExistingYears(experience) ?? experience.trim();
  }
  const fromJd = extractExperienceYears(description, title, experience);
  if (fromJd) {
    return fromJd;
  }
  if (experience?.trim() && !isAtsLevelLabel(experience)) {
    return experience.trim();
  }
  return null;
}

function normalizeExistingYears(value: string): string | null {
  return matchYears(value);
}
