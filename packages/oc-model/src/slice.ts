// The recognizable Orchid City land-energy slice (D-07): the dwellings -> rooftop-PV-land
// -> close-totals loop, exactly the feedback the bespoke engine resolves by computing land
// use twice, expressed here as a genuine node-level cycle resolved by the core fixed-point
// resolver. This is thin and illustrative: NOT the Phase-3 full OC model and NOT a
// golden-master parity target (D-08).
//
// Boundaries: energy quantities carry a consumption/per-capita boundary (E); land
// quantities carry a territorial/absolute boundary (L). Energy and land never add or
// subtract across the divide; they only multiply or divide against coefficients with
// composed units. The only adds/subs happen within a single boundary.
import {
  q,
  add,
  sub,
  mul,
  div,
  scale,
  convert,
  unit,
  buildGraph,
  coefficient,
  input,
  type Quantity,
  type Boundary,
  type Node,
  type QMap,
  type Graph,
  type Port,
} from '@symoto/core';
import { SLICE_COEFFS as C } from './coefficients.js';

const ENERGY: Boundary = { accounting: 'consumption', basis: 'per-capita', temporal: 'flow' };
const LAND: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'stock' };

// Documented slice-only modeling simplifications (D-08), not bespoke parity values.
const BUILT_PARCEL_M2_PER_DWELLING = 150;
const OPEN_SPACE_RATIO = 0.5;
const TARGET_SELF_SUFFICIENCY = 1.0;
const GROUND_SOLAR_SHARE = 1.0;

const personU = unit('person');
const dwellingU = unit('dwelling');
const mwhU = unit('MWh');
const kwhU = unit('kWh');
const m2U = unit('m^2');

function port(id: string, u: ReturnType<typeof unit>, boundary: Boundary): Port {
  return { id, signature: { dimension: u.dimension, boundary, unit: u } };
}

function guardedPopulation(ctx: { inputs: QMap }): Quantity {
  const pop = ctx.inputs.population;
  if (!pop) throw new Error('slice: missing required input "population".');
  // Guard population at 0 so the edge case produces no NaN or Infinity (Pitfall 6).
  return q(Math.max(0, pop.value), personU, LAND, pop.provenance);
}

const landNode: Node = {
  id: 'n1-land',
  kind: 'readout',
  ports: {
    in: [port('energyLandIn', m2U, LAND)],
    out: [
      port('dwellings', dwellingU, LAND),
      port('builtLandM2', m2U, LAND),
      port('openSpaceM2', m2U, LAND),
      port('totalLandM2', m2U, LAND),
    ],
  },
  compute: (ctx, inputs): QMap => {
    const pop = guardedPopulation(ctx as { inputs: QMap });
    const householdSize = q(C.householdSizeNL, unit('person/dwelling'), LAND, coefficient('householdSizeNL', false, 'NL'));
    const dwellings = div(pop, householdSize); // dwelling, L
    const builtLandM2 = mul(
      dwellings,
      q(BUILT_PARCEL_M2_PER_DWELLING, unit('m^2/dwelling'), LAND, coefficient('builtParcelM2PerDwelling')),
    ); // m^2, L
    const openSpaceM2 = scale(builtLandM2, OPEN_SPACE_RATIO); // m^2, L
    // energyLandIn is the back-edge from the energy node (seeded to zero on the first pass).
    const energyLandIn =
      inputs.energyLandIn ?? q(0, m2U, LAND, input('energyLandIn'));
    const totalLandM2 = add(add(builtLandM2, openSpaceM2), energyLandIn); // m^2, L, closes
    return { dwellings, builtLandM2, openSpaceM2, totalLandM2 };
  },
};

const energyNode: Node = {
  id: 'n2-energy',
  kind: 'readout',
  ports: {
    in: [port('dwellingsIn', dwellingU, LAND)],
    out: [
      port('totalDemandMwh', mwhU, ENERGY),
      port('rooftopSolarMwh', mwhU, ENERGY),
      port('groundSolarLandM2', m2U, LAND),
    ],
  },
  compute: (ctx, inputs): QMap => {
    const pop = guardedPopulation(ctx as { inputs: QMap });
    const dwellings = inputs.dwellingsIn ?? q(0, dwellingU, LAND, input('dwellingsIn'));

    // Per-capita demand chain (all energy boundary E).
    const elecKwh = mul(
      q(C.electricityKwhPerCapita, unit('kWh/person'), ENERGY, coefficient('electricityKwhPerCapita', true, 'NL')),
      pop,
    ); // kWh, E
    const elecMwh = convert(elecKwh, mwhU); // MWh, E
    const heatMwh = scale(elecMwh, C.heatToElectricityRatio); // MWh, E
    const transMwh = convert(
      mul(q(C.transportKwhPerCapita, unit('kWh/person'), ENERGY, coefficient('transportKwhPerCapita', true, 'NL')), pop),
      mwhU,
    ); // MWh, E
    const totalDemandMwh = add(add(elecMwh, heatMwh), transMwh); // MWh, E

    // Rooftop PV: kWp chain folded into one MWh-per-dwelling coefficient.
    const rooftopMwhPerDwelling =
      ((C.roofAreaPerDwellingM2 * C.pvEfficiency) / C.m2PerPanel) * C.kwpPerPanel * (C.pvYieldKwhPerKwpNL / 1000);
    const rooftopSolarMwh = mul(
      q(rooftopMwhPerDwelling, unit('MWh/dwelling'), ENERGY, coefficient('rooftopMwhPerDwelling', true, 'NL')),
      dwellings,
    ); // MWh, E

    const biomassMwh = q(
      C.biomassMwhBaseline * (pop.value / C.baselinePopulation),
      mwhU,
      ENERGY,
      coefficient('biomassMwhBaseline', false, 'NL'),
    ); // MWh, E

    // Gap = target demand - rooftop - biomass, floored at 0.
    const targetDemand = scale(totalDemandMwh, TARGET_SELF_SUFFICIENCY); // MWh, E
    const supply = add(rooftopSolarMwh, biomassMwh); // MWh, E
    const gapRaw = sub(targetDemand, supply); // MWh, E
    const gap = q(Math.max(0, gapRaw.value), mwhU, ENERGY, gapRaw.provenance); // MWh, E
    const groundSolarMwh = scale(gap, GROUND_SOLAR_SHARE); // MWh, E

    // Ground-solar land: convert generation to land area (guarded division by yield).
    const m2PerMwh = C.pvYieldKwhPerKwpNL > 0 ? (1000 / C.pvYieldKwhPerKwpNL) * C.groundPvM2PerKwp : 0;
    const groundSolarLandM2 = mul(
      q(m2PerMwh, unit('m^2/MWh'), LAND, coefficient('groundSolarLandPerMwh', false, 'NL')),
      groundSolarMwh,
    ); // m^2, L

    return { totalDemandMwh, rooftopSolarMwh, groundSolarLandM2 };
  },
};

/** Build the two-node cyclic land-energy slice graph once (run it many times). */
export function buildSlice(): Graph {
  return buildGraph(
    [landNode, energyNode],
    [
      { from: { nodeId: 'n1-land', portId: 'dwellings' }, to: { nodeId: 'n2-energy', portId: 'dwellingsIn' } },
      { from: { nodeId: 'n2-energy', portId: 'groundSolarLandM2' }, to: { nodeId: 'n1-land', portId: 'energyLandIn' } },
    ],
  );
}
