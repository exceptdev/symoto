import { describe, it, expect } from 'vitest';
import type { Boundary } from '../src/quantity/boundary.js';
import { q } from '../src/quantity/quantity.js';
import { unit } from '../src/quantity/units.js';
import { input, coefficient } from '../src/quantity/provenance.js';
import type { Node, QMap } from '../src/graph/node.js';
import { buildGraph } from '../src/graph/graph.js';
import { makeRunContext } from '../src/run/context.js';
import { run } from '../src/eval/evaluate.js';
import { validateModel } from '../src/graph/validate.js';
import { makeAdapterNode } from '../src/graph/adapterNode.js';

const PER_CAPITA: Boundary = { accounting: 'consumption', basis: 'per-capita', temporal: 'flow' };
const ABSOLUTE: Boundary = { accounting: 'consumption', basis: 'absolute', temporal: 'flow' };

const kwhPerPerson = unit('kWh/person');
const personU = unit('person');
const kwhU = unit('kWh');

function makePcAdapter(): Node {
  return makeAdapterNode({
    id: 'adapter-1',
    method: 'per-capita-to-absolute',
    in: { portId: 'src', unit: kwhPerPerson, boundary: PER_CAPITA },
    out: { portId: 'abs', unit: kwhU, boundary: ABSOLUTE },
    operand: { portId: 'pop', unit: personU, boundary: ABSOLUTE },
  });
}

describe('makeAdapterNode', () => {
  it('returns a flow node whose out-port signature carries the target unit and boundary', () => {
    const node = makePcAdapter();
    expect(node.kind).toBe('flow');
    const outPort = node.ports.out.find((p) => p.id === 'abs');
    expect(outPort).toBeDefined();
    expect(outPort!.signature.boundary).toEqual(ABSOLUTE);
    expect(outPort!.signature.dimension).toBe(outPort!.signature.unit.dimension);
  });

  it('compute crosses the boundary via adapt(), returning an adapter-provenance Quantity at the target boundary', () => {
    const node = makePcAdapter();
    const inputs: QMap = {
      src: q(2, kwhPerPerson, PER_CAPITA, coefficient('elecKwhPerCapita', true, 'NL')),
      pop: q(1000, personU, ABSOLUTE, input('population')),
    };
    const out = node.compute(makeRunContext({}), inputs);
    const result = out.abs;
    expect(result).toBeDefined();
    expect(result!.value).toBeCloseTo(2000, 9);
    expect(result!.boundary).toEqual(ABSOLUTE);
    expect(result!.provenance.kind).toBe('adapter');
  });

  it('throws a clear error when the declared source input port is missing', () => {
    const node = makePcAdapter();
    expect(() => node.compute(makeRunContext({}), {})).toThrow();
  });

  it('runs inside a graph (source + population -> adapter -> readout) and passes validateModel', () => {
    const perCapSource: Node = {
      id: 'src-pc',
      kind: 'source',
      ports: { in: [], out: [{ id: 'pc', signature: { dimension: kwhPerPerson.dimension, boundary: PER_CAPITA, unit: kwhPerPerson } }] },
      compute: (): QMap => ({ pc: q(2, kwhPerPerson, PER_CAPITA, coefficient('elecKwhPerCapita', true, 'NL')) }),
    };
    const popSource: Node = {
      id: 'src-pop',
      kind: 'source',
      ports: { in: [], out: [{ id: 'pp', signature: { dimension: personU.dimension, boundary: ABSOLUTE, unit: personU } }] },
      compute: (): QMap => ({ pp: q(1000, personU, ABSOLUTE, input('population')) }),
    };
    const adapter = makePcAdapter();
    const readout: Node = {
      id: 'rd',
      kind: 'readout',
      ports: {
        in: [{ id: 'in', signature: { dimension: kwhU.dimension, boundary: ABSOLUTE, unit: kwhU } }],
        out: [{ id: 'absoluteDemand', signature: { dimension: kwhU.dimension, boundary: ABSOLUTE, unit: kwhU } }],
      },
      compute: (_ctx, inputs): QMap => ({ absoluteDemand: inputs.in! }),
    };

    const graph = buildGraph(
      [perCapSource, popSource, adapter, readout],
      [
        { from: { nodeId: 'src-pc', portId: 'pc' }, to: { nodeId: 'adapter-1', portId: 'src' } },
        { from: { nodeId: 'src-pop', portId: 'pp' }, to: { nodeId: 'adapter-1', portId: 'pop' } },
        { from: { nodeId: 'adapter-1', portId: 'abs' }, to: { nodeId: 'rd', portId: 'in' } },
      ],
    );

    expect(validateModel(graph)).toEqual([]);

    const result = run(graph, {});
    const readoutValue = result.readouts.absoluteDemand;
    expect(readoutValue).toBeDefined();
    expect(readoutValue!.boundary).toEqual(ABSOLUTE);
    // After Plan 05-02, every node output carries a node-boundary ProvRef; the within-node DAG is on
    // its `local`. The readout passes the adapted value through, so its local is the within-node leaf
    // and the labeled crossing lives on the adapter node's record in the run trace.
    expect(readoutValue!.provenance.kind).toBe('node');
    expect(readoutValue!.value).toBeCloseTo(2000, 9);
    const adapterRecord = result.provenance.nodes.find((n) => n.local.kind === 'adapter');
    expect(adapterRecord).toBeDefined();
    if (adapterRecord && adapterRecord.local.kind === 'adapter') {
      expect(adapterRecord.local.method).toBe('per-capita-to-absolute');
    }
  });
});
