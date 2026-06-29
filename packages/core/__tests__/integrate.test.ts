import { describe, it, expect } from 'vitest';
import { q } from '../src/quantity/quantity.js';
import { unit, DimensionMismatch } from '../src/quantity/units.js';
import { input } from '../src/quantity/provenance.js';
import { integrate } from '../src/quantity/algebra.js';
import { BoundaryViolation, type Boundary } from '../src/quantity/boundary.js';

// integrate(stock, flow, dt) is the forward-Euler accumulation primitive (TIME-01): it composes the
// flow unit with the dt unit, enforces flow-into-stock temporal discipline and a same-accounting-frame
// boundary, and records an 'integrate' op in provenance. The conservation identity holds exactly.

const STOCK_B: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'stock' };
const FLOW_B: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };

// mathjs recognizes 'year' (not 'yr'); the OC time unit is 'year' throughout.
const m3 = unit('m^3');
const m3PerYr = unit('m^3/year');
const yr = unit('year');
const kg = unit('kg');

function stock(value: number, boundary: Boundary = STOCK_B) {
  return q(value, m3, boundary, input('stock'));
}
function flow(value: number, boundary: Boundary = FLOW_B) {
  return q(value, m3PerYr, boundary, input('flow'));
}
function dt(value: number) {
  return q(value, yr, FLOW_B, input('dt'));
}

describe('integrate() accumulation, unit composition, and conservation (TIME-01)', () => {
  it('accumulates a flow into a stock over a timestep, carrying the stock unit and boundary', () => {
    const r = integrate(stock(100), flow(10), dt(2));
    expect(r.value).toBe(120);
    expect(r.unit.canonical).toBe(m3.canonical);
    expect(r.boundary).toEqual(STOCK_B);
  });

  it('holds the conservation identity exactly: result.value - stock.value === flow.value * dt.value', () => {
    const s = stock(100);
    const f = flow(10);
    const step = dt(2);
    const r = integrate(s, f, step);
    expect(r.value - s.value).toBe(f.value * step.value);
  });
});

describe('integrate() refuse-to-net-over-time guards (TIME-01)', () => {
  it('throws DimensionMismatch when composeMul(flow.unit, dt.unit) is not the stock dimension', () => {
    // flow m^3/yr times dt in kg gives m^3*kg/yr, not the m^3 stock dimension.
    const badDt = q(2, kg, FLOW_B, input('dt'));
    expect(() => integrate(stock(100), flow(10), badDt)).toThrow(DimensionMismatch);
  });

  it("throws BoundaryViolation when the flow operand is not temporal 'flow'", () => {
    const nonFlow = flow(10, { ...FLOW_B, temporal: 'stock' });
    expect(() => integrate(stock(100), nonFlow, dt(2))).toThrow(BoundaryViolation);
  });

  it("throws BoundaryViolation when the stock operand is not temporal 'stock'", () => {
    const nonStock = stock(100, { ...STOCK_B, temporal: 'flow' });
    expect(() => integrate(nonStock, flow(10), dt(2))).toThrow(BoundaryViolation);
  });

  it('throws BoundaryViolation for a flow/stock pair differing in accounting frame', () => {
    const consumptionFlow = flow(10, { accounting: 'consumption', basis: 'absolute', temporal: 'flow' });
    expect(() => integrate(stock(100), consumptionFlow, dt(2))).toThrow(BoundaryViolation);
  });
});

describe('integrate() provenance (TIME-01)', () => {
  it("records an 'integrate' op naming the stock, the flow, and the dt", () => {
    const s = stock(100);
    const f = flow(10);
    const step = dt(2);
    const r = integrate(s, f, step);
    expect(r.provenance.kind).toBe('op');
    if (r.provenance.kind === 'op') {
      expect(r.provenance.op).toBe('integrate');
      expect(r.provenance.inputs).toHaveLength(3);
      expect(r.provenance.inputs).toEqual([s.provenance, f.provenance, step.provenance]);
    }
  });
});
