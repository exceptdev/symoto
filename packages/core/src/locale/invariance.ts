// Invariance flagging (LOC-02): the generic, pure primitive that flags a coefficient which stays
// constant across the locale dimension when it is not declared deliberately global. "Constant where
// it should vary" becomes a first-class, testable engine concept.
//
// A LocaleDescriptor declares one coefficient with a resolver across locales and an explicit opt-out.
// flagInvariance resolves every descriptor at every locale and flags any that resolve to the same
// finite value across all of them, unless the descriptor is declared localeInvariant: true. The
// opt-out is the ONLY silencer for a genuine invariance, and it requires a reason at the application
// layer (the OC manifest and its coverage guard enforce that, Plan 04). This module is pure: it reads
// descriptors and returns flags, mutating nothing and changing no coefficient or readout, so it never
// perturbs the model and parity is untouched (D6-3, D6-4).

/**
 * One coefficient's locale behavior. `resolve(locale)` returns the coefficient's value for that
 * locale, or `null` when there is no value for it (insufficient data is not an invariance claim).
 * `localeInvariant: true` is the deliberate, reasoned opt-out: a descriptor so declared is never
 * flagged, even when it resolves identically across locales.
 */
export interface LocaleDescriptor {
  readonly id: string;
  readonly localeInvariant?: boolean;
  readonly reason?: string;
  resolve(locale: string): number | null;
}

/** One emitted flag: a coefficient that is constant across the locales but not declared invariant. */
export interface InvarianceFlag {
  readonly id: string;
  readonly value: number;
  readonly locales: readonly string[];
  readonly message: string;
}

/**
 * Flag every descriptor that resolves to the same finite value across all `locales` and is not
 * declared `localeInvariant: true`. A descriptor is NOT flagged when:
 *   - it is declared `localeInvariant: true` (the explicit opt-out), or
 *   - any resolved value is `null` or not finite (insufficient data), or
 *   - the resolved values are not all strictly equal across the locales (it genuinely varies).
 * Pure: never throws, never mutates its inputs, and returns a (possibly empty) array.
 */
export function flagInvariance(
  descriptors: readonly LocaleDescriptor[],
  locales: readonly string[],
): InvarianceFlag[] {
  const flags: InvarianceFlag[] = [];
  for (const descriptor of descriptors) {
    if (descriptor.localeInvariant === true) continue;
    const resolved = locales.map((locale) => descriptor.resolve(locale));
    if (resolved.some((v) => v === null || !Number.isFinite(v))) continue;
    const values = resolved as number[];
    const first = values[0];
    if (first === undefined) continue;
    const allEqual = values.every((v) => v === first);
    if (!allEqual) continue;
    flags.push({
      id: descriptor.id,
      value: first,
      locales,
      message: `coefficient '${descriptor.id}' is constant (${first}) across locales ${locales.join(', ')} but is not declared localeInvariant`,
    });
  }
  return flags;
}
