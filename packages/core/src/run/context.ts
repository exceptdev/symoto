// The thin run context threaded through every node.compute. Phase 1 carries only the
// run inputs; the clock placeholder is reserved for the Phase 7 stock-flow integrator.
import type { QMap } from '../graph/node.js';

export interface RunContext {
  readonly inputs: QMap;
  readonly clock?: unknown;
}

export function makeRunContext(inputs: QMap): RunContext {
  return { inputs };
}
