import { describe, it, expect } from 'vitest';
import { makeRunContext, q, input, type QMap } from '@symoto/core';
import { makeWaterNode } from '../src/nodes/water.js';
import { PARITY_GRID, compareReadout, goldenById } from './parity/harness.js';
import { LAND, m2U } from '../src/boundaries.js';

// Water is tested in isolation: feed the golden closed-land driver (energyGenerationLandM2) so
// the node recomputes the exact golden land use, run its compute, and compare every readout to
// the golden water domain. Clamps (selfSufficiency min(1,.)) and finiteness are asserted too.

const golden = goldenById();
const FIELDS = [
  'consumptionM3PerYr', 'precipitationCaptureM3PerYr', 'harvestableRainM3PerYr', 'surfaceStorageM3',
  'storageDaysOfDemand', 'providedSupplyM3', 'selfSufficiencyPct', 'harvestRatio',
  'waterInfrastructureLandM2', 'catchmentAreaM2', 'precipitationMmPerYr',
];

function runWater(id: string, inputs: Parameters<typeof makeWaterNode>[0]): QMap {
  const g = golden.get(id)!;
  const energyGen = (g.result.landUse as { energyGenerationLandM2: number }).energyGenerationLandM2;
  const node = makeWaterNode(inputs);
  return node.compute(makeRunContext({}), {
    'water.energyGenerationLandM2In': q(energyGen, m2U, LAND, input('water.energyGenerationLandM2In')),
  });
}

describe('water parity over the grid (MODEL-01, MODEL-02)', () => {
  it('reproduces every water readout across the full PARITY_GRID', () => {
    for (const scenario of PARITY_GRID) {
      const wg = golden.get(scenario.id)!.result.water as Record<string, number>;
      const readouts = runWater(scenario.id, scenario.inputs);
      for (const f of FIELDS) {
        const res = compareReadout(f, readouts[`water.${f}`]!.value, wg[f]!);
        expect(res.pass, `${scenario.id}: water.${f} relErr=${res.relError}`).toBe(true);
      }
    }
  });

  it('selfSufficiencyPct never exceeds 1.0 across the grid', () => {
    for (const scenario of PARITY_GRID) {
      const readouts = runWater(scenario.id, scenario.inputs);
      expect(readouts['water.selfSufficiencyPct']!.value).toBeLessThanOrEqual(1);
    }
  });

  it('population 0 yields finite readouts and 0 self-sufficiency', () => {
    const readouts = runWater('base|pop=0|Netherlands|Wind/Solar', { population: 0, country: 'Netherlands' });
    for (const [, v] of Object.entries(readouts)) expect(Number.isFinite(v.value)).toBe(true);
    expect(readouts['water.selfSufficiencyPct']!.value).toBe(0);
  });
});
