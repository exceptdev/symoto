// Food domain node. computeFoodRaw is a verbatim port of vizapp/src/sim/food.ts: production
// segmented across the four agriculture systems via the vendored systemLandM2/AGRI_CONFIG, the
// regenerative +15% yield bonus, the dietary production-efficiency and consumption-composition
// effects, the 14-category breakdown, and the value/jobs/water/carbon aggregates. The node
// recomputes the closed land use from the wired energyGenerationLandM2 (it reads agricultureM2)
// and exposes the structured breakdowns as per-leaf readouts.
import { q, input, type Node, type QMap } from '@symoto/core';
import { COEFFICIENTS } from '../coefficients.generated.js';
import { num, type ModelCoefficients, type Country } from '../config.js';
import type { SimInputs, LandUseResult, DietaryPreference } from '../types.js';
import { computeLandUseRaw } from './land.js';
import { AGRI_SYSTEMS, AGRI_CONFIG, mix as agriMix, systemLandM2, type AgriSystem, type AgriMix } from '../agriConfig.js';
import { LAND, MASS_FLOW, MONEY, WATER_FLOW, CARBON_TERRITORIAL, COUNT, INDEX, port, m2U, tU, usdU, idxU, m3U } from '../boundaries.js';

const KG_PER_TONNE = 1000;
const FOOD_CONSUMPTION_KG_PER_CAPITA = 800;

const FOOD_DEMAND_COUNTRY_FACTOR: Record<Country, number> = {
  Netherlands: 1.0,
  Vietnam: 0.8,
  Brazil: 0.88,
};

export const FOOD_CATEGORIES = [
  'cereals', 'vegetables', 'fruit', 'legumes', 'nuts', 'oilCrops',
  'roots', 'sugarCrops', 'dairy', 'meat', 'eggs', 'fish', 'beverages', 'other',
] as const;

export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

const BASE_CONSUMPTION_SHARES: Record<FoodCategory, number> = {
  cereals: 0.22, vegetables: 0.12, fruit: 0.1, legumes: 0.04, nuts: 0.02, oilCrops: 0.03,
  roots: 0.06, sugarCrops: 0.04, dairy: 0.15, meat: 0.1, eggs: 0.02, fish: 0.03, beverages: 0.02, other: 0.05,
};

const FOOD_LAND_FRACTIONS: Record<string, number> = {
  cereals: 0.22, vegetables: 0.09, fruit: 0.06, legumes: 0.04, nuts: 0.01, oilCrops: 0.05,
  roots: 0.1, sugarCrops: 0.08, dairy: 0.18, meat: 0.12, eggs: 0.03, fish: 0.02,
};

const PRODUCTION_YIELD_KG_PER_M2: Record<string, number> = {
  cereals: 0.8, vegetables: 3.5, fruit: 2.0, legumes: 0.5, nuts: 0.1, oilCrops: 0.3,
  roots: 4.0, sugarCrops: 6.0, dairy: 0.02, meat: 0.01, eggs: 0.005, fish: 0.01,
};

const REGEN_YIELD_BONUS = 1.15;

const DIET_PRODUCTION_FACTOR: Record<DietaryPreference, number> = {
  omnivore: 1.0, flexitarian: 1.1, vegetarian: 1.25, vegan: 1.4,
};

const CALIBRATION = 4.433041688678313;

const NON_PRODUCED = new Set<string>(['beverages', 'other']);

function consumptionSharesFor(diet: DietaryPreference): Record<FoodCategory, number> {
  const shares: Record<FoodCategory, number> = { ...BASE_CONSUMPTION_SHARES };
  let removed: FoodCategory[] = [];
  if (diet === 'vegetarian') removed = ['meat', 'fish'];
  else if (diet === 'vegan') removed = ['meat', 'dairy', 'eggs', 'fish'];
  if (removed.length === 0) return shares;

  let freed = 0;
  for (const c of removed) {
    freed += shares[c];
    shares[c] = 0;
  }
  const sinks: FoodCategory[] = ['legumes', 'vegetables', 'cereals'];
  const sinkBase = sinks.reduce((sum, c) => sum + BASE_CONSUMPTION_SHARES[c], 0);
  for (const c of sinks) {
    shares[c] += freed * (BASE_CONSUMPTION_SHARES[c] / sinkBase);
  }
  return shares;
}

export interface FoodCategoryBreakdown {
  productionTonnes: number;
  consumptionTonnes: number;
}

export interface FoodSystemBreakdown {
  landM2: number;
  landShare: number;
  productionTonnes: number;
  valueEur: number;
  jobsFte: number;
  waterM3: number;
  carbonSequestrationTonnes: number;
}

export interface FoodResult {
  totalProductionTonnesPerYr: number;
  totalConsumptionTonnesPerYr: number;
  selfSufficiencyPct: number;
  agricultureM2: number;
  agricultureHa: number;
  regenerative: boolean;
  categoryBreakdown: Record<string, FoodCategoryBreakdown>;
  productionFocus: number;
  systemMix: AgriMix;
  systemBreakdown: Record<AgriSystem, FoodSystemBreakdown>;
  totalValueEurPerYr: number;
  totalJobsFte: number;
  totalWaterM3PerYr: number;
  agriCarbonSequestrationTonnesPerYr: number;
}

/** Verbatim port of the bespoke computeFood. */
export function computeFoodRaw(
  landUse: LandUseResult,
  inputs: SimInputs,
  _coeffs: ModelCoefficients = COEFFICIENTS,
): FoodResult {
  const country = landUse.country;
  const population = Math.max(0, landUse.population);
  const agricultureM2 = Math.max(0, landUse.agricultureM2);

  const scenario = (inputs.foodScenario ?? 'conventional').toLowerCase();
  const regenerative = scenario === 'regenerative' || scenario === 'regen';
  const regenMultiplier = regenerative ? REGEN_YIELD_BONUS : 1.0;

  const diet: DietaryPreference = inputs.dietaryPreference ?? 'omnivore';
  const dietProductionFactor = DIET_PRODUCTION_FACTOR[diet];
  const consumptionShares = consumptionSharesFor(diet);

  const foodDemandFactor = num(FOOD_DEMAND_COUNTRY_FACTOR[country]);
  const totalConsumptionKg = FOOD_CONSUMPTION_KG_PER_CAPITA * population * foodDemandFactor;

  const productionFocus = Math.max(0, Math.min(1, inputs.productionFocus ?? 0));
  const systemMix = agriMix(productionFocus);
  const landBySystem = systemLandM2(agricultureM2, productionFocus);

  const systemBreakdown = {} as Record<AgriSystem, FoodSystemBreakdown>;
  let totalProductionKg = 0;
  let totalValueEurPerYr = 0;
  let totalJobsFte = 0;
  let totalWaterM3PerYr = 0;
  let agriCarbonSequestrationTonnesPerYr = 0;

  for (const system of AGRI_SYSTEMS) {
    const cfg = AGRI_CONFIG[system];
    const landM2 = landBySystem[system];

    const productionKg = landM2 * cfg.yieldKgPerM2 * regenMultiplier * dietProductionFactor * CALIBRATION;
    totalProductionKg += productionKg;

    const valueEur = landM2 * cfg.valueEurPerM2;
    const jobsFte = (landM2 / 10_000) * cfg.jobsFtePerHa;
    const waterM3 = landM2 * cfg.waterM3PerM2;
    const carbonTonnes = landM2 * cfg.sequestrationTonnesPerM2;

    totalValueEurPerYr += valueEur;
    totalJobsFte += jobsFte;
    totalWaterM3PerYr += waterM3;
    agriCarbonSequestrationTonnesPerYr += carbonTonnes;

    systemBreakdown[system] = {
      landM2,
      landShare: systemMix[system],
      productionTonnes: productionKg / KG_PER_TONNE,
      valueEur,
      jobsFte,
      waterM3,
      carbonSequestrationTonnes: carbonTonnes,
    };
  }

  const totalProductionTonnesPerYr = totalProductionKg / KG_PER_TONNE;

  const categoryBreakdown: Record<string, FoodCategoryBreakdown> = {};
  const categoryWeights: Record<string, number> = {};
  let totalCategoryWeight = 0;
  for (const category of FOOD_CATEGORIES) {
    let weight = 0;
    if (!NON_PRODUCED.has(category)) {
      const landFraction = FOOD_LAND_FRACTIONS[category] ?? 0;
      const yieldKgPerM2 = PRODUCTION_YIELD_KG_PER_M2[category] ?? 0;
      weight = landFraction * yieldKgPerM2;
    }
    categoryWeights[category] = weight;
    totalCategoryWeight += weight;
  }
  for (const category of FOOD_CATEGORIES) {
    const consumptionKg = totalConsumptionKg * consumptionShares[category];
    const productionTonnes =
      totalCategoryWeight > 0 ? totalProductionTonnesPerYr * (categoryWeights[category]! / totalCategoryWeight) : 0;
    categoryBreakdown[category] = { productionTonnes, consumptionTonnes: consumptionKg / KG_PER_TONNE };
  }
  const totalConsumptionTonnesPerYr = totalConsumptionKg / KG_PER_TONNE;

  const selfSufficiencyPct =
    totalConsumptionTonnesPerYr > 0 ? (totalProductionTonnesPerYr / totalConsumptionTonnesPerYr) * 100 : 0;

  return {
    totalProductionTonnesPerYr,
    totalConsumptionTonnesPerYr,
    selfSufficiencyPct,
    agricultureM2,
    agricultureHa: agricultureM2 / 10_000,
    regenerative,
    categoryBreakdown,
    productionFocus,
    systemMix,
    systemBreakdown,
    totalValueEurPerYr,
    totalJobsFte,
    totalWaterM3PerYr,
    agriCarbonSequestrationTonnesPerYr,
  };
}

const D = 'food';

/** Build the food node for a scenario. */
export function makeFoodNode(inputs: SimInputs): Node {
  return {
    id: 'n6-food',
    kind: 'readout',
    ports: {
      in: [port(`${D}.energyGenerationLandM2In`, m2U, LAND)],
      out: [
        port(`${D}.totalProductionTonnesPerYr`, tU, MASS_FLOW),
        port(`${D}.totalConsumptionTonnesPerYr`, tU, MASS_FLOW),
        port(`${D}.selfSufficiencyPct`, idxU, INDEX),
        port(`${D}.agricultureM2`, m2U, LAND),
        port(`${D}.agricultureHa`, idxU, LAND),
        port(`${D}.productionFocus`, idxU, INDEX),
        port(`${D}.totalValueEurPerYr`, usdU, MONEY),
        port(`${D}.totalJobsFte`, idxU, COUNT),
        port(`${D}.totalWaterM3PerYr`, m3U, WATER_FLOW),
        port(`${D}.agriCarbonSequestrationTonnesPerYr`, tU, CARBON_TERRITORIAL),
      ],
    },
    compute: (_ctx, portInputs): QMap => {
      const energyGen = portInputs[`${D}.energyGenerationLandM2In`]?.value ?? 0;
      const landUse = computeLandUseRaw(inputs, COEFFICIENTS, energyGen);
      const r = computeFoodRaw(landUse, inputs, COEFFICIENTS);
      const P = (id: string, v: number, u = tU, b = MASS_FLOW) => [`${D}.${id}`, q(v, u, b, input(`${D}:${id}`))] as const;
      const out: Array<readonly [string, ReturnType<typeof q>]> = [
        P('totalProductionTonnesPerYr', r.totalProductionTonnesPerYr),
        P('totalConsumptionTonnesPerYr', r.totalConsumptionTonnesPerYr),
        P('selfSufficiencyPct', r.selfSufficiencyPct, idxU, INDEX),
        P('agricultureM2', r.agricultureM2, m2U, LAND),
        P('agricultureHa', r.agricultureHa, idxU, LAND),
        P('productionFocus', r.productionFocus, idxU, INDEX),
        P('totalValueEurPerYr', r.totalValueEurPerYr, usdU, MONEY),
        P('totalJobsFte', r.totalJobsFte, idxU, COUNT),
        P('totalWaterM3PerYr', r.totalWaterM3PerYr, m3U, WATER_FLOW),
        P('agriCarbonSequestrationTonnesPerYr', r.agriCarbonSequestrationTonnesPerYr, tU, CARBON_TERRITORIAL),
      ];
      for (const s of AGRI_SYSTEMS) {
        out.push([`${D}.systemMix.${s}`, q(r.systemMix[s], idxU, INDEX, input(`${D}:systemMix.${s}`))]);
        const sb = r.systemBreakdown[s];
        out.push([`${D}.systemBreakdown.${s}.landM2`, q(sb.landM2, m2U, LAND, input(`${D}:sb.${s}.landM2`))]);
        out.push([`${D}.systemBreakdown.${s}.landShare`, q(sb.landShare, idxU, INDEX, input(`${D}:sb.${s}.landShare`))]);
        out.push([`${D}.systemBreakdown.${s}.productionTonnes`, q(sb.productionTonnes, tU, MASS_FLOW, input(`${D}:sb.${s}.prod`))]);
        out.push([`${D}.systemBreakdown.${s}.valueEur`, q(sb.valueEur, usdU, MONEY, input(`${D}:sb.${s}.value`))]);
        out.push([`${D}.systemBreakdown.${s}.jobsFte`, q(sb.jobsFte, idxU, COUNT, input(`${D}:sb.${s}.jobs`))]);
        out.push([`${D}.systemBreakdown.${s}.waterM3`, q(sb.waterM3, m3U, WATER_FLOW, input(`${D}:sb.${s}.water`))]);
        out.push([`${D}.systemBreakdown.${s}.carbonSequestrationTonnes`, q(sb.carbonSequestrationTonnes, tU, CARBON_TERRITORIAL, input(`${D}:sb.${s}.carbon`))]);
      }
      for (const c of FOOD_CATEGORIES) {
        const cb = r.categoryBreakdown[c]!;
        out.push([`${D}.categoryBreakdown.${c}.productionTonnes`, q(cb.productionTonnes, tU, MASS_FLOW, input(`${D}:cb.${c}.prod`))]);
        out.push([`${D}.categoryBreakdown.${c}.consumptionTonnes`, q(cb.consumptionTonnes, tU, MASS_FLOW, input(`${D}:cb.${c}.cons`))]);
      }
      return Object.fromEntries(out);
    },
  };
}
