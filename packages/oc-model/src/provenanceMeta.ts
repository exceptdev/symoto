// Central provenance-meta registry (PROV-01, D5-2). The mechanical half of "where did this number
// come from" (node identity, input dependencies, topology, and the within-node DAG) is captured
// automatically by the evaluator (Plan 02). The human-readable formula and the coefficient/source
// citations cannot be mechanically recovered from the verbatim bare-number compute, so they are
// authored here, keyed by readout key, and attached to each node's `meta` at assembly time
// (model.ts). This keeps the eight parity-proven node files untouched, so parity is preserved.
//
// Each entry's `sources` cite real coefficient ids and named constants that appear in the cited
// node's compute, with a `source` origin string pointing at the pinned coefficient set and its xlsx
// provenance. A locale-sensitive figure (a per-country factor) is flagged localeSensitive.
import { sourceRef, type SourceRef, type Node } from '@symoto/core';

// NodeMeta is the optional metadata on Node (Plan 02). Reference it via the Node type so this plan
// stays entirely within oc-model and does not need to touch the core barrel.
type NodeMeta = NonNullable<Node['meta']>;

// The pinned coefficient lineage (coefficients.generated.ts header): the bespoke xlsx and commit.
const XLSX = 'data/spreadsheets/dev-model.xlsx';
const PIN = 'coefficients.generated.ts @ d3c93d1';
const SRC = `${XLSX} (${PIN})`;

export interface ReadoutMeta {
  readonly formula: string;
  readonly sources: readonly SourceRef[];
}

/**
 * Readout key -> authored formula and source citations, for the headline readouts across all eight
 * domains. Extensible: a readout without an entry still reconstructs its mechanical origin (topology
 * and within-node DAG); the registry adds the human-readable formula and the citations on top.
 */
export const PROVENANCE_META: Record<string, ReadoutMeta> = {
  // Land
  'land.totalLandM2': {
    formula:
      'total land = built footprint + urban green + roads + parking + infrastructure + agriculture + nature + water + open space, all scaled by population over the baseline population',
    sources: [
      sourceRef('programs', true, `${SRC}: per-country program areas and units`),
      sourceRef('meta.baselinePopulation', false, `${SRC}: baseline population 50000`),
      sourceRef('ROAD_WIDTH_FACTOR', false, 'nodes/land.ts: road-width derivation constant'),
    ],
  },

  // Energy
  'energy.totalDemandMwh': {
    formula:
      'total demand = electricity + heat + transport demand; electricity and transport = per-capita kWh x end-use country factor x population / 1000; heat = electricity x heat-to-electricity ratio',
    sources: [
      sourceRef('energy.electricityKwhPerCapita', false, `${SRC}: per-capita electricity demand`),
      sourceRef('energy.transportKwhPerCapita', false, `${SRC}: per-capita transport demand`),
      sourceRef('energy.heatToElectricityRatio', false, `${SRC}: heat-to-electricity ratio`),
      sourceRef('ENERGY_ENDUSE_COUNTRY_FACTOR', true, 'nodes/energy.ts: per-country end-use localization factor'),
    ],
  },
  'energy.totalSupplyMwh': {
    formula: 'total supply = rooftop solar + ground solar + wind + biomass',
    sources: [
      sourceRef('energy.pvYieldKwhPerKwp', true, `${SRC}: per-country PV yield`),
      sourceRef('energy.turbineYieldMwh', true, `${SRC}: per-country turbine yield`),
      sourceRef('energy.biomassMwhBaseline', false, `${SRC}: baseline biomass generation`),
    ],
  },
  'energy.selfSufficiency': {
    formula: 'self-sufficiency = total supply / total demand (0 when demand is 0)',
    sources: [
      sourceRef('energy.pvYieldKwhPerKwp', true, `${SRC}: per-country PV yield`),
      sourceRef('energy.turbineYieldMwh', true, `${SRC}: per-country turbine yield`),
      sourceRef('energy.electricityKwhPerCapita', false, `${SRC}: per-capita electricity demand`),
    ],
  },

  // Water
  'water.selfSufficiencyPct': {
    formula:
      'water self-sufficiency = provided supply / consumption, capped at 100 percent; provided supply draws on harvestable rain (precipitation x catchment x harvest fraction) and surface storage',
    sources: [
      sourceRef('countryStats.precipitationMmPerYr', true, `${SRC}: per-country precipitation`),
      sourceRef('HARVEST_FRACTION', false, 'nodes/water.ts: rainwater harvest fraction'),
      sourceRef('SURFACE_WATER_DEPTH_M', false, 'nodes/water.ts: surface storage depth'),
    ],
  },

  // Waste
  'waste.divertedFromLandfillPct': {
    formula:
      'diversion = diverted tonnes / waste generated; waste generated = per-capita waste x population (regen scenario reduces generation and lifts diversion)',
    sources: [
      sourceRef('WASTE_KG_PER_CAPITA', false, 'nodes/waste.ts: per-capita waste generation'),
      sourceRef('REGEN_WASTE_DIVERSION', false, 'nodes/waste.ts: regenerative diversion rate'),
    ],
  },

  // Jobs
  'jobs.jobSelfSufficiencyPct': {
    formula:
      'job self-sufficiency = total jobs / working-age population, capped; working-age population = population x (1 - school-age fraction) via per-country demographics',
    sources: [
      sourceRef('countryStats', true, `${SRC}: per-country demographic statistics`),
      sourceRef('SCHOOL_AGE_FRACTION', false, 'nodes/jobs.ts: school-age fraction'),
    ],
  },

  // Food
  'food.selfSufficiencyPct': {
    formula:
      'food self-sufficiency = total production / total consumption; consumption = per-capita food x population; production is segmented across the four agriculture systems',
    sources: [
      sourceRef('FOOD_CONSUMPTION_KG_PER_CAPITA', false, 'nodes/food.ts: per-capita food consumption'),
      sourceRef('AGRI_CONFIG', false, 'agriConfig.ts: per-system agriculture yields and land use'),
    ],
  },

  // Cost
  'cost.investmentUsd': {
    formula:
      'investment = construction cost + land cost + finance cost; construction cost = built and open-space areas x per-m2 construction cost, converted EUR to USD',
    sources: [
      sourceRef('constructionCostPerM2', false, 'nodes/cost.ts: per-m2 construction cost'),
      sourceRef('LAND_COST_EUR_PER_CAPITA', false, 'nodes/cost.ts: per-capita land cost'),
      sourceRef('EUR_TO_USD_RATE', false, 'nodes/cost.ts: EUR to USD conversion'),
    ],
  },

  // Emissions (the carbon account)
  'emissions.grossDesignFootprintTonnesPerYr': {
    formula:
      'gross design footprint = households CO2 + food CO2 + transport CO2; each = per-capita tonnes x population, adjusted for diet and operational shares',
    sources: [
      sourceRef('NL_HOUSEHOLDS_TONNES_PER_CAPITA', false, 'nodes/emissions.ts: per-capita household CO2'),
      sourceRef('NL_FOOD_TONNES_PER_CAPITA', false, 'nodes/emissions.ts: per-capita food CO2'),
      sourceRef('NL_TRANSPORT_TONNES_PER_CAPITA', false, 'nodes/emissions.ts: per-capita transport CO2'),
      sourceRef('DIET_CO2', true, 'nodes/emissions.ts: per-diet CO2 factors'),
    ],
  },
  'emissions.carbonSequestrationTonnesPerYr': {
    formula:
      'sequestration = raw on-site sequestration x maturity factor; raw sequestration draws on nature area and agriculture system sequestration rates',
    sources: [
      sourceRef('AGRI_CONFIG', false, 'agriConfig.ts: per-system sequestration rates'),
      sourceRef('EMBODIED_AMORTIZATION_YEARS', false, 'nodes/emissions.ts: maturity and amortization'),
    ],
  },
  'emissions.netCarbonTonnesPerYr': {
    formula:
      'net carbon = gross operational emissions - territorial on-site sequestration, obtainable only through the explicit, labeled operational-territorial-net boundary crossing (never a silent net)',
    sources: [
      sourceRef('NET_CARBON_METHOD', false, 'nodes/emissions.ts: operational-territorial-net labeled crossing'),
    ],
  },
};

/**
 * Build a NodeMeta for a node by collecting the registry entries for its readout keys. Returns
 * undefined when none of the node's readouts have an authored entry, so a node without authored meta
 * stays meta-less (and still reconstructs its mechanical origin).
 */
export function metaForNode(_nodeId: string, readoutKeys: readonly string[]): NodeMeta | undefined {
  const formula: Record<string, string> = {};
  const sources: Record<string, readonly SourceRef[]> = {};
  let found = false;
  for (const key of readoutKeys) {
    const entry = PROVENANCE_META[key];
    if (!entry) continue;
    formula[key] = entry.formula;
    sources[key] = entry.sources;
    found = true;
  }
  return found ? { formula, sources } : undefined;
}
