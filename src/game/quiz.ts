import type { Director } from './director';
import { Progress } from './progress';
import { LEVELS, MAX_LEVEL, questionsForLevel, type Question, type QuestionType } from './questions';

/**
 * The quiz flow and its panel.
 *
 * Kept as one unit because the state machine and the DOM it drives are the same
 * feature: question -> answer -> reveal -> next, with XP and level unlocks
 * falling out of `Progress`.
 */

const TYPE_LABEL: Record<QuestionType, string> = {
  anatomy: 'Anatomy',
  diagnostics: 'Diagnostics',
  general: 'General',
};

export class Quiz {
  readonly root: HTMLElement;

  private readonly progress = new Progress();
  private queue: Question[] = [];
  private current: Question | null = null;
  private attempts = 0;
  private answered = false;
  private active = false;

  private readonly el: {
    level: HTMLElement;
    levelTitle: HTMLElement;
    focus: HTMLElement;
    xp: HTMLElement;
    bar: HTMLElement;
    streak: HTMLElement;
    type: HTMLElement;
    prompt: HTMLElement;
    options: HTMLElement;
    feedback: HTMLElement;
    next: HTMLButtonElement;
    levelPips: HTMLElement;
  };

  constructor(private readonly director: Director) {
    this.root = document.createElement('div');
    this.root.id = 'quiz';
    this.root.hidden = true;
    this.root.innerHTML = `
      <header class="quiz-head">
        <div class="quiz-level">
          <span class="chip" id="q-level">Level 1</span>
          <span class="quiz-title" id="q-level-title"></span>
        </div>
        <p class="quiz-focus" id="q-focus"></p>
        <div class="quiz-xp">
          <div class="quiz-bar"><span id="q-bar"></span></div>
          <span class="quiz-xp-value" id="q-xp">0 XP</span>
        </div>
        <div class="quiz-meta">
          <span id="q-streak"></span>
          <span id="q-pips" class="quiz-pips"></span>
        </div>
      </header>
      <div class="quiz-body">
        <span class="chip chip-type" id="q-type"></span>
        <p class="quiz-prompt" id="q-prompt"></p>
        <div class="quiz-options" id="q-options"></div>
        <div class="quiz-feedback" id="q-feedback" hidden></div>
      </div>
      <footer class="quiz-foot">
        <button id="q-next" class="primary">Next</button>
        <button id="q-reset" class="ghost">Reset progress</button>
      </footer>
    `;

    const byId = <T extends HTMLElement>(id: string) => this.root.querySelector<T>(`#${id}`)!;
    this.el = {
      level: byId('q-level'),
      levelTitle: byId('q-level-title'),
      focus: byId('q-focus'),
      xp: byId('q-xp'),
      bar: byId('q-bar'),
      streak: byId('q-streak'),
      type: byId('q-type'),
      prompt: byId('q-prompt'),
      options: byId('q-options'),
      feedback: byId('q-feedback'),
      next: byId<HTMLButtonElement>('q-next'),
      levelPips: byId('q-pips'),
    };

    this.el.next.addEventListener('click', () => this.advance());
    byId<HTMLButtonElement>('q-reset').addEventListener('click', () => {
      this.progress.reset();
      this.start();
    });
  }

  get isActive(): boolean {
    return this.active;
  }

  start(): void {
    this.active = true;
    this.root.hidden = false;
    this.fillQueue();
    this.next();
  }

  stop(): void {
    this.active = false;
    this.root.hidden = true;
    this.current = null;
    this.director.release();
  }

  /**
   * Unsolved questions in the current level come first; once the level is
   * cleared the queue refills with everything from it, so the level stays
   * replayable instead of dead-ending.
   */
  private fillQueue(): void {
    const level = this.progress.unlockedLevel;
    const all = questionsForLevel(level);
    const unsolved = all.filter((q) => !this.progress.isSolved(q.id));
    this.queue = unsolved.length > 0 ? unsolved : shuffle([...all]);
  }

  private next(): void {
    if (this.queue.length === 0) this.fillQueue();
    this.current = this.queue.shift() ?? null;
    this.attempts = 0;
    this.answered = false;
    this.render();
    if (this.current) this.director.apply(this.current.scene);
  }

  private advance(): void {
    if (!this.answered && this.current) return; // must answer first
    const levelledUp = this.progress.tryAdvance();
    if (levelledUp) {
      this.fillQueue();
      this.showLevelUp();
      return;
    }
    this.next();
  }

  private showLevelUp(): void {
    const level = this.progress.unlockedLevel;
    const meta = LEVELS.find((l) => l.level === level);
    this.current = null;
    this.renderHeader();
    this.el.type.textContent = 'Level up';
    this.el.type.dataset.type = 'general';
    this.el.prompt.textContent = `Level ${level}: ${meta?.title ?? ''}`;
    this.el.options.innerHTML = '';
    this.el.feedback.hidden = false;
    this.el.feedback.dataset.state = 'correct';
    this.el.feedback.textContent = meta?.focus ?? '';
    this.el.next.textContent = 'Start level';
    this.answered = true;
    this.director.apply({ camera: 'wide', autoRotate: true, running: true, playback: 28 });
  }

  private render(): void {
    this.renderHeader();
    const q = this.current;
    if (!q) return;

    this.el.type.textContent = TYPE_LABEL[q.type];
    this.el.type.dataset.type = q.type;
    this.el.prompt.textContent = q.prompt;
    this.el.feedback.hidden = true;
    this.el.next.textContent = 'Next';
    this.el.next.disabled = true;

    this.el.options.innerHTML = '';
    q.options.forEach((text, i) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-option';
      btn.textContent = text;
      btn.addEventListener('click', () => this.answer(i, btn));
      this.el.options.append(btn);
    });
  }

  private renderHeader(): void {
    const level = this.progress.unlockedLevel;
    const meta = LEVELS.find((l) => l.level === level);
    const { solved, total } = this.progress.levelProgress(level);
    const snap = this.progress.snapshot;

    this.el.level.textContent = `Level ${level}`;
    this.el.levelTitle.textContent = meta?.title ?? '';
    this.el.focus.textContent = meta?.focus ?? '';
    this.el.xp.textContent = `${snap.xp} XP`;
    this.el.bar.style.width = `${total ? (solved / total) * 100 : 0}%`;
    this.el.streak.textContent = snap.streak > 1 ? `🔥 ${snap.streak} in a row` : '';
    this.el.levelPips.textContent = `${solved}/${total} this level${level >= MAX_LEVEL ? ' · final level' : ''}`;
  }

  private answer(index: number, button: HTMLButtonElement): void {
    const q = this.current;
    if (!q || this.answered) return;

    this.attempts += 1;
    const correct = index === q.correct;

    if (!correct) {
      button.disabled = true;
      button.dataset.state = 'wrong';
      this.progress.record(q.id, false, false);
      this.el.feedback.hidden = false;
      this.el.feedback.dataset.state = 'wrong';
      this.el.feedback.textContent = 'Not quite — look at the engine and try again.';
      this.renderHeader();
      return;
    }

    button.dataset.state = 'right';
    this.answered = true;
    const gained = this.progress.record(q.id, true, this.attempts === 1);

    for (const el of Array.from(this.el.options.children)) {
      (el as HTMLButtonElement).disabled = true;
    }

    this.el.feedback.hidden = false;
    this.el.feedback.dataset.state = 'correct';
    this.el.feedback.textContent = `+${gained} XP · ${q.explanation}`;
    this.el.next.disabled = false;

    this.renderHeader();
    // Keep the fault running through the reveal so the symptom stays visible.
    this.director.apply(q.revealScene ?? q.scene, { keepHighlight: false });

    if (this.progress.isLevelComplete(this.progress.unlockedLevel) && this.progress.unlockedLevel < MAX_LEVEL) {
      this.el.next.textContent = 'Level complete →';
    }
  }
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
