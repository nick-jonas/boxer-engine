/**
 * Valve timing and lift.
 *
 * All angles are *cycle* angles in [0, 720), where 0 is TDC on the firing
 * stroke. The camshaft turns at half crank speed, which is exactly why a
 * four-stroke engine needs 720 degrees of crank to complete one cycle.
 */

export interface ValveTiming {
  /** Intake valve opens, cycle degrees (350 = 10 deg BTDC). */
  ivo: number;
  /** Intake valve closes (590 = 50 deg ABDC). */
  ivc: number;
  /** Exhaust valve opens (130 = 50 deg BBDC). */
  evo: number;
  /** Exhaust valve closes (370 = 10 deg ATDC). */
  evc: number;
  /** Peak lift at the valve, mm. */
  maxLift: number;
}

export const AIRHEAD_TIMING: ValveTiming = {
  ivo: 350,
  ivc: 590,
  evo: 130,
  evc: 370,
  maxLift: 10.5,
};

export function wrap720(angle: number): number {
  return ((angle % 720) + 720) % 720;
}

export function wrap360(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/**
 * Lift of a single valve, 0 when seated.
 *
 * Raised-cosine lobe: zero lift *and* zero velocity at the seat, so the
 * valve never appears to slam open or shut.
 */
export function valveLift(cycleAngle: number, open: number, close: number, maxLift: number): number {
  const duration = wrap720(close - open);
  const since = wrap720(cycleAngle - open);
  if (since >= duration) return 0;
  const frac = since / duration;
  return maxLift * 0.5 * (1 - Math.cos(2 * Math.PI * frac));
}

export function intakeLift(cycleAngle: number, t: ValveTiming): number {
  return valveLift(cycleAngle, t.ivo, t.ivc, t.maxLift);
}

export function exhaustLift(cycleAngle: number, t: ValveTiming): number {
  return valveLift(cycleAngle, t.evo, t.evc, t.maxLift);
}

export type Stroke = 'power' | 'exhaust' | 'intake' | 'compression';

/** Which of the four strokes a cycle angle falls in. */
export function strokeAt(cycleAngle: number): Stroke {
  const a = wrap720(cycleAngle);
  if (a < 180) return 'power';
  if (a < 360) return 'exhaust';
  if (a < 540) return 'intake';
  return 'compression';
}
