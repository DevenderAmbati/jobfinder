import { describe, expect, it } from 'vitest';
import {
  extractExperienceYears,
  resolveExperienceLabel,
} from './experience.js';

describe('extractExperienceYears', () => {
  it('parses ranges', () => {
    expect(extractExperienceYears('4 to 8 years of experience')).toBe(
      '4–8 years',
    );
    expect(extractExperienceYears('1-3 years of experience')).toBe('1–3 years');
  });

  it('parses minimum / plus forms', () => {
    expect(extractExperienceYears('5+ years of experience required')).toBe(
      '5+ years',
    );
    expect(extractExperienceYears('Minimum 6 years')).toBe('6+ years');
    expect(extractExperienceYears('at least 3 years')).toBe('3+ years');
  });

  it('reads from qualifications blocks', () => {
    expect(
      extractExperienceYears(
        'About the role\nBuild products.\n\nRequirements:\n3+ years of experience with React\n',
      ),
    ).toBe('3+ years');
  });
});

describe('resolveExperienceLabel', () => {
  it('prefers JD years over ATS level labels', () => {
    expect(
      resolveExperienceLabel(
        'Mid-Senior Level',
        'We need 5+ years of experience in TypeScript',
      ),
    ).toBe('5+ years');
  });

  it('drops employment-type junk', () => {
    expect(resolveExperienceLabel('Full time', null)).toBeNull();
  });

  it('keeps an already year-like experience field', () => {
    expect(resolveExperienceLabel('3-5 years', null)).toBe('3–5 years');
  });
});
