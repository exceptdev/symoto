import { describe, it, expect } from 'vitest';
import { makeRunContext, q, input, type QMap } from '@symoto/core';
import { makeEmissionsNode } from '../src/nodes/emissions.js';
import { PARITY_GRID, compareReadout, goldenById } from './parity/harness.js';
import { LAND, ENERGY_SUPPLY, m2U, mwhU } from '../src/boundaries.js';

// Emissions is tested in isolation against the golden closed land and energy. Every readout is
// compared, including the labeled net (which equals the bespoke netCarbonTonnesPerYr value but
// is reached via the explicit crossing). Per-country localization and the boundary refusal are
// in carbon-boundary.test.ts.

const golden = goldenById();
const FIELDS = [
  'carbonEmissionsTonnesPerYr', 'carbonSequestrationTonnesPerYr', 'netCarbonTonnesPerYr',
  'nitrogenEmissionsKgPerYr', 'airQualityIndex', 'waterQualityIndex', 'grossDesignFootprintTonnesPerYr',
  'householdsCo2TonnesPerYr', 'foodCo2TonnesPerYr', 'transportCo2TonnesPerYr', 'fossilBackfillCo2TonnesPerYr',
  'embodiedCarbonTonnesPerYr', 'agriProcessCo2eTonnesPerYr', 'maturityFactor', 'avoidedExportCo2TonnesPerYr',
  'netCarbonWithExportCreditTonnesPerYr', 'regenerativeCarbonSavingTonnesPerYr', 'regenerativeNitrogenSavingKgPerYr',
  'regenerativeSoilCarbonSavingTonnesPerYr', 'savingsVsBaselineTonnesPerYr', 'ocDesignPerCapitaTonnes',
  'dutchBaselinePerCapitaTonnes',
];

function runEmissions(id: string, inputs: Parameters<typeof makeEmissionsNode>[0]): QMap {
  const g = golden.get(id)!;
  const energyGen = (g.result.landUse as { energyGenerationLandM2: number }).energyGenerationLandM2;
  const eg = g.result.energy as { fossilBackfillMwh: number; curtailmentMwh: number };
  return makeEmissionsNode(inputs).compute(makeRunContext({}), {
    'emissions.energyGenerationLandM2In': q(energyGen, m2U, LAND, input('emissions.energyGenerationLandM2In')),
    'emissions.fossilBackfillMwhIn': q(eg.fossilBackfillMwh, mwhU, ENERGY_SUPPLY, input('emissions.fossilBackfillMwhIn')),
    'emissions.curtailmentMwhIn': q(eg.curtailmentMwh, mwhU, ENERGY_SUPPLY, input('emissions.curtailmentMwhIn')),
  });
}

describe('emissions parity over the grid (MODEL-01, MODEL-02)', () => {
  it('reproduces every emissions readout across the grid (labeled net == bespoke net value)', () => {
    for (const scenario of PARITY_GRID) {
      const eg = golden.get(scenario.id)!.result.emissions as Record<string, number>;
      const r = runEmissions(scenario.id, scenario.inputs);
      for (const f of FIELDS) {
        const res = compareReadout(f, r[`emissions.${f}`]!.value, eg[f]!);
        expect(res.pass, `${scenario.id}: emissions.${f} actual=${r[`emissions.${f}`]!.value} golden=${eg[f]} relErr=${res.relError}`).toBe(true);
      }
    }
  });
});
