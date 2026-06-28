# Symoto

Symoto is a deterministic, isomorphic computation core where every value is a `Quantity`
envelope, value, unit, system boundary, and provenance, and the engine refuses to silently
net incompatible quantities. It runs the same way in Node and in the browser, with no build
step required to develop or test it.

The first thing Symoto does well is the thing most modeling engines get wrong: it will not
let you subtract a consumption-based per-capita figure from a territorial on-site figure
just because they share a unit. Units are necessary but not sufficient; the system boundary
is a first-class, typed field, checked at two structural choke points (wire time and run
time). When two quantities do not share a boundary, the operation throws rather than
returning a plausible, wrong number.

License: AGPL-3.0-or-later, from the first commit.

## What it does today

- A `Quantity { value, unit, boundary, provenance }` is the only currency that crosses a
  port. A bare number cannot pose as a quantity at run time, and the type system rejects a
  bare-number return at compile time.
- Q-algebra (`add`, `sub`, `mul`, `div`, `scale`, `convert`) carries unit, boundary, and
  provenance through every operation. `add` and `sub` refuse to net mismatched units or
  boundaries; `mul` and `div` compose units.
- A graph of typed nodes (elements, flows, controllers, readouts, and sources) wired by
  connections with typed ports evaluates deterministically by topological order. A cyclic
  region resolves to a stable value by bounded, deterministic fixed-point iteration.
- The `@symoto/core` package is isomorphic: it imports nothing host-specific, enforced by a
  compile-time gate plus an ESLint rule, so the same code runs headless and in a browser.

The live use case is the Orchid City Vizapp, a neighborhood-metabolism model that Symoto
will power. This repository ships a thin, recognizable slice of that model, the land and
energy feedback loop, as a runnable example. It is illustrative, not the full model.

## Quickstart

Requirements: Node 22 and pnpm (via `corepack enable pnpm`).

```bash
git clone <this-repo> symoto
cd symoto
pnpm install
pnpm -r run test          # the Vitest suites for @symoto/core and @symoto/oc-model
pnpm -r run typecheck     # tsc across both packages
pnpm exec eslint . --quiet
tsx examples/headless-run.ts
```

The headless run builds the Orchid City land-energy slice once, runs it for the Netherlands
at a population of 50,000, and prints each readout with its unit and a one-line provenance
trace. It computes roughly 23,810 dwellings and about 880,016 MWh of total energy demand,
resolving the land-energy cycle as a documented two-pass fixed point.

## Packages

- `@symoto/core`: the isomorphic computation core (Quantity, Q-algebra, the typed-port
  graph, and the deterministic evaluator). Zero Node or DOM imports.
- `@symoto/oc-model`: the Orchid City model, depending on `@symoto/core`. Phase 1 ships the
  thin land-energy slice only.

## Where this is going

Symoto grows out of more than a decade of work on a single idea: a great connector for
systems modeling, a nodal, nestable, AI-assisted environment for modeling complex systems
across domains, where the structure of a model and the integrity of its numbers are
inseparable. The envelope and the refuse-to-net guarantee in this repository are the
foundation that idea rests on, not the whole of it.

The intended direction, layered on top of the core shipped here, includes:

- A boundary system with a curated catalogue of explicit, visible transitions, so that
  legitimate conversions (per-capita times population to absolute, area times rate, and so
  on) pass through a labeled adapter that appears in provenance, while the silent net stays
  refused.
- Honest aggregation and full provenance, so every readout can show where its number came
  from, and a value the model clamped is never presented as one the model honored.
- Locale as a first-class parameter that propagates through the model, with a coefficient
  that should vary by locale but stays constant flagged by default.
- Genuine stock-flow integration over time, with playback and step-independent totals.
- A structured run export that an external reviewer or agent can interrogate end to end.

This section describes intent, not shipped features. The section above describes what runs
today. We mean to keep that line bright.
