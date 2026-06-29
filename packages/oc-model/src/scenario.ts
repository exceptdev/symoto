// computeScenarioViaSymoto: the computeScenario-compatible adapter (SWAP-01). It runs the
// Symoto OC graph and maps the result onto the exact bespoke ScenarioResult shape the Vizapp
// consumes, so the Vizapp can swap engines with a one-import change (Plan 03).
//
// Honesty rule ("powered by Symoto"): EVERY numeric scalar of the returned ScenarioResult is
// read from the Symoto graph run (run(buildOcModel(inputs), {}).readouts), never recomputed by
// the vendored arithmetic. The verbatim compute*Raw functions are used ONLY as structural
// scaffolding (the nested object shape and the dynamic Record key sets); every numeric leaf is
// then re-sourced from the graph readouts. The two land fields the graph does not emit as
// scalar readouts (the byCategory breakdown and the hectare view) are structural and come from
// computeLandUseRaw, which is parity-proven against the golden master in Phase 3.
//
// A missing or non-finite readout for any non-structural field throws loudly, so a mis-keyed
// readout can never surface as undefined or NaN in a Vizapp readout card or hex tile (SWAP-03).
import { type QMap } from '@symoto/core';
import { runOc } from './locale.js';
import { COEFFICIENTS } from './coefficients.generated.js';
import { computeLandUseRaw, eligibleWindBaseLandM2 } from './nodes/land.js';
import { computeEnergyRaw, type EnergyResult } from './nodes/energy.js';
import { computeWaterRaw, type WaterResult } from './nodes/water.js';
import { computeWasteRaw, type WasteResult } from './nodes/waste.js';
import { computeJobsRaw, type JobsResult } from './nodes/jobs.js';
import { computeFoodRaw, type FoodResult } from './nodes/food.js';
import { computeCostRaw, type CostResult } from './nodes/cost.js';
import { computeEmissionsRaw, type EmissionsResult } from './nodes/emissions.js';
import type { SimInputs, LandUseResult } from './types.js';

/**
 * The bespoke ScenarioResult shape, composed from the already-exported domain result
 * interfaces, so it is structurally identical to the Vizapp's src/sim/index.ts ScenarioResult.
 * Key order matches the bespoke engine.
 */
export interface ScenarioResult {
  inputs: SimInputs;
  landUse: LandUseResult;
  energy: EnergyResult;
  water: WaterResult;
  food: FoodResult;
  waste: WasteResult;
  emissions: EmissionsResult;
  jobs: JobsResult;
  cost: CostResult;
}

/**
 * Numeric leaf paths that legitimately have no graph readout and are therefore sourced from
 * the parity-proven structural scaffold rather than a readout:
 *   - landUse.ha.*           the hectare convenience view (a /10,000 reprojection of the m2 fields)
 *   - landUse.byCategory.*   the per-program land breakdown (an array, not emitted as scalars)
 *   - energy.population      an input echo the energy node does not emit as an output port
 */
function isStructuralNumericPath(path: string): boolean {
  return (
    path.startsWith('landUse.ha.') ||
    path.startsWith('landUse.byCategory.') ||
    path === 'energy.population'
  );
}

/**
 * Rebuild a domain object, replacing every numeric leaf with its Symoto graph readout value.
 * Strings and booleans (echoes, turbineClass, regenerative, windCapped) are preserved from the
 * scaffold. A numeric leaf with no readout that is not a known structural field throws, as does
 * any non-finite readout, so the adapter fails loud rather than emitting undefined or NaN.
 */
function sourceFromGraph<T>(domain: string, scaffold: T, readouts: QMap): T {
  const rebuild = (path: string, value: unknown): unknown => {
    if (typeof value === 'number') {
      const r = readouts[path];
      if (r !== undefined) {
        if (!Number.isFinite(r.value)) {
          throw new Error(`computeScenarioViaSymoto: non-finite Symoto readout for '${path}' (${r.value})`);
        }
        return r.value;
      }
      if (isStructuralNumericPath(path)) return value;
      throw new Error(`computeScenarioViaSymoto: no Symoto readout for numeric field '${path}'`);
    }
    if (Array.isArray(value)) {
      return value.map((item, i) => rebuild(`${path}.${i}`, item));
    }
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = rebuild(`${path}.${k}`, v);
      return out;
    }
    return value;
  };
  return rebuild(domain, scaffold) as T;
}

/**
 * Run the Symoto OC graph for a scenario and return the bespoke ScenarioResult, with every
 * numeric scalar sourced from the graph readouts.
 */
export function computeScenarioViaSymoto(inputs: SimInputs): ScenarioResult {
  // Route through the locale-bearing run so every readout boundary carries the country's ISO locale
  // (LOC-01). The locale stamp is additive boundary metadata; .value is unchanged, so the
  // re-sourcing below and the parity grid are unaffected.
  const { readouts } = runOc(inputs);

  const num = (key: string): number => {
    const r = readouts[key];
    if (r === undefined) throw new Error(`computeScenarioViaSymoto: missing Symoto readout '${key}'`);
    if (!Number.isFinite(r.value)) throw new Error(`computeScenarioViaSymoto: non-finite readout '${key}' (${r.value})`);
    return r.value;
  };

  // Structural scaffolds: shape, dynamic Record keys, and the non-readout land structural
  // fields. Every numeric leaf is re-sourced from the graph below; the scaffold numbers survive
  // only for landUse.ha / landUse.byCategory (parity-proven) and the energy.population echo.
  const base = computeLandUseRaw(inputs, COEFFICIENTS, 0);
  const energyGenerationLandM2 = num('energy.energyGenerationLandM2');
  const landUseScaffold = computeLandUseRaw(inputs, COEFFICIENTS, energyGenerationLandM2);
  const energyScaffold = computeEnergyRaw(
    { ...inputs, housingUnits: base.housingUnits, eligibleWindBaseLandM2: eligibleWindBaseLandM2(base) },
    COEFFICIENTS,
  );
  const waterScaffold = computeWaterRaw(landUseScaffold, inputs, COEFFICIENTS);
  const foodScaffold = computeFoodRaw(landUseScaffold, inputs, COEFFICIENTS);
  const wasteScaffold = computeWasteRaw(landUseScaffold, inputs, COEFFICIENTS);
  const emissionsScaffold = computeEmissionsRaw({ landUse: landUseScaffold, energy: energyScaffold, inputs }, COEFFICIENTS);
  const jobsScaffold = computeJobsRaw(landUseScaffold, COEFFICIENTS);
  const costScaffold = computeCostRaw(landUseScaffold, COEFFICIENTS);

  const landUse = sourceFromGraph('landUse', landUseScaffold, readouts);
  const energy = sourceFromGraph('energy', energyScaffold, readouts);
  const water = sourceFromGraph('water', waterScaffold, readouts);
  const food = sourceFromGraph('food', foodScaffold, readouts);
  const waste = sourceFromGraph('waste', wasteScaffold, readouts);
  const emissions = sourceFromGraph('emissions', emissionsScaffold, readouts);
  const jobs = sourceFromGraph('jobs', jobsScaffold, readouts);
  const cost = sourceFromGraph('cost', costScaffold, readouts);

  // Tie the non-numeric energy fields to the graph / inputs explicitly: windCapped from the
  // graph's 0/1 readout, turbineClass from the input (default 'medium').
  energy.windCapped = num('energy.windCapped') === 1;
  energy.turbineClass = inputs.turbineClass ?? 'medium';

  return { inputs, landUse, energy, water, food, waste, emissions, jobs, cost };
}
