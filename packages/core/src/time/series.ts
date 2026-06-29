// Playback-series serialization (TIME-03). A time-series run serializes to a plain, acyclic,
// JSON-round-trippable structure built on the Phase 5 provenance contract: the topology and
// provenance do not change across frames, so the ProvenanceTrace (from serializeTrace) is carried
// ONCE at the run level and each frame holds only per-t readout and stock scalars
// ({ value, unit, boundary }), never a nested ProvRef object. This is the exact shape Phase 8
// (PROV-04) extends to export a full run, so the two stay one contract.
import type { Quantity } from '../quantity/quantity.js';
import type { SymUnit } from '../quantity/units.js';
import type { Boundary } from '../quantity/boundary.js';
import type { QMap } from '../graph/node.js';
import type { ProvenanceTrace } from '../provenance/trace.js';
import type { TimeSeriesResult, StockSpec } from './integrator.js';

/** A Quantity flattened to a plain scalar: value, unit, and boundary, with NO provenance object. */
export interface SerializedQuantity {
  readonly value: number;
  readonly unit: SymUnit;
  readonly boundary: Boundary;
}

/** A serialized frame: the time, and the readout and stock scalar maps at that time. */
export interface SerializedFrame {
  readonly t: number;
  readonly readouts: Readonly<Record<string, SerializedQuantity>>;
  readonly stocks: Readonly<Record<string, SerializedQuantity>>;
}

/** A serialized stock spec: its id and its explicit initial scalar. */
export interface SerializedStock {
  readonly id: string;
  readonly initial: SerializedQuantity;
}

/** The serialized playback series: meta, the stock specs, one provenance trace, and the frames. */
export interface SerializedTimeSeries {
  readonly meta: { readonly dt: number; readonly horizon: number; readonly reportEvery: number };
  readonly stocks: readonly SerializedStock[];
  readonly provenance: ProvenanceTrace;
  readonly frames: readonly SerializedFrame[];
}

/** Flatten a Quantity to its scalar (value, unit, boundary); the run-level trace carries provenance once. */
function serializeQ(qty: Quantity): SerializedQuantity {
  return { value: qty.value, unit: qty.unit, boundary: qty.boundary };
}

/** Map a Record<string, Quantity> to a Record<string, SerializedQuantity>. */
function mapValues(map: Readonly<Record<string, Quantity>> | QMap): Record<string, SerializedQuantity> {
  const out: Record<string, SerializedQuantity> = {};
  for (const key of Object.keys(map)) {
    const qty = map[key];
    if (qty !== undefined) out[key] = serializeQ(qty);
  }
  return out;
}

/**
 * Serialize a time-series run into a plain, acyclic, JSON-round-trippable structure. The passed
 * ProvenanceTrace (the acyclic serializeTrace output, typically a run's `.provenance`) is embedded
 * verbatim once; frames carry only per-t scalars, so JSON.stringify never throws on a circular
 * reference.
 */
export function serializeTimeSeries(
  result: TimeSeriesResult,
  trace: ProvenanceTrace,
  stocks?: readonly StockSpec[],
): SerializedTimeSeries {
  return {
    meta: result.meta,
    stocks: (stocks ?? []).map((s) => ({ id: s.id, initial: serializeQ(s.initial) })),
    provenance: trace,
    frames: result.frames.map((f) => ({
      t: f.t,
      readouts: mapValues(f.readouts),
      stocks: mapValues(f.stocks),
    })),
  };
}
