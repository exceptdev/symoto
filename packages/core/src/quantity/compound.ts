// Honest aggregation (PROV-02). A compound readout bundles a derived net with the gross components
// it was combined from, each tagged with a named boundary role. The compound() builder refuses to
// construct a net with no gross components, so a lone netted headline (the dishonest "single net
// number" pattern) cannot be produced: honest by default is a hard guard, not a convention.
import type { Quantity } from './quantity.js';

export type ComponentRole = 'gross-in' | 'gross-out' | 'net' | 'component';

export interface CompoundComponent {
  readonly role: ComponentRole;
  readonly key: string;
  readonly quantity: Quantity;
}

export interface CompoundReadout {
  readonly key: string;
  readonly net: Quantity;
  readonly components: readonly CompoundComponent[];
}

/**
 * Build a CompoundReadout. Throws when `components` contains no gross component (gross-in, gross-out,
 * or component) -- a net with only net-role components, or an empty list, is a lone netted headline,
 * the exact dishonesty PROV-02 forbids. The returned object is frozen and preserves every Quantity
 * value exactly (it reads, never recomputes).
 */
export function compound(
  key: string,
  net: Quantity,
  components: readonly CompoundComponent[],
): CompoundReadout {
  const hasGross = components.some((c) => c.role !== 'net');
  if (!hasGross) {
    throw new Error(
      `Compound readout "${key}" must expose its gross components, not a lone net. ` +
        'A net with no gross-in, gross-out, or component is the dishonest single-netted-number pattern PROV-02 forbids (honest by default).',
    );
  }
  return Object.freeze({ key, net, components: Object.freeze([...components]) });
}

/** Return the first component with the given role, or undefined. */
export function componentByRole(c: CompoundReadout, role: ComponentRole): CompoundComponent | undefined {
  return c.components.find((comp) => comp.role === role);
}
