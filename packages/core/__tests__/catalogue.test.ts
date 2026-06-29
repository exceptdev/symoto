import { describe, it, expect } from 'vitest';
import type { Boundary } from '../src/quantity/boundary.js';
import { input, adapterProv } from '../src/quantity/provenance.js';

const PER_CAPITA: Boundary = { accounting: 'consumption', basis: 'per-capita', temporal: 'flow' };
const ABSOLUTE: Boundary = { accounting: 'consumption', basis: 'absolute', temporal: 'flow' };

describe('adapterProv (adapter provenance variant)', () => {
  it('returns an adapter-kind ProvRef naming the method, both boundaries, and a single input', () => {
    const child = input('perCapitaTerm');
    const p = adapterProv('per-capita-to-absolute', PER_CAPITA, ABSOLUTE, [child]);
    expect(p.kind).toBe('adapter');
    if (p.kind === 'adapter') {
      expect(p.method).toBe('per-capita-to-absolute');
      expect(p.from).toEqual(PER_CAPITA);
      expect(p.to).toEqual(ABSOLUTE);
      expect(p.inputs).toHaveLength(1);
    }
  });
});
