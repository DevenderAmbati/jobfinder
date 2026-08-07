export interface Rule {
  id: string;
  userId: string;
  experience: string | null;
  skills: string[];
  roles: string[];
  minMatchScore: number;
}

/** True when the user configured at least one preference used in rule fit. */
export function ruleHasPreferences(rule: Rule | null | undefined): boolean {
  if (!rule) {
    return false;
  }
  return (
    rule.roles.length > 0 ||
    rule.skills.length > 0 ||
    Boolean(rule.experience?.trim())
  );
}
