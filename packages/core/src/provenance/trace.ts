// The serializable provenance trace (PROV-01, Success Criterion 4). A run's provenance is a flat
// ProvenanceTrace of node records plus edge id lists: every cross-node reference is an edge id pair,
// never an embedded ProvRef object, so the land<->energy cycle serializes as two directed edges with
// no infinite nesting. This is the exact contract Phase 8 (PROV-04) reuses to export a run.
//
// The within-node DAG (the op/adapter records the node's compute produced) is preserved on each
// node record's `local` field; it is within-node only, so it never reintroduces a cross-node cycle.
import type { ProvRef, SourceRef } from '../quantity/provenance.js';

/** A serialized node-boundary record: a readout's identity, its within-node DAG, and its citations. */
export interface NodeProvRecord {
  readonly nodeId: string;
  readonly readoutKey: string;
  readonly formula?: string;
  readonly local: ProvRef;
  readonly sources: readonly SourceRef[];
}

/** A directed dependency edge between two node ports, referenced by id only. */
export interface EdgeRecord {
  readonly fromNodeId: string;
  readonly fromPortId: string;
  readonly toNodeId: string;
  readonly toPortId: string;
}

/** The serializable form: node records plus edge id lists, acyclic by construction. */
export interface ProvenanceTrace {
  readonly nodes: readonly NodeProvRecord[];
  readonly edges: readonly EdgeRecord[];
}

/** A reconstructed origin tree: a readout's formula, its citations, and its upstream origins. */
export interface ReconstructedOrigin {
  readonly nodeId: string;
  readonly readoutKey: string;
  readonly formula?: string;
  readonly sources: readonly SourceRef[];
  readonly inputs: readonly ReconstructedOrigin[];
  /** True when this origin was cut by the visited-set guard (a cyclic dependency). */
  readonly truncated?: boolean;
}

function edgeKey(e: EdgeRecord): string {
  return `${e.fromNodeId}|${e.fromPortId}|${e.toNodeId}|${e.toPortId}`;
}

/**
 * Flatten a list of node-boundary ProvRefs into the serializable node + edge id form. Node records
 * are deduped by `${nodeId}.${readoutKey}`; edges are deduped by their four-id key. Cross-node
 * references become EdgeRecords, never nested ProvRef objects, so the result serializes without
 * cycles. Non-node ProvRefs in the list are ignored (only node-boundary refs form the trace).
 */
export function serializeTrace(records: readonly ProvRef[]): ProvenanceTrace {
  const nodeMap = new Map<string, NodeProvRecord>();
  const edgeMap = new Map<string, EdgeRecord>();
  for (const r of records) {
    if (r.kind !== 'node') continue;
    const nodeKey = `${r.nodeId}.${r.readoutKey}`;
    if (!nodeMap.has(nodeKey)) {
      nodeMap.set(nodeKey, {
        nodeId: r.nodeId,
        readoutKey: r.readoutKey,
        formula: r.formula,
        local: r.local,
        sources: r.sources,
      });
    }
    for (const edge of r.inputs) {
      const record: EdgeRecord = {
        fromNodeId: edge.fromNodeId,
        fromPortId: edge.fromPortId,
        toNodeId: r.nodeId,
        toPortId: edge.toPortId,
      };
      const key = edgeKey(record);
      if (!edgeMap.has(key)) edgeMap.set(key, record);
    }
  }
  return { nodes: [...nodeMap.values()], edges: [...edgeMap.values()] };
}

/**
 * Walk a readout's origin upstream from the serialized trace alone, returning its formula, source
 * citations, and the recursively reconstructed origins of its input dependencies. A `Set<string>`
 * visited guard terminates on a cyclic edge graph (the land<->energy cycle), cutting the second
 * visit with `truncated: true` rather than recursing forever (T-5-01 mitigation).
 *
 * Upstream dependencies are matched by readout key: an EdgeRecord's `fromPortId` is the producer's
 * output port id, which equals the upstream readout key (the node output map is keyed by port id).
 */
export function reconstruct(trace: ProvenanceTrace, readoutKey: string): ReconstructedOrigin {
  const byReadout = new Map<string, NodeProvRecord>();
  for (const n of trace.nodes) byReadout.set(n.readoutKey, n);
  const visited = new Set<string>();

  function walk(key: string): ReconstructedOrigin {
    const rec = byReadout.get(key);
    if (!rec) {
      // An upstream input/seed not captured as a node record (e.g. a raw run input).
      return { nodeId: '', readoutKey: key, sources: [], inputs: [] };
    }
    if (visited.has(key)) {
      return {
        nodeId: rec.nodeId,
        readoutKey: key,
        formula: rec.formula,
        sources: rec.sources,
        inputs: [],
        truncated: true,
      };
    }
    visited.add(key);
    const upstreamKeys = trace.edges
      .filter((e) => e.toNodeId === rec.nodeId)
      .map((e) => e.fromPortId);
    const inputs = upstreamKeys.map((k) => walk(k));
    return {
      nodeId: rec.nodeId,
      readoutKey: key,
      formula: rec.formula,
      sources: rec.sources,
      inputs,
    };
  }

  return walk(readoutKey);
}
