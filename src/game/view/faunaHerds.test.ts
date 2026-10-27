import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  drawOrder,
  FAUNA_HERDS,
  faunaIdle,
  herdLooks,
  lookHeight,
  placePart,
  frameName,
  lookOf,
  partBox,
  sheetOf,
  spaceHerd,
  type FaunaFrame,
  type FaunaFrames,
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
  rhythmSpread: 0.5,
  secondBite: 0.45,
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

describe('shared sheets (D-054)', () => {
  it('a herd that draws from another herd sheet uses only looks that sheet has', () => {
    for (const herds of Object.values(FAUNA_HERDS))
      for (const h of herds) {
        if (h.sheet === undefined) continue;
        const owner = herds.find((o) => o.key === h.sheet);
        expect(owner, h.key).toBeDefined();
        if (owner === undefined) continue;
        expect(owner.sheet).toBeUndefined();
        for (const look of herdLooks(h)) expect(herdLooks(owner)).toContain(look);
      }
  });
});

describe('spaceHerd with the packed sheets (D-054)', () => {
  const index = JSON.parse(
    readFileSync(
      join(import.meta.dirname, '..', '..', '..', 'public', 'assets', 'asset-index.json'),
      'utf8',
    ),
  ) as { images: Record<string, { frames?: FaunaFrames }> };
  it('no head crosses another animal, bodies overlap a quarter at most, feet stay on the ground line', () => {
    for (const herds of Object.values(FAUNA_HERDS))
      for (const h of herds) {
        const frames = index.images[sheetOf(h)]?.frames;
        expect(frames, h.key).toBeDefined();
        if (frames === undefined) continue;
        const of = (a: HerdAnimal, part: 'head' | 'body'): FaunaFrame | undefined =>
          frames[frameName(lookOf(a), part)];
        const spaced = spaceHerd(h.animals, of);
        expect(spaced.map((a) => a.dy)).toEqual(h.animals.map((a) => a.dy));
        expect(spaced.map((a) => a.facing)).toEqual(h.animals.map((a) => a.facing));
        const box = (a: HerdAnimal, p: 'head' | 'body') => {
          const f = of(a, p);
          return f === undefined ? null : partBox(a, f);
        };
        const ov = (x: ReturnType<typeof box>, y: ReturnType<typeof box>): number =>
          x === null || y === null
            ? 0
            : Math.min(
                Math.min(x.x1, y.x1) - Math.max(x.x0, y.x0),
                Math.min(x.y1, y.y1) - Math.max(x.y0, y.y0),
              );
        for (let i = 0; i < spaced.length; i++)
          for (let j = 0; j < spaced.length; j++) {
            const a = spaced[i];
            const b = spaced[j];
            if (i === j || a === undefined || b === undefined) continue;
            expect(
              ov(box(a, 'head'), box(b, 'head')),
              `${h.key} heads ${i}/${j}`,
            ).toBeLessThanOrEqual(0);
            expect(
              ov(box(a, 'head'), box(b, 'body')),
              `${h.key} head ${i} / body ${j}`,
            ).toBeLessThanOrEqual(0);
          }
      }
  });
});

describe('mirroring (D-054 review: a calf trunk floated beside its head)', () => {
  const index = JSON.parse(
    readFileSync(
      join(import.meta.dirname, '..', '..', '..', 'public', 'assets', 'asset-index.json'),
      'utf8',
    ),
  ) as { images: Record<string, { frames?: FaunaFrames }> };
  const touches = (a: { x0: number; x1: number; y0: number; y1: number }, b: typeof a): boolean =>
    a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
  it('every part of every look touches its body, facing either way', () => {
    let checked = 0;
    for (const [key, img] of Object.entries(index.images)) {
      if (!key.startsWith('fauna/') || img.frames === undefined) continue;
      const frames = img.frames;
      const looks = new Set(Object.keys(frames).map((n) => n.split('.').slice(0, 3).join('.')));
      for (const look of looks) {
        const [species, pose, variant] = look.split('.') as [
          HerdAnimal['species'],
          HerdAnimal['pose'],
          HerdAnimal['variant'],
        ];
        for (const facing of [1, -1] as const) {
          const a: HerdAnimal = { species, pose, variant, x: 100, dy: 0, facing, s: 0.95 };
          const body = frames[frameName(look, 'body')];
          expect(body, `${key} ${look}`).toBeDefined();
          if (body === undefined) continue;
          const bb = partBox(a, body);
          for (const part of ['tail', 'head', 'ear'] as const) {
            const f = frames[frameName(look, part)];
            if (f === undefined) continue;
            expect(touches(partBox(a, f), bb), `${key} ${look} ${part} facing ${facing}`).toBe(
              true,
            );
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
