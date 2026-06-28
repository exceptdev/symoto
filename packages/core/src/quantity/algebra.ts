// Q-algebra: the only legal way to combine two Quantity envelopes.
// add/sub enforce unit dimension AND boundary equality (the run-time half of
// refuse-to-net, the second structural choke point after validateConnection).
// mul/div compose units; scale multiplies by a dimensionless factor; convert changes
// unit within a dimension. adapt and integrate are typed but deferred (Phase 2, Phase 7).
import { q, type Quantity } from './quantity.js';
import { assertSameBoundary, type Boundary } from './boundary.js';
import { sameDimension, convertValue, DimensionMismatch, type SymUnit } from './units.js';
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

// --- mul/div/scale/convert and the deferred stubs are added in Plan 03 Task 2 ---
export function mul(_a: Quantity, _b: Quantity): Quantity {
  throw new Error('mul() is implemented in Plan 03 Task 2.');
}
export function div(_a: Quantity, _b: Quantity): Quantity {
  throw new Error('div() is implemented in Plan 03 Task 2.');
}
export function scale(_a: Quantity, _factor: number): Quantity {
  throw new Error('scale() is implemented in Plan 03 Task 2.');
}
export function convert(_a: Quantity, _to: SymUnit): Quantity {
  throw new Error('convert() is implemented in Plan 03 Task 2.');
}
export function adapt(_a: Quantity, _toBoundary: Boundary, _method: string): Quantity {
  throw new Error('adapt() is implemented in Phase 2 (UNIT-04, boundary transition catalogue).');
}
export function integrate(_stock: Quantity, _flow: Quantity, _dt: Quantity): Quantity {
  throw new Error('integrate() is implemented in Phase 7 (TIME-01, stock-flow integrator).');
}
