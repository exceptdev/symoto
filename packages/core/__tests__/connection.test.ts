import { describe, it, expect } from 'vitest';
import { unit } from '../src/quantity/units.js';
import type { Boundary } from '../src/quantity/boundary.js';
import type { PortSignature } from '../src/graph/node.js';
import { validateConnection } from '../src/graph/connection.js';

const territorial: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };

function sig(unitName: string, boundary: Boundary): PortSignature {
  return { dimension: unit(unitName).dimension, boundary };
}

describe('validateConnection (wire-time refuse-to-net)', () => {
  it('returns null for matching dimension and compatible boundary', () => {
    expect(validateConnection(sig('MWh', territorial), sig('kWh', territorial))).toBeNull();
  });

  it('returns a dimension error when dimensions differ', () => {
    const err = validateConnection(sig('MWh', territorial), sig('m^2', territorial));
    expect(err?.code).toBe('dimension');
  });

  it('returns a boundary error when dimensions match but boundaries are incompatible', () => {
    const err = validateConnection(
      sig('MWh', territorial),
      sig('MWh', { ...territorial, basis: 'per-capita' }),
    );
    expect(err?.code).toBe('boundary');
  });

  it('honors D-06 at wire time: a custom-dimension-only difference is a boundary error', () => {
    const err = validateConnection(
      sig('MWh', { ...territorial, custom: { scope: 'A' } }),
      sig('MWh', { ...territorial, custom: { scope: 'B' } }),
    );
    expect(err?.code).toBe('boundary');
  });
});
