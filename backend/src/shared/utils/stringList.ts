/**
 * Serialize string lists for SQLite string columns (JSON arrays).
 */
export function serializeStringList(values: string[] | undefined): string | null {
  if (!values || values.length === 0) {
    return null;
  }
  return JSON.stringify(values);
}

export function parseStringList(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
}
