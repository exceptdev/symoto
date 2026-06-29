// Requested-vs-actual (PROV-03). When a node clamps or recomputes an input, the run records both the
// value the user requested and the value actually achieved, so a clamped input is never presented as
// honored. A record is value-neutral metadata: it sits alongside the readout's unchanged value.
import type { SymUnit } from '../quantity/units.js';
import type { Boundary } from '../quantity/boundary.js';

export interface RequestedActual {
  readonly key: string;
  readonly requested: number;
  readonly actual: number;
  readonly clamped: boolean;
  readonly reason?: string;
  readonly unit?: SymUnit;
  readonly boundary?: Boundary;
}

/**
 * Build a RequestedActual where `clamped` is derived from `requested !== actual`. Use this when the
 * clamp is exactly "the achieved value was bounded below the requested value" (the monotone clamp
 * case, e.g. the water self-sufficiency ceiling). For a clamp signaled by a separate flag (e.g. the
 * wind siting cap, where an over-target surplus is not a clamp), build the record directly with the
 * intended `clamped` value instead.
 */
export function clampRecord(
  key: string,
  requested: number,
  actual: number,
  reason?: string,
  unit?: SymUnit,
  boundary?: Boundary,
): RequestedActual {
  return { key, requested, actual, clamped: requested !== actual, reason, unit, boundary };
}
