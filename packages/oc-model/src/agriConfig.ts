/**
 * Agriculture production-system configuration (segmented model).
 *
 * The Orchid City dev-model defines exactly FOUR production systems, consistent
 * across all workbook tabs: Open Field, Husbandry, Orchard, Greenhouse.
 *   - Aquaculture is NOT a separate system; farmed fish/prawns sit inside
 *     Husbandry (`P - Agriculture Land Use!U19,U36`).
 *   - Agroforestry is a regenerative OVERLAY of the four (Open Field→Agroforest,
 *     Husbandry→Silvopasture, Orchard→Food Forest), already always-on in the
 *     tool via the regenerative yield bonus — not a fifth system.
 *
 * Each system carries distinct coefficients. Yield, carbon, value and jobs are
 * workbook-backed (see docs/sim-model/agriculture-systems-research.md for the
 * exact cell derivations). Water and energy are NOT split per system in the
 * workbook, so those two figures are INDICATIVE ASSUMPTIONS — flagged below and
 * safe to tune. They are reported but do not currently feed the calibrated KPIs.
 *
 * The `productionFocus` lever (0 = self-sufficiency, 1 = industrial/export)
 * interpolates the land-share mix between two endpoints. Self-sufficiency favors
 * open-field/orchard/husbandry (high carbon capture, low value); industrial
 * focus shifts toward greenhouse (≈250× value, ≈7.7 FTE/ha, but ZERO carbon
 * sequestration and high water/energy). This is the carbon-capture trade-off the
 * tool is built to show.
 *
 * Pure data + math: no React, no side effects, no I/O.
 */

/** The four workbook production systems. */
export const AGRI_SYSTEMS = ['openField', 'husbandry', 'orchard', 'greenhouse'] as const;

export type AgriSystem = (typeof AGRI_SYSTEMS)[number];

/** Human-facing labels for each system. */
export const AGRI_SYSTEM_LABELS: Record<AgriSystem, string> = {
  openField: 'Open Field',
  husbandry: 'Husbandry',
  orchard: 'Orchard',
  greenhouse: 'Greenhouse',
};

/**
 * Per-system coefficients.
 *
 * Workbook-backed (dev-model `P - CO2`, `Financials`, `Job`, `Agriculture Land
 * Use`):
 *   - `yieldKgPerM2`  production yield, kg/m²/yr
 *   - `carbonTonnesPerM2`  tree + soil sequestration, t CO2/m²/yr
 *       (Greenhouse = 0; Orchard highest — the food-forest layer)
 *   - `valueEurPerM2`  production value, €/m²/yr (Greenhouse dwarfs the rest ~250×)
 *   - `jobsFtePerHa`   labour intensity, FTE per hectare
 *
 * INDICATIVE ASSUMPTIONS (workbook has no per-system split — tune freely):
 *   - `waterM3PerM2`   irrigation/feed water, m³/m²/yr  (ASSUMPTION)
 *   - `energyLevel`    relative energy intensity         (ASSUMPTION)
 */
export interface AgriSystemConfig {
  /** Production yield, kg/m²/yr. Source: dev-model `P - Agriculture Land Use`. */
  yieldKgPerM2: number;
  /**
   * Tree + soil CO2 sequestration, t/m²/yr, MATURE.
   * REVISED 2026-06-28 (Carbon Model Reconciliation): set to the authoritative
   * spreadsheet rates from `P - CO2 {DEV}` (column T ÷ system area):
   *   open field T15 945.88 / G15 4,904,577 m² = 0.00019287 (1.929 t/ha)
   *   husbandry  T16 1142.07 / G16 4,904,577 m² = 0.00023287 (2.329 t/ha)
   *   orchard    T17 932.64 / G17 2,301,075 m² = 0.00040531 (4.053 t/ha)
   *   greenhouse T18 0                                       = 0
   * This REPLACES the old `carbonTonnesPerM2` values as the engine's
   * sequestration driver. `carbonTonnesPerM2` is retained (deprecated) for any
   * legacy reference.
   */
  sequestrationTonnesPerM2: number;
  /**
   * @deprecated Legacy tree+soil sequestration estimate (pre-reconciliation).
   * The engine now uses `sequestrationTonnesPerM2` (spreadsheet-authoritative).
   * Retained so older references compile; not used in the carbon account.
   */
  carbonTonnesPerM2: number;
  /** Production value, €/m²/yr. Source: dev-model `Financials`. */
  valueEurPerM2: number;
  /** Labour, FTE per hectare. Source: dev-model `Job`. */
  jobsFtePerHa: number;
  /** ASSUMPTION: irrigation/feed water, m³/m²/yr (no per-system workbook data). */
  waterM3PerM2: number;
  /** ASSUMPTION: relative energy intensity (no per-system workbook data). */
  energyLevel: 'low' | 'medium' | 'high' | 'very high';

  // --- Phase 29 (ENG-02 / RGN-01): process emissions + nitrogen loading ---
  // These were MISSING source terms in the carbon account. Per-system gross
  // process emissions (regenerative practice, the always-on tool default), plus
  // the conventional counterfactual deltas used by RGN-01. Workbook has no
  // per-system process-emission split, so these are IPCC-anchored INDICATIVE
  // ASSUMPTIONS (cited per field) — safe to tune; flagged, not fabricated-as-fact.

  /**
   * Process greenhouse-gas emissions, t CO2e/m²/yr, REGENERATIVE practice.
   * Covers fertiliser-N₂O + enteric CH₄ (husbandry) + tillage/soil-carbon loss,
   * expressed as CO2-equivalent (IPCC AR6 GWP100). Regenerative practice (cover
   * crops, reduced tillage, integrated/agroforestry livestock, organic-N) cuts
   * these well below conventional — see `convProcessCo2eTonnesPerM2`.
   * Anchors (INDICATIVE, IPCC 2019 Refinement to the 2006 GL, Vol.4):
   *   - Cropland fertiliser N₂O ≈ 1% of applied N as N₂O-N; arable cropland net
   *     non-CO2 ≈ 0.1–0.3 t CO2e/ha/yr at moderate input → ~1–3e-5 t/m².
   *   - Husbandry enteric CH₄ + manure dominate → mixed grazing systems
   *     ~3–6 t CO2e/ha/yr → ~3–6e-4 t/m² (highest of the four).
   *   - Orchard/perennial: minimal tillage, low N → lowest cropland figure.
   *   - Greenhouse: negligible field N₂O/tillage (process heat/CO2 is energy,
   *     counted in the energy domain) → ~0.
   */
  processCo2eTonnesPerM2: number;
  /**
   * Process GHG, t CO2e/m²/yr, CONVENTIONAL counterfactual (regen OFF).
   * Higher synthetic-N rates, full tillage, confined high-CH₄ livestock.
   * INDICATIVE (IPCC 2019 Vol.4 high-input cropland + grazing): set ~1.6–2×
   * the regenerative figure per system. Used ONLY for the RGN-01 saving.
   */
  convProcessCo2eTonnesPerM2: number;
  /**
   * Reactive-nitrogen loading to air+water, kg N/m²/yr, REGENERATIVE practice.
   * Reattributes the nitrogen footprint from population headcount (old NOx
   * proxy) to its real driver: fertiliser application + livestock feed/manure.
   * INDICATIVE (IPCC 2019 + EU Nitrogen Assessment): cropland synthetic-N rates
   * ~100–180 kg N/ha/yr with ~20–35% lost as reactive N (leaching + NH₃ + N₂O);
   * husbandry feed/manure N losses are the largest. Greenhouse uses fertigation
   * (recirculating) → low field loss. Regenerative legume/cover-crop N fixation
   * + precision dosing cut losses vs `convNitrogenKgPerM2`.
   *   crop loss ≈ 30 kg N/ha → 3e-3 kg/m²; husbandry ≈ 60 → 6e-3; orchard low.
   */
  nitrogenKgPerM2: number;
  /**
   * Reactive-N loading, kg N/m²/yr, CONVENTIONAL counterfactual (regen OFF).
   * Heavier synthetic-N + manure surplus. INDICATIVE: ~1.6–2× regenerative.
   * Used ONLY for the RGN-01 nitrogen saving.
   */
  convNitrogenKgPerM2: number;
  /**
   * Soil-carbon sequestration UPLIFT from regenerative practice, t CO2/m²/yr.
   * The portion of `carbonTonnesPerM2` attributable to regen soil building
   * (cover crops, no-till, compost) that a CONVENTIONAL system would NOT achieve.
   * Used by RGN-01 to report the regenerative soil-carbon saving. INDICATIVE
   * (IPCC 2019 + soil-carbon meta-analyses: regen adds ~0.2–0.5 t CO2/ha/yr of
   * SOC vs conventional baseline → ~2–5e-5 t/m²; greenhouse = 0).
   */
  regenSoilCarbonUpliftTonnesPerM2: number;
}

/**
 * The four-system coefficient table (from the design spec, traced to the
 * workbook in the research note). Carbon for Orchard is highest (food-forest
 * tree layer); Greenhouse sequesters nothing.
 */
export const AGRI_CONFIG: Record<AgriSystem, AgriSystemConfig> = {
  openField: {
    yieldKgPerM2: 0.5,
    sequestrationTonnesPerM2: 0.00019287, // P - CO2 {DEV}!T15/G15 (1.929 t/ha, mature)
    carbonTonnesPerM2: 9.7e-5, // deprecated legacy estimate
    valueEurPerM2: 1,
    jobsFtePerHa: 0.142,
    waterM3PerM2: 0.4, // ASSUMPTION: medium (rainfed-leaning arable)
    energyLevel: 'low', // ASSUMPTION
    // Phase 29 (INDICATIVE, IPCC 2019 Vol.4 cropland N₂O + tillage):
    processCo2eTonnesPerM2: 1.5e-5, // ≈ 0.15 t CO2e/ha/yr arable (regen, reduced till)
    convProcessCo2eTonnesPerM2: 3.0e-5, // ≈ 0.30 t CO2e/ha/yr (conventional full till, high-N)
    nitrogenKgPerM2: 3.0e-3, // ≈ 30 kg N/ha/yr reactive loss (regen, ~120 kg N applied @ 25%)
    convNitrogenKgPerM2: 5.0e-3, // ≈ 50 kg N/ha/yr (conventional, higher synthetic-N surplus)
    regenSoilCarbonUpliftTonnesPerM2: 3.0e-5, // ≈ 0.30 t CO2/ha/yr SOC uplift vs conventional
  },
  husbandry: {
    yieldKgPerM2: 0.08,
    sequestrationTonnesPerM2: 0.00023287, // P - CO2 {DEV}!T16/G16 (2.329 t/ha, mature)
    carbonTonnesPerM2: 9.9e-5, // deprecated legacy estimate
    valueEurPerM2: 1,
    jobsFtePerHa: 0.0815,
    waterM3PerM2: 0.6, // ASSUMPTION: high (drinking + feed-crop water)
    energyLevel: 'low', // ASSUMPTION
    // Phase 29 (INDICATIVE, IPCC 2019 Vol.4 enteric CH₄ + manure — highest):
    processCo2eTonnesPerM2: 4.0e-4, // ≈ 4 t CO2e/ha/yr (regen silvopasture, lower stocking)
    convProcessCo2eTonnesPerM2: 6.0e-4, // ≈ 6 t CO2e/ha/yr (conventional confined, higher CH₄)
    nitrogenKgPerM2: 6.0e-3, // ≈ 60 kg N/ha/yr (regen, manure-recycled feed/grazing N)
    convNitrogenKgPerM2: 1.0e-2, // ≈ 100 kg N/ha/yr (conventional manure + feed-N surplus)
    regenSoilCarbonUpliftTonnesPerM2: 4.0e-5, // ≈ 0.40 t CO2/ha/yr SOC (managed grazing)
  },
  orchard: {
    yieldKgPerM2: 0.8,
    sequestrationTonnesPerM2: 0.00040531, // P - CO2 {DEV}!T17/G17 (4.053 t/ha, mature)
    carbonTonnesPerM2: 2.69e-4, // deprecated legacy estimate
    valueEurPerM2: 1,
    jobsFtePerHa: 0.284,
    waterM3PerM2: 0.3, // ASSUMPTION: low (established perennials)
    energyLevel: 'low', // ASSUMPTION
    // Phase 29 (INDICATIVE, IPCC 2019 Vol.4 perennial — low N, minimal tillage):
    processCo2eTonnesPerM2: 8.0e-6, // ≈ 0.08 t CO2e/ha/yr (lowest cropland; no-till perennial)
    convProcessCo2eTonnesPerM2: 1.6e-5, // ≈ 0.16 t CO2e/ha/yr (conventional higher-N orchard)
    nitrogenKgPerM2: 2.0e-3, // ≈ 20 kg N/ha/yr reactive loss (regen perennial)
    convNitrogenKgPerM2: 3.5e-3, // ≈ 35 kg N/ha/yr (conventional)
    regenSoilCarbonUpliftTonnesPerM2: 2.0e-5, // ≈ 0.20 t CO2/ha/yr SOC (orchard cover crop)
  },
  greenhouse: {
    yieldKgPerM2: 1.9,
    sequestrationTonnesPerM2: 0, // P - CO2 {DEV}!T18 = 0 (greenhouse sequesters nothing)
    carbonTonnesPerM2: 0, // deprecated legacy estimate
    valueEurPerM2: 250,
    jobsFtePerHa: 7.665,
    waterM3PerM2: 0.8, // ASSUMPTION: high (intensive irrigation)
    energyLevel: 'very high', // ASSUMPTION (heating/lighting/CO2 dosing)
    // Phase 29 (INDICATIVE): field N₂O/tillage ≈ 0 — fertigation recirculates N,
    // no tillage. Process HEAT/CO2-dosing is ENERGY, already counted in the energy
    // domain via fossil backfill — NOT double-counted here.
    processCo2eTonnesPerM2: 0,
    convProcessCo2eTonnesPerM2: 0,
    nitrogenKgPerM2: 5.0e-4, // ≈ 5 kg N/ha/yr (low; recirculating fertigation leakage)
    convNitrogenKgPerM2: 1.0e-3, // ≈ 10 kg N/ha/yr (conventional run-to-waste fertigation)
    regenSoilCarbonUpliftTonnesPerM2: 0, // soilless / no SOC
  },
};

/** A land-share mix across the four systems. Always sums to 1.0. */
export type AgriMix = Record<AgriSystem, number>;

/**
 * Self-sufficiency endpoint (productionFocus = 0, DEFAULT). Diverse mix biased
 * toward open-field/orchard/husbandry — high carbon capture, low value.
 */
export const MIX_SELF: AgriMix = {
  openField: 0.35,
  husbandry: 0.3,
  orchard: 0.25,
  greenhouse: 0.1,
};

/**
 * Industrial / export endpoint (productionFocus = 1). Greenhouse-heavy — high
 * yield/value and jobs, but near-zero carbon sequestration.
 */
export const MIX_INDUSTRIAL: AgriMix = {
  greenhouse: 0.55,
  openField: 0.25,
  husbandry: 0.1,
  orchard: 0.1,
};

/** Linear interpolation. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Land-share mix for a given production focus.
 *
 * `mix(0)` = MIX_SELF (default, self-sufficiency); `mix(1)` = MIX_INDUSTRIAL.
 * Each endpoint sums to 1.0, and lerp of two distributions summing to 1.0 also
 * sums to 1.0, so the result is always a valid land split. `focus` is clamped
 * to [0,1].
 *
 * @param focus production focus ∈ [0,1] (0 = self-sufficiency, 1 = industrial)
 */
export function mix(focus: number): AgriMix {
  const t = Math.max(0, Math.min(1, focus));
  return {
    openField: lerp(MIX_SELF.openField, MIX_INDUSTRIAL.openField, t),
    husbandry: lerp(MIX_SELF.husbandry, MIX_INDUSTRIAL.husbandry, t),
    orchard: lerp(MIX_SELF.orchard, MIX_INDUSTRIAL.orchard, t),
    greenhouse: lerp(MIX_SELF.greenhouse, MIX_INDUSTRIAL.greenhouse, t),
  };
}

/**
 * Split a total agricultural area (m²) across the four systems for a focus.
 * `landM2[s] = agricultureM2 × mix(focus)[s]`.
 */
export function systemLandM2(agricultureM2: number, focus: number): AgriMix {
  const m = mix(focus);
  return {
    openField: agricultureM2 * m.openField,
    husbandry: agricultureM2 * m.husbandry,
    orchard: agricultureM2 * m.orchard,
    greenhouse: agricultureM2 * m.greenhouse,
  };
}
