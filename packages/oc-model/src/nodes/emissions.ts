// Emissions domain node and the boundary-honest carbon account (MODEL-03). computeEmissionsRaw
// is a verbatim port of vizapp/src/sim/emissions.ts EXCEPT for line 449: it does NOT silently
// subtract the territorial on-site sequestration from the consumption/operational gross
// footprint. Instead the node produces grossEmissions (CARBON_OPERATIONAL) and sequestration
// (CARBON_TERRITORIAL) as separate readouts, and the net-carbon readout is produced ONLY
// through an explicit, labeled boundary crossing (adapterProv 'operational-territorial-net')
// that is visible in provenance. The raw sub() of the two differently-bounded terms throws
// BoundaryViolation (proven in carbon-boundary.test.ts).
import { q, sub, adapterProv, input, type Node, type QMap } from '@symoto/core';
import { COEFFICIENTS } from '../coefficients.generated.js';
import { num, type ModelCoefficients, type Country } from '../config.js';
import type { SimInputs, LandUseResult } from '../types.js';
import type { EnergyResult } from './energy.js';
import { computeLandUseRaw } from './land.js';
import { computeEnergyRaw } from './energy.js';
import { eligibleWindBaseLandM2 } from './land.js';
import { AGRI_SYSTEMS, AGRI_CONFIG, systemLandM2 } from '../agriConfig.js';
import { LAND, CARBON_OPERATIONAL, CARBON_TERRITORIAL, NITROGEN, INDEX, ENERGY_SUPPLY, port, m2U, tU, kgU, idxU, mwhU } from '../boundaries.js';

/** The declared method of the labeled consumption-vs-territorial carbon crossing. */
export const NET_CARBON_METHOD = 'operational-territorial-net';

const NL_HOUSEHOLDS_TONNES_PER_CAPITA = 1.823529;
const NL_FOOD_TONNES_PER_CAPITA = 0.529412;
const NL_TRANSPORT_TONNES_PER_CAPITA = 1.941176;
const TRANSPORT_OPERATIONAL_SHARE = 0.5;
const DUTCH_BASELINE_PER_CAPITA_TONNES = 9.117647;

const DESIGN_FOOTPRINT_COUNTRY_FACTOR: Record<Country, number> = {
  Netherlands: 1.0, Vietnam: 0.43, Brazil: 0.28,
};
const NITROGEN_COUNTRY_FACTOR: Record<Country, number> = {
  Netherlands: 1.0, Vietnam: 0.95, Brazil: 0.45,
};
const DIET_CO2_FACTOR: Record<NonNullable<SimInputs['dietaryPreference']>, number> = {
  omnivore: 1.0, flexitarian: 0.85, vegetarian: 0.7, vegan: 0.55,
};
const NON_AG_NITROGEN_KG_PER_CAPITA = 4.5;
const GRID_CO2_TONNES_PER_MWH: Record<Country, number> = {
  Netherlands: 0.38, Vietnam: 0.6, Brazil: 0.12,
};

const SEQ_NATURE_TONNES_PER_M2 = 0.0016857;
const SEQ_WATER_TONNES_PER_M2 = 0;
const SEQ_URBAN_GREEN_TONNES_PER_M2 = 0.00015;
const SEQ_BUILT_TONNES_PER_M2 = 0.000002;

const EMBODIED_INTENSITY_TONNES_PER_M2 = 0.4;
const EMBODIED_AMORTIZATION_YEARS = 50;
const AIR_QUALITY_BASE_SCORE = 65;
const WATER_QUALITY_BASE_SCORE = 60;
const AIR_QUALITY_PER_PCT_NATURAL = 0.3;
const WATER_QUALITY_PER_PCT_WATER = 0.4;

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

export interface EmissionsResult {
  carbonEmissionsTonnesPerYr: number;
  carbonSequestrationTonnesPerYr: number;
  netCarbonTonnesPerYr: number;
  nitrogenEmissionsKgPerYr: number;
  airQualityIndex: number;
  waterQualityIndex: number;
  grossDesignFootprintTonnesPerYr: number;
  householdsCo2TonnesPerYr: number;
  foodCo2TonnesPerYr: number;
  transportCo2TonnesPerYr: number;
  fossilBackfillCo2TonnesPerYr: number;
  embodiedCarbonTonnesPerYr: number;
  agriProcessCo2eTonnesPerYr: number;
  maturityFactor: number;
  avoidedExportCo2TonnesPerYr: number;
  netCarbonWithExportCreditTonnesPerYr: number;
  regenerativeCarbonSavingTonnesPerYr: number;
  regenerativeNitrogenSavingKgPerYr: number;
  regenerativeSoilCarbonSavingTonnesPerYr: number;
  savingsVsBaselineTonnesPerYr: number;
  ocDesignPerCapitaTonnes: number;
  dutchBaselinePerCapitaTonnes: number;
}

/**
 * Verbatim port of the bespoke computeEmissions arithmetic. The net field
 * (netCarbonTonnesPerYr) is computed here numerically for parity reporting; the NODE produces
 * the net only through the labeled boundary crossing (see makeEmissionsNode).
 */
export function computeEmissionsRaw(
  args: { landUse: LandUseResult; energy: EnergyResult; inputs: SimInputs; maturityFactor?: number },
  _coeffs: ModelCoefficients = COEFFICIENTS,
): EmissionsResult {
  const { landUse, energy } = args;
  const population = Math.max(0, landUse.population);
  const country = args.inputs.country;
  const gridFactor = num(GRID_CO2_TONNES_PER_MWH[country]);
  const maturityFactor = Math.max(0, Math.min(1, args.maturityFactor ?? 1.0));

  const countryFactor = num(DESIGN_FOOTPRINT_COUNTRY_FACTOR[country]);
  const nitrogenFactor = num(NITROGEN_COUNTRY_FACTOR[country]);
  const diet = args.inputs.dietaryPreference ?? 'omnivore';
  const dietFactor = DIET_CO2_FACTOR[diet];

  const householdsPerCapita = NL_HOUSEHOLDS_TONNES_PER_CAPITA * countryFactor;
  const foodPerCapita = NL_FOOD_TONNES_PER_CAPITA * dietFactor * countryFactor;
  const transportPerCapita = TRANSPORT_OPERATIONAL_SHARE * NL_TRANSPORT_TONNES_PER_CAPITA * countryFactor;
  const ocDesignPerCapitaTonnes = householdsPerCapita + foodPerCapita + transportPerCapita;

  const householdsCo2TonnesPerYr = population === 0 ? 0 : householdsPerCapita * population;
  const foodCo2TonnesPerYr = population === 0 ? 0 : foodPerCapita * population;
  const transportCo2TonnesPerYr = population === 0 ? 0 : transportPerCapita * population;
  const grossDesignFootprintTonnesPerYr = householdsCo2TonnesPerYr + foodCo2TonnesPerYr + transportCo2TonnesPerYr;

  const fossilBackfillCo2TonnesPerYr = Math.max(0, energy.fossilBackfillMwh) * gridFactor;

  const embodiedCarbonTonnesPerYr =
    (Math.max(0, landUse.builtGfaM2) * EMBODIED_INTENSITY_TONNES_PER_M2) / EMBODIED_AMORTIZATION_YEARS;
  let agriProcessCo2eTonnesPerYr = 0;

  const carbonEmissionsTonnesPerYr = grossDesignFootprintTonnesPerYr + fossilBackfillCo2TonnesPerYr;

  const isRegen = args.inputs.regenerativeAgriculture ?? true;

  const productionFocus = Math.max(0, Math.min(1, args.inputs.productionFocus ?? 0));
  const agriLandBySystem = systemLandM2(Math.max(0, landUse.agricultureM2), productionFocus);
  let agriSequestration = 0;
  let regenSoilCarbonUpliftTonnesPerYr = 0;
  for (const system of AGRI_SYSTEMS) {
    agriSequestration += agriLandBySystem[system] * AGRI_CONFIG[system].sequestrationTonnesPerM2;
    regenSoilCarbonUpliftTonnesPerYr += agriLandBySystem[system] * AGRI_CONFIG[system].regenSoilCarbonUpliftTonnesPerM2;
  }

  const rawSequestration =
    landUse.natureM2 * SEQ_NATURE_TONNES_PER_M2 +
    landUse.waterM2 * SEQ_WATER_TONNES_PER_M2 +
    landUse.urbanGreenM2 * SEQ_URBAN_GREEN_TONNES_PER_M2 +
    agriSequestration +
    (isRegen ? regenSoilCarbonUpliftTonnesPerYr : 0) +
    landUse.builtParcelLandM2 * SEQ_BUILT_TONNES_PER_M2;
  const carbonSequestrationTonnesPerYr = rawSequestration * maturityFactor;

  // The bespoke silent net (reproduced ONLY as a number for parity reporting; the node never
  // subtracts the two boundaries silently — see makeEmissionsNode).
  const netCarbonTonnesPerYr = carbonEmissionsTonnesPerYr - carbonSequestrationTonnesPerYr;

  const avoidedExportCo2TonnesPerYr = Math.max(0, energy.curtailmentMwh) * gridFactor;
  const netCarbonWithExportCreditTonnesPerYr = netCarbonTonnesPerYr - avoidedExportCo2TonnesPerYr;

  let regenAgriNitrogenKgPerYr = 0;
  let convAgriNitrogenKgPerYr = 0;
  for (const system of AGRI_SYSTEMS) {
    regenAgriNitrogenKgPerYr += agriLandBySystem[system] * AGRI_CONFIG[system].nitrogenKgPerM2;
    convAgriNitrogenKgPerYr += agriLandBySystem[system] * AGRI_CONFIG[system].convNitrogenKgPerM2;
  }
  regenAgriNitrogenKgPerYr *= nitrogenFactor;
  convAgriNitrogenKgPerYr *= nitrogenFactor;
  const agriNitrogenKgPerYr = isRegen ? regenAgriNitrogenKgPerYr : convAgriNitrogenKgPerYr;
  const nonAgNitrogenKgPerYr = population === 0 ? 0 : NON_AG_NITROGEN_KG_PER_CAPITA * population;
  const nitrogenEmissionsKgPerYr = agriNitrogenKgPerYr + nonAgNitrogenKgPerYr;

  let convAgriProcessCo2eTonnesPerYr = 0;
  let regenAgriProcessCo2eTonnesPerYr = 0;
  let regenSoilCarbonUpliftForSavingTonnesPerYr = 0;
  for (const system of AGRI_SYSTEMS) {
    const cfg = AGRI_CONFIG[system];
    const land = agriLandBySystem[system];
    convAgriProcessCo2eTonnesPerYr += land * cfg.convProcessCo2eTonnesPerM2;
    regenAgriProcessCo2eTonnesPerYr += land * cfg.processCo2eTonnesPerM2;
    regenSoilCarbonUpliftForSavingTonnesPerYr += land * cfg.regenSoilCarbonUpliftTonnesPerM2;
  }
  const regenerativeSoilCarbonSavingTonnesPerYr = isRegen ? regenSoilCarbonUpliftForSavingTonnesPerYr : 0;
  const regenerativeCarbonSavingTonnesPerYr = isRegen
    ? (convAgriProcessCo2eTonnesPerYr - regenAgriProcessCo2eTonnesPerYr) * nitrogenFactor +
      regenSoilCarbonUpliftForSavingTonnesPerYr
    : 0;
  const regenerativeNitrogenSavingKgPerYr = isRegen ? convAgriNitrogenKgPerYr - regenAgriNitrogenKgPerYr : 0;

  agriProcessCo2eTonnesPerYr = isRegen ? regenAgriProcessCo2eTonnesPerYr : convAgriProcessCo2eTonnesPerYr;

  const dutchBaselinePerCapitaTonnes = DUTCH_BASELINE_PER_CAPITA_TONNES;
  const baselineSavingFromFootprint =
    population === 0 ? 0 : (dutchBaselinePerCapitaTonnes - ocDesignPerCapitaTonnes) * population;
  const savingsVsBaselineTonnesPerYr = baselineSavingFromFootprint + carbonSequestrationTonnesPerYr;

  const totalLandM2 = landUse.totalLandM2;
  const pct = (m2: number) => (totalLandM2 === 0 ? 0 : (m2 / totalLandM2) * 100);
  const naturalSharePct = pct(landUse.natureM2) + pct(landUse.waterM2) + pct(landUse.urbanGreenM2);
  const waterSharePct = pct(landUse.waterM2);

  const airQualityIndex = clamp(AIR_QUALITY_BASE_SCORE + AIR_QUALITY_PER_PCT_NATURAL * naturalSharePct);
  const waterQualityIndex = clamp(WATER_QUALITY_BASE_SCORE + WATER_QUALITY_PER_PCT_WATER * waterSharePct);

  return {
    carbonEmissionsTonnesPerYr,
    carbonSequestrationTonnesPerYr,
    netCarbonTonnesPerYr,
    nitrogenEmissionsKgPerYr,
    airQualityIndex,
    waterQualityIndex,
    grossDesignFootprintTonnesPerYr,
    householdsCo2TonnesPerYr,
    foodCo2TonnesPerYr,
    transportCo2TonnesPerYr,
    fossilBackfillCo2TonnesPerYr,
    embodiedCarbonTonnesPerYr,
    agriProcessCo2eTonnesPerYr,
    maturityFactor,
    avoidedExportCo2TonnesPerYr,
    netCarbonWithExportCreditTonnesPerYr,
    regenerativeCarbonSavingTonnesPerYr,
    regenerativeNitrogenSavingKgPerYr,
    regenerativeSoilCarbonSavingTonnesPerYr,
    savingsVsBaselineTonnesPerYr,
    ocDesignPerCapitaTonnes,
    dutchBaselinePerCapitaTonnes,
  };
}

/**
 * Produce the net-carbon Quantity through an EXPLICIT, LABELED boundary crossing. The
 * territorial sequestration term is relabeled onto the operational boundary via an adapter
 * ProvRef (method 'operational-territorial-net'), declaring that the modeler has chosen to
 * combine a consumption-accounting emissions term with a territorial-accounting sink; only then
 * is the subtraction performed under a single declared boundary. The crossing stays visible in
 * the result's provenance DAG. A raw sub(gross, sequestration) of the un-relabeled terms throws
 * BoundaryViolation (different accounting), which is the original silent net refused.
 */
export function labeledNetCarbon(grossTonnes: number, sequestrationTonnes: number) {
  const gross = q(grossTonnes, tU, CARBON_OPERATIONAL, input('emissions:grossEmissions'));
  const sequestration = q(sequestrationTonnes, tU, CARBON_TERRITORIAL, input('emissions:sequestration'));
  // The labeled crossing: relabel the territorial sink onto the operational boundary, recorded
  // as an adapter ProvRef so the consumption-vs-territorial combination is named, not silent.
  const sequestrationCrossed = q(
    sequestration.value,
    sequestration.unit,
    CARBON_OPERATIONAL,
    adapterProv(NET_CARBON_METHOD, CARBON_TERRITORIAL, CARBON_OPERATIONAL, [sequestration.provenance]),
  );
  return sub(gross, sequestrationCrossed); // CARBON_OPERATIONAL; provenance DAG carries the adapter
}

const D = 'emissions';

/** Build the emissions node for a scenario. */
export function makeEmissionsNode(inputs: SimInputs): Node {
  return {
    id: 'n8-emissions',
    kind: 'readout',
    ports: {
      in: [
        port(`${D}.energyGenerationLandM2In`, m2U, LAND),
        port(`${D}.fossilBackfillMwhIn`, mwhU, ENERGY_SUPPLY),
        port(`${D}.curtailmentMwhIn`, mwhU, ENERGY_SUPPLY),
      ],
      out: [
        port(`${D}.carbonEmissionsTonnesPerYr`, tU, CARBON_OPERATIONAL),
        port(`${D}.carbonSequestrationTonnesPerYr`, tU, CARBON_TERRITORIAL),
        port(`${D}.netCarbonTonnesPerYr`, tU, CARBON_OPERATIONAL),
        port(`${D}.nitrogenEmissionsKgPerYr`, kgU, NITROGEN),
        port(`${D}.airQualityIndex`, idxU, INDEX),
        port(`${D}.waterQualityIndex`, idxU, INDEX),
        port(`${D}.grossDesignFootprintTonnesPerYr`, tU, CARBON_OPERATIONAL),
        port(`${D}.householdsCo2TonnesPerYr`, tU, CARBON_OPERATIONAL),
        port(`${D}.foodCo2TonnesPerYr`, tU, CARBON_OPERATIONAL),
        port(`${D}.transportCo2TonnesPerYr`, tU, CARBON_OPERATIONAL),
        port(`${D}.fossilBackfillCo2TonnesPerYr`, tU, CARBON_OPERATIONAL),
        port(`${D}.embodiedCarbonTonnesPerYr`, tU, CARBON_OPERATIONAL),
        port(`${D}.agriProcessCo2eTonnesPerYr`, tU, CARBON_OPERATIONAL),
        port(`${D}.maturityFactor`, idxU, INDEX),
        port(`${D}.avoidedExportCo2TonnesPerYr`, tU, CARBON_TERRITORIAL),
        port(`${D}.netCarbonWithExportCreditTonnesPerYr`, tU, CARBON_OPERATIONAL),
        port(`${D}.regenerativeCarbonSavingTonnesPerYr`, tU, CARBON_TERRITORIAL),
        port(`${D}.regenerativeNitrogenSavingKgPerYr`, kgU, NITROGEN),
        port(`${D}.regenerativeSoilCarbonSavingTonnesPerYr`, tU, CARBON_TERRITORIAL),
        port(`${D}.savingsVsBaselineTonnesPerYr`, tU, CARBON_OPERATIONAL),
        port(`${D}.ocDesignPerCapitaTonnes`, tU, CARBON_OPERATIONAL),
        port(`${D}.dutchBaselinePerCapitaTonnes`, tU, CARBON_OPERATIONAL),
      ],
    },
    compute: (_ctx, portInputs): QMap => {
      const energyGen = portInputs[`${D}.energyGenerationLandM2In`]?.value ?? 0;
      const landUse = computeLandUseRaw(inputs, COEFFICIENTS, energyGen);
      // Reconstruct the energy result for fossilBackfill/curtailment. Prefer the wired values
      // (assembled graph); fall back to recomputing the closed energy when run standalone.
      let fossilBackfillMwh = portInputs[`${D}.fossilBackfillMwhIn`]?.value;
      let curtailmentMwh = portInputs[`${D}.curtailmentMwhIn`]?.value;
      let energy: EnergyResult;
      if (fossilBackfillMwh === undefined || curtailmentMwh === undefined) {
        const base = computeLandUseRaw(inputs, COEFFICIENTS, 0);
        energy = computeEnergyRaw(
          { ...inputs, housingUnits: base.housingUnits, eligibleWindBaseLandM2: eligibleWindBaseLandM2(base) },
          COEFFICIENTS,
        );
        fossilBackfillMwh = energy.fossilBackfillMwh;
        curtailmentMwh = energy.curtailmentMwh;
      } else {
        energy = { fossilBackfillMwh, curtailmentMwh } as EnergyResult;
      }

      const r = computeEmissionsRaw({ landUse, energy, inputs }, COEFFICIENTS);

      // The net-carbon readout via the EXPLICIT, LABELED crossing (never a silent sub).
      const net = labeledNetCarbon(r.carbonEmissionsTonnesPerYr, r.carbonSequestrationTonnesPerYr);

      const C = (id: string, v: number) => [`${D}.${id}`, q(v, tU, CARBON_OPERATIONAL, input(`${D}:${id}`))] as const;
      const T = (id: string, v: number) => [`${D}.${id}`, q(v, tU, CARBON_TERRITORIAL, input(`${D}:${id}`))] as const;
      const N = (id: string, v: number) => [`${D}.${id}`, q(v, kgU, NITROGEN, input(`${D}:${id}`))] as const;
      const I = (id: string, v: number) => [`${D}.${id}`, q(v, idxU, INDEX, input(`${D}:${id}`))] as const;
      return Object.fromEntries([
        C('carbonEmissionsTonnesPerYr', r.carbonEmissionsTonnesPerYr),
        T('carbonSequestrationTonnesPerYr', r.carbonSequestrationTonnesPerYr),
        [`${D}.netCarbonTonnesPerYr`, net], // labeled-crossing Quantity (adapter in provenance)
        N('nitrogenEmissionsKgPerYr', r.nitrogenEmissionsKgPerYr),
        I('airQualityIndex', r.airQualityIndex),
        I('waterQualityIndex', r.waterQualityIndex),
        C('grossDesignFootprintTonnesPerYr', r.grossDesignFootprintTonnesPerYr),
        C('householdsCo2TonnesPerYr', r.householdsCo2TonnesPerYr),
        C('foodCo2TonnesPerYr', r.foodCo2TonnesPerYr),
        C('transportCo2TonnesPerYr', r.transportCo2TonnesPerYr),
        C('fossilBackfillCo2TonnesPerYr', r.fossilBackfillCo2TonnesPerYr),
        C('embodiedCarbonTonnesPerYr', r.embodiedCarbonTonnesPerYr),
        C('agriProcessCo2eTonnesPerYr', r.agriProcessCo2eTonnesPerYr),
        I('maturityFactor', r.maturityFactor),
        T('avoidedExportCo2TonnesPerYr', r.avoidedExportCo2TonnesPerYr),
        C('netCarbonWithExportCreditTonnesPerYr', r.netCarbonWithExportCreditTonnesPerYr),
        T('regenerativeCarbonSavingTonnesPerYr', r.regenerativeCarbonSavingTonnesPerYr),
        N('regenerativeNitrogenSavingKgPerYr', r.regenerativeNitrogenSavingKgPerYr),
        T('regenerativeSoilCarbonSavingTonnesPerYr', r.regenerativeSoilCarbonSavingTonnesPerYr),
        C('savingsVsBaselineTonnesPerYr', r.savingsVsBaselineTonnesPerYr),
        C('ocDesignPerCapitaTonnes', r.ocDesignPerCapitaTonnes),
        C('dutchBaselinePerCapitaTonnes', r.dutchBaselinePerCapitaTonnes),
      ]);
    },
  };
}
