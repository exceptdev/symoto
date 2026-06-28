// The differentiator no units library has: a value carries its system boundary,
// and two values that differ in any boundary dimension refuse to net.
export type Accounting = 'territorial' | 'consumption' | 'production';
export type Basis = 'absolute' | 'per-capita' | 'per-area' | 'intensive';
export type Temporal = 'flow' | 'stock';

/** Fixed, typed core (D-05) plus an open extension hatch. */
export interface Boundary {
  readonly accounting: Accounting;
  readonly basis: Basis;
  readonly temporal: Temporal;
  readonly locale?: string; // ISO country/region
  readonly custom?: Readonly<Record<string, string>>; // the hatch (D-05)
}

export class BoundaryViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BoundaryViolation';
  }
}

/**
 * Deep equality across the fixed core AND every custom dimension (D-06).
 * An absent custom map is treated as the empty map, never a wildcard, so the
 * extension hatch can never become a silent refuse-to-net bypass.
 */
export function boundariesEqual(a: Boundary, b: Boundary): boolean {
  if (
    a.accounting !== b.accounting ||
    a.basis !== b.basis ||
    a.temporal !== b.temporal ||
    (a.locale ?? '') !== (b.locale ?? '')
  ) {
    return false;
  }
  const ca = a.custom ?? {};
  const cb = b.custom ?? {};
  const ka = Object.keys(ca).sort();
  const kb = Object.keys(cb).sort();
  if (ka.length !== kb.length) return false;
  if (ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => ca[k] === cb[k]);
}

function describeMismatch(a: Boundary, b: Boundary): string {
  return (
    'Boundary mismatch (refuse to net): ' +
    JSON.stringify({ accounting: a.accounting, basis: a.basis, temporal: a.temporal, locale: a.locale, custom: a.custom }) +
    ' vs ' +
    JSON.stringify({ accounting: b.accounting, basis: b.basis, temporal: b.temporal, locale: b.locale, custom: b.custom })
  );
}

export function assertSameBoundary(a: Boundary, b: Boundary): void {
  if (!boundariesEqual(a, b)) throw new BoundaryViolation(describeMismatch(a, b));
}

/** Phase 1: compatible means equal. Phase 2 widens this with the adapter catalogue. */
export const boundariesCompatible = boundariesEqual;
