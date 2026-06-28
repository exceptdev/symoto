import { describe, it, expect } from 'vitest';
import { SYMOTO_CORE_VERSION } from '../src/index.js';

describe('@symoto/core smoke', () => {
  it('exposes a defined version placeholder', () => {
    expect(SYMOTO_CORE_VERSION).toBeDefined();
    expect(typeof SYMOTO_CORE_VERSION).toBe('string');
  });
});
