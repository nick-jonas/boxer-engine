import * as THREE from 'three';
import type { Stage } from '../render/scene';
import type { EngineSim } from '../sim/engine';
import type { Highlighter } from '../render/highlight';
import { PART_FACTS, liveStateSentence, localAnswer } from './knowledge';
import {
  AskError,
  browserKeyAllowed,
  currentMode,
  readKey,
  streamAnswer,
  writeKey,
} from './claudeClient';

/**
 * Click any part of the engine and ask a free-form question about it.
 *
 * Two answer paths. The offline knowledge base always works and covers the
 * common intents; supplying an API key routes genuinely open questions to
 * Claude, grounded with the clicked part and the engine's live state so the
 * answer is about THIS engine at THIS instant rather than engines in general.
 */

const CLICK_SLOP_PX = 5;
const CLICK_MS = 400;

export class AskPanel {
  readonly root: HTMLElement;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private pressedAt = 0;
  private pressedPos = { x: 0, y: 0 };

  private partId: string | null = null;
  private cylinderName: string | null = null;
  private busy = false;

  private readonly el: {
    part: HTMLElement;
    state: HTMLElement;
    input: HTMLInputElement;
    ask: HTMLButtonElement;
    answer: HTMLElement;
    source: HTMLElement;
    keyBtn: HTMLButtonElement;
  };

  constructor(
    private readonly stage: Stage,
    private readonly sim: EngineSim,
    private readonly highlighter: Highlighter,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'ask';
    this.root.hidden = true;
    this.root.innerHTML = `
      <header class="ask-head">
        <span class="ask-part" id="a-part"></span>
        <button class="ask-close" id="a-close" aria-label="Close">&times;</button>
      </header>
      <p class="ask-state" id="a-state"></p>
      <form class="ask-form" id="a-form">
        <input id="a-input" type="text" autocomplete="off" placeholder="Ask anything about this part…" />
        <button id="a-ask" type="submit">Ask</button>
      </form>
      <div class="ask-answer" id="a-answer"></div>
      <footer class="ask-foot">
        <span class="ask-source" id="a-source"></span>
        <button class="ask-key" id="a-key"></button>
      </footer>
    `;

    const byId = <T extends HTMLElement>(id: string) => this.root.querySelector<T>(`#${id}`)!;
    this.el = {
      part: byId('a-part'),
      state: byId('a-state'),
      input: byId<HTMLInputElement>('a-input'),
      ask: byId<HTMLButtonElement>('a-ask'),
      answer: byId('a-answer'),
      source: byId('a-source'),
      keyBtn: byId<HTMLButtonElement>('a-key'),
    };

    byId('a-close').addEventListener('click', () => this.close());
    byId<HTMLFormElement>('a-form').addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit();
    });
    // Implicit form submission is not reliable everywhere; bind Enter directly.
    this.el.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.submit();
      }
    });
    this.el.keyBtn.addEventListener('click', () => this.manageKey());

    this.attach();
    void this.refreshKeyButton();
  }

  private attach(): void {
    const canvas = this.stage.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => {
      this.pressedAt = performance.now();
      this.pressedPos = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', (e) => {
      // Orbiting is a drag, not a click. Only a short, still press counts.
      const moved = Math.hypot(e.clientX - this.pressedPos.x, e.clientY - this.pressedPos.y);
      if (moved > CLICK_SLOP_PX || performance.now() - this.pressedAt > CLICK_MS) return;
      this.pick(e);
    });
  }

  private pick(event: PointerEvent): void {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);

    const hits = this.raycaster.intersectObjects(this.stage.root.children, true);
    // Untagged decoration (the gas column, the spark flash) must not swallow a
    // click meant for the part behind it.
    const hit = hits.find((h) => h.object instanceof THREE.Mesh && typeof h.object.userData.partId === 'string');
    if (!hit) {
      this.close();
      return;
    }

    this.open(hit.object.userData.partId as string, hit.object.userData.cylinder as string, event);
  }

  private open(partId: string, cylinder: string, event: PointerEvent): void {
    this.partId = partId;
    this.cylinderName = cylinder;

    const facts = PART_FACTS[partId];
    this.el.part.textContent = facts?.name ?? partId;
    this.el.answer.textContent = facts?.summary ?? '';
    this.el.answer.dataset.state = 'idle';
    this.el.source.textContent = '';
    this.el.input.value = '';
    this.updateStateLine();

    this.root.hidden = false;
    this.position(event);
    this.el.input.focus();

    const target = cylinder === 'engine' ? partId : `${partId}.${cylinder}`;
    this.highlighter.set(this.highlighter.has(target) ? [target] : [partId], 0x5fa8ff);
  }

  private position(event: PointerEvent): void {
    const pad = 12;
    const width = 340;
    const left = Math.min(Math.max(pad, event.clientX + 16), window.innerWidth - width - pad);
    const top = Math.min(Math.max(pad, event.clientY - 40), window.innerHeight - 260);
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
  }

  close(): void {
    this.root.hidden = true;
    this.partId = null;
    this.highlighter.clear();
  }

  /** Refresh the live-state line; called each frame while open. */
  updateStateLine(): void {
    if (this.root.hidden || !this.cylinderName) return;
    const config =
      this.sim.cylinders.find((c) => c.name === this.cylinderName) ?? this.sim.cylinders[0];
    this.el.state.textContent = liveStateSentence(this.sim.stateOf(config));
  }

  private liveContext(): string {
    return this.sim.cylinders
      .map((c) => liveStateSentence(this.sim.stateOf(c)))
      .join(' ');
  }

  private async submit(): Promise<void> {
    if (!this.partId || this.busy) return;
    const question = this.el.input.value.trim();
    if (!question) return;

    const mode = await currentMode();
    if (mode === 'none') {
      const offline = localAnswer(this.partId, question);
      this.el.answer.dataset.state = offline ? 'idle' : 'warn';
      this.el.answer.textContent =
        offline ??
        (browserKeyAllowed()
          ? 'That one is outside what the built-in notes cover. Connect a Claude API key below and I can answer it properly.'
          : 'That one is outside what the built-in notes cover.');
      this.el.source.textContent = 'Built-in notes';
      return;
    }

    this.busy = true;
    this.el.ask.disabled = true;
    this.el.answer.dataset.state = 'idle';
    this.el.answer.textContent = '\u2026';
    this.el.source.textContent = 'Claude';

    const facts = PART_FACTS[this.partId];
    try {
      const text = await streamAnswer(
        {
          kind: 'part',
          partId: this.partId,
          partName: facts?.name ?? this.partId,
          partSummary: facts?.summary ?? '',
          liveContext: this.liveContext(),
          cylinder: this.cylinderName ?? 'engine',
          question,
        },
        (partial) => {
          this.el.answer.textContent = partial;
        },
      );
      if (!text.trim()) this.el.answer.textContent = 'Claude returned nothing for that question.';
    } catch (error) {
      const offline = localAnswer(this.partId, question);
      const reason = error instanceof AskError ? error.message : 'Something went wrong asking Claude.';
      this.el.answer.dataset.state = 'warn';
      this.el.answer.textContent = offline
        ? `${reason} Falling back to the built-in notes: ${offline}`
        : reason;
      this.el.source.textContent = 'Built-in notes';
    } finally {
      this.busy = false;
      this.el.ask.disabled = false;
    }
  }

  private manageKey(): void {
    if (readKey()) {
      writeKey(null);
      void this.refreshKeyButton();
      return;
    }
    const entered = window.prompt(
      'Paste an Anthropic API key to enable free-form answers.\n\n' +
        'It is stored in this browser only, and is sent straight from this page to the Anthropic API — ' +
        'anyone with access to this browser can read it. Use a key you are happy to treat that way.',
    );
    if (entered && entered.trim()) writeKey(entered.trim());
    void this.refreshKeyButton();
  }

  private async refreshKeyButton(): Promise<void> {
    // On a deployed build the server holds the key, so there is nothing here
    // for the user to manage — and nothing to tempt them into pasting.
    if (!browserKeyAllowed() || (await currentMode()) === 'proxy') {
      this.el.keyBtn.hidden = true;
      return;
    }
    this.el.keyBtn.hidden = false;
    this.el.keyBtn.textContent = readKey() ? 'Disconnect Claude' : 'Connect Claude';
  }
}
