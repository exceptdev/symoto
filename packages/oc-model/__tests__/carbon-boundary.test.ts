import { describe, it, expect } from 'vitest';
import { makeRunContext, q, sub, input, BoundaryViolation, type ProvRef, type QMap } from '@symoto/core';
import { makeEmissionsNode, NET_CARBON_METHOD } from '../src/nodes/emissions.js';
import { goldenById } from './parity/harness.js';
import { CARBON_OPERATIONAL, CARBON_TERRITORIAL, LAND, ENERGY_SUPPLY, m2U, tU, mwhU } from '../src/boundaries.js';

// MODEL-03, the trust differentiator. (1) The raw net (consumption/operational gross minus
// territorial sequestration, same unit different accounting) throws BoundaryViolation: the
// original silent net is refused. (2) The node's net-carbon readout exists only through an
// explicit, labeled crossing visible in provenance. (3) NL, VN, and BR produce three distinct
// gross and net figures, each matching the golden master per country.

const golden = goldenById();

function walkForAdapter(p: ProvRef): boolean {
  if (p.kind === 'adapter') return true;
  if (p.kind === 'op') return p.inputs.some(walkForAdapter);
  return false;
}

function adapterRecord(p: ProvRef): Extract<ProvRef, { kind: 'adapter' }> | undefined {
  if (p.kind === 'adapter') return p;
  if (p.kind === 'op') {
    for (const c of p.inputs) {
      const found = adapterRecord(c);
      if (found) return found;
    }
  }
  return undefined;
}

function runEmissions(id: string, inputs: Parameters<typeof makeEmissionsNode>[0]): QMap {
  const g = golden.get(id)!;
  const energyGen = (g.result.landUse as { energyGenerationLandM2: number }).energyGenerationLandM2;
  const eg = g.result.energy as { fossilBackfillMwh: number; curtailmentMwh: number };
  return makeEmissionsNode(inputs).compute(makeRunContext({}), {
    'emissions.energyGenerationLandM2In': q(energyGen, m2U, LAND, input('in')),
    'emissions.fossilBackfillMwhIn': q(eg.fossilBackfillMwh, mwhU, ENERGY_SUPPLY, input('in')),
    'emissions.curtailmentMwhIn': q(eg.curtailmentMwh, mwhU, ENERGY_SUPPLY, input('in')),
  });
}

describe('carbon boundary refusal and localization (MODEL-03)', () => {
  it('refuses the raw net: sub(operational gross, territorial sequestration) throws', () => {
    const rawGross = q(166_176.45, tU, CARBON_OPERATIONAL, input('grossEmissions'));
    const rawSequestration = q(8_395.86, tU, CARBON_TERRITORIAL, input('sequestration'));
    expect(() => sub(rawGross, rawSequestration)).toThrow(BoundaryViolation);
  });

  it('produces the net only through a labeled crossing visible in provenance', () => {
    const r = runEmissions('base|pop=50000|Netherlands|Wind/Solar', { population: 50_000, country: 'Netherlands' });
    const net = r['emissions.netCarbonTonnesPerYr']!;
    // The net carries the declared combined (operational) boundary.
    expect(net.boundary).toEqual(CARBON_OPERATIONAL);
    // The crossing is named in provenance (kind 'adapter' with the declared method).
    expect(walkForAdapter(net.provenance)).toBe(true);
    const adapter = adapterRecord(net.provenance)!;
    expect(adapter.method).toBe(NET_CARBON_METHOD);
    expect(adapter.from).toEqual(CARBON_TERRITORIAL);
    expect(adapter.to).toEqual(CARBON_OPERATIONAL);
    // The labeled net equals the bespoke net value (gross - sequestration).
    const eg = golden.get('base|pop=50000|Netherlands|Wind/Solar')!.result.emissions as { netCarbonTonnesPerYr: number };
    expect(net.value).toBeCloseTo(eg.netCarbonTonnesPerYr, 6);
  });

  it('localizes: NL, VN, BR produce three distinct gross and net figures matching the golden master', () => {
    const cases = [
      { id: 'base|pop=50000|Netherlands|Wind/Solar', country: 'Netherlands' as const },
      { id: 'base|pop=50000|Vietnam|Wind/Solar', country: 'Vietnam' as const },
      { id: 'base|pop=50000|Brazil|Wind/Solar', country: 'Brazil' as const },
    ];
    const gross: number[] = [];
    const net: number[] = [];
    for (const c of cases) {
      const r = runEmissions(c.id, { population: 50_000, country: c.country });
      const eg = golden.get(c.id)!.result.emissions as { carbonEmissionsTonnesPerYr: number; netCarbonTonnesPerYr: number };
      expect(r['emissions.carbonEmissionsTonnesPerYr']!.value).toBeCloseTo(eg.carbonEmissionsTonnesPerYr, 6);
      expect(r['emissions.netCarbonTonnesPerYr']!.value).toBeCloseTo(eg.netCarbonTonnesPerYr, 6);
      gross.push(r['emissions.carbonEmissionsTonnesPerYr']!.value);
      net.push(r['emissions.netCarbonTonnesPerYr']!.value);
    }
    // Three mutually distinct figures (localization is real, not cosmetic).
    expect(new Set(gross.map((x) => x.toFixed(3))).size).toBe(3);
    expect(new Set(net.map((x) => x.toFixed(3))).size).toBe(3);
  });
});
