import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/graph/graph.js';
import type { Node, QMap, Port } from '../src/graph/node.js';
import type { Boundary } from '../src/quantity/boundary.js';
import type { Quantity } from '../src/quantity/quantity.js';
import type { SymUnit } from '../src/quantity/units.js';
import { unit } from '../src/quantity/units.js';
import { q } from '../src/quantity/quantity.js';
import { input } from '../src/quantity/provenance.js';
import { run } from '../src/eval/evaluate.js';
import { runTimeSeries } from '../src/time/integrator.js';

// The fixed-step integrator (TIME-01, TIME-02 mechanism, TIME-04 mechanism). Synthetic graphs prove:
// degenerate-snapshot equality (a stock-less single step == run), exact conservation, step-independence
// for constant-rate flows, the explicit-initial throw, saturating expressibility (state-dependent
// outflow approaching but not exceeding a cap), clock threading, and parameter validation.

const FLOW_B: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };
const STOCK_B: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'stock' };
const m3 = unit('m^3');
const m3PerYr = unit('m^3/year');

function port(id: string, u: SymUnit, boundary: Boundary): Port {
  return { id, signature: { dimension: u.dimension, boundary, unit: u } };
}

/** A single readout node emitting a constant flow `rate` (the bathtub source). */
function constSourceGraph(rate: number) {
  const src: Node = {
    id: 'src',
    kind: 'readout',
    ports: { in: [], out: [port('rate', m3PerYr, FLOW_B)] },
    compute: (): QMap => ({ rate: q(rate, m3PerYr, FLOW_B, input('rate')) }),
  };
  return buildGraph([src], []);
}

/** Inflow = k*cap (constant); outflow = k*currentLevel (reads the injected stock): net = k*(cap - level). */
function saturatingGraph(k: number, cap: number) {
  const inflow: Node = {
    id: 'inflow',
    kind: 'readout',
    ports: { in: [], out: [port('inRate', m3PerYr, FLOW_B)] },
    compute: (): QMap => ({ inRate: q(k * cap, m3PerYr, FLOW_B, input('inRate')) }),
  };
  const outflow: Node = {
    id: 'outflow',
    kind: 'readout',
    ports: { in: [], out: [port('outRate', m3PerYr, FLOW_B)] },
    compute: (ctx): QMap => {
      const level = ctx.inputs['state:level'];
      const lv = level ? level.value : 0;
      return { outRate: q(k * lv, m3PerYr, FLOW_B, input('outRate')) };
    },
  };
  return buildGraph([inflow, outflow], []);
}

/** A readout whose flow depends on ctx.clock.t, proving the clock is threaded each step. */
function clockGraph(base: number) {
  const clk: Node = {
    id: 'clk',
    kind: 'readout',
    ports: { in: [], out: [port('clockRate', m3PerYr, FLOW_B)] },
    compute: (ctx): QMap => {
      const t = ctx.clock ? ctx.clock.t : 0;
      return { clockRate: q(base + t, m3PerYr, FLOW_B, input('clockRate')) };
    },
  };
  return buildGraph([clk], []);
}

const volumeStock = (): import('../src/time/integrator.js').StockSpec => ({
  id: 'volume',
  initial: q(0, m3, STOCK_B, input('initial:volume')),
  inflowKeys: ['rate'],
});

describe('runTimeSeries degenerate equality (TIME-02 mechanism)', () => {
  it('a stock-less single step returns exactly one frame equal to run(graph, inputs).readouts with empty stocks', () => {
    const g = constSourceGraph(10);
    const direct = run(g, {});
    const ts = runTimeSeries(g, {}, { dt: 1, horizon: 1 });
    expect(ts.frames).toHaveLength(1);
    expect(ts.frames[0]?.t).toBe(0);
    expect(ts.frames[0]?.stocks).toEqual({});
    const frameReadouts = ts.frames[0]!.readouts;
    expect(Object.keys(frameReadouts).sort()).toEqual(Object.keys(direct.readouts).sort());
    for (const key of Object.keys(direct.readouts)) {
      const a = frameReadouts[key]!;
      const b = direct.readouts[key]!;
      expect(a.value).toBe(b.value);
      expect(a.unit.canonical).toBe(b.unit.canonical);
      expect(a.boundary).toEqual(b.boundary);
    }
  });
});

describe('runTimeSeries conservation (TIME-04 mechanism)', () => {
  it('a constant-rate bathtub closes each step: increment === rate * dt to machine epsilon', () => {
    const rate = 10;
    const ts = runTimeSeries(constSourceGraph(rate), {}, { dt: 1, horizon: 5, stocks: [volumeStock()] });
    expect(ts.frames).toHaveLength(5);
    for (let i = 1; i < ts.frames.length; i += 1) {
      const inc = ts.frames[i]!.stocks.volume!.value - ts.frames[i - 1]!.stocks.volume!.value;
      expect(inc).toBe(rate * 1);
    }
    // Sigma-in - Sigma-out - delta-stock is zero: final cumulative equals rate * elapsed.
    expect(ts.frames[4]!.stocks.volume!.value).toBe(rate * 4);
  });
});

describe('runTimeSeries step-independence for constant-rate flows (TIME-04)', () => {
  it('the cumulative at each report time is identical at dt=1 and dt=0.5 within 1e-9', () => {
    const rate = 10;
    const a = runTimeSeries(constSourceGraph(rate), {}, { dt: 1, horizon: 5, reportEvery: 1, stocks: [volumeStock()] });
    const b = runTimeSeries(constSourceGraph(rate), {}, { dt: 0.5, horizon: 5, reportEvery: 1, stocks: [volumeStock()] });
    const at = (ts: typeof a, t: number) => ts.frames.find((f) => Math.abs(f.t - t) < 1e-9)!.stocks.volume!.value;
    for (const t of [0, 1, 2, 3, 4]) {
      expect(Math.abs(at(a, t) - at(b, t))).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(at(a, t) - t * rate)).toBeLessThanOrEqual(1e-9);
    }
  });
});

describe('runTimeSeries explicit initials and parameter validation (TIME-04, DoS guard)', () => {
  it('throws when a stock has a non-Quantity initial (a zero start must be q(0, unit, stockBoundary, ...))', () => {
    expect(() =>
      runTimeSeries(constSourceGraph(10), {}, {
        dt: 1,
        horizon: 1,
        stocks: [{ id: 'bad', initial: 0 as unknown as Quantity, inflowKeys: ['rate'] }],
      }),
    ).toThrow(/explicit Quantity initial/);
  });

  it('throws a named Error on dt <= 0, a non-finite or too-small horizon, or an over-cap step count', () => {
    const g = constSourceGraph(10);
    expect(() => runTimeSeries(g, {}, { dt: 0, horizon: 1 })).toThrow(/dt/);
    expect(() => runTimeSeries(g, {}, { dt: 1, horizon: 0.5 })).toThrow(/horizon/);
    expect(() => runTimeSeries(g, {}, { dt: 1e-9, horizon: 1 })).toThrow(/cap/);
  });
});

describe('runTimeSeries saturating expressibility (TIME-04 mechanism)', () => {
  it('a state-dependent outflow produces a monotone trajectory approaching but not exceeding the cap', () => {
    const k = 0.1;
    const cap = 100;
    const ts = runTimeSeries(saturatingGraph(k, cap), {}, {
      dt: 0.5,
      horizon: 30,
      reportEvery: 0.5,
      stocks: [
        {
          id: 'level',
          initial: q(0, m3, STOCK_B, input('initial:level')),
          stateInputKey: 'state:level',
          inflowKeys: ['inRate'],
          outflowKeys: ['outRate'],
        },
      ],
    });
    const levels = ts.frames.map((f) => f.stocks.level!.value);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]!).toBeGreaterThan(levels[i - 1]!);
    }
    const final = levels[levels.length - 1]!;
    expect(final).toBeLessThan(cap);
    expect(final).toBeGreaterThan(0.9 * cap);
  });
});

describe('runTimeSeries clock threading (TIME-01)', () => {
  it('a clock-driven inflow produces distinct values at distinct t (ctx.clock.t is read each step)', () => {
    const base = 5;
    const ts = runTimeSeries(clockGraph(base), {}, { dt: 1, horizon: 3, reportEvery: 1 });
    expect(ts.frames).toHaveLength(3);
    const vals = ts.frames.map((f) => f.readouts.clockRate!.value);
    expect(vals).toEqual([base + 0, base + 1, base + 2]);
    expect(new Set(vals).size).toBe(3);
  });
});
