import type { Resume } from '../entities/Resume.js';

export interface ResumeUpsertInput {
  originalPdfPath?: string | null;
  extractedText: string;
  markdown: string;
  embedding?: string | null;
}

export interface ResumeRepository {
  findCurrent(): Promise<Resume | null>;
  upsertCurrent(input: ResumeUpsertInput): Promise<Resume>;
}
