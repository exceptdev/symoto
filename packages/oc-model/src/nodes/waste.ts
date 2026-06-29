// Waste domain node. computeWasteRaw is a verbatim port of vizapp/src/sim/waste.ts: 400 kg/cap
// effective generation, the density-level diversion bonus capped at the circularity cap,
// divertedFromLandfillPct rounded to 1 dp (display only), tonnages from the UNROUNDED diversion
// fraction (mass balance exact), and the organic-to-biogas guard. The node recomputes the
// closed land use from the wired energyGenerationLandM2.
import { q, input, type Node, type QMap } from '@symoto/core';
import { COEFFICIENTS } from '../coefficients.generated.js';
import type { ModelCoefficients } from '../config.js';
import type { SimInputs, LandUseResult } from '../types.js';
import { computeLandUseRaw } from './land.js';
import { LAND, MASS_FLOW, INDEX, port, m2U, tU, idxU } from '../boundaries.js';

const KG_PER_TONNE = 1000;
const WASTE_KG_PER_CAPITA = 500;
const REGEN_WASTE_REDUCTION = 0.2;
const REGEN_WASTE_DIVERSION = 0.85;
const CIRCULARITY_CAP = 0.95;
const DENSITY_BONUS_PP_PER_LVL = 1.5;
const ORGANIC_FRACTION = 0.25;

function densityLevel(peoplePerHa: number): number {
  if (peoplePerHa < 40) return 1;
  if (peoplePerHa < 60) return 2;
  if (peoplePerHa < 80) return 3;
  if (peoplePerHa < 100) return 4;
  if (peoplePerHa < 130) return 5;
  if (peoplePerHa < 170) return 6;
  return 7;
}

export interface WasteResult {
  wasteGeneratedTonnesPerYr: number;
  divertedFromLandfillPct: number;
  divertedTonnesPerYr: number;
  landfillTonnesPerYr: number;
  recycledTonnesPerYr: number;
  organicToBiogasTonnesPerYr: number;
}

/** Verbatim port of the bespoke computeWaste. */
export function computeWasteRaw(
  landUse: LandUseResult,
  _inputs: SimInputs,
  _coeffs: ModelCoefficients = COEFFICIENTS,
): WasteResult {
  const population = Math.max(0, landUse.population);

  const wasteGeneratedTonnesPerYr = (WASTE_KG_PER_CAPITA * (1 - REGEN_WASTE_REDUCTION) * population) / KG_PER_TONNE;

  const level = densityLevel(landUse.densityPeoplePerHaBuilt);
  const diversion = Math.min(CIRCULARITY_CAP, REGEN_WASTE_DIVERSION + (level * DENSITY_BONUS_PP_PER_LVL) / 100);

  const divertedFromLandfillPct = Math.round(diversion * 1000) / 10;

  const divertedTonnesPerYr = wasteGeneratedTonnesPerYr * diversion;
  const landfillTonnesPerYr = wasteGeneratedTonnesPerYr - divertedTonnesPerYr;

  let organicToBiogasTonnesPerYr = wasteGeneratedTonnesPerYr * ORGANIC_FRACTION;
  let recycledTonnesPerYr = divertedTonnesPerYr - organicToBiogasTonnesPerYr;

  if (organicToBiogasTonnesPerYr > divertedTonnesPerYr) {
    organicToBiogasTonnesPerYr = divertedTonnesPerYr;
    recycledTonnesPerYr = 0;
  }

  return {
    wasteGeneratedTonnesPerYr,
    divertedFromLandfillPct,
    divertedTonnesPerYr,
    landfillTonnesPerYr,
    recycledTonnesPerYr,
    organicToBiogasTonnesPerYr,
  };
}

const D = 'waste';

/** Build the waste node for a scenario. */
export function makeWasteNode(inputs: SimInputs): Node {
  return {
    id: 'n4-waste',
    kind: 'readout',
    ports: {
      in: [port(`${D}.energyGenerationLandM2In`, m2U, LAND)],
      out: [
        port(`${D}.wasteGeneratedTonnesPerYr`, tU, MASS_FLOW),
        port(`${D}.divertedFromLandfillPct`, idxU, INDEX),
        port(`${D}.divertedTonnesPerYr`, tU, MASS_FLOW),
        port(`${D}.landfillTonnesPerYr`, tU, MASS_FLOW),
        port(`${D}.recycledTonnesPerYr`, tU, MASS_FLOW),
        port(`${D}.organicToBiogasTonnesPerYr`, tU, MASS_FLOW),
      ],
    },
    compute: (_ctx, portInputs): QMap => {
      const energyGen = portInputs[`${D}.energyGenerationLandM2In`]?.value ?? 0;
      const landUse = computeLandUseRaw(inputs, COEFFICIENTS, energyGen);
      const r = computeWasteRaw(landUse, inputs, COEFFICIENTS);
      const t = (id: keyof WasteResult) => [`${D}.${id}`, q(r[id], tU, MASS_FLOW, input(`${D}:${id}`))] as const;
      return Object.fromEntries([
        t('wasteGeneratedTonnesPerYr'),
        [`${D}.divertedFromLandfillPct`, q(r.divertedFromLandfillPct, idxU, INDEX, input(`${D}:divertedFromLandfillPct`))],
        t('divertedTonnesPerYr'),
        t('landfillTonnesPerYr'),
        t('recycledTonnesPerYr'),
        t('organicToBiogasTonnesPerYr'),
      ]);
    },
  };
}
