// Energy domain node. computeEnergyRaw is a verbatim port of vizapp/src/sim/energy.ts: the
// per-capita demand chain, rooftop/ground PV, the wind siting cap (Math.floor/ceil/min with
// the Number.isFinite uncapped handling), biomass, batteries, self-sufficiency, fossil
// backfill, curtailment, and generation land. The energyNode reads the land node's BASE ports
// (housingUnits, eligibleWindBaseLandM2), so the cycle settles in exactly two passes, and
// exposes energyGenerationLandM2 as the back-edge into the land closed total.
import { q, input, inputClamped, type Node, type QMap } from '@symoto/core';
import { COEFFICIENTS } from '../coefficients.generated.js';
import { num, type ModelCoefficients, type Country } from '../config.js';
import type { SimInputs, EnergyScenario } from '../types.js';
import {
  TURBINE_CLASSES,
  HOURS_PER_YEAR,
  ELIGIBLE_USABLE_FRACTION,
  SEASONAL_WINTER_UPLIFT_PCT,
  spacingAreaM2,
  type TurbineClass,
} from '../turbineConfig.js';
import { LAND, ENERGY_DEMAND, ENERGY_SUPPLY, port, m2U, mwhU, dwellingU, idxU } from '../boundaries.js';

const KWH_PER_MWH = 1000;

/** INDICATIVE per-country end-use demand localization factor (verbatim). Exported for the LOC-02
 * locale-coefficient manifest (localeCoefficients.ts), which classifies it as locale-varying. */
export const ENERGY_ENDUSE_COUNTRY_FACTOR: Record<Country, number> = {
  Netherlands: 1.0,
  Vietnam: 0.33,
  Brazil: 0.52,
};

export interface EnergyResult {
  country: Country;
  population: number;
  electricityDemandMwh: number;
  heatDemandMwh: number;
  transportDemandMwh: number;
  totalDemandMwh: number;
  rooftopSolarMwh: number;
  groundSolarMwh: number;
  solarMwh: number;
  windMwh: number;
  biomassMwh: number;
  totalSupplyMwh: number;
  windTurbines: number;
  turbineClass: TurbineClass;
  turbineCount: number;
  maxTurbines: number;
  windCapped: boolean;
  windShortfallMwh: number;
  seasonalWinterUpliftPct: number;
  selfSufficiency: number;
  fossilBackfillMwh: number;
  curtailmentMwh: number;
  batteryStorageMwh: number;
  peakShavedMwh: number;
  groundSolarLandM2: number;
  windLandM2: number;
  energyLandM2: number;
}

export interface EnergyInputs extends SimInputs {
  housingUnits: number;
  eligibleWindBaseLandM2?: number;
}

/** Verbatim port of the bespoke computeEnergy. */
export function computeEnergyRaw(inputs: EnergyInputs, coeffs: ModelCoefficients = COEFFICIENTS): EnergyResult {
  const e = coeffs.energy;
  const country = inputs.country;
  const population = Math.max(0, inputs.population);
  const housingUnits = Math.max(0, inputs.housingUnits);
  const target = inputs.energySelfSufficiency ?? 1.0;
  const scenario: EnergyScenario = inputs.energyScenario ?? 'Wind/Solar';

  const endUseFactor = num(ENERGY_ENDUSE_COUNTRY_FACTOR[country]);
  const electricityDemandMwh = (e.electricityKwhPerCapita * endUseFactor * population) / KWH_PER_MWH;
  const heatDemandMwh = electricityDemandMwh * e.heatToElectricityRatio;
  const transportDemandMwh = (e.transportKwhPerCapita * endUseFactor * population) / KWH_PER_MWH;
  const totalDemandMwh = electricityDemandMwh + heatDemandMwh + transportDemandMwh;

  const pvYield = num(e.pvYieldKwhPerKwp[country]);
  const rooftopKwp = housingUnits * ((e.roofAreaPerDwellingM2 * e.pvEfficiency) / e.m2PerPanel) * e.kwpPerPanel;
  const rooftopSolarMwh = (rooftopKwp * pvYield) / KWH_PER_MWH;
  const biomassMwh = e.biomassMwhBaseline * (population / coeffs.meta.baselinePopulation);

  const targetSupplyMwh = target * totalDemandMwh;
  const gapMwh = Math.max(0, targetSupplyMwh - rooftopSolarMwh - biomassMwh);

  const turbineClass = inputs.turbineClass ?? 'medium';
  const spec = TURBINE_CLASSES[turbineClass];

  const solarShare = scenario === 'Solar' ? 1 : scenario === 'Wind' ? 0 : 0.5;
  const groundSolarMwh = gapMwh * solarShare;
  const windTargetMwh = gapMwh * (1 - solarShare);

  const groundKwp = pvYield > 0 ? (groundSolarMwh * KWH_PER_MWH) / pvYield : 0;
  const groundSolarLandM2 = groundKwp * e.groundPvM2PerKwp;

  const capacityFactor =
    e.turbineCapacityMw > 0 ? num(e.turbineYieldMwh[country]) / (e.turbineCapacityMw * HOURS_PER_YEAR) : 0;
  const yieldPerTurbineMwh = spec.ratedMw * HOURS_PER_YEAR * capacityFactor;

  const spacingArea = spacingAreaM2(turbineClass);
  const eligibleBaseM2 = inputs.eligibleWindBaseLandM2 ?? Number.POSITIVE_INFINITY;
  const eligibleAreaM2 = (eligibleBaseM2 + groundSolarLandM2) * ELIGIBLE_USABLE_FRACTION;
  const maxTurbinesRaw =
    spacingArea > 0 && Number.isFinite(eligibleAreaM2)
      ? Math.floor(eligibleAreaM2 / spacingArea)
      : Number.POSITIVE_INFINITY;

  const desiredTurbines = yieldPerTurbineMwh > 0 ? Math.ceil(windTargetMwh / yieldPerTurbineMwh) : 0;
  const turbineCount = Math.min(desiredTurbines, maxTurbinesRaw);
  const windCapped = turbineCount < desiredTurbines;
  const windShortfallMwh = Math.max(0, (desiredTurbines - turbineCount) * yieldPerTurbineMwh);
  const windMwh = turbineCount * yieldPerTurbineMwh;
  const maxTurbines = Number.isFinite(maxTurbinesRaw) ? maxTurbinesRaw : turbineCount;

  const solarMwh = rooftopSolarMwh + groundSolarMwh;
  const totalSupplyMwh = solarMwh + windMwh + biomassMwh;

  const selfSufficiency = totalDemandMwh > 0 ? totalSupplyMwh / totalDemandMwh : 0;
  const fossilBackfillMwh = Math.max(0, totalDemandMwh - totalSupplyMwh);
  const curtailmentMwh = Math.max(0, totalSupplyMwh - totalDemandMwh);

  const avgDailyDemandMwh = totalDemandMwh / 365;
  const batteryStorageMwh = avgDailyDemandMwh * e.batteryStorageDaysOfDemand;
  const ROUND_TRIP_EFFICIENCY = 0.85;
  const peakShavedMwh = batteryStorageMwh * 365 * ROUND_TRIP_EFFICIENCY;

  const windLandM2 = turbineCount * e.windFootprintM2PerTurbine;
  const energyLandM2 = groundSolarLandM2 + windLandM2;

  return {
    country,
    population,
    electricityDemandMwh,
    heatDemandMwh,
    transportDemandMwh,
    totalDemandMwh,
    rooftopSolarMwh,
    groundSolarMwh,
    solarMwh,
    windMwh,
    biomassMwh,
    totalSupplyMwh,
    windTurbines: turbineCount,
    turbineClass,
    turbineCount,
    maxTurbines,
    windCapped,
    windShortfallMwh,
    seasonalWinterUpliftPct: SEASONAL_WINTER_UPLIFT_PCT,
    selfSufficiency,
    fossilBackfillMwh,
    curtailmentMwh,
    batteryStorageMwh,
    peakShavedMwh,
    groundSolarLandM2,
    windLandM2,
    energyLandM2,
  };
}

const D = 'energy';

/** Build the energy node for a scenario (closes over the non-numeric selectors). */
export function makeEnergyNode(inputs: SimInputs): Node {
  return {
    id: 'n2-energy',
    kind: 'readout',
    ports: {
      in: [
        port(`${D}.housingUnitsIn`, dwellingU, LAND),
        port(`${D}.eligibleWindBaseLandM2In`, m2U, LAND),
      ],
      out: [
        port(`${D}.energyGenerationLandM2`, m2U, LAND),
        port(`${D}.electricityDemandMwh`, mwhU, ENERGY_DEMAND),
        port(`${D}.heatDemandMwh`, mwhU, ENERGY_DEMAND),
        port(`${D}.transportDemandMwh`, mwhU, ENERGY_DEMAND),
        port(`${D}.totalDemandMwh`, mwhU, ENERGY_DEMAND),
        port(`${D}.rooftopSolarMwh`, mwhU, ENERGY_SUPPLY),
        port(`${D}.groundSolarMwh`, mwhU, ENERGY_SUPPLY),
        port(`${D}.solarMwh`, mwhU, ENERGY_SUPPLY),
        port(`${D}.windMwh`, mwhU, ENERGY_SUPPLY),
        port(`${D}.biomassMwh`, mwhU, ENERGY_SUPPLY),
        port(`${D}.totalSupplyMwh`, mwhU, ENERGY_SUPPLY),
        port(`${D}.windTurbines`, idxU, ENERGY_SUPPLY),
        port(`${D}.turbineCount`, idxU, ENERGY_SUPPLY),
        port(`${D}.maxTurbines`, idxU, ENERGY_SUPPLY),
        port(`${D}.windCapped`, idxU, ENERGY_SUPPLY),
        port(`${D}.windShortfallMwh`, mwhU, ENERGY_SUPPLY),
        port(`${D}.seasonalWinterUpliftPct`, idxU, ENERGY_SUPPLY),
        port(`${D}.selfSufficiency`, idxU, ENERGY_SUPPLY),
        port(`${D}.fossilBackfillMwh`, mwhU, ENERGY_SUPPLY),
        port(`${D}.curtailmentMwh`, mwhU, ENERGY_SUPPLY),
        port(`${D}.batteryStorageMwh`, mwhU, ENERGY_SUPPLY),
        port(`${D}.peakShavedMwh`, mwhU, ENERGY_SUPPLY),
        port(`${D}.groundSolarLandM2`, m2U, LAND),
        port(`${D}.windLandM2`, m2U, LAND),
        port(`${D}.energyLandM2`, m2U, LAND),
      ],
    },
    compute: (ctx, portInputs): QMap => {
      const housingUnits = portInputs[`${D}.housingUnitsIn`]?.value ?? 0;
      const ewbl = portInputs[`${D}.eligibleWindBaseLandM2In`]?.value;
      const r = computeEnergyRaw({ ...inputs, housingUnits, eligibleWindBaseLandM2: ewbl }, COEFFICIENTS);

      // Requested-vs-actual (PROV-03): the wind siting cap can hold achieved self-sufficiency below
      // the user's target. Record the request and the achieved value; clamped is the siting-cap flag
      // (an over-target surplus is not a clamp, so we never falsely flag an honored scenario). When
      // capped, the readout's own provenance is marked not honored via inputClamped.
      const ssTarget = inputs.energySelfSufficiency ?? 1.0;
      ctx.recordClamp({
        key: `${D}.selfSufficiency`,
        requested: ssTarget,
        actual: r.selfSufficiency,
        clamped: r.windCapped,
        reason: r.windCapped ? 'wind siting cap: turbines limited by available siting land' : undefined,
        unit: idxU,
        boundary: ENERGY_SUPPLY,
      });
      const selfSufficiencyProv = r.windCapped
        ? inputClamped(`${D}.selfSufficiency`, ssTarget, r.selfSufficiency)
        : input(`${D}:selfSufficiency`);

      const mwh = (id: string, v: number, b = ENERGY_SUPPLY) => [`${D}.${id}`, q(v, mwhU, b, input(`${D}:${id}`))] as const;
      const idx = (id: string, v: number) => [`${D}.${id}`, q(v, idxU, ENERGY_SUPPLY, input(`${D}:${id}`))] as const;
      const land = (id: string, v: number) => [`${D}.${id}`, q(v, m2U, LAND, input(`${D}:${id}`))] as const;
      return Object.fromEntries([
        land('energyGenerationLandM2', r.energyLandM2),
        mwh('electricityDemandMwh', r.electricityDemandMwh, ENERGY_DEMAND),
        mwh('heatDemandMwh', r.heatDemandMwh, ENERGY_DEMAND),
        mwh('transportDemandMwh', r.transportDemandMwh, ENERGY_DEMAND),
        mwh('totalDemandMwh', r.totalDemandMwh, ENERGY_DEMAND),
        mwh('rooftopSolarMwh', r.rooftopSolarMwh),
        mwh('groundSolarMwh', r.groundSolarMwh),
        mwh('solarMwh', r.solarMwh),
        mwh('windMwh', r.windMwh),
        mwh('biomassMwh', r.biomassMwh),
        mwh('totalSupplyMwh', r.totalSupplyMwh),
        idx('windTurbines', r.windTurbines),
        idx('turbineCount', r.turbineCount),
        idx('maxTurbines', r.maxTurbines),
        idx('windCapped', r.windCapped ? 1 : 0),
        mwh('windShortfallMwh', r.windShortfallMwh),
        idx('seasonalWinterUpliftPct', r.seasonalWinterUpliftPct),
        [`${D}.selfSufficiency`, q(r.selfSufficiency, idxU, ENERGY_SUPPLY, selfSufficiencyProv)] as const,
        mwh('fossilBackfillMwh', r.fossilBackfillMwh),
        mwh('curtailmentMwh', r.curtailmentMwh),
        mwh('batteryStorageMwh', r.batteryStorageMwh),
        mwh('peakShavedMwh', r.peakShavedMwh),
        land('groundSolarLandM2', r.groundSolarLandM2),
        land('windLandM2', r.windLandM2),
        land('energyLandM2', r.energyLandM2),
      ]);
    },
  };
}
