import type { Resume } from '../entities/Resume.js';

export interface ResumeUpsertInput {
  originalPdfPath?: string | null;
  extractedText: string;
  markdown: string;
  embedding?: string | null;
}

export interface ResumeRepository {
  findCurrent(userId: string): Promise<Resume | null>;
  upsertCurrent(userId: string, input: ResumeUpsertInput): Promise<Resume>;
}
