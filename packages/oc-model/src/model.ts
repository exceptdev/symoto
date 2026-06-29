// buildOcModel: the OC settlement model as one Symoto graph. Plan 02 wires the land<->energy
// cyclic core (resolved by the core fixed-point evaluator in exactly two passes, matching the
// bespoke two-pass computeScenario). Plan 06 extends this to add the acyclic downstream suffix
// (water, food, waste, emissions, jobs, cost).
import { buildGraph, type Graph, type Node, type Connection } from '@symoto/core';
import type { SimInputs } from './types.js';
import { makeLandNode } from './nodes/land.js';
import { makeEnergyNode } from './nodes/energy.js';

/** The land<->energy cyclic-core connections (shared by the core and the full assembly). */
export const CORE_CONNECTIONS: readonly Connection[] = Object.freeze([
  { from: { nodeId: 'n1-land', portId: 'landUse.housingUnits' }, to: { nodeId: 'n2-energy', portId: 'energy.housingUnitsIn' } },
  { from: { nodeId: 'n1-land', portId: 'landUse.eligibleWindBaseLandM2' }, to: { nodeId: 'n2-energy', portId: 'energy.eligibleWindBaseLandM2In' } },
  { from: { nodeId: 'n2-energy', portId: 'energy.energyGenerationLandM2' }, to: { nodeId: 'n1-land', portId: 'landUse.energyGenerationLandM2In' } },
]);

/**
 * Build the OC model graph for a scenario. The non-numeric selectors (country, energy/food
 * scenario, diet, turbine class, regen flag) are closed over by the node factories, since
 * run() inputs are numeric Quantities. Run with run(graph, {}).
 */
export function buildOcModel(inputs: SimInputs): Graph {
  const nodes: Node[] = [makeLandNode(inputs), makeEnergyNode(inputs)];
  return buildGraph(nodes, [...CORE_CONNECTIONS]);
}
