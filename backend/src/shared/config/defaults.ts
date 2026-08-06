export const JOB_MATCH_PROMPT_NAME = 'job_match';

/** Fallback when CRON_FREQUENCY / CRON_DEFAULT_EXPRESSION are unset. */
export const FALLBACK_CRON_EXPRESSION = '0 */6 * * *';

export const DEFAULT_JOB_MATCH_PROMPT = `You are an experienced engineering recruiter.

Compare this resume with this job description.

Return JSON only with these keys:
- matchScore (number 0-100)
- reasons (string array)
- missingSkills (string array)
- interviewDifficulty (string)
- salaryEstimate (string)
- recommendation ("APPLY" or "SKIP")

Resume:
{{resume}}

Job Description:
{{job}}
`;

export const DEFAULT_PROVIDERS = [
  'greenhouse',
  'lever',
  'workday',
  'microsoft',
  'ashby',
  'smartrecruiters',
  'successfactors',
  'oracle',
  'eightfold',
  'avature',
  'sap',
  'goldman',
  'custom',
  'stub',
] as const;
