import { describe, it, expect } from 'vitest';
import { SYMOTO_OC_MODEL_VERSION } from '../src/index.js';

describe('@symoto/oc-model smoke', () => {
  it('exposes a defined version placeholder', () => {
    expect(SYMOTO_OC_MODEL_VERSION).toBeDefined();
    expect(typeof SYMOTO_OC_MODEL_VERSION).toBe('string');
  });
});
