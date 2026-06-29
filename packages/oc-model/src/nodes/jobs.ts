// Jobs domain node. computeJobsRaw is a verbatim port of vizapp/src/sim/jobs.ts: per-category
// jobs from GFA x sector density, the degenerate-program flat-density fallback, working-age
// population, the Math.min(150,.) self-sufficiency and education caps, FTE, and education seats
// from Schools GFA or the per-1000 ratio. The node recomputes the closed land use from the
// wired energyGenerationLandM2 (jobs reads the per-category GFA).
import { q, input, type Node, type QMap } from '@symoto/core';
import { COEFFICIENTS } from '../coefficients.generated.js';
import { num, type ModelCoefficients } from '../config.js';
import type { SimInputs, LandUseResult } from '../types.js';
import { computeLandUseRaw } from './land.js';
import { LAND, COUNT, INDEX, port, m2U, personU, idxU } from '../boundaries.js';

const JOBS_PER_1000_GFA_DEFAULT = 4.5;

const JOBS_PER_1000_GFA_BY_CATEGORY: Record<string, number> = {
  Offices: 30,
  Retail: 18,
  Services: 20,
  'Health & Care': 22,
  Schools: 12,
  Hospitality: 15,
  Leisure: 8,
  'Emergency Services': 14,
  Industry: 6,
  Housing: 0.3,
};

const EDUCATION_SEATS_PER_1000_POP = 250;
const SCHOOL_AGE_FRACTION = 0.22;

export interface JobsResult {
  totalJobs: number;
  jobSelfSufficiencyPct: number;
  ftePerThousandPop: number;
  educationAccessPct: number;
  workingAgePopulation: number;
  totalFte: number;
  bySector: Record<string, number>;
}

/** Verbatim port of the bespoke computeJobs. */
export function computeJobsRaw(landUse: LandUseResult, coeffs: ModelCoefficients = COEFFICIENTS): JobsResult {
  const country = landUse.country;
  const population = Math.max(0, landUse.population);
  const cs = coeffs.countryStats;

  const bySector: Record<string, number> = {};
  let totalJobs = 0;
  let schoolsGfaM2 = 0;
  for (const cat of landUse.byCategory) {
    const gfa = Math.max(0, cat.gfaM2);
    const density = JOBS_PER_1000_GFA_BY_CATEGORY[cat.category] ?? JOBS_PER_1000_GFA_DEFAULT;
    const jobs = (gfa / 1000) * density;
    bySector[cat.category] = jobs;
    totalJobs += jobs;
    if (cat.category === 'Schools') schoolsGfaM2 += gfa;
  }

  if (totalJobs === 0 && landUse.builtGfaM2 > 0) {
    totalJobs = (landUse.builtGfaM2 / 1000) * JOBS_PER_1000_GFA_DEFAULT;
  }

  const workingPopShare = num(cs.workingPopShare[country]);
  const workingAgePopulation = population * workingPopShare;
  const jobSelfSufficiencyPct =
    workingAgePopulation > 0 ? Math.min(150, (totalJobs / workingAgePopulation) * 100) : 0;

  const ftePerPerson = num(cs.effectiveFtePerPerson[country]);
  const totalFte = totalJobs * ftePerPerson;
  const ftePerThousandPop = population > 0 ? (totalFte / population) * 1000 : 0;

  const M2_GFA_PER_SCHOOL_SEAT = 10;
  const seatsFromGfa = schoolsGfaM2 / M2_GFA_PER_SCHOOL_SEAT;
  const seatsFromRatio = (EDUCATION_SEATS_PER_1000_POP * population) / 1000;
  const educationSeats = seatsFromGfa > 0 ? seatsFromGfa : seatsFromRatio;
  const schoolAgePop = population * SCHOOL_AGE_FRACTION;
  const educationAccessPct = schoolAgePop > 0 ? Math.min(150, (educationSeats / schoolAgePop) * 100) : 0;

  return { totalJobs, jobSelfSufficiencyPct, ftePerThousandPop, educationAccessPct, workingAgePopulation, totalFte, bySector };
}

const D = 'jobs';

/** Build the jobs node for a scenario. */
export function makeJobsNode(inputs: SimInputs): Node {
  return {
    id: 'n5-jobs',
    kind: 'readout',
    ports: {
      in: [port(`${D}.energyGenerationLandM2In`, m2U, LAND)],
      out: [
        port(`${D}.totalJobs`, idxU, COUNT),
        port(`${D}.jobSelfSufficiencyPct`, idxU, INDEX),
        port(`${D}.ftePerThousandPop`, idxU, INDEX),
        port(`${D}.educationAccessPct`, idxU, INDEX),
        port(`${D}.workingAgePopulation`, personU, COUNT),
        port(`${D}.totalFte`, idxU, COUNT),
      ],
    },
    compute: (_ctx, portInputs): QMap => {
      const energyGen = portInputs[`${D}.energyGenerationLandM2In`]?.value ?? 0;
      const landUse = computeLandUseRaw(inputs, COEFFICIENTS, energyGen);
      const r = computeJobsRaw(landUse, COEFFICIENTS);
      const idx = (id: string, v: number) => [`${D}.${id}`, q(v, idxU, INDEX, input(`${D}:${id}`))] as const;
      const out: Array<readonly [string, ReturnType<typeof q>]> = [
        [`${D}.totalJobs`, q(r.totalJobs, idxU, COUNT, input(`${D}:totalJobs`))],
        idx('jobSelfSufficiencyPct', r.jobSelfSufficiencyPct),
        idx('ftePerThousandPop', r.ftePerThousandPop),
        idx('educationAccessPct', r.educationAccessPct),
        [`${D}.workingAgePopulation`, q(r.workingAgePopulation, personU, COUNT, input(`${D}:workingAgePopulation`))],
        [`${D}.totalFte`, q(r.totalFte, idxU, COUNT, input(`${D}:totalFte`))],
      ];
      // Per-sector jobs (bySector record), emitted as jobs.bySector.<Category> readouts.
      for (const [cat, v] of Object.entries(r.bySector)) {
        out.push([`${D}.bySector.${cat}`, q(v, idxU, COUNT, input(`${D}:bySector.${cat}`))]);
      }
      return Object.fromEntries(out);
    },
  };
}
