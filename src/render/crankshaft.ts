import * as THREE from 'three';
import type { EngineMaterials } from './materials';
import { crankThrow } from './parts';
import type { CylinderGeometry } from '../sim/thermo';

/**
 * The crankshaft turns about the world Z axis. Throw 0 serves the right bank
 * and sits at local 0 degrees; throw 1 serves the left bank, 180 degrees round.
 */
export class Crankshaft {
  readonly group = new THREE.Group();

  constructor(g: CylinderGeometry, m: EngineMaterials, pinOffsets: number[]) {
    const journal = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 200, 32), m.steel);
    journal.geometry.rotateX(Math.PI / 2);
    this.group.add(journal);

    pinOffsets.forEach((z, i) => {
      const t = crankThrow(g.crankRadius, 24, 52, 16, 34);
      t.position.z = z;
      t.rotation.z = i * Math.PI;
      t.traverse((o) => {
        if (o instanceof THREE.Mesh) o.material = m.steel;
      });
      this.group.add(t);
    });
  }

  /** `crankAngle` is the right bank's crank angle in degrees, zero at its TDC. */
  update(crankAngleDeg: number): void {
    this.group.rotation.z = crankAngleDeg * (Math.PI / 180);
  }
}
