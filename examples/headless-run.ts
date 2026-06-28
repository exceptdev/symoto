// The visible REPO-02 proof: build the OC land-energy slice once, run it for the
// Netherlands at 50,000 people, and print each readout with its unit and a one-line
// provenance trace. Run with: tsx examples/headless-run.ts
//
// This file lives outside @symoto/core and may use Node APIs (console).
import { run, q, unit, input, type ProvRef, type Quantity } from '@symoto/core';
import { buildSlice } from '@symoto/oc-model';

function provTrace(p: ProvRef, depth = 0): string {
  if (depth > 3) return '...';
  switch (p.kind) {
    case 'input':
      return `input(${p.portId})`;
    case 'coefficient':
      return `coeff(${p.id})`;
    case 'op':
      return `${p.op}(${p.inputs.map((c) => provTrace(c, depth + 1)).join(', ')})`;
    default:
      return '?';
  }
}

function printReadout(name: string, value: Quantity | undefined, decimals = 2): void {
  if (!value) {
    console.log(`  ${name}: (not produced)`);
    return;
  }
  // No thousands separators, so the figures are easy to read and to match in scripts.
  const num = value.value.toLocaleString('en-US', {
    maximumFractionDigits: decimals,
    useGrouping: false,
  });
  console.log(`  ${name} = ${num} ${value.unit.canonical}`);
  console.log(`      provenance: ${provTrace(value.provenance)}`);
}

const POPULATION = 50_000;

const graph = buildSlice();
const result = run(graph, {
  population: q(
    POPULATION,
    unit('person'),
    { accounting: 'territorial', basis: 'absolute', temporal: 'stock' },
    input('population'),
  ),
});

console.log(`Symoto OC land-energy slice, Netherlands, population ${POPULATION.toLocaleString('en-US')}`);
console.log('Readouts:');
printReadout('dwellings', result.readouts.dwellings, 0);
printReadout('total energy demand', result.readouts.totalDemandMwh);
printReadout('rooftop PV generation', result.readouts.rooftopSolarMwh);
printReadout('ground-solar land', result.readouts.groundSolarLandM2);
printReadout('built land', result.readouts.builtLandM2);
printReadout('open space', result.readouts.openSpaceM2);
printReadout('total land', result.readouts.totalLandM2);
