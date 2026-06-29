// The OC locale-coefficient manifest (LOC-02 data layer). OC_LOCALE_COEFFICIENTS declares one
// LocaleDescriptor per coefficient the OC model consumes, classifying each as one of three kinds:
//
//   1. Locale-varying: resolves per-country from the pinned coefficient set (and the node-local
//      country factors), so it genuinely differs across NL/VN/BR and is never flagged. No opt-out.
//   2. Genuinely-global: a physical constant or a deliberate design proxy that is the same for every
//      country by design. Declared localeInvariant: true with a one-line reason (the explicit opt-out).
//   3. The historical NL-applied-everywhere figures: per-capita energy demand and per-dwelling roof
//      area. These are single global numbers that physically should vary by country. Left as DEFAULT
//      descriptors (no localeInvariant), resolving to one value for every locale, so the flagger
//      (Plan 05) catches them as constant-where-they-should-vary.
//
// Classification note (D6-3, verified against the pinned data): the pinned COEFFICIENTS show several
// consumed countryStats triples and program per-unit fields are uniform across NL/VN/BR (the design
// ratios and the garden/terrace/storage allowances). These are deliberate global design standards,
// uniform across countries by design, so they carry localeInvariant: true with a reason rather than
// being left flaggable; only the four documented per-capita demand/roof figures are the historical
// case LOC-02 flags. This keeps the flagger's output equal to exactly the historical set with zero
// false positives.
//
// The manifest only reads the pinned data; it changes no coefficient and no readout, so parity is
// untouched.
import type { LocaleDescriptor } from '@symoto/core';
import { COEFFICIENTS } from './coefficients.generated.js';
import { num, type Country } from './config.js';
import { ENERGY_ENDUSE_COUNTRY_FACTOR } from './nodes/energy.js';
import { FOOD_DEMAND_COUNTRY_FACTOR } from './nodes/food.js';
import {
  DESIGN_FOOTPRINT_COUNTRY_FACTOR,
  NITROGEN_COUNTRY_FACTOR,
  GRID_CO2_TONNES_PER_MWH,
} from './nodes/emissions.js';

/** Map the ISO locale id (from localeOf, Plan 03) back to the Country key the pinned data uses. */
const ISO_TO_COUNTRY: Record<string, Country> = {
  NL: 'Netherlands',
  VN: 'Vietnam',
  BR: 'Brazil',
};

function countryOf(locale: string): Country | null {
  return ISO_TO_COUNTRY[locale] ?? null;
}

/** A locale-varying descriptor backed by a per-country triple (resolves per-country via num). */
function triple(id: string, byCountry: Record<Country, number>): LocaleDescriptor {
  return {
    id,
    resolve: (locale) => {
      const country = countryOf(locale);
      return country ? num(byCountry[country]) : null;
    },
  };
}

/** A locale-varying descriptor that aggregates a program field across all programs, per country. */
function programAggregate(id: string, field: ProgramNumericField): LocaleDescriptor {
  return {
    id,
    resolve: (locale) => {
      const country = countryOf(locale);
      if (!country) return null;
      return COEFFICIENTS.programs.reduce((sum, p) => sum + num(p[field]?.[country]), 0);
    },
  };
}

/** A default descriptor returning a single global value for every locale (eligible to be flagged). */
function global(id: string, value: number): LocaleDescriptor {
  return { id, resolve: () => value };
}

/** A genuinely-global descriptor: the explicit localeInvariant opt-out, with a required reason. */
function invariant(id: string, value: number, reason: string): LocaleDescriptor {
  return { id, localeInvariant: true, reason, resolve: () => value };
}

type ProgramNumericField =
  | 'units'
  | 'gfaPerUnit'
  | 'footprintPerUnit'
  | 'gardenPerUnit'
  | 'terracePerUnit'
  | 'storagePerUnit'
  | 'constructionCostPerM2'
  | 'salesRevenuePerM2';

const e = COEFFICIENTS.energy;
const cs = COEFFICIENTS.countryStats;
const os = COEFFICIENTS.openSpace;

export const OC_LOCALE_COEFFICIENTS: readonly LocaleDescriptor[] = Object.freeze([
  // --- Locale-varying energy coefficients (per-country triples) ---
  triple('energy.pvYieldKwhPerKwp', e.pvYieldKwhPerKwp),
  triple('energy.turbineYieldMwh', e.turbineYieldMwh),

  // --- The historical NL-applied-everywhere figures: DEFAULT descriptors, flagged by Plan 05 ---
  global('energy.electricityKwhPerCapita', e.electricityKwhPerCapita),
  global('energy.heatToElectricityRatio', e.heatToElectricityRatio),
  global('energy.transportKwhPerCapita', e.transportKwhPerCapita),
  global('energy.roofAreaPerDwellingM2', e.roofAreaPerDwellingM2),

  // --- Genuinely-global energy physics constants (panel and turbine physics) ---
  invariant('energy.pvEfficiency', e.pvEfficiency, 'photovoltaic conversion physics, not a country parameter'),
  invariant('energy.m2PerPanel', e.m2PerPanel, 'panel geometry, a physical constant'),
  invariant('energy.kwpPerPanel', e.kwpPerPanel, 'panel rating, a physical constant'),
  invariant('energy.groundPvM2PerKwp', e.groundPvM2PerKwp, 'ground-mount PV land intensity, a physical constant'),
  invariant('energy.turbineCapacityMw', e.turbineCapacityMw, 'reference turbine rating, a physical constant'),
  invariant('energy.windFootprintM2PerTurbine', e.windFootprintM2PerTurbine, 'turbine spacing footprint, a physical constant'),

  // --- Genuinely-global energy design proxies ---
  invariant('energy.biomassMwhBaseline', e.biomassMwhBaseline, 'deliberate global biomass baseline proxy scaled by population'),
  invariant('energy.batteryStorageDaysOfDemand', e.batteryStorageDaysOfDemand, 'deliberate global storage sizing proxy'),

  // --- Locale-varying country socio-spatial stats (genuinely differ across NL/VN/BR) ---
  triple('countryStats.workingPopShare', cs.workingPopShare),
  triple('countryStats.effectiveFtePerPerson', cs.effectiveFtePerPerson),
  triple('countryStats.precipitationMmPerYr', cs.precipitationMmPerYr),

  // --- Global design standards stored per-country but uniform by design (opt-out with reason) ---
  invariant('countryStats.infraMetersPerInhabitant', num(cs.infraMetersPerInhabitant.Netherlands), 'uniform infrastructure design standard across countries'),
  invariant('countryStats.parkingSpacePerUnit', num(cs.parkingSpacePerUnit.Netherlands), 'uniform parking design standard across countries'),
  invariant('countryStats.parksFracOfFootprint', num(cs.parksFracOfFootprint.Netherlands), 'uniform parks design ratio across countries'),
  invariant('countryStats.playgroundsFracOfFootprint', num(cs.playgroundsFracOfFootprint.Netherlands), 'uniform playgrounds design ratio across countries'),
  invariant('countryStats.squaresFracOfFootprint', num(cs.squaresFracOfFootprint.Netherlands), 'uniform squares design ratio across countries'),

  // --- Locale-varying program aggregates (per-country, genuinely differ) ---
  programAggregate('programs.units', 'units'),
  programAggregate('programs.gfaPerUnit', 'gfaPerUnit'),
  programAggregate('programs.footprintPerUnit', 'footprintPerUnit'),
  programAggregate('programs.constructionCostPerM2', 'constructionCostPerM2'),
  programAggregate('programs.salesRevenuePerM2', 'salesRevenuePerM2'),

  // --- Global program allowances, uniform across countries by design (opt-out with reason) ---
  invariant('programs.gardenPerUnit', COEFFICIENTS.programs.reduce((s, p) => s + num(p.gardenPerUnit.Netherlands), 0), 'uniform garden allowance design standard across countries'),
  invariant('programs.terracePerUnit', COEFFICIENTS.programs.reduce((s, p) => s + num(p.terracePerUnit.Netherlands), 0), 'uniform terrace allowance design standard across countries'),
  invariant('programs.storagePerUnit', COEFFICIENTS.programs.reduce((s, p) => s + num(p.storagePerUnit.Netherlands), 0), 'uniform storage allowance design standard across countries'),

  // --- Genuinely-global open-space and meta proxies ---
  invariant('openSpace.natureRatio', os.natureRatio, 'deliberate global nature-share design proxy'),
  invariant('openSpace.waterRatio', os.waterRatio, 'deliberate global surface-water-share design proxy'),
  invariant('openSpace.agricultureHaPerCapita', os.agricultureHaPerCapita, 'deliberate global agricultural-land-per-capita design proxy at the NL baseline'),
  invariant('meta.baselinePopulation', COEFFICIENTS.meta.baselinePopulation, 'the fixed reference population the model scales from, not a country parameter'),

  // --- Locale-varying node-local country factors ---
  triple('energy.endUseFactor', ENERGY_ENDUSE_COUNTRY_FACTOR),
  triple('food.demandFactor', FOOD_DEMAND_COUNTRY_FACTOR),
  triple('emissions.designFootprintFactor', DESIGN_FOOTPRINT_COUNTRY_FACTOR),
  triple('emissions.nitrogenFactor', NITROGEN_COUNTRY_FACTOR),
  triple('emissions.gridCo2', GRID_CO2_TONNES_PER_MWH),
]);
