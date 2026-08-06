import { describe, expect, it } from 'vitest';
import {
  chromiumLaunchOptions,
  configurePlaywrightRuntime,
} from './browserSession.js';

describe('chromiumLaunchOptions', () => {
  it('merges production args and respects headless override', () => {
    configurePlaywrightRuntime({ headless: true, maxConcurrent: 2 });
    const options = chromiumLaunchOptions({
      headless: false,
      args: ['--window-size=1280,720'],
    });
    expect(options.headless).toBe(false);
    expect(options.args).toEqual(
      expect.arrayContaining([
        '--disable-dev-shm-usage',
        '--window-size=1280,720',
      ]),
    );
  });
});
