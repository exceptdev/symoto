// ProvRef is the provenance DAG carried by every Quantity. Every Q-algebra result
// threads an `op` record naming the operation and listing its operand provenances, so
// any readout's number can be walked back to its inputs and coefficients.
// A boundary crossing is its own first-class 'adapter' kind (NOT a QOp), naming the
// method and both boundaries so the crossing is always visible in the DAG (UNIT-04).
// 'integrate' is reserved (Phase 7) and not used by ops yet.
import type { Boundary } from './boundary.js';

export type QOp = 'add' | 'sub' | 'mul' | 'div' | 'scale' | 'convert';

/**
 * A node-boundary input dependency, referencing an upstream producer by id only (never by
 * embedded ProvRef object). This is what keeps the serialized trace acyclic: the land<->energy
 * cycle becomes two directed edges, not an infinitely nested object (Phase 5 D5-1, PROV-01).
 */
export interface InputEdge {
  readonly fromNodeId: string;
  readonly fromPortId: string;
  readonly toPortId: string;
}

/**
 * An authored coefficient/source citation for a readout. `coefficientId` names the coefficient
 * the formula draws on, `source` is its origin string (the pinned coefficients file and its xlsx
 * provenance), and `localeSensitive` flags a locale-dependent figure (Phase 5 D5-2).
 */
export interface SourceRef {
  readonly coefficientId: string;
  readonly source?: string;
  readonly localeSensitive: boolean;
}

export type ProvRef =
  // The input ProvRef's optional `requested`/`actual` fields are the requested-vs-actual hook
  // (PROV-03), populated by Plan 05's `inputClamped` constructor when a node clamps an input so
  // the readout itself marks that its requested value was not honored.
  | { readonly kind: 'input'; readonly portId: string; readonly requested?: number; readonly actual?: number }
  | { readonly kind: 'coefficient'; readonly id: string; readonly source?: string; readonly localeSensitive: boolean }
  | { readonly kind: 'op'; readonly op: QOp; readonly inputs: readonly ProvRef[]; readonly nodeId?: string }
  | { readonly kind: 'adapter'; readonly method: string; readonly from: Boundary; readonly to: Boundary; readonly inputs: readonly ProvRef[] }
  // The node-boundary variant (PROV-01, SC4): names the node and readout, wraps the within-node
  // op/adapter DAG as `local` (preserving the carbon net's adapter record), lists input
  // dependencies as edges by id, and carries the authored formula and source citations.
  | {
      readonly kind: 'node';
      readonly nodeId: string;
      readonly readoutKey: string;
      readonly formula?: string;
      readonly local: ProvRef;
      readonly inputs: readonly InputEdge[];
      readonly sources: readonly SourceRef[];
    };

export const input = (portId: string): ProvRef => ({ kind: 'input', portId });

/**
 * Mark a clamped input not honored (PROV-03): carry the requested and the actual value on the input
 * ProvRef so the readout's own provenance shows its requested value was not honored. This reuses the
 * requested/actual hook documented on the input variant above.
 */
export const inputClamped = (portId: string, requested: number, actual: number): ProvRef => ({
  kind: 'input',
  portId,
  requested,
  actual,
});

export const coefficient = (id: string, localeSensitive = false, source?: string): ProvRef => ({
  kind: 'coefficient',
  id,
  source,
  localeSensitive,
});

export const opProv = (op: QOp, inputs: ProvRef[], nodeId?: string): ProvRef => ({
  kind: 'op',
  op,
  inputs,
  nodeId,
});

export const adapterProv = (method: string, from: Boundary, to: Boundary, inputs: ProvRef[]): ProvRef => ({
  kind: 'adapter',
  method,
  from,
  to,
  inputs,
});

/** Build a SourceRef citation for a coefficient the formula draws on. */
export const sourceRef = (coefficientId: string, localeSensitive: boolean, source?: string): SourceRef => ({
  coefficientId,
  source,
  localeSensitive,
});

/**
 * Wrap a node output in a node-boundary ProvRef (PROV-01). `local` is the within-node DAG the
 * node's compute produced (preserved, not overwritten), `inputs` are the node's incoming edges by
 * id, and the optional `formula` and `sources` are authored metadata looked up from `Node.meta`.
 */
export const nodeProv = (
  nodeId: string,
  readoutKey: string,
  local: ProvRef,
  inputs: readonly InputEdge[],
  opts?: { formula?: string; sources?: readonly SourceRef[] },
): ProvRef => ({
  kind: 'node',
  nodeId,
  readoutKey,
  formula: opts?.formula,
  local,
  inputs,
  sources: opts?.sources ?? [],
});
