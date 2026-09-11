import * as THREE from 'three';
import type { EngineMaterials } from './materials';
import { latheFromProfile, type Pt } from './parts';

/**
 * Valve, spring, rocker and pushrod for one port.
 *
 * Everything is authored along local +Y and then rotated onto the valve axis,
 * which is tilted away from the bore axis the way a hemi-ish head actually
 * places its valves. The valve opens by moving *into* the chamber, i.e. along
 * -axis, which is also what compresses the spring against the head casting.
 */

export interface ValveSpec {
  /** Centre of the valve head when seated. */
  seat: THREE.Vector3;
  /** Unit vector pointing out of the chamber, along the stem. */
  axis: THREE.Vector3;
  headRadius: number;
  stemRadius: number;
  stemLength: number;
  /** Where the pushrod leaves the crankcase. */
  pushrodFrom: THREE.Vector3;
}

const UP = new THREE.Vector3(0, 1, 0);
const ROCKER_ARM = 24;

function valveGeometry(spec: ValveSpec): THREE.LatheGeometry {
  const { headRadius: r, stemRadius: s, stemLength: L } = spec;
  // Tulip profile: sealing face, throat, then the stem.
  const profile: Pt[] = [
    [0, 0],
    [r, 1.4],
    [r, 4],
    [r * 0.5, 9],
    [s * 1.6, 15],
    [s, 21],
    [s, L],
    [0, L],
  ];
  return latheFromProfile(profile, 36);
}

/** A coil spring drawn as a tube following a helix. */
function springGeometry(radius: number, length: number, turns: number, wire: number): THREE.TubeGeometry {
  const points: THREE.Vector3[] = [];
  const steps = Math.ceil(turns * 14);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * turns * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, t * length, Math.sin(angle) * radius));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), steps, wire, 6, false);
}

export class ValveAssembly {
  readonly group = new THREE.Group();
  /** Where the pushrod meets the rocker; the port branches near here. */
  readonly rockerPivot: THREE.Vector3;

  private readonly moving = new THREE.Group();
  private readonly spring: THREE.Mesh;
  private readonly rocker = new THREE.Group();
  private readonly pushrod = new THREE.Group();

  private readonly axis: THREE.Vector3;
  private readonly seat: THREE.Vector3;
  private readonly pushrodBase: THREE.Vector3;
  private readonly pushrodAxis: THREE.Vector3;
  private readonly springFree: number;

  constructor(spec: ValveSpec, m: EngineMaterials) {
    this.axis = spec.axis.clone().normalize();
    this.seat = spec.seat.clone();
    this.pushrodBase = spec.pushrodFrom.clone();
    const orient = new THREE.Quaternion().setFromUnitVectors(UP, this.axis);

    // --- Valve and retainer: these travel with lift ---
    const valve = new THREE.Mesh(valveGeometry(spec), m.steel);
    const retainer = new THREE.Mesh(
      new THREE.CylinderGeometry(spec.stemRadius * 3.1, spec.stemRadius * 2.4, 5, 20),
      m.darkAlloy,
    );
    retainer.position.y = spec.stemLength * 0.84;
    this.moving.add(valve, retainer);
    this.moving.position.copy(this.seat);
    this.moving.quaternion.copy(orient);

    // --- Spring: seats on the head casting, squeezed by the retainer ---
    const springBase = spec.stemLength * 0.4;
    this.springFree = spec.stemLength * 0.44;
    this.spring = new THREE.Mesh(
      springGeometry(spec.stemRadius * 2.7, this.springFree, 6, spec.stemRadius * 0.52),
      m.steel,
    );
    const springAnchor = new THREE.Group();
    springAnchor.position.copy(this.seat).addScaledVector(this.axis, springBase);
    springAnchor.quaternion.copy(orient);
    const guide = new THREE.Mesh(
      new THREE.CylinderGeometry(spec.stemRadius * 2.1, spec.stemRadius * 2.1, springBase * 0.45, 18),
      m.aluminium,
    );
    guide.position.y = -springBase * 0.2;
    springAnchor.add(this.spring, guide);

    // --- Rocker: pivots above the stem tip and presses the valve open ---
    this.rockerPivot = this.seat.clone().addScaledVector(this.axis, spec.stemLength + 11);
    this.rocker.position.copy(this.rockerPivot);
    this.rocker.quaternion.copy(orient);
    this.rocker.add(
      new THREE.Mesh(new THREE.BoxGeometry(ROCKER_ARM * 2, 10, 12), m.steel),
      rotatedCylinder(9, 19, m.darkAlloy),
    );

    const post = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 26, 14), m.aluminium);
    post.position.copy(this.rockerPivot).addScaledVector(this.axis, -13);
    post.quaternion.copy(orient);

    // --- Pushrod: crankcase up to the far end of the rocker ---
    const across = new THREE.Vector3(1, 0, 0).applyQuaternion(orient);
    const rodTo = this.rockerPivot.clone().addScaledVector(across, -ROCKER_ARM);
    const rodDir = rodTo.clone().sub(this.pushrodBase);
    const rodLength = rodDir.length();
    this.pushrodAxis = rodDir.clone().normalize();

    const rod = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, rodLength, 10), m.steel);
    rod.position.y = rodLength / 2;
    this.pushrod.add(rod);
    this.pushrod.position.copy(this.pushrodBase);
    this.pushrod.quaternion.setFromUnitVectors(UP, this.pushrodAxis);

    // The pushrod tube is part of the casting, so it does not move.
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(10, 10, rodLength * 0.9, 14, 1, true),
      m.port,
    );
    tube.position.copy(this.pushrodBase).addScaledVector(this.pushrodAxis, rodLength * 0.5);
    tube.quaternion.copy(this.pushrod.quaternion);

    this.group.add(this.moving, springAnchor, this.rocker, post, this.pushrod, tube);
  }

  /**
   * `lift` is the lift the cam commands, in millimetres.
   *
   * `clearance` is the gap in the valve train. The cam still moves the pushrod
   * and rocker by the full amount, but the valve only starts to move once the
   * gap is taken up -- so excess clearance shows up as visible lost motion, the
   * rocker slapping across a gap before anything happens. That is exactly the
   * mechanism behind an airhead's tappet tick.
   */
  update(lift: number, clearance = 0): void {
    const valveLift = Math.max(0, lift - clearance);
    this.moving.position.copy(this.seat).addScaledVector(this.axis, -valveLift);
    this.spring.scale.y = Math.max(0.05, (this.springFree - valveLift) / this.springFree);
    this.rocker.rotation.z = Math.asin(Math.min(1, lift / ROCKER_ARM));
    // The cam pushes the rod up by the full commanded lift, for a 1:1 rocker.
    this.pushrod.position.copy(this.pushrodBase).addScaledVector(this.pushrodAxis, lift);
  }
}

/**
 * R80-style rocker cover: two rounded lobes, one over each rocker, joined into
 * a single pillowed dome, with the wire guard that protects it.
 *
 * Built by extruding a peanut outline with a heavy bevel — the bevel is what
 * produces the domed, pressed-alloy look rather than a slab. Left
 * semi-transparent so the valve gear underneath stays visible.
 */
export function rockerCover(
  lobeSpacing: number,
  lobeRadius: number,
  depth: number,
  material: THREE.Material,
  guardMaterial: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();

  // Peanut outline: the OUTER half of each circle, joined by their common
  // tangents. Sweeping the inner halves instead collapses it into a lens.
  const shape = new THREE.Shape();
  shape.absarc(-lobeSpacing, 0, lobeRadius, Math.PI / 2, -Math.PI / 2, false);
  shape.absarc(lobeSpacing, 0, lobeRadius, -Math.PI / 2, Math.PI / 2, false);
  shape.closePath();

  const bevel = Math.min(14, depth * 0.42);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(2, depth - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.85,
    bevelSegments: 8,
    curveSegments: 40,
  });
  // Extrusion runs along the shape's +Z; swing it onto the bore axis so the
  // outline lies in the Y-Z plane.
  geom.applyMatrix4(
    new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(1, 0, 0),
    ),
  );
  group.add(new THREE.Mesh(geom, material));

  // Centre bolt, and the wire guard hooping over the lobes.
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 10, 6), guardMaterial);
  bolt.geometry.rotateZ(Math.PI / 2);
  bolt.position.x = depth * 0.62;
  group.add(bolt);

  const reach = lobeSpacing + lobeRadius;
  for (const offset of [-0.55, 0, 0.55]) {
    const arcPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const across = (t * 2 - 1) * reach * 1.04;
      // Follow the dome: full height at the centre, tucked in at the edges.
      const bulge = Math.cos((across / (reach * 1.04)) * (Math.PI / 2));
      arcPoints.push(new THREE.Vector3(depth * 0.52 * bulge - 2, across, offset * lobeRadius * 1.25));
    }
    const rib = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPoints), 28, 2.4, 6, false),
      guardMaterial,
    );
    group.add(rib);
  }

  return group;
}

function rotatedCylinder(radius: number, length: number, material: THREE.Material): THREE.Mesh {
  const geom = new THREE.CylinderGeometry(radius, radius, length, 18);
  geom.rotateX(Math.PI / 2);
  return new THREE.Mesh(geom, material);
}

/**
 * Camshaft in the crankcase. It turns at exactly half crank speed, which is the
 * mechanical reason a four-stroke cycle needs 720 degrees of crankshaft.
 */
export class Camshaft {
  readonly group = new THREE.Group();

  constructor(m: EngineMaterials, lobeOffsets: number[]) {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 210, 20), m.steel);
    shaft.geometry.rotateX(Math.PI / 2);
    this.group.add(shaft);

    lobeOffsets.forEach((z, i) => {
      // An egg: a base circle with one nose, offset so the nose leads.
      const lobe = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 14, 28), m.steel);
      lobe.geometry.rotateX(Math.PI / 2);
      const nose = new THREE.Mesh(new THREE.SphereGeometry(11, 16, 12), m.steel);
      nose.position.x = 14;
      const holder = new THREE.Group();
      holder.add(lobe, nose);
      holder.position.z = z;
      holder.rotation.z = i * (Math.PI / 2);
      this.group.add(holder);
    });
  }

  /** Takes the *crank* angle in degrees and halves it. */
  update(crankAngleDeg: number): void {
    this.group.rotation.z = (crankAngleDeg / 2) * (Math.PI / 180);
  }
}
