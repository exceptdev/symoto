// The parity contract for Phase 3 (MODEL-02). The pure definitions (grid, comparator, epsilon
// policy, named-deviation registry) now live in the published surface src/parity.ts so the
// in-repo tests and the downstream Vizapp parity gate share one source of truth. This file
// re-exports them and keeps the test-only golden-master fixture loader (which uses node:fs and
// must stay out of the published package).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export {
  PARITY_GRID,
  DEFAULT_EPSILON,
  PARITY_POLICY,
  NAMED_DEVIATIONS,
  isNamedDeviation,
  compareReadout,
} from '../../src/parity.js';
export type {
  ParityScenario,
  OcInputs,
  Policy,
  CompareResult,
  NamedDeviation,
} from '../../src/parity.js';

import type { OcInputs } from '../../src/parity.js';

// --- Golden-master fixture loader (test-only; oc-model tests may use Node APIs) ---

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
