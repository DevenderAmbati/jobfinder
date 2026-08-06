/**
 * Normalized job posting — domain representation shared across providers.
 * Provider-specific shapes must be mapped into this model before persistence.
 */
export interface Job {
  id?: string;
  company: string;
  companyId?: string;
  title: string;
  location: string | null;
  description: string | null;
  experience: string | null;
  skills: string | null;
  salary: string | null;
  /** Match-pipeline estimate when listing salary is absent */
  salaryEstimate?: string | null;
  postedDate: Date | null;
  applyUrl: string;
  provider: string;
  dedupHash?: string;
  matchScore?: number | null;
  matchSource?: 'GEMINI' | 'KEYWORD' | null;
  recommendation?: string | null;
  /** Human-readable match explanations (includes "Matched: …" / "Skills matched: …"). */
  matchReasons?: string[] | null;
  /** Job focus tokens not found in the resume. */
  missingSkills?: string[] | null;
  createdAt?: Date;
}
