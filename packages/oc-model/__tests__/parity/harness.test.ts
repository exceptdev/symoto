import { describe, it, expect } from 'vitest';
import {
  compareReadout,
  PARITY_POLICY,
  PARITY_GRID,
  NAMED_DEVIATIONS,
  isNamedDeviation,
  loadGoldenMaster,
  DEFAULT_EPSILON,
} from './harness.js';

// The parity verdict is only as trustworthy as the comparator and the deviation registry
// (T-3-02). This self-test proves the relative comparator across continuous, exact, and
// rounded policies, and pins the seeded biodiversity deviation and the grid/fixture count.

describe('parity harness comparator (MODEL-02)', () => {
  it('continuous policy passes within 1e-9 relative and fails beyond it', () => {
    const big = 166_176.45;
    const pass = compareReadout('grossEmissions', big * (1 + 5e-10), big, 'continuous');
    expect(pass.pass).toBe(true);
    expect(pass.relError).toBeLessThan(DEFAULT_EPSILON);

    const fail = compareReadout('grossEmissions', big * (1 + 1e-6), big, 'continuous');
    expect(fail.pass).toBe(false);
    expect(fail.relError).toBeGreaterThan(DEFAULT_EPSILON);
  });

  it('exact policy matches integers and booleans exactly', () => {
    expect(compareReadout('turbineCount', 35, 35, 'exact').pass).toBe(true);
    expect(compareReadout('turbineCount', 34, 35, 'exact').pass).toBe(false);
    expect(compareReadout('windCapped', false, false, 'exact').pass).toBe(true);
    expect(compareReadout('windCapped', true, false, 'exact').pass).toBe(false);
  });

  it('rounded policy compares after the stated decimal rounding', () => {
    const policy = { kind: 'rounded', decimals: 1 } as const;
    expect(compareReadout('divertedFromLandfillPct', 91.04, 91.0, policy).pass).toBe(true);
    expect(compareReadout('divertedFromLandfillPct', 91.06, 91.0, policy).pass).toBe(false);
  });

  it('resolves the per-readout policy from PARITY_POLICY by name', () => {
    expect(PARITY_POLICY.turbineCount).toBe('exact');
    expect(PARITY_POLICY.maxTurbines).toBe('exact');
    expect(PARITY_POLICY.windCapped).toBe('exact');
    expect(PARITY_POLICY.divertedFromLandfillPct).toEqual({ kind: 'rounded', decimals: 1 });
    // An unlisted readout defaults to continuous (no entry).
    expect(PARITY_POLICY.totalDemandMwh).toBeUndefined();
  });

  it('registers the biodiversity scope deviation', () => {
    expect(isNamedDeviation('biodiversity')).toBe(true);
    const bio = NAMED_DEVIATIONS.find((d) => d.readout === 'biodiversity');
    expect(bio).toBeTruthy();
    expect(bio!.rationale).toContain('ScenarioResult');
  });

  it('the canonical grid count matches the committed fixture scenario count', () => {
    expect(PARITY_GRID.length).toBe(loadGoldenMaster().scenarios.length);
  });
});
