// The curated catalogue of allowed boundary transitions (UNIT-04). Crossing a boundary is
// legal only if a listed transition covers it, and every crossing leaves an adapter trace
// in provenance. The three transitions are the real Orchid City crossings named in the
// ROADMAP Phase 2 success criteria:
//   per-capita-to-absolute  (per-capita demand or emissions x population -> absolute)
//   intensity               (energy x emission factor -> emissions, e.g. MWh x t/MWh -> t)
//   area-rate               (generation x rate -> land area, e.g. MWh x m^2/MWh -> m^2)
//
// Each transition's matches() is a PRECISE field predicate over the boundary, never a
// catch-all true, so an over-broad match cannot reopen the silent-net bug. findTransition
// requires both the method name AND the predicate, so an unknown method or an unmatched
// from/to returns undefined (the no-bypass property adapt() relies on in Plan 03).
//
// Units compose only through the wrapped helpers in units.ts; this module never imports
// mathjs directly (@symoto/core confines mathjs to units.ts).
import { q, type Quantity } from './quantity.js';
import { BoundaryViolation, boundariesEqual, type Boundary } from './boundary.js';
import { composeMul, sameDimension, unit } from './units.js';
import { adapterProv } from './provenance.js';

export interface BoundaryTransition {
  readonly method: string; // stable id; appears in provenance
  readonly description: string;
  matches(from: Boundary, to: Boundary): boolean;
  apply(a: Quantity, to: Boundary, operand?: Quantity): Quantity; // returns a Quantity carrying `to` and an adapter ProvRef
}

// "All fields except basis are equal" -- force the basis to match, then compare deeply.
function equalExceptBasis(from: Boundary, to: Boundary): boolean {
  return boundariesEqual({ ...from, basis: to.basis }, to);
}

// "All fields except accounting are equal" -- force accounting to match, then compare.
function equalExceptAccounting(from: Boundary, to: Boundary): boolean {
  return boundariesEqual({ ...from, accounting: to.accounting }, to);
}

function requireOperand(method: string, operand: Quantity | undefined): Quantity {
  if (!operand) {
    throw new BoundaryViolation(
      `Transition "${method}" requires an operand, but none was supplied. A boundary crossing cannot be computed without its operand.`,
    );
  }
  return operand;
}

const perCapitaToAbsolute: BoundaryTransition = {
  method: 'per-capita-to-absolute',
  description: 'Lift a per-capita quantity to absolute by multiplying by an absolute population.',
  matches(from, to) {
    return from.basis === 'per-capita' && to.basis === 'absolute' && equalExceptBasis(from, to);
  },
  apply(a, to, operand) {
    const population = requireOperand('per-capita-to-absolute', operand);
    if (population.boundary.basis !== 'absolute' || !sameDimension(population.unit, unit('person'))) {
      throw new BoundaryViolation(
        `Transition "per-capita-to-absolute" requires an absolute population operand (basis absolute, dimension person), got basis ${population.boundary.basis}, unit ${population.unit.canonical}.`,
      );
    }
    return q(
      a.value * population.value,
      composeMul(a.unit, population.unit),
      to,
      adapterProv('per-capita-to-absolute', a.boundary, to, [a.provenance, population.provenance]),
    );
  },
};

const intensity: BoundaryTransition = {
  method: 'intensity',
  description: 'Apply an intensity factor across an accounting crossing (e.g. MWh x t/MWh -> tonnes).',
  matches(from, to) {
    return from.accounting !== to.accounting && equalExceptAccounting(from, to);
  },
  apply(a, to, operand) {
    const factor = requireOperand('intensity', operand);
    return q(
      a.value * factor.value,
      composeMul(a.unit, factor.unit),
      to,
      adapterProv('intensity', a.boundary, to, [a.provenance, factor.provenance]),
    );
  },
};

const areaRate: BoundaryTransition = {
  method: 'area-rate',
  description: 'Convert a flow quantity into a spatial stock via a rate (e.g. MWh x m^2/MWh -> m^2).',
  matches(from, to) {
    return from.temporal === 'flow' && to.temporal === 'stock' && from.basis !== to.basis;
  },
  apply(a, to, operand) {
    const rate = requireOperand('area-rate', operand);
    return q(
      a.value * rate.value,
      composeMul(a.unit, rate.unit),
      to,
      adapterProv('area-rate', a.boundary, to, [a.provenance, rate.provenance]),
    );
  },
};

export const BOUNDARY_CATALOGUE: readonly BoundaryTransition[] = Object.freeze([
  perCapitaToAbsolute,
  intensity,
  areaRate,
]);

/**
 * Resolve a transition by method AND from/to predicate. An unknown method, or a known
 * method whose predicate rejects the from/to pair, returns undefined. There is no
 * silent fallthrough that could become a refuse-to-net bypass (UNIT-04, no check-bypass).
 */
export function findTransition(method: string, from: Boundary, to: Boundary): BoundaryTransition | undefined {
  return BOUNDARY_CATALOGUE.find((t) => t.method === method && t.matches(from, to));
}
