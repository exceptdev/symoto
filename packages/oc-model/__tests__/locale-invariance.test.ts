import { describe, it, expect } from 'vitest';
import { flagOcInvariance } from '../src/invariance.js';
import { OC_LOCALE_COEFFICIENTS } from '../src/localeCoefficients.js';
import { computeScenarioViaSymoto } from '../src/scenario.js';
import type { SimInputs } from '../src/types.js';

// LOC-02 headline proof: running the OC model across NL/VN/BR flags, by default, the historical
// NL-applied-everywhere coefficients (the per-capita energy demand figures and the per-dwelling roof
// area), with zero false positives for every declared-invariant physical constant or deliberate
// proxy, and zero flags for any genuinely locale-varying coefficient. The check reads the model
// without changing it, so a full readout re-run is unperturbed.

const EXPECTED_FLAGGED = new Set([
  'energy.electricityKwhPerCapita',
  'energy.heatToElectricityRatio',
  'energy.transportKwhPerCapita',
  'energy.roofAreaPerDwellingM2',
]);

// A sample of genuinely locale-varying coefficients that must never be flagged.
const VARYING_IDS = [
  'energy.pvYieldKwhPerKwp',
  'energy.turbineYieldMwh',
  'countryStats.precipitationMmPerYr',
  'energy.endUseFactor',
  'emissions.gridCo2',
];

describe('flagOcInvariance (LOC-02 headline)', () => {
  const flags = flagOcInvariance();
  const flaggedIds = new Set(flags.map((f) => f.id));

  it('flags exactly the historical NL-applied-everywhere coefficient set', () => {
    expect(flaggedIds).toEqual(EXPECTED_FLAGGED);
  });

  it('produces zero false positives: no localeInvariant: true coefficient is flagged', () => {
    const invariantIds = OC_LOCALE_COEFFICIENTS.filter((d) => d.localeInvariant === true).map((d) => d.id);
    expect(invariantIds.length).toBeGreaterThan(0);
    for (const id of invariantIds) {
      expect(flaggedIds.has(id), `invariant '${id}' must not be flagged`).toBe(false);
    }
  });

  it('never flags a genuinely locale-varying coefficient', () => {
    for (const id of VARYING_IDS) {
      expect(flaggedIds.has(id), `varying '${id}' must not be flagged`).toBe(false);
    }
  });

  it('each expected flag carries a finite value and the three OC locales', () => {
    for (const flag of flags) {
      expect(Number.isFinite(flag.value), `${flag.id} value finite`).toBe(true);
      expect([...flag.locales].sort()).toEqual(['BR', 'NL', 'VN']);
    }
  });

  it('does not perturb the model: a representative scenario is unchanged after the check', () => {
    const inputs: SimInputs = { population: 50_000, country: 'Netherlands' };
    const before = computeScenarioViaSymoto(inputs);
    flagOcInvariance();
    const after = computeScenarioViaSymoto(inputs);
    expect(after).toEqual(before);
  });
});
