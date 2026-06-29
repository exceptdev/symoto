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
export { input, inputClamped, coefficient, opProv, adapterProv, nodeProv, sourceRef } from './quantity/provenance.js';
export type { ProvRef, QOp, InputEdge, SourceRef } from './quantity/provenance.js';

// Provenance trace (PROV-01, Success Criterion 4; the contract Phase 8 reuses for export)
export { serializeTrace, reconstruct } from './provenance/trace.js';
export type { ProvenanceTrace, NodeProvRecord, EdgeRecord, ReconstructedOrigin } from './provenance/trace.js';

// Q-algebra
export { add, sub, mul, div, scale, convert, adapt, integrate } from './quantity/algebra.js';

// Honest aggregation (PROV-02): compound readouts that refuse a lone net
export { compound, componentByRole } from './quantity/compound.js';
export type { CompoundReadout, CompoundComponent, ComponentRole } from './quantity/compound.js';

// Boundary-transition catalogue
export { BOUNDARY_CATALOGUE, findTransition } from './quantity/catalogue.js';
export type { BoundaryTransition } from './quantity/catalogue.js';

// Locale invariance (LOC-02): flag a coefficient constant across locales unless declared invariant
export { flagInvariance } from './locale/invariance.js';
export type { LocaleDescriptor, InvarianceFlag } from './locale/invariance.js';

// Graph and ports
export { validateConnection } from './graph/connection.js';
export type { Connection, PortRef, WireError } from './graph/connection.js';
export { buildGraph } from './graph/graph.js';
export type { Graph } from './graph/graph.js';
export type { Node, NodeKind, Port, PortSignature, QMap } from './graph/node.js';
export { validateModel, assertModelWellFormed } from './graph/validate.js';
export type { ModelViolation } from './graph/validate.js';
export { makeAdapterNode } from './graph/adapterNode.js';
export type { AdapterNodeArgs } from './graph/adapterNode.js';

// Run context and evaluator
export { makeRunContext } from './run/context.js';
export type { RunContext } from './run/context.js';
// Requested-vs-actual (PROV-03)
export { clampRecord } from './run/requestedActual.js';
export type { RequestedActual } from './run/requestedActual.js';
export { kahnTopoSort } from './eval/topo.js';
export type { TopoOrder } from './eval/topo.js';
export { resolveFixedPoint } from './eval/fixedpoint.js';
export type { FixedPointOpts, FixedPointResult } from './eval/fixedpoint.js';
export { run } from './eval/evaluate.js';
export type { RunResult } from './eval/evaluate.js';
