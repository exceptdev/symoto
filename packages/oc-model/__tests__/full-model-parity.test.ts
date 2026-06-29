import { describe, it, expect } from 'vitest';
import { run, validateModel, assertModelWellFormed, type QMap } from '@symoto/core';
import { buildOcModel } from '../src/model.js';
import { computeLandUseRaw } from '../src/nodes/land.js';
import { PARITY_GRID, compareReadout, isNamedDeviation, NAMED_DEVIATIONS, goldenById } from './parity/harness.js';

// The integration test: the eight domain nodes assembled into one graph that passes the Phase-2
// build-time boundary guard, reproduces the full ScenarioResult over the grid (every readout,
// every deviation named), and localizes per country end to end.

const golden = goldenById();
const DOMAINS = ['landUse', 'energy', 'water', 'food', 'waste', 'emissions', 'jobs', 'cost'] as const;
// Keys that are not numeric scalar readouts: echoes, strings, arrays/objects covered elsewhere.
const SKIP_KEYS = new Set(['population', 'country', 'inputs', 'ha', 'byCategory', 'turbineClass', 'regenerative']);

function compareLeaves(readouts: QMap, prefix: string, goldenObj: Record<string, unknown>, id: string): void {
  for (const [k, v] of Object.entries(goldenObj)) {
    if (SKIP_KEYS.has(k)) continue;
    if (isNamedDeviation(k)) {
      expect(NAMED_DEVIATIONS.some((d) => d.readout === k)).toBe(true);
      continue;
    }
    const path = `${prefix}.${k}`;
    if (typeof v === 'number') {
      const r = readouts[path];
      expect(r, `${id}: missing readout ${path}`).toBeTruthy();
      const res = compareReadout(k, r!.value, v);
      expect(res.pass, `${id}: ${path} actual=${r!.value} golden=${v} relErr=${res.relError}`).toBe(true);
    } else if (typeof v === 'boolean') {
      // windCapped is the only compared boolean; stored numerically as 0/1 under exact policy.
      if (k === 'windCapped') {
        const r = readouts[path];
        expect(compareReadout(k, r!.value, v ? 1 : 0, 'exact').pass, `${id}: ${path}`).toBe(true);
      }
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      compareLeaves(readouts, path, v as Record<string, unknown>, id);
    }
  }
}

describe('full-model parity through the boundary guard (MODEL-01, MODEL-02, MODEL-03)', () => {
  it('the assembled model passes validateModel and assertModelWellFormed', () => {
    const g = buildOcModel({ population: 50_000, country: 'Netherlands' });
    expect(validateModel(g)).toEqual([]);
    expect(() => assertModelWellFormed(g)).not.toThrow();
    expect(g.nodes.map((n) => n.id).sort()).toEqual([
      'n1-land', 'n2-energy', 'n3-water', 'n4-waste', 'n5-jobs', 'n6-food', 'n7-cost', 'n8-emissions',
    ]);
  });

  it('reproduces the full ScenarioResult across the grid (every readout, deviations named)', () => {
    for (const scenario of PARITY_GRID) {
      const g = golden.get(scenario.id)!;
      const result = run(buildOcModel(scenario.inputs), {});
      for (const dom of DOMAINS) {
        compareLeaves(result.readouts, dom, g.result[dom] as Record<string, unknown>, scenario.id);
      }
      // byCategory and the hectare view (not emitted as readouts) are verified via the raw port.
      const lg = g.result.landUse as { energyGenerationLandM2: number; byCategory: unknown; ha: unknown };
      const lu = computeLandUseRaw(scenario.inputs, undefined, lg.energyGenerationLandM2);
      expect(lu.byCategory, scenario.id).toEqual(lg.byCategory);
      expect(lu.ha, scenario.id).toEqual(lg.ha);
    }
  });

  it('localizes per country end to end (NL, VN, BR each match the golden master)', () => {
    for (const country of ['Netherlands', 'Vietnam', 'Brazil'] as const) {
      const id = `base|pop=50000|${country}|Wind/Solar`;
      const g = golden.get(id)!;
      const result = run(buildOcModel({ population: 50_000, country }), {});
      for (const dom of DOMAINS) {
        compareLeaves(result.readouts, dom, g.result[dom] as Record<string, unknown>, id);
      }
    }
  });
});
