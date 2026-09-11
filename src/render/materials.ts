import * as THREE from 'three';

/**
 * One place for every material, so the cutaway work in a later phase can
 * attach clipping planes to exactly the parts that should be sliced open.
 */
export interface EngineMaterials {
  aluminium: THREE.MeshStandardMaterial;
  darkAlloy: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  pistonAlloy: THREE.MeshStandardMaterial;
  /** Barrel wall: translucent for now; phase 5 replaces this with a real cutaway. */
  barrel: THREE.MeshPhysicalMaterial;
  gas: THREE.MeshBasicMaterial;
  /** Port walls: seen from inside as well as out. */
  port: THREE.MeshStandardMaterial;
  /** Rocker cover: translucent so the valve gear underneath stays readable. */
  cover: THREE.MeshPhysicalMaterial;
}

export function createMaterials(): EngineMaterials {
  return {
    aluminium: new THREE.MeshStandardMaterial({ color: 0x70767e, metalness: 0.18, roughness: 0.74 }),
    darkAlloy: new THREE.MeshStandardMaterial({ color: 0x3c4148, metalness: 0.22, roughness: 0.7 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xb0b8c2, metalness: 0.9, roughness: 0.28 }),
    pistonAlloy: new THREE.MeshStandardMaterial({ color: 0xc7a877, metalness: 0.45, roughness: 0.4 }),
    // Opaque: the barrel is sectioned geometrically rather than faded out,
    // which reads far better than stacked translucent fins.
    barrel: new THREE.MeshPhysicalMaterial({
      color: 0x666c74,
      metalness: 0.16,
      roughness: 0.76,
      side: THREE.DoubleSide,
    }),
    // Translucent on purpose: an opaque port would hide the very flow it is
    // there to explain.
    port: new THREE.MeshStandardMaterial({
      color: 0x545b64,
      metalness: 0.2,
      roughness: 0.8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }),
    // depthWrite stays ON: this shape is convex enough that writing depth
    // sorts it cleanly, whereas disabling it lets the back faces and the head
    // fins behind bleed through into a muddle.
    cover: new THREE.MeshPhysicalMaterial({
      color: 0x3f454d,
      metalness: 0.35,
      roughness: 0.45,
      transparent: true,
      opacity: 0.42,
      side: THREE.FrontSide,
    }),
    gas: new THREE.MeshBasicMaterial({
      color: 0x5fa8ff,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  };
}
