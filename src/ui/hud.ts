import type { EngineSim } from '../sim/engine';
import type { CylinderState } from '../sim/engine';

const STROKE_LABEL: Record<string, string> = {
  power: 'Power',
  exhaust: 'Exhaust',
  intake: 'Intake',
  compression: 'Compression',
};

export class Hud {
  private readonly el = {
    crank: document.getElementById('r-crank')!,
    cycle: document.getElementById('r-cycle')!,
    stroke: document.getElementById('r-stroke')!,
    rpm: document.getElementById('r-rpm')!,
    press: document.getElementById('r-press')!,
    vol: document.getElementById('r-vol')!,
  };

  update(sim: EngineSim, state: CylinderState): void {
    this.el.crank.textContent = `${state.crankAngle.toFixed(0)}°`;
    this.el.cycle.textContent = `${state.cycleAngle.toFixed(0)}°`;
    this.el.stroke.textContent = STROKE_LABEL[state.stroke];
    this.el.stroke.dataset.stroke = state.stroke;
    this.el.rpm.textContent = sim.rpm.toFixed(0);
    this.el.press.textContent = `${(state.pressure / 1e5).toFixed(1)} bar`;
    this.el.vol.textContent = `${(state.volume * 1e6).toFixed(0)} cc`;
  }
}
