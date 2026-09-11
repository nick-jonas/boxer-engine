import { MAX_LEVEL, questionsForLevel } from './questions';

/**
 * XP and level progress, persisted to localStorage.
 *
 * Every read and write is guarded: storage throws outright in some privacy
 * modes, and a quiz that crashes because it cannot save a score is worse than
 * one that quietly forgets.
 */

const KEY = 'boxer-engine-progress-v1';

export interface ProgressState {
  xp: number;
  level: number;
  /** Question ids answered correctly, ever. */
  solved: string[];
  /** Question ids that took more than one attempt. */
  stumbled: string[];
  streak: number;
  bestStreak: number;
}

const EMPTY: ProgressState = { xp: 0, level: 1, solved: [], stumbled: [], streak: 0, bestStreak: 0 };

export const XP_FIRST_TRY = 12;
export const XP_RETRY = 4;
export const XP_STREAK_STEP = 3;
export const XP_STREAK_CAP = 15;

export class Progress {
  private state: ProgressState;

  constructor() {
    this.state = Progress.load();
  }

  private static load(): ProgressState {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...EMPTY };
      const parsed = JSON.parse(raw) as Partial<ProgressState>;
      return {
        xp: Number(parsed.xp) || 0,
        level: Math.min(MAX_LEVEL, Math.max(1, Number(parsed.level) || 1)),
        solved: Array.isArray(parsed.solved) ? parsed.solved.filter((s) => typeof s === 'string') : [],
        stumbled: Array.isArray(parsed.stumbled) ? parsed.stumbled.filter((s) => typeof s === 'string') : [],
        streak: Number(parsed.streak) || 0,
        bestStreak: Number(parsed.bestStreak) || 0,
      };
    } catch {
      return { ...EMPTY };
    }
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      // Storage unavailable or full; the session still works, it just forgets.
    }
  }

  get snapshot(): Readonly<ProgressState> {
    return this.state;
  }

  isSolved(id: string): boolean {
    return this.state.solved.includes(id);
  }

  /** Record an answer. Returns the XP awarded (0 when wrong). */
  record(id: string, correct: boolean, firstTry: boolean): number {
    if (!correct) {
      this.state.streak = 0;
      if (!this.state.stumbled.includes(id)) this.state.stumbled.push(id);
      this.save();
      return 0;
    }

    const base = firstTry ? XP_FIRST_TRY : XP_RETRY;
    const bonus = Math.min(XP_STREAK_CAP, this.state.streak * XP_STREAK_STEP);
    const gained = base + bonus;

    this.state.xp += gained;
    this.state.streak += 1;
    this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak);
    if (!this.state.solved.includes(id)) this.state.solved.push(id);
    this.save();
    return gained;
  }

  /** How much of the current level is done. */
  levelProgress(level: number): { solved: number; total: number } {
    const qs = questionsForLevel(level);
    return { solved: qs.filter((q) => this.isSolved(q.id)).length, total: qs.length };
  }

  /** A level is cleared once every one of its questions has been answered. */
  isLevelComplete(level: number): boolean {
    const { solved, total } = this.levelProgress(level);
    return total > 0 && solved >= total;
  }

  /** Unlock the next level if the current one is done. Returns true if it moved. */
  tryAdvance(): boolean {
    if (this.state.level >= MAX_LEVEL) return false;
    if (!this.isLevelComplete(this.state.level)) return false;
    this.state.level += 1;
    this.save();
    return true;
  }

  setLevel(level: number): void {
    this.state.level = Math.min(MAX_LEVEL, Math.max(1, level));
    this.save();
  }

  /** Highest level the player has unlocked so far. */
  get unlockedLevel(): number {
    return this.state.level;
  }

  reset(): void {
    this.state = { ...EMPTY, solved: [], stumbled: [] };
    this.save();
  }
}
