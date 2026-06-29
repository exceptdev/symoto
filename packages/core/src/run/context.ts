// The thin run context threaded through every node.compute. It carries the run inputs, the reserved
// clock placeholder (Phase 7 stock-flow integrator), and the requested-vs-actual clamp sink
// (PROV-03): nodes push a record when they clamp or recompute an input, and run() returns them.
import type { QMap } from '../graph/node.js';
import type { RequestedActual } from './requestedActual.js';

export interface RunContext {
  readonly inputs: QMap;
  readonly clock?: unknown;
  /**
   * The run locale (ISO country/region), a first-class parameter (LOC-01). When set, the evaluator
   * stamps it onto every node output boundary, so locale propagates through connected nodes via every
   * Quantity's boundary. When undefined, output boundaries stay locale-less and the run is byte-identical.
   */
  readonly locale?: string;
  /** The collected requested-vs-actual records (one per key; recordClamp upserts). */
  readonly clamps: RequestedActual[];
  /** Push a requested-vs-actual record, replacing any existing record for the same key. */
  recordClamp(record: RequestedActual): void;
}

export function makeRunContext(inputs: QMap, opts?: { locale?: string }): RunContext {
  const clamps: RequestedActual[] = [];
  return {
    inputs,
    locale: opts?.locale,
    clamps,
    recordClamp(record: RequestedActual): void {
      // Upsert by key: a node in the fixed-point cyclic region computes once per iteration, so the
      // final converged record must replace earlier ones rather than accumulating duplicates.
      const i = clamps.findIndex((c) => c.key === record.key);
      if (i >= 0) clamps[i] = record;
      else clamps.push(record);
    },
  };
}
