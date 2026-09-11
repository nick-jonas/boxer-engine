import type { CylinderState } from '../sim/engine';

/**
 * Offline knowledge about each part, so click-to-ask works with no API key.
 * It answers the common intents well and is honest when a question falls
 * outside what it knows, rather than inventing an answer.
 */

export interface PartFacts {
  name: string;
  summary: string;
  /** Intent keyword sets mapped to answers. */
  faq: { match: string[]; answer: string }[];
}

export const PART_FACTS: Record<string, PartFacts> = {
  piston: {
    name: 'Piston',
    summary:
      'The piston seals the bottom of the combustion chamber and turns gas pressure into a push. It slides up and down the bore, and the grooves near its crown carry the rings that seal against the cylinder wall.',
    faq: [
      {
        match: ['ring', 'groove', 'seal', 'oil'],
        answer:
          'The grooves hold piston rings. The top two seal combustion pressure against the bore; the bottom one scrapes oil back down. Worn rings let oil into the chamber, which burns and produces blue exhaust smoke.',
      },
      {
        match: ['speed', 'fast', 'slow', 'sine', 'motion', 'accelerat'],
        answer:
          'It does not move as a simple sine wave. Because the connecting rod has finite length, the piston covers more than half its stroke in the first 90° of crank rotation — it moves faster near the top of the bore than near the bottom.',
      },
      {
        match: ['material', 'made', 'aluminium', 'aluminum'],
        answer:
          'Pistons are usually cast or forged aluminium alloy: light enough to stop and reverse thousands of times a minute, and good at conducting heat away from the crown.',
      },
      {
        match: ['hot', 'temperature', 'heat'],
        answer:
          'The crown sits directly under combustion and runs at several hundred degrees. Most of that heat escapes sideways through the rings into the cylinder wall, which is why the barrel is finned.',
      },
    ],
  },
  rod: {
    name: 'Connecting rod',
    summary:
      'The connecting rod links the piston to the crankshaft. Its big end rides the crankpin in a circle while its small end is constrained to the bore axis, so the rod swings as it converts straight-line push into rotation.',
    faq: [
      {
        match: ['lean', 'angle', 'tilt', 'swing', 'side'],
        answer:
          'It leans because its two ends do different things: the big end follows a circle, the small end can only travel up and down the bore. That lean also pushes the piston sideways against the cylinder wall — thrust load.',
      },
      {
        match: ['length', 'ratio', 'long', 'short'],
        answer:
          'Rod-to-crank ratio matters. This engine uses a 125 mm rod on a 35.3 mm crank throw, about 3.5:1. A longer rod leans less and gives gentler side loading; a shorter one makes the motion more asymmetric.',
      },
      {
        match: ['break', 'fail', 'bend', 'throw'],
        answer:
          'Rods fail in tension at high rpm, when they have to stop the piston at the top of the stroke, or from bearing failure at the big end. A thrown rod usually exits through the crankcase.',
      },
    ],
  },
  crankshaft: {
    name: 'Crankshaft',
    summary:
      'The crankshaft converts the pistons’ back-and-forth motion into rotation. Its offset crankpins are what give the engine its stroke, and the counterweights balance the reciprocating mass.',
    faq: [
      {
        match: ['stroke', 'throw', 'radius'],
        answer:
          'Stroke is exactly twice the crank throw. This crank has a 35.3 mm throw, so the piston travels 70.6 mm from top to bottom.',
      },
      {
        match: ['counterweight', 'balance', 'vibrat', 'smooth'],
        answer:
          'The lobes opposite each crankpin are counterweights, offsetting the rotating mass. In a boxer the two pistons oppose each other directly, which cancels most of the primary shaking force before the counterweights do anything.',
      },
      {
        match: ['180', 'offset', 'pin', 'apart', 'boxer'],
        answer:
          'The two crankpins sit 180° apart, and the cylinders point in opposite directions. Those two facts cancel out: both pistons reach top-dead-centre at the same instant, moving away from each other.',
      },
      {
        match: ['camshaft', 'cam', 'half', 'speed'],
        answer:
          'The camshaft is geared to run at exactly half crank speed. That is the whole reason a four-stroke cycle takes 720° of crankshaft rotation but only one turn of the cam.',
      },
    ],
  },
  barrel: {
    name: 'Cylinder barrel',
    summary:
      'The barrel is the bore the piston runs in. On an air-cooled boxer it is covered in fins, and it is cut open in this model so you can see the piston inside.',
    faq: [
      {
        match: ['fin', 'cool', 'air', 'hot'],
        answer:
          'The fins are the cooling system. With no water jacket, the only way heat leaves is through that finned surface into passing air — which is exactly why the cylinders stick out into the wind.',
      },
      {
        match: ['bore', 'size', 'diameter', 'displacement', 'cc'],
        answer:
          'This bore is 94 mm across with a 70.6 mm stroke, giving about 490 cc per cylinder and roughly 980 cc for the pair — an R100-sized airhead.',
      },
      {
        match: ['wear', 'scor', 'hone', 'rebore'],
        answer:
          'Bores wear oval and tapered over time, worst at the top where the rings reverse direction and lubrication is thinnest. The fix is boring oversize and fitting larger pistons.',
      },
    ],
  },
  head: {
    name: 'Cylinder head',
    summary:
      'The head caps the cylinder, forms the roof of the combustion chamber, and carries the valves, ports and spark plug. On a boxer it sticks straight out into the airflow.',
    faq: [
      {
        match: ['compression', 'ratio', 'chamber', 'volume'],
        answer:
          'The chamber volume left at top-dead-centre sets the compression ratio. Here about 65 cc of clearance against 490 cc swept gives 8.5:1.',
      },
      {
        match: ['gasket', 'leak', 'blow'],
        answer:
          'The head gasket seals the joint between head and barrel against combustion pressure. When it fails you lose compression and often get exhaust gases where they should not be.',
      },
      {
        match: ['tick', 'clearance', 'adjust', 'noise', 'rattle', 'tappet'],
        answer:
          'The ticking from an airhead head is usually valve clearance. The gap has to exist so valves can close fully when hot, but too much gap and the parts slap instead of taking up smoothly.',
      },
      {
        match: ['access', 'maintenance', 'crash', 'stick'],
        answer:
          'Heads hanging out in the breeze are wonderfully easy to service by the roadside — and the first thing to touch down in a tip-over.',
      },
    ],
  },
  sparkPlug: {
    name: 'Spark plug',
    summary:
      'The spark plug jumps a high-voltage arc across its electrode gap to ignite the compressed charge. It fires shortly before top-dead-centre so the flame has time to spread.',
    faq: [
      {
        match: ['advance', 'timing', 'before', 'early', 'btdc', 'when'],
        answer:
          'It fires around 28° before top-dead-centre here. Burning takes real time, so lighting it early means peak pressure arrives just after the piston starts down, where it does the most good.',
      },
      {
        match: ['knock', 'detonat', 'ping', 'too early', 'advanced'],
        answer:
          'Advance it too far and peak pressure builds while the piston is still rising, so the engine fights itself and can knock. Retard it too far and the burn is still going as the exhaust valve opens, wasting energy.',
      },
      {
        match: ['dead', 'fail', 'misfire', 'foul', 'cold'],
        answer:
          'A dead plug or coil means that cylinder never burns. It still pumps air, so the engine runs — roughly — but that exhaust pipe stays cold while the other gets hot. That is the classic twin-cylinder misfire test.',
      },
      {
        match: ['voltage', 'coil', 'spark', 'volt'],
        answer:
          'The coil steps battery voltage up to tens of thousands of volts — enough to arc across the gap against the resistance of a chamber full of compressed gas.',
      },
    ],
  },
  intakePort: {
    name: 'Intake port',
    summary:
      'The intake port carries the fresh air and fuel charge into the cylinder while the intake valve is open. Flow only appears in this model when that valve is off its seat.',
    faq: [
      {
        match: ['throttle', 'vacuum', 'pressure', 'closed'],
        answer:
          'At part throttle the manifold sits well below atmospheric pressure, so the cylinder fills only partly. That is why closing the throttle reduces power — it starves the engine of air, not just fuel.',
      },
      {
        match: ['open', 'close', 'timing', 'when', 'valve'],
        answer:
          'The intake valve opens about 10° before top-dead-centre and closes about 50° after bottom-dead-centre. Closing late lets the incoming charge’s momentum keep packing the cylinder.',
      },
      {
        match: ['overlap', 'both', 'exhaust'],
        answer:
          'Around top-dead-centre both valves are briefly open together. That overlap lets outgoing exhaust help drag the fresh charge in.',
      },
    ],
  },
  exhaustPort: {
    name: 'Exhaust port',
    summary:
      'The exhaust port carries burnt gas out. It opens well before bottom-dead-centre so the remaining pressure can blow down on its own rather than being pushed out by the piston.',
    faq: [
      {
        match: ['blue', 'smoke', 'oil'],
        answer:
          'Blue smoke is burning oil, getting past worn rings or valve seals. Black smoke is unburnt fuel — too rich. White smoke is usually coolant, which an air-cooled boxer does not have.',
      },
      {
        match: ['cold', 'hot', 'temperature', 'pipe'],
        answer:
          'Pipe temperature is a free diagnostic. A cold pipe on a running twin means that cylinder is not burning anything: no spark, no fuel, or no compression.',
      },
      {
        match: ['early', 'open', 'bdc', 'timing', 'blowdown'],
        answer:
          'It opens around 50° before bottom-dead-centre. There is still useful pressure in there, but letting it escape early costs less than making the piston push it out.',
      },
    ],
  },
  cover: {
    name: 'Rocker cover',
    summary:
      'The rocker cover caps the valve gear on top of the head and keeps oil in. Taking it off is how you reach the valve adjusters on an airhead.',
    faq: [
      {
        match: ['leak', 'oil', 'gasket'],
        answer:
          'A weeping rocker cover gasket is the traditional airhead oil leak. Usually harmless, always annoying.',
      },
    ],
  },
  intakeValve: {
    name: 'Intake valve',
    summary:
      'The intake valve is the door the fresh charge comes through. A spring holds it shut against the seat; the rocker pushes it open into the chamber, and it spends most of the cycle closed.',
    faq: [
      {
        match: ['spring', 'shut', 'close', 'seat'],
        answer:
          'The spring is what closes the valve — the cam only ever pushes it open. At very high rpm a valve can outrun its spring and "float", losing contact with the cam.',
      },
      {
        match: ['bigger', 'larger', 'size', 'why', 'than exhaust'],
        answer:
          'The intake valve is usually the larger of the two. Incoming charge is pushed only by atmospheric pressure, whereas exhaust leaves under its own residual pressure, so the intake needs the bigger door.',
      },
      {
        match: ['open', 'close', 'timing', 'when', 'degree'],
        answer:
          'It opens about 10° before top-dead-centre and closes about 50° after bottom-dead-centre — closing late so the charge’s own momentum keeps filling the cylinder.',
      },
      {
        match: ['burn', 'burnt', 'leak', 'compression'],
        answer:
          'A valve that does not seat fully leaks compression and runs hot, because it sheds most of its heat through contact with the seat. Left alone it burns and the cylinder loses compression.',
      },
    ],
  },
  exhaustValve: {
    name: 'Exhaust valve',
    summary:
      'The exhaust valve lets burnt gas out. It runs far hotter than the intake valve, because what flows past it is combustion products rather than cool incoming charge.',
    faq: [
      {
        match: ['hot', 'temperature', 'heat', 'burn'],
        answer:
          'It is the hottest part of the engine, glowing red in hard use. It sheds heat mainly through its seat, which is why a valve that no longer closes fully burns away quickly.',
      },
      {
        match: ['clearance', 'tick', 'adjust', 'gap', 'noise'],
        answer:
          'The clearance in the valve train exists so the valve can still close fully when everything expands. Too little and the valve is held off its seat and burns; too much and the parts slap, which is the ticking you hear.',
      },
      {
        match: ['early', 'open', 'bdc', 'blowdown'],
        answer:
          'It opens around 50° before bottom-dead-centre. Some useful pressure is thrown away, but letting the gas blow down on its own costs less than making the piston push it out.',
      },
    ],
  },
  camshaft: {
    name: 'Camshaft',
    summary:
      'The camshaft carries the lobes that open each valve. It is geared to run at exactly half crankshaft speed, which is the mechanical reason a four-stroke cycle takes two crank revolutions.',
    faq: [
      {
        match: ['half', 'speed', 'why', 'two', '720', 'revolution'],
        answer:
          'Each valve should open once per four strokes — that is once every two crank revolutions. Gearing the cam at half speed is what makes that happen mechanically.',
      },
      {
        match: ['lobe', 'profile', 'shape', 'duration', 'lift'],
        answer:
          'The lobe shape sets everything: how far the valve lifts, how long it stays open, and how violently it gets there. A wilder cam breathes better high up and worse at low rpm.',
      },
      {
        match: ['pushrod', 'rocker', 'ohv', 'lifter'],
        answer:
          'This is a pushrod engine: the cam sits low in the case and reaches the valves through lifters, long pushrods and rockers. More moving mass than an overhead cam, but a much more compact head.',
      },
    ],
  },
  crankcase: {
    name: 'Crankcase',
    summary:
      'The crankcase carries the crankshaft main bearings and holds the oil. On a boxer both cylinders bolt to it from opposite sides.',
    faq: [
      {
        match: ['oil', 'sump', 'lubricat'],
        answer:
          'Oil sits in the sump and is pumped to the bearings. Loss of oil pressure destroys the big-end bearings quickly and expensively.',
      },
      {
        match: ['bearing', 'main', 'support'],
        answer:
          'The main bearings carry the crankshaft. In this model they are the slim webs at each end — kept deliberately thin so the crank stays visible.',
      },
    ],
  },
};

/** A one-line description of what this cylinder is doing right now. */
export function liveStateSentence(state: CylinderState): string {
  const bar = (state.pressure / 1e5).toFixed(1);
  const cc = (state.volume * 1e6).toFixed(0);
  const valves =
    state.intakeLift > 0.2
      ? 'intake valve open'
      : state.exhaustLift > 0.2
        ? 'exhaust valve open'
        : 'both valves shut';
  const fault = state.fault ? ` Fault active: ${state.fault.label}.` : '';
  return `${state.name} cylinder, ${state.stroke} stroke at ${state.cycleAngle.toFixed(0)}° of the 720° cycle, ${bar} bar, ${cc} cc, ${valves}.${fault}`;
}

/** Best-effort offline answer. Returns null when nothing matches confidently. */
export function localAnswer(partId: string, question: string): string | null {
  const facts = PART_FACTS[partId];
  if (!facts) return null;

  const q = question.toLowerCase();
  if (q.trim().length === 0) return facts.summary;

  let best: { score: number; answer: string } | null = null;
  for (const entry of facts.faq) {
    const score = entry.match.reduce((n, kw) => (q.includes(kw) ? n + 1 : n), 0);
    if (score > 0 && (!best || score > best.score)) best = { score, answer: entry.answer };
  }
  if (best) return best.answer;

  // A "what is this" style question is always answerable from the summary.
  if (/\b(what|which|tell me|explain|describe|purpose|do(es)?)\b/.test(q)) return facts.summary;
  return null;
}
