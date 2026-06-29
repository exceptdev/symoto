// One-off golden-master capture (Phase 3, MODEL-02). This is a dev/build tool, NOT
// shipped engine code, so it MAY use Node APIs (node:fs, node:child_process). It imports
// the bespoke Orchid City engine from its on-disk pinned working tree, runs computeScenario
// over the canonical PARITY_GRID, and serializes the full ScenarioResult per scenario into a
// committed JSON fixture with a reproducible provenance header.
//
// Run with: pnpm --filter @symoto/oc-model exec tsx scripts/capture-golden-master.ts
//
// The captured fixture is what every Phase-3 parity test measures against, so the Symoto
// model can be checked WITHOUT the bespoke repo present at test time.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
// The bespoke engine, imported from its pinned on-disk working tree (not typechecked here:
// scripts/ is excluded from the oc-model tsconfig include set).
import { computeScenario, COEFFICIENTS } from '../../../../orchid-city/vizapp/src/sim/index.js';
import type { SimInputs } from '../../../../orchid-city/vizapp/src/sim/index.js';
import { PARITY_GRID } from '../__tests__/parity/grid.js';

const VIZAPP_REPO = '/opt/claude-home/projects/orchid-city/vizapp';
const XLSX_PATH = 'data/spreadsheets/dev-model.xlsx';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(here, '../__tests__/fixtures');
const fixturePath = resolve(fixtureDir, 'golden-master.json');

function gitCapture(args: string): string {
  return execSync(`git -C ${VIZAPP_REPO} ${args}`, { encoding: 'utf8' }).trim();
}

const vizappHead = gitCapture('rev-parse HEAD');
const coefficientsCommit = gitCapture('log -1 --format=%H -- src/sim/coefficients.generated.ts');

const scenarios = PARITY_GRID.map((s) => ({
  id: s.id,
  inputs: s.inputs,
  result: computeScenario(s.inputs as SimInputs, COEFFICIENTS),
}));

const fixture = {
  provenance: {
    description:
      'Golden master captured from the bespoke Orchid City computeScenario, pinned for Symoto Phase-3 parity (MODEL-02).',
    vizappHead,
    coefficientsCommit,
    xlsxPath: XLSX_PATH,
    baselinePopulation: COEFFICIENTS.meta.baselinePopulation,
    countries: COEFFICIENTS.meta.countries,
    capturedAt: new Date().toISOString(),
    gridSize: scenarios.length,
  },
  scenarios,
};

mkdirSync(fixtureDir, { recursive: true });
writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + '\n', 'utf8');

console.log(
  `Captured ${scenarios.length} scenarios to ${fixturePath} ` +
    `(vizapp ${vizappHead.slice(0, 7)}, coefficients ${coefficientsCommit.slice(0, 7)}).`,
);
