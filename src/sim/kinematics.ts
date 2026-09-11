/**
 * Closed-form crank-slider kinematics.
 *
 * Angle convention: theta = 0 puts the piston at TDC, and increases with
 * crankshaft rotation. All lengths are millimetres.
 *
 * The finite length of the connecting rod is what makes the piston move
 * faster around TDC than around BDC. That asymmetry is the whole point of
 * this module -- never approximate it with a plain sine wave.
 */

export interface CrankSlider {
  /** Half the stroke, i.e. the crankpin offset from the crank axis (mm). */
  crankRadius: number;
  /** Centre-to-centre length of the connecting rod (mm). */
  rodLength: number;
}

export const DEG = Math.PI / 180;

/** Distance from the crank axis to the piston pin (mm). Max at TDC. */
export function pinDistance(thetaDeg: number, cs: CrankSlider): number {
  const t = thetaDeg * DEG;
  const { crankRadius: r, rodLength: l } = cs;
  const s = r * Math.sin(t);
  return r * Math.cos(t) + Math.sqrt(l * l - s * s);
}

/** How far the piston has descended from TDC (mm). 0 at TDC, stroke at BDC. */
export function displacementFromTDC(thetaDeg: number, cs: CrankSlider): number {
  return cs.crankRadius + cs.rodLength - pinDistance(thetaDeg, cs);
}

/**
 * Tilt of the connecting rod away from the cylinder axis (radians).
 * Positive when the crankpin is on the +y side of the bore axis.
 */
export function rodAngle(thetaDeg: number, cs: CrankSlider): number {
  const t = thetaDeg * DEG;
  return Math.asin((cs.crankRadius * Math.sin(t)) / cs.rodLength);
}

/** d(displacement)/d(theta) in mm per radian. Positive while descending. */
export function displacementRate(thetaDeg: number, cs: CrankSlider): number {
  const t = thetaDeg * DEG;
  const { crankRadius: r, rodLength: l } = cs;
  const s = r * Math.sin(t);
  return r * Math.sin(t) + (r * r * Math.sin(t) * Math.cos(t)) / Math.sqrt(l * l - s * s);
}

/** Piston speed in m/s at a given crank angle and rpm. */
export function pistonSpeed(thetaDeg: number, rpm: number, cs: CrankSlider): number {
  const omega = (rpm * 2 * Math.PI) / 60; // rad/s
  return (displacementRate(thetaDeg, cs) * omega) / 1000;
}

/** Bore area in mm^2. */
export function boreArea(boreMm: number): number {
  return (Math.PI / 4) * boreMm * boreMm;
}
