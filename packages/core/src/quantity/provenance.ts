// ProvRef is the provenance DAG carried by every Quantity. Every Q-algebra result
// threads an `op` record naming the operation and listing its operand provenances, so
// any readout's number can be walked back to its inputs and coefficients.
// A boundary crossing is its own first-class 'adapter' kind (NOT a QOp), naming the
// method and both boundaries so the crossing is always visible in the DAG (UNIT-04).
// 'integrate' is reserved (Phase 7) and not used by ops yet.
import type { Boundary } from './boundary.js';

export type QOp = 'add' | 'sub' | 'mul' | 'div' | 'scale' | 'convert';

export type ProvRef =
  | { readonly kind: 'input'; readonly portId: string; readonly requested?: number; readonly actual?: number }
  | { readonly kind: 'coefficient'; readonly id: string; readonly source?: string; readonly localeSensitive: boolean }
  | { readonly kind: 'op'; readonly op: QOp; readonly inputs: readonly ProvRef[]; readonly nodeId?: string }
  | { readonly kind: 'adapter'; readonly method: string; readonly from: Boundary; readonly to: Boundary; readonly inputs: readonly ProvRef[] };

export const input = (portId: string): ProvRef => ({ kind: 'input', portId });

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
