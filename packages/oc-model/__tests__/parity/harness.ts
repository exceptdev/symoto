// The parity contract for Phase 3 (MODEL-02): a per-readout epsilon policy, a relative
// comparator, the canonical grid (re-exported from grid.ts), a named-deviation registry,
// and a loader for the committed golden-master fixture. Every Wave 2-4 parity test measures
// against this single source so the epsilon policy and the grid never drift.
//
// The epsilon policy is per readout, not one global number (see 03-RESEARCH.md):
//   - continuous real readouts: relative epsilon 1e-9 (|a-b| <= eps*max(1,|b|)).
//   - integer/boolean readouts (turbine counts, windCapped): exact match.
//   - display-rounded readouts (divertedFromLandfillPct): exact after a stated rounding.
// Any readout that cannot meet its policy must be a named, rationalized deviation here, never
// a quiet loosening of the global epsilon.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PARITY_GRID, type ParityScenario, type OcInputs } from './grid.js';

export { PARITY_GRID };
export type { ParityScenario, OcInputs };

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

// --- Golden-master fixture loader (test-only; oc-model may use Node APIs) ---

export interface GoldenScenario {
  readonly id: string;
  readonly inputs: OcInputs;
  // The full bespoke ScenarioResult (eight domains + the echoed inputs).
  readonly result: Record<string, unknown>;
}

export interface GoldenMaster {
  readonly provenance: {
    readonly vizappHead: string;
    readonly coefficientsCommit: string;
    readonly xlsxPath: string;
    readonly baselinePopulation: number;
    readonly gridSize: number;
    readonly [k: string]: unknown;
  };
  readonly scenarios: readonly GoldenScenario[];
}

let cached: GoldenMaster | null = null;

/** Read and parse the committed golden-master fixture (cached after first read). */
export function loadGoldenMaster(): GoldenMaster {
  if (cached) return cached;
  const here = dirname(fileURLToPath(import.meta.url));
  const fixturePath = resolve(here, '../fixtures/golden-master.json');
  cached = JSON.parse(readFileSync(fixturePath, 'utf8')) as GoldenMaster;
  return cached;
}

/** Map golden scenarios by id for quick per-scenario lookup in domain tests. */
export function goldenById(): Map<string, GoldenScenario> {
  const m = new Map<string, GoldenScenario>();
  for (const s of loadGoldenMaster().scenarios) m.set(s.id, s);
  return m;
}
