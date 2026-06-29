import { describe, it, expect } from 'vitest';
import {
  input,
  adapterProv,
  nodeProv,
  sourceRef,
  serializeTrace,
  reconstruct,
  type Boundary,
  type ProvRef,
} from '@symoto/core';

// Synthetic provenance DAGs proving the Plan 01 contract: serialize to node + edge id lists with no
// nested cross-node ProvRef, and reconstruct a readout's origin terminating on a cyclic edge graph.

const FLOW: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };

describe('ProvenanceTrace serialization and reconstruction (PROV-01, SC4)', () => {
  it('serializes an acyclic A -> B DAG to two node records and one edge, and reconstruct(B) names A', () => {
    const a = nodeProv('A', 'A.out', input('A.in'), [], { formula: 'a = seed' });
    const b = nodeProv('B', 'B.out', input('B.in'), [
      { fromNodeId: 'A', fromPortId: 'A.out', toPortId: 'B.in' },
    ], { formula: 'b = f(a)', sources: [sourceRef('coefB', false, 'xlsx!B1')] });

    const trace = serializeTrace([a, b]);

    expect(trace.nodes).toHaveLength(2);
    expect(trace.edges).toHaveLength(1);
    expect(trace.edges[0]).toEqual({ fromNodeId: 'A', fromPortId: 'A.out', toNodeId: 'B', toPortId: 'B.in' });

    const origin = reconstruct(trace, 'B.out');
    expect(origin.nodeId).toBe('B');
    expect(origin.formula).toBe('b = f(a)');
    expect(origin.sources.map((s) => s.coefficientId)).toEqual(['coefB']);
    expect(origin.inputs).toHaveLength(1);
    expect(origin.inputs[0]?.nodeId).toBe('A');
    expect(origin.inputs[0]?.readoutKey).toBe('A.out');
  });

  it('serializes a cyclic A <-> B graph (the land<->energy shape) to two edges and terminates on reconstruct', () => {
    const a = nodeProv('A', 'A.out', input('A.in'), [
      { fromNodeId: 'B', fromPortId: 'B.out', toPortId: 'A.in' },
    ]);
    const b = nodeProv('B', 'B.out', input('B.in'), [
      { fromNodeId: 'A', fromPortId: 'A.out', toPortId: 'B.in' },
    ]);

    const trace = serializeTrace([a, b]);

    expect(trace.nodes).toHaveLength(2);
    expect(trace.edges).toHaveLength(2);

    // No nested cross-node ProvRef in the serialized form: every node record's local is within-node.
    for (const n of trace.nodes) {
      expect((n.local as ProvRef).kind).not.toBe('node');
    }

    const origin = reconstruct(trace, 'A.out');
    expect(origin.nodeId).toBe('A');
    // Upstream is B; B's upstream is A again, cut by the visited set.
    expect(origin.inputs).toHaveLength(1);
    const upstreamB = origin.inputs[0];
    expect(upstreamB?.nodeId).toBe('B');
    expect(upstreamB?.inputs[0]?.truncated).toBe(true);
  });

  it('preserves an adapter local DAG (the carbon-net shape) in the node record', () => {
    const localAdapter = adapterProv('operational-territorial-net', FLOW, FLOW, [input('gross'), input('seq')]);
    const net = nodeProv('n8-emissions', 'emissions.netCarbonTonnesPerYr', localAdapter, []);

    const trace = serializeTrace([net]);

    expect(trace.nodes).toHaveLength(1);
    const rec = trace.nodes[0];
    expect(rec?.local.kind).toBe('adapter');
    if (rec?.local.kind === 'adapter') {
      expect(rec.local.method).toBe('operational-territorial-net');
    }
  });
});
