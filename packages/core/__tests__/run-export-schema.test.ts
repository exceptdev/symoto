import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/graph/graph.js';
import type { Node, QMap, Port } from '../src/graph/node.js';
import type { Connection } from '../src/graph/connection.js';
import type { Boundary } from '../src/quantity/boundary.js';
import { unit } from '../src/quantity/units.js';
import { q } from '../src/quantity/quantity.js';
import { input } from '../src/quantity/provenance.js';
import { scale } from '../src/quantity/algebra.js';
import { run } from '../src/eval/evaluate.js';
import { exportRun } from '../src/export/runExport.js';
import {
  RUN_EXPORT_SCHEMA,
  validateRunExport,
  reconstructFromExport,
} from '../src/export/schema.js';

// The Professor-facing schema (PROV-04, SC2): a valid export validates, malformed exports are
// rejected with errors, and a readout's origin reconstructs from the export alone.

const B: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };
const mwh = unit('MWh');

function port(id: string): Port {
  return { id, signature: { dimension: mwh.dimension, boundary: B, unit: mwh } };
}

function dagGraph() {
  const source: Node = {
    id: 's',
    kind: 'source',
    ports: { in: [], out: [port('v')] },
    compute: (ctx): QMap => ({ v: ctx.inputs.x! }),
  };
  const out: Node = {
    id: 'm',
    kind: 'readout',
    ports: { in: [port('v')], out: [port('r')] },
    compute: (_ctx, inputs): QMap => ({ r: scale(inputs.v!, 2) }),
  };
  const conns: Connection[] = [{ from: { nodeId: 's', portId: 'v' }, to: { nodeId: 'm', portId: 'v' } }];
  return buildGraph([source, out], conns);
}

function buildValidExport() {
  const g = dagGraph();
  const inputs: QMap = { x: q(7, mwh, B, input('x')) };
  return exportRun(g, run(g, inputs), { inputs });
}

describe('RUN_EXPORT_SCHEMA is a published, frozen JSON Schema literal', () => {
  it('is data, names its version, and lists the required keys', () => {
    expect(RUN_EXPORT_SCHEMA.$id).toBe('symoto-run-export/1');
    expect(RUN_EXPORT_SCHEMA.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(RUN_EXPORT_SCHEMA.required).toContain('provenance');
    expect(Object.isFrozen(RUN_EXPORT_SCHEMA)).toBe(true);
  });
});

describe('validateRunExport accepts a valid export and rejects malformed ones', () => {
  it('a valid export built by exportRun passes with no errors', () => {
    const result = validateRunExport(buildValidExport());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('never throws on hostile input and reports errors instead', () => {
    expect(() => validateRunExport(null)).not.toThrow();
    expect(() => validateRunExport(42)).not.toThrow();
    expect(() => validateRunExport({})).not.toThrow();
    expect(validateRunExport(null).valid).toBe(false);
    expect(validateRunExport({}).errors.length).toBeGreaterThan(0);
  });

  it('rejects an export with schemaVersion deleted', () => {
    const copy = JSON.parse(JSON.stringify(buildValidExport())) as Record<string, unknown>;
    delete copy.schemaVersion;
    const result = validateRunExport(copy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('schemaVersion'))).toBe(true);
  });

  it('rejects a readout scalar carrying a provenance key (the acyclic invariant)', () => {
    const copy = JSON.parse(JSON.stringify(buildValidExport())) as {
      readouts: Record<string, Record<string, unknown>>;
    };
    copy.readouts.r!.provenance = { kind: 'node' };
    const result = validateRunExport(copy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('provenance'))).toBe(true);
  });

  it('rejects an export whose provenance lacks edges', () => {
    const copy = JSON.parse(JSON.stringify(buildValidExport())) as {
      provenance: Record<string, unknown>;
    };
    delete copy.provenance.edges;
    const result = validateRunExport(copy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('provenance.edges'))).toBe(true);
  });
});

describe('reconstructFromExport answers origin from the export alone', () => {
  it('reconstructs a readout origin from a round-tripped export with no source graph', () => {
    const exp = buildValidExport();
    // Simulate an external agent: serialize, re-parse, and use the wire object ALONE.
    const wire = JSON.parse(JSON.stringify(exp));
    const origin = reconstructFromExport(wire, 'r');
    expect(origin.nodeId).toBe('m');
    expect(origin.readoutKey).toBe('r');
    // The validator confirms the wire object is a well-formed export before interrogation.
    expect(validateRunExport(wire).valid).toBe(true);
  });
});
