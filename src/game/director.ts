import * as THREE from 'three';
import type { Stage } from '../render/scene';
import type { Highlighter } from '../render/highlight';
import { EngineSim, FAULTS } from '../sim/engine';
import type { SceneDirective, CameraPreset } from './questions';

/**
 * Turns a question's `scene` directive into what the 3D view actually does:
 * moves the camera, spins it, lights up parts, and injects real faults into the
 * simulation. Camera moves are tweened rather than cut, so the viewer keeps
 * their bearings on which end of the engine they are looking at.
 */

interface Shot {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

const SHOTS: Record<CameraPreset, Shot> = {
  wide: { position: new THREE.Vector3(2.4, 2.2, 8.8), target: new THREE.Vector3(0, -0.2, 0) },
  front: { position: new THREE.Vector3(0.15, 1.0, 9.5), target: new THREE.Vector3(0, -0.15, 0) },
  crank: { position: new THREE.Vector3(0.3, 1.3, 3.6), target: new THREE.Vector3(0, -0.15, 0) },
  rightHead: { position: new THREE.Vector3(3.5, 1.2, 4.4), target: new THREE.Vector3(2.1, 0, 0) },
  leftHead: { position: new THREE.Vector3(-3.5, 1.2, 4.4), target: new THREE.Vector3(-2.1, 0, 0) },
  chamber: { position: new THREE.Vector3(2.8, 0.95, 3.1), target: new THREE.Vector3(2.0, 0, 0) },
};

const TWEEN_SECONDS = 0.9;

export class Director {
  /** Read by the frame loop; higher means slower on-screen motion. */
  playbackDivisor = 14;

  private readonly fromPos = new THREE.Vector3();
  private readonly fromTarget = new THREE.Vector3();
  private readonly toPos = new THREE.Vector3();
  private readonly toTarget = new THREE.Vector3();
  private tween = 1;

  constructor(
    private readonly stage: Stage,
    private readonly sim: EngineSim,
    private readonly highlighter: Highlighter,
  ) {}

  apply(directive: SceneDirective | undefined, opts: { keepHighlight?: boolean } = {}): void {
    if (!directive) return;

    if (directive.camera) this.moveTo(directive.camera);
    this.stage.controls.autoRotate = directive.autoRotate ?? false;

    if (directive.highlight) this.highlighter.set(directive.highlight);
    else if (!opts.keepHighlight) this.highlighter.clear();

    if (directive.rpm !== undefined) this.sim.rpm = directive.rpm;
    if (directive.playback !== undefined) this.playbackDivisor = directive.playback;

    if (directive.cycleAngle !== undefined) {
      this.sim.seek(directive.cycleAngle);
      this.sim.running = false;
    } else if (directive.running !== undefined) {
      this.sim.running = directive.running;
    }

    // Faults are exclusive: a directive without one means a healthy engine.
    this.sim.clearFaults();
    if (directive.fault) {
      const fault = FAULTS[directive.fault.key];
      if (fault) this.sim.setFault(directive.fault.cylinder, fault);
    }
  }

  moveTo(preset: CameraPreset): void {
    const shot = SHOTS[preset];
    this.fromPos.copy(this.stage.camera.position);
    this.fromTarget.copy(this.stage.controls.target);
    this.toPos.copy(shot.position);
    this.toTarget.copy(shot.target);
    this.tween = 0;
  }

  /** Reset to the free-exploration view. */
  release(): void {
    this.highlighter.clear();
    this.stage.controls.autoRotate = false;
    this.sim.clearFaults();
    this.sim.running = true;
  }

  update(dt: number, elapsed: number): void {
    this.highlighter.update(elapsed);

    if (this.tween < 1) {
      this.tween = Math.min(1, this.tween + dt / TWEEN_SECONDS);
      const t = smoothstep(this.tween);
      this.stage.camera.position.lerpVectors(this.fromPos, this.toPos, t);
      this.stage.controls.target.lerpVectors(this.fromTarget, this.toTarget, t);
    }
  }

  /** True while a camera move is still running. */
  get moving(): boolean {
    return this.tween < 1;
  }
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
