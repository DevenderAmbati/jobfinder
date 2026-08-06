import { describe, expect, it } from 'vitest';
import { resumeMatchText } from './resumeText.js';

describe('resumeMatchText', () => {
  it('ignores a placeholder markdown in favour of the real extracted text', () => {
    const extracted = 'Senior engineer with TypeScript and Node.js. '.repeat(20);

    expect(
      resumeMatchText({
        extractedText: extracted,
        markdown: '# Resume\n\nSoftware Engineer.',
      }),
    ).toBe(extracted.trim());
  });

  it('prefers markdown when it is the fuller copy', () => {
    const markdown = '# Resume\n\nSenior engineer. '.repeat(20);

    expect(
      resumeMatchText({ extractedText: 'Engineer.', markdown }),
    ).toBe(markdown.trim());
  });

  it('falls back to whichever field is present', () => {
    expect(resumeMatchText({ extractedText: 'Engineer.', markdown: null })).toBe(
      'Engineer.',
    );
    expect(resumeMatchText({ extractedText: null, markdown: '# Engineer' })).toBe(
      '# Engineer',
    );
  });

  it('returns empty string when there is no resume', () => {
    expect(resumeMatchText(null)).toBe('');
    expect(resumeMatchText({ extractedText: '   ', markdown: '' })).toBe('');
  });
});
