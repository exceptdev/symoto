import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/graph/graph.js';
import type { Node, QMap } from '../src/graph/node.js';
import type { Connection } from '../src/graph/connection.js';
import { kahnTopoSort } from '../src/eval/topo.js';
import { makeRunContext } from '../src/run/context.js';
import { unit } from '../src/quantity/units.js';
import { q } from '../src/quantity/quantity.js';
import { input } from '../src/quantity/provenance.js';

function n(id: string): Node {
  return {
    id,
    kind: 'element',
    ports: { in: [], out: [] },
    compute: (): QMap => ({}),
  };
}

function edge(fromNode: string, toNode: string): Connection {
  return { from: { nodeId: fromNode, portId: 'out' }, to: { nodeId: toNode, portId: 'in' } };
}

describe('makeRunContext', () => {
  it('carries the inputs', () => {
    const inputs: QMap = {
      pop: q(50000, unit('person'), { accounting: 'territorial', basis: 'absolute', temporal: 'flow' }, input('pop')),
    };
    expect(makeRunContext(inputs).inputs).toBe(inputs);
  });
});

describe('kahnTopoSort', () => {
  it('orders a pure DAG topologically with ties broken by ascending id', () => {
    // a -> b, a -> c, b -> d, c -> d
    const g = buildGraph([n('a'), n('b'), n('c'), n('d')], [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')]);
    const order = kahnTopoSort(g);
    expect(order.cyclicNodeIds).toEqual([]);
    expect(order.acyclicSuffix).toEqual([]);
    expect(order.acyclicPrefix[0]).toBe('a');
    expect(order.acyclicPrefix[order.acyclicPrefix.length - 1]).toBe('d');
    // b before c (tie broken by id), both after a and before d
    expect(order.acyclicPrefix).toEqual(['a', 'b', 'c', 'd']);
  });

  it('detects a 2-node cycle and splits prefix/suffix', () => {
    // s -> x, x <-> y, y -> r  (x,y cyclic; s prefix; r suffix)
    const g = buildGraph(
      [n('s'), n('x'), n('y'), n('r')],
      [edge('s', 'x'), edge('x', 'y'), edge('y', 'x'), edge('y', 'r')],
    );
    const order = kahnTopoSort(g);
    expect(order.cyclicNodeIds).toEqual(['x', 'y']);
    expect(order.acyclicPrefix).toEqual(['s']);
    expect(order.acyclicSuffix).toEqual(['r']);
  });

  it('is deterministic across repeated calls and shuffled insertion order', () => {
    const nodesA = [n('a'), n('b'), n('c'), n('d')];
    const nodesB = [n('d'), n('b'), n('a'), n('c')]; // shuffled insertion
    const conns = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')];
    const g1 = buildGraph(nodesA, conns);
    const g2 = buildGraph(nodesB, conns);
    const o1 = kahnTopoSort(g1);
    const o1again = kahnTopoSort(g1);
    const o2 = kahnTopoSort(g2);
    expect(o1).toEqual(o1again);
    expect(o1).toEqual(o2);
  });
});
