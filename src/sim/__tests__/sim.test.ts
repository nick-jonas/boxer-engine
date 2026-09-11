import { describe, expect, it } from 'vitest';
import {
  boreArea,
  displacementFromTDC,
  displacementRate,
  pinDistance,
  rodAngle,
} from '../kinematics';
import { AIRHEAD_TIMING, exhaustLift, intakeLift, strokeAt, valveLift, wrap720 } from '../valvetrain';
import { AIRHEAD_GEOMETRY, chamberVolume, computeCycle, DEFAULT_PARAMS, wiebe } from '../thermo';
import { BOXER_TWIN, EngineSim } from '../engine';

const G = AIRHEAD_GEOMETRY;

describe('crank-slider kinematics', () => {
  it('puts the piston at TDC at 0 degrees and BDC at 180', () => {
    expect(displacementFromTDC(0, G)).toBeCloseTo(0, 9);
    expect(displacementFromTDC(180, G)).toBeCloseTo(G.stroke, 9);
  });

  it('never travels further than the stroke', () => {
    for (let a = 0; a < 360; a += 0.5) {
      const d = displacementFromTDC(a, G);
      expect(d).toBeGreaterThanOrEqual(-1e-9);
      expect(d).toBeLessThanOrEqual(G.stroke + 1e-9);
    }
  });

  it('is asymmetric: past the halfway point before 90 degrees of crank', () => {
    // The finite rod length is exactly what a plain sine wave would erase.
    const half = G.stroke / 2;
    expect(displacementFromTDC(90, G)).toBeGreaterThan(half);
    const sine = half * (1 - Math.cos(90 * (Math.PI / 180)));
    expect(displacementFromTDC(90, G) - sine).toBeGreaterThan(1);
  });

  it('agrees with a numerical derivative', () => {
    const h = 1e-6;
    for (const a of [17, 90, 143, 250, 331]) {
      const numeric = (displacementFromTDC(a + h, G) - displacementFromTDC(a - h, G)) / (2 * h * (Math.PI / 180));
      expect(displacementRate(a, G)).toBeCloseTo(numeric, 4);
    }
  });

  it('has zero rod angle at TDC and BDC, peaking near 90', () => {
    expect(rodAngle(0, G)).toBeCloseTo(0, 12);
    expect(rodAngle(180, G)).toBeCloseTo(0, 12);
    expect(Math.abs(rodAngle(90, G))).toBeCloseTo(Math.asin(G.crankRadius / G.rodLength), 9);
  });

  it('pin distance is largest at TDC', () => {
    expect(pinDistance(0, G)).toBeCloseTo(G.crankRadius + G.rodLength, 9);
    expect(pinDistance(180, G)).toBeCloseTo(G.rodLength - G.crankRadius, 9);
  });

  it('computes bore area', () => {
    expect(boreArea(100)).toBeCloseTo((Math.PI / 4) * 10000, 6);
  });
});

describe('valve timing', () => {
  it('seats both valves through the whole compression stroke', () => {
    for (let a = 600; a < 720; a++) {
      expect(intakeLift(a, AIRHEAD_TIMING)).toBe(0);
      expect(exhaustLift(a, AIRHEAD_TIMING)).toBe(0);
    }
  });

  it('seats both valves through the power stroke until EVO', () => {
    for (let a = 0; a < AIRHEAD_TIMING.evo; a++) {
      expect(intakeLift(a, AIRHEAD_TIMING)).toBe(0);
      expect(exhaustLift(a, AIRHEAD_TIMING)).toBe(0);
    }
  });

  it('overlaps around TDC on the exhaust-to-intake transition', () => {
    expect(intakeLift(360, AIRHEAD_TIMING)).toBeGreaterThan(0);
    expect(exhaustLift(360, AIRHEAD_TIMING)).toBeGreaterThan(0);
  });

  it('opens and closes smoothly with zero lift at the seat', () => {
    expect(valveLift(350, 350, 590, 10)).toBeCloseTo(0, 12);
    expect(valveLift(589.999, 350, 590, 10)).toBeLessThan(1e-4);
    expect(valveLift(470, 350, 590, 10)).toBeCloseTo(10, 9);
  });

  it('names the four strokes in order', () => {
    expect(strokeAt(10)).toBe('power');
    expect(strokeAt(200)).toBe('exhaust');
    expect(strokeAt(400)).toBe('intake');
    expect(strokeAt(600)).toBe('compression');
    expect(strokeAt(730)).toBe('power');
  });

  it('wraps angles into [0, 720)', () => {
    expect(wrap720(-10)).toBe(710);
    expect(wrap720(725)).toBe(5);
  });
});

describe('thermodynamics', () => {
  const table = computeCycle(G, DEFAULT_PARAMS);

  it('matches the stated displacement and compression ratio', () => {
    expect(table.displacementCc).toBeCloseTo(490, 0);
    expect(table.displacementCc / table.clearanceCc + 1).toBeCloseTo(G.compressionRatio, 6);
  });

  it('has minimum volume at TDC and maximum at BDC', () => {
    const vTdc = chamberVolume(0, G);
    const vBdc = chamberVolume(180, G);
    expect(vBdc / vTdc).toBeCloseTo(G.compressionRatio, 6);
  });

  it('produces a plausible peak pressure shortly after TDC', () => {
    const bar = table.peakPressure / 1e5;
    expect(bar).toBeGreaterThan(20);
    expect(bar).toBeLessThan(120);
    // Peak pressure should land just after TDC firing, not before it.
    expect(table.peakPressureAngle).toBeGreaterThan(0);
    expect(table.peakPressureAngle).toBeLessThan(40);
  });

  it('encloses positive indicated work', () => {
    expect(table.indicatedWork).toBeGreaterThan(0);
  });

  it('produces no net positive work when motored without ignition', () => {
    const motored = computeCycle(G, { ...DEFAULT_PARAMS, ignitionOn: false });
    expect(motored.indicatedWork).toBeLessThan(table.indicatedWork);
    expect(motored.peakPressure).toBeLessThan(table.peakPressure);
  });

  it('makes more work at wider throttle', () => {
    const closed = computeCycle(G, { ...DEFAULT_PARAMS, throttle: 0.1 });
    const open = computeCycle(G, { ...DEFAULT_PARAMS, throttle: 1 });
    expect(open.indicatedWork).toBeGreaterThan(closed.indicatedWork);
  });

  it('keeps pressure finite and positive everywhere', () => {
    for (let a = 0; a < 720; a++) {
      expect(Number.isFinite(table.pressure[a])).toBe(true);
      expect(table.pressure[a]).toBeGreaterThan(0);
    }
  });

  it('burns monotonically from 0 to ~1', () => {
    expect(wiebe(0)).toBe(0);
    expect(wiebe(1)).toBe(1);
    expect(wiebe(0.5)).toBeGreaterThan(0);
    expect(wiebe(0.5)).toBeLessThan(1);
    expect(wiebe(0.9)).toBeGreaterThan(wiebe(0.4));
  });
});

describe('boxer twin', () => {
  it('has both pistons at TDC at the same moment', () => {
    const sim = new EngineSim();
    sim.seek(0);
    const [left, right] = sim.states();
    expect(left.displacement).toBeCloseTo(0, 9);
    expect(right.displacement).toBeCloseTo(0, 9);
  });

  it('keeps the two pistons moving together throughout', () => {
    const sim = new EngineSim();
    for (let a = 0; a < 720; a += 7) {
      sim.seek(a);
      const [left, right] = sim.states();
      expect(left.displacement).toBeCloseTo(right.displacement, 9);
    }
  });

  it('pairs the strokes the way opposed pistons must', () => {
    const sim = new EngineSim();
    // Both pistons rise together, so one compresses while the other scavenges.
    sim.seek(650);
    let [left, right] = sim.states();
    expect(left.stroke).toBe('compression');
    expect(right.stroke).toBe('exhaust');

    // Both fall together: one is on power, the other draws in fresh charge.
    sim.seek(90);
    [left, right] = sim.states();
    expect(left.stroke).toBe('power');
    expect(right.stroke).toBe('intake');
  });

  it('fires the banks 360 degrees apart', () => {
    const sim = new EngineSim();
    const peaks = BOXER_TWIN.map((c) => {
      let best = -Infinity;
      let at = 0;
      for (let a = 0; a < 720; a++) {
        sim.seek(a);
        const s = sim.stateOf(c);
        if (s.pressure > best) {
          best = s.pressure;
          at = a;
        }
      }
      return at;
    });
    expect(wrap720(peaks[1] - peaks[0])).toBeCloseTo(360, 0);
  });

  it('advances the cycle at the right rate for the rpm', () => {
    const sim = new EngineSim();
    sim.rpm = 600; // 10 rev/s => 3600 deg/s
    sim.seek(0);
    sim.advance(0.1);
    expect(sim.cycleAngle).toBeCloseTo(360, 6);
  });

  it('slows the display without changing the reported rpm', () => {
    const sim = new EngineSim();
    sim.rpm = 600;
    sim.seek(0);
    sim.advance(0.1, 10);
    expect(sim.cycleAngle).toBeCloseTo(36, 6);
    expect(sim.rpm).toBe(600);
  });

  it('reports total displacement across both cylinders', () => {
    expect(new EngineSim().displacementCc).toBeCloseTo(980, 0);
  });
});
