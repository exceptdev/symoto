// OC stock-flow playback (Phase 7). runOcTimeSeries runs the stock-less OC model through the core
// integrator with the country's ISO locale. The OC model is a pure snapshot (no stock nodes), so a
// single-step run is the canonical TIME-02 witness: the snapshot is exactly the degenerate
// single-step case of the integrator, byte-identical to runOc over the full parity grid. This file
// does NOT touch buildOcModel, the OC nodes, runOc, computeScenarioViaSymoto, or parity.ts.
import { runTimeSeries, type TimeSeriesResult } from '@symoto/core';
import { buildOcModel } from './model.js';
import { localeOf } from './locale.js';
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
