import * as THREE from 'three';
import type { EngineMaterials } from './materials';

/**
 * A sump below the crank plus two bearing webs, rather than a solid block.
 * The crankshaft has to stay visible -- watching the throw swing is half the
 * lesson -- so the case deliberately does not enclose it.
 */
export function createCrankcase(m: EngineMaterials, pinOffsets: number[]): THREE.Group {
  const group = new THREE.Group();

  const sump = new THREE.Mesh(new THREE.BoxGeometry(140, 34, 172), m.aluminium);
  sump.position.y = -112;
  group.add(sump);

  // Bearing webs straddle the throws and carry the main journals.
  const span = Math.max(...pinOffsets.map(Math.abs)) + 46;
  for (const z of [-span, span]) {
    // Kept deliberately slim: the crank throw must stay in plain view.
    const web = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 12, 32), m.darkAlloy);
    web.geometry.rotateX(Math.PI / 2);
    web.position.z = z;
    group.add(web);
    const post = new THREE.Mesh(new THREE.BoxGeometry(70, 66, 12), m.aluminium);
    post.position.set(0, -48, z);
    group.add(post);
  }

  return group;
}

/** Flange where a barrel bolts onto the case, along the bore axis. */
export function createBarrelSpigot(m: EngineMaterials, baseX: number, radius: number, bankSign: number): THREE.Mesh {
  // Kept small: anything bulky here hides the crank throw behind it.
  // Butts up against the barrel base rather than overlapping it: two nearly
  // concentric cylinders sharing a length of bore is a z-fighting generator.
  const spigot = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.12, 26, 40), m.aluminium);
  spigot.geometry.rotateZ(Math.PI / 2);
  spigot.position.x = bankSign * (baseX - 13);
  return spigot;
}
