// The fixed-step stock-flow integrator (TIME-01, TIME-02, TIME-04). runTimeSeries is a SEPARATE
// entry the snapshot path never invokes: it holds the stock state across timesteps as a
// Map<stockId, Quantity>, reuses the pure run() as the per-instant snapshot, advances each stock by
// the forward-Euler integrate() primitive, and emits a playback frame (run readouts plus a stock
// snapshot) every reportEvery time units. The report step is decoupled from the integration step so
// step-independence is a concrete, testable claim. A stock-less, single-step run reduces EXACTLY to
// run(graph, inputs): the snapshot is the degenerate single-step case of the integrator.
import type { Graph } from '../graph/graph.js';
import type { QMap } from '../graph/node.js';
import type { Quantity } from '../quantity/quantity.js';
import { q, isQuantity } from '../quantity/quantity.js';
import { unit } from '../quantity/units.js';
import { input } from '../quantity/provenance.js';
import { integrate, add, sub } from '../quantity/algebra.js';
import { run } from '../eval/evaluate.js';

/**
 * A declared stock: an explicit unit-bearing initial (never an implicit 0), the readout keys whose
 * flows accumulate into it (inflows minus outflows), and an optional input key under which the
 * current stock value is injected into the run inputs each step (so a state-dependent flow can read
 * the stock). A stock not listed does not exist; the stocks array is the only source of state.
 */
export interface StockSpec {
  readonly id: string;
  readonly initial: Quantity;
  readonly stateInputKey?: string;
  readonly inflowKeys: readonly string[];
  readonly outflowKeys?: readonly string[];
}

/** One playback frame: the run readouts at t, and a snapshot of every stock value at t (before the advance). */
export interface Frame {
  readonly t: number;
  readonly readouts: QMap;
  readonly stocks: Readonly<Record<string, Quantity>>;
}

/** The in-memory time-series result: the emitted frames, the final stock values, and the run meta. */
export interface TimeSeriesResult {
  readonly frames: readonly Frame[];
  readonly finalStocks: Readonly<Record<string, Quantity>>;
  readonly meta: { readonly dt: number; readonly horizon: number; readonly reportEvery: number };
}

/** Cap on the number of integration steps, so a bad parameter fails loud rather than hanging. */
const MAX_STEPS = 1e6;

/** The isolated one-step forward-Euler advance, kept separate so the scheme is swappable later. */
function eulerStep(current: Quantity, netFlow: Quantity, dtQuantity: Quantity): Quantity {
  return integrate(current, netFlow, dtQuantity);
}

/** Sum the readouts at the inflow keys, then subtract the readouts at the outflow keys, via add/sub
 *  (so a flow that disagrees in unit or boundary throws, surfacing a model error, never a silent net). */
function netFlowFor(stock: StockSpec, readouts: QMap): Quantity {
  let acc: Quantity | undefined;
  for (const key of stock.inflowKeys) {
    const v = readouts[key];
    if (v === undefined) throw new Error(`runTimeSeries: stock "${stock.id}" inflow key "${key}" is not a run readout.`);
    acc = acc === undefined ? v : add(acc, v);
  }
  if (acc === undefined) throw new Error(`runTimeSeries: stock "${stock.id}" declares no inflow keys.`);
  for (const key of stock.outflowKeys ?? []) {
    const v = readouts[key];
    if (v === undefined) throw new Error(`runTimeSeries: stock "${stock.id}" outflow key "${key}" is not a run readout.`);
    acc = sub(acc, v);
  }
  return acc;
}

/** Half-open [0, horizon) report rule: emit a frame when t is a multiple of reportEvery within tolerance. */
function isReportTime(t: number, reportEvery: number): boolean {
  const nearestMultiple = Math.round(t / reportEvery) * reportEvery;
  return Math.abs(t - nearestMultiple) <= 1e-9 * Math.max(1, reportEvery, Math.abs(t));
}

function snapshot(current: Map<string, Quantity>): Record<string, Quantity> {
  const out: Record<string, Quantity> = {};
  for (const [id, qty] of current) out[id] = qty;
  return out;
}

/**
 * Run a fixed-step time series. Integrates at the fine `dt`, emits a frame every `reportEvery` time
 * units (default `dt`). With no stocks and `horizon === dt`, the loop runs once and returns a single
 * frame whose readouts are byte-identical to run(graph, inputs).readouts (the snapshot is the
 * degenerate single-step case). Validates dt > 0, a finite horizon >= dt, a finite reportEvery > 0,
 * a bounded step count, and an explicit Quantity initial per stock; any violation throws a named Error.
 */
export function runTimeSeries(
  graph: Graph,
  inputs: QMap,
  opts: {
    dt: number;
    horizon: number;
    reportEvery?: number;
    stocks?: readonly StockSpec[];
    locale?: string;
    dtUnit?: string;
  },
): TimeSeriesResult {
  const { dt, horizon } = opts;
  const reportEvery = opts.reportEvery ?? dt;
  const stocks = opts.stocks ?? [];

  if (!Number.isFinite(dt) || dt <= 0) throw new Error(`runTimeSeries: dt must be finite and > 0, got ${dt}.`);
  if (!Number.isFinite(horizon) || horizon < dt) {
    throw new Error(`runTimeSeries: horizon must be finite and >= dt (${dt}), got ${horizon}.`);
  }
  if (!Number.isFinite(reportEvery) || reportEvery <= 0) {
    throw new Error(`runTimeSeries: reportEvery must be finite and > 0, got ${reportEvery}.`);
  }
  const stepCount = Math.round(horizon / dt);
  if (!Number.isFinite(stepCount) || stepCount > MAX_STEPS) {
    throw new Error(`runTimeSeries: step count ${stepCount} (horizon/dt) is not finite or exceeds the cap ${MAX_STEPS}.`);
  }
  for (const stock of stocks) {
    if (!isQuantity(stock.initial)) {
      throw new Error(`runTimeSeries: stock "${stock.id}" has no explicit Quantity initial (a zero start must be q(0, unit, stockBoundary, ...)).`);
    }
  }

  const dtUnitName = opts.dtUnit ?? 'year';
  const dtQuantity = q(dt, unit(dtUnitName), { accounting: 'territorial', basis: 'absolute', temporal: 'flow' }, input('dt'));

  const current = new Map<string, Quantity>();
  for (const stock of stocks) current.set(stock.id, stock.initial);

  const frames: Frame[] = [];
  for (let i = 0; i * dt < horizon; i += 1) {
    const t = i * dt;
    const stepInputs: QMap = { ...inputs };
    for (const stock of stocks) {
      if (stock.stateInputKey !== undefined) {
        const v = current.get(stock.id);
        if (v !== undefined) stepInputs[stock.stateInputKey] = v;
      }
    }
    const res = run(graph, stepInputs, { locale: opts.locale, clock: { t, dt } });
    if (isReportTime(t, reportEvery)) {
      frames.push({ t, readouts: res.readouts, stocks: snapshot(current) });
    }
    for (const stock of stocks) {
      const cur = current.get(stock.id);
      if (cur === undefined) continue;
      const netFlow = netFlowFor(stock, res.readouts);
      current.set(stock.id, eulerStep(cur, netFlow, dtQuantity));
    }
  }

  return { frames, finalStocks: snapshot(current), meta: { dt, horizon, reportEvery } };
}
