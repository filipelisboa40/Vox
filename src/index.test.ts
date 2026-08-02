import { describe, expect, it } from 'vitest';

import { applicationName } from './index.js';

describe('application entry point', () => {
  it('exposes the application name', () => {
    expect(applicationName).toBe('Vox');
  });
});
