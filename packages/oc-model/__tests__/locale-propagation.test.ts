import { describe, it, expect } from 'vitest';
import { run } from '@symoto/core';
import { buildOcModel } from '../src/model.js';
import { localeOf, runOc } from '../src/locale.js';
import type { Country } from '../src/config.js';
import type { SimInputs } from '../src/types.js';

// LOC-01 (OC half): running the OC model across NL/VN/BR stamps the matching ISO locale on every
// readout boundary, a locale-varying readout genuinely differs across the three countries (proving
// locale is consumed, not just stamped), and routing through the locale-bearing run changes no
// readout value (the Phase 3/4 parity gates stay green).

const COUNTRIES: Country[] = ['Netherlands', 'Vietnam', 'Brazil'];
const POPULATION = 50_000;

function inputsFor(country: Country): SimInputs {
  return { population: POPULATION, country };
}

describe('OC locale propagation (LOC-01)', () => {
  it('stamps the matching ISO locale on every readout boundary, per country', () => {
    for (const country of COUNTRIES) {
      const iso = localeOf(country);
      const { readouts } = runOc(inputsFor(country));
      const keys = Object.keys(readouts);
      expect(keys.length).toBeGreaterThan(0);
      for (const k of keys) {
        expect(readouts[k]?.boundary.locale, `${country}/${k} locale`).toBe(iso);
      }
    }
  });

  it('a locale-varying readout genuinely differs across NL/VN/BR (locale is consumed)', () => {
    // energy.totalSupplyMwh draws on the per-country pvYieldKwhPerKwp and turbineYieldMwh triples.
    const values = COUNTRIES.map((country) => runOc(inputsFor(country)).readouts['energy.totalSupplyMwh']?.value);
    for (const v of values) expect(typeof v).toBe('number');
    const unique = new Set(values);
    expect(unique.size, `energy.totalSupplyMwh per country: ${values.join(', ')}`).toBe(COUNTRIES.length);
  });

  it('routing through the locale-bearing run changes no readout value (parity preserved)', () => {
    for (const country of COUNTRIES) {
      const inputs = inputsFor(country);
      const localized = runOc(inputs).readouts;
      const plain = run(buildOcModel(inputs), {}).readouts;
      const keys = Object.keys(plain);
      expect(Object.keys(localized).sort()).toEqual(keys.sort());
      for (const k of keys) {
        expect(localized[k]?.value, `${country}/${k} value`).toBe(plain[k]?.value);
      }
    }
  });

  it('localeOf maps each country to its ISO code', () => {
    expect(localeOf('Netherlands')).toBe('NL');
    expect(localeOf('Vietnam')).toBe('VN');
    expect(localeOf('Brazil')).toBe('BR');
  });
});
