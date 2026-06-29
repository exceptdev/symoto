import { describe, it, expect } from 'vitest';
import {
  q,
  unit,
  add,
  input,
  validateConnection,
  validateModel,
  buildGraph,
  run,
  BoundaryViolation,
  type Boundary,
  type PortSignature,
  type Node,
  type QMap,
} from '@symoto/core';

// UNIT-05: connection validity is checked at wire-time (port signatures) independently of
// run-time value checks. This suite proves the two refuse-to-net lines fire on their own:
// the wire-time line over signatures with NO run, and the run-time line over values inside a
// graph that already passed wire-time validation. Neither subsumes the other.

const BOUNDARY_A: Boundary = { accounting: 'consumption', basis: 'per-capita', temporal: 'flow' };
const BOUNDARY_B: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };

const mwh = unit('MWh');

function sig(boundary: Boundary): PortSignature {
  return { dimension: mwh.dimension, boundary, unit: mwh };
}

describe('defense line 1 — wire-time validation over signatures, no run', () => {
  it('validateConnection returns a boundary WireError for same dimension, different boundary', () => {
    const err = validateConnection(sig(BOUNDARY_A), sig(BOUNDARY_B));
    expect(err).not.toBeNull();
    expect(err?.code).toBe('boundary');
  });

  it('validateModel flags a boundary violation on a wired mismatch, with no run() executed', () => {
    const producer: Node = {
      id: 'prod',
      kind: 'source',
      ports: { in: [], out: [{ id: 'o', signature: sig(BOUNDARY_A) }] },
      compute: (): QMap => ({}),
    };
    const consumer: Node = {
      id: 'cons',
      kind: 'readout',
      ports: { in: [{ id: 'i', signature: sig(BOUNDARY_B) }], out: [] },
      compute: (): QMap => ({}),
    };
    const graph = buildGraph(
      [producer, consumer],
      [{ from: { nodeId: 'prod', portId: 'o' }, to: { nodeId: 'cons', portId: 'i' } }],
    );

    const violations = validateModel(graph);
    expect(violations.some((v) => v.code === 'boundary')).toBe(true);
    // The wire-time line fires purely over signatures; no run() is called here.
  });
});

describe('defense line 2 — run-time value validation inside a wire-valid graph', () => {
  // A node whose ports are all internally consistent (so validateModel passes) but whose
  // compute performs an illegal add() of two same-unit, different-boundary Quantities. The
  // boundary mismatch lives in the values, not the signatures, so only the run-time line
  // can catch it.
  const illegalNetNode: Node = {
    id: 'illegal-net',
    kind: 'readout',
    ports: { in: [], out: [{ id: 'net', signature: sig(BOUNDARY_A) }] },
    compute: (): QMap => {
      const a = q(1, mwh, BOUNDARY_A, input('a'));
      const b = q(1, mwh, BOUNDARY_B, input('b'));
      return { net: add(a, b) }; // throws BoundaryViolation at run time
    },
  };
  const graph = buildGraph([illegalNetNode]);

  it('passes wire-time validation (validateModel returns no violations)', () => {
    expect(validateModel(graph)).toEqual([]);
  });

  it('still throws BoundaryViolation at run time on the illegal add', () => {
    expect(() => run(graph, {})).toThrow(BoundaryViolation);
  });
});

describe('the two lines are independent', () => {
  it('the wire-time line fires on signatures alone; the run-time line fires on values in a wire-valid graph', () => {
    // Wire-time: signatures only, no Quantity values, no run.
    expect(validateConnection(sig(BOUNDARY_A), sig(BOUNDARY_B))?.code).toBe('boundary');

    // Run-time: a graph that wire-time validation accepts still refuses the net at run time.
    const node: Node = {
      id: 'n',
      kind: 'readout',
      ports: { in: [], out: [{ id: 'net', signature: sig(BOUNDARY_A) }] },
      compute: (): QMap =>
        ({ net: add(q(1, mwh, BOUNDARY_A, input('a')), q(1, mwh, BOUNDARY_B, input('b'))) }),
    };
    const wireValid = buildGraph([node]);
    expect(validateModel(wireValid)).toEqual([]); // wire-time passes
    expect(() => run(wireValid, {})).toThrow(BoundaryViolation); // run-time refuses
  });
});
