// OC stock-flow playback (Phase 7). runOcTimeSeries runs the stock-less OC model through the core
// integrator with the country's ISO locale. The OC model is a pure snapshot (no stock nodes), so a
// single-step run is the canonical TIME-02 witness: the snapshot is exactly the degenerate
// single-step case of the integrator, byte-identical to runOc over the full parity grid. This file
// does NOT touch buildOcModel, the OC nodes, runOc, computeScenarioViaSymoto, or parity.ts.
import {
  runTimeSeries,
  serializeTimeSeries,
  buildGraph,
  run,
  q,
  unit,
  opProv,
  input,
  type TimeSeriesResult,
  type SerializedTimeSeries,
  type StockSpec,
  type Node,
  type Connection,
  type QMap,
} from '@symoto/core';
import { buildOcModel } from './model.js';
import { localeOf } from './locale.js';
import { CARBON_OPERATIONAL, tU, port } from './boundaries.js';
import type { SimInputs } from './types.js';

/**
 * Run the stock-less OC model through the integrator with the country's ISO locale. With
 * horizon === dt, the result has a single frame whose readouts equal runOc(inputs).readouts and
 * whose stocks is {}. It reads only via runTimeSeries (which reuses the pure run); it recomputes
 * no readout.
 */
export function runOcTimeSeries(
  inputs: SimInputs,
  opts: { dt: number; horizon: number; reportEvery?: number },
): TimeSeriesResult {
  return runTimeSeries(buildOcModel(inputs), {}, {
    dt: opts.dt,
    horizon: opts.horizon,
    reportEvery: opts.reportEvery,
    locale: localeOf(inputs.country),
  });
}

// --- Genuine OC cumulative net operational carbon stock (Plan 05, TIME-03, TIME-04) ----------------

/** The OC annual net operational-carbon readout (t, CARBON_OPERATIONAL flow) the rate node consumes. */
const NET_CARBON_KEY = 'emissions.netCarbonTonnesPerYr';
/** The appended per-year carbon-rate readout key (t/year), the cumulative-carbon inflow. */
const CARBON_RATE_KEY = 'carbonRate.tonnesPerYr';
/** The carbon-rate node's in-port, fed by the emissions net-carbon readout. */
const CARBON_RATE_IN = 'carbonRate.netCarbonIn';

const tPerYrU = unit('t/year');

/**
 * The appended carbon-rate readout node. It consumes the annual operational-carbon readout (t, an
 * annual total over the year) and re-emits it as a per-year RATE (t/year), recording a labeled
 * 'convert' op in provenance. This is an EXPLICIT, provenance-visible annual-total-to-rate
 * reinterpretation, never a silent unit swap; integrate then composes t/year * year -> t.
 */
function makeCarbonRateNode(): Node {
  return {
    id: 'n9-carbon-rate',
    kind: 'readout',
    ports: {
      in: [port(CARBON_RATE_IN, tU, CARBON_OPERATIONAL)],
      out: [port(CARBON_RATE_KEY, tPerYrU, CARBON_OPERATIONAL)],
    },
    compute: (_ctx, inputs): QMap => {
      const incoming = inputs[CARBON_RATE_IN];
      const value = incoming ? incoming.value : 0;
      const prov = incoming ? incoming.provenance : input(CARBON_RATE_IN);
      // Labeled annual-total -> per-year-rate reinterpretation (visible as a convert op).
      return { [CARBON_RATE_KEY]: q(value, tPerYrU, CARBON_OPERATIONAL, opProv('convert', [prov])) };
    },
  };
}

/** Build a COPY of the OC graph with the appended carbon-rate node and one feeding connection. The
 *  unaugmented buildOcModel is untouched, so the snapshot-equivalence floor (Plan 04) stays valid. */
function buildCarbonPlaybackGraph(inputs: SimInputs) {
  const base = buildOcModel(inputs);
  const rateConnection: Connection = {
    from: { nodeId: 'n8-emissions', portId: NET_CARBON_KEY },
    to: { nodeId: 'n9-carbon-rate', portId: CARBON_RATE_IN },
  };
  return buildGraph([...base.nodes, makeCarbonRateNode()], [...base.connections, rateConnection]);
}

/** The cumulative net operational carbon stock: an explicit unit-bearing initial of 0 t (never an
 *  implicit 0), accumulating the carbon-rate inflow. The initial carries the run locale so it shares
 *  the accounting frame of the locale-stamped inflow readout. */
function makeCumulativeCarbonStock(locale: string): StockSpec {
  return {
    id: 'cumulativeCarbon',
    initial: q(
      0,
      tU,
      { ...CARBON_OPERATIONAL, temporal: 'stock', locale },
      input('initial:cumulativeCarbon'),
    ),
    inflowKeys: [CARBON_RATE_KEY],
  };
}

/**
 * Accumulate the OC model's annual net operational carbon into a cumulative-carbon stock over a
 * multi-year horizon, and serialize the playback series. The OC drivers do not vary in time, so the
 * annual rate is constant and the cumulative at report year N is N times the annual rate. Returns the
 * in-memory series and its serialized (JSON-round-trippable) form.
 */
export function runOcCarbonPlayback(
  inputs: SimInputs,
  opts: { horizon: number; dt?: number; reportEvery?: number },
): { series: TimeSeriesResult; serialized: SerializedTimeSeries } {
  const dt = opts.dt ?? 1;
  const reportEvery = opts.reportEvery ?? 1;
  const locale = localeOf(inputs.country);
  const carbonGraph = buildCarbonPlaybackGraph(inputs);
  const cumulativeCarbon = makeCumulativeCarbonStock(locale);
  const series = runTimeSeries(carbonGraph, {}, {
    dt,
    horizon: opts.horizon,
    reportEvery,
    stocks: [cumulativeCarbon],
    locale,
  });
  const serialized = serializeTimeSeries(series, run(carbonGraph, {}, { locale }).provenance, [cumulativeCarbon]);
  return { series, serialized };
}
