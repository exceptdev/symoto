// Shared fast-check arbitraries for the Quantity types.
// Plan 02 Task 1 adds arbSymUnit and arbBoundary; Task 2 extends with arbProvRef and arbQuantity.
import fc from 'fast-check';
import { unit, type SymUnit } from '../src/quantity/units.js';
import type { Boundary, Accounting, Basis, Temporal } from '../src/quantity/boundary.js';

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
