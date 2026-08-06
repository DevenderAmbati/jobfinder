import type { PromptTemplate } from '../entities/PromptTemplate.js';

export interface PromptTemplateRepository {
  findEnabledByName(name: string): Promise<PromptTemplate | null>;
  findAll(): Promise<PromptTemplate[]>;
  create(input: {
    name: string;
    version: number;
    content: string;
    enabled?: boolean;
  }): Promise<PromptTemplate>;
  update(
    id: string,
    input: { content?: string; enabled?: boolean },
  ): Promise<PromptTemplate>;
}
