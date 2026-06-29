import { describe, it, expect } from 'vitest';
import { makeRunContext, q, input, type QMap } from '@symoto/core';
import { makeJobsNode } from '../src/nodes/jobs.js';
import { PARITY_GRID, compareReadout, goldenById } from './parity/harness.js';
import { LAND, m2U } from '../src/boundaries.js';

// Jobs is tested in isolation against the golden closed land. Scalar readouts and every
// per-sector bySector value are compared; the Math.min(150,.) caps and finiteness hold over the
// grid.

const golden = goldenById();
const SCALARS = ['totalJobs', 'jobSelfSufficiencyPct', 'ftePerThousandPop', 'educationAccessPct', 'workingAgePopulation', 'totalFte'];

function runJobs(id: string, inputs: Parameters<typeof makeJobsNode>[0]): QMap {
  const g = golden.get(id)!;
  const energyGen = (g.result.landUse as { energyGenerationLandM2: number }).energyGenerationLandM2;
  const node = makeJobsNode(inputs);
  return node.compute(makeRunContext({}), {
    'jobs.energyGenerationLandM2In': q(energyGen, m2U, LAND, input('jobs.energyGenerationLandM2In')),
  });
}

describe('jobs parity over the grid (MODEL-01, MODEL-02)', () => {
  it('reproduces every scalar and per-sector jobs readout across the grid', () => {
    for (const scenario of PARITY_GRID) {
      const jg = golden.get(scenario.id)!.result.jobs as Record<string, number> & { bySector: Record<string, number> };
      const readouts = runJobs(scenario.id, scenario.inputs);
      for (const f of SCALARS) {
        const res = compareReadout(f, readouts[`jobs.${f}`]!.value, jg[f]!);
        expect(res.pass, `${scenario.id}: jobs.${f} relErr=${res.relError}`).toBe(true);
      }
      // Per-sector breakdown (documented choice: compare every bySector leaf, not just totalJobs).
      for (const [cat, v] of Object.entries(jg.bySector)) {
        const res = compareReadout(`bySector.${cat}`, readouts[`jobs.bySector.${cat}`]!.value, v);
        expect(res.pass, `${scenario.id}: jobs.bySector.${cat} relErr=${res.relError}`).toBe(true);
      }
    }
  });

  it('jobSelfSufficiencyPct and educationAccessPct never exceed 150', () => {
    for (const scenario of PARITY_GRID) {
      const r = runJobs(scenario.id, scenario.inputs);
      expect(r['jobs.jobSelfSufficiencyPct']!.value).toBeLessThanOrEqual(150);
      expect(r['jobs.educationAccessPct']!.value).toBeLessThanOrEqual(150);
    }
  });

  it('population 0 yields finite readouts and 0 self-sufficiency', () => {
    const r = runJobs('base|pop=0|Netherlands|Wind/Solar', { population: 0, country: 'Netherlands' });
    for (const [, v] of Object.entries(r)) expect(Number.isFinite(v.value)).toBe(true);
    expect(r['jobs.jobSelfSufficiencyPct']!.value).toBe(0);
  });
});
