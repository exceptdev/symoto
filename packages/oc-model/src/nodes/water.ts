// Water domain node. computeWaterRaw is a verbatim port of vizapp/src/sim/water.ts:
// per-capita consumption, rain capture over the site catchment (= totalLandM2, no multiplier),
// the harvest ceiling, surface storage, target-driven supply bounded by the ceiling, and the
// min(1,.)/division guards. The node recomputes the closed land use from the wired
// energyGenerationLandM2 (the structured land result cannot cross a scalar port) and wraps the
// water readouts in Quantities.
import { q, input, inputClamped, clampRecord, type Node, type QMap } from '@symoto/core';
import { COEFFICIENTS } from '../coefficients.generated.js';
import { num, type ModelCoefficients } from '../config.js';
import type { SimInputs, LandUseResult } from '../types.js';
import { computeLandUseRaw } from './land.js';
import { LAND, WATER_FLOW, INDEX, port, m2U, m3U, idxU } from '../boundaries.js';

const M2_PER_M3_FROM_MM = 1_000;
const WATER_PER_CAPITA_M3_YR = 198.554;
const SURFACE_WATER_DEPTH_M = 1.5;
const HARVEST_FRACTION = 0.36;
const DAYS_PER_YEAR = 365;

export interface WaterResult {
  consumptionM3PerYr: number;
  precipitationCaptureM3PerYr: number;
  harvestableRainM3PerYr: number;
  surfaceStorageM3: number;
  storageDaysOfDemand: number;
  providedSupplyM3: number;
  selfSufficiencyPct: number;
  harvestRatio: number;
  waterInfrastructureLandM2: number;
  catchmentAreaM2: number;
  precipitationMmPerYr: number;
}

/** Verbatim port of the bespoke computeWater. */
export function computeWaterRaw(
  landUse: LandUseResult,
  inputs: SimInputs,
  coeffs: ModelCoefficients = COEFFICIENTS,
): WaterResult {
  const country = inputs.country;
  const population = Math.max(0, inputs.population);
  const precipitationMmPerYr = num(coeffs.countryStats.precipitationMmPerYr[country]);

  const consumptionM3PerYr = WATER_PER_CAPITA_M3_YR * population;

  const catchmentAreaM2 = Math.max(0, landUse.totalLandM2);
  const precipitationCaptureM3PerYr = (catchmentAreaM2 * precipitationMmPerYr) / M2_PER_M3_FROM_MM;

  const harvestCeilingM3 = HARVEST_FRACTION * precipitationCaptureM3PerYr;

  const waterInfrastructureLandM2 = Math.max(0, landUse.waterM2);
  const surfaceStorageM3 = waterInfrastructureLandM2 * SURFACE_WATER_DEPTH_M;
  const storageDaysOfDemand =
    consumptionM3PerYr > 0 ? surfaceStorageM3 / (consumptionM3PerYr / DAYS_PER_YEAR) : 0;

  const target = Math.max(0, inputs.waterSelfSufficiency ?? 1.0);
  const providedSupplyM3 = Math.min(target * consumptionM3PerYr, harvestCeilingM3);

  const selfSufficiencyPct = consumptionM3PerYr > 0 ? Math.min(1, providedSupplyM3 / consumptionM3PerYr) : 0;
  const harvestRatio = harvestCeilingM3 > 0 ? consumptionM3PerYr / harvestCeilingM3 : 0;

  return {
    consumptionM3PerYr,
    precipitationCaptureM3PerYr,
    harvestableRainM3PerYr: harvestCeilingM3,
    surfaceStorageM3,
    storageDaysOfDemand,
    providedSupplyM3,
    selfSufficiencyPct,
    harvestRatio,
    waterInfrastructureLandM2,
    catchmentAreaM2,
    precipitationMmPerYr,
  };
}

const D = 'water';

/** Build the water node for a scenario. */
export function makeWaterNode(inputs: SimInputs): Node {
  return {
    id: 'n3-water',
    kind: 'readout',
    ports: {
      in: [port(`${D}.energyGenerationLandM2In`, m2U, LAND)],
      out: [
        port(`${D}.consumptionM3PerYr`, m3U, WATER_FLOW),
        port(`${D}.precipitationCaptureM3PerYr`, m3U, WATER_FLOW),
        port(`${D}.harvestableRainM3PerYr`, m3U, WATER_FLOW),
        port(`${D}.surfaceStorageM3`, m3U, WATER_FLOW),
        port(`${D}.storageDaysOfDemand`, idxU, INDEX),
        port(`${D}.providedSupplyM3`, m3U, WATER_FLOW),
        port(`${D}.selfSufficiencyPct`, idxU, INDEX),
        port(`${D}.harvestRatio`, idxU, INDEX),
        port(`${D}.waterInfrastructureLandM2`, m2U, LAND),
        port(`${D}.catchmentAreaM2`, m2U, LAND),
        port(`${D}.precipitationMmPerYr`, idxU, INDEX),
      ],
    },
    compute: (ctx, portInputs): QMap => {
      const energyGen = portInputs[`${D}.energyGenerationLandM2In`]?.value ?? 0;
      const landUse = computeLandUseRaw(inputs, COEFFICIENTS, energyGen);
      const r = computeWaterRaw(landUse, inputs, COEFFICIENTS);

      // Requested-vs-actual (PROV-03): provided supply is bounded by the rainwater harvest ceiling,
      // so achieved self-sufficiency can fall below the user's target. The clamp is monotone (actual
      // <= target), so clampRecord's requested !== actual semantics are correct here. When clamped,
      // the readout's provenance is marked not honored via inputClamped.
      const ssTarget = Math.max(0, inputs.waterSelfSufficiency ?? 1.0);
      const ssRecord = clampRecord(
        `${D}.selfSufficiencyPct`,
        ssTarget,
        r.selfSufficiencyPct,
        r.selfSufficiencyPct < ssTarget ? 'water self-sufficiency clamp: provided supply bounded by the rainwater harvest ceiling' : undefined,
        idxU,
        INDEX,
      );
      ctx.recordClamp(ssRecord);
      const selfSufficiencyProv = ssRecord.clamped
        ? inputClamped(`${D}.selfSufficiencyPct`, ssTarget, r.selfSufficiencyPct)
        : input(`${D}:selfSufficiencyPct`);

      const m3 = (id: keyof WaterResult) => [`${D}.${id}`, q(r[id], m3U, WATER_FLOW, input(`${D}:${id}`))] as const;
      const idx = (id: keyof WaterResult) => [`${D}.${id}`, q(r[id], idxU, INDEX, input(`${D}:${id}`))] as const;
      const land = (id: keyof WaterResult) => [`${D}.${id}`, q(r[id], m2U, LAND, input(`${D}:${id}`))] as const;
      return Object.fromEntries([
        m3('consumptionM3PerYr'),
        m3('precipitationCaptureM3PerYr'),
        m3('harvestableRainM3PerYr'),
        m3('surfaceStorageM3'),
        idx('storageDaysOfDemand'),
        m3('providedSupplyM3'),
        [`${D}.selfSufficiencyPct`, q(r.selfSufficiencyPct, idxU, INDEX, selfSufficiencyProv)] as const,
        idx('harvestRatio'),
        land('waterInfrastructureLandM2'),
        land('catchmentAreaM2'),
        idx('precipitationMmPerYr'),
      ]);
    },
  };
}
