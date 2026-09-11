import * as THREE from 'three';

/**
 * Pulsing emissive highlight for named engine parts.
 *
 * Materials are shared between parts, so highlighting works on a per-mesh
 * clone cached in `userData`. Mutating the shared material directly would light
 * up every part that happens to be made of the same alloy.
 */
export class Highlighter {
  private readonly registry = new Map<string, THREE.Object3D[]>();
  private active: THREE.Mesh[] = [];
  private color = new THREE.Color(0xff9d42);

  register(id: string, object: THREE.Object3D): void {
    const list = this.registry.get(id);
    if (list) list.push(object);
    else this.registry.set(id, [object]);
  }

  has(id: string): boolean {
    return this.registry.has(id);
  }

  /** Highlight exactly these ids, clearing anything previously lit. */
  set(ids: string[], color = 0xff9d42): void {
    this.clear();
    this.color.set(color);
    for (const id of ids) {
      for (const root of this.registry.get(id) ?? []) {
        root.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const base = o.material as THREE.Material;
          if (!('emissive' in base)) return; // MeshBasicMaterial etc.

          let lit = o.userData.highlightMaterial as THREE.Material | undefined;
          if (!lit) {
            lit = base.clone();
            o.userData.baseMaterial = base;
            o.userData.highlightMaterial = lit;
          }
          (lit as THREE.MeshStandardMaterial).emissive.copy(this.color);
          o.material = lit;
          this.active.push(o);
        });
      }
    }
  }

  clear(): void {
    for (const mesh of this.active) {
      const base = mesh.userData.baseMaterial as THREE.Material | undefined;
      if (base) mesh.material = base;
    }
    this.active.length = 0;
  }

  /** Breathe the highlight so it reads as an annotation, not a paint job. */
  update(elapsed: number): void {
    const intensity = 0.45 + 0.25 * Math.sin(elapsed * 5);
    for (const mesh of this.active) {
      (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
    }
  }
}
