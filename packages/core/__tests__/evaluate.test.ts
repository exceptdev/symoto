import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildGraph } from '../src/graph/graph.js';
import type { Node, QMap, Port } from '../src/graph/node.js';
import type { Connection } from '../src/graph/connection.js';
import type { Boundary } from '../src/quantity/boundary.js';
import { unit } from '../src/quantity/units.js';
import { q } from '../src/quantity/quantity.js';
import { input } from '../src/quantity/provenance.js';
import { scale } from '../src/quantity/algebra.js';
import { run } from '../src/eval/evaluate.js';
import { resolveFixedPoint } from '../src/eval/fixedpoint.js';
import { makeRunContext } from '../src/run/context.js';
import { zeroFromPort } from '../src/eval/nodeEval.js';

const B: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };
const mwh = unit('MWh');

function port(id: string): Port {
  return { id, signature: { dimension: mwh.dimension, boundary: B, unit: mwh } };
}

// --- pure DAG: source -> readout(scale x2) ---
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
  return { nodes: [source, out], conns };
}

// --- 2-node cycle: a.toB independent of a.fromB; b.toA depends on a.toB ---
function cycleGraph() {
  const a: Node = {
    id: 'a',
    kind: 'readout',
    ports: { in: [port('fromB')], out: [port('toB'), port('ra')] },
    // toB is a constant independent of the feedback; ra echoes the feedback value.
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
  return { nodes: [a, b], conns };
}

describe('run() deterministic evaluation', () => {
  it('evaluates a pure DAG and produces readouts', () => {
    const { nodes, conns } = dagGraph();
    const g = buildGraph(nodes, conns);
    const r = run(g, { x: q(7, mwh, B, input('x')) });
    expect(r.readouts.r?.value).toBeCloseTo(14, 9);
  });

  it('property: same inputs produce bit-identical readouts across repeated runs', () => {
    const { nodes, conns } = dagGraph();
    const g = buildGraph(nodes, conns);
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }), (x) => {
        const r1 = run(g, { x: q(x, mwh, B, input('x')) });
        const r2 = run(g, { x: q(x, mwh, B, input('x')) });
        expect(r1.readouts.r?.value).toBe(r2.readouts.r?.value);
      }),
    );
  });

  it('property: shuffled node insertion order yields identical readouts', () => {
    const { nodes, conns } = dagGraph();
    const g1 = buildGraph(nodes, conns);
    const g2 = buildGraph([...nodes].reverse(), conns);
    const inputs = { x: q(3.14159, mwh, B, input('x')) };
    expect(run(g1, inputs).readouts.r?.value).toBe(run(g2, inputs).readouts.r?.value);
  });
});

describe('fixed-point cycle resolution', () => {
  it('converges in exactly 2 iterations and the result is cap-independent above 2', () => {
    const { nodes, conns } = cycleGraph();
    const g = buildGraph(nodes, conns);
    const ctx = makeRunContext({});

    const resultFor = (cap: number) => {
      const values = new Map<string, QMap>();
      const fp = resolveFixedPoint(g, ['a', 'b'], values, ctx, {
        epsilon: 1e-9,
        maxIterations: cap,
        seed: zeroFromPort,
      });
      return { fp, ra: values.get('a')!.ra!.value, toA: values.get('b')!.toA!.value };
    };

    const cap2 = resultFor(2);
    const cap50 = resultFor(50);
    expect(cap2.fp.iterations).toBe(2);
    expect(cap2.fp.converged).toBe(true);
    // a.toB = 100 (const), b.toA = 50, a.ra echoes b.toA = 50
    expect(cap2.toA).toBeCloseTo(50, 9);
    expect(cap2.ra).toBeCloseTo(50, 9);
    // cap-independence above 2
    expect(cap50.toA).toBe(cap2.toA);
    expect(cap50.ra).toBe(cap2.ra);
  });

  it('run() resolves the cycle and exposes the readout', () => {
    const { nodes, conns } = cycleGraph();
    const g = buildGraph(nodes, conns);
    const r = run(g, {});
    expect(r.readouts.ra?.value).toBeCloseTo(50, 9);
  });
});
