import { describe, it, expect } from 'vitest';
import { unit } from '../src/quantity/units.js';
import type { Boundary } from '../src/quantity/boundary.js';
import type { Node, Port, PortSignature, QMap } from '../src/graph/node.js';
import { buildGraph } from '../src/graph/graph.js';
import { validateModel, assertModelWellFormed } from '../src/graph/validate.js';

const territorial: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };

function port(id: string, unitName: string, boundary: Boundary): Port {
  const u = unit(unitName);
  return { id, signature: { dimension: u.dimension, boundary, unit: u } };
}

// A minimal well-formed node: every port carries a unit, a matching dimension, and a boundary.
function wellFormedNode(id: string): Node {
  return {
    id,
    kind: 'source',
    ports: {
      in: [],
      out: [port('out', 'MWh', territorial)],
    },
    compute: (): QMap => ({}),
  };
}

describe('validateModel port-completeness (UNIT-01, UNIT-02)', () => {
  it('returns no violations for a well-formed model', () => {
    const graph = buildGraph([wellFormedNode('n1')]);
    expect(validateModel(graph)).toEqual([]);
  });

  it('reports a missing-unit violation for a port whose unit is absent', () => {
    const badSig = { dimension: unit('MWh').dimension, boundary: territorial } as unknown as PortSignature;
    const node: Node = {
      id: 'n-bad',
      kind: 'source',
      ports: { in: [], out: [{ id: 'p', signature: badSig }] },
      compute: (): QMap => ({}),
    };
    const violations = validateModel(buildGraph([node]));
    const v = violations.find((x) => x.code === 'missing-unit');
    expect(v).toBeDefined();
    expect(v?.nodeId).toBe('n-bad');
    expect(v?.portId).toBe('p');
  });

  it('reports a dimension-mismatch violation when declared dimension disagrees with the unit dimension', () => {
    const u = unit('MWh');
    const badSig = { dimension: unit('m^2').dimension, boundary: territorial, unit: u } as unknown as PortSignature;
    const node: Node = {
      id: 'n-dim',
      kind: 'source',
      ports: { in: [], out: [{ id: 'p', signature: badSig }] },
      compute: (): QMap => ({}),
    };
    const violations = validateModel(buildGraph([node]));
    expect(violations.some((x) => x.code === 'dimension-mismatch')).toBe(true);
  });

  it('reports a missing-boundary violation for a port whose boundary is absent', () => {
    const u = unit('MWh');
    const badSig = { dimension: u.dimension, unit: u } as unknown as PortSignature;
    const node: Node = {
      id: 'n-nb',
      kind: 'source',
      ports: { in: [], out: [{ id: 'p', signature: badSig }] },
      compute: (): QMap => ({}),
    };
    const violations = validateModel(buildGraph([node]));
    expect(violations.some((x) => x.code === 'missing-boundary')).toBe(true);
  });

  it('assertModelWellFormed returns void for a well-formed model and throws otherwise', () => {
    const good = buildGraph([wellFormedNode('n1')]);
    expect(assertModelWellFormed(good)).toBeUndefined();

    const badSig = { dimension: unit('MWh').dimension, boundary: territorial } as unknown as PortSignature;
    const bad = buildGraph([
      { id: 'n-bad', kind: 'source', ports: { in: [], out: [{ id: 'p', signature: badSig }] }, compute: (): QMap => ({}) },
    ]);
    expect(() => assertModelWellFormed(bad)).toThrow(/not well formed/);
  });
});

// A producer (out-port) wired to a consumer (in-port), so the connection sweep has
// something to resolve. The out/in signatures are supplied by the caller.
function srcNode(id: string, out: Port): Node {
  return { id, kind: 'source', ports: { in: [], out: [out] }, compute: (): QMap => ({}) };
}
function sinkNode(id: string, in_: Port): Node {
  return { id, kind: 'readout', ports: { in: [in_], out: [] }, compute: (): QMap => ({}) };
}

describe('validateModel connection sweep (build-time wire-time guard)', () => {
  it('returns zero connection violations for a well-formed connected graph', () => {
    const graph = buildGraph(
      [srcNode('p', port('out', 'MWh', territorial)), sinkNode('c', port('in', 'MWh', territorial))],
      [{ from: { nodeId: 'p', portId: 'out' }, to: { nodeId: 'c', portId: 'in' } }],
    );
    expect(validateModel(graph)).toEqual([]);
  });

  it('reports a dimension violation for a dimension-mismatched wire', () => {
    const graph = buildGraph(
      [srcNode('p', port('out', 'MWh', territorial)), sinkNode('c', port('in', 'm^2', territorial))],
      [{ from: { nodeId: 'p', portId: 'out' }, to: { nodeId: 'c', portId: 'in' } }],
    );
    expect(validateModel(graph).some((v) => v.code === 'dimension')).toBe(true);
  });

  it('reports a boundary violation for a boundary-mismatched wire', () => {
    const graph = buildGraph(
      [
        srcNode('p', port('out', 'MWh', territorial)),
        sinkNode('c', port('in', 'MWh', { ...territorial, basis: 'per-capita' })),
      ],
      [{ from: { nodeId: 'p', portId: 'out' }, to: { nodeId: 'c', portId: 'in' } }],
    );
    expect(validateModel(graph).some((v) => v.code === 'boundary')).toBe(true);
  });

  it('reports a boundary violation for a D-06 custom-dimension-only difference', () => {
    const graph = buildGraph(
      [
        srcNode('p', port('out', 'MWh', { ...territorial, custom: { scope: 'A' } })),
        sinkNode('c', port('in', 'MWh', { ...territorial, custom: { scope: 'B' } })),
      ],
      [{ from: { nodeId: 'p', portId: 'out' }, to: { nodeId: 'c', portId: 'in' } }],
    );
    expect(validateModel(graph).some((v) => v.code === 'boundary')).toBe(true);
  });

  it('reports a dangling-port violation for an unresolved connection endpoint (does not throw)', () => {
    const graph = buildGraph(
      [srcNode('p', port('out', 'MWh', territorial)), sinkNode('c', port('in', 'MWh', territorial))],
      [{ from: { nodeId: 'p', portId: 'nope' }, to: { nodeId: 'c', portId: 'in' } }],
    );
    expect(validateModel(graph).some((v) => v.code === 'dangling-port')).toBe(true);
  });
});
