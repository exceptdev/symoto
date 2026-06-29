import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/graph/graph.js';
import type { Node, QMap, Port } from '../src/graph/node.js';
import type { Connection } from '../src/graph/connection.js';
import type { Boundary } from '../src/quantity/boundary.js';
import { boundariesEqual } from '../src/quantity/boundary.js';
import { unit } from '../src/quantity/units.js';
import { q } from '../src/quantity/quantity.js';
import { input } from '../src/quantity/provenance.js';
import { scale } from '../src/quantity/algebra.js';
import { run } from '../src/eval/evaluate.js';

const B: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };
const mwh = unit('MWh');

function port(id: string): Port {
  return { id, signature: { dimension: mwh.dimension, boundary: B, unit: mwh } };
}

// A small two-node DAG: a source emits two outputs, a readout scales one of them. Both the source
// outputs and the readout output share the same base boundary, so a uniform locale stamp keeps them
// netting (boundariesEqual).
function twoNodeGraph() {
  const source: Node = {
    id: 's',
    kind: 'source',
    ports: { in: [], out: [port('v'), port('w')] },
    compute: (ctx): QMap => ({ v: ctx.inputs.x!, w: q(10, mwh, B, input('w')) }),
  };
  const out: Node = {
    id: 'm',
    kind: 'readout',
    ports: { in: [port('v')], out: [port('r')] },
    compute: (_ctx, inputs): QMap => ({ r: scale(inputs.v!, 2) }),
  };
  const conns: Connection[] = [{ from: { nodeId: 's', portId: 'v' }, to: { nodeId: 'm', portId: 'v' } }];
  return buildGraph([source, out], conns);
}

describe('locale propagation (LOC-01)', () => {
  const inputs = (): QMap => ({ x: q(7, mwh, B, input('x')) });

  it('stamps the run locale onto every readout boundary when a locale is set', () => {
    const g = twoNodeGraph();
    const r = run(g, inputs(), { locale: 'NL' });
    const keys = Object.keys(r.readouts);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(r.readouts[k]?.boundary.locale).toBe('NL');
    }
  });

  it('leaves output boundaries locale-less by default, so the run is byte-identical', () => {
    const g = twoNodeGraph();
    const r = run(g, inputs());
    for (const k of Object.keys(r.readouts)) {
      const boundary = r.readouts[k]?.boundary as Boundary;
      expect('locale' in boundary).toBe(false);
      expect(boundary.locale).toBeUndefined();
    }
  });

  it('changes no readout value: localized and default runs have identical values', () => {
    const g = twoNodeGraph();
    const localized = run(g, inputs(), { locale: 'NL' });
    const plain = run(g, inputs());
    const keys = Object.keys(plain.readouts);
    expect(Object.keys(localized.readouts)).toEqual(keys);
    for (const k of keys) {
      expect(localized.readouts[k]?.value).toBe(plain.readouts[k]?.value);
    }
  });

  it('stamps uniformly, so within-run boundariesEqual still holds (refuse-to-net intact)', () => {
    const g = twoNodeGraph();
    // Two outputs of the same node that share every other boundary dimension must still net under a
    // shared locale: a non-uniform stamp would have made them refuse to net.
    const r = run(g, inputs(), { locale: 'VN' });
    const readoutBoundary = r.readouts.r?.boundary as Boundary;
    // A peer quantity built with the same base boundary plus the same stamped locale nets with it.
    const peer: Boundary = { ...B, locale: 'VN' };
    expect(boundariesEqual(readoutBoundary, peer)).toBe(true);
    // The same base boundary WITHOUT the locale does not net, proving the stamp is real, not absent.
    expect(boundariesEqual(readoutBoundary, B)).toBe(false);
  });
});
