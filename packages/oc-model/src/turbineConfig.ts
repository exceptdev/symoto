/**
 * Onshore wind-turbine class geometry and NL siting constants.
 *
 * This is hand-authored domain knowledge — NOT extracted from the workbook
 * (coefficients.generated.ts). It defines three selectable turbine classes and
 * the spacing rules that cap how many turbines physically fit on eligible land.
 *
 * The per-turbine *yield* is NOT here: it is derived in energy.ts from the
 * workbook's per-country capacity factor so the numbers stay traceable.
 */

/** Selectable turbine size. */
export type TurbineClass = 'small' | 'medium' | 'large';

export const TURBINE_CLASS_IDS: TurbineClass[] = ['small', 'medium', 'large'];

export interface TurbineSpec {
  /** Rated electrical power (MW). */
  ratedMw: number;
  /** Rotor diameter (m) — drives between-turbine spacing. */
  rotorDiameterM: number;
  /** Tip height (m) — informs the residential setback (folded into usable fraction). */
  tipHeightM: number;
}

/** Representative modern onshore classes (1–3 MW), realistic rotor diameters. */
export const TURBINE_CLASSES: Record<TurbineClass, TurbineSpec> = {
  small: { ratedMw: 1, rotorDiameterM: 55, tipHeightM: 100 },
  medium: { ratedMw: 2, rotorDiameterM: 80, tipHeightM: 135 },
  large: { ratedMw: 3, rotorDiameterM: 110, tipHeightM: 165 },
};

/**
 * Between-turbine spacing follows the standard onshore wind-farm rule: about
 * 5 rotor diameters apart crosswind and ~7.5 downwind. The footprint one turbine
 * claims is therefore a (5·D) × (7.5·D) cell = 37.5·D². For the 2 MW class
 * (80 m rotor) that is 240,000 m² ≈ 4.2 turbines/km², matching real onshore
 * siting density (4–6 turbines/km² for ~2 MW machines).
 * Source: standard wind-farm layout guidance (5D crosswind, 7–8D downwind).
 */
export const SPACING_CROSSWIND_D = 5;
export const SPACING_DOWNWIND_D = 7.5;

/**
 * Share of eligible land that is actually sitable after residential setbacks
 * (~4× tip height), access roads, and non-buildable margins.
 */
export const ELIGIBLE_USABLE_FRACTION = 0.7;

/** Wind output in winter vs summer (text/readout only; not used in the balance). */
export const SEASONAL_WINTER_UPLIFT_PCT = 35;

/** Hours in a year — yield = ratedMw × HOURS_PER_YEAR × capacityFactor. */
export const HOURS_PER_YEAR = 8760;

/**
 * Spacing-footprint area (m²) one turbine of the given class claims: the
 * (5·D) × (7.5·D) crosswind-by-downwind cell. Drives both the energy siting cap
 * and the rendered turbine density.
 */
export function spacingAreaM2(turbineClass: TurbineClass): number {
  const d = TURBINE_CLASSES[turbineClass].rotorDiameterM;
  return d * SPACING_CROSSWIND_D * (d * SPACING_DOWNWIND_D);
}

/** Turbines that physically fit per km² for a class (1e6 m² / spacing cell). */
export function turbinesPerKm2(turbineClass: TurbineClass): number {
  const area = spacingAreaM2(turbineClass);
  return area > 0 ? 1_000_000 / area : 0;
}
