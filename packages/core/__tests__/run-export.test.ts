import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/graph/graph.js';
import type { Node, QMap, Port } from '../src/graph/node.js';
import type { Connection } from '../src/graph/connection.js';
import type { Boundary } from '../src/quantity/boundary.js';
import { unit } from '../src/quantity/units.js';
import { q } from '../src/quantity/quantity.js';
import { input } from '../src/quantity/provenance.js';
import { scale } from '../src/quantity/algebra.js';
import { run } from '../src/eval/evaluate.js';
import { compound } from '../src/quantity/compound.js';
import { runTimeSeries } from '../src/time/integrator.js';
import { serializeTimeSeries } from '../src/time/series.js';
import { exportRun, RUN_EXPORT_SCHEMA_VERSION } from '../src/export/runExport.js';
import type { InvarianceFlag } from '../src/locale/invariance.js';

// Run export (PROV-04): exportRun bundles topology, scalars, and the Phase 5 trace into an acyclic,
// JSON-round-trippable structure, recomputing no value.

const B: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };
const mwh = unit('MWh');

function port(id: string): Port {
  return { id, signature: { dimension: mwh.dimension, boundary: B, unit: mwh } };
}

// source(x) -> readout(scale x2)
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
  return buildGraph([source, out], conns);
}

describe('exportRun builds a versioned, acyclic RunExport (PROV-04)', () => {
  it('serializes topology, scalar readouts, and embeds the Phase 5 trace verbatim', () => {
    const g = dagGraph();
    const inputs: QMap = { x: q(7, mwh, B, input('x')) };
    const result = run(g, inputs);
    const exp = exportRun(g, result, { inputs });

    expect(exp.schemaVersion).toBe(RUN_EXPORT_SCHEMA_VERSION);
    expect(exp.schemaVersion).toBe('symoto-run-export/1');

    // Topology: nodes carry id, kind, and typed ports; connections are edge id pairs.
    const ids = exp.topology.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['m', 's']);
    const readoutNode = exp.topology.nodes.find((n) => n.id === 'm')!;
    expect(readoutNode.kind).toBe('readout');
    const inPort = readoutNode.in[0]!;
    expect(inPort.dimension).toBe(mwh.dimension);
    expect(inPort.unit.canonical).toBe(mwh.canonical);
    expect(inPort.boundary).toEqual(B);
    expect(exp.topology.connections).toEqual([
      { fromNodeId: 's', fromPortId: 'v', toNodeId: 'm', toPortId: 'v' },
    ]);

    // Readouts and inputs are { value, unit, boundary } scalars with no provenance key.
    const r = exp.readouts.r!;
    expect(typeof r.value).toBe('number');
    expect(r.unit.canonical).toBe(mwh.canonical);
    expect(r.boundary).toEqual(B);
    expect('provenance' in r).toBe(false);
    const xIn = exp.inputs.x!;
    expect(xIn.value).toBe(7);
    expect('provenance' in xIn).toBe(false);

    // Provenance is the verbatim Phase 5 node + edge id-list trace.
    expect(exp.provenance).toBe(result.provenance);
    expect(Array.isArray(exp.provenance.nodes)).toBe(true);
    expect(Array.isArray(exp.provenance.edges)).toBe(true);

    // requestedActual is carried verbatim.
    expect(exp.requestedActual).toBe(result.requestedActual);
  });

  it('emits optional fields only when provided in opts', () => {
    const g = dagGraph();
    const result = run(g, { x: q(7, mwh, B, input('x')) });

    const bare = exportRun(g, result);
    expect('invarianceFlags' in bare).toBe(false);
    expect('compounds' in bare).toBe(false);
    expect('series' in bare).toBe(false);
    expect('meta' in bare).toBe(false);

    const flags: InvarianceFlag[] = [
      { id: 'c1', value: 1, locales: ['NL', 'VN'], message: 'constant' },
    ];
    const grossIn = q(10, mwh, B, input('in'));
    const grossOut = q(4, mwh, B, input('out'));
    const net = q(6, mwh, B, input('net'));
    const cmp = compound('balance', net, [
      { role: 'gross-in', key: 'in', quantity: grossIn },
      { role: 'gross-out', key: 'out', quantity: grossOut },
      { role: 'net', key: 'net', quantity: net },
    ]);
    const series = serializeTimeSeries(
      runTimeSeries(g, { x: q(7, mwh, B, input('x')) }, { dt: 1, horizon: 3, stocks: [] }),
      result.provenance,
      [],
    );
    const meta = { poweredBy: 'Symoto' };

    const full = exportRun(g, result, {
      invarianceFlags: flags,
      compounds: [cmp],
      series,
      meta,
    });
    expect(full.invarianceFlags).toEqual(flags);
    expect(full.compounds).toHaveLength(1);
    expect(full.compounds![0]!.net.value).toBe(6);
    expect(full.compounds![0]!.components).toHaveLength(3);
    expect('provenance' in full.compounds![0]!.net).toBe(false);
    expect(full.series).toBe(series);
    expect(full.meta).toEqual(meta);
  });

  it('round-trips through JSON without throwing and deep-equals the original (acyclic)', () => {
    const g = dagGraph();
    const result = run(g, { x: q(7, mwh, B, input('x')) });
    const exp = exportRun(g, result, { meta: { poweredBy: 'Symoto' } });

    let roundTripped: unknown;
    expect(() => {
      roundTripped = JSON.parse(JSON.stringify(exp));
    }).not.toThrow();
    expect(roundTripped).toEqual(exp);
  });

  it('recomputes no value: exported readouts equal result.readouts exactly', () => {
    const g = dagGraph();
    const result = run(g, { x: q(3.14159, mwh, B, input('x')) });
    const exp = exportRun(g, result);
    expect(exp.readouts.r!.value).toBe(result.readouts.r!.value);
  });
});
