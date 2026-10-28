const INDIA_CITY =
  /\b(Bengaluru|Bangalore|Hyderabad|Pune|Mumbai|Chennai|New Delhi|Noida|Gurugram|Gurgaon|Kolkata|Kochi|Ahmedabad|Chandigarh)\b/i;

const ABROAD =
  /\b(United States|Mountain View|San Francisco|Seattle|New York|London|Singapore|Canada|Australia|Germany|Ireland)\b/i;

/**
 * Pull a place name out of listing text. Indian cities are labeled so the
 * Jobs page can show them. A clear non-India place is returned as-is so
 * ingest can drop it instead of saving a blank location.
 */
export function locationFromListingText(
  text: string | null | undefined,
): string | null {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) {
    return null;
  }
  if (/various locations within india/i.test(flat)) {
    return 'Various Locations within India';
  }
  const city = flat.match(INDIA_CITY)?.[0];
  if (city) {
    return `${city}, India`;
  }
  if (/\bindia\b/i.test(flat)) {
    return 'India';
  }
  const abroad = flat.match(ABROAD)?.[0];
  return abroad ?? null;
}

/** True when the path or query (not the hostname) says the board is India-scoped. */
export function careerUrlIsIndiaScoped(careerUrl: string): boolean {
  try {
    const url = new URL(careerUrl);
    return /india/i.test(`${url.pathname}?${url.searchParams.toString()}`);
  } catch {
    return false;
  }
}

export function resolveScrapedLocation(
  text: string | null | undefined,
  careerUrl: string,
): string | null {
  return (
    locationFromListingText(text) ??
    (careerUrlIsIndiaScoped(careerUrl) ? 'India' : null)
  );
}
