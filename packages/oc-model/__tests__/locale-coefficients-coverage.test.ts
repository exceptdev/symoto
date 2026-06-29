import { describe, it, expect } from 'vitest';
import { OC_LOCALE_COEFFICIENTS } from '../src/localeCoefficients.js';

// Coverage guard against manifest drift (LOC-02). The OC model consumes a fixed set of coefficients;
// every one must be represented in OC_LOCALE_COEFFICIENTS, or a new or renamed coefficient could
// silently escape the invariance flagger. This list mirrors the 06-RESEARCH.md enumeration, verified
// against the live node reads (the consumed countryStats, the consumed program fields, the energy
// globals, the per-capita demand and roof figures, the open-space proxies, the baseline population,
// and the node-local per-country factors).
const EXPECTED_CONSUMED_IDS: readonly string[] = [
  // Energy: locale-varying triples
  'energy.pvYieldKwhPerKwp',
  'energy.turbineYieldMwh',
  // Energy: the historical per-capita demand and roof figures (flaggable)
  'energy.electricityKwhPerCapita',
  'energy.heatToElectricityRatio',
  'energy.transportKwhPerCapita',
  'energy.roofAreaPerDwellingM2',
  // Energy: physics constants and deliberate proxies
  'energy.pvEfficiency',
  'energy.m2PerPanel',
  'energy.kwpPerPanel',
  'energy.groundPvM2PerKwp',
  'energy.turbineCapacityMw',
  'energy.windFootprintM2PerTurbine',
  'energy.biomassMwhBaseline',
  'energy.batteryStorageDaysOfDemand',
  // Country socio-spatial stats consumed by the nodes
  'countryStats.workingPopShare',
  'countryStats.effectiveFtePerPerson',
  'countryStats.precipitationMmPerYr',
  'countryStats.infraMetersPerInhabitant',
  'countryStats.parkingSpacePerUnit',
  'countryStats.parksFracOfFootprint',
  'countryStats.playgroundsFracOfFootprint',
  'countryStats.squaresFracOfFootprint',
  // Program per-unit fields and economics
  'programs.units',
  'programs.gfaPerUnit',
  'programs.footprintPerUnit',
  'programs.gardenPerUnit',
  'programs.terracePerUnit',
  'programs.storagePerUnit',
  'programs.constructionCostPerM2',
  'programs.salesRevenuePerM2',
  // Open-space and meta proxies
  'openSpace.natureRatio',
  'openSpace.waterRatio',
  'openSpace.agricultureHaPerCapita',
  'meta.baselinePopulation',
  // Node-local per-country factors
  'energy.endUseFactor',
  'food.demandFactor',
  'emissions.designFootprintFactor',
  'emissions.nitrogenFactor',
  'emissions.gridCo2',
];

describe('OC locale-coefficient manifest coverage (LOC-02 drift guard)', () => {
  const manifestIds = OC_LOCALE_COEFFICIENTS.map((d) => d.id);
  const manifestIdSet = new Set(manifestIds);

  it('covers every consumed coefficient (no consumed coefficient escapes the flagger)', () => {
    const missing = EXPECTED_CONSUMED_IDS.filter((id) => !manifestIdSet.has(id));
    expect(missing, `consumed coefficients missing from OC_LOCALE_COEFFICIENTS: ${missing.join(', ')}`).toEqual([]);
  });

  it('declares a non-empty reason on every localeInvariant: true descriptor', () => {
    for (const d of OC_LOCALE_COEFFICIENTS) {
      if (d.localeInvariant === true) {
        expect(typeof d.reason, `missing reason for invariant '${d.id}'`).toBe('string');
        expect((d.reason ?? '').trim().length, `empty reason for invariant '${d.id}'`).toBeGreaterThan(0);
      }
    }
  });

  it('has no duplicate ids', () => {
    expect(manifestIds.length).toBe(manifestIdSet.size);
  });
});
