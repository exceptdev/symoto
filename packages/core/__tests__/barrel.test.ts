import { describe, it, expect } from 'vitest';
import {
  q,
  isQuantity,
  unit,
  add,
  sub,
  mul,
  div,
  scale,
  convert,
  validateConnection,
  buildGraph,
  run,
  makeRunContext,
  boundariesCompatible,
  input,
  // Phase 2 surface
  validateModel,
  assertModelWellFormed,
  BOUNDARY_CATALOGUE,
  findTransition,
  adapterProv,
  makeAdapterNode,
  adapt,
} from '@symoto/core';

describe('@symoto/core public barrel', () => {
  it('resolves the package exports field and exposes the Phase-1 core API', () => {
    for (const sym of [q, isQuantity, unit, add, sub, mul, div, scale, convert, validateConnection, buildGraph, run, makeRunContext, boundariesCompatible, input]) {
      expect(sym).toBeDefined();
      expect(typeof sym).toBe('function');
    }
  });

  it('exposes the Phase-2 boundary-system surface (UNIT-01..05)', () => {
    for (const fn of [validateModel, assertModelWellFormed, findTransition, adapterProv, makeAdapterNode, adapt]) {
      expect(fn).toBeDefined();
      expect(typeof fn).toBe('function');
    }
    // BOUNDARY_CATALOGUE is a curated value (a frozen array), not a function.
    expect(BOUNDARY_CATALOGUE).toBeDefined();
    expect(Array.isArray(BOUNDARY_CATALOGUE)).toBe(true);
    expect(BOUNDARY_CATALOGUE.length).toBeGreaterThanOrEqual(3);
  });
});
