import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Scene units are decimetres: the sim works in mm, so everything renders at 1/100. */
export const MM = 0.01;

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** Parent for engine parts; already scaled from millimetres. */
  root: THREE.Group;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  // Needed before any material can carry a clipping plane (phase 5 cutaway).
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x171b21);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  // RoomEnvironment is a bright white box; at full strength every metal part
  // mirrors it and the whole engine goes chalky.
  scene.environmentIntensity = 0.25;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.4, 60);
  camera.position.set(1.5, 2.1, 6.2);

  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(4, 6, 5);
  const fill = new THREE.DirectionalLight(0x8fb0d8, 0.35);
  fill.position.set(-5, 2, -4);
  const rim = new THREE.DirectionalLight(0xffd9b0, 0.35);
  rim.position.set(-2, -3, -6);
  scene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 0.12));

  const grid = new THREE.GridHelper(12, 24, 0x2a3038, 0x1d2228);
  grid.position.y = -1.6;
  scene.add(grid);

  const root = new THREE.Group();
  root.scale.setScalar(MM);
  scene.add(root);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);
  controls.minDistance = 0.9;
  controls.maxDistance = 30;

  const resize = () => {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera, controls, root };
}
