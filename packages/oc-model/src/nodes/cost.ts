// Cost domain node. computeCostRaw is a verbatim port of vizapp/src/sim/cost.ts: the
// per-category GFA-weighted construction/sales rates (buildCategoryRates), the SALES_MARKUP
// fallback, the SUSTAINABILITY_PREMIUM, open-space construction by land type, land acquisition,
// opex/revenue, the internal discounted cash flow and Newton-Raphson construction return rate,
// ROI, profit, and jobsCreated. The node recomputes the closed land use from the wired
// energyGenerationLandM2 (cost reads per-category GFA and the energy-folded open-space areas).
import { q, input, type Node, type QMap } from '@symoto/core';
import { COEFFICIENTS } from '../coefficients.generated.js';
import { num, type ModelCoefficients, type Country } from '../config.js';
import type { LandUseResult } from '../types.js';
import { computeLandUseRaw } from './land.js';
import type { SimInputs } from '../types.js';
import { LAND, MONEY, COUNT, INDEX, port, m2U, usdU, idxU } from '../boundaries.js';

const EUR_TO_USD_RATE = 1.08;
const SUSTAINABILITY_PREMIUM = 0.1;

const OPEN_SPACE_COST_EUR_PER_M2 = {
  urbanGreen: 15, roads: 120, parking: 60, agriculture: 3, nature: 2, water: 5,
} as const;

const BLENDED_OPEX_EUR_PER_M2 = 16.37;
const BLENDED_REVENUE_EUR_PER_M2 = 5.96;
const LAND_COST_EUR_PER_CAPITA = 57_432;
const FINANCE_COST_EUR_PER_CAPITA = 4_963;
const SALES_MARKUP = 0.3;
const DISCOUNT_RATE = 0.01;
const DEFAULT_CONSTRUCTION_PHASE_YEARS = 10;

export interface CostResult {
  constructionCostUsd: number;
  builtConstructionCostUsd: number;
  openSpaceConstructionCostUsd: number;
  landCostUsd: number;
  investmentUsd: number;
  opexAnnualUsd: number;
  revenueAnnualUsd: number;
  salesTotalUsd: number;
  discountedCashflowValueUsd: number;
  constructionReturnRatePct: number;
  roiPct: number;
  profitUsd: number;
  jobsCreated: number;
}

function buildCategoryRates(
  coeffs: ModelCoefficients,
  country: Country,
): Record<string, { constructionCostPerM2: number; salesRevenuePerM2: number }> {
  const acc: Record<string, { gfa: number; costGfa: number; salesGfa: number }> = {};
  for (const p of coeffs.programs) {
    const units = num(p.units[country]);
    const gfaPerUnit = num(p.gfaPerUnit[country]);
    const gfa = units * gfaPerUnit;
    if (gfa <= 0) continue;
    const cost = num(p.constructionCostPerM2[country]);
    const sales = num(p.salesRevenuePerM2[country]);
    const a = (acc[p.category] ??= { gfa: 0, costGfa: 0, salesGfa: 0 });
    a.gfa += gfa;
    a.costGfa += gfa * cost;
    a.salesGfa += gfa * sales;
  }
  const out: Record<string, { constructionCostPerM2: number; salesRevenuePerM2: number }> = {};
  for (const [cat, a] of Object.entries(acc)) {
    out[cat] = {
      constructionCostPerM2: a.gfa > 0 ? a.costGfa / a.gfa : 0,
      salesRevenuePerM2: a.gfa > 0 ? a.salesGfa / a.gfa : 0,
    };
  }
  return out;
}

function buildCashFlows(investment: number, sales: number, netIncome: number, years: number): number[] {
  if (years <= 0) return [-investment];
  const flows: number[] = [-investment];
  const salesShares: number[] = [];
  let shareSum = 0;
  for (let t = 1; t <= years; t++) {
    const share = 1 / Math.pow(t, 1.5);
    salesShares.push(share);
    shareSum += share;
  }
  for (let t = 0; t < years; t++) {
    const salesThisYear = shareSum > 0 ? sales * ((salesShares[t] ?? 0) / shareSum) : 0;
    flows.push(salesThisYear + netIncome);
  }
  return flows;
}

function computeReturnRate(cashFlows: number[]): number {
  if (cashFlows.length < 2) return 0;
  const MAX_ITERATIONS = 100;
  const TOLERANCE = 1e-8;
  let rate = 0.05;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let discountedSum = 0;
    let discountedSumDerivative = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      const cf = cashFlows[t] ?? 0;
      const denominator = Math.pow(1 + rate, t);
      if (denominator <= 0) return 0;
      discountedSum += cf / denominator;
      if (t > 0) discountedSumDerivative -= (t * cf) / Math.pow(1 + rate, t + 1);
    }
    if (Math.abs(discountedSumDerivative) < 1e-15) return rate;
    const newRate = rate - discountedSum / discountedSumDerivative;
    if (Math.abs(newRate - rate) < TOLERANCE) return newRate;
    rate = newRate;
    if (rate < -0.99 || rate > 10) return 0;
  }
  return rate;
}

/** Verbatim port of the bespoke computeCost. */
export function computeCostRaw(landUse: LandUseResult, coeffs: ModelCoefficients = COEFFICIENTS): CostResult {
  const country = landUse.country;
  const population = Math.max(0, landUse.population);

  const rateByCategory = buildCategoryRates(coeffs, country);

  let builtConstructionEur = 0;
  let salesEur = 0;
  for (const cat of landUse.byCategory) {
    const gfa = Math.max(0, cat.gfaM2);
    const r = rateByCategory[cat.category];
    const costPerM2 = r ? r.constructionCostPerM2 : 0;
    const salesPerM2 = r && r.salesRevenuePerM2 > 0 ? r.salesRevenuePerM2 : costPerM2 * (1 + SALES_MARKUP);
    builtConstructionEur += gfa * costPerM2;
    salesEur += gfa * salesPerM2;
  }
  builtConstructionEur *= 1 + SUSTAINABILITY_PREMIUM;

  const c = OPEN_SPACE_COST_EUR_PER_M2;
  const openSpaceConstructionEur =
    Math.max(0, landUse.urbanGreenM2) * c.urbanGreen +
    Math.max(0, landUse.roadsM2) * c.roads +
    Math.max(0, landUse.parkingM2) * c.parking +
    Math.max(0, landUse.agricultureM2) * c.agriculture +
    Math.max(0, landUse.natureM2) * c.nature +
    Math.max(0, landUse.waterM2) * c.water;

  const constructionEur = builtConstructionEur + openSpaceConstructionEur;

  const landCostEur = population * LAND_COST_EUR_PER_CAPITA;
  const investmentEur = constructionEur + landCostEur;

  const builtGfaM2 = Math.max(0, landUse.builtGfaM2);
  const opexAnnualEur = builtGfaM2 * BLENDED_OPEX_EUR_PER_M2;
  const revenueAnnualEur = builtGfaM2 * BLENDED_REVENUE_EUR_PER_M2;

  const OPEN_SPACE_SALES_MARKUP = 0.06;
  const AGRI_REVENUE_EUR_PER_M2 = 10.4;
  const ENERGY_REVENUE_EUR_PER_CAPITA = 6_667;
  const openSpaceSalesEur = openSpaceConstructionEur * (1 + OPEN_SPACE_SALES_MARKUP);
  const agriRevenueEur = Math.max(0, landUse.agricultureM2) * AGRI_REVENUE_EUR_PER_M2;
  const energyRevenueEur = population * ENERGY_REVENUE_EUR_PER_CAPITA;
  const totalProceedsEur = salesEur + openSpaceSalesEur + landCostEur + agriRevenueEur + energyRevenueEur;

  const years = DEFAULT_CONSTRUCTION_PHASE_YEARS;
  const annualNetIncomeEur = revenueAnnualEur - opexAnnualEur;
  const cashFlows = buildCashFlows(investmentEur, totalProceedsEur, annualNetIncomeEur, years);

  let discountedCashflowEur = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    const cf = cashFlows[t] ?? 0;
    const discountFactor = Math.pow(1 + DISCOUNT_RATE, t + 1);
    discountedCashflowEur += discountFactor > 0 ? cf / discountFactor : cf;
  }

  const constructionReturnRatePct = computeReturnRate(cashFlows) * 100;

  const financeCostEur = population * FINANCE_COST_EUR_PER_CAPITA;
  const totalFinalCostEur = investmentEur + financeCostEur;
  const profitEur = totalProceedsEur - totalFinalCostEur;
  const roiPct = investmentEur > 0 ? (profitEur / investmentEur) * 100 : 0;

  const EUR_PER_CONSTRUCTION_FTE_YEAR = 250_000;
  const jobsCreated = Math.round(constructionEur / EUR_PER_CONSTRUCTION_FTE_YEAR);

  const usd = (eur: number) => eur * EUR_TO_USD_RATE;

  return {
    constructionCostUsd: usd(constructionEur),
    builtConstructionCostUsd: usd(builtConstructionEur),
    openSpaceConstructionCostUsd: usd(openSpaceConstructionEur),
    landCostUsd: usd(landCostEur),
    investmentUsd: usd(investmentEur),
    opexAnnualUsd: usd(opexAnnualEur),
    revenueAnnualUsd: usd(revenueAnnualEur),
    salesTotalUsd: usd(totalProceedsEur),
    discountedCashflowValueUsd: usd(discountedCashflowEur),
    constructionReturnRatePct,
    roiPct,
    profitUsd: usd(profitEur),
    jobsCreated,
  };
}

const D = 'cost';

/** Build the cost node for a scenario. */
export function makeCostNode(inputs: SimInputs): Node {
  return {
    id: 'n7-cost',
    kind: 'readout',
    ports: {
      in: [port(`${D}.energyGenerationLandM2In`, m2U, LAND)],
      out: [
        port(`${D}.constructionCostUsd`, usdU, MONEY),
        port(`${D}.builtConstructionCostUsd`, usdU, MONEY),
        port(`${D}.openSpaceConstructionCostUsd`, usdU, MONEY),
        port(`${D}.landCostUsd`, usdU, MONEY),
        port(`${D}.investmentUsd`, usdU, MONEY),
        port(`${D}.opexAnnualUsd`, usdU, MONEY),
        port(`${D}.revenueAnnualUsd`, usdU, MONEY),
        port(`${D}.salesTotalUsd`, usdU, MONEY),
        port(`${D}.discountedCashflowValueUsd`, usdU, MONEY),
        port(`${D}.constructionReturnRatePct`, idxU, INDEX),
        port(`${D}.roiPct`, idxU, INDEX),
        port(`${D}.profitUsd`, usdU, MONEY),
        port(`${D}.jobsCreated`, idxU, COUNT),
      ],
    },
    compute: (_ctx, portInputs): QMap => {
      const energyGen = portInputs[`${D}.energyGenerationLandM2In`]?.value ?? 0;
      const landUse = computeLandUseRaw(inputs, COEFFICIENTS, energyGen);
      const r = computeCostRaw(landUse, COEFFICIENTS);
      const money = (id: keyof CostResult) => [`${D}.${id}`, q(r[id], usdU, MONEY, input(`${D}:${id}`))] as const;
      return Object.fromEntries([
        money('constructionCostUsd'),
        money('builtConstructionCostUsd'),
        money('openSpaceConstructionCostUsd'),
        money('landCostUsd'),
        money('investmentUsd'),
        money('opexAnnualUsd'),
        money('revenueAnnualUsd'),
        money('salesTotalUsd'),
        money('discountedCashflowValueUsd'),
        [`${D}.constructionReturnRatePct`, q(r.constructionReturnRatePct, idxU, INDEX, input(`${D}:constructionReturnRatePct`))],
        [`${D}.roiPct`, q(r.roiPct, idxU, INDEX, input(`${D}:roiPct`))],
        money('profitUsd'),
        [`${D}.jobsCreated`, q(r.jobsCreated, idxU, COUNT, input(`${D}:jobsCreated`))],
      ]);
    },
  };
}
