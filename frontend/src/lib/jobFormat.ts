/**
 * Human relative label for posting date (falls back to createdAt).
 */
export function formatPostedRelative(
  postedDate: string | Date | null | undefined,
  createdAt?: string | Date | null,
): string {
  const raw = postedDate ?? createdAt;
  if (!raw) {
    return '—';
  }
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const now = new Date();
  const startToday = Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startThen = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const days = Math.round((startToday - startThen) / (24 * 60 * 60 * 1000));

  if (days <= 0) {
    return 'Today';
  }
  if (days === 1) {
    return 'Yesterday';
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  if (days < 14) {
    return '1 week ago';
  }
  if (days < 30) {
    return `${Math.floor(days / 7)} weeks ago`;
  }
  if (days < 60) {
    return '1 month ago';
  }
  return `${Math.floor(days / 30)} months ago`;
}

export function formatCtc(
  salary: string | null | undefined,
  salaryEstimate?: string | null,
): string {
  const value = salary?.trim() || salaryEstimate?.trim();
  return value || '—';
}

const YEAR_PATTERNS: RegExp[] = [
  /(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+(?:experience|exp\.?))?/i,
  /(\d{1,2})\s*\+\s*(?:years?|yrs?)(?:\s+of)?(?:\s+(?:experience|exp\.?))?/i,
  /(?:minimum|min\.?|at\s+least)\s+(\d{1,2})\s*\+?\s*(?:years?|yrs?)/i,
  /(\d{1,2})\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp\.?)/i,
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
    if (/\+/.test(match[0]) || /minimum|min\.?|at\s+least/i.test(match[0])) {
      return `${a}+ years`;
    }
    if (/years?|yrs?/i.test(match[0])) {
      return `${a} years`;
    }
  }
  return null;
}

function extractExperienceYears(
  ...texts: Array<string | null | undefined>
): string | null {
  for (const text of texts) {
    if (!text?.trim()) {
      continue;
    }
    const sectionMatches = text.matchAll(
      /(?:^|\n)\s*(?:experience|years of experience|required experience|minimum qualifications|qualifications|requirements|what you.?ll need)[:\s]*([\s\S]{0,600})/gi,
    );
    for (const section of sectionMatches) {
      const hit = section[1] ? matchYears(section[1]) : null;
      if (hit) {
        return hit;
      }
    }
    const hit = matchYears(text);
    if (hit) {
      return hit;
    }
  }
  return null;
}

/**
 * Prefer concrete years from the JD over ATS labels like "Full time" / "Mid-Senior Level".
 */
export function formatExperience(
  experience: string | null | undefined,
  description?: string | null,
  title?: string | null,
): string {
  if (experience?.trim() && /\d/.test(experience) && /(?:year|yr)/i.test(experience)) {
    return matchYears(experience) ?? experience.trim();
  }
  const fromJd = extractExperienceYears(description, title, experience);
  if (fromJd) {
    return fromJd;
  }
  if (experience?.trim() && !LEVEL_ONLY.has(experience.trim().toLowerCase())) {
    return experience.trim();
  }
  return '—';
}

/**
 * Pulls human-facing matched skill labels out of stored match reasons.
 * Keyword matcher writes `Matched: react`; RuleEngine writes `Skills matched: React, Node`.
 */
export function extractMatchedSkills(
  reasons: string[] | null | undefined,
): string[] {
  if (!reasons?.length) {
    return [];
  }

  const fromRules: string[] = [];
  const fromKeywords: string[] = [];

  for (const reason of reasons) {
    const skillsLine = reason.match(/^Skills matched:\s*(.+)$/i);
    if (skillsLine?.[1]) {
      for (const part of skillsLine[1].split(',')) {
        const skill = part.trim();
        if (skill) {
          fromRules.push(skill);
        }
      }
      continue;
    }
    const tokenLine = reason.match(/^Matched:\s*(.+)$/i);
    if (tokenLine?.[1]) {
      const skill = tokenLine[1].trim();
      if (skill && !isNoiseSkillToken(skill)) {
        fromKeywords.push(skill);
      }
    }
  }

  // Prefer explicit rule skill hits; fall back to keyword overlap tokens.
  const preferred = fromRules.length > 0 ? fromRules : fromKeywords;
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const skill of preferred) {
    const key = skill.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(skill);
  }
  return unique.slice(0, 8);
}

const NOISE_SKILL_TOKENS = new Set([
  'and',
  'the',
  'for',
  'with',
  'from',
  'into',
  'over',
  'under',
  'other',
  'full',
  'time',
  'part',
  'role',
  'team',
  'work',
  'jobs',
  'job',
  'india',
  'remote',
  'hybrid',
  'senior',
  'junior',
  'staff',
  'lead',
  'principal',
  'associate',
  'specialist',
  'engineer',
  'engineering',
  'developer',
  'manager',
  'analyst',
  'consultant',
  'information',
  'technology',
  'services',
  'software',
]);

function isNoiseSkillToken(token: string): boolean {
  const normalized = token.toLowerCase();
  if (normalized.length < 2) {
    return true;
  }
  if (/^\d+$/.test(normalized)) {
    return true;
  }
  return NOISE_SKILL_TOKENS.has(normalized);
}

/**
 * Indian offices rarely put the country name in the location string
 * ("Bengaluru" not "Bengaluru, India"). Match country *or* major Indian cities
 * so the India-only feed does not hide product-company postings.
 */
const INDIA_LOCATION_TOKENS = [
  'india',
  'bengaluru',
  'bangalore',
  'hyderabad',
  'chennai',
  'pune',
  'mumbai',
  'delhi',
  'new delhi',
  'noida',
  'gurgaon',
  'gurugram',
  'kochi',
  'coimbatore',
  'ahmedabad',
  'jaipur',
  'kolkata',
  'lucknow',
  'chandigarh',
  'indore',
  'bhopal',
  'nagpur',
  'visakhapatnam',
  'thiruvananthapuram',
  'trivandrum',
  'mysore',
  'mysuru',
  'karnataka',
  'telangana',
  'tamil nadu',
  'tamilnadu',
  'maharashtra',
  'kerala',
  'andhra',
  'bihar',
  'uttar pradesh',
];

export function isIndiaLocation(location: string | null | undefined): boolean {
  const normalized = location?.toLowerCase().trim() ?? '';
  if (!normalized) {
    return false;
  }
  return INDIA_LOCATION_TOKENS.some((token) => normalized.includes(token));
}

/**
 * Company / ATS job id from the posting URL (Greenhouse gh_jid, Workday JR…, etc.).
 * Not the internal database id.
 */
export function extractExternalJobId(
  applyUrl: string | null | undefined,
): string | null {
  if (!applyUrl?.trim()) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(applyUrl.trim());
  } catch {
    return null;
  }

  const queryKeys = [
    'gh_jid',
    'jobId',
    'jobid',
    'job_id',
    'requisitionId',
    'reqId',
  ];
  for (const key of queryKeys) {
    const value = url.searchParams.get(key)?.trim();
    if (value) {
      return value;
    }
  }

  const segments = url.pathname
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  const skipLast = new Set(['apply', 'application', 'jobdetail', 'job-detail']);
  let candidate =
    segments.length > 0 ? segments[segments.length - 1]! : '';
  if (skipLast.has(candidate.toLowerCase()) && segments.length >= 2) {
    candidate = segments[segments.length - 2]!;
  }

  const workday = candidate.match(/_((?:JR|R|REQ)[A-Z0-9-]+)$/i);
  if (workday?.[1]) {
    return workday[1];
  }

  const jobsIdx = segments.findIndex((s) =>
    /^(jobs?|positions?|roles?|requisitions?|jobdetail)$/i.test(s),
  );
  if (jobsIdx >= 0 && segments[jobsIdx + 1]) {
    const next = segments[jobsIdx + 1]!;
    const wd = next.match(/_((?:JR|R|REQ)[A-Z0-9-]+)$/i);
    if (wd?.[1]) {
      return wd[1];
    }
    const numericPrefix = next.match(/^(\d{5,})(?:-|$)/);
    if (numericPrefix?.[1]) {
      return numericPrefix[1];
    }
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(next) || /^\d+$/.test(next)) {
      return next;
    }
  }

  const smartrecruiters = candidate.match(/^(\d{6,})(?:-|$)/);
  if (smartrecruiters?.[1]) {
    return smartrecruiters[1];
  }

  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(candidate) || /^\d+$/.test(candidate)) {
    return candidate;
  }

  // Fallback: last path segment when it looks like an ATS code (e.g. JR2022513 alone)
  if (/^(?:JR|R|REQ)[A-Z0-9-]{3,}$/i.test(candidate)) {
    return candidate;
  }

  return null;
}
