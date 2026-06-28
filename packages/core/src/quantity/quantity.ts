// Component zero: every value crossing a port is a Quantity envelope. A raw number
// lives only transiently inside `.value` during Q-algebra.
import type { SymUnit } from './units.js';
import type { Boundary } from './boundary.js';
import type { ProvRef } from './provenance.js';

export interface Quantity {
  readonly value: number; // IEEE float, matches the bespoke engine (no Decimal)
  readonly unit: SymUnit;
  readonly boundary: Boundary;
  readonly provenance: ProvRef;
}

/** The only constructor. Freezes the envelope so it is immutable and comparable. */
export function q(value: number, unit: SymUnit, boundary: Boundary, provenance: ProvRef): Quantity {
  return Object.freeze({ value, unit, boundary, provenance });
}

/** Run-time guard at port ingress: a bare number cannot pose as a Quantity. */
export function isQuantity(x: unknown): x is Quantity {
  return (
    typeof x === 'object' &&
    x !== null &&
    'value' in x &&
    'unit' in x &&
    'boundary' in x &&
    'provenance' in x
  );
}
