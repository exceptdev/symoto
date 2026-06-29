// The canonical parity grid (Phase 3, MODEL-02). Defined once and shared by the
// golden-master capture script and the parity harness so the captured fixture and
// every parity test iterate the identical scenario set, with no drift.
//
// The grid is a base population x country x energy-scenario sweep, plus a targeted
// selector sweep at the NL 50,000 baseline (self-sufficiency targets, dietary
// preference, production focus, turbine class, regenerative-agriculture flag, and
// the regenerative food scenario), plus the population-0 and self-sufficiency-1.5
// edge cases (folded into the sweeps below) so parity and edge safety are checked
// over the same set.

export type OcCountry = 'Netherlands' | 'Vietnam' | 'Brazil';
export type OcEnergyScenario = 'Wind/Solar' | 'Wind' | 'Solar';
export type OcDiet = 'omnivore' | 'flexitarian' | 'vegetarian' | 'vegan';
export type OcTurbineClass = 'small' | 'medium' | 'large';

/** Scenario inputs, structurally compatible with the bespoke SimInputs. */
export interface OcInputs {
  population: number;
  country: OcCountry;
  energySelfSufficiency?: number;
  energyScenario?: OcEnergyScenario;
  foodScenario?: string;
  foodSelfSufficiency?: number;
  dietaryPreference?: OcDiet;
  productionFocus?: number;
  waterSelfSufficiency?: number;
  economicSelfSufficiency?: number;
  turbineClass?: OcTurbineClass;
  regenerativeAgriculture?: boolean;
}

export interface ParityScenario {
  readonly id: string;
  readonly inputs: OcInputs;
}

const POPULATIONS = [0, 1000, 50_000, 250_000, 1_000_000];
const COUNTRIES: OcCountry[] = ['Netherlands', 'Vietnam', 'Brazil'];
const ENERGY_SCENARIOS: OcEnergyScenario[] = ['Wind/Solar', 'Wind', 'Solar'];
const DIETS: OcDiet[] = ['omnivore', 'flexitarian', 'vegetarian', 'vegan'];
const TURBINE_CLASSES: OcTurbineClass[] = ['small', 'medium', 'large'];
const SELF_SUFFICIENCY_LEVELS = [0, 0.5, 1.0, 1.5];

function buildGrid(): ParityScenario[] {
  const scenarios: ParityScenario[] = [];

  // Base grid: population x country x energy scenario (5 x 3 x 3 = 45).
  for (const population of POPULATIONS) {
    for (const country of COUNTRIES) {
      for (const energyScenario of ENERGY_SCENARIOS) {
        scenarios.push({
          id: `base|pop=${population}|${country}|${energyScenario}`,
          inputs: { population, country, energyScenario },
        });
      }
    }
  }

  // Targeted selector sweep at the NL 50,000 baseline.
  const base = { population: 50_000, country: 'Netherlands' as OcCountry };

  for (const level of SELF_SUFFICIENCY_LEVELS) {
    scenarios.push({ id: `sweep|energySS=${level}`, inputs: { ...base, energySelfSufficiency: level } });
    scenarios.push({ id: `sweep|foodSS=${level}`, inputs: { ...base, foodSelfSufficiency: level } });
    scenarios.push({ id: `sweep|waterSS=${level}`, inputs: { ...base, waterSelfSufficiency: level } });
    scenarios.push({ id: `sweep|econSS=${level}`, inputs: { ...base, economicSelfSufficiency: level } });
  }

  for (const dietaryPreference of DIETS) {
    scenarios.push({ id: `sweep|diet=${dietaryPreference}`, inputs: { ...base, dietaryPreference } });
  }

  for (const productionFocus of [0, 1]) {
    scenarios.push({ id: `sweep|productionFocus=${productionFocus}`, inputs: { ...base, productionFocus } });
  }

  for (const turbineClass of TURBINE_CLASSES) {
    scenarios.push({ id: `sweep|turbine=${turbineClass}`, inputs: { ...base, turbineClass } });
  }

  for (const regenerativeAgriculture of [true, false]) {
    scenarios.push({
      id: `sweep|regen=${regenerativeAgriculture}`,
      inputs: { ...base, regenerativeAgriculture },
    });
  }

  for (const foodScenario of ['regenerative', 'conventional']) {
    scenarios.push({ id: `sweep|foodScenario=${foodScenario}`, inputs: { ...base, foodScenario } });
  }

  return scenarios;
}

export const PARITY_GRID: readonly ParityScenario[] = Object.freeze(buildGrid());
