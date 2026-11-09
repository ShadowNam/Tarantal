// v1.17 (D-079): wind that matters — drift by plane (distance) and by strength (faster than
// linear), gusts, deterministic, and no extra draws on the omen stream.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { createStream } from '../rng';
import {
  createWind,
  gustLevel,
  planeDriftMul,
  strengthNow,
  tickWind,
  windDriftAt,
  windDriftPx,
  windView,
  type Wind,
  type WindConfig,
} from './wind';

const content = loadContent();
const karoo = content.biomes.find((b) => b.id === 'karoo-autumn');
const cfg = karoo?.omen.wind as WindConfig;
const planes = {
  near: content.scoring.planes.near.scrollFactor,
  mid: content.scoring.planes.mid.scrollFactor,
  far: content.scoring.planes.far.scrollFactor,
  ver: content.scoring.planes.ver.scrollFactor,
};

/** A wind held at `strength` blowing right, no gust. */
function steady(strength: number, c: WindConfig = cfg): Wind {
  const w = createWind({ ...c, gusts: undefined }, createStream(1), planes);
  w.dir = 1;
  w.strength = strength;
  return w;
}

describe('wind drift (v1.17, D-079)', () => {
  it('has the new tuning on the Karoo', () => {
    expect(cfg.strengthExponent).toBe(1.5);
    expect(cfg.driftPlaneMul?.far).toBe(1);
    expect(cfg.gusts).toBeDefined();
  });

  it('grows with distance: near < mid < far < Ver, and the sky as Ver', () => {
    const w = steady(0.8);
    const at = (f: number): number => windDriftAt(w, 1, f);
    expect(at(planes.near)).toBeGreaterThan(0);
    expect(at(planes.near)).toBeLessThan(at(planes.mid));
    expect(at(planes.mid)).toBeLessThan(at(planes.far));
    expect(at(planes.far)).toBeLessThan(at(planes.ver));
    expect(at(0)).toBeCloseTo(at(planes.ver), 9);
    // A prop layer between mid and far lies between them.
    const between = at((planes.mid + planes.far) / 2);
    expect(between).toBeGreaterThan(at(planes.mid));
    expect(between).toBeLessThan(at(planes.far));
    // The far plane is driftPxAtFar × strength^1.5 exactly.
    expect(at(planes.far)).toBeCloseTo(cfg.driftPxAtFar * 0.8 * Math.sqrt(0.8), 2);
  });

  it('grows faster than linearly with strength (strength ^ 1.5)', () => {
    const d = (s: number): number => windDriftPx(steady(s), 1);
    let last = -1;
    for (let s = 0; s <= 1.0001; s += 0.1) {
      const v = d(s);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
    // A light breeze barely pushes; a strong gust clearly does.
    expect(d(0.4) / d(1)).toBeLessThan(0.4);
    expect(d(1) - d(0.9)).toBeGreaterThan(d(0.5) - d(0.4));
  });

  it('scales with the gun (windSensitivity) and the direction', () => {
    const w = steady(0.7);
    expect(windDriftAt(w, 0.4, planes.far)).toBeCloseTo(0.4 * windDriftAt(w, 1, planes.far), 9);
    w.dir = -1;
    expect(windDriftAt(w, 1, planes.far)).toBeLessThan(0);
    expect(windDriftAt(null, 1, planes.far)).toBe(0);
    expect(windDriftAt(w, 0, planes.far) === 0).toBe(true);
  });

  it('keeps the old rule without the new fields (far and behind only, linear)', () => {
    const old: WindConfig = {
      strength: cfg.strength,
      directionChangeSeconds: cfg.directionChangeSeconds,
      tailwindSpeedMul: cfg.tailwindSpeedMul,
      headwindSpeedMul: cfg.headwindSpeedMul,
      driftPxAtFar: 45,
    };
    const w = steady(0.5, old);
    expect(windDriftAt(w, 1, planes.near)).toBe(0);
    expect(windDriftAt(w, 1, planes.mid)).toBe(0);
    expect(windDriftAt(w, 1, planes.far)).toBeCloseTo(22.5, 9);
  });

  it('interpolates the plane curve linearly and clamps at the ends', () => {
    const curve = [
      [1, 0.1],
      [0.5, 0.5],
      [0.2, 2],
    ] as const;
    expect(planeDriftMul(curve, 2)).toBe(0.1);
    expect(planeDriftMul(curve, 0.75)).toBeCloseTo(0.3, 9);
    expect(planeDriftMul(curve, 0.1)).toBe(2);
  });
});

describe('gusts (v1.17, D-079)', () => {
  it('come and go, raise the strength (never above 1) and are deterministic', () => {
    const run = (): number[] => {
      const rng = createStream(42);
      const w = createWind(cfg, rng, planes);
      const out: number[] = [];
      for (let t = 0; t < 60 * 60; t++) {
        tickWind(w, rng);
        out.push(strengthNow(w));
      }
      return out;
    };
    const a = run();
    expect(run()).toEqual(a);
    expect(Math.max(...a)).toBeLessThanOrEqual(1);
    const rng = createStream(42);
    const w = createWind(cfg, rng, planes);
    let gusts = 0;
    let above = 0;
    for (let t = 0; t < 60 * 60; t++) {
      if (tickWind(w, rng).gust) gusts++;
      if (strengthNow(w) > w.strength + 1e-9) above++;
    }
    // A minute of wind holds several gusts (every 5–10 s).
    expect(gusts).toBeGreaterThanOrEqual(5);
    expect(gusts).toBeLessThanOrEqual(13);
    expect(above).toBeGreaterThan(0);
    // The view shows the gust's strength (what the windsock and the HUD draw).
    expect(windView(w)?.strength).toBeCloseTo(strengthNow(w), 9);
  });

  it('never draw on the omen stream (the showers, storm and dust devils keep their sequence)', () => {
    const draws = (gusts: boolean): number[] => {
      const rng = createStream(7);
      const w = createWind(gusts ? cfg : { ...cfg, gusts: undefined }, rng, planes);
      for (let t = 0; t < 60 * 90; t++) tickWind(w, rng);
      return [rng.u32(), rng.u32(), rng.u32()];
    };
    expect(draws(true)).toEqual(draws(false));
  });

  it('rise over riseShare of the gust from content, then fall (D-080)', () => {
    expect(cfg.gusts?.riseShare).toBe(0.3);
    const level = (riseShare: number, at: number): number => {
      const gusts = cfg.gusts;
      if (gusts === undefined) throw new Error('the Karoo has gusts');
      const w = createWind({ ...cfg, gusts: { ...gusts, riseShare } }, createStream(1), planes);
      w.gust = { start: 0, len: 100 };
      w.t = at;
      return gustLevel(w);
    };
    // Today's shape: the peak at 30 % of the gust, the fall over the other 70 %.
    expect(level(0.3, 30)).toBeCloseTo(1, 9);
    expect(level(0.3, 15)).toBeCloseTo(0.5, 9);
    expect(level(0.3, 65)).toBeCloseTo(0.5, 9);
    expect(level(0.5, 50)).toBeCloseTo(1, 9);
    expect(level(0.5, 25)).toBeCloseTo(0.5, 9);
  });

  it('a gust that starts on the tick of a re-roll reports both (D-080)', () => {
    const rng = createStream(42);
    const w = createWind(cfg, rng, planes);
    // Line the next re-roll up with the next gust's start (both on the coming tick).
    w.t = w.nextGust - 1;
    w.ticksToChange = 1;
    const r = tickWind(w, rng);
    expect(r).toEqual({ changed: true, gust: true });
    expect(w.gust).not.toBeNull();
  });
});
