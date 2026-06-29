// @symoto/oc-model public surface.
// The thin illustrative land-energy slice (D-07, Phase 1), kept for back-compat.
export { buildSlice } from './slice.js';
export { SLICE_COEFFS } from './coefficients.js';

// The full Orchid City settlement model (Phase 3): one Symoto graph reproducing the bespoke
// computeScenario at parity, with a boundary-honest carbon account.
export { buildOcModel, CORE_CONNECTIONS } from './model.js';
export type { SimInputs, EnergyScenario, DietaryPreference, LandUseResult, CategoryLandUse } from './types.js';

// Authored provenance metadata (Phase 5, PROV-01): formula + source citations for headline readouts,
// attached at assembly so a readout's origin reconstructs from a run trace alone.
export { PROVENANCE_META, metaForNode } from './provenanceMeta.js';
export type { ReadoutMeta } from './provenanceMeta.js';

// The computeScenario-compatible adapter (Phase 4, SWAP-01): a Symoto run mapped onto the exact
// bespoke ScenarioResult shape, so the Vizapp can swap engines with a one-import change.
export { computeScenarioViaSymoto } from './scenario.js';
export type { ScenarioResult } from './scenario.js';

// The shared parity surface (single source of truth for the in-repo adapter-parity test and the
// downstream Vizapp parity gate): the scenario grid, comparator, epsilon policy, and deviations.
export {
  PARITY_GRID,
  compareReadout,
  PARITY_POLICY,
  DEFAULT_EPSILON,
  NAMED_DEVIATIONS,
  isNamedDeviation,
} from './parity.js';
export type {
  ParityScenario,
  OcInputs,
  OcCountry,
  OcEnergyScenario,
  OcDiet,
  OcTurbineClass,
  Policy,
  CompareResult,
  NamedDeviation,
} from './parity.js';
