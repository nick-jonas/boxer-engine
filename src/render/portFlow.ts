import * as THREE from 'three';

/** Soft round sprite; the default square points read as pixel artifacts. */
let dotTexture: THREE.Texture | null = null;
function particleTexture(): THREE.Texture {
  if (dotTexture) return dotTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  dotTexture = new THREE.CanvasTexture(canvas);
  return dotTexture;
}

/**
 * A stream of particles running along a port, used to make gas movement
 * visible. Intensity is driven by valve lift, so the flow swells as the valve
 * opens and dies as it seats -- the point being that an engine spends most of
 * its cycle NOT breathing through any given port.
 */
export class PortFlow {
  readonly points: THREE.Points;

  private readonly from: THREE.Vector3;
  private readonly to: THREE.Vector3;
  private readonly jitter: Float32Array;
  private readonly count: number;
  private phase = 0;

  /**
   * `size` is in *world* units, not millimetres. PointsMaterial feeds
   * gl_PointSize directly and ignores the object's scale, so a value sized to
   * this file's millimetre coordinates renders as a screen-filling quad.
   */
  constructor(from: THREE.Vector3, to: THREE.Vector3, color: number, radius: number, size = 0.12, count = 16) {
    this.from = from.clone();
    this.to = to.clone();
    this.count = count;

    this.jitter = new Float32Array(count * 2);
    for (let i = 0; i < count * 2; i++) this.jitter[i] = (Math.random() * 2 - 1) * radius * 0.62;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));

    this.points = new THREE.Points(
      geom,
      new THREE.PointsMaterial({
        color,
        size,
        map: particleTexture(),
        sizeAttenuation: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
  }

  /**
   * Recolour the stream, e.g. to show smoke of a diagnostic colour.
   *
   * `smoke` switches to normal blending: additive blending makes dark smoke
   * literally invisible, since adding black adds nothing.
   */
  setColor(hex: number, size?: number, smoke = false): void {
    const mat = this.points.material as THREE.PointsMaterial;
    mat.color.set(hex);
    if (size !== undefined) mat.size = size;
    const blending = smoke ? THREE.NormalBlending : THREE.AdditiveBlending;
    if (mat.blending !== blending) {
      mat.blending = blending;
      mat.needsUpdate = true;
    }
  }

  /**
   * `intensity` is 0..1. `speed` scales how fast the stream runs, so the flow
   * visibly quickens with engine speed.
   */
  update(dt: number, intensity: number, speed: number): void {
    const mat = this.points.material as THREE.PointsMaterial;
    mat.opacity = Math.min(0.85, intensity * 0.95);
    if (intensity <= 0.002) return;

    this.phase = (this.phase + dt * speed * (0.4 + intensity)) % 1;

    const pos = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const dir = this.to.clone().sub(this.from);
    // Two arbitrary axes across the port, for a bit of spread.
    const up = Math.abs(dir.y) > Math.abs(dir.z) ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    const other = new THREE.Vector3().crossVectors(dir, side).normalize();

    for (let i = 0; i < this.count; i++) {
      const t = (i / this.count + this.phase) % 1;
      pos.setXYZ(
        i,
        this.from.x + dir.x * t + side.x * this.jitter[i * 2] + other.x * this.jitter[i * 2 + 1],
        this.from.y + dir.y * t + side.y * this.jitter[i * 2] + other.y * this.jitter[i * 2 + 1],
        this.from.z + dir.z * t + side.z * this.jitter[i * 2] + other.z * this.jitter[i * 2 + 1],
      );
    }
    pos.needsUpdate = true;
  }
}

/** A straight port tube running between two points. */
export function portTube(from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
  const dir = to.clone().sub(from);
  const geom = new THREE.CylinderGeometry(radius, radius * 1.08, dir.length(), 24, 1, true);
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.copy(from).add(dir.clone().multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return mesh;
}
