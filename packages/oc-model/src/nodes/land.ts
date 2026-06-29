// Land-use domain node. computeLandUseRaw is a verbatim port of vizapp/src/sim/landUse.ts
// (operation for operation, every guard reproduced) so the readouts match the bespoke golden
// master to the bit. The Symoto landNode wraps the raw result in unit-and-boundary-bearing
// Quantities and exposes BASE-land ports (housingUnits, eligibleWindBaseLandM2) that do NOT
// depend on the energy back-edge, plus the closed totals that fold energyGenerationLandM2 in,
// so the land<->energy cycle settles in exactly two passes (matching the bespoke two-pass
// computeScenario).
import { q, input, type Node, type QMap } from '@symoto/core';
import { COEFFICIENTS } from '../coefficients.generated.js';
import { num, type ModelCoefficients } from '../config.js';
import type { SimInputs, LandUseResult, CategoryLandUse } from '../types.js';
import { LAND, port, m2U, dwellingU, personU, idxU } from '../boundaries.js';

const M2_PER_HA = 10_000;
/** Roads: infra metres per inhabitant x this width factor x population (workbook uses 3). */
const ROAD_WIDTH_FACTOR = 3;
const HOUSING_CATEGORY = 'Housing';

/**
 * Verbatim port of the bespoke computeLandUse: population -> programs -> built land -> open
 * space -> total, with the energy-generation land folded into the built total (pass 2).
 */
export function computeLandUseRaw(
  inputs: SimInputs,
  coeffs: ModelCoefficients = COEFFICIENTS,
  energyGenerationLandM2 = 0,
): LandUseResult {
  const { country } = inputs;
  const population = Math.max(0, inputs.population);
  const scale = population / coeffs.meta.baselinePopulation;

  const foodTarget = inputs.foodSelfSufficiency ?? 1;
  const waterTarget = inputs.waterSelfSufficiency ?? 1;
  const econTarget = inputs.economicSelfSufficiency ?? 1;

  const ECONOMIC_CATEGORIES = new Set(['Retail', 'Offices', 'Hospitality', 'Industry', 'Services', 'Leisure']);

  const catMap = new Map<string, CategoryLandUse>();
  let builtFootprintM2 = 0;
  let builtParcelLandM2 = 0;
  let builtGfaM2 = 0;
  let housingUnits = 0;

  for (const p of coeffs.programs) {
    const catScale = ECONOMIC_CATEGORIES.has(p.category) ? scale * econTarget : scale;
    const units = num(p.units[country]) * catScale;
    if (units === 0) continue;

    const footprint = num(p.footprintPerUnit[country]);
    const parcelPerUnit =
      footprint +
      num(p.gardenPerUnit[country]) +
      num(p.terracePerUnit[country]) +
      num(p.storagePerUnit[country]);
    const gfa = num(p.gfaPerUnit[country]);

    const fp = units * footprint;
    const parcel = units * parcelPerUnit;
    const g = units * gfa;

    builtFootprintM2 += fp;
    builtParcelLandM2 += parcel;
    builtGfaM2 += g;
    if (p.category === HOUSING_CATEGORY) housingUnits += units;

    const existing = catMap.get(p.category);
    if (existing) {
      existing.units += units;
      existing.footprintM2 += fp;
      existing.parcelLandM2 += parcel;
      existing.gfaM2 += g;
    } else {
      catMap.set(p.category, { category: p.category, units, footprintM2: fp, parcelLandM2: parcel, gfaM2: g });
    }
  }

  const byCategory = [...catMap.values()];

  const cs = coeffs.countryStats;
  const greenFrac =
    num(cs.parksFracOfFootprint[country]) +
    num(cs.playgroundsFracOfFootprint[country]) +
    num(cs.squaresFracOfFootprint[country]);
  const urbanGreenM2 = greenFrac * builtParcelLandM2;

  const roadsM2 = num(cs.infraMetersPerInhabitant[country]) * ROAD_WIDTH_FACTOR * population;
  const parkingM2 = num(cs.parkingSpacePerUnit[country]) * housingUnits;
  const infrastructureM2 = roadsM2 + parkingM2;

  const agricultureM2 = coeffs.openSpace.agricultureHaPerCapita * population * M2_PER_HA * foodTarget;

  const energyGenerationM2 = Math.max(0, energyGenerationLandM2);
  const builtTotalM2 = builtParcelLandM2 + energyGenerationM2;

  const developedPlusAgriM2 = builtTotalM2 + urbanGreenM2 + infrastructureM2 + agricultureM2;
  const natureM2 = developedPlusAgriM2 * coeffs.openSpace.natureRatio;
  const waterM2 = developedPlusAgriM2 * coeffs.openSpace.waterRatio * waterTarget;

  const openSpaceM2 = urbanGreenM2 + infrastructureM2 + agricultureM2 + natureM2 + waterM2;
  const totalLandM2 = builtTotalM2 + openSpaceM2;

  const builtHa = builtTotalM2 / M2_PER_HA;
  const densityPeoplePerHaBuilt = builtHa > 0 ? population / builtHa : 0;

  return {
    population,
    country,
    housingUnits,
    byCategory,
    builtFootprintM2,
    builtParcelLandM2,
    energyGenerationLandM2: energyGenerationM2,
    builtTotalM2,
    builtGfaM2,
    urbanGreenM2,
    roadsM2,
    parkingM2,
    infrastructureM2,
    agricultureM2,
    natureM2,
    waterM2,
    openSpaceM2,
    totalLandM2,
    densityPeoplePerHaBuilt,
    ha: {
      built: builtHa,
      urbanGreen: urbanGreenM2 / M2_PER_HA,
      infrastructure: infrastructureM2 / M2_PER_HA,
      agriculture: agricultureM2 / M2_PER_HA,
      nature: natureM2 / M2_PER_HA,
      water: waterM2 / M2_PER_HA,
      openSpace: openSpaceM2 / M2_PER_HA,
      total: totalLandM2 / M2_PER_HA,
    },
  };
}

/**
 * Eligible non-solar land turbines may stand on: agriculture + non-residential built land,
 * derived exactly as the bespoke computeScenario does (base.agricultureM2 + (builtParcelLandM2
 * - housing parcel land)). Uses only energy-back-edge-INDEPENDENT base fields.
 */
export function eligibleWindBaseLandM2(base: LandUseResult): number {
  const housingM2 = base.byCategory.find((c) => c.category === 'Housing')?.parcelLandM2 ?? 0;
  const nonResidentialBuiltM2 = Math.max(0, base.builtParcelLandM2 - housingM2);
  return base.agricultureM2 + nonResidentialBuiltM2;
}

const D = 'landUse';
const m2 = (id: string, v: number): [string, ReturnType<typeof q>] => [
  `${D}.${id}`,
  q(v, m2U, LAND, input(`${D}:${id}`)),
];

/** Build the land-use node for a scenario (closes over the non-numeric selectors). */
export function makeLandNode(inputs: SimInputs): Node {
  return {
    id: 'n1-land',
    kind: 'readout',
    ports: {
      in: [port(`${D}.energyGenerationLandM2In`, m2U, LAND)],
      out: [
        port(`${D}.housingUnits`, dwellingU, LAND),
        port(`${D}.eligibleWindBaseLandM2`, m2U, LAND),
        port(`${D}.population`, personU, LAND),
        port(`${D}.builtFootprintM2`, m2U, LAND),
        port(`${D}.builtParcelLandM2`, m2U, LAND),
        port(`${D}.energyGenerationLandM2`, m2U, LAND),
        port(`${D}.builtTotalM2`, m2U, LAND),
        port(`${D}.builtGfaM2`, m2U, LAND),
        port(`${D}.urbanGreenM2`, m2U, LAND),
        port(`${D}.roadsM2`, m2U, LAND),
        port(`${D}.parkingM2`, m2U, LAND),
        port(`${D}.infrastructureM2`, m2U, LAND),
        port(`${D}.agricultureM2`, m2U, LAND),
        port(`${D}.natureM2`, m2U, LAND),
        port(`${D}.waterM2`, m2U, LAND),
        port(`${D}.openSpaceM2`, m2U, LAND),
        port(`${D}.totalLandM2`, m2U, LAND),
        port(`${D}.densityPeoplePerHaBuilt`, idxU, LAND),
      ],
    },
    compute: (_ctx, portInputs): QMap => {
      const energyGen = portInputs[`${D}.energyGenerationLandM2In`]?.value ?? 0;
      const lu = computeLandUseRaw(inputs, COEFFICIENTS, energyGen);
      return Object.fromEntries([
        [`${D}.housingUnits`, q(lu.housingUnits, dwellingU, LAND, input(`${D}:housingUnits`))],
        m2('eligibleWindBaseLandM2', eligibleWindBaseLandM2(lu)),
        [`${D}.population`, q(lu.population, personU, LAND, input(`${D}:population`))],
        m2('builtFootprintM2', lu.builtFootprintM2),
        m2('builtParcelLandM2', lu.builtParcelLandM2),
        m2('energyGenerationLandM2', lu.energyGenerationLandM2),
        m2('builtTotalM2', lu.builtTotalM2),
        m2('builtGfaM2', lu.builtGfaM2),
        m2('urbanGreenM2', lu.urbanGreenM2),
        m2('roadsM2', lu.roadsM2),
        m2('parkingM2', lu.parkingM2),
        m2('infrastructureM2', lu.infrastructureM2),
        m2('agricultureM2', lu.agricultureM2),
        m2('natureM2', lu.natureM2),
        m2('waterM2', lu.waterM2),
        m2('openSpaceM2', lu.openSpaceM2),
        m2('totalLandM2', lu.totalLandM2),
        [`${D}.densityPeoplePerHaBuilt`, q(lu.densityPeoplePerHaBuilt, idxU, LAND, input(`${D}:densityPeoplePerHaBuilt`))],
      ]);
    },
  };
}
