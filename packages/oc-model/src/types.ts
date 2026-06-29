// Input and land-use output types for the Symoto OC settlement model. These mirror the
// bespoke engine's SimInputs / LandUseResult contract (vizapp/src/sim/types.ts) so the
// vendored domain arithmetic ports across one-for-one and the golden master compares field
// for field. Energy/water/etc. result shapes live with their domain nodes.
import type { Country } from './config.js';
import type { TurbineClass } from './turbineConfig.js';

export type EnergyScenario = 'Wind/Solar' | 'Wind' | 'Solar';
export type DietaryPreference = 'omnivore' | 'flexitarian' | 'vegetarian' | 'vegan';

/** Scenario inputs (population + country core; later-phase optional selectors). */
export interface SimInputs {
  population: number;
  country: Country;
  energySelfSufficiency?: number;
  energyScenario?: EnergyScenario;
  foodScenario?: string;
  foodSelfSufficiency?: number;
  dietaryPreference?: DietaryPreference;
  productionFocus?: number;
  waterSelfSufficiency?: number;
  economicSelfSufficiency?: number;
  turbineClass?: TurbineClass;
  regenerativeAgriculture?: boolean;
}

/** Land use for one program category. */
export interface CategoryLandUse {
  category: string;
  units: number;
  footprintM2: number;
  parcelLandM2: number;
  gfaM2: number;
}

/** Complete land-use result (areas in m^2 unless noted). */
export interface LandUseResult {
  population: number;
  country: Country;
  housingUnits: number;
  byCategory: CategoryLandUse[];
  builtFootprintM2: number;
  builtParcelLandM2: number;
  energyGenerationLandM2: number;
  builtTotalM2: number;
  builtGfaM2: number;
  urbanGreenM2: number;
  roadsM2: number;
  parkingM2: number;
  infrastructureM2: number;
  agricultureM2: number;
  natureM2: number;
  waterM2: number;
  openSpaceM2: number;
  totalLandM2: number;
  densityPeoplePerHaBuilt: number;
  ha: {
    built: number;
    urbanGreen: number;
    infrastructure: number;
    agriculture: number;
    nature: number;
    water: number;
    openSpace: number;
    total: number;
  };
}
