import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { unit } from '../src/quantity/units.js';
import type { Boundary } from '../src/quantity/boundary.js';
import { q, isQuantity, type Quantity } from '../src/quantity/quantity.js';
import { input, coefficient, opProv } from '../src/quantity/provenance.js';
import { arbQuantity } from './arbitraries.js';

const b: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };

describe('provenance', () => {
  it('input, coefficient, and opProv build the expected records', () => {
    expect(input('pop')).toEqual({ kind: 'input', portId: 'pop' });
    const c = coefficient('hh', true, 'src');
    expect(c).toMatchObject({ kind: 'coefficient', id: 'hh', localeSensitive: true, source: 'src' });
    const op = opProv('add', [input('a'), input('b')]);
    expect(op.kind).toBe('op');
    if (op.kind === 'op') {
      expect(op.op).toBe('add');
      expect(op.inputs).toHaveLength(2);
    }
  });
});

describe('quantity', () => {
  it('q() returns a frozen envelope', () => {
    const x = q(5, unit('MWh'), b, input('x'));
    expect(Object.isFrozen(x)).toBe(true);
    expect(x.value).toBe(5);
    expect(() => {
      // @ts-expect-error value is readonly and the envelope is frozen
      x.value = 9;
    }).toThrow();
  });

  it('isQuantity rejects non-Quantity values and accepts a real one', () => {
    expect(isQuantity(5)).toBe(false);
    expect(isQuantity({})).toBe(false);
    expect(isQuantity(null)).toBe(false);
    expect(isQuantity(q(1, unit('MWh'), b, input('x')))).toBe(true);
  });

  it('property: any arbQuantity is frozen and passes isQuantity', () => {
    fc.assert(
      fc.property(arbQuantity, (x) => {
        expect(Object.isFrozen(x)).toBe(true);
        expect(isQuantity(x)).toBe(true);
      }),
    );
  });
});

// Compile-time guarantee: a node-style function typed to return Quantity cannot
// return a bare number. If this ever compiled, the @ts-expect-error directive itself
// would become an error, failing `tsc -p tsconfig.test.json`.
function _bareNumberNode(): Quantity {
  // @ts-expect-error a bare number cannot cross a port where a Quantity is required
  return 5;
}
void _bareNumberNode;
