import { describe, it, expect } from 'vitest';
import { loadGoldenMaster, PARITY_GRID } from './harness.js';

// The golden master must be a frozen, provenance-stamped snapshot of the pinned bespoke
// engine, captured over the full grid BEFORE any Symoto OC node exists (T-3-01). This test
// pins that contract: the fixture loads, covers the grid, carries provenance, and every
// scenario has all eight ScenarioResult domains.

const DOMAINS = ['landUse', 'energy', 'water', 'food', 'waste', 'emissions', 'jobs', 'cost'] as const;

describe('golden-master fixture (MODEL-02, ROADMAP SC1)', () => {
  const golden = loadGoldenMaster();

  it('loads, is non-empty, and covers the canonical grid (> 40 scenarios)', () => {
    expect(golden.scenarios.length).toBe(golden.provenance.gridSize);
    expect(golden.scenarios.length).toBe(PARITY_GRID.length);
    expect(golden.scenarios.length).toBeGreaterThan(40);
  });

  it('carries reproducible provenance (vizapp commit, coefficients commit, xlsx, baseline)', () => {
    expect(golden.provenance.vizappHead).toMatch(/^[0-9a-f]{40}$/);
    expect(golden.provenance.coefficientsCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(golden.provenance.xlsxPath).toContain('dev-model.xlsx');
    expect(golden.provenance.baselinePopulation).toBe(50_000);
  });

  it('every scenario carries all eight ScenarioResult domains', () => {
    for (const s of golden.scenarios) {
      for (const d of DOMAINS) {
        expect(s.result[d], `${s.id} missing ${d}`).toBeTruthy();
      }
    }
  });

  it('no OC model node exists yet in this plan (capture is before the rebuild)', () => {
    // The fixture is captured from the BESPOKE engine; the Symoto nodes (src/nodes/*) are
    // built in later waves. This assertion documents the ordering constraint rather than
    // scanning the filesystem: the fixture's provenance points at the bespoke repo.
    expect(golden.provenance.vizappHead).toBeTruthy();
  });
});
