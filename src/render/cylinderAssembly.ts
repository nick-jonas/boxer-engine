import * as THREE from 'three';
import type { CylinderState } from '../sim/engine';
import type { CylinderGeometry } from '../sim/thermo';
import { boreArea, pinDistance } from '../sim/kinematics';
import type { EngineMaterials } from './materials';
import {
  alignToBoreAxis,
  barrelProfile,
  connectingRod,
  headProfile,
  pistonGeometry,
  sectionedLathe,
} from './parts';
import { PortFlow, portTube } from './portFlow';
import { rockerCover, ValveAssembly } from './valvetrain';

/**
 * One cylinder, expressed in a local frame whose origin sits on the crank
 * axis and whose +X points out of the bore. TDC is at maximum +X.
 *
 * The left bank of a boxer is this same assembly rotated 180 degrees about Y.
 * That rotation flips X and Z but not Y, while the crankpin it must follow is
 * 180 degrees round the crank -- so the left bank also needs `rodSign = -1` to
 * make the rod lean the correct way. Getting that sign wrong is the classic
 * boxer bug: the piston still moves correctly but the rod scissors backwards.
 */
export interface AssemblyOptions {
  geometry: CylinderGeometry;
  materials: EngineMaterials;
  /** +1 for the right bank, -1 for the left. */
  rodSign: 1 | -1;
  /**
   * Crankpin position along the crank axis in this assembly's LOCAL frame. A
   * mirrored bank is rotated 180 degrees about Y, which negates Z, so its local
   * value is the negative of the crankpin's world Z.
   */
  pinOffsetZ: number;
  /**
   * True for a bank rotated 180 degrees about Y. The cutaway opening and the
   * plug and ports all have to swing round with it, or the mirrored bank shows
   * the camera its back.
   */
  mirrored?: boolean;
}

const PIN_HEIGHT = 32; // crown face down to wrist-pin centre, mm
const BARREL_BASE_X = 98; // where the barrel meets the crankcase, mm from crank axis

export class CylinderAssembly {
  readonly group = new THREE.Group();
  readonly deckX: number;
  /** Named sub-assemblies, for highlighting and click-to-ask picking. */
  readonly parts: Record<string, THREE.Object3D> = {};

  private readonly piston: THREE.Mesh;
  private readonly rod: THREE.Group;
  private readonly gas: THREE.Mesh;
  private readonly flame: THREE.PointLight;
  private readonly sparkCore: THREE.Mesh;
  private readonly sparkLight: THREE.PointLight;
  private readonly intakeFlow: PortFlow;
  private readonly exhaustFlow: PortFlow;
  private readonly intakeValve: ValveAssembly;
  private readonly exhaustValve: ValveAssembly;
  private readonly opts: AssemblyOptions;

  constructor(opts: AssemblyOptions) {
    this.opts = opts;
    const { geometry: g, materials: m } = opts;

    const mirrored = opts.mirrored ?? false;
    const cutPhase = mirrored ? Math.PI : 0;
    // Local -Z maps to world +Z once the bank is rotated, so everything that
    // should face the viewer is authored on the opposite side.
    const zf = mirrored ? -1 : 1;

    const boreR = g.bore / 2;
    const maxCrownX = g.crankRadius + g.rodLength + PIN_HEIGHT;
    // The clearance volume, spread as a flat gap over the bore, sets the deck
    // height -- so the compression ratio you see is the one being simulated.
    const clearanceMm3 = (boreArea(g.bore) * g.stroke) / (g.compressionRatio - 1);
    const tdcGap = clearanceMm3 / boreArea(g.bore);
    this.deckX = maxCrownX + tdcGap;
    const deck = this.deckX;

    const barrel = sectionedLathe(
      barrelProfile({
        boreRadius: boreR,
        wallRadius: boreR * 1.2,
        finRadius: boreR * 1.42,
        length: deck - BARREL_BASE_X,
        finCount: 7,
      }),
      m.barrel,
      64,
      cutPhase,
    );
    alignToBoreAxis(barrel);
    barrel.position.x = BARREL_BASE_X;

    const head = sectionedLathe(headProfile(boreR * 0.94, boreR * 1.3, boreR * 1.44, 50, 3), m.aluminium, 64, cutPhase);
    alignToBoreAxis(head);
    head.position.x = deck;

    // --- Valve gear -------------------------------------------------------
    // Valves are splayed 45 degrees to either side of vertical and canted
    // toward the viewer, so both sit in the cutaway opening rather than buried
    // in the casting. That is a legitimate hemi layout and the only way the
    // valve gear is actually watchable.
    const TILT = 24 * (Math.PI / 180);
    const SPLAY = 45 * (Math.PI / 180);

    /** Unit vector out from the bore axis toward a valve, around the bore. */
    const radial = (sign: 1 | -1) =>
      new THREE.Vector3(0, sign * Math.cos(SPLAY), Math.sin(SPLAY) * zf);
    const seatOf = (sign: 1 | -1) =>
      new THREE.Vector3(deck + 4, 0, 0).addScaledVector(radial(sign), 23);
    const axisOf = (sign: 1 | -1) =>
      new THREE.Vector3(Math.cos(TILT), 0, 0).addScaledVector(radial(sign), Math.sin(TILT)).normalize();
    const pushrodOf = (sign: 1 | -1) =>
      new THREE.Vector3(52, 0, 0).addScaledVector(radial(sign), 74);

    this.intakeValve = new ValveAssembly(
      { seat: seatOf(1), axis: axisOf(1), headRadius: 18, stemRadius: 4.2, stemLength: 52, pushrodFrom: pushrodOf(1) },
      m,
    );
    this.exhaustValve = new ValveAssembly(
      { seat: seatOf(-1), axis: axisOf(-1), headRadius: 15, stemRadius: 4.2, stemLength: 52, pushrodFrom: pushrodOf(-1) },
      m,
    );

    // One lobe over each rocker, centred on the plane the valves splay in.
    const cover = rockerCover(30, 30, 48, m.cover, m.darkAlloy);
    // The dome faces straight out along the bore axis, as it does on the bike.
    cover.position.set(deck + 56, 0, 34 * zf);

    this.piston = new THREE.Mesh(
      pistonGeometry({ radius: boreR - 0.4, crownHeight: 22, skirtLength: 34, pinHeight: PIN_HEIGHT }),
      m.pistonAlloy,
    );
    alignToBoreAxis(this.piston);

    this.rod = new THREE.Group();
    this.rod.add(new THREE.Mesh(connectingRod(g.rodLength, 26, 15), m.steel));
    this.rod.position.z = opts.pinOffsetZ;

    this.gas = new THREE.Mesh(new THREE.CylinderGeometry(boreR * 0.97, boreR * 0.97, 1, 40, 1, true), m.gas.clone());
    alignToBoreAxis(this.gas);

    this.flame = new THREE.PointLight(0xff8c3a, 0, 400, 2);
    this.flame.position.x = deck - 10;

    // --- Spark plug ------------------------------------------------------
    // Angled out through the cutaway opening, the way a sectioned drawing
    // shows it, so the electrode gap is never hidden behind the head casting.
    const tip = new THREE.Vector3(deck + 6, 0, 6 * zf);
    const plugOut = new THREE.Vector3(deck + 20, 14, 82 * zf);
    const plug = portTube(tip, plugOut, 9, m.darkAlloy);
    const plugHex = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 16, 6), m.steel);
    plugHex.position.copy(tip).lerp(plugOut, 0.55);
    plugHex.quaternion.copy(plug.quaternion);
    const sparkPlug = new THREE.Group();
    sparkPlug.add(plug, plugHex);

    this.sparkCore = new THREE.Mesh(
      new THREE.IcosahedronGeometry(5, 1),
      new THREE.MeshBasicMaterial({ color: 0xcfe4ff, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.sparkCore.position.copy(tip);
    this.sparkLight = new THREE.PointLight(0x9ec8ff, 0, 260, 2);
    this.sparkLight.position.copy(tip);

    // --- Ports and flow --------------------------------------------------
    // Kept close to the X-Y plane so both ports read clearly from the default
    // three-quarter view instead of hiding behind the head casting.
    // Ports branch off each valve just above its seat and exit the head's side.
    // Ports branch off each valve just above its seat and exit the head's side.
    const portOf = (sign: 1 | -1, distance: number) =>
      new THREE.Vector3(deck + 14, 0, 0).addScaledVector(radial(sign), distance);
    const intakeIn = portOf(1, 32);
    const intakeOut = portOf(1, 100).setX(deck + 26);
    const exhaustIn = portOf(-1, 32);
    const exhaustOut = portOf(-1, 100).setX(deck + 26);

    const intakePort = portTube(intakeIn, intakeOut, 17, m.port);
    const exhaustPort = portTube(exhaustIn, exhaustOut, 17, m.port);

    Object.assign(this.parts, {
      barrel,
      head,
      cover,
      piston: this.piston,
      rod: this.rod,
      sparkPlug,
      intakePort,
      exhaustPort,
      intakeValve: this.intakeValve.group,
      exhaustValve: this.exhaustValve.group,
    });

    // Intake draws inward, exhaust pushes outward.
    this.intakeFlow = new PortFlow(intakeOut, intakeIn, 0x6fc0ff, 17, 0.2, 22);
    this.exhaustFlow = new PortFlow(exhaustIn, exhaustOut, 0xff7a3c, 17, 0.2, 22);

    this.group.add(
      barrel,
      head,
      cover,
      this.piston,
      this.rod,
      this.gas,
      this.flame,
      sparkPlug,
      this.sparkCore,
      this.sparkLight,
      intakePort,
      exhaustPort,
      this.intakeFlow.points,
      this.exhaustFlow.points,
      this.intakeValve.group,
      this.exhaustValve.group,
    );
  }

  /** Read the sim and pose the parts. Called once per frame. */
  update(state: CylinderState, dt = 0, rpm = 900): void {
    const { geometry: g, rodSign } = this.opts;
    const theta = state.crankAngle;
    const pin = pinDistance(theta, g);

    // Piston: crown face rides PIN_HEIGHT above the wrist pin.
    const crownX = pin + PIN_HEIGHT;
    this.piston.position.x = crownX;

    // Rod: big end sits on the crankpin, small end reaches the wrist pin.
    this.rod.position.x = g.crankRadius * Math.cos(theta * (Math.PI / 180));
    this.rod.position.y = rodSign * g.crankRadius * Math.sin(theta * (Math.PI / 180));
    this.rod.rotation.z = -rodSign * state.rodAngle;

    // Gas column fills whatever is left between the crown and the deck.
    const height = Math.max(this.deckX - crownX, 0.1);
    this.gas.scale.y = height;
    this.gas.position.x = crownX + height / 2;
    tintGas(this.gas.material as THREE.MeshBasicMaterial, state);

    // Light the chamber from the *rate* of burning, not the pressure: that is
    // what makes ignition read as a flash rather than a slow glow.
    this.flame.intensity = state.heatReleaseRate * 900000;

    // The spark itself: a hard, brief flash at the electrode.
    const spark = state.sparking ? 1 : 0;
    (this.sparkCore.material as THREE.MeshBasicMaterial).opacity = spark;
    this.sparkCore.scale.setScalar(spark ? 1 + Math.random() * 0.5 : 0.001);
    this.sparkLight.intensity = spark * 90000;

    // A wide-clearance fault steals lift from the valve without changing what
    // the cam does, which is what makes the lost motion visible.
    const clearance = state.fault?.valveRattle ? 3 : 0;
    this.intakeValve.update(state.intakeLift, clearance);
    this.exhaustValve.update(state.exhaustLift, clearance);

    const flowSpeed = Math.max(0.4, rpm / 900);
    const maxLift = 10.5;
    this.intakeFlow.update(dt, state.intakeLift / maxLift, flowSpeed);

    // Smoke rides out on the exhaust stream: same path, but coloured by the
    // fault and fattened up so it reads as smoke rather than clean gas.
    const smokeTint = SMOKE_COLORS[state.smoke ?? 'none'];
    this.exhaustFlow.setColor(smokeTint.color, smokeTint.size, state.smoke !== null);
    this.exhaustFlow.update(dt, (state.exhaustLift / maxLift) * smokeTint.density, flowSpeed);
  }
}

/** Exhaust stream appearance, healthy and for each smoke fault. */
const SMOKE_COLORS: Record<string, { color: number; size: number; density: number }> = {
  none: { color: 0xff7a3c, size: 0.2, density: 1 },
  blue: { color: 0x8fa8e8, size: 0.42, density: 1.6 },
  black: { color: 0x2b2b2e, size: 0.44, density: 1.7 },
  white: { color: 0xdfe6ee, size: 0.42, density: 1.6 },
};

const COLD = new THREE.Color(0x5fa8ff);
const COMPRESSED = new THREE.Color(0xcfa14a);
const FLAME = new THREE.Color(0xffd08a);
const BURNT = new THREE.Color(0x6b5340);

/**
 * The charge is a hint, not a wall. It has to stay faint enough that the
 * piston crown behind it is always readable -- the moment the gas hides the
 * mechanism it stops teaching anything.
 */
const MAX_GAS_OPACITY = 0.42;

function tintGas(mat: THREE.MeshBasicMaterial, s: CylinderState): void {
  if (s.stroke === 'exhaust') {
    mat.color.copy(BURNT);
    mat.opacity = 0.18;
  } else if (s.stroke === 'intake') {
    // Fresh charge: brightest of the four, because "the cylinder is filling"
    // is the hardest stroke to see otherwise.
    mat.color.copy(COLD);
    mat.opacity = 0.3;
  } else if (s.burnedFraction > 0.001) {
    mat.color
      .copy(COMPRESSED)
      .lerp(FLAME, Math.min(1, s.burnedFraction * 3))
      .lerp(BURNT, Math.max(0, s.burnedFraction - 0.6) * 2);
    mat.opacity = Math.min(MAX_GAS_OPACITY, 0.2 + 0.3 * Math.min(1, s.burnedFraction * 2));
  } else {
    // Compression: darkens and thickens as the charge is squeezed.
    const squeeze = Math.min(1, s.pressure / 2e6);
    mat.color.copy(COLD).lerp(COMPRESSED, squeeze);
    mat.opacity = 0.18 + 0.18 * squeeze;
  }
}
