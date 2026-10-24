import { describe, expect, it } from 'vitest';
import { coverOver, intersect, tileProfile, uncoveredSpan, zoomedViewRect } from './scopeCull';

describe('scopeCull (#56)', () => {
  it('maps the zoomed screen back to the unzoomed rect it shows', () => {
    const r = zoomedViewRect(4, 960, 540, 1920, 1080, null, 0);
    expect(r).toEqual({ x0: 720, y0: 405, x1: 1200, y1: 675 });
    // A scope square of 1000 px around the screen centre: a quarter of that, unzoomed.
    const c = zoomedViewRect(4, 960, 540, 1920, 1080, { x0: 460, y0: 40, x1: 1460, y1: 1040 }, 0);
    expect(c).toEqual({ x0: 835, y0: 415, x1: 1085, y1: 665 });
    // The clip never reaches past the screen; the margin grows it (zoomed px).
    const m = zoomedViewRect(2, 960, 540, 1920, 1080, { x0: -50, y0: 0, x1: 1920, y1: 1080 }, 40);
    expect(m.x0).toBe(960 + (-40 - 960) / 2);
  });

  it('finds the uncovered span of rows', () => {
    expect(uncoveredSpan(0, 100, [])).toEqual({ y0: 0, y1: 100 });
    expect(uncoveredSpan(0, 100, [{ y0: 60, y1: 200 }])).toEqual({ y0: 0, y1: 60 });
    expect(uncoveredSpan(0, 100, [{ y0: -5, y1: 30 }])).toEqual({ y0: 30, y1: 100 });
    // Chained bands from both sides.
    expect(
      uncoveredSpan(0, 100, [
        { y0: 0, y1: 20 },
        { y0: 20, y1: 40 },
        { y0: 90, y1: 100 },
        { y0: 70, y1: 90 },
      ]),
    ).toEqual({ y0: 40, y1: 70 });
    // A gap in the middle stays inside the span.
    expect(uncoveredSpan(0, 100, [{ y0: 40, y1: 60 }])).toEqual({ y0: 0, y1: 100 });
    expect(uncoveredSpan(10, 50, [{ y0: 0, y1: 50 }])).toBeNull();
    expect(uncoveredSpan(50, 50, [])).toBeNull();
  });

  it('a layer covers only the rows every bucket in range is opaque in', () => {
    const solid = {
      bucket: 256,
      rows: [[10, 100], [20, 90], null, [0, 50]] as ([number, number] | null)[],
    };
    const a = tileProfile(solid, -300, 500, 1, 0, 2);
    const b = tileProfile(solid, -300 + 512, 500, 1, 2, 2);
    expect(coverOver([a, b], -300, -100)).toEqual({ y0: 510, y1: 600 });
    expect(coverOver([a, b], -100, 100)).toEqual({ y0: 520, y1: 590 });
    // A transparent bucket in range: no cover.
    expect(coverOver([a, b], 100, 300)).toBeNull();
    // Past the profiled art: no cover.
    expect(coverOver([a, b], 600, 900)).toBeNull();
    expect(coverOver([a], 200, 260)).toBeNull();
    // Disjoint rows: no cover.
    const c = tileProfile(
      {
        bucket: 10,
        rows: [
          [0, 10],
          [20, 30],
        ],
      },
      0,
      0,
      1,
      0,
      2,
    );
    expect(coverOver([c], 0, 20)).toBeNull();
    // Stretched (low-tier merge): buckets widen with the scale.
    const s = tileProfile({ bucket: 10, rows: [[0, 10], null] }, 0, 0, 2, 0, 2);
    expect(coverOver([s], 0, 19)).toEqual({ y0: 0, y1: 10 });
    expect(coverOver([s], 0, 21)).toBeNull();
  });

  it('intersects rects', () => {
    expect(intersect({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 5, y0: 5, x1: 20, y1: 20 })).toEqual({
      x0: 5,
      y0: 5,
      x1: 10,
      y1: 10,
    });
    expect(intersect({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 10, y0: 0, x1: 20, y1: 10 })).toBe(
      null,
    );
  });
});
