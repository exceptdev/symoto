// The canonical parity grid now lives in the published surface (src/parity.ts) so the in-repo
// tests and the downstream Vizapp parity gate share one source of truth. This file re-exports
// it unchanged so the Phase 3 tests that import from './grid.js' keep working.
export { PARITY_GRID } from '../../src/parity.js';
export type {
  ParityScenario,
  OcInputs,
  OcCountry,
  OcEnergyScenario,
  OcDiet,
  OcTurbineClass,
} from '../../src/parity.js';
