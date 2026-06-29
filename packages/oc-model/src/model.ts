// buildOcModel: the OC settlement model as one Symoto graph. Plan 02 wires the land<->energy
// cyclic core (resolved by the core fixed-point evaluator in exactly two passes, matching the
// bespoke two-pass computeScenario). Plan 06 extends this to add the acyclic downstream suffix
// (water, food, waste, emissions, jobs, cost).
import { buildGraph, type Graph, type Node, type Connection } from '@symoto/core';
import type { SimInputs } from './types.js';
import { makeLandNode } from './nodes/land.js';
import { makeEnergyNode } from './nodes/energy.js';
import { makeWaterNode } from './nodes/water.js';
import { makeWasteNode } from './nodes/waste.js';
import { makeJobsNode } from './nodes/jobs.js';
import { makeFoodNode } from './nodes/food.js';
import { makeCostNode } from './nodes/cost.js';
import { makeEmissionsNode } from './nodes/emissions.js';

/** The land<->energy cyclic-core connections (shared by the core and the full assembly). */
export const CORE_CONNECTIONS: readonly Connection[] = Object.freeze([
  { from: { nodeId: 'n1-land', portId: 'landUse.housingUnits' }, to: { nodeId: 'n2-energy', portId: 'energy.housingUnitsIn' } },
  { from: { nodeId: 'n1-land', portId: 'landUse.eligibleWindBaseLandM2' }, to: { nodeId: 'n2-energy', portId: 'energy.eligibleWindBaseLandM2In' } },
  { from: { nodeId: 'n2-energy', portId: 'energy.energyGenerationLandM2' }, to: { nodeId: 'n1-land', portId: 'landUse.energyGenerationLandM2In' } },
]);

/**
 * The acyclic downstream suffix: each domain consumes the closed-land driver
 * (energyGenerationLandM2) and recomputes the closed land use; emissions also reads the energy
 * fossil-backfill and curtailment flows. This mirrors the bespoke computeScenario composition,
 * where water/food/waste/emissions/jobs/cost each consume the closed land + energy result and
 * do not couple to each other.
 */
const SUFFIX_CONNECTIONS: readonly Connection[] = Object.freeze([
  { from: { nodeId: 'n2-energy', portId: 'energy.energyGenerationLandM2' }, to: { nodeId: 'n3-water', portId: 'water.energyGenerationLandM2In' } },
  { from: { nodeId: 'n2-energy', portId: 'energy.energyGenerationLandM2' }, to: { nodeId: 'n4-waste', portId: 'waste.energyGenerationLandM2In' } },
  { from: { nodeId: 'n2-energy', portId: 'energy.energyGenerationLandM2' }, to: { nodeId: 'n5-jobs', portId: 'jobs.energyGenerationLandM2In' } },
  { from: { nodeId: 'n2-energy', portId: 'energy.energyGenerationLandM2' }, to: { nodeId: 'n6-food', portId: 'food.energyGenerationLandM2In' } },
  { from: { nodeId: 'n2-energy', portId: 'energy.energyGenerationLandM2' }, to: { nodeId: 'n7-cost', portId: 'cost.energyGenerationLandM2In' } },
  { from: { nodeId: 'n2-energy', portId: 'energy.energyGenerationLandM2' }, to: { nodeId: 'n8-emissions', portId: 'emissions.energyGenerationLandM2In' } },
  { from: { nodeId: 'n2-energy', portId: 'energy.fossilBackfillMwh' }, to: { nodeId: 'n8-emissions', portId: 'emissions.fossilBackfillMwhIn' } },
  { from: { nodeId: 'n2-energy', portId: 'energy.curtailmentMwh' }, to: { nodeId: 'n8-emissions', portId: 'emissions.curtailmentMwhIn' } },
]);

/**
 * Build the full OC model graph for a scenario: the land<->energy cyclic core plus the eight
 * domain nodes wired into one graph. The non-numeric selectors (country, energy/food scenario,
 * diet, turbine class, regen flag) are closed over by the node factories, since run() inputs are
 * numeric Quantities. Run with run(graph, {}).
 */
export function buildOcModel(inputs: SimInputs): Graph {
  const nodes: Node[] = [
    makeLandNode(inputs),
    makeEnergyNode(inputs),
    makeWaterNode(inputs),
    makeWasteNode(inputs),
    makeJobsNode(inputs),
    makeFoodNode(inputs),
    makeCostNode(inputs),
    makeEmissionsNode(inputs),
  ];
  return buildGraph(nodes, [...CORE_CONNECTIONS, ...SUFFIX_CONNECTIONS]);
}
