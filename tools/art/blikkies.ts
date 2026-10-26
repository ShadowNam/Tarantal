// v1.8 (D-050): interim art for Blikkies — one small sheet (layout in
// src/game/view/cans/canSheet.ts), drawn in the D-035 semi-realistic style of the v1.6 camelthorn:
// form from gradients and layered tones, a warm-dark broken edge instead of a cartoon outline,
// small highlights where light catches. Light comes from the upper left (art bible §1).
// - Four tins, all invented (no real brands or logos): a food tin with a farm-stall paper label
//   (beans on a cream band), a small paint tin with a wire handle and a green drip, a rusty
//   bully-beef-style tin with its key strip, and a slim cooldrink can with a made-up sun-and-wave
//   label. Each has a lit side and a shaded side and rolled rims that catch the light; each has a
//   motion-blurred twin for a fast spin.
// - A dent (a shot pellet: a dark crescent with a bright lip) and a hole (a bullet: a dark hole
//   with a torn, bright rim); a soft ground shadow.
// - Fence posts: a weathered wooden post, an iron dropper (Y-standard), a crooked kraal pole.
// Coordinates: design px; every frame is drawn round its origin (canSheet.ts).
import {
  CAN_SHEET_H,
  CAN_SHEET_W,
  canFrames,
  type CanFrame,
} from '../../src/game/view/cans/canSheet';
import type { CanType } from '../../src/content/schemas';
import type { Rgba } from '../assets/image';
import { renderSvg } from './raster';
import { el, ellipseD, g, polyD, r2, svgDoc } from './svg';

/** The interim sheet is drawn at 2×: near cans are seen close up. */
export const CAN_MASTER = 2;

const INK = '#2A1C14';

let seq = 0;
const uid = (p: string): string => `${p}${String(seq++)}`;

/** A horizontal cylinder shade: lit on the left, a hot highlight, shaded on the right. */
function cylGrad(id: string, base: string, lit: string, shade: string, hi = '#FFFFFF'): string {
  return el(
    'linearGradient',
    { id, x1: 0, y1: 0, x2: 1, y2: 0 },
    el('stop', { offset: 0, 'stop-color': shade }),
    el('stop', { offset: 0.14, 'stop-color': lit }),
    el('stop', { offset: 0.26, 'stop-color': hi, 'stop-opacity': 0.9 }),
    el('stop', { offset: 0.34, 'stop-color': lit }),
    el('stop', { offset: 0.62, 'stop-color': base }),
    el('stop', { offset: 1, 'stop-color': shade }),
  );
}

interface Tin {
  readonly w: number;
  readonly h: number;
  readonly metal: [string, string, string];
}

const TINS: Readonly<Record<CanType, Tin>> = {
  food: { w: 38, h: 58, metal: ['#B9B6AE', '#E4E2DA', '#6E6A62'] },
  paint: { w: 42, h: 54, metal: ['#A2A7AA', '#D8DCDE', '#5C6266'] },
  bully: { w: 34, h: 48, metal: ['#9A5A32', '#C9884E', '#5A2E18'] },
  cooldrink: { w: 30, h: 56, metal: ['#B8BDC2', '#E8ECEF', '#6A7076'] },
};

/** A rolled rim band across the tin at y (catches the light). */
function rim(w: number, y: number, t: Tin, defs: string[]): string {
  const id = uid('rim');
  defs.push(cylGrad(id, t.metal[0], t.metal[1], t.metal[2]));
  return g(
    {},
    el('rect', {
      x: -w / 2 - 0.6,
      y: y - 1.8,
      width: w + 1.2,
      height: 3.6,
      rx: 1.4,
      fill: `url(#${id})`,
    }),
    el('path', {
      d: `M${r2(-w / 2)} ${r2(y + 1.6)}h${r2(w)}`,
      stroke: INK,
      'stroke-opacity': 0.35,
      'stroke-width': 0.6,
    }),
  );
}

function tin(type: CanType, blur: boolean): string {
  const t = TINS[type];
  const { w, h } = t;
  const defs: string[] = [];
  const body = uid('body');
  defs.push(cylGrad(body, t.metal[0], t.metal[1], t.metal[2]));
  const clip = uid('clip');
  const parts: string[] = [];
  const outline = el('rect', {
    x: -w / 2,
    y: -h / 2,
    width: w,
    height: h,
    rx: type === 'bully' ? 3 : 2.2,
  });
  parts.push(el('clipPath', { id: clip }, outline));
  // The warm-dark broken edge, then the metal.
  parts.push(
    el('rect', {
      x: -w / 2 - 0.8,
      y: -h / 2 - 0.8,
      width: w + 1.6,
      height: h + 1.6,
      rx: 3,
      fill: INK,
      'fill-opacity': 0.75,
    }),
  );
  parts.push(
    el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 2.2, fill: `url(#${body})` }),
  );
  const inside: string[] = [];
  if (type === 'food') {
    // The farm-stall label: a cream paper band, a red stripe, three beans in a green pod.
    const paper = uid('paper');
    defs.push(cylGrad(paper, '#E8D9B0', '#F6ECCF', '#9A8A64', '#FFF8E6'));
    inside.push(
      el('rect', { x: -w / 2, y: -h * 0.3, width: w, height: h * 0.6, fill: `url(#${paper})` }),
    );
    inside.push(
      el('rect', {
        x: -w / 2,
        y: -h * 0.3,
        width: w,
        height: 4,
        fill: '#B23A26',
        'fill-opacity': 0.9,
      }),
    );
    inside.push(
      el('rect', {
        x: -w / 2,
        y: h * 0.3 - 4,
        width: w,
        height: 4,
        fill: '#B23A26',
        'fill-opacity': 0.9,
      }),
    );
    inside.push(el('path', { d: ellipseD(-2, 2, 9, 5.5), fill: '#5E8A2E' }));
    for (const bx of [-7, -2, 3])
      inside.push(el('path', { d: ellipseD(bx, 2, 2.6, 3.2), fill: '#C9A050' }));
    inside.push(
      el('path', {
        d: `M${r2(-w / 2 + 3)} -6h${r2(w - 6)}`,
        stroke: '#7A2A1A',
        'stroke-width': 1.2,
        'stroke-opacity': 0.6,
      }),
    );
    // The label's shading follows the tin: a soft dark band on the right.
    inside.push(
      el('rect', {
        x: w * 0.18,
        y: -h * 0.3,
        width: w * 0.32,
        height: h * 0.6,
        fill: INK,
        'fill-opacity': 0.18,
      }),
    );
  } else if (type === 'paint') {
    // A dried green drip down the side, and the lid's groove.
    inside.push(
      el('path', { d: `M${r2(-w / 2)} ${r2(-h / 2 + 4)}h${r2(w)}v4h${r2(-w)}z`, fill: '#3E7A44' }),
    );
    inside.push(
      el('path', { d: 'M-6 -19q1 9 0 14q-1 3 2 3q2 0 1 -4q-1 -6 1 -13z', fill: '#3E7A44' }),
    );
    inside.push(el('path', { d: 'M8 -19q1 5 0 8q0 2 2 2q1 -2 0 -10z', fill: '#3E7A44' }));
    inside.push(
      el('rect', { x: -w / 2, y: -2, width: w, height: 14, fill: '#E6E0CC', 'fill-opacity': 0.55 }),
    );
  } else if (type === 'bully') {
    // Rust: blotches and streaks, the key strip near the top.
    for (const [x, y, rx, ry] of [
      [-6, -10, 6, 4],
      [7, 6, 5, 7],
      [-4, 14, 7, 3.5],
      [9, -16, 3, 3],
    ] as const)
      inside.push(el('path', { d: ellipseD(x, y, rx, ry), fill: '#6A2E12', 'fill-opacity': 0.55 }));
    for (const [x, y] of [
      [-10, 2],
      [2, -4],
      [12, 14],
    ] as const)
      inside.push(
        el('path', { d: ellipseD(x, y, 2.5, 1.8), fill: '#E0A060', 'fill-opacity': 0.7 }),
      );
    inside.push(
      el('rect', {
        x: -w / 2,
        y: -h / 2 + 6,
        width: w,
        height: 3,
        fill: '#3E1E0E',
        'fill-opacity': 0.6,
      }),
    );
  } else {
    // The cooldrink: red with a white wave and a yellow sun (an invented label).
    const red = uid('red');
    defs.push(cylGrad(red, '#B8261E', '#E2483A', '#5E100C', '#FFD6CC'));
    inside.push(
      el('rect', { x: -w / 2, y: -h / 2 + 5, width: w, height: h - 10, fill: `url(#${red})` }),
    );
    inside.push(
      el('path', {
        d: 'M-15 3C-8 -3 -3 9 0 3S8 -3 15 3V9C8 3 3 15 0 9S-8 3 -15 9Z',
        fill: '#F4F0E8',
        'fill-opacity': 0.92,
      }),
    );
    inside.push(el('path', { d: ellipseD(-3, -10, 5, 5), fill: '#F2C230' }));
    inside.push(
      el('rect', {
        x: w * 0.16,
        y: -h / 2 + 5,
        width: w * 0.34,
        height: h - 10,
        fill: INK,
        'fill-opacity': 0.16,
      }),
    );
  }
  parts.push(g({ 'clip-path': `url(#${clip})` }, ...inside));
  parts.push(rim(w, -h / 2 + 1.8, t, defs));
  parts.push(rim(w, h / 2 - 1.8, t, defs));
  if (type === 'paint') {
    // The wire handle (bail) over the top.
    parts.push(
      el('path', {
        d: `M${r2(-w / 2 + 2)} ${r2(-h / 2 + 6)}q${r2(w / 2 - 2)} -12 ${r2(w - 4)} 0`,
        fill: 'none',
        stroke: '#4C4E50',
        'stroke-width': 1.2,
      }),
    );
  }
  // A small specular glint on the lit side.
  parts.push(
    el('path', {
      d: ellipseD(-w * 0.24, -h * 0.34, 1.4, 3.2),
      fill: '#FFFFFF',
      'fill-opacity': 0.75,
    }),
  );
  const art = g({}, ...parts);
  if (!blur) return g({}, el('defs', {}, ...defs), art);
  const f = uid('blur');
  defs.push(
    el(
      'filter',
      { id: f, x: -0.3, y: -0.3, width: 1.6, height: 1.6 },
      el('feGaussianBlur', { stdDeviation: '2.2 1.4' }),
    ),
  );
  return g({}, el('defs', {}, ...defs), g({ filter: `url(#${f})`, opacity: 0.85 }, art));
}

function post(kind: 'wood' | 'dropper' | 'kraal', h: number): string {
  const defs: string[] = [];
  const id = uid('post');
  if (kind === 'wood') {
    defs.push(cylGrad(id, '#7E6A52', '#A8927A', '#4A3A2A', '#C4B49C'));
    return g(
      {},
      el('defs', {}, ...defs),
      el('path', {
        d: polyD([
          [-9.5, 0],
          [-9, -h + 3],
          [-6, -h],
          [7, -h + 1],
          [9.5, -h + 4],
          [9.5, 0],
        ]),
        fill: INK,
        'fill-opacity': 0.7,
      }),
      el('path', {
        d: polyD([
          [-8.5, 0],
          [-8, -h + 4],
          [-5, -h + 1],
          [6.5, -h + 2],
          [8.5, -h + 5],
          [8.5, 0],
        ]),
        fill: `url(#${id})`,
      }),
      // Grain and a split, a darker weathered top.
      el('path', {
        d: `M-3 -6v${r2(-h + 18)}M3 -10v${r2(-h + 30)}M-1 ${r2(-h * 0.5)}v${r2(-h * 0.3)}`,
        stroke: '#4A3A2A',
        'stroke-width': 0.8,
        'stroke-opacity': 0.6,
      }),
      el('rect', { x: -8, y: -h + 1, width: 16, height: 6, fill: '#3E3024', 'fill-opacity': 0.5 }),
    );
  }
  if (kind === 'dropper') {
    defs.push(cylGrad(id, '#5A5E60', '#8A8E90', '#2E3032', '#B0B4B6'));
    return g(
      {},
      el('defs', {}, ...defs),
      el('rect', { x: -5.5, y: -h, width: 11, height: h, fill: INK, 'fill-opacity': 0.7 }),
      el('rect', { x: -4.5, y: -h + 1, width: 9, height: h - 1, fill: `url(#${id})` }),
      // The Y-standard's centre rib, wire holes and rust.
      el('path', { d: `M0 0v${r2(-h + 2)}`, stroke: '#2E3032', 'stroke-width': 1.2 }),
      ...[0.2, 0.42, 0.62, 0.8].map((k) =>
        el('path', { d: ellipseD(0, -h * k, 1.2, 1.6), fill: '#1A1A1A' }),
      ),
      el('path', { d: ellipseD(1, -h * 0.3, 3, 8), fill: '#8A4A22', 'fill-opacity': 0.45 }),
    );
  }
  defs.push(cylGrad(id, '#6E5638', '#947A58', '#3E2E1C', '#B09A78'));
  return g(
    {},
    el('defs', {}, ...defs),
    el('path', {
      d: `M-11 0q-2 ${r2(-h * 0.5)} 1 ${r2(-h + 2)}l9 -2q4 ${r2(h * 0.5)} 2 ${r2(h)}z`,
      fill: INK,
      'fill-opacity': 0.7,
    }),
    el('path', {
      d: `M-10 0q-2 ${r2(-h * 0.5)} 1 ${r2(-h + 3)}l8 -1.5q3 ${r2(h * 0.5)} 1 ${r2(h - 1.5)}z`,
      fill: `url(#${id})`,
    }),
    // Bark knots and the lashing of a rail.
    el('path', { d: ellipseD(-4, -h * 0.35, 2.5, 3.5), fill: '#3E2E1C', 'fill-opacity': 0.7 }),
    el('path', { d: ellipseD(-6, -h * 0.7, 2, 3), fill: '#3E2E1C', 'fill-opacity': 0.6 }),
    el('path', {
      d: `M-11 ${r2(-h * 0.78)}l12 3M-11 ${r2(-h * 0.74)}l12 3`,
      stroke: '#C2A878',
      'stroke-width': 1,
    }),
  );
}

function frameArt(name: CanFrame, h: number): string {
  switch (name) {
    case 'can_food':
    case 'can_paint':
    case 'can_bully':
    case 'can_cooldrink':
      return tin(name.slice(4) as CanType, false);
    case 'can_food_blur':
    case 'can_paint_blur':
    case 'can_bully_blur':
    case 'can_cooldrink_blur':
      return tin(name.slice(4, -5) as CanType, true);
    case 'post_wood':
      return post('wood', h);
    case 'post_dropper':
      return post('dropper', h);
    case 'post_kraal':
      return post('kraal', h);
    case 'shadow': {
      const id = uid('sh');
      return g(
        {},
        el(
          'defs',
          {},
          el(
            'radialGradient',
            { id },
            el('stop', { offset: 0, 'stop-color': '#1E140C', 'stop-opacity': 0.7 }),
            el('stop', { offset: 1, 'stop-color': '#1E140C', 'stop-opacity': 0 }),
          ),
        ),
        el('path', { d: ellipseD(0, 0, 27, 6.5), fill: `url(#${id})` }),
      );
    }
    case 'dent':
      return g(
        {},
        el('path', { d: ellipseD(0, 0, 3.6, 3), fill: '#1E1A16', 'fill-opacity': 0.7 }),
        el('path', {
          d: 'M-3.4 1.2q3.4 3.6 6.8 0',
          fill: 'none',
          stroke: '#FFFFFF',
          'stroke-opacity': 0.7,
          'stroke-width': 0.9,
        }),
      );
    case 'hole':
      return g(
        {},
        el('path', {
          d: polyD([
            [-3.4, -0.4],
            [-1.6, -3.2],
            [1.4, -3.4],
            [3.4, -0.8],
            [2.6, 2.8],
            [-0.6, 3.4],
            [-3, 2],
          ]),
          fill: '#E8E4DA',
        }),
        el('path', { d: ellipseD(0, 0, 2.2, 2.2), fill: '#120C08' }),
      );
  }
}

/** The whole sheet as SVG (design px viewBox, rendered at CAN_MASTER×). */
export function canSheetSvg(): string {
  seq = 0;
  const parts: string[] = [];
  for (const f of canFrames()) {
    const id = uid('cell');
    parts.push(
      g(
        {},
        el('clipPath', { id }, el('rect', { x: f.x, y: f.y, width: f.w, height: f.h })),
        g(
          { 'clip-path': `url(#${id})` },
          g({ transform: `translate(${r2(f.x + f.ox)} ${r2(f.y + f.oy)})` }, frameArt(f.name, f.h)),
        ),
      ),
    );
  }
  return svgDoc(
    CAN_SHEET_W * CAN_MASTER,
    CAN_SHEET_H * CAN_MASTER,
    [0, 0, CAN_SHEET_W, CAN_SHEET_H],
    '',
    parts.join(''),
  );
}

export function renderCanSheet(): Rgba {
  return renderSvg(canSheetSvg());
}
