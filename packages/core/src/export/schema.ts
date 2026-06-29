// The minimal Professor-facing schema, validator, and reconstruct-from-export path (PROV-04, ROADMAP
// Success Criterion 2 and the public surface for Success Criterion 3). An external consumer (the
// Professor critique system, or a human) gets three things, all zero-dependency:
//
//   - RUN_EXPORT_SCHEMA, a plain JSON Schema (Draft 2020-12) object literal documenting the contract.
//     It is data, not a validator, so it ships no dependency and stays isomorphic.
//   - validateRunExport(value), a small, pure, hand-rolled structural validator returning
//     { valid, errors }. It never throws (a malformed input yields errors, not an exception) and does
//     only shallow structural checks (no recursion into provenance), so a hostile JSON cannot make it
//     hang. Crucially it rejects any readout or input scalar carrying a `provenance` key: provenance
//     lives once at the run level, never nested per scalar (the acyclic invariant).
//   - reconstructFromExport(export, key), which answers "where did this number come from" from the
//     export alone by walking export.provenance via the Phase 5 reconstruct, without the source graph.
//
// No new runtime dependency is added (no ajv, no JSON Schema runtime): the schema literal is the
// published contract, the validator is the hand-rolled runtime gate.
import { reconstruct } from '../provenance/trace.js';
import type { ProvenanceTrace, ReconstructedOrigin } from '../provenance/trace.js';
import { RUN_EXPORT_SCHEMA_VERSION } from './runExport.js';
import type { RunExport } from './runExport.js';

/** The result of a structural validation: valid when there are no collected errors. */
export interface SchemaValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * The machine-readable, documented run-export contract: a JSON Schema (Draft 2020-12) object literal.
 * It is plain data shipped for an external consumer, not an executed validator (validateRunExport is
 * the runtime gate). Frozen so a consumer cannot mutate the published contract.
 */
export const RUN_EXPORT_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'symoto-run-export/1',
  title: 'Symoto Run Export',
  description:
    'A versioned, self-describing, acyclic export of a Symoto run: graph topology, inputs, readouts, the run-level provenance trace, requested-vs-actual records, and optional invariance flags, compounds, and a playback series. Topology and provenance are node lists plus edge id lists, so the export is acyclic and JSON round-trips without throwing.',
  type: 'object',
  required: ['schemaVersion', 'topology', 'inputs', 'readouts', 'provenance', 'requestedActual'],
  additionalProperties: true,
  properties: {
    schemaVersion: { const: RUN_EXPORT_SCHEMA_VERSION },
    topology: {
      type: 'object',
      required: ['nodes', 'connections'],
      properties: {
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'kind', 'in', 'out'],
            properties: {
              id: { type: 'string' },
              kind: { type: 'string' },
              in: { type: 'array', items: { $ref: '#/$defs/port' } },
              out: { type: 'array', items: { $ref: '#/$defs/port' } },
            },
          },
        },
        connections: {
          type: 'array',
          items: {
            type: 'object',
            required: ['fromNodeId', 'fromPortId', 'toNodeId', 'toPortId'],
            properties: {
              fromNodeId: { type: 'string' },
              fromPortId: { type: 'string' },
              toNodeId: { type: 'string' },
              toPortId: { type: 'string' },
            },
          },
        },
      },
    },
    inputs: { type: 'object', additionalProperties: { $ref: '#/$defs/scalar' } },
    readouts: { type: 'object', additionalProperties: { $ref: '#/$defs/scalar' } },
    provenance: {
      type: 'object',
      required: ['nodes', 'edges'],
      properties: {
        nodes: { type: 'array' },
        edges: { type: 'array' },
      },
    },
    requestedActual: { type: 'array' },
    invarianceFlags: { type: 'array' },
    compounds: { type: 'array' },
    series: { type: 'object' },
    meta: { type: 'object' },
  },
  $defs: {
    port: {
      type: 'object',
      required: ['id', 'dimension', 'unit', 'boundary'],
      properties: {
        id: { type: 'string' },
        dimension: { type: 'string' },
        unit: { type: 'object' },
        boundary: { type: 'object' },
      },
    },
    scalar: {
      type: 'object',
      required: ['value', 'unit', 'boundary'],
      not: { required: ['provenance'] },
      properties: {
        value: { type: 'number' },
        unit: { type: 'object', required: ['canonical'], properties: { canonical: { type: 'string' } } },
        boundary: { type: 'object' },
      },
    },
  },
} as const);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate a scalar map (inputs or readouts): every value must be a { value, unit, boundary } scalar
 * with a finite numeric `value`, a `unit` object carrying a string `canonical`, a `boundary` object,
 * and NO `provenance` key (the acyclic, once-per-run invariant). Pushes a descriptive error per
 * failure. Shallow: it does not recurse into the boundary or unit beyond the canonical check.
 */
function checkScalarMap(label: string, map: unknown, errors: string[]): void {
  if (!isObject(map)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  for (const key of Object.keys(map)) {
    const scalar = map[key];
    const where = `${label}.${key}`;
    if (!isObject(scalar)) {
      errors.push(`${where} must be a scalar object.`);
      continue;
    }
    if (typeof scalar.value !== 'number' || !Number.isFinite(scalar.value)) {
      errors.push(`${where}.value must be a finite number.`);
    }
    if (!isObject(scalar.unit) || typeof scalar.unit.canonical !== 'string') {
      errors.push(`${where}.unit must be an object with a string canonical.`);
    }
    if (!isObject(scalar.boundary)) {
      errors.push(`${where}.boundary must be an object.`);
    }
    if ('provenance' in scalar) {
      errors.push(
        `${where} carries a provenance key; provenance lives once at the run level, never nested per scalar (the acyclic invariant).`,
      );
    }
  }
}

/**
 * A pure, throw-free structural validator for a run export. Returns { valid, errors } where errors is
 * a list of human-readable strings; a malformed input yields errors, never an exception. It checks the
 * required top-level keys and their shapes, that inputs and readouts are provenance-free scalar maps,
 * that provenance has node and edge arrays, and that any present optional field has the right type.
 */
export function validateRunExport(value: unknown): SchemaValidationResult {
  const errors: string[] = [];

  if (!isObject(value)) {
    return { valid: false, errors: ['Run export must be a non-null object.'] };
  }

  if (value.schemaVersion !== RUN_EXPORT_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be '${RUN_EXPORT_SCHEMA_VERSION}', got ${JSON.stringify(value.schemaVersion)}.`,
    );
  }

  const topology = value.topology;
  if (!isObject(topology)) {
    errors.push('topology must be an object.');
  } else {
    if (!Array.isArray(topology.nodes)) errors.push('topology.nodes must be an array.');
    if (!Array.isArray(topology.connections)) errors.push('topology.connections must be an array.');
  }

  checkScalarMap('inputs', value.inputs, errors);
  checkScalarMap('readouts', value.readouts, errors);

  const provenance = value.provenance;
  if (!isObject(provenance)) {
    errors.push('provenance must be an object.');
  } else {
    if (!Array.isArray(provenance.nodes)) errors.push('provenance.nodes must be an array.');
    if (!Array.isArray(provenance.edges)) errors.push('provenance.edges must be an array.');
  }

  if (!Array.isArray(value.requestedActual)) errors.push('requestedActual must be an array.');

  if ('invarianceFlags' in value && !Array.isArray(value.invarianceFlags)) {
    errors.push('invarianceFlags, when present, must be an array.');
  }
  if ('compounds' in value && !Array.isArray(value.compounds)) {
    errors.push('compounds, when present, must be an array.');
  }
  if ('series' in value && !isObject(value.series)) {
    errors.push('series, when present, must be an object.');
  }
  if ('meta' in value && !isObject(value.meta)) {
    errors.push('meta, when present, must be an object.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Answer "where did this number come from" from a run export alone. Walks export.provenance via the
 * Phase 5 reconstruct (the visited-set guard terminates on the land<->energy cycle), returning the
 * readout's formula, source citations, and the reconstructed origins of its upstream dependencies, with
 * no access to the source graph or the engine.
 */
export function reconstructFromExport(exported: RunExport, readoutKey: string): ReconstructedOrigin {
  const trace: ProvenanceTrace = exported.provenance;
  return reconstruct(trace, readoutKey);
}
