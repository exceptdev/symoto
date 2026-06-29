// @symoto/oc-model public surface.
// The thin illustrative land-energy slice (D-07, Phase 1), kept for back-compat.
export { buildSlice } from './slice.js';
export { SLICE_COEFFS } from './coefficients.js';

// The full Orchid City settlement model (Phase 3): one Symoto graph reproducing the bespoke
// computeScenario at parity, with a boundary-honest carbon account.
export { buildOcModel, CORE_CONNECTIONS } from './model.js';
export type { SimInputs, EnergyScenario, DietaryPreference, LandUseResult, CategoryLandUse } from './types.js';
