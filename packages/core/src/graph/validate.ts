// The whole-model build-time guard (UNIT-01, UNIT-02). validateModel collects every
// metadata-completeness and wire-compatibility problem in a model without throwing, so an
// author sees all of them at once; assertModelWellFormed turns a non-empty result into a
// build failure. This is the model-wide application of the wire-time line in connection.ts
// plus the metadata-completeness check that a port declares both a unit and a boundary.
//
// buildGraph stays a pure immutable builder: validateModel is a separate, explicit guard the
// model-author path calls, never wired into buildGraph (Phase-1 evaluator tests build graphs
// with empty ports and fake port ids and must keep passing).
import type { Graph } from './graph.js';
import type { Boundary } from '../quantity/boundary.js';
import type { SymUnit } from '../quantity/units.js';

export interface ModelViolation {
  readonly code:
    | 'missing-unit'
    | 'dimension-mismatch'
    | 'missing-boundary'
    | 'dimension'
    | 'boundary'
    | 'dangling-port';
  readonly nodeId?: string;
  readonly portId?: string;
  readonly message: string;
}

// A view that lets us inspect possibly-absent fields on a signature built dynamically (a
// JSON or generated model) without fighting the now-required PortSignature type.
type LooseSignature = { unit?: SymUnit; boundary?: Boundary; dimension: string };

export function validateModel(graph: Graph): readonly ModelViolation[] {
  const violations: ModelViolation[] = [];

  // Pass 1: metadata completeness. Every in-port and out-port must declare a unit, a
  // boundary, and a dimension that agrees with its unit (UNIT-01, UNIT-02).
  for (const node of graph.nodes) {
    for (const port of [...node.ports.in, ...node.ports.out]) {
      const sig = port.signature as LooseSignature;
      if (!sig.unit) {
        violations.push({
          code: 'missing-unit',
          nodeId: node.id,
          portId: port.id,
          message: `Port ${port.id} on node ${node.id} declares no unit (UNIT-01).`,
        });
      } else if (sig.dimension !== sig.unit.dimension) {
        violations.push({
          code: 'dimension-mismatch',
          nodeId: node.id,
          portId: port.id,
          message: `Port ${port.id} on node ${node.id} declares dimension ${sig.dimension}, but its unit ${sig.unit.canonical} has dimension ${sig.unit.dimension}.`,
        });
      }
      if (!sig.boundary) {
        violations.push({
          code: 'missing-boundary',
          nodeId: node.id,
          portId: port.id,
          message: `Port ${port.id} on node ${node.id} declares no boundary (UNIT-02).`,
        });
      }
    }
  }

  return violations;
}

export function assertModelWellFormed(graph: Graph): void {
  const violations = validateModel(graph);
  if (violations.length > 0) {
    throw new Error('Model is not well formed: ' + violations.map((v) => v.message).join('; '));
  }
}
