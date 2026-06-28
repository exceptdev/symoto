// The single public API surface for @symoto/core. Value exports and type exports are
// separated so the package can be consumed cleanly (including under isolatedModules).

// Quantity envelope
export { q, isQuantity } from './quantity/quantity.js';
export type { Quantity } from './quantity/quantity.js';

// Units
export { unit, sameDimension, convertValue, composeMul, composeDiv, DimensionMismatch } from './quantity/units.js';
export type { SymUnit } from './quantity/units.js';

// Boundary
export { boundariesEqual, assertSameBoundary, boundariesCompatible, BoundaryViolation } from './quantity/boundary.js';
export type { Boundary, Accounting, Basis, Temporal } from './quantity/boundary.js';

// Provenance
export { input, coefficient, opProv } from './quantity/provenance.js';
export type { ProvRef, QOp } from './quantity/provenance.js';

// Q-algebra
export { add, sub, mul, div, scale, convert, adapt, integrate } from './quantity/algebra.js';

// Graph and ports
export { validateConnection } from './graph/connection.js';
export type { Connection, PortRef, WireError } from './graph/connection.js';
export { buildGraph } from './graph/graph.js';
export type { Graph } from './graph/graph.js';
export type { Node, NodeKind, Port, PortSignature, QMap } from './graph/node.js';

// Run context and evaluator
export { makeRunContext } from './run/context.js';
export type { RunContext } from './run/context.js';
export { kahnTopoSort } from './eval/topo.js';
export type { TopoOrder } from './eval/topo.js';
export { resolveFixedPoint } from './eval/fixedpoint.js';
export type { FixedPointOpts, FixedPointResult } from './eval/fixedpoint.js';
export { run } from './eval/evaluate.js';
export type { RunResult } from './eval/evaluate.js';
