import { describe, it, expect } from 'vitest';
import { run, type QMap } from '@symoto/core';
import { buildOcModel } from '../src/model.js';
import type { SimInputs, EnergyScenario, DietaryPreference } from '../src/types.js';
import type { TurbineClass } from '../src/turbineConfig.js';

// MODEL-02 SC5: the assembled model must produce no NaN/Infinity and no out-of-range gauge over
// the edge matrix: population 0, extreme selectors (self-sufficiency 0 and 1.5, every diet /
// energy scenario / turbine class, regen true/false), and a degenerate-program case.

const COUNTRIES = ['Netherlands', 'Vietnam', 'Brazil'] as const;
const DIETS: DietaryPreference[] = ['omnivore', 'flexitarian', 'vegetarian', 'vegan'];
const SCENARIOS: EnergyScenario[] = ['Wind/Solar', 'Wind', 'Solar'];
const TURBINES: TurbineClass[] = ['small', 'medium', 'large'];

function buildEdgeMatrix(): SimInputs[] {
  const cases: SimInputs[] = [];
  // Population 0 in every country.
  for (const country of COUNTRIES) cases.push({ population: 0, country });
  // Extreme self-sufficiency on every lever, at NL 50k.
  for (const lvl of [0, 1.5]) {
    cases.push({ population: 50_000, country: 'Netherlands', energySelfSufficiency: lvl });
    cases.push({ population: 50_000, country: 'Netherlands', foodSelfSufficiency: lvl });
    cases.push({ population: 50_000, country: 'Netherlands', waterSelfSufficiency: lvl });
    cases.push({ population: 50_000, country: 'Netherlands', economicSelfSufficiency: lvl });
  }
  for (const diet of DIETS) cases.push({ population: 50_000, country: 'Netherlands', dietaryPreference: diet });
  for (const energyScenario of SCENARIOS) cases.push({ population: 50_000, country: 'Netherlands', energyScenario });
  for (const turbineClass of TURBINES) cases.push({ population: 50_000, country: 'Netherlands', turbineClass });
  for (const regenerativeAgriculture of [true, false]) cases.push({ population: 50_000, country: 'Netherlands', regenerativeAgriculture });
  for (const productionFocus of [0, 1]) cases.push({ population: 50_000, country: 'Netherlands', productionFocus });
  // Degenerate-program case: tiny population with economic programs zeroed out (drives the
  // num()/zero-GFA guards toward the flat-density and zero-revenue fallbacks).
  cases.push({ population: 1, country: 'Netherlands', economicSelfSufficiency: 0, foodSelfSufficiency: 0 });
  return cases;
}

function readoutValue(r: QMap, key: string): number {
  return r[key]!.value;
}

describe('edge matrix: no NaN/Infinity and no out-of-range gauge (MODEL-02 SC5)', () => {
  const matrix = buildEdgeMatrix();

  it('every readout is finite across the edge matrix', () => {
    for (const inputs of matrix) {
      const result = run(buildOcModel(inputs), {});
      for (const [key, v] of Object.entries(result.readouts)) {
        expect(Number.isFinite(v.value), `${JSON.stringify(inputs)} -> ${key} = ${v.value}`).toBe(true);
      }
    }
  });

  it('every bounded readout stays in range across the edge matrix', () => {
    for (const inputs of matrix) {
      const r = run(buildOcModel(inputs), {}).readouts;
      expect(readoutValue(r, 'water.selfSufficiencyPct')).toBeLessThanOrEqual(1);
      expect(readoutValue(r, 'water.selfSufficiencyPct')).toBeGreaterThanOrEqual(0);
      expect(readoutValue(r, 'jobs.jobSelfSufficiencyPct')).toBeLessThanOrEqual(150);
      expect(readoutValue(r, 'jobs.educationAccessPct')).toBeLessThanOrEqual(150);
      for (const idx of ['emissions.airQualityIndex', 'emissions.waterQualityIndex']) {
        expect(readoutValue(r, idx)).toBeGreaterThanOrEqual(0);
        expect(readoutValue(r, idx)).toBeLessThanOrEqual(100);
      }
      expect(readoutValue(r, 'emissions.maturityFactor')).toBeGreaterThanOrEqual(0);
      expect(readoutValue(r, 'emissions.maturityFactor')).toBeLessThanOrEqual(1);
    }
  });
});
