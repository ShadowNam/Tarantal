// Interim shared sprites (D-031): FX, HUD, crate, meerkat helper, secret marks and rotor, omen
// weather and the water channel. Each keeps its placeholder's texture size and origin (views place
// them at 1 texture px per design px and rely on those origins), drawn at masterScale and averaged
// down. Flash rules (CLAUDE.md, bible §7): flashes are small local sprites; nothing here is a
// full-screen flash, and "reduce flashes" dims them in the views as before.
import { resize, type Rgba } from '../assets/image';
import type { ArtConfig } from './config';
import { biomePalette } from './config';
import { renderSvg } from './raster';
import { flat, line, nextId, resetIds, shade, stone, tone, type Pen } from './scenery';
import { pick, stalk, tuftOf, type TuftKind } from './vegetation';
import {
  el,
  ellipseD,
  g,
  inked,
  place,
  polyD,
  prng,
  r2,
  smoothD,
  svgDoc,
  wobbleFilter,
} from './svg';

export interface SpriteSpec {
  readonly key: string;
  /** Wobble (art units) for the hand-drawn line; 0 for geometric UI. */
  readonly wobble: number;
  draw(p: SpriteCtx): string;
}

export interface SpriteCtx {
  readonly c: (name: string) => string;
  readonly ink: string;
  readonly rnd: () => number;
}

const pen = (p: SpriteCtx, w: number): Pen => ({ ink: p.ink, w });

/** Star polygon around (0, 0), first point up. */
function starD(points: number, outer: number, inner: number, rot = 0): string {
  const pts: [number, number][] = [];
  for (let k = 0; k < points * 2; k++) {
    const r = k % 2 === 0 ? outer : inner;
    const a = (k / (points * 2)) * Math.PI * 2 - Math.PI / 2 + rot;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return polyD(pts);
}

function badgeNo(p: SpriteCtx): string {
  const red = tone(p.c('shellRed'), 0.3, 0.3);
  return g(
    {},
    inked(ellipseD(0, 0, 27, 27), red.fill, p.ink, 4),
    flat('M4 -26A26 26 0 0 1 4 26A30 30 0 0 0 4 -26Z', red.dark),
    flat(ellipseD(-12, -14, 7, 4), red.light),
    inked('M-17 -6L17 -6L17 6L-17 6Z', '#FFFFFF', p.ink, 2.5),
  );
}

function windsock(p: SpriteCtx): string {
  // Striped cone from the pole top (origin) to the right; the HUD rotates and stretches it.
  const parts: string[] = [];
  for (let k = 0; k < 4; k++) {
    const x0 = 8 + k * 33;
    const h0 = 21 - k * 3.6;
    const h1 = 21 - (k + 1) * 3.6;
    const c = k % 2 === 0 ? p.c('aloeFlower') : p.c('cream');
    const d = polyD([
      [x0, -h0],
      [x0 + 33, -h1 + 1],
      [x0 + 33, h1 - 1],
      [x0, h0],
    ]);
    parts.push(inked(d, c, p.ink, 3));
    parts.push(
      flat(
        polyD([
          [x0, h0 * 0.35],
          [x0 + 33, h1 * 0.35],
          [x0 + 33, h1 - 2],
          [x0, h0 - 2],
        ]),
        shade(c, -0.22),
      ),
    );
  }
  return g(
    {},
    ...parts,
    inked(ellipseD(8, 0, 5, 21), p.c('metal'), p.ink, 3),
    inked(ellipseD(0, 0, 4.5, 4.5), p.c('metalDark'), p.ink, 2.5),
  );
}

function feather(p: SpriteCtx): string {
  const d = smoothD(
    [
      [0, -21],
      [7, -10],
      [8, 6],
      [3, 19],
      [-3, 19],
      [-8, 6],
      [-7, -10],
    ],
    true,
    0.8,
  );
  return g(
    {},
    inked(d, '#2E2F45', p.ink, 2),
    flat('M0 -20L7 -9L8 6L3 18L0 18Z', '#1F2033'),
    line('M0 -18L0 22', { ink: '#C9C2B0', w: 1.4 }),
    flat(ellipseD(-3, -7, 2.2, 2.2), '#F4F1E8'),
    flat(ellipseD(3, 1, 2.2, 2.2), '#F4F1E8'),
    flat(ellipseD(-3, 9, 2, 2), '#F4F1E8'),
  );
}

function flash(p: SpriteCtx): string {
  // Fallback muzzle flash (guns with no flash clip): small, local, never full screen.
  return g(
    {},
    inked(starD(8, 92, 38, 0.2), p.c('flashOuter'), p.ink, 4),
    flat(starD(8, 62, 30, 0.2), p.c('flashMid')),
    flat(ellipseD(0, 0, 28, 28), p.c('flashCore')),
  );
}

function bubble(p: SpriteCtx): string {
  // Comic burst for the KEK / KWÊ / POOF captions (text is drawn over it by the HUD).
  const pts: [number, number][] = [];
  const n = 22;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const r = k % 2 === 0 ? 1 : 0.82 + (p.rnd() - 0.5) * 0.06;
    pts.push([Math.cos(a) * 120 * r, Math.sin(a) * 76 * r]);
  }
  const d = polyD(pts);
  return g(
    {},
    flat(d, '#1B1410', { transform: 'translate(5 6)', opacity: 0.25 }),
    inked(d, p.c('cream'), p.ink, 5),
    flat(ellipseD(-60, -36, 26, 8), '#FFFFFF', { opacity: 0.7 }),
  );
}

function puff(p: SpriteCtx): string {
  const c = p.c('dust');
  return g(
    { opacity: 0.88 },
    ...(
      [
        [-16, 4, 15, 13],
        [-2, -6, 17, 15],
        [14, 2, 14, 12],
        [2, 10, 16, 10],
      ] as const
    ).map(([x, y, rx, ry]) => flat(ellipseD(x, y, rx, ry), c)),
    flat(ellipseD(4, 10, 22, 7), shade(c, -0.18)),
    flat(ellipseD(-6, -10, 7, 4), shade(c, 0.4)),
  );
}

function grassTuft(p: SpriteCtx): string {
  // Covers a pop-up bird's base on the near ground: a ragged mound in the near layer's colour
  // (origin on the grass line, blades rise ~30–60 px above it) carrying a mixed clump: tufts of
  // different shapes, sizes and colours, a stone and a dry stalk (D-031 look review).
  const ground = p.c('veldDark');
  const mound = smoothD(
    [
      [-128, 72],
      [-122, 26],
      [-96, 10],
      [-50, 4],
      [10, 2],
      [62, 6],
      [104, 14],
      [126, 32],
      [128, 72],
      [60, 82],
      [-60, 82],
    ],
    true,
    0.8,
  );
  const parts: string[] = [flat(mound, ground)];
  parts.push(flat(ellipseD(10, 52, 110, 18), shade(ground, -0.1)));
  const tones = [
    { v: tone(p.c('straw'), 0.24, 0.25), w: 5 },
    { v: tone(p.c('bleached'), 0.22, 0.18), w: 3 },
    { v: tone(p.c('greyGreen'), 0.24, 0.22), w: 1.2 },
  ];
  const kinds: TuftKind[] = [
    'fan',
    'clump',
    'seeding',
    'wispy',
    'upright',
    'windswept',
    'fan',
    'clump',
  ];
  const pen = { ink: p.ink, w: 3.5 };
  parts.push(stone(p.rnd, 86, 30, 12, tone(p.c('pebble'), 0.28, 0.25), { ink: p.ink, w: 3 }));
  for (let k = 0; k < kinds.length; k++) {
    const kind = kinds[k] ?? 'fan';
    const x = -112 + k * 30 + (p.rnd() - 0.5) * 14;
    const y = 24 + p.rnd() * 10;
    // The texture ends 30 px above the grass line: keep every tip (and seed head) inside it.
    const room = (y + 27) / (kind === 'seeding' ? 1.65 : 1.05);
    parts.push(
      tuftOf(kind, p.rnd, x, y, room * (0.7 + p.rnd() * 0.3), pick(p.rnd, tones), pen, p.c('seed')),
    );
  }
  parts.push(stalk(p.rnd, -30, 26, 48, p.c('bleached'), p.c('seed'), { ink: p.ink, w: 2.5 }));
  return g({}, ...parts);
}

function glint(p: SpriteCtx): string {
  return g(
    {},
    flat(starD(4, 44, 7), p.c('flashCore')),
    flat(starD(4, 26, 4, Math.PI / 4), '#FFFFFF', { opacity: 0.85 }),
    flat(ellipseD(0, 0, 7, 7), '#FFFFFF'),
  );
}

function ring(p: SpriteCtx): string {
  // Meerkat Spotter reveal ring: dashed (shape, not colour alone).
  const c = (w: number, col: string) =>
    el('circle', {
      cx: 0,
      cy: 0,
      r: 88,
      fill: 'none',
      stroke: col,
      'stroke-width': w,
      'stroke-dasharray': '22 12',
      'stroke-linecap': 'round',
    });
  return g({}, c(13, p.ink), c(6.5, p.c('reveal')));
}

function spark(p: SpriteCtx): string {
  return g(
    {},
    inked(starD(6, 36, 13, 0.1), p.c('flashOuter'), p.ink, 3),
    flat(starD(6, 22, 9, 0.1), p.c('flashCore')),
  );
}

function crateBox(p: SpriteCtx): string {
  // Wooden ammo crate in 3/4: planked front, top lid, cross brace, stencilled shell symbol (no
  // letters or red cross).
  const wood = tone(p.c('wood'), 0.3, 0.25);
  const front = polyD([
    [-62, -36],
    [44, -36],
    [44, 62],
    [-62, 62],
  ]);
  const top = polyD([
    [-62, -36],
    [-42, -62],
    [62, -62],
    [44, -36],
  ]);
  const side = polyD([
    [44, -36],
    [62, -62],
    [62, 40],
    [44, 62],
  ]);
  const planks = line('M-62 -3L44 -3M-62 30L44 30', { ink: wood.dark, w: 3 });
  // Stencilled shell symbol (stencil bridges break the shape, as a spray stencil would).
  const cream = p.c('cream');
  const stencil = g(
    { opacity: 0.88 },
    flat('M-11 -22Q-11 -26 -7 -26L7 -26Q11 -26 11 -22L11 12L-11 12Z', cream),
    flat('M-14 16L14 16L14 30L-14 30Z', cream),
    flat('M-12 -4L12 -4L12 0L-12 0Z', wood.fill),
    flat('M-2 16L2 16L2 30L-2 30Z', wood.fill),
  );
  return g(
    {},
    inked(side, wood.dark, p.ink, 4),
    inked(top, wood.light, p.ink, 4),
    line('M-40 -49L52 -49', { ink: wood.fill, w: 3 }),
    inked(front, wood.fill, p.ink, 5),
    planks,
    line('M-58 -32L40 58', { ink: shade(wood.fill, -0.35), w: 9 }),
    line('M-58 -32L40 58', { ink: wood.light, w: 3 }),
    stencil,
    ...[
      [-56, -30],
      [38, -30],
      [-56, 56],
      [38, 56],
    ].map(([x, y]) => inked(ellipseD(x ?? 0, y ?? 0, 3, 3), p.c('metal'), p.ink, 1.5)),
  );
}

function crateChute(p: SpriteCtx): string {
  // Patched canvas parachute (origin = crate centre), rigging lines, the crate.
  const canvas = tone(p.c('cream'), 0.18, 0.15);
  const canopy = smoothD(
    [
      [-122, -200],
      [-110, -248],
      [-60, -284],
      [0, -294],
      [60, -284],
      [110, -248],
      [122, -200],
      [80, -210],
      [40, -202],
      [0, -210],
      [-40, -202],
      [-80, -210],
    ],
    true,
    0.6,
  );
  const id = nextId();
  return g(
    {},
    line('M-118 -203L-34 -62M-58 -206L-14 -62M58 -206L14 -62M118 -203L34 -62', {
      ink: p.ink,
      w: 2,
    }),
    el('clipPath', { id }, el('path', { d: canopy })),
    flat(canopy, canvas.fill),
    g(
      { 'clip-path': `url(#${id})` },
      flat('M40 -300L130 -300L130 -190L60 -200Z', canvas.dark),
      line('M-60 -284Q-50 -240 -40 -202M0 -294L0 -210M60 -284Q50 -240 40 -202', {
        ink: canvas.dark,
        w: 3,
      }),
      inked('M-86 -254L-56 -258L-54 -232L-84 -228Z', p.c('patch'), p.ink, 2),
      line('M-84 -250l26 -3M-83 -240l26 -3', { ink: shade(p.c('patch'), -0.3), w: 1.5 }),
      flat(ellipseD(-40, -270, 22, 8), canvas.light),
    ),
    el('path', {
      d: canopy,
      fill: 'none',
      stroke: p.ink,
      'stroke-width': 4,
      'stroke-linejoin': 'round',
    }),
    crateBox(p),
  );
}

function dustDevil(p: SpriteCtx): string {
  // A leaning, translucent swirl column (origin at its base), dust bands with darker streaks.
  const parts: string[] = [];
  const c = p.c('dust');
  for (let k = 0; k < 10; k++) {
    const y = -k * 50 - 10;
    const r = 26 + k * 12;
    const x = Math.sin(k * 0.8) * 16 + k * 4;
    parts.push(
      flat(ellipseD(x, y, r, 16 + k * 2), k % 2 === 0 ? c : shade(c, -0.12), { opacity: 0.42 }),
    );
    parts.push(
      el('path', {
        d: `M${r2(x - r * 0.9)} ${r2(y)}Q${r2(x)} ${r2(y + 14 + k)} ${r2(x + r * 0.9)} ${r2(y - 4)}`,
        fill: 'none',
        stroke: shade(c, -0.35),
        'stroke-width': 3,
        'stroke-linecap': 'round',
        opacity: 0.55,
      }),
    );
  }
  parts.push(flat(ellipseD(0, -4, 60, 12), shade(c, -0.1), { opacity: 0.5 }));
  for (let k = 0; k < 9; k++) {
    const y = -40 - p.rnd() * 420;
    const x = (p.rnd() - 0.5) * (60 + -y * 0.45);
    parts.push(flat(ellipseD(x, y, 4, 2.5), p.c('leafA'), { opacity: 0.9 }));
  }
  return g({}, ...parts);
}

function leaf(p: SpriteCtx): string {
  const d = smoothD(
    [
      [-12, 0],
      [-4, -6],
      [8, -5],
      [13, 0],
      [8, 5],
      [-4, 6],
    ],
    true,
    0.8,
  );
  return g(
    {},
    inked(d, p.c('leafA'), p.ink, 1.8),
    flat('M-11 0L13 0L8 5L-4 6Z', p.c('leafB')),
    line('M-12 0L11 0', { ink: shade(p.c('leafA'), -0.4), w: 1 }),
  );
}

function dust(p: SpriteCtx): string {
  const c = p.c('dust');
  return g(
    { opacity: 0.65 },
    flat(ellipseD(-3, 1, 14, 11), c),
    flat(ellipseD(6, -3, 10, 9), c),
    flat(ellipseD(2, 6, 14, 5), shade(c, -0.15)),
  );
}

function smoke(p: SpriteCtx): string {
  const c = p.c('smoke');
  const parts: string[] = [];
  for (let k = 0; k < 6; k++) {
    const a = k * 1.1;
    parts.push(flat(ellipseD(Math.cos(a) * 28, Math.sin(a) * 22, 36, 32), c));
  }
  return g(
    { opacity: 0.82 },
    ...parts,
    flat(ellipseD(14, 20, 44, 20), shade(c, -0.15)),
    flat(ellipseD(-18, -22, 18, 10), shade(c, 0.4)),
    el('path', {
      d: smoothD(
        Array.from({ length: 6 }, (_, k): [number, number] => [
          Math.cos(k * 1.1) * 50,
          Math.sin(k * 1.1) * 44,
        ]),
        true,
        1,
      ),
      fill: 'none',
      stroke: shade(c, -0.35),
      'stroke-width': 2.5,
      opacity: 0.6,
    }),
  );
}

function pebble(p: SpriteCtx): string {
  // A whole round river stone (the Kettie's ammo, seen in flight).
  const t = tone(p.c('pebble'), 0.3, 0.3);
  const d = smoothD(
    [
      [-13, 1],
      [-9, -9],
      [2, -11],
      [12, -5],
      [13, 4],
      [5, 10],
      [-7, 10],
    ],
    true,
    0.9,
  );
  const id = nextId();
  return g(
    {},
    el('clipPath', { id }, el('path', { d })),
    flat(d, t.fill),
    g(
      { 'clip-path': `url(#${id})` },
      flat(ellipseD(6, 6, 12, 8), t.dark),
      flat(ellipseD(-5, -5, 5, 3), t.light),
    ),
    el('path', { d, fill: 'none', stroke: p.ink, 'stroke-width': 2.2 }),
  );
}

function splash(p: SpriteCtx): string {
  const water = tone(p.c('splash'), 0.2, 0.3);
  const drops: string[] = [];
  for (let k = -2; k <= 2; k++) {
    const x = k * 15;
    const y = -22 - (2 - Math.abs(k)) * 10;
    const d = smoothD(
      [
        [x - 5, y + 6],
        [x, y - 10],
        [x + 5, y + 6],
        [x, y + 11],
      ],
      true,
      0.8,
    );
    drops.push(inked(d, water.fill, p.ink, 2));
    drops.push(flat(ellipseD(x - 1.5, y - 1, 1.5, 3), water.light));
  }
  return g(
    {},
    inked('M-34 0Q-20 -28 -10 -6Q0 -30 10 -6Q20 -28 34 0Z', water.light, p.ink, 2.5),
    ...drops,
    inked(ellipseD(0, 0, 40, 6.5), water.fill, p.ink, 2.5),
  );
}

function meerkat(p: SpriteCtx): string {
  // Standing sentry with binoculars (bible §3.3), origin at its feet.
  const fur = tone(p.c('meerkat'), 0.25, 0.25);
  const dark = shade(p.c('meerkat'), -0.55);
  const body = smoothD(
    [
      [-20, -6],
      [-30, -60],
      [-26, -112],
      [-14, -138],
      [14, -138],
      [26, -112],
      [30, -60],
      [20, -6],
    ],
    true,
    0.8,
  );
  const id = nextId();
  return g(
    {},
    flat(ellipseD(4, -2, 34, 6), '#5A3418', { opacity: 0.3 }),
    inked('M18 -10Q46 -6 52 -30Q50 -12 26 0Z', fur.dark, p.ink, 3.5),
    inked(
      polyD([
        [-20, -10],
        [-24, 0],
        [-8, 0],
        [-8, -10],
      ]),
      fur.dark,
      p.ink,
      3,
    ),
    inked(
      polyD([
        [8, -10],
        [8, 0],
        [24, 0],
        [20, -10],
      ]),
      fur.dark,
      p.ink,
      3,
    ),
    el('clipPath', { id }, el('path', { d: body })),
    flat(body, fur.fill),
    g(
      { 'clip-path': `url(#${id})` },
      flat(ellipseD(0, -66, 16, 50), fur.light),
      flat(ellipseD(26, -70, 12, 70), fur.dark),
    ),
    el('path', {
      d: body,
      fill: 'none',
      stroke: p.ink,
      'stroke-width': 4,
      'stroke-linejoin': 'round',
    }),
    // Head with dark eye patches, ears, nose; the binoculars held up to the eyes.
    inked(
      smoothD(
        [
          [-22, -150],
          [-18, -178],
          [0, -190],
          [18, -178],
          [22, -150],
          [10, -134],
          [-10, -134],
        ],
        true,
        0.8,
      ),
      fur.fill,
      p.ink,
      4,
    ),
    inked(ellipseD(-21, -172, 5, 6), dark, p.ink, 2.5),
    inked(ellipseD(21, -172, 5, 6), dark, p.ink, 2.5),
    inked(ellipseD(0, -142, 7, 5), fur.light, p.ink, 2.5),
    flat(ellipseD(0, -145, 3.5, 2.5), p.ink),
    inked(
      polyD([
        [-19, -168],
        [-3, -168],
        [-3, -152],
        [-19, -152],
      ]),
      '#3B3F45',
      p.ink,
      3,
    ),
    inked(
      polyD([
        [3, -168],
        [19, -168],
        [19, -152],
        [3, -152],
      ]),
      '#3B3F45',
      p.ink,
      3,
    ),
    flat(ellipseD(-11, -160, 4, 4), '#8FC6E8'),
    flat(ellipseD(11, -160, 4, 4), '#8FC6E8'),
    line('M-3 -160L3 -160', pen(p, 3)),
    inked('M-26 -150Q-34 -124 -22 -112L-14 -118Q-22 -128 -18 -148Z', fur.fill, p.ink, 3),
    inked('M26 -150Q34 -124 22 -112L14 -118Q22 -128 18 -148Z', fur.fill, p.ink, 3),
  );
}

function glare(p: SpriteCtx): string {
  // Low winter sun (omen): a steady warm band fading from the right edge; the view stretches it to
  // the screen height and dims it with "reduce flashes". Not a flash.
  const id = 'gl';
  return g(
    {},
    el(
      'defs',
      {},
      el(
        'linearGradient',
        { id, x1: 1, y1: 0, x2: 0, y2: 0 },
        el('stop', { offset: 0, 'stop-color': p.c('glare'), 'stop-opacity': 1 }),
        el('stop', { offset: 0.32, 'stop-color': p.c('glare'), 'stop-opacity': 0.55 }),
        el('stop', { offset: 1, 'stop-color': p.c('glare'), 'stop-opacity': 0 }),
      ),
    ),
    el('rect', { x: -256, y: 0, width: 256, height: 64, fill: `url(#${id})` }),
  );
}

function rain(p: SpriteCtx): string {
  const id = 'rn';
  return g(
    {},
    el(
      'defs',
      {},
      el(
        'linearGradient',
        { id, x1: 0, y1: 0, x2: 0, y2: 1 },
        el('stop', { offset: 0, 'stop-color': p.c('rain'), 'stop-opacity': 0 }),
        el('stop', { offset: 1, 'stop-color': p.c('rain'), 'stop-opacity': 0.9 }),
      ),
    ),
    el('rect', { x: -1.2, y: -20, width: 2.4, height: 40, rx: 1.2, fill: `url(#${id})` }),
  );
}

function rainbow(p: SpriteCtx): string {
  const bands = ['rb1', 'rb2', 'rb3', 'rb4', 'rb5', 'rb6'];
  return g(
    { opacity: 0.62 },
    ...bands.map((b, i) =>
      el('path', {
        d: `M${-(236 - i * 12)} 0A${236 - i * 12} ${236 - i * 12} 0 0 1 ${236 - i * 12} 0`,
        fill: 'none',
        stroke: p.c(b),
        'stroke-width': 12.5,
      }),
    ),
  );
}

function mark(p: SpriteCtx): string {
  // A hand-painted red bullseye on a secret part.
  const red = p.c('shellRed');
  return g(
    {},
    inked(ellipseD(0, 0, 24, 24), red, p.ink, 4),
    flat('M6 -23A23 23 0 0 1 6 23A26 26 0 0 0 6 -23Z', shade(red, -0.25)),
    inked(ellipseD(0, 0, 13, 13), p.c('cream'), p.ink, 2.5),
    flat(ellipseD(0, 0, 5.5, 5.5), red),
    flat(ellipseD(-10, -12, 4, 2.5), '#FFFFFF', { opacity: 0.6 }),
  );
}

function markHit(p: SpriteCtx): string {
  const grey = p.c('markHit');
  return g(
    {},
    inked(ellipseD(0, 0, 22, 22), grey, p.ink, 3),
    flat('M5 -21A21 21 0 0 1 5 21A24 24 0 0 0 5 -21Z', shade(grey, -0.2)),
    line('M-11 -11L11 11M11 -11L-11 11', { ink: p.ink, w: 9 }),
    line('M-11 -11L11 11M11 -11L-11 11', { ink: p.c('cream'), w: 4.5 }),
  );
}

function rotor(p: SpriteCtx): string {
  // Windpomp wheel (secret parts sit at radius 72): 16 curved steel sails between two rings, a
  // hub with a rusty cap. Each sail has its own lit and shaded half, so it reads at any rotation.
  const steel = tone(p.c('metal'), 0.28, 0.3);
  const parts: string[] = [];
  const n = 16;
  for (let k = 0; k < n; k++) {
    const a = (k * 360) / n;
    const blade: [number, number][] = [
      [-5, -28],
      [-15, -106],
      [15, -108],
      [6, -28],
    ];
    parts.push(inked(polyD(place(blade, 0, 0, a)), steel.fill, p.ink, 2));
    parts.push(
      flat(
        polyD(
          place(
            [
              [0, -28],
              [0, -107],
              [15, -108],
              [6, -28],
            ],
            0,
            0,
            a,
          ),
        ),
        steel.dark,
      ),
    );
  }
  return g(
    {},
    ...parts,
    el('circle', { cx: 0, cy: 0, r: 106, fill: 'none', stroke: p.ink, 'stroke-width': 6 }),
    el('circle', { cx: 0, cy: 0, r: 106, fill: 'none', stroke: steel.dark, 'stroke-width': 2.5 }),
    el('circle', { cx: 0, cy: 0, r: 58, fill: 'none', stroke: p.ink, 'stroke-width': 5 }),
    el('circle', { cx: 0, cy: 0, r: 58, fill: 'none', stroke: steel.light, 'stroke-width': 2 }),
    ...Array.from({ length: 8 }, (_, k) =>
      line(`M0 0L${r2(Math.cos((k * Math.PI) / 4) * 58)} ${r2(Math.sin((k * Math.PI) / 4) * 58)}`, {
        ink: p.ink,
        w: 3,
      }),
    ),
    inked(ellipseD(0, 0, 17, 17), p.c('rust'), p.ink, 4),
    flat(ellipseD(-5, -6, 5, 4), shade(p.c('rust'), 0.4)),
  );
}

function water(p: SpriteCtx): string {
  // A floodplain channel, stretched by the view to each splash zone (often ~7× wider than tall).
  // The ends are long tapered points and the ink is a filled band (outer lens minus inner lens),
  // never a stroke: a horizontal stretch keeps the ink's thickness, so the ends never smear into
  // blobs. Ripple glints are horizontal for the same reason.
  const w = tone(p.c('water'), 0.2, 0.35);
  const lens = (h: number, inset: number): string =>
    `M${-128 + inset} 0C${-100 + inset} ${-h} ${-80} ${-h} ${-50} ${-h}L50 ${-h}C80 ${-h} ${100 - inset} ${-h} ${128 - inset} 0C${100 - inset} ${h} 80 ${h} 50 ${h}L-50 ${h}C-80 ${h} ${-100 + inset} ${h} ${-128 + inset} 0Z`;
  return g(
    {},
    flat(lens(27, 0), p.ink),
    flat(lens(24, 3), w.fill),
    flat(
      'M-110 4C-80 18 -40 21 0 21C40 21 80 18 110 4C90 15 60 23 0 23C-60 23 -90 15 -110 4Z',
      w.dark,
    ),
    line('M-84 -10l30 0M-10 2l38 0M54 -12l26 0M-50 12l20 0', { ink: w.light, w: 3 }),
    flat(ellipseD(-60, -15, 24, 3), w.light),
  );
}

/** Every shared sprite key → its drawing (sizes/origins come from the placeholder manifest). */
export const SPRITES: readonly SpriteSpec[] = [
  { key: 'ui/badge_no', wobble: 0, draw: badgeNo },
  { key: 'ui/windsock', wobble: 1, draw: windsock },
  { key: 'fx/feather', wobble: 0.6, draw: feather },
  { key: 'fx/flash', wobble: 1.5, draw: flash },
  { key: 'fx/bubble', wobble: 2, draw: bubble },
  { key: 'fx/puff', wobble: 1, draw: puff },
  { key: 'fx/grass_tuft', wobble: 1.5, draw: grassTuft },
  { key: 'fx/glint', wobble: 0, draw: glint },
  { key: 'fx/ring', wobble: 0, draw: ring },
  { key: 'fx/spark', wobble: 1, draw: spark },
  { key: 'crate/box', wobble: 1.5, draw: crateBox },
  { key: 'crate/chute', wobble: 1.5, draw: crateChute },
  { key: 'fx/dust_devil', wobble: 3, draw: dustDevil },
  { key: 'fx/leaf', wobble: 0, draw: leaf },
  { key: 'fx/dust', wobble: 0.6, draw: dust },
  { key: 'fx/smoke', wobble: 2, draw: smoke },
  { key: 'fx/stone', wobble: 0, draw: pebble },
  { key: 'fx/splash', wobble: 0.8, draw: splash },
  { key: 'helper/meerkat', wobble: 1.5, draw: meerkat },
  { key: 'omen/glare', wobble: 0, draw: glare },
  { key: 'omen/rain', wobble: 0, draw: rain },
  { key: 'omen/rainbow', wobble: 0, draw: rainbow },
  { key: 'secret/mark', wobble: 0.8, draw: mark },
  { key: 'secret/mark_hit', wobble: 0.8, draw: markHit },
  { key: 'secret/rotor', wobble: 0, draw: rotor },
  { key: 'biome/water', wobble: 1.5, draw: water },
];

/** One sprite at its placeholder size; `origin` in fractions. */
export function renderSprite(
  cfg: ArtConfig,
  spec: SpriteSpec,
  size: { width: number; height: number },
  origin: { x: number; y: number },
): Rgba {
  resetIds();
  const pal = biomePalette(cfg, 'common');
  let seed = 3;
  for (let k = 0; k < spec.key.length; k++) seed = (seed * 31 + spec.key.charCodeAt(k)) % 99991;
  const ctx: SpriteCtx = { c: pal, ink: cfg.ink, rnd: prng(seed) };
  const k = cfg.masterScale;
  const ox = origin.x * size.width;
  const oy = origin.y * size.height;
  const filter = wobbleFilter('wob', 0.05, spec.wobble, 7);
  const big = renderSvg(
    svgDoc(
      size.width * k,
      size.height * k,
      [-ox, -oy, size.width, size.height],
      filter,
      g(filter === '' ? {} : { filter: 'url(#wob)' }, spec.draw(ctx)),
    ),
  );
  return resize(big, size.width, size.height);
}
