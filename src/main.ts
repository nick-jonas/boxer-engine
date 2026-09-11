import * as THREE from 'three';
import { BOXER_TWIN, EngineSim } from './sim/engine';
import { createStage } from './render/scene';
import { createMaterials } from './render/materials';
import { CylinderAssembly } from './render/cylinderAssembly';
import { Crankshaft } from './render/crankshaft';
import { Camshaft } from './render/valvetrain';
import { createBarrelSpigot, createCrankcase } from './render/crankcase';
import { Highlighter } from './render/highlight';
import { Hud } from './ui/hud';
import { Director } from './game/director';
import { Quiz } from './game/quiz';
import { AskPanel } from './game/ask';
import { Tutor } from './game/tutor';

/** Crankpin positions along the crank axis, in world millimetres. */
const PIN_Z = { right: 30, left: -30 };

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const stage = createStage(canvas);
const materials = createMaterials();
const sim = new EngineSim({ cylinders: BOXER_TWIN });
const highlighter = new Highlighter();

const crank = new Crankshaft(sim.geometry, materials, [PIN_Z.right, PIN_Z.left]);
// Airhead-style: the camshaft lives in the case below the crank and turns at
// half its speed. The pushrods are drawn from the case out to the rockers; the
// lifters bridging cam to pushrod are implied rather than modelled.
const cam = new Camshaft(materials, [-58, -26, 26, 58]);
cam.group.position.y = -78;

const assemblies = new Map<string, CylinderAssembly>();
for (const config of sim.cylinders) {
  const mirrored = config.bankSign === -1;
  const worldPinZ = mirrored ? PIN_Z.left : PIN_Z.right;
  const assembly = new CylinderAssembly({
    geometry: sim.geometry,
    materials,
    rodSign: mirrored ? -1 : 1,
    // The mirrored bank is rotated 180 degrees about Y, which negates Z, so its
    // local crankpin offset is the negative of the world position.
    pinOffsetZ: mirrored ? -worldPinZ : worldPinZ,
    mirrored,
  });
  if (mirrored) assembly.group.rotation.y = Math.PI;
  assemblies.set(config.name, assembly);
  stage.root.add(assembly.group);

  for (const [part, object] of Object.entries(assembly.parts)) {
    highlighter.register(part, object);
    highlighter.register(`${part}.${config.name}`, object);
    tagForPicking(object, part, config.name);
  }
}

const crankcase = createCrankcase(materials, [PIN_Z.right, PIN_Z.left]);
for (const sign of [1, -1] as const) {
  crankcase.add(createBarrelSpigot(materials, 98, sim.geometry.bore * 0.55, sign));
}

stage.root.add(crankcase, crank.group, cam.group);
highlighter.register('camshaft', cam.group);
tagForPicking(cam.group, 'camshaft', 'engine');
highlighter.register('crankshaft', crank.group);
highlighter.register('crankcase', crankcase);
tagForPicking(crank.group, 'crankshaft', 'engine');
tagForPicking(crankcase, 'crankcase', 'engine');

stage.controls.target.set(0, -0.2, 0);
stage.camera.position.set(2.4, 2.2, 8.8);
stage.controls.autoRotateSpeed = 0.9;

function tagForPicking(root: THREE.Object3D, part: string, cylinder: string): void {
  root.traverse((o) => {
    o.userData.partId = part;
    o.userData.cylinder = cylinder;
  });
}

const hud = new Hud();
const director = new Director(stage, sim, highlighter);
const quiz = new Quiz(director);
const ask = new AskPanel(stage, sim, highlighter);
// The tutor stays quiet during the quiz and while the ask popover is open, so
// only one thing is ever talking to the user at a time.
const tutor = new Tutor(stage, sim, () => quiz.isActive || !ask.root.hidden);
document.body.append(quiz.root, ask.root, tutor.root);

// --- Controls -------------------------------------------------------------
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const rpmInput = el<HTMLInputElement>('c-rpm');
const slowInput = el<HTMLInputElement>('c-slow');
const scrubInput = el<HTMLInputElement>('c-scrub');
const playBtn = el<HTMLButtonElement>('c-play');
const stepBtn = el<HTMLButtonElement>('c-step');
const quizBtn = el<HTMLButtonElement>('c-quiz');
const tutorBtn = el<HTMLButtonElement>('c-tutor');

director.playbackDivisor = Number(slowInput.value);

rpmInput.addEventListener('input', () => {
  sim.rpm = Number(rpmInput.value);
});
slowInput.addEventListener('input', () => {
  director.playbackDivisor = Number(slowInput.value);
});
scrubInput.addEventListener('input', () => {
  if (!sim.running) sim.seek(Number(scrubInput.value));
});
playBtn.addEventListener('click', () => {
  sim.running = !sim.running;
  scrubInput.disabled = sim.running;
});
stepBtn.addEventListener('click', () => {
  sim.running = false;
  scrubInput.disabled = false;
  sim.seek(sim.cycleAngle + 1);
});
quizBtn.addEventListener('click', () => {
  if (quiz.isActive) {
    quiz.stop();
    quizBtn.textContent = 'Start quiz';
  } else {
    quiz.start();
    quizBtn.textContent = 'Exit quiz';
  }
});

tutorBtn.addEventListener('click', () => {
  tutor.setEnabled(!tutor.enabled);
  tutorBtn.textContent = tutor.enabled ? 'Tutor: on' : 'Tutor: off';
  tutorBtn.dataset.on = String(tutor.enabled);
});
tutorBtn.dataset.on = 'true';

sim.rpm = Number(rpmInput.value);

// --- Frame loop -----------------------------------------------------------
const clock = new THREE.Clock();

function frame(): void {
  requestAnimationFrame(frame);
  // Clamp dt so an alt-tab does not teleport the crank halfway round a cycle.
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.getElapsedTime();

  sim.advance(dt, director.playbackDivisor);
  director.update(dt, elapsed);

  const master = sim.stateOf(sim.cylinders[0]);
  crank.update(master.crankAngle);
  // Half crank speed, over the full 720-degree cycle.
  cam.update(master.cycleAngle);
  for (const config of sim.cylinders) {
    assemblies.get(config.name)!.update(sim.stateOf(config), dt, sim.rpm);
  }

  hud.update(sim, sim.stateOf(sim.cylinders[0]));
  ask.updateStateLine();
  tutor.update();
  playBtn.textContent = sim.running ? 'Pause' : 'Play';
  if (sim.running) scrubInput.value = String(Math.round(sim.cycleAngle));
  rpmInput.value = String(sim.rpm);
  slowInput.value = String(director.playbackDivisor);

  stage.controls.update();
  stage.renderer.render(stage.scene, stage.camera);
}
frame();

if (import.meta.env.DEV) {
  Object.assign(window as unknown as Record<string, unknown>, {
    __engine: { sim, assemblies, crank, stage, director, quiz, highlighter, ask, tutor },
  });
}
