// Deterministic fixed-point resolver for a cyclic region. It seeds each feedback edge
// with a zero Quantity carrying the consumer port unit and boundary, then re-evaluates
// the cyclic nodes in a fixed (id-sorted) order until the values flowing around the cycle
// (the cyclic-edge values) change by less than a relative epsilon, or the iteration cap is
// hit. This is a bounded, deterministic closure, NOT a general nonlinear solver.
import type { Graph } from '../graph/graph.js';
import type { QMap, Port } from '../graph/node.js';
import type { RunContext } from '../run/context.js';
import type { Quantity } from '../quantity/quantity.js';
import { evaluateNode } from './nodeEval.js';

export interface FixedPointOpts {
  epsilon: number;
  maxIterations: number;
  seed: (consumerPort: Port) => Quantity;
}

export interface FixedPointResult {
  iterations: number;
  converged: boolean;
}

export function resolveFixedPoint(
  graph: Graph,
  cyclicNodeIds: readonly string[],
  values: Map<string, QMap>,
  ctx: RunContext,
  opts: FixedPointOpts,
): FixedPointResult {
  const order = [...cyclicNodeIds].sort();
  const cyc = new Set(cyclicNodeIds);
  // Cyclic edges: connections where both endpoints are inside the cyclic region. These
  // carry the values that determine the fixed point.
  const cyclicEdges = graph.connections.filter(
    (c) => cyc.has(c.from.nodeId) && cyc.has(c.to.nodeId),
  );

  const edgeValues = (): number[] =>
    cyclicEdges.map((c) => {
      const out = values.get(c.from.nodeId);
      const v = out ? out[c.from.portId] : undefined;
      return v ? v.value : Number.NaN;
    });

  let prev: number[] | null = null;
  let iterations = 0;
  for (let i = 0; i < opts.maxIterations; i += 1) {
    for (const id of order) evaluateNode(graph, id, values, ctx, opts.seed);
    iterations = i + 1;
    const cur = edgeValues();
    if (prev !== null) {
      let maxRel = 0;
      for (let k = 0; k < cur.length; k += 1) {
        const a = cur[k] ?? Number.NaN;
        const b = prev[k] ?? Number.NaN;
        const denom = Math.max(Math.abs(b), 1e-12);
        const rel = Math.abs(a - b) / denom;
        if (rel > maxRel) maxRel = rel;
      }
      if (maxRel < opts.epsilon) return { iterations, converged: true };
    }
    prev = cur;
  }
  return { iterations, converged: false };
}
