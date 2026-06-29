// Locale wiring for the OC model (LOC-01 application). The country selector becomes a first-class
// ISO locale that the production run threads through every readout boundary. The codes are the ISO
// codes the core property-test arbitraries already anticipate (NL, VN, BR).
//
// runOc is the single locale-bearing run helper: it runs the OC graph with
// { locale: localeOf(inputs.country) }, so every OC readout boundary carries the country's locale.
// It changes no readout value (the locale stamp is additive boundary metadata, LOC-01), so the
// Phase 3/4 parity gates stay green.
import { run, type RunResult } from '@symoto/core';
import { buildOcModel } from './model.js';
import type { Country } from './config.js';
import type { SimInputs } from './types.js';

const COUNTRY_TO_ISO: Record<Country, string> = {
  Netherlands: 'NL',
  Vietnam: 'VN',
  Brazil: 'BR',
};

/** Map the country selector to its ISO locale code (total over Country). */
export function localeOf(country: Country): string {
  return COUNTRY_TO_ISO[country];
}

/** Run the OC graph for a scenario with the country's ISO locale stamped onto every readout. */
export function runOc(inputs: SimInputs): RunResult {
  return run(buildOcModel(inputs), {}, { locale: localeOf(inputs.country) });
}
