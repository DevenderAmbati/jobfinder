export interface ResumeTextSource {
  extractedText?: string | null;
  markdown?: string | null;
}

/**
 * Picks the resume text that matching should run against.
 *
 * Both fields are optional in practice: PDF upload fills `extractedText` while
 * `markdown` may still hold a seeded or hand-written placeholder. Preferring
 * markdown unconditionally let a one-line placeholder shadow a full resume and
 * silently collapse every match score, so the richer text wins.
 */
export function resumeMatchText(resume: ResumeTextSource | null): string {
  const extracted = resume?.extractedText?.trim() ?? '';
  const markdown = resume?.markdown?.trim() ?? '';
  return markdown.length >= extracted.length ? markdown : extracted;
}
