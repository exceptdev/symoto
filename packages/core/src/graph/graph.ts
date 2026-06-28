// The immutable graph: built once, run many times (Pattern 4). Nodes are never
// reconstructed per run.
import type { Node } from './node.js';
import type { Connection } from './connection.js';

export interface Graph {
  readonly nodes: readonly Node[];
  readonly connections: readonly Connection[];
}

/** Build the immutable adjacency structure the evaluator reads. */
export function buildGraph(nodes: readonly Node[], connections: readonly Connection[] = []): Graph {
  return Object.freeze({
    nodes: Object.freeze([...nodes]),
    connections: Object.freeze([...connections]),
  });
}
