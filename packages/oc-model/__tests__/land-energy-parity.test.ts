import { describe, it, expect } from 'vitest';
import { run, makeRunContext, kahnTopoSort, resolveFixedPoint, type QMap, type Port, type Boundary } from '@symoto/core';
import { q, unit, input } from '@symoto/core';
import { buildOcModel } from '../src/model.js';
import { computeLandUseRaw } from '../src/nodes/land.js';
import { PARITY_GRID, compareReadout, goldenById } from './parity/harness.js';

// The land<->energy core is the load-bearing cycle: land use, then energy (which needs base
// land), then land use again with energy-generation land folded in. Symoto expresses this as
// a two-node cycle resolved by the core fixed-point evaluator, and this test proves it
// reproduces the bespoke land and energy readouts over the grid (turbine integers exact), the
// cycle converges in exactly two iterations, and population 0 stays finite.

const golden = goldenById();

const LAND_FIELDS = [
  'housingUnits', 'builtFootprintM2', 'builtParcelLandM2', 'energyGenerationLandM2', 'builtTotalM2',
  'builtGfaM2', 'urbanGreenM2', 'roadsM2', 'parkingM2', 'infrastructureM2', 'agricultureM2',
  'natureM2', 'waterM2', 'openSpaceM2', 'totalLandM2', 'densityPeoplePerHaBuilt',
];

const ENERGY_CONTINUOUS = [
  'electricityDemandMwh', 'heatDemandMwh', 'transportDemandMwh', 'totalDemandMwh', 'rooftopSolarMwh',
  'groundSolarMwh', 'solarMwh', 'windMwh', 'biomassMwh', 'totalSupplyMwh', 'windShortfallMwh',
  'seasonalWinterUpliftPct', 'selfSufficiency', 'fossilBackfillMwh', 'curtailmentMwh',
  'batteryStorageMwh', 'peakShavedMwh', 'groundSolarLandM2', 'windLandM2', 'energyLandM2',
];
const ENERGY_EXACT = ['windTurbines', 'turbineCount', 'maxTurbines'];

function assertDomain(readouts: QMap, dom: string, domGolden: Record<string, number>, fields: string[], id: string): void {
  for (const f of fields) {
    const r = readouts[`${dom}.${f}`];
    expect(r, `${id}: missing readout ${dom}.${f}`).toBeTruthy();
    const res = compareReadout(f, r!.value, domGolden[f]!);
    expect(res.pass, `${id}: ${dom}.${f} actual=${r!.value} golden=${domGolden[f]} relErr=${res.relError}`).toBe(true);
  }
}

describe('land + energy parity over the grid (MODEL-01, MODEL-02)', () => {
  it('reproduces every land and energy readout across the full PARITY_GRID', () => {
    for (const scenario of PARITY_GRID) {
      const g = golden.get(scenario.id)!;
      const result = run(buildOcModel(scenario.inputs), {});
      const lg = g.result.landUse as Record<string, number>;
      const eg = g.result.energy as Record<string, number>;

      assertDomain(result.readouts, 'landUse', lg, LAND_FIELDS, scenario.id);
      assertDomain(result.readouts, 'energy', eg, ENERGY_CONTINUOUS, scenario.id);
      assertDomain(result.readouts, 'energy', eg, ENERGY_EXACT, scenario.id);

      // windCapped boolean under the exact policy (stored numerically as 0/1).
      const wc = result.readouts['energy.windCapped']!;
      expect(compareReadout('windCapped', wc.value, (eg.windCapped as unknown as boolean) ? 1 : 0, 'exact').pass).toBe(true);
    }
  });

  it('byCategory and the hectare view match the bespoke landUse exactly (raw deep-equal)', () => {
    for (const scenario of PARITY_GRID) {
      const g = golden.get(scenario.id)!;
      const lg = g.result.landUse as { energyGenerationLandM2: number; byCategory: unknown; ha: unknown };
      const lu = computeLandUseRaw(scenario.inputs, undefined, lg.energyGenerationLandM2);
      expect(lu.byCategory, scenario.id).toEqual(lg.byCategory);
      expect(lu.ha, scenario.id).toEqual(lg.ha);
    }
  });

  it('resolves the land-energy cycle in exactly 2 iterations, cap-independent above 2', () => {
    const g = buildOcModel({ population: 50_000, country: 'Netherlands' });
    const order = kahnTopoSort(g);
    expect(order.cyclicNodeIds).toEqual(['n1-land', 'n2-energy']);

    const LAND: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'stock' };
    const seed = (p: Port) => q(0, p.signature.unit, p.signature.boundary, input(`seed:${p.id}`));
    const resolveWith = (cap: number) => {
      const ctx = makeRunContext({});
      const values = new Map<string, QMap>();
      const fp = resolveFixedPoint(g, order.cyclicNodeIds, values, ctx, { epsilon: 1e-9, maxIterations: cap, seed });
      return { fp, total: values.get('n1-land')!['landUse.totalLandM2']!.value };
    };
    void LAND;

    const cap2 = resolveWith(2);
    const cap50 = resolveWith(50);
    expect(cap2.fp.iterations).toBe(2);
    expect(cap2.fp.converged).toBe(true);
    expect(cap50.total).toBeCloseTo(cap2.total, 6);
  });

  it('population 0 produces only finite land and energy readouts', () => {
    const result = run(buildOcModel({ population: 0, country: 'Netherlands' }), {});
    for (const [, v] of Object.entries(result.readouts)) {
      expect(Number.isFinite(v.value)).toBe(true);
    }
    expect(result.readouts['landUse.housingUnits']!.value).toBe(0);
  });
});
