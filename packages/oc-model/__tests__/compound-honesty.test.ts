import { describe, it, expect } from 'vitest';
import { run, compound, componentByRole, type ProvRef } from '@symoto/core';
import { buildOcModel } from '../src/model.js';
import { carbonCompound, energyBalanceCompound } from '../src/compounds.js';
import { NET_CARBON_METHOD } from '../src/nodes/emissions.js';
import { goldenById } from './parity/harness.js';

// PROV-02 (ROADMAP Success Criterion 2): the OC carbon account and the energy balance are exposed as
// honest compounds whose nets are only obtainable alongside their gross components, the carbon net
// carries its labeled boundary crossing, a lone net is refused, and all values are unchanged.

const golden = goldenById();
const BASELINE_ID = 'base|pop=50000|Netherlands|Wind/Solar';

// The net readout is a node-boundary ProvRef; its within-node DAG (local) carries the adapter.
function findAdapter(p: ProvRef): Extract<ProvRef, { kind: 'adapter' }> | undefined {
  if (p.kind === 'adapter') return p;
  if (p.kind === 'op') {
    for (const c of p.inputs) {
      const found = findAdapter(c);
      if (found) return found;
    }
  }
  if (p.kind === 'node') return findAdapter(p.local);
  return undefined;
}

describe('OC compound honesty (PROV-02, SC2)', () => {
  it('the carbon compound exposes gross-in, gross-out, and a net carrying the labeled crossing', () => {
    const result = run(buildOcModel({ population: 50_000, country: 'Netherlands' }), {});
    const c = carbonCompound(result.readouts);

    expect(componentByRole(c, 'gross-in')).toBeDefined();
    expect(componentByRole(c, 'gross-out')).toBeDefined();
    expect(componentByRole(c, 'net')).toBeDefined();

    // The net value equals the run readout (read-only, no recompute).
    expect(c.net.value).toBe(result.readouts['emissions.netCarbonTonnesPerYr']!.value);

    // The net is named, not silent: its provenance carries the labeled adapter crossing.
    const adapter = findAdapter(c.net.provenance);
    expect(adapter).toBeDefined();
    expect(adapter!.method).toBe(NET_CARBON_METHOD);
  });

  it('refuses a lone net (the carbon net alone cannot be constructed as a compound)', () => {
    const result = run(buildOcModel({ population: 50_000, country: 'Netherlands' }), {});
    const net = result.readouts['emissions.netCarbonTonnesPerYr']!;
    expect(() => compound('emissions.carbon', net, [{ role: 'net', key: 'net', quantity: net }])).toThrow(/lone net/i);
  });

  it('the energy balance compound exposes supply, demand, and a balance (generality)', () => {
    const result = run(buildOcModel({ population: 50_000, country: 'Netherlands' }), {});
    const c = energyBalanceCompound(result.readouts);

    const supply = componentByRole(c, 'gross-in');
    const demand = componentByRole(c, 'gross-out');
    const balance = componentByRole(c, 'net');
    expect(supply?.quantity.value).toBe(result.readouts['energy.totalSupplyMwh']!.value);
    expect(demand?.quantity.value).toBe(result.readouts['energy.totalDemandMwh']!.value);
    expect(balance).toBeDefined();
  });

  it('parity guard: compound component values equal the golden master readouts', () => {
    const result = run(buildOcModel({ population: 50_000, country: 'Netherlands' }), {});
    const c = carbonCompound(result.readouts);
    const ge = golden.get(BASELINE_ID)!.result.emissions as {
      carbonEmissionsTonnesPerYr: number;
      carbonSequestrationTonnesPerYr: number;
      netCarbonTonnesPerYr: number;
    };
    expect(componentByRole(c, 'gross-in')!.quantity.value).toBeCloseTo(ge.carbonEmissionsTonnesPerYr, 6);
    expect(componentByRole(c, 'gross-out')!.quantity.value).toBeCloseTo(ge.carbonSequestrationTonnesPerYr, 6);
    expect(c.net.value).toBeCloseTo(ge.netCarbonTonnesPerYr, 6);
  });
});
