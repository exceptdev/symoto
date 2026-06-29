import { describe, it, expect } from 'vitest';
import { validateRunExport, type SerializedCompound } from '@symoto/core';
import { exportOcRun } from '../src/export.js';
import { flagOcInvariance } from '../src/invariance.js';
import { goldenById } from './parity/harness.js';

// The OC run export (PROV-04) composes every trust layer (topology, scalar readouts, the Phase 5
// trace, the honest compounds, the invariance flags, requested-vs-actual, the attribution meta) and
// leaves the parity numbers unchanged.

const golden = goldenById();
const BASELINE_ID = 'base|pop=50000|Netherlands|Wind/Solar';
const CAPPED_ID = 'base|pop=50000|Netherlands|Wind';

const OC_NODE_IDS = ['n1-land', 'n2-energy', 'n3-water', 'n4-waste', 'n5-jobs', 'n6-food', 'n7-cost', 'n8-emissions'];

describe('exportOcRun composes the OC run export (PROV-04)', () => {
  it('carries the eight OC nodes and the land<->energy feedback edges', () => {
    const exp = exportOcRun({ population: 50_000, country: 'Netherlands' });
    const ids = exp.topology.nodes.map((n) => n.id).sort();
    expect(ids).toEqual([...OC_NODE_IDS].sort());

    // The land<->energy feedback survives as two directed edge id pairs.
    const conns = exp.topology.connections;
    const landToEnergy = conns.some((c) => c.fromNodeId === 'n1-land' && c.toNodeId === 'n2-energy');
    const energyToLand = conns.some((c) => c.fromNodeId === 'n2-energy' && c.toNodeId === 'n1-land');
    expect(landToEnergy).toBe(true);
    expect(energyToLand).toBe(true);
  });

  it('carries scalar readouts, a non-empty Phase 5 trace, both compounds, flags, and attribution meta', () => {
    const exp = exportOcRun({ population: 50_000, country: 'Netherlands' });

    // Headline readouts are { value, unit, boundary } scalars with no provenance key.
    const demand = exp.readouts['energy.totalDemandMwh']!;
    expect(typeof demand.value).toBe('number');
    expect(demand.unit.canonical).toBeTruthy();
    expect('provenance' in demand).toBe(false);
    const net = exp.readouts['emissions.netCarbonTonnesPerYr']!;
    expect(typeof net.value).toBe('number');
    expect('provenance' in net).toBe(false);

    // Provenance trace is non-empty node + edge id lists.
    expect(exp.provenance.nodes.length).toBeGreaterThan(0);
    expect(exp.provenance.edges.length).toBeGreaterThan(0);

    // Both honest compounds are present, each carrying gross-in, gross-out, and net.
    const compounds = exp.compounds as readonly SerializedCompound[];
    const carbon = compounds.find((c) => c.key === 'emissions.carbon')!;
    expect(carbon).toBeDefined();
    expect(componentByRoleSer(carbon, 'gross-in')).toBeDefined();
    expect(componentByRoleSer(carbon, 'gross-out')).toBeDefined();
    expect(componentByRoleSer(carbon, 'net')).toBeDefined();
    const energy = compounds.find((c) => c.key === 'energy.balance')!;
    expect(energy).toBeDefined();
    expect(componentByRoleSer(energy, 'gross-in')).toBeDefined();
    expect(componentByRoleSer(energy, 'gross-out')).toBeDefined();

    // The invariance flags are the flagOcInvariance() set (non-empty historical constants).
    expect(exp.invarianceFlags).toEqual(flagOcInvariance());
    expect(exp.invarianceFlags!.length).toBeGreaterThan(0);

    // Attribution and scenario meta.
    expect(exp.meta!.poweredBy).toBe('Symoto');
    expect(exp.meta!.license).toBe('AGPL-3.0');
    expect(exp.meta!.locale).toBe('NL');
    expect((exp.meta!.scenario as { population: number }).population).toBe(50_000);
  });

  it('validateRunExport passes on the OC export', () => {
    const exp = exportOcRun({ population: 50_000, country: 'Netherlands' });
    const result = validateRunExport(exp);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('carries the wind siting cap as a clamped requested-vs-actual record', () => {
    const exp = exportOcRun({ population: 50_000, country: 'Netherlands', energyScenario: 'Wind' });
    const rec = exp.requestedActual.find((r) => r.key === 'energy.selfSufficiency');
    expect(rec).toBeDefined();
    expect(rec!.clamped).toBe(true);
    expect(rec!.actual).toBeLessThan(rec!.requested);
  });

  it('embeds an optional playback series with scalar frames when withSeries is set', () => {
    const exp = exportOcRun({ population: 50_000, country: 'Netherlands' }, { withSeries: { horizon: 5 } });
    expect(exp.series).toBeDefined();
    expect(exp.series!.meta.horizon).toBe(5);
    const frame = exp.series!.frames[0]!;
    const anyReadout = Object.values(frame.readouts)[0]!;
    expect(typeof anyReadout.value).toBe('number');
    expect('provenance' in anyReadout).toBe(false);
  });

  it('parity guard: exported baseline readout values equal the golden master', () => {
    const exp = exportOcRun({ population: 50_000, country: 'Netherlands' });
    const g = golden.get(BASELINE_ID)!;
    const ge = g.result.energy as { totalDemandMwh: number };
    const gm = g.result.emissions as { netCarbonTonnesPerYr: number };
    expect(exp.readouts['energy.totalDemandMwh']!.value).toBeCloseTo(ge.totalDemandMwh, 6);
    expect(exp.readouts['emissions.netCarbonTonnesPerYr']!.value).toBeCloseTo(gm.netCarbonTonnesPerYr, 6);

    // And the clamped scenario's exported values match the golden master too.
    const capped = exportOcRun({ population: 50_000, country: 'Netherlands', energyScenario: 'Wind' });
    const cg = golden.get(CAPPED_ID)!.result.energy as { selfSufficiency: number };
    expect(capped.readouts['energy.selfSufficiency']!.value).toBeCloseTo(cg.selfSufficiency, 9);
  });
});

/** Find a serialized compound component by role (the serialized analog of componentByRole). */
function componentByRoleSer(c: SerializedCompound, role: string) {
  return c.components.find((comp) => comp.role === role);
}
