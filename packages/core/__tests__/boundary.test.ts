import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  boundariesEqual,
  assertSameBoundary,
  BoundaryViolation,
  type Boundary,
} from '../src/quantity/boundary.js';
import { arbBoundary } from './arbitraries.js';

const base: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };

describe('boundary', () => {
  it('identical boundaries are equal', () => {
    expect(boundariesEqual(base, { ...base })).toBe(true);
  });

  it('a difference in any fixed field breaks equality', () => {
    expect(boundariesEqual(base, { ...base, accounting: 'consumption' })).toBe(false);
    expect(boundariesEqual(base, { ...base, basis: 'per-capita' })).toBe(false);
    expect(boundariesEqual(base, { ...base, temporal: 'stock' })).toBe(false);
    expect(boundariesEqual(base, { ...base, locale: 'NL' })).toBe(false);
  });

  it('D-06: a custom-dimension-only difference breaks equality', () => {
    const a: Boundary = { ...base, custom: { scope: 'A' } };
    const b: Boundary = { ...base, custom: { scope: 'B' } };
    expect(boundariesEqual(a, b)).toBe(false);
    // one with custom and one without are not equal (absent != wildcard)
    expect(boundariesEqual(a, base)).toBe(false);
  });

  it('an identical custom map is equal regardless of key order', () => {
    const a: Boundary = { ...base, custom: { scope: 'A', method: 'M' } };
    const b: Boundary = { ...base, custom: { method: 'M', scope: 'A' } };
    expect(boundariesEqual(a, b)).toBe(true);
  });

  it('assertSameBoundary throws BoundaryViolation on any non-equal pair', () => {
    expect(() => assertSameBoundary(base, { ...base, basis: 'per-capita' })).toThrow(
      BoundaryViolation,
    );
    expect(() =>
      assertSameBoundary({ ...base, custom: { scope: 'A' } }, { ...base, custom: { scope: 'B' } }),
    ).toThrow(BoundaryViolation);
  });

  it('property: any non-equal boundary pair makes assertSameBoundary throw (D-06)', () => {
    fc.assert(
      fc.property(arbBoundary, arbBoundary, (a, b) => {
        fc.pre(!boundariesEqual(a, b));
        expect(() => assertSameBoundary(a, b)).toThrow(BoundaryViolation);
      }),
    );
  });
});
