// Run export (PROV-04). A full run exports to a versioned, self-describing, acyclic, JSON-safe
// structure an external reviewer or agent (the Professor critique system) can interrogate without the
// engine. This composes contracts that already exist and are already proven: the Phase 5
// ProvenanceTrace (node records plus edge id lists), the Phase 7 SerializedQuantity scalar
// ({ value, unit, boundary }, no nested provenance), the Phase 5 CompoundReadout and RequestedActual,
// and the Phase 6 InvarianceFlag. The one new structure is the graph-topology serialization (a node
// list plus a connection edge id list) and the versioned envelope. exportRun computes no new number:
// it reads result.readouts and result.requestedActual verbatim.
//
// Acyclic by construction: topology connections are edge id pairs, provenance is the acyclic
// serializeTrace output, readouts and inputs are flat scalars, and the embedded series is the acyclic
// SerializedTimeSeries. So JSON.stringify(exportRun(...)) never throws on a circular reference and
// JSON.parse(JSON.stringify(exportRun(...))) deep-equals the original.
import type { Quantity } from '../quantity/quantity.js';
import type { SymUnit } from '../quantity/units.js';
import type { Boundary } from '../quantity/boundary.js';
import type { Graph } from '../graph/graph.js';
import type { Node, NodeKind, Port, QMap } from '../graph/node.js';
import type { ProvenanceTrace } from '../provenance/trace.js';
import type { SerializedQuantity, SerializedTimeSeries } from '../time/series.js';
import type { CompoundReadout, ComponentRole } from '../quantity/compound.js';
import type { InvarianceFlag } from '../locale/invariance.js';
import type { RequestedActual } from '../run/requestedActual.js';
import type { RunResult } from '../eval/evaluate.js';

/** The run-export contract version. A versioned envelope lets the format widen additively later. */
export const RUN_EXPORT_SCHEMA_VERSION = 'symoto-run-export/1';

/** A typed port flattened for export: its id, declared dimension, unit, and boundary. */
export interface SerializedPort {
  readonly id: string;
  readonly dimension: string;
  readonly unit: SymUnit;
  readonly boundary: Boundary;
}

/** A graph node flattened for export: its id, kind, and its typed in/out ports. */
export interface SerializedNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly in: readonly SerializedPort[];
  readonly out: readonly SerializedPort[];
}

/** A connection flattened to an edge id pair, never a nested node object. */
export interface SerializedConnection {
  readonly fromNodeId: string;
  readonly fromPortId: string;
  readonly toNodeId: string;
  readonly toPortId: string;
}

/** The serialized graph topology: a node list plus a connection edge id list (acyclic). */
export interface SerializedTopology {
  readonly nodes: readonly SerializedNode[];
  readonly connections: readonly SerializedConnection[];
}

/** One serialized compound component: its named boundary role, its key, and its scalar quantity. */
export interface SerializedComponent {
  readonly role: ComponentRole;
  readonly key: string;
  readonly quantity: SerializedQuantity;
}

/** A serialized compound readout: the net plus the gross components it was combined from. */
export interface SerializedCompound {
  readonly key: string;
  readonly net: SerializedQuantity;
  readonly components: readonly SerializedComponent[];
}

/** Optional inputs to exportRun beyond the graph and the run result. */
export interface ExportRunOpts {
  readonly inputs?: QMap;
  readonly invarianceFlags?: readonly InvarianceFlag[];
  readonly compounds?: readonly CompoundReadout[];
  readonly series?: SerializedTimeSeries;
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** The full, versioned, acyclic run export. */
export interface RunExport {
  readonly schemaVersion: string;
  readonly topology: SerializedTopology;
  readonly inputs: Readonly<Record<string, SerializedQuantity>>;
  readonly readouts: Readonly<Record<string, SerializedQuantity>>;
  readonly provenance: ProvenanceTrace;
  readonly requestedActual: readonly RequestedActual[];
  readonly invarianceFlags?: readonly InvarianceFlag[];
  readonly compounds?: readonly SerializedCompound[];
  readonly series?: SerializedTimeSeries;
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** Flatten a Quantity to its scalar (value, unit, boundary); provenance lives once at the run level. */
function serializeQuantity(qty: Quantity): SerializedQuantity {
  return { value: qty.value, unit: qty.unit, boundary: qty.boundary };
}

/** Map a Record<string, Quantity> to a Record<string, SerializedQuantity>. */
function mapValues(map: Readonly<Record<string, Quantity>> | QMap): Record<string, SerializedQuantity> {
  const out: Record<string, SerializedQuantity> = {};
  for (const key of Object.keys(map)) {
    const qty = map[key];
    if (qty !== undefined) out[key] = serializeQuantity(qty);
  }
  return out;
}

/** Flatten a single port to its serialized form. */
function toSerializedPort(p: Port): SerializedPort {
  return {
    id: p.id,
    dimension: p.signature.dimension,
    unit: p.signature.unit,
    boundary: p.signature.boundary,
  };
}

/** Flatten a single node to its serialized form: id, kind, and typed in/out ports. */
function toSerializedNode(n: Node): SerializedNode {
  return {
    id: n.id,
    kind: n.kind,
    in: n.ports.in.map(toSerializedPort),
    out: n.ports.out.map(toSerializedPort),
  };
}

/** Serialize the graph topology to a node list plus an edge id list. */
function serializeTopology(graph: Graph): SerializedTopology {
  return {
    nodes: graph.nodes.map(toSerializedNode),
    connections: graph.connections.map((c) => ({
      fromNodeId: c.from.nodeId,
      fromPortId: c.from.portId,
      toNodeId: c.to.nodeId,
      toPortId: c.to.portId,
    })),
  };
}

/** Serialize a compound readout to flat scalars (net plus components), recomputing nothing. */
function serializeCompound(c: CompoundReadout): SerializedCompound {
  return {
    key: c.key,
    net: serializeQuantity(c.net),
    components: c.components.map((comp) => ({
      role: comp.role,
      key: comp.key,
      quantity: serializeQuantity(comp.quantity),
    })),
  };
}

/**
 * Build the versioned, acyclic RunExport from a graph and a run result. The Phase 5 ProvenanceTrace is
 * embedded verbatim (result.provenance), never rebuilt; readouts, inputs, and compound quantities are
 * flattened to { value, unit, boundary } scalars with no provenance key; topology is a node list plus
 * an edge id list. Optional fields are emitted only when their opts source is provided (never as
 * `undefined`). No value is recomputed.
 */
export function exportRun(graph: Graph, result: RunResult, opts?: ExportRunOpts): RunExport {
  const exported: RunExport = {
    schemaVersion: RUN_EXPORT_SCHEMA_VERSION,
    topology: serializeTopology(graph),
    inputs: mapValues(opts?.inputs ?? {}),
    readouts: mapValues(result.readouts),
    provenance: result.provenance,
    requestedActual: result.requestedActual,
  };
  const withOptional: RunExport = {
    ...exported,
    ...(opts?.invarianceFlags !== undefined ? { invarianceFlags: opts.invarianceFlags } : {}),
    ...(opts?.compounds !== undefined ? { compounds: opts.compounds.map(serializeCompound) } : {}),
    ...(opts?.series !== undefined ? { series: opts.series } : {}),
    ...(opts?.meta !== undefined ? { meta: opts.meta } : {}),
  };
  return withOptional;
}
