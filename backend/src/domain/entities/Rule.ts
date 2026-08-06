export interface Rule {
  id: string;
  name: string;
  countries: string[];
  cities: string[];
  experience: string | null;
  skills: string[];
  roles: string[];
  excludedRoles: string[];
  companies: string[];
  minMatchScore: number;
  enabled: boolean;
}
