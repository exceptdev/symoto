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

// Locale wiring (Phase 6, LOC-01): the country selector becomes a first-class ISO locale that the
// production run threads onto every readout boundary.
export { localeOf, runOc } from './locale.js';

// Stock-flow playback (Phase 7): the OC model run through the core integrator. runOcTimeSeries is the
// stock-less TIME-02 witness (single step == runOc); runOcCarbonPlayback (Plan 05) is the genuine
// cumulative-carbon stock exercise.
export { runOcTimeSeries } from './playback.js';

// The OC locale-coefficient manifest (Phase 6, LOC-02): one LocaleDescriptor per consumed
// coefficient, classified locale-varying vs deliberately-global, driving the invariance flagger.
export { OC_LOCALE_COEFFICIENTS } from './localeCoefficients.js';

// The OC invariance check (Phase 6, LOC-02): runs the manifest through the core flagger across
// NL/VN/BR, flagging the historical constant-where-it-should-vary coefficients by default.
export { flagOcInvariance } from './invariance.js';

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
