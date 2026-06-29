import { describe, it, expect } from 'vitest';
import type { Boundary } from '../src/quantity/boundary.js';
import { BoundaryViolation } from '../src/quantity/boundary.js';
import { input, coefficient, adapterProv } from '../src/quantity/provenance.js';
import { q } from '../src/quantity/quantity.js';
import { unit, sameDimension } from '../src/quantity/units.js';
import { BOUNDARY_CATALOGUE, findTransition } from '../src/quantity/catalogue.js';

const PER_CAPITA: Boundary = { accounting: 'consumption', basis: 'per-capita', temporal: 'flow' };
const ABSOLUTE: Boundary = { accounting: 'consumption', basis: 'absolute', temporal: 'flow' };
const ENERGY_FLOW: Boundary = { accounting: 'consumption', basis: 'per-capita', temporal: 'flow' };
const EMISSIONS_FLOW: Boundary = { accounting: 'production', basis: 'per-capita', temporal: 'flow' };
const LAND_STOCK: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'stock' };

describe('adapterProv (adapter provenance variant)', () => {
  it('returns an adapter-kind ProvRef naming the method, both boundaries, and a single input', () => {
    const child = input('perCapitaTerm');
    const p = adapterProv('per-capita-to-absolute', PER_CAPITA, ABSOLUTE, [child]);
    expect(p.kind).toBe('adapter');
    if (p.kind === 'adapter') {
      expect(p.method).toBe('per-capita-to-absolute');
      expect(p.from).toEqual(PER_CAPITA);
      expect(p.to).toEqual(ABSOLUTE);
      expect(p.inputs).toHaveLength(1);
    }
  });
});

describe('BOUNDARY_CATALOGUE structure', () => {
  it('contains at least the three named OC transitions', () => {
    const methods = BOUNDARY_CATALOGUE.map((t) => t.method);
    expect(methods).toContain('per-capita-to-absolute');
    expect(methods).toContain('intensity');
    expect(methods).toContain('area-rate');
    expect(BOUNDARY_CATALOGUE.length).toBeGreaterThanOrEqual(3);
  });
});

describe('per-capita-to-absolute transition', () => {
  it('lifts a per-capita quantity to absolute via population, stamping adapter provenance', () => {
    const perCap = q(2, unit('kWh/person'), PER_CAPITA, coefficient('elecKwhPerCapita', true, 'NL'));
    const population = q(1000, unit('person'), ABSOLUTE, input('population'));
    const t = findTransition('per-capita-to-absolute', PER_CAPITA, ABSOLUTE);
    expect(t).toBeDefined();
    const r = t!.apply(perCap, ABSOLUTE, population);
    expect(r.value).toBeCloseTo(2000, 9);
    expect(sameDimension(r.unit, unit('kWh'))).toBe(true);
    expect(r.boundary).toEqual(ABSOLUTE);
    expect(r.provenance.kind).toBe('adapter');
    if (r.provenance.kind === 'adapter') {
      expect(r.provenance.method).toBe('per-capita-to-absolute');
      expect(r.provenance.inputs).toHaveLength(2);
    }
  });

  it('throws BoundaryViolation when the population operand is missing', () => {
    const perCap = q(2, unit('kWh/person'), PER_CAPITA, input('pc'));
    const t = findTransition('per-capita-to-absolute', PER_CAPITA, ABSOLUTE)!;
    expect(() => t.apply(perCap, ABSOLUTE)).toThrow(BoundaryViolation);
  });

  it('throws BoundaryViolation when the operand is not an absolute population', () => {
    const perCap = q(2, unit('kWh/person'), PER_CAPITA, input('pc'));
    const notPop = q(5, unit('MWh'), ABSOLUTE, input('energy'));
    const t = findTransition('per-capita-to-absolute', PER_CAPITA, ABSOLUTE)!;
    expect(() => t.apply(perCap, ABSOLUTE, notPop)).toThrow(BoundaryViolation);
  });
});

describe('intensity transition', () => {
  it('applies an intensity factor (MWh x t/MWh -> tonnes), stamping adapter provenance', () => {
    const energy = q(100, unit('MWh'), ENERGY_FLOW, input('energy'));
    const factor = q(0.4, unit('t/MWh'), EMISSIONS_FLOW, coefficient('emissionFactor'));
    const t = findTransition('intensity', ENERGY_FLOW, EMISSIONS_FLOW);
    expect(t).toBeDefined();
    const r = t!.apply(energy, EMISSIONS_FLOW, factor);
    expect(r.value).toBeCloseTo(40, 9);
    expect(sameDimension(r.unit, unit('t'))).toBe(true);
    expect(r.boundary).toEqual(EMISSIONS_FLOW);
    expect(r.provenance.kind).toBe('adapter');
    if (r.provenance.kind === 'adapter') expect(r.provenance.method).toBe('intensity');
  });

  it('throws BoundaryViolation when the intensity factor operand is missing', () => {
    const energy = q(100, unit('MWh'), ENERGY_FLOW, input('energy'));
    const t = findTransition('intensity', ENERGY_FLOW, EMISSIONS_FLOW)!;
    expect(() => t.apply(energy, EMISSIONS_FLOW)).toThrow(BoundaryViolation);
  });
});

describe('area-rate transition', () => {
  it('applies a rate (generation x m^2/MWh -> land area), stamping adapter provenance', () => {
    const generation = q(50, unit('MWh'), ENERGY_FLOW, input('groundSolarMwh'));
    const rate = q(8, unit('m^2/MWh'), LAND_STOCK, coefficient('groundSolarLandPerMwh'));
    const t = findTransition('area-rate', ENERGY_FLOW, LAND_STOCK);
    expect(t).toBeDefined();
    const r = t!.apply(generation, LAND_STOCK, rate);
    expect(r.value).toBeCloseTo(400, 9);
    expect(sameDimension(r.unit, unit('m^2'))).toBe(true);
    expect(r.boundary).toEqual(LAND_STOCK);
    expect(r.provenance.kind).toBe('adapter');
    if (r.provenance.kind === 'adapter') expect(r.provenance.method).toBe('area-rate');
  });

  it('throws BoundaryViolation when the rate operand is missing', () => {
    const generation = q(50, unit('MWh'), ENERGY_FLOW, input('gen'));
    const t = findTransition('area-rate', ENERGY_FLOW, LAND_STOCK)!;
    expect(() => t.apply(generation, LAND_STOCK)).toThrow(BoundaryViolation);
  });
});

describe('findTransition no-bypass property', () => {
  it('returns undefined for an unknown method', () => {
    expect(findTransition('nope', PER_CAPITA, ABSOLUTE)).toBeUndefined();
  });

  it('returns undefined when the from/to pair does not satisfy a known method predicate', () => {
    // per-capita-to-absolute requires a basis flip with all other fields equal; here only accounting differs.
    expect(findTransition('per-capita-to-absolute', ENERGY_FLOW, EMISSIONS_FLOW)).toBeUndefined();
  });

  it('every catalogued method refuses a from/to pair its predicate rejects (no catch-all)', () => {
    // A boundary that no transition should accept as both from and to (identity crossing).
    const identity: Boundary = { accounting: 'consumption', basis: 'per-capita', temporal: 'flow' };
    for (const t of BOUNDARY_CATALOGUE) {
      expect(findTransition(t.method, identity, identity)).toBeUndefined();
    }
  });
});
