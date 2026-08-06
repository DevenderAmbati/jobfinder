import type { Job } from '../../domain/entities/Job.js';
import type {
  JobMatcher,
  MatchResult,
} from '../../domain/ports/JobMatcher.js';
import type { PromptTemplateRepository } from '../../domain/repositories/PromptTemplateRepository.js';
import { JOB_MATCH_PROMPT_NAME } from '../../shared/config/defaults.js';
import { logger } from '../../shared/utils/logger.js';

interface GeminiMatcherDeps {
  apiKey: string;
  prompts: PromptTemplateRepository;
  model?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Gemini matcher — never called directly by pipeline without a resilient wrapper.
 */
export class GeminiJobMatcher implements JobMatcher {
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;

  constructor(private readonly deps: GeminiMatcherDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.model = deps.model ?? 'gemini-2.0-flash';
  }

  async match(resumeText: string, job: Job): Promise<MatchResult> {
    const template = await this.deps.prompts.findEnabledByName(
      JOB_MATCH_PROMPT_NAME,
    );
    if (!template) {
      throw new Error('No enabled job_match prompt template found');
    }

    const prompt = template.content
      .replace('{{resume}}', resumeText)
      .replace(
        '{{job}}',
        [
          `Title: ${job.title}`,
          `Company: ${job.company}`,
          `Location: ${job.location ?? ''}`,
          `Description: ${job.description ?? ''}`,
          `Skills: ${job.skills ?? ''}`,
        ].join('\n'),
      );

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${encodeURIComponent(this.deps.apiKey)}`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini HTTP ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text =
      payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    if (!text) {
      throw new Error('Gemini returned empty content');
    }

    const parsed = parseGeminiJson(text);
    logger.info('Gemini match completed', {
      title: job.title,
      score: parsed.score,
    });
    return parsed;
  }
}

function parseGeminiJson(text: string): MatchResult {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const raw = JSON.parse(cleaned) as Record<string, unknown>;

  const score = Number(raw.matchScore ?? raw.score ?? 0);
  const reasons = Array.isArray(raw.reasons)
    ? raw.reasons.filter((item): item is string => typeof item === 'string')
    : [];
  const missingSkills = Array.isArray(raw.missingSkills)
    ? raw.missingSkills.filter((item): item is string => typeof item === 'string')
    : [];
  const recommendation =
    String(raw.recommendation ?? 'SKIP').toUpperCase() === 'APPLY'
      ? 'APPLY'
      : 'SKIP';

  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
    reasons,
    missingSkills,
    interviewDifficulty:
      typeof raw.interviewDifficulty === 'string'
        ? raw.interviewDifficulty
        : null,
    salaryEstimate:
      typeof raw.salaryEstimate === 'string' ? raw.salaryEstimate : null,
    recommendation,
    source: 'GEMINI',
  };
}
