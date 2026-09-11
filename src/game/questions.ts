/**
 * The question bank.
 *
 * Every question carries a `scene` directive describing how the 3D view should
 * present itself while the question is on screen -- where the camera goes, what
 * to highlight, how fast to run, and for diagnostics questions, which fault to
 * actually inject into the simulation. The point is that the answer is
 * observable in the model, not just assertable from memory.
 */

export type QuestionType = 'anatomy' | 'diagnostics' | 'general';

export type CameraPreset = 'wide' | 'front' | 'crank' | 'leftHead' | 'rightHead' | 'chamber';

export interface SceneDirective {
  camera?: CameraPreset;
  autoRotate?: boolean;
  /** Highlighter ids to light up. */
  highlight?: string[];
  rpm?: number;
  /** Animation slowdown divisor; higher is slower. */
  playback?: number;
  running?: boolean;
  /** Freeze at a specific cycle angle (implies running: false). */
  cycleAngle?: number;
  /** Inject a fault on one cylinder, by key into FAULTS. */
  fault?: { cylinder: string; key: string };
}

export interface Question {
  id: string;
  level: number;
  type: QuestionType;
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
  scene?: SceneDirective;
  /** Shown once the answer is revealed, to point at what to look at. */
  revealScene?: SceneDirective;
}

export interface Level {
  level: number;
  title: string;
  focus: string;
}

export const LEVELS: Level[] = [
  { level: 1, title: 'The Boxer Identity', focus: 'What makes this engine unlike an inline or V-twin.' },
  { level: 2, title: 'The Four-Stroke Cycle', focus: 'The basic physics of internal combustion.' },
  { level: 3, title: 'Component Anatomy', focus: 'Connecting the parts to what they do.' },
  { level: 4, title: 'Diagnostics', focus: 'Real-world troubleshooting. The boss fight.' },
];

export const QUESTIONS: Question[] = [
  // ---------------- Level 1: identity ----------------
  {
    id: 'l1-why-boxer',
    level: 1,
    type: 'general',
    prompt: 'Why is this engine design called a "Boxer"?',
    options: [
      'It vibrates aggressively like a boxer jumping in the ring.',
      'The pistons are horizontal and punch outward at the same time, like gloves.',
      'The engine block is shaped like a perfect square box.',
      'It was invented by a mechanic named John Boxer.',
    ],
    correct: 1,
    explanation:
      'The opposed pistons move out and in together, so their primary shaking forces cancel. Watch the two pistons in the model: they punch outward at the same instant, like a boxer throwing two gloves.',
    scene: { camera: 'front', running: true, rpm: 900, playback: 26, autoRotate: false },
    revealScene: { camera: 'front', highlight: ['piston'], running: true, playback: 34 },
  },
  {
    id: 'l1-head-location',
    level: 1,
    type: 'general',
    prompt: 'Where are the cylinder heads on a traditional boxer motorcycle, like a BMW R-series?',
    options: [
      'Tucked under the gas tank.',
      'Sticking out horizontally on the left and right sides of the bike.',
      'Stacked vertically behind the front wheel.',
    ],
    correct: 1,
    explanation:
      'They stick straight out into the airflow, which is how an air-cooled boxer stays cool. Wonderful for maintenance access, alarming in a tip-over.',
    scene: { camera: 'wide', autoRotate: true, running: true, playback: 30 },
    revealScene: { camera: 'wide', highlight: ['head'], autoRotate: true },
  },
  {
    id: 'l1-balance',
    level: 1,
    type: 'general',
    prompt: 'Both pistons reach top-dead-centre at the same moment. So how does the engine fire evenly?',
    options: [
      'Both cylinders fire together, then coast for a full revolution.',
      'One cylinder is on compression while the other is on exhaust, so they fire alternately, 360° apart.',
      'The cylinders fire at random to smooth out the power.',
    ],
    correct: 1,
    explanation:
      'The pistons move together, but the cylinders are 360° apart in the four-stroke cycle. As one compresses, the other pushes out exhaust. Firing alternates once per crank revolution.',
    scene: { camera: 'wide', running: true, playback: 30 },
    revealScene: { camera: 'wide', running: true, playback: 40, highlight: ['piston'] },
  },

  // ---------------- Level 2: the cycle ----------------
  {
    id: 'l2-suck-squeeze',
    level: 2,
    type: 'anatomy',
    prompt: 'Mechanics say "Suck, Squeeze, Bang, Blow." Match those to the four strokes, in order.',
    options: [
      'Exhaust, Power, Compression, Intake',
      'Intake, Compression, Power, Exhaust',
      'Power, Exhaust, Intake, Compression',
    ],
    correct: 1,
    explanation:
      'Air and fuel enter (Intake), get crushed (Compression), ignite (Power), and leave (Exhaust). The stroke readout in the corner names the current one as the engine turns.',
    scene: { camera: 'rightHead', running: true, rpm: 700, playback: 45 },
  },
  {
    id: 'l2-spark-plug',
    level: 2,
    type: 'anatomy',
    prompt: 'What component actually creates the spark that ignites the compressed fuel and air?',
    options: ['The fuel injector', 'The alternator', 'The spark plug', 'The valve spring'],
    correct: 2,
    explanation:
      'The spark plug delivers the high-voltage zap for the "Bang". It fires slightly BEFORE top-dead-centre, because the flame needs time to spread across the chamber.',
    scene: { camera: 'chamber', cycleAngle: 694, highlight: [] },
    revealScene: { camera: 'chamber', cycleAngle: 694, highlight: ['sparkPlug'] },
  },
  {
    id: 'l2-why-advance',
    level: 2,
    type: 'general',
    prompt: 'The spark fires about 28° BEFORE the piston reaches the top. Why not exactly at the top?',
    options: [
      'To give the flame time to spread, so peak pressure lands just after top-dead-centre.',
      'To cool the cylinder down before combustion.',
      'Because the spark plug can only fire while the piston is moving up.',
    ],
    correct: 0,
    explanation:
      'Burning is not instant. Light it at the top and peak pressure arrives too late to push properly. Light it far too early and the rising piston fights its own explosion.',
    scene: { camera: 'chamber', running: true, rpm: 900, playback: 55 },
  },
  {
    id: 'l2-compression',
    level: 2,
    type: 'anatomy',
    prompt: 'During the compression stroke, both valves are shut and the piston rises. What happens to the gas?',
    options: [
      'Its pressure and temperature both climb steeply.',
      'Its pressure climbs but its temperature stays constant.',
      'Nothing much until the spark fires.',
    ],
    correct: 0,
    explanation:
      'Squeezing a gas heats it. In this model the charge goes from roughly 0.5 bar to well over 10 bar, and hundreds of degrees hotter, before the plug ever fires.',
    scene: { camera: 'chamber', running: true, rpm: 600, playback: 50 },
  },

  // ---------------- Level 3: anatomy ----------------
  {
    id: 'l3-crankshaft',
    level: 3,
    type: 'anatomy',
    prompt:
      'The pistons push back and forth. What part turns that back-and-forth motion into spinning motion to drive the wheel?',
    options: ['The camshaft', 'The crankshaft', 'The throttle body'],
    correct: 1,
    explanation:
      'The crankshaft is the pedals on a bicycle: straight-line pushes become rotation. The connecting rod is your shin, swinging as it follows the pedal round.',
    scene: { camera: 'crank', running: true, rpm: 700, playback: 40 },
    revealScene: { camera: 'crank', highlight: ['crankshaft'], running: true, playback: 45 },
  },
  {
    id: 'l3-valves',
    level: 3,
    type: 'anatomy',
    prompt: 'What opens and closes to let air in and exhaust out of the cylinder?',
    options: ['Piston rings', 'Valves', 'The head gasket'],
    correct: 1,
    explanation:
      'Valves are precise doors, opening and closing thousands of times a minute. In this model the intake and exhaust ports show flowing gas exactly while their valve is off its seat.',
    scene: { camera: 'rightHead', running: true, rpm: 700, playback: 45 },
    revealScene: { camera: 'rightHead', highlight: ['intakePort', 'exhaustPort'], running: true, playback: 45 },
  },
  {
    id: 'l3-conrod',
    level: 3,
    type: 'anatomy',
    prompt: 'The connecting rod links the piston to the crankshaft. Why does it lean over as the crank turns?',
    options: [
      'Because it is bolted rigidly to the piston and flexes.',
      'Because its big end follows a circle while its small end can only move in a straight line.',
      'Because of centrifugal force throwing it outward.',
    ],
    correct: 1,
    explanation:
      'That lean is why the piston does not move as a simple sine wave: it travels faster near the top of the bore than near the bottom.',
    scene: { camera: 'crank', running: true, rpm: 500, playback: 50 },
    revealScene: { camera: 'crank', highlight: ['rod'], running: true, playback: 50 },
  },
  {
    id: 'l3-piston-rings',
    level: 3,
    type: 'anatomy',
    prompt: 'What are the grooves cut around the top of the piston for?',
    options: [
      'Piston rings, which seal combustion pressure against the bore and control oil.',
      'To make the piston lighter.',
      'To let fuel pool before it burns.',
    ],
    correct: 0,
    explanation:
      'Rings seal the gap between piston and bore. When they wear out, oil sneaks into the chamber and burns -- which is the blue smoke question waiting for you in Level 4.',
    scene: { camera: 'chamber', cycleAngle: 540, highlight: [] },
    revealScene: { camera: 'chamber', cycleAngle: 540, highlight: ['piston.right'] },
  },

  // ---------------- Level 4: diagnostics ----------------
  {
    id: 'l4-cold-pipe',
    level: 4,
    type: 'diagnostics',
    prompt:
      'You start the engine. The left exhaust pipe is burning hot, but the right one stays stone cold. What is most likely wrong?',
    options: [
      'The engine has no oil.',
      'The right cylinder has a dead spark plug or bad ignition coil, so it is not firing.',
      'The clutch is slipping.',
    ],
    correct: 1,
    explanation:
      'A cold pipe means no combustion in that cylinder. The right cylinder is genuinely misfiring in the model right now: it still pumps air, but no spark, no burn, no heat, no torque.',
    scene: {
      camera: 'wide',
      running: true,
      rpm: 800,
      playback: 30,
      fault: { cylinder: 'right', key: 'deadPlug' },
    },
    revealScene: {
      camera: 'wide',
      running: true,
      playback: 34,
      highlight: ['sparkPlug.right'],
      fault: { cylinder: 'right', key: 'deadPlug' },
    },
  },
  {
    id: 'l4-ticking',
    level: 4,
    type: 'diagnostics',
    prompt:
      'You hear a loud, rhythmic ticking from the cylinder heads sticking out of the sides of the bike. What likely needs adjusting?',
    options: ['The drive chain is loose.', 'The valve clearances are too wide.', 'The tyre pressure is low.'],
    correct: 1,
    explanation:
      'When the gap in the valve train grows too large the parts slap together instead of taking up smoothly, making a tick that speeds up with engine speed. Watch the right head: the rocker now sweeps through a visible gap before the valve moves at all, and the valve never reaches full lift.',
    scene: {
      camera: 'rightHead',
      running: true,
      rpm: 1100,
      playback: 26,
      fault: { cylinder: 'right', key: 'wideValveClearance' },
    },
    revealScene: {
      camera: 'rightHead',
      highlight: ['head.right'],
      running: true,
      playback: 30,
      fault: { cylinder: 'right', key: 'wideValveClearance' },
    },
  },
  {
    id: 'l4-blue-smoke',
    level: 4,
    type: 'diagnostics',
    prompt: 'You rev the engine and thick, blue-tinted smoke pours out of the exhaust. What does blue smoke mean?',
    options: [
      'The engine is burning oil.',
      'The engine is running too rich, with too much fuel.',
      "It's perfectly normal on a cold morning.",
    ],
    correct: 0,
    explanation:
      'Blue means engine oil is sneaking past the piston rings or valve seals and burning in the chamber. Black smoke means too much fuel; white usually means coolant.',
    scene: {
      camera: 'rightHead',
      running: true,
      rpm: 1600,
      playback: 26,
      fault: { cylinder: 'right', key: 'burningOil' },
    },
    revealScene: {
      camera: 'rightHead',
      running: true,
      playback: 30,
      highlight: ['piston.right'],
      fault: { cylinder: 'right', key: 'burningOil' },
    },
  },
  {
    id: 'l4-black-smoke',
    level: 4,
    type: 'diagnostics',
    prompt: 'Different bike, different day: the exhaust is pumping out sooty BLACK smoke. What is going on?',
    options: [
      'Oil is getting past the rings.',
      'Too much fuel for the available air, so it cannot all burn.',
      'Coolant is leaking into the cylinder.',
    ],
    correct: 1,
    explanation:
      'Black is unburnt fuel: a rich mixture, often a blocked air filter, a stuck choke, or carburettor float trouble. Blue is oil, white is coolant.',
    scene: {
      camera: 'rightHead',
      running: true,
      rpm: 1400,
      playback: 26,
      fault: { cylinder: 'right', key: 'richMixture' },
    },
  },
  {
    id: 'l4-no-compression',
    level: 4,
    type: 'diagnostics',
    prompt:
      'One cylinder has almost no compression. The valves are correctly adjusted and the plug is fine. What is the likely cause?',
    options: [
      'The exhaust is too quiet.',
      'Worn rings or a burnt valve, letting pressure escape instead of being squeezed.',
      'The spark is arriving too late.',
    ],
    correct: 1,
    explanation:
      'Compression needs a sealed box. If rings are worn or a valve is not seating, the charge leaks away on the way up and there is nothing worth igniting.',
    scene: { camera: 'chamber', running: true, rpm: 700, playback: 45 },
  },
];

export function questionsForLevel(level: number): Question[] {
  return QUESTIONS.filter((q) => q.level === level);
}

export const MAX_LEVEL = LEVELS.length;
