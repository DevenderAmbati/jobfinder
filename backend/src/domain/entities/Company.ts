/**
 * Company to monitor — registry entry, never hardcoded in providers.
 */
export interface Company {
  id: string;
  name: string;
  provider: string;
  careerUrl: string;
  enabled: boolean;
  frequency: string;
  lastRun: Date | null;
}
