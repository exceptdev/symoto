// Q-algebra: the only legal way to combine two Quantity envelopes.
// add/sub enforce unit dimension AND boundary equality (the run-time half of
// refuse-to-net, the second structural choke point after validateConnection).
// mul/div compose units; scale multiplies by a dimensionless factor; convert changes
// unit within a dimension. adapt and integrate are typed but deferred (Phase 2, Phase 7).
import { q, type Quantity } from './quantity.js';
import { assertSameBoundary, type Boundary } from './boundary.js';
import {
  sameDimension,
  convertValue,
  composeMul,
  composeDiv,
  DimensionMismatch,
  type SymUnit,
} from './units.js';
import { opProv } from './provenance.js';

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
export function adapt(_a: Quantity, _toBoundary: Boundary, _method: string): Quantity {
  throw new Error('adapt() is implemented in Phase 2 (UNIT-04, boundary transition catalogue).');
}
export function integrate(_stock: Quantity, _flow: Quantity, _dt: Quantity): Quantity {
  throw new Error('integrate() is implemented in Phase 7 (TIME-01, stock-flow integrator).');
}
