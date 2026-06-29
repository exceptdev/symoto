import { describe, it, expect } from 'vitest';
import { run, reconstruct, type ProvRef } from '@symoto/core';
import { buildOcModel } from '../src/model.js';
import { PROVENANCE_META } from '../src/provenanceMeta.js';
import { NET_CARBON_METHOD } from '../src/nodes/emissions.js';
import { goldenById } from './parity/harness.js';

// PROV-01 end to end (ROADMAP Success Criterion 1): a real OC readout's origin reconstructs from the
// run trace alone, recovering its authored formula, its multi-hop input dependencies traced through
// the node graph, and its coefficient source citations, with the carbon net carrying its labeled
// boundary crossing, and the reconstruction terminating over the land<->energy cycle. Parity is
// preserved (the node files are untouched; full-model-parity runs alongside this in the verify step).

const golden = goldenById();
const BASELINE_ID = 'base|pop=50000|Netherlands|Wind/Solar';

// Walk a within-node provenance DAG looking for the labeled adapter crossing.
function findAdapter(p: ProvRef): Extract<ProvRef, { kind: 'adapter' }> | undefined {
  if (p.kind === 'adapter') return p;
  if (p.kind === 'op') {
    for (const c of p.inputs) {
      const found = findAdapter(c);
      if (found) return found;
    }
  }
  return undefined;
}

describe('OC provenance reconstruction (PROV-01, SC1)', () => {
  it('reconstructs energy.totalDemandMwh: formula, multi-hop land dependency, and sources', () => {
    const result = run(buildOcModel({ population: 50_000, country: 'Netherlands' }), {});
    const origin = reconstruct(result.provenance, 'energy.totalDemandMwh');

    expect(origin.nodeId).toBe('n2-energy');
    expect(origin.formula).toBe(PROVENANCE_META['energy.totalDemandMwh']!.formula);
    // Source citations recovered from the trace.
    expect(origin.sources.length).toBeGreaterThan(0);
    expect(origin.sources.map((s) => s.coefficientId)).toContain('energy.electricityKwhPerCapita');
    // Multi-hop: the energy node depends, across a node boundary, on the upstream land driver
    // (the land node emits landUse.* ports, e.g. landUse.housingUnits).
    const upstreamKeys = origin.inputs.map((i) => i.readoutKey);
    expect(upstreamKeys.some((k) => k.startsWith('landUse.'))).toBe(true);
    const landDep = origin.inputs.find((i) => i.readoutKey.startsWith('landUse.'));
    expect(landDep?.nodeId).toBe('n1-land');
  });

  it('reconstructs emissions.netCarbonTonnesPerYr: gross/sequestration via the labeled crossing', () => {
    const result = run(buildOcModel({ population: 50_000, country: 'Netherlands' }), {});
    const origin = reconstruct(result.provenance, 'emissions.netCarbonTonnesPerYr');

    expect(origin.nodeId).toBe('n8-emissions');
    expect(origin.formula).toBe(PROVENANCE_META['emissions.netCarbonTonnesPerYr']!.formula);
    // The authored formula names the gross operational and territorial sequestration dependencies.
    expect(origin.formula).toContain('gross operational emissions');
    expect(origin.formula).toContain('territorial on-site sequestration');

    // The net node record's local DAG carries the labeled crossing (the net is named, not silent).
    const netRecord = result.provenance.nodes.find(
      (n) => n.readoutKey === 'emissions.netCarbonTonnesPerYr',
    );
    expect(netRecord).toBeDefined();
    const adapter = findAdapter(netRecord!.local);
    expect(adapter).toBeDefined();
    expect(adapter!.method).toBe(NET_CARBON_METHOD);
  });

  it('terminates over the land<->energy cycle (no infinite recursion)', () => {
    const result = run(buildOcModel({ population: 50_000, country: 'Netherlands' }), {});
    // land depends on energy and energy depends on land; reconstruct must return, not hang.
    const origin = reconstruct(result.provenance, 'landUse.totalLandM2');
    expect(origin.nodeId).toBe('n1-land');
    // Somewhere downstream the cycle is cut by the visited set.
    const seenTruncated = JSON.stringify(origin).includes('"truncated":true');
    expect(seenTruncated).toBe(true);
  });

  it('parity guard: the chosen readout values are unchanged by provenance metadata', () => {
    const result = run(buildOcModel({ population: 50_000, country: 'Netherlands' }), {});
    const g = golden.get(BASELINE_ID)!;
    const ge = g.result.energy as { totalDemandMwh: number };
    const gm = g.result.emissions as { netCarbonTonnesPerYr: number };
    expect(result.readouts['energy.totalDemandMwh']!.value).toBeCloseTo(ge.totalDemandMwh, 6);
    expect(result.readouts['emissions.netCarbonTonnesPerYr']!.value).toBeCloseTo(gm.netCarbonTonnesPerYr, 6);
  });
});
