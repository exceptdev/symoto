import { describe, it, expect } from 'vitest';
import { validateRunExport, reconstructFromExport, type RunExport } from '@symoto/core';
import { exportOcRun } from '../src/export.js';
import { PROVENANCE_META } from '../src/provenanceMeta.js';
import { PARITY_GRID, compareReadout } from '../src/parity.js';
import { goldenById } from './parity/harness.js';

// The milestone definition-of-done witness (PROV-04): a full Symoto run exports as structured JSON
// that an external reviewer or agent (the Professor critique system) can interrogate. Over the full
// parity grid the OC export round-trips through JSON without cycles and validates against the schema
// (ROADMAP SC1, SC2), and an external agent answers "where did this number come from" for the headline
// readouts from the round-tripped export alone, with no engine access (SC3).

const golden = goldenById();

describe('full-grid JSON round-trip and schema validation (PROV-04, SC1 + SC2)', () => {
  it('every PARITY_GRID scenario round-trips without cycles and validates against the schema', () => {
    for (const scenario of PARITY_GRID) {
      const exp = exportOcRun(scenario.inputs);

      // Acyclic on the real OC model: the land<->energy cycle survives as edge ids, so JSON does not throw.
      let wire: unknown;
      expect(() => {
        wire = JSON.parse(JSON.stringify(exp));
      }, scenario.id).not.toThrow();
      expect(wire, scenario.id).toEqual(exp);

      const check = validateRunExport(wire);
      expect(check.errors, `${scenario.id}: ${check.errors.join('; ')}`).toEqual([]);
      expect(check.valid, scenario.id).toBe(true);
    }
  });

  it('parity guard over the grid: exported readout values equal the golden master', () => {
    for (const scenario of PARITY_GRID) {
      const exp = exportOcRun(scenario.inputs);
      const g = golden.get(scenario.id);
      if (!g) continue;
      const ge = g.result.energy as { totalDemandMwh: number };
      const gm = g.result.emissions as { netCarbonTonnesPerYr: number };

      const demand = compareReadout('totalDemandMwh', exp.readouts['energy.totalDemandMwh']!.value, ge.totalDemandMwh);
      expect(demand.pass, `${scenario.id}: totalDemandMwh relErr=${demand.relError}`).toBe(true);
      const net = compareReadout('netCarbonTonnesPerYr', exp.readouts['emissions.netCarbonTonnesPerYr']!.value, gm.netCarbonTonnesPerYr);
      expect(net.pass, `${scenario.id}: netCarbonTonnesPerYr relErr=${net.relError}`).toBe(true);
    }
  });

  it('the optional playback series round-trips with scalar frames', () => {
    const exp = exportOcRun({ population: 50_000, country: 'Netherlands' }, { withSeries: { horizon: 5 } });
    expect(exp.series).toBeDefined();
    let wire: unknown;
    expect(() => {
      wire = JSON.parse(JSON.stringify(exp));
    }).not.toThrow();
    expect(wire).toEqual(exp);
    const frame = exp.series!.frames[0]!;
    const anyReadout = Object.values(frame.readouts)[0]!;
    expect(typeof anyReadout.value).toBe('number');
    expect('provenance' in anyReadout).toBe(false);
  });
});

describe('external reconstruction from the export alone (PROV-04, SC3 - the DoD)', () => {
  // Simulate an external reviewer/agent: build an export, serialize and re-parse it, and from the
  // parsed wire object ALONE call reconstructFromExport. NO engine function (buildOcModel, run, runOc)
  // is called after the JSON round-trip; PROVENANCE_META is an authored constant used only as the
  // expected formula value, not an engine call. This is the "interrogable from the export alone" proof.

  function wireFor(): RunExport {
    const exp = exportOcRun({ population: 50_000, country: 'Netherlands' });
    return JSON.parse(JSON.stringify(exp)) as RunExport;
  }

  it('reconstructs emissions.netCarbonTonnesPerYr origin: the labeled operational-territorial crossing', () => {
    const wire = wireFor();
    const origin = reconstructFromExport(wire, 'emissions.netCarbonTonnesPerYr');

    expect(origin.nodeId).toBe('n8-emissions');
    expect(origin.formula).toBe(PROVENANCE_META['emissions.netCarbonTonnesPerYr']!.formula);
    // The authored formula names the operational-territorial boundary crossing.
    expect(origin.formula).toContain('gross operational emissions');
    expect(origin.formula).toContain('territorial on-site sequestration');
    expect(origin.formula).toContain('boundary crossing');
    // Non-empty sources and a multi-hop upstream dependency chain, all from the exported trace.
    expect(origin.sources.length).toBeGreaterThan(0);
    expect(origin.inputs.length).toBeGreaterThan(0);
  });

  it('reconstructs energy.totalDemandMwh origin: the authored formula, sources, and the land dependency', () => {
    const wire = wireFor();
    const origin = reconstructFromExport(wire, 'energy.totalDemandMwh');

    expect(origin.nodeId).toBe('n2-energy');
    expect(origin.formula).toBe(PROVENANCE_META['energy.totalDemandMwh']!.formula);
    expect(origin.sources.map((s) => s.coefficientId)).toContain('energy.electricityKwhPerCapita');
    // The multi-hop land dependency: the energy node depends, across a node boundary, on a landUse.* port.
    const upstreamKeys = origin.inputs.map((i) => i.readoutKey);
    expect(upstreamKeys.some((k) => k.startsWith('landUse.'))).toBe(true);
    const landDep = origin.inputs.find((i) => i.readoutKey.startsWith('landUse.'));
    expect(landDep?.nodeId).toBe('n1-land');
  });

  it('terminates over the land<->energy cycle (no infinite recursion, the cut is marked truncated)', () => {
    const wire = wireFor();
    // land depends on energy and energy depends on land; the external walk must return, not hang.
    const origin = reconstructFromExport(wire, 'landUse.totalLandM2');
    expect(origin.nodeId).toBe('n1-land');
    const seenTruncated = JSON.stringify(origin).includes('"truncated":true');
    expect(seenTruncated).toBe(true);
  });
});
