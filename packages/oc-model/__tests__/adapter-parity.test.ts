import { describe, it, expect } from 'vitest';
import { run, type QMap } from '@symoto/core';
import { buildOcModel } from '../src/model.js';
import { computeScenarioViaSymoto, type ScenarioResult } from '../src/scenario.js';
import { PARITY_GRID, compareReadout, isNamedDeviation, NAMED_DEVIATIONS } from '../src/parity.js';
import { goldenById } from './parity/harness.js';

// The adapter-parity gate (SWAP-01): computeScenarioViaSymoto must reproduce the Phase 3 golden
// master across the full grid AND every numeric scalar it returns must equal the graph readout
// exactly (proving the adapter does not recompute outside the Symoto graph), with no undefined
// or NaN anywhere in the returned ScenarioResult.

const golden = goldenById();
const DOMAINS = ['landUse', 'energy', 'water', 'food', 'waste', 'emissions', 'jobs', 'cost'] as const;

// Numeric leaves the graph does not emit as scalar readouts; they are structural (the hectare
// reprojection and per-program breakdown) or an input echo, and are sourced from the parity-proven
// scaffold rather than a readout. Kept in lockstep with scenario.ts isStructuralNumericPath.
function isStructuralPath(path: string): boolean {
  return (
    path.startsWith('landUse.ha.') ||
    path.startsWith('landUse.byCategory.') ||
    path === 'energy.population'
  );
}

/**
 * Parallel walk of the adapter result and the golden result. For every numeric leaf: assert it
 * is finite, matches the golden master under the shared policy, and (unless structural) equals
 * the corresponding graph readout exactly.
 */
function walk(path: string, leafName: string, a: unknown, g: unknown, readouts: QMap, id: string): void {
  if (isNamedDeviation(leafName)) {
    expect(NAMED_DEVIATIONS.some((d) => d.readout === leafName)).toBe(true);
    return;
  }
  if (typeof g === 'number') {
    expect(a, `${id}: ${path} adapter value is not a number (got ${String(a)})`).toBeTypeOf('number');
    const av = a as number;
    expect(Number.isFinite(av), `${id}: ${path} adapter value is not finite (${av})`).toBe(true);
    const res = compareReadout(leafName, av, g);
    expect(res.pass, `${id}: ${path} adapter=${av} golden=${g} relErr=${res.relError}`).toBe(true);
    if (!isStructuralPath(path)) {
      const r = readouts[path];
      expect(r, `${id}: missing graph readout ${path}`).toBeTruthy();
      expect(av, `${id}: ${path} adapter=${av} does not equal graph readout=${r!.value}`).toBe(r!.value);
    }
    return;
  }
  if (typeof g === 'boolean') {
    expect(a, `${id}: ${path} expected boolean`).toBeTypeOf('boolean');
    if (leafName === 'windCapped') {
      expect(compareReadout(leafName, a as boolean, g, 'exact').pass, `${id}: ${path} windCapped`).toBe(true);
    } else {
      expect(a, `${id}: ${path}`).toBe(g);
    }
    return;
  }
  if (typeof g === 'string') {
    expect(a, `${id}: ${path}`).toBe(g);
    return;
  }
  if (Array.isArray(g)) {
    expect(Array.isArray(a), `${id}: ${path} expected array`).toBe(true);
    const aa = a as unknown[];
    expect(aa.length, `${id}: ${path} array length`).toBe(g.length);
    g.forEach((gi, i) => walk(`${path}.${i}`, leafName, aa[i], gi, readouts, id));
    return;
  }
  if (g !== null && typeof g === 'object') {
    expect(a !== null && typeof a === 'object', `${id}: ${path} expected object`).toBe(true);
    const ao = a as Record<string, unknown>;
    for (const [k, gv] of Object.entries(g as Record<string, unknown>)) {
      // The engine's domain interfaces deliberately drop the per-domain country/population
      // echoes the bespoke engine carried (Phase 3 scope decision; no Vizapp consumer reads
      // them). Skip an echo key only when the adapter omits it; any other gap must fail.
      if (!(k in ao) && (k === 'country' || k === 'population')) continue;
      expect(k in ao, `${id}: ${path}.${k} missing in adapter result`).toBe(true);
      walk(`${path}.${k}`, k, ao[k], gv, readouts, id);
    }
    return;
  }
}

/** Deep scan for any undefined value or non-finite number anywhere in the result. */
function assertNoUndefinedOrNaN(path: string, value: unknown, id: string): void {
  expect(value, `${id}: ${path} is undefined`).not.toBeUndefined();
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${id}: ${path} is not finite (${value})`).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoUndefinedOrNaN(`${path}.${i}`, item, id));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertNoUndefinedOrNaN(`${path}.${k}`, v, id);
  }
}

describe('computeScenarioViaSymoto adapter parity (SWAP-01)', () => {
  it('reproduces the golden master across the full grid, with every scalar sourced from the graph', () => {
    for (const scenario of PARITY_GRID) {
      const g = golden.get(scenario.id);
      expect(g, `golden master missing scenario ${scenario.id}`).toBeTruthy();
      const result: ScenarioResult = computeScenarioViaSymoto(scenario.inputs);
      const { readouts } = run(buildOcModel(scenario.inputs), {});
      for (const dom of DOMAINS) {
        walk(dom, dom, (result as unknown as Record<string, unknown>)[dom], g!.result[dom], readouts, scenario.id);
      }
    }
  }, 60_000);

  it('returns no undefined and no NaN/Infinity anywhere in the ScenarioResult, over the full grid', () => {
    for (const scenario of PARITY_GRID) {
      const result = computeScenarioViaSymoto(scenario.inputs);
      assertNoUndefinedOrNaN('result', result, scenario.id);
    }
  }, 30_000);

  it('localizes per country (NL, VN, BR each match the golden master)', () => {
    for (const country of ['Netherlands', 'Vietnam', 'Brazil'] as const) {
      const id = `base|pop=50000|${country}|Wind/Solar`;
      const g = golden.get(id);
      expect(g, `golden master missing ${id}`).toBeTruthy();
      const result = computeScenarioViaSymoto({ population: 50_000, country });
      const { readouts } = run(buildOcModel({ population: 50_000, country }), {});
      for (const dom of DOMAINS) {
        walk(dom, dom, (result as unknown as Record<string, unknown>)[dom], g!.result[dom], readouts, id);
      }
    }
  });

  it('throws loudly rather than returning undefined when a structurally valid input is used (no silent gaps)', () => {
    // A baseline run must not throw and must populate the headline fields.
    const r = computeScenarioViaSymoto({ population: 50_000, country: 'Netherlands' });
    expect(r.energy.totalDemandMwh).toBeGreaterThan(0);
    expect(r.landUse.housingUnits).toBeGreaterThan(0);
    expect(typeof r.energy.windCapped).toBe('boolean');
    expect(r.energy.turbineClass).toBe('medium');
  });
});
