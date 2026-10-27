import { describe, expect, it } from 'vitest';
import {
  drawOrder,
  FAUNA_HERDS,
  faunaIdle,
  herdLooks,
  lookHeight,
  placePart,
  type FaunaIdleTuning,
  type HerdAnimal,
} from './faunaHerds';

const T: FaunaIdleTuning = {
  grazeDeg: 5,
  grazeEverySec: 4,
  grazeSec: 1.2,
  alertDeg: 2,
  alertEverySec: 5,
  alertSec: 0.4,
  walkDeg: 1,
  walkSec: 1.2,
  tailDeg: 16,
  tailEverySec: 4,
  tailSec: 0.8,
  earFold: 0.12,
  earSec: 3,
  swayDeg: 2,
  swaySec: 5,
  calm: 0.35,
};
const all = Object.values(FAUNA_HERDS).flat();

describe('far herds (D-054)', () => {
  it('every animal stands on its herd ground line (feet within ±8 px of y)', () => {
    for (const h of all)
      for (const a of h.animals) {
        expect(Math.abs(a.dy), `${h.key} ${a.species} at ${a.x}`).toBeLessThanOrEqual(8);
        expect(a.s).toBeGreaterThan(0.85);
        expect(a.s).toBeLessThanOrEqual(1);
      }
  });

  it('a body part keeps its feet on the ground line whatever the facing and size', () => {
    const body = [10, 20, 100, 80, 50, 75, 0, 0] as const;
    for (const facing of [1, -1] as const)
      for (const s of [1, 0.95]) {
        const a: HerdAnimal = {
          species: 'zebra',
          pose: 'graze',
          variant: 'm',
          x: 40,
          dy: 3,
          facing,
          s,
        };
        const p = placePart(a, body);
        expect(p.y).toBe(3);
        expect(p.x).toBe(40);
        expect(p.sx).toBe(facing * s);
      }
  });

  it('a head pivot mirrors with the facing', () => {
    const head = [0, 0, 40, 40, 5, 30, 20, -60] as const;
    const r = placePart(
      { species: 'zebra', pose: 'alert', variant: 'm', x: 0, dy: 0, facing: 1, s: 1 },
      head,
    );
    const l = placePart(
      { species: 'zebra', pose: 'alert', variant: 'm', x: 0, dy: 0, facing: -1, s: 1 },
      head,
    );
    expect(r.x).toBe(20);
    expect(l.x).toBe(-20);
    expect(r.y).toBe(-60);
  });

  it('herds have young ones, both facings and at least two poses', () => {
    for (const h of all) {
      if (h.animals.length < 3) continue;
      expect(new Set(h.animals.map((a) => a.pose)).size, h.key).toBeGreaterThanOrEqual(2);
      expect(new Set(h.animals.map((a) => a.facing)).size, h.key).toBe(2);
    }
    expect(all.filter((h) => h.animals.some((a) => a.variant === 'y')).length).toBeGreaterThan(
      all.length / 2,
    );
  });

  it('draws back to front, and lists each look once', () => {
    for (const h of all) {
      const o = drawOrder(h.animals);
      for (let i = 1; i < o.length; i++) expect((o[i]?.dy ?? 0) >= (o[i - 1]?.dy ?? 0)).toBe(true);
      expect(new Set(herdLooks(h)).size).toBe(herdLooks(h).length);
    }
  });

  it('sizes from real heights: a far zebra stands at its D-049 target', () => {
    // Far plane: 78.9 px per metre (docs/balance/perspective.md).
    expect(lookHeight('zebra', 'm', 78.9)).toBeCloseTo(106.5, 0);
    expect(lookHeight('zebra', 'y', 78.9)).toBeLessThan(80);
  });
});

describe('faunaIdle (D-054)', () => {
  const zebra = { species: 'zebra', pose: 'graze', x: 10, dy: 2 } as const;
  it('is a pure function of the tick (a held frame holds still, a replay repeats)', () => {
    for (const tick of [0, 61, 600, 12345]) {
      expect(faunaIdle(tick, zebra, T, false, 60)).toEqual(faunaIdle(tick, zebra, T, false, 60));
    }
  });

  it('moves over time, within its amplitudes', () => {
    const heads = new Set<number>();
    for (let t = 0; t < 60 * 30; t += 7) {
      const m = faunaIdle(t, zebra, T, false, 60);
      heads.add(Math.round(m.head * 100));
      expect(Math.abs(m.head)).toBeLessThanOrEqual(T.grazeDeg * 1.5);
      expect(Math.abs(m.tail)).toBeLessThanOrEqual(T.tailDeg);
      expect(m.ear).toBe(1);
    }
    expect(heads.size).toBeGreaterThan(5);
  });

  it('reduce motion is calmer, never off', () => {
    let full = 0;
    let calm = 0;
    for (let t = 0; t < 60 * 30; t += 3) {
      full += Math.abs(faunaIdle(t, zebra, T, false, 60).head);
      calm += Math.abs(faunaIdle(t, zebra, T, true, 60).head);
    }
    expect(calm).toBeGreaterThan(0);
    expect(calm).toBeCloseTo(full * T.calm, 3);
  });

  it('elephants fan their ears; herd mates keep their own rhythm', () => {
    const el = { species: 'elephant', pose: 'alert', x: 0, dy: 0 } as const;
    const ears = [0, 30, 60, 90].map((t) => faunaIdle(t, el, T, false, 60).ear);
    expect(Math.min(...ears)).toBeGreaterThanOrEqual(1 - T.earFold);
    expect(new Set(ears).size).toBeGreaterThan(1);
    const other = { ...zebra, x: 140 };
    const differ = [0, 120, 240, 360, 480].some(
      (t) => faunaIdle(t, zebra, T, false, 60).head !== faunaIdle(t, other, T, false, 60).head,
    );
    expect(differ).toBe(true);
  });
});
