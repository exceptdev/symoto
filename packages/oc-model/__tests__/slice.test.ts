import { describe, it, expect } from 'vitest';
import {
  run,
  q,
  unit,
  input,
  makeRunContext,
  kahnTopoSort,
  resolveFixedPoint,
  type Boundary,
  type Port,
  type QMap,
} from '@symoto/core';
import { buildSlice } from '../src/slice.js';

const LAND: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'stock' };

function popInputs(p: number): QMap {
  return { population: q(p, unit('person'), LAND, input('population')) };
}

const seed = (port: Port) =>
  q(0, port.signature.unit!, port.signature.boundary, input(`seed:${port.id}`));

describe('OC land-energy slice', () => {
  it('runs at NL 50,000 with dwellings ~23810 and total demand ~880017', () => {
    const r = run(buildSlice(), popInputs(50_000));
    expect(r.readouts.dwellings!.value).toBeCloseTo(23_809.52, 1);
    expect(r.readouts.totalDemandMwh!.value).toBeGreaterThan(880_007);
    expect(r.readouts.totalDemandMwh!.value).toBeLessThan(880_027);
    expect(r.readouts.dwellings!.unit.canonical).toContain('dwelling');
  });

  it('resolves the land-energy cycle in exactly 2 iterations, cap-independent above 2', () => {
    const g = buildSlice();
    const order = kahnTopoSort(g);
    expect(order.cyclicNodeIds).toEqual(['n1-land', 'n2-energy']);

    const resolveWith = (cap: number) => {
      const ctx = makeRunContext(popInputs(50_000));
      const values = new Map<string, QMap>();
      const fp = resolveFixedPoint(g, order.cyclicNodeIds, values, ctx, {
        epsilon: 1e-9,
        maxIterations: cap,
        seed,
      });
      return { fp, total: values.get('n1-land')!.totalLandM2!.value };
    };

    const cap2 = resolveWith(2);
    const cap50 = resolveWith(50);
    expect(cap2.fp.iterations).toBe(2);
    expect(cap2.fp.converged).toBe(true);
    expect(cap50.total).toBeCloseTo(cap2.total, 9);
  });

  it('land totals close: built + open + energy-generation land equals total land', () => {
    const r = run(buildSlice(), popInputs(50_000));
    const built = r.readouts.builtLandM2!.value;
    const open = r.readouts.openSpaceM2!.value;
    const energyLand = r.readouts.groundSolarLandM2!.value;
    const total = r.readouts.totalLandM2!.value;
    expect(total).toBeCloseTo(built + open + energyLand, 6);
  });

  it('population 0 produces only finite readouts (no NaN or Infinity)', () => {
    const r = run(buildSlice(), popInputs(0));
    for (const [, value] of Object.entries(r.readouts)) {
      expect(Number.isFinite(value.value)).toBe(true);
    }
    expect(r.readouts.dwellings!.value).toBe(0);
  });

  it('re-running with the same inputs is bit-identical', () => {
    const g = buildSlice();
    const r1 = run(g, popInputs(50_000));
    const r2 = run(g, popInputs(50_000));
    expect(r1.readouts.dwellings!.value).toBe(r2.readouts.dwellings!.value);
    expect(r1.readouts.totalDemandMwh!.value).toBe(r2.readouts.totalDemandMwh!.value);
    expect(r1.readouts.totalLandM2!.value).toBe(r2.readouts.totalLandM2!.value);
  });
});
