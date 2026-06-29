import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/graph/graph.js';
import type { Node, QMap, Port } from '../src/graph/node.js';
import type { Boundary } from '../src/quantity/boundary.js';
import type { SymUnit } from '../src/quantity/units.js';
import { unit } from '../src/quantity/units.js';
import { q } from '../src/quantity/quantity.js';
import { input } from '../src/quantity/provenance.js';
import { run } from '../src/eval/evaluate.js';
import { runTimeSeries, type StockSpec } from '../src/time/integrator.js';
import { serializeTimeSeries } from '../src/time/series.js';

// Playback-series serialization (TIME-03): a JSON-round-trippable structure with one ProvenanceTrace
// and per-frame readout and stock scalars, never a nested ProvRef.

const FLOW_B: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };
const STOCK_B: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'stock' };
const m3 = unit('m^3');
const m3PerYr = unit('m^3/year');

function port(id: string, u: SymUnit, boundary: Boundary): Port {
  return { id, signature: { dimension: u.dimension, boundary, unit: u } };
}

function bathtubGraph(rate: number) {
  const src: Node = {
    id: 'src',
    kind: 'readout',
    ports: { in: [], out: [port('rate', m3PerYr, FLOW_B)] },
    compute: (): QMap => ({ rate: q(rate, m3PerYr, FLOW_B, input('rate')) }),
  };
  return buildGraph([src], []);
}

const volumeStock: StockSpec = {
  id: 'volume',
  initial: q(0, m3, STOCK_B, input('initial:volume')),
  inflowKeys: ['rate'],
};

describe('serializeTimeSeries round-trip and trace shape (TIME-03)', () => {
  it('serializes frames to scalar readouts and stocks and embeds the run ProvenanceTrace once', () => {
    const g = bathtubGraph(10);
    const series = runTimeSeries(g, {}, { dt: 1, horizon: 5, stocks: [volumeStock] });
    const trace = run(g, {}).provenance;
    const serialized = serializeTimeSeries(series, trace, [volumeStock]);

    expect(serialized.provenance).toBe(trace);
    expect(serialized.frames).toHaveLength(5);
    const f = serialized.frames[1]!;
    const readout = f.readouts.rate!;
    expect(typeof readout.value).toBe('number');
    expect(readout.unit.canonical).toBe(m3PerYr.canonical);
    expect(readout.boundary).toEqual(FLOW_B);
    expect('provenance' in readout).toBe(false);
    const stockScalar = f.stocks.volume!;
    expect(typeof stockScalar.value).toBe('number');
    expect(stockScalar.unit.canonical).toBe(m3.canonical);
    expect('provenance' in stockScalar).toBe(false);
  });

  it('round-trips through JSON without throwing and deep-equals the original (no cycles)', () => {
    const g = bathtubGraph(10);
    const series = runTimeSeries(g, {}, { dt: 1, horizon: 5, stocks: [volumeStock] });
    const serialized = serializeTimeSeries(series, run(g, {}).provenance, [volumeStock]);

    let roundTripped: unknown;
    expect(() => {
      roundTripped = JSON.parse(JSON.stringify(serialized));
    }).not.toThrow();
    expect(roundTripped).toEqual(serialized);
  });

  it('embeds the Phase 5 node + edge id-list trace and carries the serialized stock specs', () => {
    const g = bathtubGraph(10);
    const series = runTimeSeries(g, {}, { dt: 1, horizon: 5, stocks: [volumeStock] });
    const serialized = serializeTimeSeries(series, run(g, {}).provenance, [volumeStock]);

    expect(Array.isArray(serialized.provenance.nodes)).toBe(true);
    expect(Array.isArray(serialized.provenance.edges)).toBe(true);

    expect(serialized.stocks).toHaveLength(1);
    const s = serialized.stocks[0]!;
    expect(s.id).toBe('volume');
    expect(s.initial.value).toBe(0);
    expect(s.initial.unit.canonical).toBe(m3.canonical);
    expect(s.initial.boundary).toEqual(STOCK_B);
  });
});
