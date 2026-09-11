import * as THREE from 'three';

/**
 * Geometry built from primitives -- no asset pipeline, no GLTF. LatheGeometry
 * does most of the work: a piston, a finned barrel and a valve are all just
 * profiles spun about an axis.
 *
 * Everything here is authored in millimetres along +Y (the natural lathe axis)
 * and then laid down onto +X, which is the bore axis in the assembly frame.
 */

/** Rotate a lathe/cylinder part so its local +Y runs along +X. */
export function alignToBoreAxis(obj: THREE.Object3D): void {
  obj.rotation.z = -Math.PI / 2;
}

export type Pt = [radius: number, y: number];

/**
 * Angular cutaway. LatheGeometry sweeps phi from +Z (phi=0) toward +X, and
 * `alignToBoreAxis` maps local +Y onto the bore axis while leaving local +Z on
 * world +Z. Starting the sweep at 54 degrees and running 252 degrees therefore
 * removes a 108-degree wedge centred on world +Z -- pointed straight at the
 * default camera. Opaque parts, visible internals, no clipping planes needed.
 */
export const CUT_START = Math.PI * 0.3;
export const CUT_LENGTH = Math.PI * 1.4;

function toVec2(points: Pt[]): THREE.Vector2[] {
  return points.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y));
}

export function latheFromProfile(points: Pt[], segments = 64, cut = false, cutPhase = 0): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    toVec2(points),
    segments,
    cut ? CUT_START + cutPhase : 0,
    cut ? CUT_LENGTH : Math.PI * 2,
  );
}

/**
 * The flat face exposed where a lathe is cut open.
 *
 * A LatheGeometry swept through less than a full turn is an open shell: it has
 * an outer skin and an inner skin but nothing joining them at the two ends of
 * the sweep, so the wall looks infinitely thin exactly where you most want to
 * read its thickness. This triangulates the profile polygon and stands it up in
 * the cut plane to close that gap.
 *
 * LatheGeometry places a profile point at (r*sin(phi), y, r*cos(phi)), so the
 * cut plane at angle phi is the shape plane rotated about Y by (phi - PI/2).
 */
export function capFromProfile(points: Pt[], phi: number): THREE.BufferGeometry {
  const pts = [...points];
  const first = pts[0];
  const last = pts[pts.length - 1];
  // ShapeGeometry closes the outline itself; a repeated final point upsets it.
  if (Math.abs(first[0] - last[0]) < 1e-6 && Math.abs(first[1] - last[1]) < 1e-6) pts.pop();

  const shape = new THREE.Shape(pts.map(([r, y]) => new THREE.Vector2(r, y)));
  const geom = new THREE.ShapeGeometry(shape);
  geom.rotateY(phi - Math.PI / 2);
  return geom;
}

/**
 * A cut-open lathed part: the swept shell plus a capped face at each end of the
 * sweep, so the section reads as solid material with real thickness.
 */
export function sectionedLathe(
  profile: Pt[],
  material: THREE.Material,
  segments = 64,
  /** Add PI to swing the opening round for a bank mirrored about Y. */
  cutPhase = 0,
): THREE.Group {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(latheFromProfile(profile, segments, true, cutPhase), material));

  // Caps face opposite ways, so one of them is always back-facing.
  const capMaterial = material.clone();
  capMaterial.side = THREE.DoubleSide;
  for (const phi of [CUT_START + cutPhase, CUT_START + cutPhase + CUT_LENGTH]) {
    group.add(new THREE.Mesh(capFromProfile(profile, phi), capMaterial));
  }
  return group;
}

export interface BarrelSpec {
  boreRadius: number;
  wallRadius: number;
  finRadius: number;
  length: number;
  finCount: number;
}

/**
 * Finned air-cooled barrel: an outer profile with teeth, plus a bore wall.
 *
 * Fin tips are deliberately a good fraction of the pitch. Scaled-down cooling
 * fins turn into zero-width blades that vanish edge-on and shimmer when the
 * camera moves.
 */
export function barrelProfile(spec: BarrelSpec): Pt[] {
  const { boreRadius, wallRadius, finRadius, length, finCount } = spec;
  const pts: Pt[] = [[boreRadius, 0]];
  const pitch = length / finCount;
  const finThickness = pitch * 0.52;

  pts.push([wallRadius, 0]);
  for (let i = 0; i < finCount; i++) {
    const base = (i + 0.5) * pitch - finThickness / 2;
    pts.push([wallRadius, base]);
    pts.push([finRadius, base + finThickness * 0.2]);
    pts.push([finRadius, base + finThickness * 0.8]);
    pts.push([wallRadius, base + finThickness]);
  }
  pts.push([wallRadius, length]);
  pts.push([boreRadius, length]);
  pts.push([boreRadius, 0]);
  return pts;
}

/**
 * Closed finned cylinder head: a combustion-chamber roof rather than an open
 * tube, so the chamber is actually sealed at the far end.
 */
export function headProfile(
  chamberRadius: number,
  wallRadius: number,
  finRadius: number,
  length: number,
  finCount: number,
): Pt[] {
  const pts: Pt[] = [[0, 0]];
  pts.push([chamberRadius, 0]);
  pts.push([chamberRadius, 14]);
  pts.push([wallRadius, 17]);
  const finZoneStart = 21;
  const pitch = (length - finZoneStart - 5) / finCount;
  const thickness = pitch * 0.52;
  for (let i = 0; i < finCount; i++) {
    const base = finZoneStart + (i + 0.5) * pitch - thickness / 2;
    pts.push([wallRadius, base]);
    pts.push([finRadius, base + thickness * 0.2]);
    pts.push([finRadius, base + thickness * 0.8]);
    pts.push([wallRadius, base + thickness]);
  }
  pts.push([wallRadius, length]);
  pts.push([0, length]);
  return pts;
}

export interface PistonSpec {
  radius: number;
  crownHeight: number;
  skirtLength: number;
  /** Distance from the crown face down to the wrist pin centre. */
  pinHeight: number;
}

/**
 * Piston profile, authored crown-face-at-y=0 growing in -y (down the bore),
 * then flipped so +y points out of the bore toward the head.
 */
export function pistonGeometry(spec: PistonSpec): THREE.LatheGeometry {
  const { radius, crownHeight, skirtLength } = spec;
  const r = radius;
  const pts: Pt[] = [
    [0, 0],
    [r * 0.72, 0.5],
    [r, 1.5],
    // three ring grooves
    [r, -crownHeight * 0.35],
    [r * 0.93, -crownHeight * 0.4],
    [r, -crownHeight * 0.5],
    [r * 0.93, -crownHeight * 0.55],
    [r, -crownHeight * 0.68],
    [r * 0.93, -crownHeight * 0.73],
    [r, -crownHeight * 0.86],
    [r, -crownHeight - skirtLength],
    [r * 0.86, -crownHeight - skirtLength],
    [r * 0.86, -crownHeight * 0.4],
    [0, -crownHeight * 0.4],
  ];
  return latheFromProfile(pts, 64);
}

/**
 * Outline of a "lollipop": a big circle at the origin joined to a smaller
 * circle `distance` away by their external tangents. Used for both the
 * connecting rod and the crank web, which are the same shape at heart.
 */
function lobeShape(bigR: number, smallR: number, distance: number): THREE.Shape {
  const alpha = Math.acos((bigR - smallR) / distance);
  const shape = new THREE.Shape();
  // Round the far side of the big circle, then let absarc insert the tangent
  // lines automatically as it jumps to the small circle and back.
  shape.absarc(0, 0, bigR, alpha, Math.PI * 2 - alpha, false);
  shape.absarc(distance, 0, smallR, -alpha, alpha, false);
  shape.closePath();
  return shape;
}

/** Connecting rod lying along +X: big end at the origin, small end at `length`. */
export function connectingRod(length: number, bigEndR: number, smallEndR: number): THREE.BufferGeometry {
  const shape = lobeShape(bigEndR, smallEndR, length);
  const beamHalf = smallEndR * 0.62;

  const hole = new THREE.Path();
  hole.absarc(0, 0, bigEndR * 0.66, 0, Math.PI * 2, true);
  const hole2 = new THREE.Path();
  hole2.absarc(length, 0, smallEndR * 0.55, 0, Math.PI * 2, true);
  shape.holes.push(hole, hole2);

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: beamHalf * 2,
    bevelEnabled: true,
    bevelSize: 1.2,
    bevelThickness: 1.2,
    bevelSegments: 2,
    curveSegments: 24,
  });
  geom.translate(0, 0, -beamHalf);
  return geom;
}

/**
 * One crank throw: two webs straddling the crankpin.
 *
 * Each web is a single extruded solid -- counterweight lobe, arm and pin boss
 * in one closed outline. Building it from a half-cylinder plus an overlapping
 * slab, as an earlier version did, put two faces of identical thickness at
 * identical Z and produced a band of z-fighting right across the crank.
 */
export function crankThrow(
  crankRadius: number,
  pinRadius: number,
  webRadius: number,
  webThickness: number,
  pinLength: number,
): THREE.Group {
  const group = new THREE.Group();
  const webZ = pinLength / 2 + webThickness / 2;

  const webGeom = new THREE.ExtrudeGeometry(lobeShape(webRadius, pinRadius * 1.35, crankRadius), {
    depth: webThickness,
    bevelEnabled: true,
    bevelSize: 1.5,
    bevelThickness: 1.5,
    bevelSegments: 2,
    curveSegments: 32,
  });
  webGeom.translate(0, 0, -webThickness / 2);

  for (const sign of [-1, 1]) {
    const web = new THREE.Mesh(webGeom);
    web.position.z = sign * webZ;
    group.add(web);
  }

  // Overhang the webs slightly: ending flush would leave the pin's end cap
  // coplanar with the web face, which z-fights.
  const pinGeom = new THREE.CylinderGeometry(pinRadius, pinRadius, pinLength + webThickness * 2 + 4, 32);
  pinGeom.rotateX(Math.PI / 2);
  const pin = new THREE.Mesh(pinGeom);
  pin.position.x = crankRadius;
  group.add(pin);

  return group;
}
