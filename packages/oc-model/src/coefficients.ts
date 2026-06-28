// The few real Orchid City coefficients (Netherlands) the thin land-energy slice needs.
// Lifted and flattened to NL scalars from the bespoke engine's coefficients.generated.ts
// (householdSize line 2503, energy block lines 2569-2589). This is the illustrative D-07
// slice, NOT the Phase-3 full model or a golden-master parity target (D-08).
export const SLICE_COEFFS = {
  baselinePopulation: 50_000,
  householdSizeNL: 2.1, // dwellings = population / householdSize -> 23,810 at 50k

  // rooftop PV chain (NL)
  roofAreaPerDwellingM2: 115.0,
  pvEfficiency: 0.8,
  m2PerPanel: 1.6,
  kwpPerPanel: 0.4,
  pvYieldKwhPerKwpNL: 934.47, // rooftop PV ~ 511,700 MWh/yr at 50k
  groundPvM2PerKwp: 8.0,
  biomassMwhBaseline: 1665,

  // demand (NL, per capita)
  electricityKwhPerCapita: 6202.58,
  heatToElectricityRatio: 0.52259,
  transportKwhPerCapita: 8156.34, // total demand ~ 880,017 MWh/yr at 50k
} as const;
