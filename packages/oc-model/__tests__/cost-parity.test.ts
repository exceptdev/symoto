import { describe, it, expect } from 'vitest';
import { makeRunContext, q, input, type QMap } from '@symoto/core';
import { makeCostNode } from '../src/nodes/cost.js';
import { PARITY_GRID, compareReadout, goldenById } from './parity/harness.js';
import { LAND, m2U } from '../src/boundaries.js';

// Cost is tested in isolation against the golden closed land. Every readout, including the
// internally-computed discountedCashflowValueUsd and constructionReturnRatePct (in the result
// but never surfaced as UI numbers), is compared; population 0 stays finite.

const golden = goldenById();
const FIELDS = [
  'constructionCostUsd', 'builtConstructionCostUsd', 'openSpaceConstructionCostUsd', 'landCostUsd',
  'investmentUsd', 'opexAnnualUsd', 'revenueAnnualUsd', 'salesTotalUsd', 'discountedCashflowValueUsd',
  'constructionReturnRatePct', 'roiPct', 'profitUsd', 'jobsCreated',
];

function runCost(id: string, inputs: Parameters<typeof makeCostNode>[0]): QMap {
  const g = golden.get(id)!;
  const energyGen = (g.result.landUse as { energyGenerationLandM2: number }).energyGenerationLandM2;
  return makeCostNode(inputs).compute(makeRunContext({}), {
    'cost.energyGenerationLandM2In': q(energyGen, m2U, LAND, input('cost.energyGenerationLandM2In')),
  });
}

describe('cost parity over the grid (MODEL-01, MODEL-02)', () => {
  it('reproduces every cost readout (incl. internal cashflow and return-rate fields)', () => {
    for (const scenario of PARITY_GRID) {
      const cg = golden.get(scenario.id)!.result.cost as Record<string, number>;
      const r = runCost(scenario.id, scenario.inputs);
      for (const f of FIELDS) {
        const res = compareReadout(f, r[`cost.${f}`]!.value, cg[f]!);
        expect(res.pass, `${scenario.id}: cost.${f} actual=${r[`cost.${f}`]!.value} golden=${cg[f]} relErr=${res.relError}`).toBe(true);
      }
    }
  });

  it('population 0 yields finite readouts', () => {
    const r = runCost('base|pop=0|Netherlands|Wind/Solar', { population: 0, country: 'Netherlands' });
    for (const [, v] of Object.entries(r)) expect(Number.isFinite(v.value)).toBe(true);
  });
});
