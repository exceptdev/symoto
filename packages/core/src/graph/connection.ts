// Wire types and the wire-time refuse-to-net guard.
import { boundariesCompatible } from '../quantity/boundary.js';
import type { PortSignature } from './node.js';

export interface PortRef {
  readonly nodeId: string;
  readonly portId: string;
}

export interface Connection {
  readonly from: PortRef;
  readonly to: PortRef;
}

export type WireError = { code: 'dimension' | 'boundary'; message: string };

/**
 * First line of refuse-to-net: validate at wire time, independent of run-time values.
 * Purely structural over PortSignature; it never needs a Quantity. Inherits the D-06
 * deep boundary equality, so a custom-dimension-only difference is blocked at wire time
 * too. (UNIT-05 in Phase 2 formalizes the wire-time/run-time separation.)
 */
export function validateConnection(out: PortSignature, in_: PortSignature): WireError | null {
  if (out.dimension !== in_.dimension) {
    return {
      code: 'dimension',
      message: `Dimension mismatch at wire time: ${out.dimension} cannot connect to ${in_.dimension}.`,
    };
  }
  if (!boundariesCompatible(out.boundary, in_.boundary)) {
    return {
      code: 'boundary',
      message: 'Boundary mismatch at wire time: incompatible boundaries cannot be connected.',
    };
  }
  return null;
}
