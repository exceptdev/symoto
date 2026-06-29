// OC compound readouts (PROV-02). Derive honest compound readouts from a run's readouts: the carbon
// account (gross operational emissions, territorial sequestration, and the labeled net) and the
// energy supply-vs-demand balance. These read run readouts only; they never recompute a value, so
// parity is preserved. The carbon net is the labeled-crossing Quantity, so its provenance still
// carries the adapter record (the net is named, not silent).
import { compound, type CompoundReadout, type Quantity, type QMap } from '@symoto/core';

function require_(readouts: QMap, key: string): Quantity {
  const q = readouts[key];
  if (q === undefined) {
    throw new Error(`Cannot build compound: missing readout "${key}" in the run result.`);
  }
  return q;
}

/**
 * The OC carbon account as a compound: gross-in is the operational gross emissions, gross-out is the
 * territorial sequestration, and the net is the labeled operational-territorial-net crossing. The
 * net is only obtainable here alongside its components, never as a lone number.
 */
export function carbonCompound(readouts: QMap): CompoundReadout {
  const grossIn = require_(readouts, 'emissions.carbonEmissionsTonnesPerYr');
  const grossOut = require_(readouts, 'emissions.carbonSequestrationTonnesPerYr');
  const net = require_(readouts, 'emissions.netCarbonTonnesPerYr');
  return compound('emissions.carbon', net, [
    { role: 'gross-in', key: 'emissions.carbonEmissionsTonnesPerYr', quantity: grossIn },
    { role: 'gross-out', key: 'emissions.carbonSequestrationTonnesPerYr', quantity: grossOut },
    { role: 'net', key: 'emissions.netCarbonTonnesPerYr', quantity: net },
  ]);
}

/**
 * The OC energy supply-vs-demand balance as a compound, proving the abstraction generalizes beyond
 * carbon: gross-in is total supply, gross-out is total demand, and the net is the imbalance (the
 * fossil backfill shortfall when supply falls short, or the curtailment surplus when it exceeds).
 */
export function energyBalanceCompound(readouts: QMap): CompoundReadout {
  const supply = require_(readouts, 'energy.totalSupplyMwh');
  const demand = require_(readouts, 'energy.totalDemandMwh');
  const fossilBackfill = require_(readouts, 'energy.fossilBackfillMwh');
  const curtailment = require_(readouts, 'energy.curtailmentMwh');
  // The signed imbalance is captured by whichever of the two mutually exclusive flows is nonzero;
  // default to the fossil-backfill shortfall when the system is exactly balanced.
  const net = curtailment.value > 0 ? curtailment : fossilBackfill;
  const netKey = curtailment.value > 0 ? 'energy.curtailmentMwh' : 'energy.fossilBackfillMwh';
  return compound('energy.balance', net, [
    { role: 'gross-in', key: 'energy.totalSupplyMwh', quantity: supply },
    { role: 'gross-out', key: 'energy.totalDemandMwh', quantity: demand },
    { role: 'net', key: netKey, quantity: net },
  ]);
}
