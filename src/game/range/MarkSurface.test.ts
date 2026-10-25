// D-040 review (v1.5 CI): what one target's mark bake costs. A fake scene counts every texture
// made and destroyed and every render pass, so a course switch and the frames after it have a
// fixed, small budget: level 0 only at first, a smaller level only when the zoom shows it (once
// per bake), only new marks drawn, nothing at all on a frame without a new mark.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import type { Mark } from './rangeMarks';

vi.mock('phaser', () => ({
  Textures: { FilterMode: { LINEAR: 0 } },
  Renderer: { Events: { RESTORE_WEBGL: 'restorewebgl' } },
}));
const { bakeStats, MarkSurface, MARKS_PER_FRAME } = await import('./MarkSurface');

interface Counts {
  made: string[];
  destroyed: string[];
  renders: Record<string, number>;
  stamps: number;
}

/** A chainable no-op (Graphics, Image): every method returns the object itself. */
function chain(): object {
  const p: object = new Proxy(
    {},
    {
      get: () => () => p,
    },
  );
  return p;
}

function fakeScene(c: Counts): Phaser.Scene {
  const textures = {
    addDynamicTexture: (key: string, width: number, height: number) => {
      c.made.push(key);
      return {
        key,
        width,
        height,
        setFilter: () => undefined,
        clear: () => undefined,
        draw: () => undefined,
        stamp: () => {
          c.stamps++;
        },
        render: () => {
          c.renders[key] = (c.renders[key] ?? 0) + 1;
        },
        destroy: () => {
          c.destroyed.push(key);
        },
      };
    },
  };
  return {
    textures,
    make: { graphics: () => chain() },
    add: { image: () => chain() },
    renderer: { on: () => undefined, off: () => undefined },
  } as unknown as Phaser.Scene;
}

const SPEC = {
  width: 300,
  height: 400,
  centreX: 0.5,
  centreY: 0.6,
  r: 100,
  maxScreenScale: 18,
  look: 'steel' as const,
};
const mark = (i: number): Mark => ({ u: 0, v: 0, size: 0.05, seed: i, tick: i, visit: 1 });
const marks = (n: number): Mark[] => Array.from({ length: n }, (_, i) => mark(i));
const total = (c: Counts): number => Object.values(c.renders).reduce((a, b) => a + b, 0);

describe('MarkSurface bake cost (D-040 review)', () => {
  let c: Counts;
  beforeEach(() => {
    c = { made: [], destroyed: [], renders: {}, stamps: 0 };
  });

  it('a new target (a course switch) makes one texture and one render pass', () => {
    const before = bakeStats.renders;
    const s = new MarkSurface(fakeScene(c), SPEC, null);
    expect(c.made).toHaveLength(1);
    s.sync(marks(25), 1);
    expect(total(c)).toBe(1);
    expect(bakeStats.renders - before).toBe(1);
    expect(s.drawn).toBe(25);
    // 600 frames without a new mark: no work at all.
    for (let f = 0; f < 600; f++) {
      s.sync(marks(25), 1);
      s.pick(0.5);
    }
    // The zoom showed a smaller level: it and the ones above it were made and built once each.
    expect(s.level).toBeGreaterThan(0);
    expect(c.made).toHaveLength(s.level + 1);
    expect(total(c)).toBe(s.level + 1);
  });

  it('a hit re-bakes only level 0 and the level on screen, drawing only the new mark', () => {
    const s = new MarkSurface(fakeScene(c), SPEC, null);
    s.sync(marks(25), 1);
    s.pick(0.5);
    const shown = s.level;
    const r0 = total(c);
    const m0 = bakeStats.marks;
    s.sync(marks(26), 1);
    expect(total(c) - r0).toBe(1 + shown);
    expect(bakeStats.marks - m0).toBe(1);
    // Levels never shown are never made.
    expect(s.made).toBe(shown + 1);
  });

  it('a full re-bake of hundreds of marks spreads over frames (MARKS_PER_FRAME each)', () => {
    const s = new MarkSurface(fakeScene(c), SPEC, null);
    const many = marks(400);
    let frames = 0;
    while (s.drawn < many.length && frames < 100) {
      const m0 = bakeStats.marks;
      s.sync(many, 1);
      expect(bakeStats.marks - m0).toBeLessThanOrEqual(MARKS_PER_FRAME);
      frames++;
    }
    expect(s.drawn).toBe(400);
    expect(frames).toBe(Math.ceil(400 / MARKS_PER_FRAME));
    // A Repaint (new epoch, no marks) re-bakes once from scratch.
    const r0 = total(c);
    s.sync([], 2);
    expect(s.drawn).toBe(0);
    expect(total(c) - r0).toBe(1);
  });

  it('destroy frees every texture it made (no leak across switches)', () => {
    for (let i = 0; i < 20; i++) {
      const s = new MarkSurface(fakeScene(c), SPEC, null);
      s.sync(marks(25), 1);
      s.pick(i % 2 === 0 ? 0.3 : 4);
      s.destroy();
    }
    expect(c.destroyed.sort()).toEqual([...c.made].sort());
  });
});
