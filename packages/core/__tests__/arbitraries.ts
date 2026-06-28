// Shared fast-check arbitraries for the Quantity types.
import fc from 'fast-check';
import { unit, type SymUnit } from '../src/quantity/units.js';
import type { Boundary, Accounting, Basis, Temporal } from '../src/quantity/boundary.js';
import type { ProvRef } from '../src/quantity/provenance.js';
import { input } from '../src/quantity/provenance.js';
import { q, type Quantity } from '../src/quantity/quantity.js';

const UNIT_NAMES = ['MWh', 'kWh', 'm^2', 'person', 'dwelling'] as const;
const ACCOUNTING: readonly Accounting[] = ['territorial', 'consumption', 'production'];
const BASIS: readonly Basis[] = ['absolute', 'per-capita', 'per-area', 'intensive'];
const TEMPORAL: readonly Temporal[] = ['flow', 'stock'];

export const arbSymUnit: fc.Arbitrary<SymUnit> = fc
  .constantFrom(...UNIT_NAMES)
  .map((name) => unit(name));

const arbCustom: fc.Arbitrary<Record<string, string> | undefined> = fc.option(
  fc.dictionary(
    fc.constantFrom('scope', 'method', 'segment'),
    fc.constantFrom('A', 'B', 'C'),
    { maxKeys: 2 },
  ),
  { nil: undefined },
);

export const arbBoundary: fc.Arbitrary<Boundary> = fc
  .record({
    accounting: fc.constantFrom(...ACCOUNTING),
    basis: fc.constantFrom(...BASIS),
    temporal: fc.constantFrom(...TEMPORAL),
    locale: fc.option(fc.constantFrom('NL', 'VN', 'BR'), { nil: undefined }),
    custom: arbCustom,
  })
  .map((b) => {
    // Drop undefined optional fields so equality treats absent as absent.
    const out: Boundary = {
      accounting: b.accounting,
      basis: b.basis,
      temporal: b.temporal,
      ...(b.locale !== undefined ? { locale: b.locale } : {}),
      ...(b.custom !== undefined ? { custom: b.custom } : {}),
    };
    return out;
  });

export const arbProvRef: fc.Arbitrary<ProvRef> = fc
  .string({ minLength: 1, maxLength: 6 })
  .map((s) => input(s));

export const arbQuantity: fc.Arbitrary<Quantity> = fc
  .record({
    value: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
    unit: arbSymUnit,
    boundary: arbBoundary,
    provenance: arbProvRef,
  })
  .map(({ value, unit: u, boundary, provenance }) => q(value, u, boundary, provenance));
