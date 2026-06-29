import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/graph/graph.js';
import type { Node, QMap, Port } from '../src/graph/node.js';
import type { Connection } from '../src/graph/connection.js';
import type { Boundary } from '../src/quantity/boundary.js';
import { unit } from '../src/quantity/units.js';
import { q } from '../src/quantity/quantity.js';
import { input } from '../src/quantity/provenance.js';
import { scale } from '../src/quantity/algebra.js';
import { run } from '../src/eval/evaluate.js';
import { reconstruct } from '../src/provenance/trace.js';

// Plan 02: the evaluator captures node-boundary provenance generically on every run and returns a
// serializable, acyclic ProvenanceTrace, with no readout value changed. The real OC value-unchanged
// floor is proven by the oc-model parity suite (full-model-parity, adapter-parity) in the verify
// command; core stays isomorphic and does not depend on @symoto/oc-model, so this proves the same
// properties on a self-contained synthetic cyclic graph (the land<->energy shape).

const B: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };
const mwh = unit('MWh');

function port(id: string): Port {
  return { id, signature: { dimension: mwh.dimension, boundary: B, unit: mwh } };
}

// source(s.v = x) -> readout(m.r = 2 * v)
function dagGraph() {
  const source: Node = {
    id: 's',
    kind: 'source',
    ports: { in: [], out: [port('v')] },
    compute: (ctx): QMap => ({ v: ctx.inputs.x! }),
  };
  const out: Node = {
    id: 'm',
    kind: 'readout',
    ports: { in: [port('v')], out: [port('r')] },
    compute: (_ctx, inputs): QMap => ({ r: scale(inputs.v!, 2) }),
  };
  const conns: Connection[] = [{ from: { nodeId: 's', portId: 'v' }, to: { nodeId: 'm', portId: 'v' } }];
  return buildGraph([source, out], conns);
}

// 2-node cycle (land<->energy shape): a.toB constant; a.ra echoes feedback; b.toA = 0.5 * a.toB.
function cycleGraph() {
  const a: Node = {
    id: 'a',
    kind: 'readout',
    ports: { in: [port('fromB')], out: [port('toB'), port('ra')] },
    compute: (_ctx, inputs): QMap => ({
      toB: q(100, mwh, B, input('constA')),
      ra: scale(inputs.fromB!, 1),
    }),
  };
  const b: Node = {
    id: 'b',
    kind: 'element',
    ports: { in: [port('fromA')], out: [port('toA')] },
    compute: (_ctx, inputs): QMap => ({ toA: scale(inputs.fromA!, 0.5) }),
  };
  const conns: Connection[] = [
    { from: { nodeId: 'a', portId: 'toB' }, to: { nodeId: 'b', portId: 'fromA' } },
    { from: { nodeId: 'b', portId: 'toA' }, to: { nodeId: 'a', portId: 'fromB' } },
  ];
  return buildGraph([a, b], conns);
}

describe('evaluator node-boundary provenance capture (PROV-01, SC4)', () => {
  it('captures once per node output: the trace node-record count equals the node-output count', () => {
    const graph = dagGraph();
    const result = run(graph, { x: q(10, mwh, B, input('x')) });
    // s.v and m.r are the two node outputs => two node records, one edge (s.v -> m.v).
    expect(result.provenance.nodes).toHaveLength(2);
    expect(result.provenance.edges).toHaveLength(1);
    expect(result.provenance.edges[0]).toEqual({ fromNodeId: 's', fromPortId: 'v', toNodeId: 'm', toPortId: 'v' });
  });

  it('stamps a node ProvRef on every readout, preserving value, unit, and boundary', () => {
    const graph = dagGraph();
    const result = run(graph, { x: q(10, mwh, B, input('x')) });
    const r = result.readouts['r'];
    expect(r).toBeDefined();
    // value unchanged by provenance capture: 2 * 10.
    expect(r!.value).toBe(20);
    expect(r!.unit).toEqual(mwh);
    expect(r!.boundary).toEqual(B);
    expect(r!.provenance.kind).toBe('node');
    if (r!.provenance.kind === 'node') {
      expect(r!.provenance.nodeId).toBe('m');
      expect(r!.provenance.readoutKey).toBe('r');
      // the within-node op DAG (scale) is preserved as local.
      expect(r!.provenance.local.kind).toBe('op');
    }
  });

  it('serializes a cyclic graph as directed edges (no nested cross-node ProvRef) and reconstruct terminates', () => {
    const graph = cycleGraph();
    const result = run(graph, {});
    // a.toB, a.ra, b.toA => three node outputs => three node records.
    expect(result.provenance.nodes).toHaveLength(3);
    // The two directed cyclic edges.
    expect(result.provenance.edges).toHaveLength(2);
    const edgeKeys = result.provenance.edges.map((e) => `${e.fromNodeId}.${e.fromPortId}->${e.toNodeId}.${e.toPortId}`).sort();
    expect(edgeKeys).toEqual(['a.toB->b.fromA', 'b.toA->a.fromB']);
    // No nested cross-node ProvRef: every node record's local is within-node.
    for (const n of result.provenance.nodes) {
      expect(n.local.kind).not.toBe('node');
    }
    // reconstruct over the cycle terminates and names an upstream dependency.
    const origin = reconstruct(result.provenance, 'ra');
    expect(origin.nodeId).toBe('a');
    expect(origin.inputs.length).toBeGreaterThan(0);
    expect(origin.inputs[0]?.nodeId).toBe('b');
    // the cyclic second visit is cut.
    expect(origin.inputs[0]?.inputs[0]?.inputs[0]?.truncated).toBe(true);
  });

  it('value-unchanged guard: the cyclic converged values are exactly the pre-provenance values', () => {
    const result = run(cycleGraph(), {});
    // a.toB = 100 (constant); b.toA = 50; a.ra echoes b.toA = 50. Deterministic, unaffected by stamping.
    expect(result.readouts['toB']!.value).toBe(100);
    expect(result.readouts['ra']!.value).toBe(50);
  });
});
