import { containsTerm, normalizeText } from './textMatching.js';

export interface LocationVerdict {
  matched: boolean;
  detail: string;
}

/** Location text that advertises remote work rather than a place. */
const REMOTE_TERMS = ['remote', 'anywhere', 'wfh', 'work from home'];

/**
 * Country and region tokens that commonly anchor an ATS location string.
 * Used only to detect that a "Remote" posting is scoped to a country the user
 * did not target — a heuristic, since job boards rarely state work eligibility.
 */
const COUNTRY_TOKENS = [
  'us',
  'usa',
  'united states',
  'canada',
  'uk',
  'united kingdom',
  'gb',
  'ireland',
  'germany',
  'france',
  'spain',
  'portugal',
  'italy',
  'netherlands',
  'belgium',
  'switzerland',
  'austria',
  'denmark',
  'sweden',
  'norway',
  'finland',
  'poland',
  'czechia',
  'hungary',
  'romania',
  'ukraine',
  'turkey',
  'israel',
  'egypt',
  'nigeria',
  'kenya',
  'south africa',
  'uae',
  'saudi arabia',
  'qatar',
  'india',
  'china',
  'hong kong',
  'taiwan',
  'japan',
  'korea',
  'singapore',
  'malaysia',
  'indonesia',
  'thailand',
  'vietnam',
  'philippines',
  'australia',
  'new zealand',
  'brazil',
  'mexico',
  'argentina',
  'chile',
  'colombia',
  'peru',
  'costa rica',
];

/**
 * Decides whether a posting's location satisfies the configured countries and
 * cities.
 *
 * A bare "Remote" target is deliberately not treated as a wildcard: a posting
 * reading "US, Remote" is remote *within the US* and is unavailable to someone
 * targeting India, so it only counts when the posting is not anchored to an
 * untargeted country.
 */
export class LocationMatcher {
  match(
    location: string | null,
    countries: string[],
    cities: string[],
  ): LocationVerdict {
    const raw = location?.trim() ?? '';
    if (!raw) {
      return { matched: false, detail: 'Posting has no location' };
    }

    const normalized = normalizeText(raw);
    const targets = [...countries, ...cities]
      .map((value) => value.trim())
      .filter(Boolean);

    const places = targets.filter((target) => !isRemoteTerm(target));
    const hits = places.filter((place) => containsTerm(normalized, place));
    if (hits.length > 0) {
      return {
        matched: true,
        detail: `Location matched: ${[...new Set(hits)].join(', ')}`,
      };
    }

    const acceptsRemote = targets.some((target) => isRemoteTerm(target));
    const advertisesRemote = REMOTE_TERMS.some((term) =>
      containsTerm(normalized, term),
    );

    if (acceptsRemote && advertisesRemote) {
      const foreign = COUNTRY_TOKENS.filter(
        (country) =>
          containsTerm(normalized, country) &&
          !places.some((place) => normalizeText(place).trim() === country),
      );
      if (foreign.length === 0) {
        return { matched: true, detail: 'Remote with no country restriction' };
      }
      return {
        matched: false,
        detail: `Remote but scoped to ${foreign.join(', ')}`,
      };
    }

    return { matched: false, detail: `Location "${raw}" outside target areas` };
  }
}

function isRemoteTerm(value: string): boolean {
  const normalized = normalizeText(value).trim();
  return REMOTE_TERMS.includes(normalized);
}
