// The deterministic evaluator orchestrator. Build the graph once, run many times:
// run(graph, inputs) evaluates the acyclic prefix in topo order, resolves any cyclic
// region by seeded fixed-point iteration, evaluates the acyclic suffix, and collects the
// readout-node outputs.
import type { Graph } from '../graph/graph.js';
import type { QMap } from '../graph/node.js';
import { makeRunContext } from '../run/context.js';
import { kahnTopoSort } from './topo.js';
import { resolveFixedPoint } from './fixedpoint.js';
import { evaluateNode, zeroFromPort } from './nodeEval.js';

export interface RunResult {
  readonly readouts: QMap;
}

function collectReadouts(graph: Graph, values: Map<string, QMap>): QMap {
  const readouts: QMap = {};
  const readoutNodes = graph.nodes
    .filter((n) => n.kind === 'readout')
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const node of readoutNodes) {
    const out = values.get(node.id) ?? {};
    for (const key of Object.keys(out).sort()) {
      const v = out[key];
      if (v !== undefined) readouts[key] = v;
    }
  }
  return readouts;
}

export function run(graph: Graph, inputs: QMap): RunResult {
  const ctx = makeRunContext(inputs);
  const order = kahnTopoSort(graph);
  const values = new Map<string, QMap>();

  for (const id of order.acyclicPrefix) evaluateNode(graph, id, values, ctx);

  if (order.cyclicNodeIds.length > 0) {
    resolveFixedPoint(graph, order.cyclicNodeIds, values, ctx, {
      epsilon: 1e-9,
      maxIterations: 50,
      seed: zeroFromPort,
    });
  }

  for (const id of order.acyclicSuffix) evaluateNode(graph, id, values, ctx);

  return { readouts: collectReadouts(graph, values) };
}
