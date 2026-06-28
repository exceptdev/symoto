// The ONLY module that imports mathjs. mathjs validates units, compares dimensions,
// converts, and composes; a live mathjs Unit is NEVER stored on a Quantity. What
// escapes is the plain, serializable, immutable SymUnit descriptor.
import { create, all } from 'mathjs';

const math = create(all!, {});

// Curated count units the OC slice needs (mathjs has no "dwelling" or "person").
// Declaring them as base units makes "person" and "dwelling" distinct dimensions
// that refuse to net with each other or with anything else.
math.createUnit('person');
math.createUnit('dwelling');

/** A plain, serializable, immutable unit descriptor. No mathjs object escapes. */
export interface SymUnit {
  readonly canonical: string; // e.g. "MWh", "m^2", "dwelling"
  readonly dimension: string; // stable dimension signature, derived once via mathjs
}

export class DimensionMismatch extends Error {
  constructor(from: SymUnit, to: SymUnit) {
    super(
      `Dimension mismatch: ${from.canonical} (${from.dimension}) is not the same dimension as ${to.canonical} (${to.dimension}).`,
    );
    this.name = 'DimensionMismatch';
  }
}

/** Stable dimension key from a mathjs unit's base-dimension exponent vector. */
function dimensionKey(u: { dimensions?: readonly number[] }): string {
  const dims = u.dimensions ?? [];
  return JSON.stringify(dims);
}

/** Parse and validate a unit canonical; throws on an unknown unit (fail loud). */
export function unit(canonical: string): SymUnit {
  const u = math.unit(1, canonical) as unknown as { dimensions?: readonly number[] };
  return Object.freeze({ canonical, dimension: dimensionKey(u) });
}

export function sameDimension(a: SymUnit, b: SymUnit): boolean {
  return a.dimension === b.dimension;
}

/** Scalar conversion factor a -> b within one dimension; throws if dimensions differ. */
export function convertValue(value: number, from: SymUnit, to: SymUnit): number {
  if (!sameDimension(from, to)) throw new DimensionMismatch(from, to);
  return math.unit(value, from.canonical).toNumber(to.canonical);
}

/** Compose units multiplicatively, capturing the real composed dimension. */
export function composeMul(a: SymUnit, b: SymUnit): SymUnit {
  const r = math.unit(1, a.canonical).multiply(math.unit(1, b.canonical)) as unknown as {
    dimensions?: readonly number[];
  };
  return Object.freeze({ canonical: `${a.canonical}*${b.canonical}`, dimension: dimensionKey(r) });
}

/** Compose units divisively, capturing the real composed dimension. */
export function composeDiv(a: SymUnit, b: SymUnit): SymUnit {
  const r = math.unit(1, a.canonical).divide(math.unit(1, b.canonical)) as unknown as {
    dimensions?: readonly number[];
  };
  return Object.freeze({ canonical: `${a.canonical}/(${b.canonical})`, dimension: dimensionKey(r) });
}
