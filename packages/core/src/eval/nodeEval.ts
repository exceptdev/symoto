// Shared node-evaluation helpers used by both the orchestrator (evaluate.ts) and the
// fixed-point resolver (fixedpoint.ts). Kept in its own module so the two callers do not
// import each other (no cycle).
import type { Graph } from '../graph/graph.js';
import type { Node, QMap, Port } from '../graph/node.js';
import type { RunContext } from '../run/context.js';
import type { Quantity } from '../quantity/quantity.js';
import { q } from '../quantity/quantity.js';
import { input } from '../quantity/provenance.js';

export function findNode(graph: Graph, id: string): Node {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`Node not found: ${id}`);
  return node;
}

/**
 * Build the input QMap for a node from its incoming connections, keyed by the consumer
 * in-port id. A producer output that is not yet available is seeded (when a seed is
 * supplied, inside the fixed-point region) or omitted (acyclic evaluation).
 */
export function gatherInputs(
  graph: Graph,
  node: Node,
  values: Map<string, QMap>,
  seed?: (consumerPort: Port) => Quantity,
): QMap {
  const inputs: QMap = {};
  for (const conn of graph.connections) {
    if (conn.to.nodeId !== node.id) continue;
    const producer = values.get(conn.from.nodeId);
    const val = producer ? producer[conn.from.portId] : undefined;
    if (val !== undefined) {
      inputs[conn.to.portId] = val;
    } else if (seed) {
      const port = node.ports.in.find((p) => p.id === conn.to.portId);
      if (port) inputs[conn.to.portId] = seed(port);
    }
  }
  return inputs;
}

export function evaluateNode(
  graph: Graph,
  nodeId: string,
  values: Map<string, QMap>,
  ctx: RunContext,
  seed?: (consumerPort: Port) => Quantity,
): void {
  const node = findNode(graph, nodeId);
  const inputs = gatherInputs(graph, node, values, seed);
  values.set(nodeId, node.compute(ctx, inputs));
}

/** Deterministic feedback-edge seed: a zero Quantity carrying the consumer port unit and boundary. */
export function zeroFromPort(consumerPort: Port): Quantity {
  const u = consumerPort.signature.unit;
  if (!u) {
    throw new Error(
      `Cannot seed feedback edge into port ${consumerPort.id}: its signature has no unit.`,
    );
  }
  return q(0, u, consumerPort.signature.boundary, input(`seed:${consumerPort.id}`));
}
