// Q-algebra: the only legal way to combine two Quantity envelopes.
// add/sub enforce unit dimension AND boundary equality (the run-time half of
// refuse-to-net, the second structural choke point after validateConnection).
// mul/div compose units; scale multiplies by a dimensionless factor; convert changes
// unit within a dimension. adapt crosses a boundary through the curated catalogue;
// integrate accumulates a flow into a stock over a timestep (forward Euler, Phase 7, TIME-01).
import { q, type Quantity } from './quantity.js';
import { assertSameBoundary, BoundaryViolation, type Boundary } from './boundary.js';
import {
  sameDimension,
  convertValue,
  composeMul,
  composeDiv,
  DimensionMismatch,
  type SymUnit,
} from './units.js';
import { opProv } from './provenance.js';
import { findTransition } from './catalogue.js';

/** add: enforce unit dimension AND boundary equality, then bring b into a's unit. */
export function add(a: Quantity, b: Quantity): Quantity {
  if (!sameDimension(a.unit, b.unit)) throw new DimensionMismatch(a.unit, b.unit);
  assertSameBoundary(a.boundary, b.boundary);
  const bv = convertValue(b.value, b.unit, a.unit);
  return q(a.value + bv, a.unit, a.boundary, opProv('add', [a.provenance, b.provenance]));
}

/** sub: same refuse-to-net guards as add. */
export function sub(a: Quantity, b: Quantity): Quantity {
  if (!sameDimension(a.unit, b.unit)) throw new DimensionMismatch(a.unit, b.unit);
  assertSameBoundary(a.boundary, b.boundary);
  const bv = convertValue(b.value, b.unit, a.unit);
  return q(a.value - bv, a.unit, a.boundary, opProv('sub', [a.provenance, b.provenance]));
}

// mul/div compose units. Boundary composition rule for Phase 1 is minimal: keep the
// LEFT operand's boundary. This is sufficient for the OC slice (which only multiplies a
// Quantity by an effectively dimensionless coefficient) and the synthetic tests. The
// general per-capita x absolute composition rule is deferred to Phase 2 with the adapter
// catalogue.
export function mul(a: Quantity, b: Quantity): Quantity {
  return q(a.value * b.value, composeMul(a.unit, b.unit), a.boundary, opProv('mul', [a.provenance, b.provenance]));
}
export function div(a: Quantity, b: Quantity): Quantity {
  return q(a.value / b.value, composeDiv(a.unit, b.unit), a.boundary, opProv('div', [a.provenance, b.provenance]));
}
/** scale: multiply by a dimensionless factor; unit and boundary unchanged. */
export function scale(a: Quantity, factor: number): Quantity {
  return q(a.value * factor, a.unit, a.boundary, opProv('scale', [a.provenance]));
}
/** convert: change unit within one dimension; records the conversion in provenance. */
export function convert(a: Quantity, to: SymUnit): Quantity {
  return q(convertValue(a.value, a.unit, to), to, a.boundary, opProv('convert', [a.provenance]));
}
/**
 * adapt: the only run-time path that changes a Quantity's boundary. It defers entirely to
 * the catalogue. A method/from/to that findTransition does not resolve throws
 * BoundaryViolation, with no bypass and no silent passthrough; a resolved transition's
 * apply() composes the value and stamps the adapter ProvRef (never re-stamped here, so the
 * crossing stays traceable). (UNIT-04)
 */
export function adapt(a: Quantity, toBoundary: Boundary, method: string, operand?: Quantity): Quantity {
  const transition = findTransition(method, a.boundary, toBoundary);
  if (!transition) {
    throw new BoundaryViolation(
      `No catalogued boundary transition "${method}" from ${JSON.stringify(a.boundary)} to ${JSON.stringify(toBoundary)}. Crossing a boundary requires a listed adapter; there is no bypass.`,
    );
  }
  return transition.apply(a, toBoundary, operand);
}
/**
 * Compare two boundaries on every dimension EXCEPT temporal (the same-accounting-frame check
 * integrate enforces). A flow accumulates only into a stock of the same accounting frame; the
 * temporal roles intentionally differ (flow vs stock) and are checked separately. An absent custom
 * map is the empty map, never a wildcard, so the extension hatch cannot become a silent bypass.
 */
function sameAccountingFrame(a: Boundary, b: Boundary): boolean {
  if (a.accounting !== b.accounting || a.basis !== b.basis || (a.locale ?? '') !== (b.locale ?? '')) {
    return false;
  }
  const ca = a.custom ?? {};
  const cb = b.custom ?? {};
  const ka = Object.keys(ca).sort();
  const kb = Object.keys(cb).sort();
  if (ka.length !== kb.length) return false;
  if (ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => ca[k] === cb[k]);
}

function describeFrame(b: Boundary): string {
  return JSON.stringify({ accounting: b.accounting, basis: b.basis, locale: b.locale, custom: b.custom });
}

/**
 * integrate: accumulate a flow into a stock over one timestep (explicit forward Euler, the
 * conservation identity made executable). The increment unit is composeMul(flow.unit, dt.unit),
 * which must match the stock's dimension (a flow of m^3/yr times yr gives m^3, which must match a
 * m^3 stock), else DimensionMismatch. The flow must be temporal 'flow' and the stock temporal
 * 'stock', and the two must share an accounting frame (accounting, basis, locale, custom), else
 * BoundaryViolation: a flow accumulates only into a stock of the same frame (refuse-to-net applied
 * to the time dimension). Returns stock.value + flow.value*dt.value carrying the stock's unit and
 * boundary, with an 'integrate' op naming the stock, the flow, and the dt so the cumulative number
 * walks back to its flow. (TIME-01)
 */
export function integrate(stock: Quantity, flow: Quantity, dt: Quantity): Quantity {
  const incrementUnit = composeMul(flow.unit, dt.unit);
  if (!sameDimension(incrementUnit, stock.unit)) throw new DimensionMismatch(incrementUnit, stock.unit);
  if (flow.boundary.temporal !== 'flow') {
    throw new BoundaryViolation(
      `integrate: the flow operand must be temporal 'flow', got '${flow.boundary.temporal}'. You can only integrate a flow.`,
    );
  }
  if (stock.boundary.temporal !== 'stock') {
    throw new BoundaryViolation(
      `integrate: the stock operand must be temporal 'stock', got '${stock.boundary.temporal}'. You can only integrate into a stock.`,
    );
  }
  if (!sameAccountingFrame(flow.boundary, stock.boundary)) {
    throw new BoundaryViolation(
      `integrate: a flow accumulates only into a stock of the same accounting frame: ${describeFrame(flow.boundary)} vs ${describeFrame(stock.boundary)}.`,
    );
  }
  const increment = convertValue(flow.value * dt.value, incrementUnit, stock.unit);
  return q(
    stock.value + increment,
    stock.unit,
    stock.boundary,
    opProv('integrate', [stock.provenance, flow.provenance, dt.provenance]),
  );
}
