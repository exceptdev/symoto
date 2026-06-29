import { describe, it, expect } from 'vitest';
import { makeRunContext, q, input, type QMap } from '@symoto/core';
import { makeWasteNode } from '../src/nodes/waste.js';
import { PARITY_GRID, compareReadout, goldenById } from './parity/harness.js';
import { LAND, m2U } from '../src/boundaries.js';

// Waste is tested in isolation against the golden closed land. divertedFromLandfillPct is
// compared under the rounded (1 dp) policy; tonnages under continuous 1e-9. The mass balance
// (diverted + landfill == generated) and the biogas-cannot-exceed-diverted guard hold over the
// whole grid.

const golden = goldenById();
const TONNES = ['wasteGeneratedTonnesPerYr', 'divertedTonnesPerYr', 'landfillTonnesPerYr', 'recycledTonnesPerYr', 'organicToBiogasTonnesPerYr'];

function runWaste(id: string, inputs: Parameters<typeof makeWasteNode>[0]): QMap {
  const g = golden.get(id)!;
  const energyGen = (g.result.landUse as { energyGenerationLandM2: number }).energyGenerationLandM2;
  const node = makeWasteNode(inputs);
  return node.compute(makeRunContext({}), {
    'waste.energyGenerationLandM2In': q(energyGen, m2U, LAND, input('waste.energyGenerationLandM2In')),
  });
}

describe('waste parity over the grid (MODEL-01, MODEL-02)', () => {
  it('reproduces every waste readout (tonnages continuous, divertedPct rounded)', () => {
    for (const scenario of PARITY_GRID) {
      const wg = golden.get(scenario.id)!.result.waste as Record<string, number>;
      const readouts = runWaste(scenario.id, scenario.inputs);
      for (const f of TONNES) {
        const res = compareReadout(f, readouts[`waste.${f}`]!.value, wg[f]!);
        expect(res.pass, `${scenario.id}: waste.${f} relErr=${res.relError}`).toBe(true);
      }
      const pct = compareReadout('divertedFromLandfillPct', readouts['waste.divertedFromLandfillPct']!.value, wg.divertedFromLandfillPct!);
      expect(pct.pass, `${scenario.id}: waste.divertedFromLandfillPct`).toBe(true);
    }
  });

  it('mass balance holds and biogas never exceeds diverted across the grid', () => {
    for (const scenario of PARITY_GRID) {
      const r = runWaste(scenario.id, scenario.inputs);
      const generated = r['waste.wasteGeneratedTonnesPerYr']!.value;
      const diverted = r['waste.divertedTonnesPerYr']!.value;
      const landfill = r['waste.landfillTonnesPerYr']!.value;
      const biogas = r['waste.organicToBiogasTonnesPerYr']!.value;
      expect(Math.abs(diverted + landfill - generated)).toBeLessThanOrEqual(1e-9 * Math.max(1, generated));
      expect(biogas).toBeLessThanOrEqual(diverted + 1e-9);
    }
  });

  it('population 0 yields finite, zero readouts', () => {
    const r = runWaste('base|pop=0|Netherlands|Wind/Solar', { population: 0, country: 'Netherlands' });
    for (const [, v] of Object.entries(r)) expect(Number.isFinite(v.value)).toBe(true);
    expect(r['waste.wasteGeneratedTonnesPerYr']!.value).toBe(0);
  });
});
