// A model is a graph of typed nodes wired by connections with typed ports.
// Every port value is a Quantity, so a bare number cannot cross a port.
import type { Quantity } from '../quantity/quantity.js';
import type { Boundary } from '../quantity/boundary.js';
import type { SymUnit } from '../quantity/units.js';
import type { SourceRef } from '../quantity/provenance.js';
import type { RunContext } from '../run/context.js';
import type { Graph } from './graph.js';

export type NodeKind = 'element' | 'flow' | 'controller' | 'readout' | 'source';
export type QMap = Record<string, Quantity>;

export interface PortSignature {
  readonly dimension: string;
  readonly boundary: Boundary;
  // The port's unit. Required metadata (UNIT-01): every node output and flow declares a
  // unit, validated against the declared dimension by validateModel. The evaluator also
  // uses it to seed feedback edges with a zero Quantity of the right unit.
  readonly unit: SymUnit;
}

export interface Port {
  readonly id: string;
  readonly signature: PortSignature;
}

/**
 * Authored, optional, backward-compatible provenance metadata for a node's readouts (PROV-01 D5-2).
 * `formula` and `sources` are keyed by readout key (the node's output port id). The evaluator looks
 * them up when it stamps each output's node-boundary provenance; absent meta leaves a readout with
 * its mechanical provenance only (topology and within-node DAG).
 */
export interface NodeMeta {
  readonly formula?: Record<string, string>;
  readonly sources?: Record<string, readonly SourceRef[]>;
}

export interface Node {
  readonly id: string;
  readonly kind: NodeKind;
  readonly ports: { in: readonly Port[]; out: readonly Port[] };
  compute(ctx: RunContext, inputs: QMap): QMap; // pure; bare numbers cannot appear here (typed)
  readonly subgraph?: Graph; // nesting in the data model only; no recursion engine ships
  readonly meta?: NodeMeta; // optional authored formula + source citations per readout key
}
