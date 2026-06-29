# Symoto Run Export

A Symoto run exports to a versioned, self-describing, acyclic JSON structure an external reviewer or agent (for example the Professor critique system) can interrogate without the engine. This document is the human-readable companion to `RUN_EXPORT_SCHEMA`, the machine-readable JSON Schema literal exported from `@symoto/core`.

The export is produced by `exportRun(graph, result, opts?)` in the core, and by `exportOcRun(inputs, opts?)` for the Orchid City model. It is read-only and additive: it carries the numbers a run produced, it never recomputes them.

## The versioned envelope

Every export carries `schemaVersion: "symoto-run-export/1"`. The version lets a consumer detect the contract it is reading. The format widens additively only: new optional fields may appear under the same major version, and a field's meaning never changes silently. `validateRunExport` requires the exact `schemaVersion` and rejects any other value, so a non-Symoto or wrong-version document is not accepted as a run export.

## Top-level fields

| Field | Required | Meaning |
|-------|----------|---------|
| `schemaVersion` | yes | The contract version, `"symoto-run-export/1"`. |
| `topology` | yes | The graph: a node list plus a connection edge id list. |
| `inputs` | yes | The run inputs as a map of name to scalar. May be empty (the OC model closes its selectors over node factories and carries the scenario in `meta.scenario`). |
| `readouts` | yes | Every readout as a map of key to scalar. |
| `provenance` | yes | The run-level provenance trace: node records plus edge id lists. |
| `requestedActual` | yes | The requested-vs-actual records, so a clamped input is never presented as honored. |
| `invarianceFlags` | no | Locale-invariance flags: coefficients constant where they should vary. |
| `compounds` | no | Honest compound readouts (gross in, gross out, net), never a lone net. |
| `series` | no | An optional playback series (the time-stepped frames). |
| `meta` | no | Free-form metadata. The OC export carries `poweredBy`, `repository`, `license`, `locale`, and `scenario`. |

## The scalar shape

Every value in `inputs` and `readouts`, and every quantity inside `compounds`, is a flat scalar:

```json
{ "value": 880016.31, "unit": { "canonical": "MWh", "dimension": "..." }, "boundary": { "accounting": "territorial", "basis": "absolute", "temporal": "flow", "locale": "NLD" } }
```

A scalar carries `value`, `unit`, and `boundary`, and never a `provenance` key. Provenance lives once at the run level, in `provenance`, never duplicated per scalar. `validateRunExport` rejects any scalar that carries a `provenance` key: per-scalar provenance would bloat the export and reintroduce the cycles the run-level trace was designed to avoid.

## The node plus edge id-list contract (acyclic by construction)

Both `topology` and `provenance` are node lists plus edge id lists, never nested objects:

- `topology.nodes` is a list of `{ id, kind, in[], out[] }`, where each port is `{ id, dimension, unit, boundary }`. `topology.connections` is a list of edge id pairs `{ fromNodeId, fromPortId, toNodeId, toPortId }`.
- `provenance.nodes` is a list of node-boundary records (`nodeId`, `readoutKey`, optional `formula`, the within-node DAG `local`, and `sources`). `provenance.edges` is a list of directed dependency edges by id.

Because a cross-node reference is always an edge id pair, the land/energy feedback cycle in the Orchid City model serializes as two directed edges, not an infinitely nested object. `JSON.stringify(export)` never throws on a circular reference, and `JSON.parse(JSON.stringify(export))` deep-equals the original.

## Answering "where did this number come from"

An external consumer reconstructs any readout's origin from the export alone:

```ts
import { reconstructFromExport, validateRunExport } from '@symoto/core';

const wire = JSON.parse(receivedJson);
const check = validateRunExport(wire);
if (!check.valid) throw new Error(check.errors.join('; '));

const origin = reconstructFromExport(wire, 'emissions.netCarbonTonnesPerYr');
// origin.nodeId, origin.formula, origin.sources, origin.inputs (the upstream dependency tree)
```

`reconstructFromExport(export, key)` walks `export.provenance` via the Phase 5 `reconstruct`. A visited-set guard terminates on the land/energy cycle, cutting a repeated node with `truncated: true` rather than recursing forever. No engine call is needed after the JSON arrives: the export is self-sufficient for validation and origin reconstruction.

## Validation

`validateRunExport(value)` is a pure, throw-free, zero-dependency structural validator. It returns `{ valid, errors }`, where `errors` is a list of human-readable strings. A malformed input yields errors, never an exception, and the validator does only shallow structural checks (it does not recurse into provenance), so a hostile JSON cannot make it hang. It checks the required top-level keys and their types, the topology and provenance node-and-edge arrays, the provenance-free scalar maps, and the type of any present optional field.

## Attribution

The Orchid City export carries the "powered by Symoto" attribution in `meta`: `poweredBy: "Symoto"`, `repository: "https://github.com/exceptdev/symoto"`, and `license: "AGPL-3.0"`. The engine is open source under AGPL-3.0; an external reviewer can read the code that produced any number it interrogates.
