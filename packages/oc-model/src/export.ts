// The concrete OC run export (PROV-04 application). exportOcRun composes a real Orchid City run into
// the core RunExport: the locale-bearing run (runOc), the full OC topology (buildOcModel), the run's
// provenance trace and requested-vs-actual records, the locale-invariance flags (flagOcInvariance), the
// honest carbon and energy-balance compounds, the locale and scenario echo, the "powered by Symoto"
// attribution, and optionally the Phase 7 cumulative-carbon playback series. It reads only: every
// readout, every compound component, and every requested-vs-actual record comes from runOc(inputs);
// only the locale, the scenario echo, and the attribution are added. So the Phase 3/4 parity numbers
// are unchanged.
import { exportRun, type RunExport } from '@symoto/core';
import { runOc, localeOf } from './locale.js';
import { buildOcModel } from './model.js';
import { flagOcInvariance } from './invariance.js';
import { carbonCompound, energyBalanceCompound } from './compounds.js';
import { runOcCarbonPlayback } from './playback.js';
import type { SimInputs } from './types.js';

/** Options for exportOcRun: optionally embed a cumulative-carbon playback series. */
export interface ExportOcRunOpts {
  readonly withSeries?: { horizon: number; dt?: number; reportEvery?: number };
}

/**
 * Export a real OC run as a RunExport an external reviewer or agent (the Professor critique system) can
 * interrogate. Composes the Phase 5 provenance and honest compounds, the Phase 6 locale and invariance
 * flags, and the Phase 7 playback (when requested). Recomputes no readout. The OC run's input map is
 * empty (the selectors are closed over the node factories), so the scenario travels in meta.scenario.
 */
export function exportOcRun(inputs: SimInputs, opts?: ExportOcRunOpts): RunExport {
  const result = runOc(inputs);
  const graph = buildOcModel(inputs);
  const series = opts?.withSeries
    ? runOcCarbonPlayback(inputs, opts.withSeries).serialized
    : undefined;
  return exportRun(graph, result, {
    inputs: {},
    invarianceFlags: flagOcInvariance(),
    compounds: [carbonCompound(result.readouts), energyBalanceCompound(result.readouts)],
    series,
    meta: {
      poweredBy: 'Symoto',
      repository: 'https://github.com/exceptdev/symoto',
      license: 'AGPL-3.0',
      locale: localeOf(inputs.country),
      scenario: { ...inputs },
    },
  });
}
