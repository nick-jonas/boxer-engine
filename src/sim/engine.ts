/**
 * The engine simulation. Deliberately contains zero rendering code: the
 * renderer reads this each frame, never the other way round.
 */

import { displacementFromTDC, pistonSpeed, rodAngle } from './kinematics';
import {
  AIRHEAD_TIMING,
  exhaustLift,
  intakeLift,
  strokeAt,
  wrap360,
  wrap720,
  type Stroke,
  type ValveTiming,
} from './valvetrain';
import {
  AIRHEAD_GEOMETRY,
  DEFAULT_PARAMS,
  computeCycle,
  sample,
  type CycleParams,
  type CycleTable,
  type CylinderGeometry,
} from './thermo';

export interface CylinderConfig {
  name: string;
  /** Human-readable label for UI and quiz prompts. */
  label: string;
  /** -1 for the left bank (bore axis along -X), +1 for the right bank. */
  bankSign: -1 | 1;
  /**
   * Offset added to the engine cycle angle to get this cylinder's own cycle
   * angle. A boxer twin uses 0 and 360: both pistons reach TDC together, but
   * one is on compression while the other is on exhaust.
   */
  cycleOffset: number;
}

export const BOXER_TWIN: CylinderConfig[] = [
  { name: 'left', label: 'Left cylinder', bankSign: -1, cycleOffset: 0 },
  { name: 'right', label: 'Right cylinder', bankSign: 1, cycleOffset: 360 },
];

/**
 * A deliberately broken cylinder, for the diagnostics questions. Faults are
 * expressed as overrides on that one cylinder's cycle parameters, so a dead
 * cylinder really does stop making pressure and torque rather than just being
 * drawn differently.
 */
export interface CylinderFault {
  /** Shown in the UI when the fault is active. */
  label: string;
  params?: Partial<CycleParams>;
  /** Purely cosmetic symptoms the renderer reacts to. */
  smoke?: 'blue' | 'black' | 'white';
  /** Exaggerated valvetrain noise/motion. */
  valveRattle?: boolean;
}

export const FAULTS: Record<string, CylinderFault> = {
  deadPlug: { label: 'Dead spark plug (misfire)', params: { ignitionOn: false } },
  burningOil: { label: 'Worn rings - burning oil', smoke: 'blue' },
  richMixture: { label: 'Over-rich mixture', smoke: 'black' },
  wideValveClearance: { label: 'Valve clearance too wide', valveRattle: true },
};

export interface CylinderState {
  name: string;
  bankSign: -1 | 1;
  /** This cylinder's own cycle angle, 0..720. */
  cycleAngle: number;
  /** Crank angle for this cylinder, 0..360, zero at TDC. */
  crankAngle: number;
  stroke: Stroke;
  /** Piston distance below TDC along the bore axis, mm. */
  displacement: number;
  /** Connecting rod tilt, radians. */
  rodAngle: number;
  /** Piston speed, m/s. */
  pistonSpeed: number;
  intakeLift: number;
  exhaustLift: number;
  /** Pa. */
  pressure: number;
  /** m^3. */
  volume: number;
  /** K. */
  temperature: number;
  burnedFraction: number;
  /** 0..1, spikes at the instant of most violent combustion. */
  heatReleaseRate: number;
  /** N*m from this cylinder alone. */
  torque: number;
  /** True for the few degrees around the spark event. */
  sparking: boolean;
  /** Active fault on this cylinder, if any. */
  fault: CylinderFault | null;
  smoke: 'blue' | 'black' | 'white' | null;
}

export interface EngineOptions {
  geometry?: CylinderGeometry;
  timing?: ValveTiming;
  params?: CycleParams;
  cylinders?: CylinderConfig[];
}

export class EngineSim {
  readonly geometry: CylinderGeometry;
  readonly timing: ValveTiming;
  readonly cylinders: CylinderConfig[];

  params: CycleParams;
  /** Active fault per cylinder name; absent means healthy. */
  readonly faults = new Map<string, CylinderFault>();
  /** Engine cycle angle in [0, 720). Cylinder 0 fires at 0. */
  cycleAngle = 0;
  /** Crankshaft speed the engine is *actually* turning at. */
  rpm = 900;
  running = true;

  /** One cycle table per cylinder, since a fault can affect just one bank. */
  private tables = new Map<string, CycleTable>();

  constructor(opts: EngineOptions = {}) {
    this.geometry = opts.geometry ?? AIRHEAD_GEOMETRY;
    this.timing = opts.timing ?? AIRHEAD_TIMING;
    this.params = { ...(opts.params ?? DEFAULT_PARAMS) };
    this.cylinders = opts.cylinders ?? BOXER_TWIN;
    this.recompute();
  }

  private recompute(): void {
    for (const c of this.cylinders) {
      const fault = this.faults.get(c.name);
      this.tables.set(c.name, computeCycle(this.geometry, { ...this.params, ...(fault?.params ?? {}) }));
    }
  }

  /** Recompute every cycle table. Call after mutating `params`. */
  refresh(patch: Partial<CycleParams> = {}): void {
    this.params = { ...this.params, ...patch };
    this.recompute();
  }

  /** Apply (or with a null fault, clear) a fault on one cylinder. */
  setFault(cylinderName: string, fault: CylinderFault | null): void {
    if (fault) this.faults.set(cylinderName, fault);
    else this.faults.delete(cylinderName);
    this.recompute();
  }

  clearFaults(): void {
    this.faults.clear();
    this.recompute();
  }

  tableOf(cylinderName: string): CycleTable {
    const t = this.tables.get(cylinderName);
    if (!t) throw new Error(`No cycle table for cylinder "${cylinderName}"`);
    return t;
  }

  /** Reference table, for gauges that show a single representative cycle. */
  get cycle(): CycleTable {
    return this.tableOf(this.cylinders[0].name);
  }

  /**
   * Advance the simulation.
   *
   * `dt` is real elapsed seconds. `playbackDivisor` slows the *animation*
   * without lying about rpm: at 6000 rpm the crank covers 600 degrees per
   * 60 Hz frame, which strobes into nonsense, so the display runs slow while
   * the gauge still reads the true speed.
   */
  advance(dt: number, playbackDivisor = 1): void {
    if (!this.running) return;
    const degPerSecond = (this.rpm / 60) * 360;
    this.cycleAngle = wrap720(this.cycleAngle + (degPerSecond * dt) / Math.max(1, playbackDivisor));
  }

  /** Jump straight to a cycle angle (used by the scrub slider and step button). */
  seek(cycleAngle: number): void {
    this.cycleAngle = wrap720(cycleAngle);
  }

  stateOf(config: CylinderConfig): CylinderState {
    const c = wrap720(this.cycleAngle + config.cycleOffset);
    const theta = wrap360(c);
    const sparkAngle = wrap720(720 - this.params.sparkAdvance);
    const sinceSpark = wrap720(c - sparkAngle);
    const table = this.tableOf(config.name);
    const fault = this.faults.get(config.name);

    return {
      name: config.name,
      bankSign: config.bankSign,
      cycleAngle: c,
      crankAngle: theta,
      stroke: strokeAt(c),
      displacement: displacementFromTDC(theta, this.geometry),
      rodAngle: rodAngle(theta, this.geometry),
      pistonSpeed: pistonSpeed(theta, this.rpm, this.geometry),
      intakeLift: intakeLift(c, this.timing),
      exhaustLift: exhaustLift(c, this.timing),
      pressure: sample(table.pressure, c),
      volume: sample(table.volume, c),
      temperature: sample(table.temperature, c),
      burnedFraction: sample(table.burned, c),
      heatReleaseRate: sample(table.heatReleaseRate, c),
      torque: sample(table.torque, c),
      sparking: this.params.ignitionOn && (fault?.params?.ignitionOn ?? true) && sinceSpark < 6,
      fault: fault ?? null,
      smoke: fault?.smoke ?? null,
    };
  }

  states(): CylinderState[] {
    return this.cylinders.map((c) => this.stateOf(c));
  }

  /** Sum of every cylinder's torque at the current instant, N*m. */
  netTorque(): number {
    let t = 0;
    for (const c of this.cylinders) {
      t += sample(this.tableOf(c.name).torque, this.cycleAngle + c.cycleOffset);
    }
    return t;
  }

  /** Total displacement in cc across all cylinders. */
  get displacementCc(): number {
    return this.cycle.displacementCc * this.cylinders.length;
  }
}
