import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { unit, DimensionMismatch } from '../src/quantity/units.js';
import { BoundaryViolation, type Boundary } from '../src/quantity/boundary.js';
import { q } from '../src/quantity/quantity.js';
import { input } from '../src/quantity/provenance.js';
import { add, sub, mul, div, scale, convert, adapt, integrate } from '../src/quantity/algebra.js';
import { sameDimension } from '../src/quantity/units.js';
import { arbBoundary } from './arbitraries.js';

const perCapita: Boundary = { accounting: 'consumption', basis: 'per-capita', temporal: 'flow' };
const territorial: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };

describe('algebra add/sub refuse-to-net', () => {
  it('add sums same-dimension, same-boundary quantities, bringing b into a unit', () => {
    const a = q(1, unit('MWh'), perCapita, input('a'));
    const b = q(1000, unit('kWh'), perCapita, input('b'));
    const r = add(a, b);
    expect(r.value).toBeCloseTo(2, 9);
    expect(r.unit.canonical).toBe('MWh');
  });

  it('sub subtracts with the same guards', () => {
    const a = q(5, unit('MWh'), perCapita, input('a'));
    const b = q(2000, unit('kWh'), perCapita, input('b'));
    expect(sub(a, b).value).toBeCloseTo(3, 9);
  });

  it('a unit-dimension mismatch throws DimensionMismatch', () => {
    const a = q(1, unit('MWh'), perCapita, input('a'));
    const b = q(1, unit('m^2'), perCapita, input('b'));
    expect(() => add(a, b)).toThrow(DimensionMismatch);
    expect(() => sub(a, b)).toThrow(DimensionMismatch);
  });

  it('a boundary mismatch throws BoundaryViolation (consumption per-capita vs territorial CO2, same unit)', () => {
    const consumptionCo2 = q(2, unit('kg'), perCapita, input('cons'));
    const territorialCo2 = q(1, unit('kg'), territorial, input('terr'));
    expect(() => sub(consumptionCo2, territorialCo2)).toThrow(BoundaryViolation);
    expect(() => add(consumptionCo2, territorialCo2)).toThrow(BoundaryViolation);
  });

  it('threads an op-kind provenance naming the operation', () => {
    const a = q(1, unit('MWh'), perCapita, input('a'));
    const b = q(1, unit('MWh'), perCapita, input('b'));
    const r = add(a, b);
    expect(r.provenance.kind).toBe('op');
    if (r.provenance.kind === 'op') {
      expect(r.provenance.op).toBe('add');
      expect(r.provenance.inputs).toHaveLength(2);
    }
  });

  it('property (D-06): same unit, boundaries differing only in a custom dimension refuse to net', () => {
    fc.assert(
      fc.property(arbBoundary, fc.constantFrom('A', 'B', 'C'), fc.constantFrom('A', 'B', 'C'), (bnd, v1, v2) => {
        fc.pre(v1 !== v2);
        const u = unit('MWh');
        const a = q(1, u, { ...bnd, custom: { scope: v1 } }, input('a'));
        const b = q(1, u, { ...bnd, custom: { scope: v2 } }, input('b'));
        expect(() => add(a, b)).toThrow(BoundaryViolation);
        expect(() => sub(a, b)).toThrow(BoundaryViolation);
      }),
    );
  });
});

describe('algebra mul/div/scale/convert and deferrals', () => {
  it('mul composes units and keeps the left operand boundary', () => {
    const dwellings = q(2, unit('dwelling'), territorial, input('dw'));
    const roofPerDwelling = q(115, unit('m^2/dwelling'), territorial, input('roof'));
    const area = mul(dwellings, roofPerDwelling);
    expect(area.value).toBeCloseTo(230, 9);
    expect(sameDimension(area.unit, unit('m^2'))).toBe(true);
    expect(area.boundary).toBe(dwellings.boundary);
    expect(area.provenance.kind).toBe('op');
  });

  it('div composes via composeDiv and keeps the left boundary', () => {
    const area = q(10, unit('m^2'), territorial, input('area'));
    const dwellings = q(2, unit('dwelling'), territorial, input('dw'));
    const perDwelling = div(area, dwellings);
    expect(perDwelling.value).toBeCloseTo(5, 9);
    expect(sameDimension(perDwelling.unit, unit('m^2/dwelling'))).toBe(true);
    expect(perDwelling.boundary).toBe(area.boundary);
  });

  it('scale halves the value, leaving unit and boundary unchanged', () => {
    const r = scale(q(10, unit('MWh'), perCapita, input('x')), 0.5);
    expect(r.value).toBeCloseTo(5, 9);
    expect(r.unit.canonical).toBe('MWh');
    expect(r.boundary).toBe(perCapita);
    if (r.provenance.kind === 'op') expect(r.provenance.op).toBe('scale');
  });

  it('convert changes unit within a dimension and records a convert op; across dimensions throws', () => {
    const r = convert(q(1, unit('MWh'), perCapita, input('x')), unit('kWh'));
    expect(r.value).toBeCloseTo(1000, 9);
    expect(r.unit.canonical).toBe('kWh');
    if (r.provenance.kind === 'op') expect(r.provenance.op).toBe('convert');
    expect(() => convert(q(1, unit('MWh'), perCapita, input('x')), unit('m^2'))).toThrow();
  });

  it('adapt throws a Phase 2 message and integrate throws a Phase 7 message', () => {
    const x = q(1, unit('MWh'), perCapita, input('x'));
    expect(() => adapt(x, territorial, 'm')).toThrow(/Phase 2/);
    expect(() => integrate(x, x, x)).toThrow(/Phase 7/);
  });
});
