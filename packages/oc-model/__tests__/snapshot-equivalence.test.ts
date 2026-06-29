import { describe, it, expect } from 'vitest';
import { runOc } from '../src/locale.js';
import { runOcTimeSeries } from '../src/playback.js';
import { PARITY_GRID } from '../src/parity.js';
import type { SimInputs } from '../src/types.js';

// The TIME-02 zero-behavior-change hard floor at the OC level: a single-step time-series run of the
// real (stock-less) OC model is byte-identical to the snapshot, over the entire 74-scenario parity
// grid. The snapshot is exactly the degenerate single-step case of the integrator.
//
// Companion floor: the existing parity suite (adapter-parity, full-model-parity, land-energy-parity)
// re-runs green, proving the snapshot run() path is untouched (it is unchanged code).

describe('OC snapshot is the degenerate single-step integrator case (TIME-02)', () => {
  it('single-step time-series readouts are byte-identical to runOc over the full parity grid', () => {
    for (const scenario of PARITY_GRID) {
      const inputs = scenario.inputs as unknown as SimInputs;
      const snapshot = runOc(inputs).readouts;
      const ts = runOcTimeSeries(inputs, { dt: 1, horizon: 1 });

      expect(ts.frames, `${scenario.id}: expected exactly one frame`).toHaveLength(1);
      const frame = ts.frames[0]!;
      expect(frame.stocks, `${scenario.id}: a stock-less OC model has empty frame stocks`).toEqual({});

      const frameKeys = Object.keys(frame.readouts).sort();
      const snapKeys = Object.keys(snapshot).sort();
      expect(frameKeys, `${scenario.id}: readout key sets must be identical`).toEqual(snapKeys);

      for (const key of snapKeys) {
        const a = frame.readouts[key]!;
        const b = snapshot[key]!;
        // Strict equality (not epsilon): the same arithmetic via the same run().
        expect(a.value, `${scenario.id}: ${key} value`).toBe(b.value);
        expect(a.unit.canonical, `${scenario.id}: ${key} unit`).toBe(b.unit.canonical);
        expect(a.boundary, `${scenario.id}: ${key} boundary`).toEqual(b.boundary);
      }
    }
  }, 60_000);
});
