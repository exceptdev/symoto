// A model is a graph of typed nodes wired by connections with typed ports.
// Every port value is a Quantity, so a bare number cannot cross a port.
import type { Quantity } from '../quantity/quantity.js';
import type { Boundary } from '../quantity/boundary.js';
import type { SymUnit } from '../quantity/units.js';
import type { RunContext } from '../run/context.js';
import type { Graph } from './graph.js';

export type NodeKind = 'element' | 'flow' | 'controller' | 'readout' | 'source';
export type QMap = Record<string, Quantity>;

export interface PortSignature {
  readonly dimension: string;
  readonly boundary: Boundary;
  // The port's unit. Optional because validateConnection only needs the dimension; the
  // evaluator uses it to seed feedback edges with a zero Quantity of the right unit.
  readonly unit?: SymUnit;
}

export interface Port {
  readonly id: string;
  readonly signature: PortSignature;
}

export interface Node {
  readonly id: string;
  readonly kind: NodeKind;
  readonly ports: { in: readonly Port[]; out: readonly Port[] };
  compute(ctx: RunContext, inputs: QMap): QMap; // pure; bare numbers cannot appear here (typed)
  readonly subgraph?: Graph; // nesting in the data model only; no recursion engine ships
}
