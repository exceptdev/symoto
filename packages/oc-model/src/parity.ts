// The shared parity contract, promoted into the published @symoto/oc-model surface so the
// in-repo adapter-parity test and the downstream Vizapp parity gate measure against ONE source
// of truth: one scenario grid, one comparator, one per-readout epsilon policy, and one
// named-deviation registry. The Phase 3 test-only files (__tests__/parity/{grid,harness}.ts)
// now re-export from here, so nothing drifts.
//
// This module is pure (no Node or DOM APIs) so it ships in the published package. The
// golden-master fixture loader (which uses node:fs) stays test-only in __tests__/parity/harness.ts.
//
// The epsilon policy is per readout, not one global number (see Phase 3 03-RESEARCH.md):
//   - continuous real readouts: relative epsilon 1e-9 (|a-b| <= eps*max(1,|b|)).
//   - integer/boolean readouts (turbine counts, windCapped): exact match.
//   - display-rounded readouts (divertedFromLandfillPct): exact after a stated rounding.
// Any readout that cannot meet its policy must be a named, rationalized deviation here, never
// a quiet loosening of the global epsilon.

// --- The canonical parity grid (Phase 3, MODEL-02) ------------------------------------------

export type OcCountry = 'Netherlands' | 'Vietnam' | 'Brazil';
export type OcEnergyScenario = 'Wind/Solar' | 'Wind' | 'Solar';
export type OcDiet = 'omnivore' | 'flexitarian' | 'vegetarian' | 'vegan';
export type OcTurbineClass = 'small' | 'medium' | 'large';

/** Scenario inputs, structurally compatible with the bespoke SimInputs. */
export interface OcInputs {
  population: number;
  country: OcCountry;
  energySelfSufficiency?: number;
  energyScenario?: OcEnergyScenario;
  foodScenario?: string;
  foodSelfSufficiency?: number;
  dietaryPreference?: OcDiet;
  productionFocus?: number;
  waterSelfSufficiency?: number;
  economicSelfSufficiency?: number;
  turbineClass?: OcTurbineClass;
  regenerativeAgriculture?: boolean;
}

export interface ParityScenario {
  readonly id: string;
  readonly inputs: OcInputs;
}

const POPULATIONS = [0, 1000, 50_000, 250_000, 1_000_000];
const COUNTRIES: OcCountry[] = ['Netherlands', 'Vietnam', 'Brazil'];
const ENERGY_SCENARIOS: OcEnergyScenario[] = ['Wind/Solar', 'Wind', 'Solar'];
const DIETS: OcDiet[] = ['omnivore', 'flexitarian', 'vegetarian', 'vegan'];
const TURBINE_CLASSES: OcTurbineClass[] = ['small', 'medium', 'large'];
const SELF_SUFFICIENCY_LEVELS = [0, 0.5, 1.0, 1.5];

function buildGrid(): ParityScenario[] {
  const scenarios: ParityScenario[] = [];

  // Base grid: population x country x energy scenario (5 x 3 x 3 = 45).
  for (const population of POPULATIONS) {
    for (const country of COUNTRIES) {
      for (const energyScenario of ENERGY_SCENARIOS) {
        scenarios.push({
          id: `base|pop=${population}|${country}|${energyScenario}`,
          inputs: { population, country, energyScenario },
        });
      }
    }
  }

  // Targeted selector sweep at the NL 50,000 baseline.
  const base = { population: 50_000, country: 'Netherlands' as OcCountry };

  for (const level of SELF_SUFFICIENCY_LEVELS) {
    scenarios.push({ id: `sweep|energySS=${level}`, inputs: { ...base, energySelfSufficiency: level } });
    scenarios.push({ id: `sweep|foodSS=${level}`, inputs: { ...base, foodSelfSufficiency: level } });
    scenarios.push({ id: `sweep|waterSS=${level}`, inputs: { ...base, waterSelfSufficiency: level } });
    scenarios.push({ id: `sweep|econSS=${level}`, inputs: { ...base, economicSelfSufficiency: level } });
  }

  for (const dietaryPreference of DIETS) {
    scenarios.push({ id: `sweep|diet=${dietaryPreference}`, inputs: { ...base, dietaryPreference } });
  }

  for (const productionFocus of [0, 1]) {
    scenarios.push({ id: `sweep|productionFocus=${productionFocus}`, inputs: { ...base, productionFocus } });
  }

  for (const turbineClass of TURBINE_CLASSES) {
    scenarios.push({ id: `sweep|turbine=${turbineClass}`, inputs: { ...base, turbineClass } });
  }

  for (const regenerativeAgriculture of [true, false]) {
    scenarios.push({
      id: `sweep|regen=${regenerativeAgriculture}`,
      inputs: { ...base, regenerativeAgriculture },
    });
  }

  for (const foodScenario of ['regenerative', 'conventional']) {
    scenarios.push({ id: `sweep|foodScenario=${foodScenario}`, inputs: { ...base, foodScenario } });
  }

  return scenarios;
}

export const PARITY_GRID: readonly ParityScenario[] = Object.freeze(buildGrid());

// --- The per-readout epsilon policy and comparator ------------------------------------------

/** Default relative epsilon for continuous real readouts. */
export const DEFAULT_EPSILON = 1e-9;

/** Per-readout comparison policy. */
export type Policy = 'continuous' | 'exact' | { readonly kind: 'rounded'; readonly decimals: number };

export interface CompareResult {
  readonly name: string;
  readonly pass: boolean;
  readonly actual: number | boolean;
  readonly golden: number | boolean;
  readonly relError: number;
  readonly policy: Policy;
}

/**
 * Per-readout policy map. Readouts not listed default to continuous-1e-9. Integer and
 * boolean readouts that must match the bespoke discretization exactly are marked 'exact';
 * the one display-rounded readout uses the 'rounded' policy at its stated precision.
 */
export const PARITY_POLICY: Readonly<Record<string, Policy>> = Object.freeze({
  turbineCount: 'exact',
  maxTurbines: 'exact',
  windTurbines: 'exact',
  windCapped: 'exact',
  divertedFromLandfillPct: { kind: 'rounded', decimals: 1 } as const,
});

/** A named, intentional deviation from the per-readout policy, with its rationale. */
export interface NamedDeviation {
  readonly readout: string;
  readonly tolerance: string;
  readonly rationale: string;
}

/**
 * Registry of intentional deviations. Seeded with the biodiversity scope deviation
 * (biodiversity is outside the computeScenario / ScenarioResult boundary the parity is
 * measured over; see 03-RESEARCH.md). Later plans append to this only when a readout
 * genuinely cannot meet its policy, with a numeric tolerance and a one-line rationale.
 */
export const NAMED_DEVIATIONS: readonly NamedDeviation[] = Object.freeze([
  {
    readout: 'biodiversity',
    tolerance: 'out-of-scope (no readout)',
    rationale:
      'Biodiversity is not a domain of computeScenario / ScenarioResult (it lives only in the older engine path that the Vizapp swap target does not consume). Parity is measured over the eight ScenarioResult domains; biodiversity is an intentional documented deferred deviation, not a silent omission.',
  },
]);

/** True when the named-deviation registry covers this readout. */
export function isNamedDeviation(readout: string): boolean {
  return NAMED_DEVIATIONS.some((d) => d.readout === readout);
}

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Compare one readout value against its golden number under the resolved policy.
 *
 * The continuous comparator is RELATIVE: |a - b| <= eps * max(1, |b|), which is meaningful
 * across the wide magnitude range of OC readouts (a few percent up to billions of USD),
 * unlike toBeCloseTo's absolute decimal places. Exact and rounded policies use strict
 * equality (after rounding) so integer discretization and display rounding match the bespoke
 * engine to the bit.
 */
export function compareReadout(
  name: string,
  actual: number | boolean,
  golden: number | boolean,
  policy: Policy = PARITY_POLICY[name] ?? 'continuous',
): CompareResult {
  if (policy === 'exact') {
    const pass = actual === golden;
    return { name, pass, actual, golden, relError: pass ? 0 : Number.POSITIVE_INFINITY, policy };
  }

  if (typeof policy === 'object' && policy.kind === 'rounded') {
    const a = roundTo(Number(actual), policy.decimals);
    const b = roundTo(Number(golden), policy.decimals);
    const pass = a === b;
    return { name, pass, actual, golden, relError: pass ? 0 : Number.POSITIVE_INFINITY, policy };
  }

  // continuous: relative epsilon.
  const a = Number(actual);
  const b = Number(golden);
  const relError = Math.abs(a - b) / Math.max(1, Math.abs(b));
  return { name, pass: relError <= DEFAULT_EPSILON, actual, golden, relError, policy };
}
