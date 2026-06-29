import { describe, it, expect } from 'vitest';
import { run } from '@symoto/core';
import { buildOcModel } from '../src/model.js';
import { computeEnergyRaw } from '../src/nodes/energy.js';

// Each entry of the guard/clamp/zero-check inventory (BEHAVIORAL-SPEC.md) is exercised by a
// specific case so a dropped guard surfaces here, not only as a mid-grid parity miss.

describe('guard/clamp/zero-check inventory (MODEL-02 SC3)', () => {
  it('population 0 -> dwellings and jobs are 0, not NaN', () => {
    const r = run(buildOcModel({ population: 0, country: 'Netherlands' }), {}).readouts;
    expect(r['landUse.housingUnits']!.value).toBe(0);
    expect(r['jobs.totalJobs']!.value).toBe(0);
    expect(r['landUse.densityPeoplePerHaBuilt']!.value).toBe(0);
  });

  it('totalDemand 0 (population 0) -> energy selfSufficiency 0, not Infinity', () => {
    const r = run(buildOcModel({ population: 0, country: 'Netherlands' }), {}).readouts;
    expect(r['energy.selfSufficiency']!.value).toBe(0);
    expect(Number.isFinite(r['energy.selfSufficiency']!.value)).toBe(true);
  });

  it('water self-sufficiency target 1.5 -> bounded by the harvest ceiling (<= 1)', () => {
    const r = run(buildOcModel({ population: 50_000, country: 'Netherlands', waterSelfSufficiency: 1.5 }), {}).readouts;
    expect(r['water.selfSufficiencyPct']!.value).toBeLessThanOrEqual(1);
  });

  it('jobs caps: jobSelfSufficiencyPct and educationAccessPct never exceed 150', () => {
    const r = run(buildOcModel({ population: 1, country: 'Netherlands' }), {}).readouts;
    expect(r['jobs.jobSelfSufficiencyPct']!.value).toBeLessThanOrEqual(150);
    expect(r['jobs.educationAccessPct']!.value).toBeLessThanOrEqual(150);
  });

  it('turbine uncapped (no eligible-land cap) -> finite maxTurbines and turbineCount', () => {
    // Omitting eligibleWindBaseLandM2 drives maxTurbinesRaw to Infinity; maxTurbines must still
    // be finite (Number.isFinite handling reproduced), equal to turbineCount.
    const e = computeEnergyRaw({ population: 50_000, country: 'Netherlands', housingUnits: 23_810 });
    expect(Number.isFinite(e.maxTurbines)).toBe(true);
    expect(Number.isFinite(e.turbineCount)).toBe(true);
    expect(e.maxTurbines).toBe(e.turbineCount);
  });

  it('food self-sufficiency 0 -> agricultureM2 0 -> finite food self-sufficiency (0)', () => {
    const r = run(buildOcModel({ population: 50_000, country: 'Netherlands', foodSelfSufficiency: 0 }), {}).readouts;
    expect(r['food.agricultureM2']!.value).toBe(0);
    expect(Number.isFinite(r['food.selfSufficiencyPct']!.value)).toBe(true);
  });

  it('quality indices clamp to [0,100] and maturityFactor to [0,1]', () => {
    const r = run(buildOcModel({ population: 50_000, country: 'Netherlands' }), {}).readouts;
    for (const k of ['emissions.airQualityIndex', 'emissions.waterQualityIndex']) {
      expect(r[k]!.value).toBeGreaterThanOrEqual(0);
      expect(r[k]!.value).toBeLessThanOrEqual(100);
    }
    expect(r['emissions.maturityFactor']!.value).toBe(1);
  });

  it('missing/zero coefficient path stays finite (num() guard via degenerate program)', () => {
    const r = run(buildOcModel({ population: 1, country: 'Netherlands', economicSelfSufficiency: 0 }), {}).readouts;
    for (const [, v] of Object.entries(r)) expect(Number.isFinite(v.value)).toBe(true);
  });
});
