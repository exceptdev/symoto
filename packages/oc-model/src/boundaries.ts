// Canonical Orchid City boundary constants shared by every domain node, plus the shared
// unit handles and a port() helper. The two carbon boundaries carry DIFFERENT accounting
// (consumption-operational vs territorial) so the OC carbon account's emissions and on-site
// sequestration refuse to net silently (MODEL-03, Plan 05). Land is territorial/absolute/
// stock; energy and the material/money/carbon flows are flow-temporal.
import { unit, type Boundary, type Port, type SymUnit } from '@symoto/core';

/** Territorial absolute land stock (areas, dwellings, density). */
export const LAND: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'stock' };
/** Consumption-side absolute energy demand flow (MWh/yr the city consumes). */
export const ENERGY_DEMAND: Boundary = { accounting: 'consumption', basis: 'absolute', temporal: 'flow' };
/** Territorial absolute energy supply/generation flow (MWh/yr generated on-site). */
export const ENERGY_SUPPLY: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };
/** Consumption-side water flow (m^3/yr). */
export const WATER_FLOW: Boundary = { accounting: 'consumption', basis: 'absolute', temporal: 'flow' };
/** Territorial material mass flow (waste and food tonnes/yr). */
export const MASS_FLOW: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };
/** Territorial money flow (cost/revenue/USD). */
export const MONEY: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };
/** Territorial absolute count stock (jobs, FTE, dwellings as counts). */
export const COUNT: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'stock' };
/**
 * Carbon, CONSUMPTION/operational accounting boundary: the OC design footprint (households +
 * diet-responsive food + half transport, localized) plus fossil backfill. Absolute city
 * total, flow. Same unit as CARBON_TERRITORIAL, different accounting.
 */
export const CARBON_OPERATIONAL: Boundary = { accounting: 'consumption', basis: 'absolute', temporal: 'flow' };
/**
 * Carbon, TERRITORIAL accounting boundary: on-site land sinks (area x per-m^2 sequestration).
 * Absolute city total, flow. Refuses to net with CARBON_OPERATIONAL except through an explicit
 * labeled crossing (Plan 05).
 */
export const CARBON_TERRITORIAL: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };
/** Territorial reactive-nitrogen flow (kg N/yr). */
export const NITROGEN: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };
/** Intensive index/ratio/percentage stock (quality indices 0-100, self-sufficiency ratios). */
export const INDEX: Boundary = { accounting: 'territorial', basis: 'intensive', temporal: 'stock' };

// --- Shared unit handles ---
export const m2U: SymUnit = unit('m^2');
export const m3U: SymUnit = unit('m^3');
export const personU: SymUnit = unit('person');
export const dwellingU: SymUnit = unit('dwelling');
export const mwhU: SymUnit = unit('MWh');
export const tU: SymUnit = unit('t');
export const kgU: SymUnit = unit('kg');
export const usdU: SymUnit = unit('usd');
export const idxU: SymUnit = unit('idx');

/** Build a port whose declared dimension is taken from its unit (always passes validateModel). */
export function port(id: string, u: SymUnit, boundary: Boundary): Port {
  return { id, signature: { dimension: u.dimension, boundary, unit: u } };
}
