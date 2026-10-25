// Skietbaan gongs (D-040, after D-037) interim Skietbaan art, semi-realistic per D-035 (no dark
// contours, light from the upper left), drawn at 2× (PLATE_DISC_R = 200 texture px for a
// plateRadiusPx-100 plate) so the view can scale it per plane and keep it crisp in a scope.
// - range/plate: a round steel gong hanging from two short chains (it swings about the hang
//   point, the texture origin). Freshly painted every session: an even off-white face, softly lit
//   from the upper left, no baked hit marks (real hits are drawn by the view, PlateDraw.ts); a
//   clean steel rim with a small bevel (lit upper left, shaded lower right) and clean chains.
// - range/plate_frame: the two posts and the crossbar the plate hangs from (weathered
//   camelthorn timber at the v1.4 quality bar: grain, a lit and a shaded side, bolts).
// Rendered like the shared sprites (renderSprite), group "range" (lazy).
import {
  FRAME_HALF,
  FRAME_LEG_BELOW,
  FRAME_POST,
  FRAME_TOP_PX,
  PLATE_CY,
  PLATE_DISC_R,
  PLATE_FRAME_ORIGIN,
  PLATE_FRAME_TEX,
  PLATE_FRAME_TEX_SIZE,
  PLATE_ORIGIN,
  PLATE_TEX,
  PLATE_TEX_SIZE,
} from '../../src/game/range/rangeAssets';
import { el, g, r2 } from './svg';
import type { SpriteSpec } from './sprites';

const R = PLATE_DISC_R;
const CY = PLATE_CY;

function radial(id: string, cx: number, cy: number, r: number, stops: [number, string][]): string {
  return el(
    'radialGradient',
    { id, gradientUnits: 'userSpaceOnUse', cx, cy, r },
    ...stops.map(([o, c]) => el('stop', { offset: o, 'stop-color': c })),
  );
}

function linear(
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stops: [number, string][],
): string {
  return el(
    'linearGradient',
    { id, gradientUnits: 'userSpaceOnUse', x1, y1, x2, y2 },
    ...stops.map(([o, c]) => el('stop', { offset: o, 'stop-color': c })),
  );
}

/** An arc of the circle (0, CY, r) from angle a0 to a1 (radians, 0 = right, clockwise). */
function arc(r: number, a0: number, a1: number): string {
  const p = (a: number): string => `${r2(Math.cos(a) * r)} ${r2(CY + Math.sin(a) * r)}`;
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  return `M${p(a0)}A${r2(r)} ${r2(r)} 0 ${String(large)} 1 ${p(a1)}`;
}

/** One chain link: a front-on ring or a side-on bar, steel with a highlight. */
function link(x: number, y: number, a: number, front: boolean): string {
  const t = `translate(${r2(x)} ${r2(y)}) rotate(${r2((a * 180) / Math.PI)})`;
  if (front)
    return g(
      { transform: t },
      el('ellipse', { rx: 4.2, ry: 8, fill: 'none', stroke: '#6E767E', 'stroke-width': 3.4 }),
      el('path', {
        d: 'M-3.6 -3A4.2 8 0 0 1 0 -7.6',
        fill: 'none',
        stroke: '#D9DEE2',
        'stroke-width': 1.4,
      }),
    );
  return g(
    { transform: t },
    el('rect', { x: -1.7, y: -8.5, width: 3.4, height: 17, rx: 1.7, fill: '#5E656C' }),
    el('rect', { x: -1.2, y: -7.5, width: 1.1, height: 14, rx: 0.5, fill: '#B9C0C6' }),
  );
}

function chains(): string {
  const out: string[] = [];
  const top = 4;
  const bottom = CY - R * 0.86;
  for (const side of [-1, 1]) {
    const x0 = side * R * 0.15;
    const x1 = side * R * 0.42;
    const len = Math.hypot(x1 - x0, bottom - top);
    const n = Math.max(3, Math.round(len / 13));
    const a = Math.atan2(x1 - x0, bottom - top) * -1;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      out.push(link(x0 + (x1 - x0) * t, top + (bottom - top) * t, a, k % 2 === 0));
    }
  }
  return g({}, ...out);
}

function plate(): string {
  const tabX = R * 0.42;
  return g(
    {},
    el(
      'defs',
      {},
      // The steel rim: mild steel, lit upper left.
      radial('steel', -R * 0.4, CY - R * 0.45, R * 1.6, [
        [0, '#C9CFD4'],
        [0.5, '#8E969D'],
        [1, '#4D535A'],
      ]),
      // The painted face: an even off-white, a soft light from the upper left, never dirty.
      radial('paint', -R * 0.32, CY - R * 0.36, R * 1.35, [
        [0, '#FBFAF5'],
        [0.6, '#F0EEE7'],
        [1, '#DCD9D0'],
      ]),
      linear('bevel', -R * 0.7, CY - R * 0.7, R * 0.7, CY + R * 0.7, [
        [0, '#E8ECEF'],
        [0.5, '#9AA2A9'],
        [1, '#3E444A'],
      ]),
    ),
    chains(),
    // Hanger tabs welded to the rim, each with a bolt.
    ...[-1, 1].map((s) =>
      g(
        {},
        el('rect', {
          x: s * tabX - 7,
          y: CY - R * 0.98,
          width: 14,
          height: 20,
          rx: 3,
          fill: '#7A828A',
        }),
        el('circle', { cx: s * tabX, cy: CY - R * 0.86, r: 5, fill: '#5A6168' }),
        el('circle', { cx: s * tabX - 1.4, cy: CY - R * 0.86 - 1.4, r: 1.8, fill: '#C5CBD0' }),
      ),
    ),
    // Rim: an outer bevel ring (lit upper left, shaded lower right), the flat steel, then an
    // inner lip the other way round (light falls into the step), and the painted face.
    el('circle', { cx: 0, cy: CY, r: R, fill: 'url(#bevel)' }),
    el('circle', { cx: 0, cy: CY, r: R * 0.97, fill: 'url(#steel)' }),
    el('path', {
      d: arc(R * 0.955, Math.PI * 0.95, Math.PI * 1.6),
      fill: 'none',
      stroke: '#EEF1F3',
      'stroke-width': 2.4,
      opacity: 0.85,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: arc(R * 0.955, Math.PI * -0.05, Math.PI * 0.6),
      fill: 'none',
      stroke: '#33393F',
      'stroke-width': 3,
      opacity: 0.55,
      'stroke-linecap': 'round',
    }),
    el('circle', { cx: 0, cy: CY, r: R * 0.915, fill: '#596067' }),
    el('path', {
      d: arc(R * 0.913, Math.PI * -0.1, Math.PI * 0.65),
      fill: 'none',
      stroke: '#D7DCE0',
      'stroke-width': 2,
      opacity: 0.8,
    }),
    el('circle', { cx: 0, cy: CY, r: R * 0.9, fill: 'url(#paint)' }),
    // A faint sheen on the fresh paint (upper left).
    el('ellipse', {
      cx: -R * 0.34,
      cy: CY - R * 0.38,
      rx: R * 0.32,
      ry: R * 0.2,
      fill: '#FFFFFF',
      opacity: 0.22,
      transform: `rotate(-35 ${r2(-R * 0.34)} ${r2(CY - R * 0.38)})`,
    }),
  );
}

/** Weathered timber: a post of width w from (x, y0) down to y1, lit on its left side. */
function post(p: { rnd: () => number }, id: string, x: number, y0: number, y1: number, w: number) {
  const grain: string[] = [];
  for (let k = 0; k < 5; k++) {
    const gx = x - w / 2 + w * (0.16 + 0.17 * k) + (p.rnd() - 0.5) * 2;
    let d = `M${r2(gx)} ${r2(y0 + 4)}`;
    for (let y = y0 + 4; y < y1 - 4; y += 26) {
      const dx = (p.rnd() - 0.5) * 2.4;
      d += `Q${r2(gx + dx * 2)} ${r2(y + 13)} ${r2(gx + dx)} ${r2(Math.min(y + 26, y1 - 4))}`;
    }
    grain.push(
      el('path', {
        d,
        fill: 'none',
        stroke: k === 0 ? '#C29A6C' : '#4A321E',
        'stroke-width': k === 0 ? 1 : 0.9 + p.rnd() * 0.6,
        opacity: k === 0 ? 0.6 : 0.5,
      }),
    );
  }
  // A knot or two, and a cracked top.
  const knots: string[] = [];
  for (let k = 0; k < 2; k++) {
    const ky = y0 + (y1 - y0) * (0.3 + 0.35 * k + p.rnd() * 0.1);
    const kx = x + (p.rnd() - 0.5) * w * 0.4;
    knots.push(
      el('ellipse', { cx: kx, cy: ky, rx: w * 0.12, ry: w * 0.2, fill: '#3F2A18', opacity: 0.7 }),
      el('ellipse', {
        cx: kx - 0.6,
        cy: ky - 0.8,
        rx: w * 0.05,
        ry: w * 0.1,
        fill: '#8E6A45',
        opacity: 0.7,
      }),
    );
  }
  return g(
    {},
    el(
      'defs',
      {},
      linear(id, x - w / 2, 0, x + w / 2, 0, [
        [0, '#B08559'],
        [0.35, '#8A6440'],
        [0.75, '#664629'],
        [1, '#432C19'],
      ]),
    ),
    el('rect', { x: x - w / 2, y: y0, width: w, height: y1 - y0, rx: 2, fill: `url(#${id})` }),
    ...grain,
    ...knots,
    // The foot sits in the ground: a soft dark band where it goes in.
    el('rect', {
      x: x - w / 2,
      y: y1 - 7,
      width: w,
      height: 7,
      fill: '#2E1F12',
      opacity: 0.45,
    }),
  );
}

function bolt(x: number, y: number, r: number): string {
  return g(
    {},
    el('circle', { cx: x, cy: y, r: r * 1.5, fill: '#5C5048', opacity: 0.55 }),
    el('circle', { cx: x, cy: y, r, fill: '#6F767C' }),
    el('circle', { cx: x - r * 0.3, cy: y - r * 0.3, r: r * 0.45, fill: '#C9CED2' }),
  );
}

function frame(p: { rnd: () => number }): string {
  const half = R * FRAME_HALF;
  const w = R * FRAME_POST;
  const ground = CY + R * FRAME_LEG_BELOW;
  const barH = w * 1.1;
  const barY = -FRAME_TOP_PX;
  const barX0 = -half - w * 0.8;
  const barX1 = half + w * 0.8;
  const grain: string[] = [];
  for (let k = 0; k < 4; k++) {
    const gy = barY + barH * (0.2 + 0.2 * k);
    let d = `M${r2(barX0 + 4)} ${r2(gy)}`;
    for (let x = barX0 + 4; x < barX1 - 4; x += 30) {
      const dy = (p.rnd() - 0.5) * 1.6;
      d += `Q${r2(x + 15)} ${r2(gy + dy * 2)} ${r2(Math.min(x + 30, barX1 - 4))} ${r2(gy + dy)}`;
    }
    grain.push(
      el('path', {
        d,
        fill: 'none',
        stroke: k === 0 ? '#C9A274' : '#4A321E',
        'stroke-width': 0.9,
        opacity: 0.55,
      }),
    );
  }
  return g(
    {},
    el(
      'defs',
      {},
      // The crossbar: lit along its top, shaded underneath.
      linear('bar', 0, barY, 0, barY + barH, [
        [0, '#B78C5E'],
        [0.4, '#8A6440'],
        [1, '#4B321D'],
      ]),
    ),
    post(p, 'postL', -half, barY + barH * 0.5, ground, w),
    post(p, 'postR', half, barY + barH * 0.5, ground, w),
    el('rect', { x: barX0, y: barY, width: barX1 - barX0, height: barH, rx: 2, fill: 'url(#bar)' }),
    ...grain,
    // The bar's shadow on the posts, and the bolts that hold it.
    ...[-half, half].map((x) =>
      el('rect', {
        x: x - w / 2,
        y: barY + barH,
        width: w,
        height: 5,
        fill: '#2E1F12',
        opacity: 0.4,
      }),
    ),
    bolt(-half - w * 0.2, barY + barH * 0.5, 3.2),
    bolt(-half + w * 0.22, barY + barH * 0.5, 3.2),
    bolt(half - w * 0.22, barY + barH * 0.5, 3.2),
    bolt(half + w * 0.2, barY + barH * 0.5, 3.2),
    // The eye bolts the chains hang from (the hang point is (0, 0)).
    ...[-1, 1].map((s) =>
      g(
        {},
        el('rect', {
          x: s * R * 0.15 - 2,
          y: barY + barH - 3,
          width: 4,
          height: 6,
          fill: '#5E656C',
        }),
        el('circle', {
          cx: s * R * 0.15,
          cy: 2,
          r: 4.5,
          fill: 'none',
          stroke: '#6E767E',
          'stroke-width': 2.6,
        }),
      ),
    ),
  );
}

/** A sprite with its own size and origin (the plate and its frame differ). */
export interface RangeSpriteSpec extends SpriteSpec {
  readonly size: { readonly width: number; readonly height: number };
  readonly origin: { readonly x: number; readonly y: number };
}

export const RANGE_SPRITES: readonly RangeSpriteSpec[] = [
  { key: PLATE_TEX, wobble: 0, draw: plate, size: PLATE_TEX_SIZE, origin: PLATE_ORIGIN },
  {
    key: PLATE_FRAME_TEX,
    wobble: 0,
    draw: frame,
    size: PLATE_FRAME_TEX_SIZE,
    origin: PLATE_FRAME_ORIGIN,
  },
];
