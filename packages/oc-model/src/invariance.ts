// Apply the invariance flagger to the OC model (LOC-02 application). flagOcInvariance runs the OC
// locale manifest (OC_LOCALE_COEFFICIENTS) through the core flagInvariance primitive across the three
// OC locales (NL, VN, BR, derived from COUNTRIES via localeOf), and returns the flags. By default it
// flags the historical NL-applied-everywhere case (the per-capita energy demand figures and the
// per-dwelling roof area) and produces zero false positives, because every genuinely-global physical
// constant and deliberate proxy is silenced by its localeInvariant: true declaration. It reads the
// manifest only, changes no coefficient or readout, and never throws, so parity is untouched (D6-4).
import { flagInvariance, type InvarianceFlag } from '@symoto/core';
import { OC_LOCALE_COEFFICIENTS } from './localeCoefficients.js';
import { localeOf } from './locale.js';
import { COUNTRIES } from './config.js';

/** The three OC locale ids, derived from the country list via localeOf (NL, VN, BR). */
const OC_LOCALES: readonly string[] = COUNTRIES.map(localeOf);

/** Flag every OC coefficient that is constant across NL/VN/BR but not declared localeInvariant. */
export function flagOcInvariance(): InvarianceFlag[] {
  return flagInvariance(OC_LOCALE_COEFFICIENTS, OC_LOCALES);
}
