// Shared node-evaluation helpers used by both the orchestrator (evaluate.ts) and the
// fixed-point resolver (fixedpoint.ts). Kept in its own module so the two callers do not
// import each other (no cycle).
import type { Graph } from '../graph/graph.js';
import type { Node, QMap, Port } from '../graph/node.js';
import type { RunContext } from '../run/context.js';
import type { Quantity } from '../quantity/quantity.js';
import { q } from '../quantity/quantity.js';
import { input, nodeProv, type InputEdge } from '../quantity/provenance.js';

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

/**
 * Wrap every output of a node in a node-boundary ProvRef (PROV-01, Success Criterion 4). For each
 * output `[key, qty]`, the node's incoming graph edges become InputEdges, the provenance compute
 * produced becomes `local` (preserving the carbon adapter DAG), and `formula`/`sources` are looked
 * up from `node.meta` by readout key. Value and unit are unchanged: only provenance is replaced, so
 * the readout number stays byte-identical and parity holds.
 *
 * Locale (LOC-01): when `ctx.locale` is defined, the output boundary is rebuilt as
 * `{ ...boundary, locale: ctx.locale }`, so the run's locale propagates onto every Quantity's
 * boundary uniformly. When `ctx.locale` is undefined, the boundary is left exactly as is (no `locale`
 * key is introduced), so the default path is byte-identical. Stamping is uniform across the run, so
 * within-run `boundariesEqual` is preserved and the refuse-to-net guard is intact.
 */
export function stampNodeProvenance(graph: Graph, node: Node, out: QMap, ctx: RunContext): QMap {
  const inputEdges: InputEdge[] = graph.connections
    .filter((conn) => conn.to.nodeId === node.id)
    .map((conn) => ({ fromNodeId: conn.from.nodeId, fromPortId: conn.from.portId, toPortId: conn.to.portId }));
  const stamped: QMap = {};
  for (const key of Object.keys(out)) {
    const qty = out[key];
    if (qty === undefined) continue;
    const boundary = ctx.locale !== undefined ? { ...qty.boundary, locale: ctx.locale } : qty.boundary;
    stamped[key] = q(
      qty.value,
      qty.unit,
      boundary,
      nodeProv(node.id, key, qty.provenance, inputEdges, {
        formula: node.meta?.formula?.[key],
        sources: node.meta?.sources?.[key] ?? [],
      }),
    );
  }
  return stamped;
}

/**
 * Reset each gathered input's provenance to a within-node leaf (`input(consumerPortId)`), keeping
 * value, unit, and boundary identical. This is what keeps each node's `local` DAG within-node only:
 * without it, a node that threads an input's provenance through Q-algebra (or passes it through)
 * would embed the upstream node's already-stamped node-boundary ProvRef, reintroducing a nested
 * cross-node reference (and, around the land<->energy cycle, unbounded nesting). The cross-node link
 * is carried solely by the InputEdges, so no information is lost (PROV-01 D5-1, T-5-06 mitigation).
 */
function localizeInputs(inputs: QMap): QMap {
  const localized: QMap = {};
  for (const portId of Object.keys(inputs)) {
    const qty = inputs[portId];
    if (qty === undefined) continue;
    localized[portId] = q(qty.value, qty.unit, qty.boundary, input(portId));
  }
  return localized;
}

export function evaluateNode(
  graph: Graph,
  nodeId: string,
  values: Map<string, QMap>,
  ctx: RunContext,
  seed?: (consumerPort: Port) => Quantity,
): void {
  const node = findNode(graph, nodeId);
  const inputs = localizeInputs(gatherInputs(graph, node, values, seed));
  values.set(nodeId, stampNodeProvenance(graph, node, node.compute(ctx, inputs), ctx));
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
