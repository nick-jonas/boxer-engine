import * as THREE from 'three';
import type { Stage } from '../render/scene';
import type { EngineSim, CylinderState } from '../sim/engine';
import { PART_FACTS, liveStateSentence } from './knowledge';
import { currentMode, streamAnswer } from './claudeClient';

/**
 * A tutor that watches what you are looking at and talks about it.
 *
 * It only speaks after you stop moving the camera, so it comments on a settled
 * view rather than chattering through a drag. What you are "looking at" is
 * worked out by raycasting a small grid around the screen centre and taking the
 * most-hit part, weighted toward the middle.
 */

const SETTLE_MS = 900; // quiet time after the last camera change
const MIN_GAP_MS = 9000; // never speak more often than this
const QUESTION_EVERY = 3; // utterances between questions

export type Framing = 'close' | 'medium' | 'wide';

export interface ViewReport {
  focus: string;
  cylinder: string;
  framing: Framing;
  visible: string[];
  state: CylinderState;
}

interface TutorQuestion {
  prompt: string;
  options: { label: string; correct: boolean; reply: string }[];
}

export class Tutor {
  readonly root: HTMLElement;
  enabled = true;

  private readonly raycaster = new THREE.Raycaster();
  private interacting = false;
  private lastChangeAt = 0;
  private lastSpokeAt = 0;
  private speaking = false;
  private utterances = 0;
  private lastSignature = '';
  /** Facts already used, so it does not repeat itself. */
  private readonly said = new Set<string>();
  private readonly transcript: { role: 'assistant' | 'user'; text: string }[] = [];

  private readonly bubble: HTMLElement;
  private readonly choices: HTMLElement;

  constructor(
    private readonly stage: Stage,
    private readonly sim: EngineSim,
    /** The tutor stays quiet while this returns true, e.g. during the quiz. */
    private readonly suppressed: () => boolean,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'tutor';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="tutor-bubble" id="t-bubble"></div>
      <div class="tutor-choices" id="t-choices"></div>
    `;
    this.bubble = this.root.querySelector('#t-bubble')!;
    this.choices = this.root.querySelector('#t-choices')!;

    this.stage.controls.addEventListener('change', () => {
      this.interacting = true;
      this.lastChangeAt = performance.now();
    });
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.root.hidden = true;
  }

  /** Called every frame. Decides when the view has settled enough to comment. */
  update(): void {
    if (!this.enabled || this.speaking || this.suppressed()) return;
    if (!this.interacting) return;

    const now = performance.now();
    if (now - this.lastChangeAt < SETTLE_MS) return;
    this.interacting = false;

    if (now - this.lastSpokeAt < MIN_GAP_MS) return;

    const report = this.readView();
    if (!report) return;

    // Only speak when the view actually changed subject.
    const signature = `${report.focus}:${report.cylinder}:${report.framing}`;
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.lastSpokeAt = now;

    void this.comment(report);
  }

  /** Raycast a small grid around the screen centre to see what is on show. */
  private readView(): ViewReport | null {
    const samples: [number, number][] = [
      [0, 0],
      [-0.22, 0.14],
      [0.22, 0.14],
      [-0.22, -0.14],
      [0.22, -0.14],
    ];
    const tally = new Map<string, number>();
    const cylinders = new Map<string, number>();

    samples.forEach(([x, y], i) => {
      this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.stage.camera);
      const hits = this.raycaster.intersectObjects(this.stage.root.children, true);
      const hit = hits.find(
        (h) => h.object instanceof THREE.Mesh && typeof h.object.userData.partId === 'string',
      );
      if (!hit) return;
      // The centre sample counts double: it is what the user is aiming at.
      const weight = i === 0 ? 2 : 1;
      const part = hit.object.userData.partId as string;
      const cyl = hit.object.userData.cylinder as string;
      tally.set(part, (tally.get(part) ?? 0) + weight);
      cylinders.set(cyl, (cylinders.get(cyl) ?? 0) + weight);
    });

    if (tally.size === 0) return null;
    const focus = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const cylinder = [...cylinders.entries()].sort((a, b) => b[1] - a[1])[0][0];

    const distance = this.stage.camera.position.distanceTo(this.stage.controls.target);
    const framing: Framing = distance < 3 ? 'close' : distance < 7 ? 'medium' : 'wide';

    const config =
      this.sim.cylinders.find((c) => c.name === cylinder) ?? this.sim.cylinders[0];

    return { focus, cylinder, framing, visible: [...tally.keys()], state: this.sim.stateOf(config) };
  }

  private async comment(report: ViewReport): Promise<void> {
    this.speaking = true;
    this.root.hidden = false;
    this.choices.innerHTML = '';

    const wantsQuestion = this.utterances > 0 && this.utterances % QUESTION_EVERY === 0;

    try {
      if ((await currentMode()) !== 'none') {
        await this.commentWithClaude(report, wantsQuestion);
      } else {
        this.commentLocally(report, wantsQuestion);
      }
    } finally {
      this.utterances += 1;
      this.speaking = false;
    }
  }

  // ---------------------------------------------------------------- offline

  private commentLocally(report: ViewReport, wantsQuestion: boolean): void {
    const facts = PART_FACTS[report.focus];
    const name = facts?.name ?? report.focus;

    const lines: string[] = [];
    if (report.framing === 'wide') {
      lines.push(
        `Looking at the whole engine — both pistons punch outward together, which is the boxer's party trick. Right now the ${report.state.name} cylinder is on its ${report.state.stroke} stroke.`,
      );
    } else {
      lines.push(`That's the ${name.toLowerCase()}.`);
    }

    // Pick a fact about this part that has not been used yet.
    const pool = facts ? [facts.summary, ...facts.faq.map((f) => f.answer)] : [];
    const fresh = pool.find((text) => !this.said.has(text));
    if (fresh) {
      this.said.add(fresh);
      lines.push(fresh);
    } else if (facts) {
      lines.push(contextualLine(report.state));
    }

    this.say(lines.join(' '));

    if (wantsQuestion) {
      const question = localQuestion(report);
      if (question) this.ask(question);
    }
  }

  // ----------------------------------------------------------------- claude

  private async commentWithClaude(report: ViewReport, wantsQuestion: boolean): Promise<void> {
    this.say('\u2026');

    const history = this.transcript
      .slice(-6)
      .map((t) => `${t.role === 'assistant' ? 'You said' : 'They said'}: ${t.text}`)
      .join('\n');

    try {
      const text = await streamAnswer(
        {
          kind: 'tutor',
          partId: report.focus,
          partName: PART_FACTS[report.focus]?.name ?? report.focus,
          partSummary: PART_FACTS[report.focus]?.summary ?? '',
          liveContext: liveStateSentence(report.state),
          cylinder: report.cylinder,
          framing: report.framing,
          visible: report.visible,
          wantsQuestion,
          history,
        },
        (partial) => {
          this.bubble.textContent = partial;
        },
      );

      if (text.trim()) this.transcript.push({ role: 'assistant', text: text.trim() });
      else this.commentLocally(report, wantsQuestion);
    } catch {
      // A tutor that pops up an error banner mid-exploration is worse than one
      // that quietly falls back to what it knows offline.
      this.commentLocally(report, wantsQuestion);
    }
  }

  private say(text: string): void {
    this.bubble.textContent = text;
    this.root.hidden = false;
  }

  private ask(question: TutorQuestion): void {
    this.bubble.textContent = `${this.bubble.textContent} ${question.prompt}`;
    this.choices.innerHTML = '';
    for (const option of question.options) {
      const button = document.createElement('button');
      button.className = 'tutor-choice';
      button.textContent = option.label;
      button.addEventListener('click', () => {
        this.choices.innerHTML = '';
        this.bubble.textContent = option.reply;
        this.transcript.push({ role: 'user', text: option.label });
        // Give them a moment with the answer before the next comment.
        this.lastSpokeAt = performance.now();
      });
      this.choices.append(button);
    }
  }
}

function contextualLine(state: CylinderState): string {
  if (state.intakeLift > 0.5) return 'Its intake valve is open right now — that is the cylinder breathing in.';
  if (state.exhaustLift > 0.5) return 'Its exhaust valve is open — burnt gas on its way out.';
  if (state.stroke === 'compression') return 'Both valves are shut and the charge is being squeezed.';
  return 'Both valves are shut and the gas is pushing the piston down.';
}

function localQuestion(report: ViewReport): TutorQuestion | null {
  const pool: Record<string, TutorQuestion> = {
    piston: {
      prompt: 'Quick one: does the piston move faster near the top of the bore, or near the bottom?',
      options: [
        { label: 'Near the top', correct: true, reply: 'Right. The rod leans as the crank swings, so the piston covers more than half its stroke in the first 90 degrees.' },
        { label: 'Near the bottom', correct: false, reply: 'Other way round. The connecting rod’s lean means the piston moves fastest around the top of the bore.' },
        { label: 'Same both ends', correct: false, reply: 'That would be true only with an infinitely long rod. A real rod makes the motion asymmetric — faster at the top.' },
      ],
    },
    crankshaft: {
      prompt: 'How fast does the camshaft turn compared with this crankshaft?',
      options: [
        { label: 'Half speed', correct: true, reply: 'Exactly. Each valve opens once per four strokes, which is once every two crank turns.' },
        { label: 'Same speed', correct: false, reply: 'Not quite — at crank speed each valve would open twice as often as it should. The cam runs at half.' },
        { label: 'Double speed', correct: false, reply: 'The other way: half crank speed, which is why a four-stroke cycle needs 720 degrees.' },
      ],
    },
    sparkPlug: {
      prompt: 'Why does the plug fire before the piston reaches the top?',
      options: [
        { label: 'Burning takes time', correct: true, reply: 'Exactly. Light it early and peak pressure lands just after top-dead-centre, where it can actually push.' },
        { label: 'To cool the chamber', correct: false, reply: 'No — it is about timing. Combustion is not instant, so the spark leads the piston.' },
      ],
    },
    intakeValve: {
      prompt: 'Why is the intake valve usually bigger than the exhaust valve?',
      options: [
        { label: 'Incoming air is only pushed by atmosphere', correct: true, reply: 'That is it. Exhaust leaves under its own pressure, so the intake needs the bigger door.' },
        { label: 'It runs hotter', correct: false, reply: 'Actually the exhaust valve is the hot one. The intake is bigger because incoming charge has only atmospheric pressure behind it.' },
      ],
    },
  };

  const direct = pool[report.focus];
  if (direct) return direct;
  if (report.framing === 'wide') {
    return {
      prompt: 'While you are looking at the whole engine: what are the two pistons doing at the same instant?',
      options: [
        { label: 'Moving apart, then together', correct: true, reply: 'Right — both reach top-dead-centre together, punching outward. That is what cancels the shaking.' },
        { label: 'One up while the other is down', correct: false, reply: 'That is a 180-degree parallel twin. In a boxer they move in opposite directions at the same time.' },
      ],
    };
  }
  return null;
}
