import { describe, it, expect } from 'vitest';
import { makeRunContext, q, input, type QMap } from '@symoto/core';
import { makeFoodNode, FOOD_CATEGORIES } from '../src/nodes/food.js';
import { AGRI_SYSTEMS } from '../src/agriConfig.js';
import { PARITY_GRID, compareReadout, goldenById } from './parity/harness.js';
import { LAND, m2U } from '../src/boundaries.js';

// Food is tested in isolation against the golden closed land. Every scalar readout, the
// per-system mix and breakdown, and the 14-category breakdown are compared; the mix sums to 1.0
// and population 0 stays finite.

const golden = goldenById();
const SCALARS = [
  'totalProductionTonnesPerYr', 'totalConsumptionTonnesPerYr', 'selfSufficiencyPct', 'agricultureM2',
  'agricultureHa', 'productionFocus', 'totalValueEurPerYr', 'totalJobsFte', 'totalWaterM3PerYr',
  'agriCarbonSequestrationTonnesPerYr',
];
const SB_FIELDS = ['landM2', 'landShare', 'productionTonnes', 'valueEur', 'jobsFte', 'waterM3', 'carbonSequestrationTonnes'];

function runFood(id: string, inputs: Parameters<typeof makeFoodNode>[0]): QMap {
  const g = golden.get(id)!;
  const energyGen = (g.result.landUse as { energyGenerationLandM2: number }).energyGenerationLandM2;
  return makeFoodNode(inputs).compute(makeRunContext({}), {
    'food.energyGenerationLandM2In': q(energyGen, m2U, LAND, input('food.energyGenerationLandM2In')),
  });
}

describe('food parity over the grid (MODEL-01, MODEL-02)', () => {
  it('reproduces every scalar, per-system, and per-category food readout', () => {
    for (const scenario of PARITY_GRID) {
      const fg = golden.get(scenario.id)!.result.food as Record<string, unknown>;
      const r = runFood(scenario.id, scenario.inputs);
      for (const f of SCALARS) {
        const res = compareReadout(f, r[`food.${f}`]!.value, fg[f] as number);
        expect(res.pass, `${scenario.id}: food.${f} relErr=${res.relError}`).toBe(true);
      }
      const mix = fg.systemMix as Record<string, number>;
      const sb = fg.systemBreakdown as Record<string, Record<string, number>>;
      for (const s of AGRI_SYSTEMS) {
        expect(compareReadout(`systemMix.${s}`, r[`food.systemMix.${s}`]!.value, mix[s]!).pass).toBe(true);
        for (const f of SB_FIELDS) {
          const res = compareReadout(`sb.${s}.${f}`, r[`food.systemBreakdown.${s}.${f}`]!.value, sb[s]![f]!);
          expect(res.pass, `${scenario.id}: food.systemBreakdown.${s}.${f} relErr=${res.relError}`).toBe(true);
        }
      }
      const cb = fg.categoryBreakdown as Record<string, Record<string, number>>;
      for (const c of FOOD_CATEGORIES) {
        expect(compareReadout(`cb.${c}.prod`, r[`food.categoryBreakdown.${c}.productionTonnes`]!.value, cb[c]!.productionTonnes!).pass).toBe(true);
        expect(compareReadout(`cb.${c}.cons`, r[`food.categoryBreakdown.${c}.consumptionTonnes`]!.value, cb[c]!.consumptionTonnes!).pass).toBe(true);
      }
    }
  });

  it('systemMix sums to 1.0 across the grid', () => {
    for (const scenario of PARITY_GRID) {
      const r = runFood(scenario.id, scenario.inputs);
      const sum = AGRI_SYSTEMS.reduce((s, sys) => s + r[`food.systemMix.${sys}`]!.value, 0);
      expect(Math.abs(sum - 1)).toBeLessThanOrEqual(1e-9);
    }
  });

  it('population 0 yields finite readouts and 0 self-sufficiency', () => {
    const r = runFood('base|pop=0|Netherlands|Wind/Solar', { population: 0, country: 'Netherlands' });
    for (const [, v] of Object.entries(r)) expect(Number.isFinite(v.value)).toBe(true);
    expect(r['food.selfSufficiencyPct']!.value).toBe(0);
  });
});
