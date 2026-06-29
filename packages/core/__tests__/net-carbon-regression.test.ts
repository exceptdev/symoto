import { describe, it, expect } from 'vitest';
import {
  q,
  unit,
  coefficient,
  input,
  add,
  sub,
  adapt,
  BoundaryViolation,
  type Boundary,
  type ProvRef,
} from '@symoto/core';

// The canonical Orchid City net-carbon bug (docs/professor-input-to-symoto.md, line 10):
// "a consumption-based per-capita emissions term (a Netherlands figure) was netted against
// a territorial on-site sequestration term to make a single 'net carbon' number." Symoto must
// make that silent net impossible: a consumption/per-capita boundary and a territorial/absolute
// boundary refuse to net (UNIT-03), and the only legal bridge is an explicit, labeled adapter
// (per-capita-to-absolute via population, from the Plan 02 catalogue).

const CONSUMPTION_PC: Boundary = { accounting: 'consumption', basis: 'per-capita', temporal: 'flow' };
const TERRITORIAL_ABS: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };
// The absolute target the per-capita term is lifted to: same accounting and temporal, basis flipped.
const CONSUMPTION_ABS: Boundary = { accounting: 'consumption', basis: 'absolute', temporal: 'flow' };

// Walk the provenance DAG looking for an adapter crossing.
function hasAdapterInDag(p: ProvRef): boolean {
  if (p.kind === 'adapter') return true;
  if (p.kind === 'op') return p.inputs.some((child) => hasAdapterInDag(child));
  return false;
}

describe('net-carbon regression (UNIT-03): refused directly, legal only under a labeled adapter', () => {
  const perCapitaCo2 = q(2, unit('t'), CONSUMPTION_PC, coefficient('perCapitaCo2NL', true, 'NL'));
  const territorialSequestration = q(1, unit('t'), TERRITORIAL_ABS, input('sequestration'));

  it('refuses to net the per-capita consumption term against the territorial term directly (same unit t)', () => {
    expect(() => sub(perCapitaCo2, territorialSequestration)).toThrow(BoundaryViolation);
    expect(() => add(perCapitaCo2, territorialSequestration)).toThrow(BoundaryViolation);
  });

  it('makes the net legal only through an explicit per-capita-to-absolute adapter, visible in provenance', () => {
    const population = q(50_000, unit('person'), CONSUMPTION_ABS, input('population'));

    // The only legal bridge: lift the per-capita term to an absolute boundary via population.
    const absoluteEmissions = adapt(perCapitaCo2, CONSUMPTION_ABS, 'per-capita-to-absolute', population);

    // (a) the adapted term carries the declared absolute target boundary
    expect(absoluteEmissions.boundary).toEqual(CONSUMPTION_ABS);
    // (b) the crossing is visible: provenance is an adapter record naming the method
    expect(absoluteEmissions.provenance.kind).toBe('adapter');
    if (absoluteEmissions.provenance.kind === 'adapter') {
      expect(absoluteEmissions.provenance.method).toBe('per-capita-to-absolute');
    }

    // (c) the subsequent net under a single declared boundary succeeds, and the adapter
    // record is still reachable in the result's provenance DAG.
    const absoluteOffset = q(40_000, absoluteEmissions.unit, CONSUMPTION_ABS, input('absoluteOffset'));
    const net = sub(absoluteEmissions, absoluteOffset);
    expect(net.boundary).toEqual(CONSUMPTION_ABS);
    expect(hasAdapterInDag(net.provenance)).toBe(true);

    // The final value is finite (no NaN or Infinity).
    expect(Number.isFinite(net.value)).toBe(true);
    expect(net.value).toBeCloseTo(2 * 50_000 - 40_000, 6);
  });
});
