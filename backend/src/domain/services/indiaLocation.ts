/**
 * India location detection shared by ingest filtering and prune scripts.
 * Tokens mirror frontend `isIndiaLocation` (city / state / country names) plus
 * Amazon-style country codes (`IN, KA, Bengaluru`).
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
] as const;

/** ISO-ish country code `IN` as a comma-separated ATS fragment. */
const INDIA_COUNTRY_CODE = /(^|,\s*)in(\s*,|$)/i;

/**
 * True when the location string clearly refers to India (or a major Indian city).
 * Empty / null locations return false — callers decide whether to keep those.
 */
export function isIndiaLocation(location: string | null | undefined): boolean {
  const normalized = location?.toLowerCase().trim() ?? '';
  if (!normalized) {
    return false;
  }
  if (INDIA_LOCATION_TOKENS.some((token) => normalized.includes(token))) {
    return true;
  }
  return INDIA_COUNTRY_CODE.test(normalized);
}

/**
 * Whether a newly fetched job should be persisted.
 * Empty locations are kept (unknown); only clearly non-India locations are skipped.
 */
export function shouldPersistJobLocation(
  location: string | null | undefined,
): boolean {
  const raw = location?.trim() ?? '';
  if (!raw) {
    return true;
  }
  return isIndiaLocation(raw);
}
