/**
 * Single-zone thermodynamic model of one cylinder, tabulated over a full
 * 720-degree cycle at 1-degree resolution.
 *
 * Why a table? The renderer needs to be scrubbable -- the user can drag the
 * crank backwards -- so pressure cannot be produced by stepping an ODE in
 * lockstep with the animation. Instead the whole cycle is integrated once
 * whenever a parameter changes (720 steps, well under a millisecond) and the
 * renderer just looks values up.
 */

import { DEG, boreArea, displacementFromTDC, displacementRate, rodAngle, type CrankSlider } from './kinematics';
import { wrap720 } from './valvetrain';

export interface CylinderGeometry extends CrankSlider {
  /** Cylinder bore, mm. */
  bore: number;
  /** Full stroke, mm. Equals 2 * crankRadius. */
  stroke: number;
  /** Geometric compression ratio. */
  compressionRatio: number;
}

export interface CycleParams {
  /** 0 = closed throttle, 1 = wide open. Sets manifold pressure. */
  throttle: number;
  /** Spark advance, crank degrees before TDC. */
  sparkAdvance: number;
  /** 10-90% burn duration, crank degrees. */
  burnDuration: number;
  /** Crank degrees between spark and the start of appreciable heat release. */
  ignitionDelay: number;
  /** Set false to motor the engine over without firing. */
  ignitionOn: boolean;
}

export const DEFAULT_PARAMS: CycleParams = {
  throttle: 0.35,
  sparkAdvance: 28,
  burnDuration: 60,
  ignitionDelay: 8,
  ignitionOn: true,
};

/** BMW R100-ish airhead: 94 x 70.6 mm, ~980 cc across two cylinders. */
export const AIRHEAD_GEOMETRY: CylinderGeometry = {
  bore: 94,
  stroke: 70.6,
  crankRadius: 35.3,
  rodLength: 125,
  compressionRatio: 8.5,
};

const R_AIR = 287; // J/(kg K)
const GAMMA = 1.35; // effective ratio of specific heats for burned/unburned mix
const LHV = 44e6; // J/kg, gasoline
const AFR = 14.7;
const COMB_EFFICIENCY = 0.95;
const INTAKE_TEMP = 320; // K
const EXHAUST_BACK_PRESSURE = 1.05e5; // Pa
const AMBIENT = 1.0e5; // Pa

const IVC = 590; // cycle deg
const EVO = 130; // cycle deg
const BLOWDOWN_SPAN = 60; // cycle deg for the pressure to dump through the valve

export interface CycleTable {
  /** Pa, indexed by integer cycle degree 0..719. */
  pressure: Float64Array;
  /** m^3. */
  volume: Float64Array;
  /** Kelvin. */
  temperature: Float64Array;
  /** Mass-fraction burned, 0..1. */
  burned: Float64Array;
  /** Normalised heat release rate, 0..1, peaks at the most violent moment. */
  heatReleaseRate: Float64Array;
  /** Torque contribution of this one cylinder, N*m. */
  torque: Float64Array;
  /** Indicated work per cycle, joules. */
  indicatedWork: number;
  /** Peak cylinder pressure, Pa. */
  peakPressure: number;
  /** Cycle angle at which peak pressure occurs. */
  peakPressureAngle: number;
  displacementCc: number;
  clearanceCc: number;
}

export function manifoldPressure(throttle: number): number {
  return (0.18 + 0.82 * clamp01(throttle)) * AMBIENT;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Chamber volume in m^3 at a given cycle angle. */
export function chamberVolume(cycleAngle: number, g: CylinderGeometry): number {
  const areaM2 = boreArea(g.bore) * 1e-6;
  const displacedM3 = g.stroke * 1e-3 * areaM2;
  const clearanceM3 = displacedM3 / (g.compressionRatio - 1);
  return clearanceM3 + areaM2 * displacementFromTDC(cycleAngle, g) * 1e-3;
}

/** Wiebe mass-fraction-burned curve. */
export function wiebe(fraction: number, a = 5, m = 2): number {
  if (fraction <= 0) return 0;
  if (fraction >= 1) return 1;
  return 1 - Math.exp(-a * Math.pow(fraction, m + 1));
}

export function computeCycle(g: CylinderGeometry, p: CycleParams): CycleTable {
  const areaM2 = boreArea(g.bore) * 1e-6;
  const displacedM3 = g.stroke * 1e-3 * areaM2;
  const clearanceM3 = displacedM3 / (g.compressionRatio - 1);
  const pMan = manifoldPressure(p.throttle);

  const vol = (angle: number) => clearanceM3 + areaM2 * displacementFromTDC(angle, g) * 1e-3;
  // dV/dtheta in m^3 per radian
  const dVdTheta = (angle: number) => areaM2 * displacementRate(angle, g) * 1e-3;

  const pressure = new Float64Array(720);
  const volume = new Float64Array(720);
  const temperature = new Float64Array(720);
  const burned = new Float64Array(720);
  const hrr = new Float64Array(720);
  const torque = new Float64Array(720);

  // --- Closed period: integrate from IVC forward past TDC to EVO ---
  const vIvc = vol(IVC);
  const trappedMass = (pMan * vIvc) / (R_AIR * INTAKE_TEMP);
  const fuelMass = trappedMass / AFR;
  const qTotal = p.ignitionOn ? fuelMass * LHV * COMB_EFFICIENCY : 0;

  // Unwrapped domain: IVC (590) -> 720 -> EVO (130), i.e. 590 .. 850.
  const closedSpan = 720 - IVC + EVO; // 260 degrees
  const burnStart = 720 - p.sparkAdvance + p.ignitionDelay;
  const burnEnd = burnStart + p.burnDuration;

  const SUBSTEPS = 4;
  const dTheta = (1 / SUBSTEPS) * DEG;

  let P = pMan;
  let prevBurn = 0;

  for (let i = 0; i <= closedSpan; i++) {
    const angle = IVC + i;
    const idx = wrap720(angle);
    const V = vol(angle);
    const xb = qTotal > 0 ? wiebe((angle - burnStart) / p.burnDuration) : 0;

    pressure[idx] = P;
    volume[idx] = V;
    burned[idx] = xb;
    temperature[idx] = (P * V) / (trappedMass * R_AIR);
    hrr[idx] = Math.max(0, xb - prevBurn);
    prevBurn = xb;

    if (i === closedSpan) break;

    // Advance one whole degree in substeps of the single-zone energy equation:
    //   dP/dtheta = -gamma * P/V * dV/dtheta + (gamma-1)/V * dQ/dtheta
    for (let s = 0; s < SUBSTEPS; s++) {
      const a0 = angle + s / SUBSTEPS;
      const a1 = a0 + 1 / SUBSTEPS;
      const V0 = vol(a0);
      const dV = dVdTheta(a0);
      const dQ =
        qTotal > 0 && a1 > burnStart && a0 < burnEnd
          ? (qTotal * (wiebe((a1 - burnStart) / p.burnDuration) - wiebe((a0 - burnStart) / p.burnDuration))) / dTheta
          : 0;
      const dP = (-GAMMA * (P / V0) * dV + ((GAMMA - 1) / V0) * dQ) * dTheta;
      P += dP;
      if (P < 1e3) P = 1e3;
    }
  }

  // --- Blowdown through the exhaust valve, then the exhaust stroke ---
  const pEvo = pressure[EVO];
  for (let i = 1; i <= BLOWDOWN_SPAN; i++) {
    const idx = wrap720(EVO + i);
    const decay = Math.exp(-4 * (i / BLOWDOWN_SPAN));
    pressure[idx] = EXHAUST_BACK_PRESSURE + (pEvo - EXHAUST_BACK_PRESSURE) * decay;
  }
  for (let a = EVO + BLOWDOWN_SPAN + 1; a <= 355; a++) {
    pressure[wrap720(a)] = EXHAUST_BACK_PRESSURE;
  }
  // Overlap: the chamber transitions from exhaust back pressure to manifold.
  for (let a = 356; a <= 375; a++) {
    const t = (a - 356) / 19;
    pressure[wrap720(a)] = EXHAUST_BACK_PRESSURE + (pMan - EXHAUST_BACK_PRESSURE) * t;
  }
  for (let a = 376; a < IVC; a++) {
    pressure[wrap720(a)] = pMan;
  }

  // --- Fill in the derived columns for the gas-exchange half ---
  for (let a = 0; a < 720; a++) {
    if (volume[a] === 0) {
      volume[a] = vol(a);
      burned[a] = 0;
      hrr[a] = 0;
      const massEst = (pressure[a] * volume[a]) / (R_AIR * (a >= 130 && a < 360 ? 900 : INTAKE_TEMP));
      temperature[a] = massEst > 0 ? (pressure[a] * volume[a]) / (massEst * R_AIR) : INTAKE_TEMP;
    }
  }

  // --- Torque and indicated work ---
  let work = 0;
  let peakPressure = 0;
  let peakPressureAngle = 0;
  for (let a = 0; a < 720; a++) {
    const gauge = pressure[a] - AMBIENT;
    const force = gauge * areaM2; // N
    const phi = rodAngle(a, g);
    const lever = (g.crankRadius * 1e-3 * Math.sin(a * DEG + phi)) / Math.cos(phi);
    torque[a] = force * lever;
    work += torque[a] * DEG;
    if (pressure[a] > peakPressure) {
      peakPressure = pressure[a];
      peakPressureAngle = a;
    }
  }

  return {
    pressure,
    volume,
    temperature,
    burned,
    heatReleaseRate: hrr,
    torque,
    indicatedWork: work,
    peakPressure,
    peakPressureAngle,
    displacementCc: displacedM3 * 1e6,
    clearanceCc: clearanceM3 * 1e6,
  };
}

/** Linear interpolation into a cycle table for fractional angles. */
export function sample(table: Float64Array, cycleAngle: number): number {
  const a = wrap720(cycleAngle);
  const i = Math.floor(a);
  const f = a - i;
  const j = (i + 1) % 720;
  return table[i] * (1 - f) + table[j] * f;
}
