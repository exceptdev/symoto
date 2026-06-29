import { describe, it, expect } from 'vitest';
import { runOc } from '../src/locale.js';
import { runOcCarbonPlayback } from '../src/playback.js';
import type { SimInputs } from '../src/types.js';
import type { TimeSeriesResult } from '@symoto/core';

// The genuine OC cumulative net operational carbon stock (TIME-03, TIME-04 on the OC use case). The
// integrator accumulates the OC model's annual net operational carbon over a multi-year horizon on a
// COPY of the OC graph (buildOcModel untouched), proving accumulation, conservation,
// step-independence, serialization, and per-frame snapshot identity against a real OC number.

const NET_CARBON_KEY = 'emissions.netCarbonTonnesPerYr';
const NL: SimInputs = { population: 50_000, country: 'Netherlands' } as SimInputs;

const REL = 1e-9;
function closeRel(actual: number, expected: number, rel = REL): boolean {
  return Math.abs(actual - expected) <= rel * Math.max(1, Math.abs(expected));
}
function frameAt(ts: TimeSeriesResult, t: number) {
  return ts.frames.find((f) => Math.abs(f.t - t) < 1e-9)!;
}

describe('OC cumulative net operational carbon playback (TIME-03, TIME-04)', () => {
  const annualRate = runOc(NL).readouts[NET_CARBON_KEY]!.value;

  it('the annual operational-carbon rate is a real, finite OC number', () => {
    expect(Number.isFinite(annualRate)).toBe(true);
    expect(annualRate).not.toBe(0);
  });

  it('cumulative carbon at report year N equals N times the constant annual rate within 1e-9', () => {
    const { series } = runOcCarbonPlayback(NL, { horizon: 30, dt: 1, reportEvery: 1 });
    expect(frameAt(series, 0).stocks.cumulativeCarbon!.value).toBe(0);
    for (const n of [10, 20, 29]) {
      const cumulative = frameAt(series, n).stocks.cumulativeCarbon!.value;
      expect(closeRel(cumulative, n * annualRate), `year ${n}: ${cumulative} vs ${n * annualRate}`).toBe(true);
    }
  });

  it('conserves each step: the per-year increment equals the annual rate to machine epsilon', () => {
    const { series } = runOcCarbonPlayback(NL, { horizon: 30, dt: 1, reportEvery: 1 });
    for (let i = 1; i < series.frames.length; i += 1) {
      const inc = series.frames[i]!.stocks.cumulativeCarbon!.value - series.frames[i - 1]!.stocks.cumulativeCarbon!.value;
      expect(closeRel(inc, annualRate)).toBe(true);
    }
  });

  it('is step-independent: dt=0.5 report-year cumulatives match dt=1 within 1e-9', () => {
    const a = runOcCarbonPlayback(NL, { horizon: 30, dt: 1, reportEvery: 1 }).series;
    const b = runOcCarbonPlayback(NL, { horizon: 30, dt: 0.5, reportEvery: 1 }).series;
    for (const n of [5, 10, 20, 29]) {
      const av = frameAt(a, n).stocks.cumulativeCarbon!.value;
      const bv = frameAt(b, n).stocks.cumulativeCarbon!.value;
      expect(closeRel(av, bv), `year ${n}: dt=1 ${av} vs dt=0.5 ${bv}`).toBe(true);
    }
  });

  it('serializes: the playback series round-trips via JSON and carries the explicit cumulative-carbon initial', () => {
    const { serialized } = runOcCarbonPlayback(NL, { horizon: 30, dt: 1, reportEvery: 1 });
    let roundTripped: unknown;
    expect(() => {
      roundTripped = JSON.parse(JSON.stringify(serialized));
    }).not.toThrow();
    expect(roundTripped).toEqual(serialized);

    expect(serialized.stocks).toHaveLength(1);
    const s = serialized.stocks[0]!;
    expect(s.id).toBe('cumulativeCarbon');
    expect(s.initial.value).toBe(0);
    expect(s.initial.unit.canonical).toBe('t');
    expect(s.initial.boundary.temporal).toBe('stock');
    // Each frame carries the cumulative-carbon stock scalar.
    expect(serialized.frames[5]!.stocks.cumulativeCarbon!.value).toBeGreaterThan(0);
  });

  it('per-frame snapshot identity: the OC readouts in each frame equal runOc byte-identically', () => {
    const { series } = runOcCarbonPlayback(NL, { horizon: 30, dt: 1, reportEvery: 1 });
    const snapshot = runOc(NL).readouts;
    const frame = frameAt(series, 7);
    for (const key of Object.keys(snapshot)) {
      const a = frame.readouts[key]!;
      const b = snapshot[key]!;
      expect(a.value, `${key} value`).toBe(b.value);
      expect(a.unit.canonical, `${key} unit`).toBe(b.unit.canonical);
    }
  });
});
