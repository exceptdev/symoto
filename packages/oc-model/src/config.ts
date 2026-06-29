/**
 * Typed contract for the model coefficients extracted from the Orchid City
 * workbook (data/spreadsheets/dev-model.xlsx) by scripts/extract_model.py.
 *
 * The generated data lives in coefficients.generated.ts. This module defines
 * the types and small accessors used by the simulation engine.
 */

export type Country = 'Netherlands' | 'Vietnam' | 'Brazil';

export const COUNTRIES: Country[] = ['Netherlands', 'Vietnam', 'Brazil'];

/** A per-country numeric triple. */
export type CountryTriple = Record<Country, number>;

/** Optional per-country numeric triple (cost/revenue may be missing). */
export type CountryTripleOpt = Record<Country, number | null>;

/** One built-environment program line (housing type, school, office, …). */
export interface ProgramCoefficient {
  category: string;
  name: string;
  code: string | null;
  units: CountryTriple;
  gfaPerUnit: CountryTriple;
  footprintPerUnit: CountryTriple;
  gardenPerUnit: CountryTriple;
  terracePerUnit: CountryTriple;
  storagePerUnit: CountryTriple;
  constructionCostPerM2: CountryTripleOpt;
  salesRevenuePerM2: CountryTripleOpt;
  minPopulation: number | null;
}

/** Per-country socio-spatial coefficients (I - Country Stats). */
export interface CountryStats {
  householdSize: CountryTriple;
  workingPopShare: CountryTriple;
  effectiveFtePerPerson: CountryTriple;
  officeM2PerInhabitant: CountryTriple;
  retailM2PerInhabitant: CountryTriple;
  infraMetersPerInhabitant: CountryTriple;
  parkingSpacePerUnit: CountryTriple;
  parksFracOfFootprint: CountryTriple;
  playgroundsFracOfFootprint: CountryTriple;
  squaresFracOfFootprint: CountryTriple;
  precipitationMmPerYr: CountryTriple;
}

export interface OpenSpaceCoefficients {
  /** Nature (wild) as a fraction of developed + agricultural land. */
  natureRatio: number;
  /** Surface water as a fraction of developed + agricultural land. */
  waterRatio: number;
  agricultureHaNlBaseline: Record<string, number>;
  /** Agricultural land per person (ha) at the NL baseline food scenario. */
  agricultureHaPerCapita: number;
}

export interface EnergyCoefficients {
  pvYieldKwhPerKwp: CountryTriple;
  pvEfficiency: number;
  turbineCapacityMw: number;
  turbineYieldMwh: CountryTriple;
  biomassMwhBaseline: number;
  electricityKwhPerCapita: number;
  heatToElectricityRatio: number;
  transportKwhPerCapita: number;
  roofAreaPerDwellingM2: number;
  m2PerPanel: number;
  kwpPerPanel: number;
  groundPvM2PerKwp: number;
  windFootprintM2PerTurbine: number;
  batteryStorageDaysOfDemand: number;
}

export interface ModelCoefficients {
  meta: { source: string; baselinePopulation: number; countries: Country[] };
  programs: ProgramCoefficient[];
  countryStats: CountryStats;
  openSpace: OpenSpaceCoefficients;
  energy: EnergyCoefficients;
}

/** Coerce a possibly-missing country value to a finite number. */
export function num(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
