import { describe, it, expect } from 'vitest';
import { q, isQuantity, unit, add, sub, mul, div, scale, convert, validateConnection, buildGraph, run, makeRunContext, boundariesCompatible, input } from '@symoto/core';

describe('@symoto/core public barrel', () => {
  it('resolves the package exports field and exposes the core API', () => {
    for (const sym of [q, isQuantity, unit, add, sub, mul, div, scale, convert, validateConnection, buildGraph, run, makeRunContext, boundariesCompatible, input]) {
      expect(sym).toBeDefined();
      expect(typeof sym).toBe('function');
    }
  });
});
