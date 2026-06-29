import { describe, it, expect } from 'vitest';
import { run, type ProvRef } from '@symoto/core';
import { buildOcModel } from '../src/model.js';
import { goldenById } from './parity/harness.js';

// PROV-03 (ROADMAP Success Criterion 3): when the OC wind siting cap or the water self-sufficiency
// ceiling holds an achieved value below the user's target, the run reports the requested and the
// actual value, the clamped readout marks itself not honored in provenance, an honored scenario is
// not falsely flagged, and no readout value changes.

const golden = goldenById();
const CAPPED_ID = 'base|pop=50000|Netherlands|Wind';
const UNCAPPED_ID = 'base|pop=50000|Netherlands|Wind/Solar';

// Walk a (possibly node-boundary-stamped) provenance DAG for a clamped input carrying requested/actual.
function findClampedInput(p: ProvRef): Extract<ProvRef, { kind: 'input' }> | undefined {
  if (p.kind === 'input') return p.requested !== undefined ? p : undefined;
  if (p.kind === 'node') return findClampedInput(p.local);
  if (p.kind === 'op' || p.kind === 'adapter') {
    for (const c of p.inputs) {
      const f = findClampedInput(c);
      if (f) return f;
    }
  }
  return undefined;
}

describe('requested-vs-actual for OC clamps (PROV-03, SC3)', () => {
  it('reports the wind siting cap: requested target, lower actual, clamped true, with a reason', () => {
    const result = run(buildOcModel({ population: 50_000, country: 'Netherlands', energyScenario: 'Wind' }), {});
    const rec = result.requestedActual.find((r) => r.key === 'energy.selfSufficiency');
    expect(rec).toBeDefined();
    expect(rec!.clamped).toBe(true);
    expect(rec!.requested).toBe(1.0);
    expect(rec!.actual).toBeLessThan(rec!.requested);
    expect(rec!.reason).toMatch(/wind siting cap/i);

    // The readout itself marks not honored: its provenance carries requested and actual.
    const ss = result.readouts['energy.selfSufficiency']!;
    const clampedInput = findClampedInput(ss.provenance);
    expect(clampedInput).toBeDefined();
    expect(clampedInput!.requested).toBe(1.0);
    expect(clampedInput!.actual).toBeCloseTo(rec!.actual, 9);
  });

  it('does not falsely flag an uncapped scenario as clamped', () => {
    const result = run(buildOcModel({ population: 50_000, country: 'Netherlands', energyScenario: 'Wind/Solar' }), {});
    const cappedEnergy = result.requestedActual.filter((r) => r.key === 'energy.selfSufficiency' && r.clamped);
    expect(cappedEnergy).toHaveLength(0);
    // An honored record is still emitted (clamped false), so honoring is reported, not assumed.
    const honored = result.requestedActual.find((r) => r.key === 'energy.selfSufficiency');
    expect(honored?.clamped).toBe(false);
    // The honored readout's provenance is not marked not-honored.
    const ss = result.readouts['energy.selfSufficiency']!;
    expect(findClampedInput(ss.provenance)).toBeUndefined();
  });

  it('records the water self-sufficiency clamp on a second domain', () => {
    const result = run(buildOcModel({ population: 50_000, country: 'Netherlands', energyScenario: 'Wind' }), {});
    const water = result.requestedActual.find((r) => r.key === 'water.selfSufficiencyPct');
    expect(water).toBeDefined();
    expect(water!.clamped).toBe(true);
    expect(water!.actual).toBeLessThan(water!.requested);
    const ws = result.readouts['water.selfSufficiencyPct']!;
    expect(findClampedInput(ws.provenance)).toBeDefined();
  });

  it('parity guard: the clamped readout values are unchanged', () => {
    const result = run(buildOcModel({ population: 50_000, country: 'Netherlands', energyScenario: 'Wind' }), {});
    const g = golden.get(CAPPED_ID)!;
    const ge = g.result.energy as { selfSufficiency: number };
    const gw = g.result.water as { selfSufficiencyPct: number };
    expect(result.readouts['energy.selfSufficiency']!.value).toBeCloseTo(ge.selfSufficiency, 9);
    expect(result.readouts['water.selfSufficiencyPct']!.value).toBeCloseTo(gw.selfSufficiencyPct, 9);
    // And the uncapped scenario's value is also unchanged.
    const u = run(buildOcModel({ population: 50_000, country: 'Netherlands', energyScenario: 'Wind/Solar' }), {});
    const ue = golden.get(UNCAPPED_ID)!.result.energy as { selfSufficiency: number };
    expect(u.readouts['energy.selfSufficiency']!.value).toBeCloseTo(ue.selfSufficiency, 9);
  });
});
