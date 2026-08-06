/**
 * Text normalization and role-synonym expansion used by rule evaluation.
 * Pure functions — no I/O, no persistence concerns.
 */

/**
 * Role families. A rule entry matching any member is expanded to the whole
 * family, so "Software Engineer" also accepts "SDE II" and "Software Developer".
 */
const ROLE_FAMILIES: string[][] = [
  [
    'software engineer',
    'software developer',
    'software development engineer',
    'software design engineer',
    'sde',
    'swe',
    'application developer',
    'applications engineer',
    'product engineer',
  ],
  [
    'backend engineer',
    'back end engineer',
    'backend developer',
    'back end developer',
    'server side engineer',
    'api engineer',
    'services engineer',
    'platform engineer',
    'infrastructure engineer',
  ],
  [
    'frontend engineer',
    'front end engineer',
    'frontend developer',
    'front end developer',
    'ui engineer',
    'ui developer',
    'web developer',
    'react developer',
    'javascript developer',
  ],
  [
    'full stack engineer',
    'fullstack engineer',
    'full stack developer',
    'fullstack developer',
    'full stack',
    'fullstack',
    'mern',
    'mean stack',
  ],
];

/**
 * Lowercases and reduces punctuation to single spaces, then pads with spaces
 * so callers can test whole-token boundaries with `includes(' term ')`.
 * `+` and `#` survive so "c++" and "c#" stay intact.
 */
export function normalizeText(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? ` ${cleaned} ` : ' ';
}

/** Strips all separators: "Node.js" and "node js" both become "nodejs". */
export function squashText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#]+/g, '');
}

/**
 * Strict whole-phrase match. Use for vetoes, where a false positive silently
 * discards a job — "sde" must not match "sdet".
 */
export function containsPhrase(
  normalizedHaystack: string,
  term: string,
): boolean {
  const phrase = normalizeText(term).trim();
  return phrase.length > 0 && normalizedHaystack.includes(` ${phrase} `);
}

/**
 * Lenient match that also tolerates separator differences, so a rule skill of
 * "Node.js" matches "nodejs" and "Node JS". Use for graded fit signals only,
 * never for vetoes.
 */
export function containsTerm(
  normalizedHaystack: string,
  term: string,
): boolean {
  if (containsPhrase(normalizedHaystack, term)) {
    return true;
  }
  const joined = squashText(term);
  if (joined.length < 4) {
    return false;
  }
  return squashText(normalizedHaystack).includes(joined);
}

/**
 * Expands a configured role into its whole family. Unknown roles are returned
 * as-is so custom entries still work.
 */
export function expandRole(role: string): string[] {
  const normalized = normalizeText(role).trim();
  if (!normalized) {
    return [];
  }
  const family = ROLE_FAMILIES.find((members) =>
    members.some((member) => member === normalized),
  );
  return family ? [...family] : [normalized];
}

/** Expands every configured role and removes duplicates. */
export function expandRoles(roles: string[]): string[] {
  const expanded = new Set<string>();
  for (const role of roles) {
    for (const variant of expandRole(role)) {
      expanded.add(variant);
    }
  }
  return [...expanded];
}
