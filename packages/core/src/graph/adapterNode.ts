// A visible adapter node: a boundary crossing expressed as an explicit node in the graph
// topology, not only as an inline adapt() call. Its out-port signature carries the target
// unit and boundary, so validateModel (Plan 01) accepts a graph containing it, and its
// compute calls adapt() so the crossing is also visible in provenance (UNIT-04).
import type { Node, Port, QMap } from './node.js';
import type { Boundary } from '../quantity/boundary.js';
import type { SymUnit } from '../quantity/units.js';
import { adapt } from '../quantity/algebra.js';

// A local port helper mirroring oc-model's slice port(): the declared dimension is taken
// from the unit, so a port built this way always satisfies validateModel's dimension check.
function port(id: string, u: SymUnit, boundary: Boundary): Port {
  return { id, signature: { dimension: u.dimension, boundary, unit: u } };
}

export interface AdapterNodeArgs {
  readonly id: string;
  readonly method: string;
  readonly in: { portId: string; unit: SymUnit; boundary: Boundary };
  readonly out: { portId: string; unit: SymUnit; boundary: Boundary };
  // The optional operand in-port (e.g. the population for per-capita-to-absolute). A Port
  // requires a full signature (unit is required, UNIT-01), so the operand carries its own
  // unit and boundary rather than a bare port id.
  readonly operand?: { portId: string; unit: SymUnit; boundary: Boundary };
}

export function makeAdapterNode(args: AdapterNodeArgs): Node {
  const inPorts: Port[] = [port(args.in.portId, args.in.unit, args.in.boundary)];
  if (args.operand) {
    inPorts.push(port(args.operand.portId, args.operand.unit, args.operand.boundary));
  }
  const outPort = port(args.out.portId, args.out.unit, args.out.boundary);

  return {
    id: args.id,
    kind: 'flow',
    ports: { in: inPorts, out: [outPort] },
    compute: (_ctx, inputs: QMap): QMap => {
      const source = inputs[args.in.portId];
      if (!source) {
        throw new Error(
          `Adapter node ${args.id}: missing required source input on port "${args.in.portId}".`,
        );
      }
      const operand = args.operand ? inputs[args.operand.portId] : undefined;
      return { [args.out.portId]: adapt(source, args.out.boundary, args.method, operand) };
    },
  };
}
