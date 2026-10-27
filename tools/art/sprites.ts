// Interim shared sprites (D-031): FX, HUD, crate, meerkat helper, secret marks and rotor, omen
// weather and the water channel. Each keeps its placeholder's texture size and origin (views place
// them at 1 texture px per design px and rely on those origins), drawn at masterScale and averaged
// down. Flash rules (CLAUDE.md, bible §7): flashes are small local sprites; nothing here is a
// full-screen flash, and "reduce flashes" dims them in the views as before.
import { resize, type Rgba } from '../assets/image';
import type { ArtConfig } from './config';
import { biomePalette } from './config';
import { renderSvg } from './raster';
import { billowCloud } from './skies';
import { flat, line, mix, nextId, resetIds, shade, stone, tone, type Pen } from './scenery';
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
  // Wooden ammo crate in 3/4: planked front, top lid, cross brace (no letters or red cross).
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
  // v1.7b (D-046): no stencil on the front: the game puts the item's icon there (WorldView).
  return g(
    {},
    inked(side, wood.dark, p.ink, 4),
    inked(top, wood.light, p.ink, 4),
    line('M-40 -49L52 -49', { ink: wood.fill, w: 3 }),
    inked(front, wood.fill, p.ink, 5),
    planks,
    line('M-58 -32L40 58', { ink: shade(wood.fill, -0.35), w: 9 }),
    line('M-58 -32L40 58', { ink: wood.light, w: 3 }),
    ...[
      [-56, -30],
      [38, -30],
      [-56, 56],
      [38, 56],
    ].map(([x, y]) => inked(ellipseD(x ?? 0, y ?? 0, 3, 3), p.c('metal'), p.ink, 1.5)),
  );
}

function crateChute(p: SpriteCtx): string {
  // Canvas parachute (origin = crate centre), rigging lines, the crate. v1.7b: no patch on the
  // canopy (it read as a stray square beside the item's icon).
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

/**
 * v1.6 (D-042, product owner 25 Oct, from reference photos of farm windpomps): the classic
 * multi-blade wheel. 20 galvanised sheet-steel sails (one every 18°), narrow at the hub end and
 * wide at the tip, the tips cut on a slant and standing FREE (no outer rim). Two thin rings run
 * across the sails (r 44 where they start, r 78 across their middle) and six rods tie the hub to
 * the rings. Old and weathered: each sail a slightly different grey, rust on the tips, at the
 * ring rivets and in streaks, rusty rings. Damage in no pattern: six sails lost, one bent, one
 * torn short. The secret's four marked sails sit at 0°, 90°, 180° and 270° (radius 72, the parts
 * turn with the wheel), i.e. k = 0, 5, 10 and 15: never lost, bent or torn. Lit from the upper
 * left; each sail carries its own lit leading edge and shaded trailing half.
 */
function rotor(p: SpriteCtx): string {
  const steel = '#A9AFB3';
  const lit = '#D6DADC';
  const dark = '#6C7276';
  const ink = mix(p.ink, dark, 0.35);
  // Weathered rust: browner than the paint rust, so it reads as old iron, not pink, on the grey.
  const rust = mix(p.c('rust'), '#5A3A22', 0.35);
  const n = 20;
  const r0 = 42;
  const ringIn = 44;
  const ringMid = 78;
  const missing = new Set([2, 3, 7, 11, 13, 18]);
  const bent = 8;
  const torn = 16;
  // A fixed per-sail "random" in [0, 1): the weathering differs sail to sail but never between
  // runs (interim art must regenerate byte for byte).
  const rnd = (k: number, salt: number): number => (((k + 1) * 7919 + salt * 104729) % 997) / 997;
  const parts: string[] = [];
  for (let k = 0; k < n; k++) {
    if (missing.has(k)) continue;
    const a = (k * 360) / n + (k === bent ? 8 : 0);
    const r1 = k === bent ? 98 : k === torn ? 86 : 108;
    // The tip: a slanted cut, or a torn ragged edge.
    const tip: [number, number][] =
      k === torn
        ? [
            [-10, -(r1 - 3)],
            [-6, -(r1 + 3)],
            [-2, -(r1 - 2)],
            [3, -(r1 + 4)],
            [10, -r1],
          ]
        : [
            [-12, -(r1 - 3)],
            [-11, -(r1 + 1)],
            [13, -(r1 + 4)],
            [14, -r1],
          ];
    const sail: [number, number][] = [[-3, -r0], ...tip, [3, -r0]];
    const tint = mix(steel, rnd(k, 1) < 0.5 ? '#8E9396' : '#A39A8E', 0.15 + rnd(k, 2) * 0.35);
    parts.push(
      el('path', {
        d: polyD(place(sail, 0, 0, a)),
        fill: tint,
        stroke: ink,
        'stroke-width': 1.5,
        'stroke-linejoin': 'round',
      }),
    );
    // Trailing half in shadow, leading edge lit.
    const half: [number, number][] = [[0.5, -r0], [1, -(r1 + 2.5)], ...tip.slice(-2), [2.5, -r0]];
    parts.push(el('path', { d: polyD(place(half, 0, 0, a)), fill: dark, opacity: 0.45 }));
    parts.push(
      el('path', {
        d: polyD(
          place(
            [
              [-3, -(r0 + 2)],
              [-11.5, -(r1 - 4)],
            ],
            0,
            0,
            a,
          ),
          false,
        ),
        fill: 'none',
        stroke: lit,
        'stroke-width': 1.4,
        'stroke-linecap': 'round',
      }),
    );
    // Rust: a tip patch on most sails, a streak running out from the outer ring's rivet on some.
    if (rnd(k, 3) < 0.7) {
      const d = 8 + rnd(k, 4) * 10;
      parts.push(
        el('path', {
          d: polyD(
            place(
              [
                [-10.5, -(r1 - d)],
                [-12, -(r1 - 3)],
                [13, -(r1 + 3)],
                [12, -(r1 - d + 2)],
              ],
              0,
              0,
              a,
            ),
          ),
          fill: rust,
          opacity: 0.25 + rnd(k, 5) * 0.35,
        }),
      );
    }
    if (rnd(k, 6) < 0.55) {
      const x = -3 + rnd(k, 7) * 7;
      parts.push(
        el('path', {
          d: polyD(
            place(
              [
                [x - 1, -(ringMid + 2)],
                [x - 1.6, -(ringMid + 14 + rnd(k, 8) * 10)],
                [x + 1.2, -(ringMid + 12)],
                [x + 1, -(ringMid + 2)],
              ],
              0,
              0,
              a,
            ),
          ),
          fill: shade(rust, -0.15),
          opacity: 0.5,
        }),
      );
    }
    // Rivets where the sail meets the rings.
    for (const r of [ringIn + 3, ringMid]) {
      const [[x, y]] = place([[0, -r]], 0, 0, a) as [[number, number]];
      parts.push(el('path', { d: ellipseD(x, y, 1.5, 1.5), fill: shade(rust, -0.3) }));
    }
  }
  const arms: string[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3 + 0.17;
    arms.push(
      `M${r2(Math.cos(a) * 14)} ${r2(Math.sin(a) * 14)}L${r2(Math.cos(a) * ringMid)} ${r2(Math.sin(a) * ringMid)}`,
    );
  }
  const bolts: string[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    bolts.push(ellipseD(Math.cos(a) * 10.5, Math.sin(a) * 10.5, 1.6, 1.6));
  }
  // A rusty ring: the steel band with rust showing through in broken lengths.
  const ring = (r: number, w: number, dash: string): string[] => [
    el('circle', { cx: 0, cy: 0, r, fill: 'none', stroke: ink, 'stroke-width': w + 2 }),
    el('circle', { cx: 0, cy: 0, r, fill: 'none', stroke: dark, 'stroke-width': w }),
    el('circle', {
      cx: 0,
      cy: 0,
      r,
      fill: 'none',
      stroke: rust,
      'stroke-width': w,
      'stroke-dasharray': dash,
      opacity: 0.6,
    }),
  ];
  return g(
    {},
    // The rods behind the sails, then the sails, then the rings across them, then the hub.
    el('path', {
      d: arms.join(''),
      fill: 'none',
      stroke: ink,
      'stroke-width': 4.4,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: arms.join(''),
      fill: 'none',
      stroke: dark,
      'stroke-width': 2.4,
      'stroke-linecap': 'round',
    }),
    ...parts,
    ...ring(ringMid, 2.2, '9 14 4 22'),
    ...ring(ringIn, 2.6, '6 10 12 18'),
    el('path', {
      d: 'M-55 -55A78 78 0 0 1 30 -72',
      fill: 'none',
      stroke: lit,
      'stroke-width': 1,
      opacity: 0.7,
    }),
    // Hub: a cast plate with six bolts and a rusty grease cap.
    el('circle', { cx: 0, cy: 0, r: 17, fill: dark, stroke: ink, 'stroke-width': 2.5 }),
    el('path', { d: bolts.join(''), fill: lit }),
    el('circle', { cx: 0, cy: 0, r: 7, fill: rust, stroke: ink, 'stroke-width': 1.6 }),
    el('circle', { cx: -2, cy: -2.5, r: 2.2, fill: shade(rust, 0.45) }),
  );
}

/**
 * v1.6 (D-042): the windpomp's turning head without the wheel: the gearbox on its turntable
 * (origin = the pivot over the tower), the tail boom and the vane (a riveted sheet with a
 * stiffener, faded paint, rust, no lettering). Drawn trailing to the left; the view flips and
 * foreshortens it as the head swings with the wind.
 */
function windpompVane(p: SpriteCtx): string {
  const steel = '#A9AFB3';
  const lit = '#D6DADC';
  const dark = '#6C7276';
  const ink = mix(p.ink, dark, 0.35);
  const rust = p.c('rust');
  const paint = '#B8B4A4';
  return g(
    {},
    // Tail boom: two tubes meeting at the vane, with a stay.
    el('path', {
      d: 'M-6 -4L-206 6M-6 4L-206 10M-60 -2L-150 -26L-206 2',
      fill: 'none',
      stroke: ink,
      'stroke-width': 5,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: 'M-6 -4L-206 6M-6 4L-206 10',
      fill: 'none',
      stroke: steel,
      'stroke-width': 2.6,
      'stroke-linecap': 'round',
    }),
    el('path', { d: 'M-60 -2L-150 -26L-206 2', fill: 'none', stroke: dark, 'stroke-width': 1.8 }),
    // The vane: a tall sheet, riveted, with a stiffener and rust running from the rivets.
    el('path', {
      d: 'M-262 -40L-196 -30L-194 44L-262 56Z',
      fill: paint,
      stroke: ink,
      'stroke-width': 3,
      'stroke-linejoin': 'round',
    }),
    el('path', { d: 'M-228 -35L-196 -30L-194 44L-228 50Z', fill: shade(paint, -0.22) }),
    el('path', {
      d: 'M-260 -36L-198 -27',
      fill: 'none',
      stroke: shade(paint, 0.3),
      'stroke-width': 2,
    }),
    el('path', {
      d: 'M-229 -34L-228 50',
      fill: 'none',
      stroke: shade(paint, -0.4),
      'stroke-width': 2.4,
    }),
    el('path', {
      d: 'M-250 -20l3 30l-2 14M-214 -10l2 26',
      fill: 'none',
      stroke: rust,
      'stroke-width': 2.2,
      opacity: 0.55,
    }),
    el('path', {
      d: [-28, -8, 14, 36]
        .map((y) => `${ellipseD(-256, y, 1.5, 1.5)}${ellipseD(-201, y * 0.85, 1.5, 1.5)}`)
        .join(''),
      fill: shade(paint, -0.45),
    }),
    // The gearbox head on its turntable, an oil cap and the pump rod's crank housing.
    el('path', {
      d: 'M-22 -22L18 -22L22 14L-24 14Z',
      fill: steel,
      stroke: ink,
      'stroke-width': 3,
      'stroke-linejoin': 'round',
    }),
    el('path', { d: 'M0 -22L18 -22L22 14L2 14Z', fill: dark, opacity: 0.6 }),
    el('path', { d: 'M-20 -19L14 -19', fill: 'none', stroke: lit, 'stroke-width': 2 }),
    el('path', { d: ellipseD(-6, -26, 6, 4), fill: rust, stroke: ink, 'stroke-width': 2 }),
    el('path', { d: 'M-28 14L28 14L26 22L-26 22Z', fill: dark, stroke: ink, 'stroke-width': 2.4 }),
    el('path', {
      d: 'M-14 0l2 6M8 -8l3 10',
      fill: 'none',
      stroke: rust,
      'stroke-width': 2,
      opacity: 0.5,
    }),
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

/** A red shotgun shell standing up (brass head down), centred on (x, y), `h` tall. */
function shellD(p: SpriteCtx, x: number, y: number, h: number, rot = 0): string {
  const w = h * 0.36;
  const red = tone(p.c('shellRed'), 0.3, 0.3);
  const brassH = h * 0.3;
  return g(
    { transform: `translate(${r2(x)} ${r2(y)}) rotate(${r2(rot)})` },
    inked(
      `M${r2(-w / 2)} ${r2(-h / 2)}L${r2(w / 2)} ${r2(-h / 2)}L${r2(w / 2)} ${r2(h / 2 - brassH)}L${r2(-w / 2)} ${r2(h / 2 - brassH)}Z`,
      red.fill,
      p.ink,
      2.5,
    ),
    flat(
      `M${r2(w / 6)} ${r2(-h / 2 + 2)}L${r2(w / 2 - 2)} ${r2(-h / 2 + 2)}L${r2(w / 2 - 2)} ${r2(h / 2 - brassH)}L${r2(w / 6)} ${r2(h / 2 - brassH)}Z`,
      red.dark,
    ),
    flat(
      `M${r2(-w / 2 + 3)} ${r2(-h / 2 + 3)}L${r2(-w / 2 + 6)} ${r2(-h / 2 + 3)}L${r2(-w / 2 + 6)} ${r2(h / 2 - brassH - 3)}L${r2(-w / 2 + 3)} ${r2(h / 2 - brassH - 3)}Z`,
      red.light,
    ),
    inked(
      `M${r2(-w / 2 - 1.5)} ${r2(h / 2 - brassH)}L${r2(w / 2 + 1.5)} ${r2(h / 2 - brassH)}L${r2(w / 2 + 1.5)} ${r2(h / 2)}L${r2(-w / 2 - 1.5)} ${r2(h / 2)}Z`,
      '#C9A13B',
      p.ink,
      2.5,
    ),
    flat(
      `M${r2(-w / 2 + 1)} ${r2(h / 2 - brassH + 2)}L${r2(-w / 2 + 4)} ${r2(h / 2 - brassH + 2)}L${r2(-w / 2 + 4)} ${r2(h / 2 - 2)}L${r2(-w / 2 + 1)} ${r2(h / 2 - 2)}Z`,
      '#F0D27A',
    ),
  );
}

/** A zig-zag lightning bolt centred on (0, 0), `h` tall. */
function boltD(h: number): string {
  const k = h / 56;
  return polyD(
    [
      [6, -28],
      [-12, 4],
      [-1, 4],
      [-8, 28],
      [13, -6],
      [2, -6],
      [10, -28],
    ].map(([x, y]) => [(x ?? 0) * k, (y ?? 0) * k] as [number, number]),
  );
}

/** v1.6b (D-043) Blitslaai icon (HUD chip): a shell with a lightning bolt across it. */
function puBlitslaai(p: SpriteCtx): string {
  return g(
    {},
    shellD(p, -6, 2, 50, -12),
    g({ transform: 'translate(9 -2) rotate(14)' }, inked(boltD(50), p.c('flashOuter'), p.ink, 3)),
    g({ transform: 'translate(9 -2) rotate(14)' }, flat(boltD(26), p.c('flashCore'))),
  );
}

/** v1.6b (D-043) Oupa Laai icon (HUD chip and belt): Oupa's weathered hand holding two shells,
 *  his khaki cuff at the bottom right. */
function puOupaLaai(p: SpriteCtx): string {
  const skin = '#C98E62';
  const skinDark = shade(skin, -0.25);
  const khaki = '#A08A55';
  const fingers = [-11, -3, 5].map((y, i) =>
    inked(ellipseD(-4 + i * 1.5, y + 6, 10, 4.6), skin, p.ink, 2),
  );
  return g(
    {},
    shellD(p, -9, -6, 34, -18),
    shellD(p, 3, -9, 34, 6),
    // Palm and thumb under the shells, the fingers curled over their fronts.
    inked('M-4 6Q10 -2 22 8L26 20Q14 28 0 24Q-8 18 -4 6Z', skin, p.ink, 2.5),
    flat('M6 20Q14 22 22 18L24 22Q14 26 4 23Z', skinDark),
    ...fingers,
    inked('M12 2Q4 -4 -2 0Q2 6 12 8Z', skin, p.ink, 2),
    inked('M18 14L30 10L32 26L22 30Z', khaki, p.ink, 2.5),
    flat('M24 14L30 12L31 24L26 26Z', shade(khaki, -0.2)),
  );
}

/** v1.7b (D-046) Chilli Biltong icon: a strip of dried biltong, a red chilli across it. */
function puChilliBiltong(p: SpriteCtx): string {
  const meat = tone('#7A2E22', 0.3, 0.25);
  const chilli = tone(p.c('shellRed'), 0.3, 0.35);
  const strip = smoothD(
    [
      [-26, 14],
      [-20, 4],
      [-4, -10],
      [14, -22],
      [24, -24],
      [27, -16],
      [16, -4],
      [0, 10],
      [-14, 22],
      [-24, 24],
    ],
    true,
    0.7,
  );
  const specks: string[] = [];
  for (let k = 0; k < 9; k++) {
    const t = k / 8;
    const x = -20 + t * 40 + (p.rnd() - 0.5) * 6;
    const y = 14 - t * 32 + (p.rnd() - 0.5) * 6;
    specks.push(flat(ellipseD(x, y, 1.2, 1.2), k % 2 === 0 ? '#2A1A12' : '#C9862C'));
  }
  return g(
    {},
    inked(strip, meat.fill, p.ink, 2.5),
    // The fat edge along the top of the strip, the darker cut face below.
    flat('M-20 6Q-4 -8 14 -20L22 -22Q8 -10 -16 10Z', '#E9D6A2', { opacity: 0.85 }),
    flat('M-12 20Q4 8 18 -6L24 -14Q10 6 -16 22Z', meat.dark),
    ...specks,
    // The chilli: a curved pod, green cap and stalk at the top left.
    inked('M-10 -16Q6 -18 18 -4Q26 8 22 20Q16 8 6 0Q-4 -8 -12 -10Z', chilli.fill, p.ink, 2.5),
    flat('M-4 -14Q8 -14 16 -4Q12 -8 2 -12Z', chilli.light),
    flat('M12 4Q20 10 21 17Q17 9 10 6Z', chilli.dark),
    inked('M-14 -18Q-9 -20 -8 -14Q-10 -9 -14 -10Q-17 -14 -14 -18Z', '#5E8C3A', p.ink, 2),
    line('M-14 -18Q-18 -24 -14 -28', pen(p, 2.5)),
  );
}

/** v1.7b (D-046) Boeretroos icon: a blue enamel mug of farm coffee, steaming. */
function puBoeretroos(p: SpriteCtx): string {
  const enamel = tone(p.c('enamel'), 0.3, 0.3);
  const steam = (x: number): string =>
    line(`M${x} -12Q${x - 5} -18 ${x} -23Q${x + 5} -28 ${x} -32`, { ink: p.c('cream'), w: 3 }, 3, {
      opacity: '0.85',
    });
  return g(
    { transform: 'translate(0 3)' },
    steam(-8),
    steam(2),
    steam(10),
    // Handle on the right, then the body, its rim and the coffee.
    inked('M14 -2Q28 -2 28 9Q28 20 14 20L14 15Q22 15 22 9Q22 3 14 3Z', enamel.fill, p.ink, 2.5),
    inked('M-18 -6L16 -6L14 24Q-1 28 -16 24Z', enamel.fill, p.ink, 2.5),
    flat('M6 -4L14 -4L12 23Q8 25 4 25Z', enamel.dark),
    flat('M-14 -2L-10 -2L-11 20L-14 20Z', enamel.light),
    // Chipped enamel: a dark spot near the base.
    flat(ellipseD(-6, 18, 3, 2), '#1B1410'),
    inked(ellipseD(-1, -6, 17, 4.5), p.c('cream'), p.ink, 2.5),
    flat(ellipseD(-1, -5.5, 13, 3), '#5A3418'),
    flat(ellipseD(-5, -6.5, 4, 1), '#8B5A2B'),
  );
}

/** v1.7b (D-046) Bush Buckshot icon: a fat shell bursting into a wide spray of pellets. */
function puBushBuckshot(p: SpriteCtx): string {
  const pellets: string[] = [];
  const rays: string[] = [];
  for (let k = 0; k < 11; k++) {
    const a = ((k / 10) * 2 - 1) * 0.75;
    const r = 18 + p.rnd() * 14;
    const x = -2 + Math.cos(a) * r;
    const y = -4 + Math.sin(a) * r * 1.2;
    pellets.push(inked(ellipseD(x, y, 2.6, 2.6), '#4A4A48', p.ink, 1.5));
  }
  for (const a of [-0.6, -0.2, 0.2, 0.6]) {
    const x0 = -2 + Math.cos(a) * 6;
    const y0 = -4 + Math.sin(a) * 6;
    const x1 = -2 + Math.cos(a) * 30;
    const y1 = -4 + Math.sin(a) * 34;
    rays.push(line(`M${r2(x0)} ${r2(y0)}L${r2(x1)} ${r2(y1)}`, { ink: p.c('flashOuter'), w: 3 }));
  }
  return g(
    { transform: 'translate(5 2) scale(0.9)' },
    // The burst at the shell's mouth, the spray fanning out to the right.
    inked(starD(8, 13, 6, 0.2), p.c('flashOuter'), p.ink, 2, {
      transform: 'translate(-4 -4)',
    }),
    flat(starD(8, 7, 3.5, 0.2), p.c('flashCore'), { transform: 'translate(-4 -4)' }),
    ...rays,
    ...pellets,
    shellD(p, -18, 2, 40, -75),
  );
}

/** v1.7b (D-046) Meerkat Spotter icon: a stocky meerkat in profile, sitting up, its paws holding
 *  a pair of binoculars to its eyes and looking out to the right, filling the square (the helper
 *  sprite read as a thin stick at chip size). */
function puMeerkatSpotter(p: SpriteCtx): string {
  const fur = tone(p.c('meerkat'), 0.25, 0.28);
  const dark = shade(p.c('meerkat'), -0.55);
  const steel = tone('#3A3F44', 0.3, 0.45);
  return g(
    { transform: 'translate(-2 1)' },
    // Tail down behind, curling at the ground.
    inked('M-14 26Q-28 28 -27 16Q-24 24 -14 22Z', fur.dark, p.ink, 2),
    // Body: a fat pear sitting up, pale belly at the front, dark back stripes.
    inked('M-20 30Q-26 8 -12 -4L4 -4Q16 6 14 30Z', fur.fill, p.ink, 2.6),
    flat('M2 -2Q14 8 12 29L5 29Q8 10 -2 0Z', fur.light),
    line('M-20 12l6 -2M-21 19l6 -2M-20 25l6 -1', { ink: fur.dark, w: 2.2 }),
    // Hind foot at the front.
    inked(ellipseD(8, 30, 7, 2.6), fur.dark, p.ink, 1.8),
    // Head: round skull, a pointed snout to the right, a small dark ear at the back.
    inked(ellipseD(-9, -15, 3.6, 3.2), dark, p.ink, 1.6),
    inked(
      'M-14 -14Q-15 -27 -2 -27Q8 -27 12 -20L18 -14Q19 -11 16 -10L4 -6Q-10 -2 -14 -14Z',
      fur.fill,
      p.ink,
      2.6,
    ),
    flat('M4 -10L16 -12L15 -10L4 -7Z', fur.light),
    flat(ellipseD(17.5, -12.5, 1.8, 1.6), p.ink),
    // The binoculars at its eye, pointing out to the right: two barrels, the front lens.
    inked('M2 -27L19 -27Q22 -27 22 -24L22 -19Q22 -16 19 -16L2 -16Z', steel.fill, p.ink, 2.2),
    flat('M4 -25.4L19 -25.4L19 -24L4 -24Z', steel.light),
    line('M2 -21.5L22 -21.5', { ink: p.ink, w: 1.4 }),
    inked(ellipseD(23, -21.5, 2.6, 5.6), '#1B2A3A', p.ink, 1.8),
    flat(ellipseD(23.4, -23.6, 0.9, 1.5), '#BFE3F0'),
    // Its arm up from the chest, the paw gripping the binoculars from below.
    inked('M-10 4Q-6 -6 1 -15L6 -14Q0 -4 -5 6Z', fur.fill, p.ink, 2),
    inked(ellipseD(4, -15.5, 4, 3.2), fur.light, p.ink, 1.8),
    // The ear on top (drawn last so it shows), the dark eye ring behind the eyepiece, the mouth.
    inked(ellipseD(-9, -20, 3.4, 3), dark, p.ink, 1.6),
    flat(ellipseD(0, -21.5, 3.4, 4), dark),
    line('M10 -7.5Q14 -7 17 -9', { ink: p.ink, w: 1.4 }),
  );
}

/** v1.7b (D-046) The Voorlaaier's icon: a stout blunderbuss — a thick stock, a heavy barrel with
 *  a flared bell, the ramrod under it and a puff of black-powder smoke at the muzzle. */
function puVoorlaaier(p: SpriteCtx): string {
  const wood = tone(p.c('wood'), 0.28, 0.25);
  const steel = tone(p.c('metalDark'), 0.3, 0.35);
  const brass = '#C9A13B';
  const smoke = p.c('smoke');
  return g(
    { transform: 'translate(-4 2) scale(0.86) rotate(-16)' },
    // The smoke behind the bell.
    inked(ellipseD(33, -9, 5.5, 5), smoke, p.ink, 1.8),
    inked(ellipseD(36, 0, 6.5, 6), smoke, p.ink, 1.8),
    inked(ellipseD(31, 6, 4.5, 4), smoke, p.ink, 1.8),
    // The ramrod (wood, brass tip) under the barrel.
    line('M-4 6L25 5', { ink: p.ink, w: 4.6 }),
    line('M-4 6L25 5', { ink: wood.light, w: 2.2 }),
    inked('M24 3.4L28 3.3L28 6.6L24 6.7Z', brass, p.ink, 1.4),
    // Heavy barrel and its flared bell, two brass bands.
    inked('M-7 -5L22 -5L30 -10L30 7L22 2L-7 3Z', steel.fill, p.ink, 2.6),
    flat('M-5 -3.6L21 -3.6L28 -7.6L28 -5L21 -1.6L-5 -1.6Z', steel.light),
    flat('M-5 1L21 0.6L28 4.6L28 5.6L21 1.6L-5 2Z', steel.dark),
    inked('M3 -5.5L7 -5.5L7 3.5L3 3.5Z', brass, p.ink, 1.4),
    inked('M14 -5.5L17 -5.5L17 3L14 3Z', brass, p.ink, 1.4),
    // The stock: thick, brass butt plate; the lock plate, hammer and trigger guard.
    inked(
      'M-33 7Q-34 -5 -24 -7L-6 -6L-4 5L-10 8Q-16 10 -20 17L-31 19Q-35 15 -33 7Z',
      wood.fill,
      p.ink,
      2.8,
    ),
    flat('M-30 15L-20 14Q-16 8 -9 6L-19 13L-30 17Z', wood.dark),
    flat('M-27 -3L-10 -4L-10 -2L-27 -1Z', wood.light),
    inked('M-35 4L-31 2L-30 19L-34 18Z', brass, p.ink, 1.8),
    inked('M-14 -4L-6 -4L-6 1L-14 1Z', steel.fill, p.ink, 1.6),
    inked('M-10 -4L-13 -11L-8 -12L-6 -4Z', steel.fill, p.ink, 1.8),
    line('M-14 6Q-14 12 -7 11', { ink: p.ink, w: 2.2 }),
  );
}

/** v1.7b (D-046) The Mielie-Masjien's icon: a fat corn cannon, a mielie cob in its hopper. */
function puMielieMasjien(p: SpriteCtx): string {
  const steel = tone(p.c('metal'), 0.3, 0.3);
  const green = tone('#5E7A3A', 0.3, 0.3);
  const corn = tone(p.c('rb3'), 0.25, 0.3);
  const kernels: string[] = [];
  for (let row = 0; row < 3; row++)
    for (let k = 0; k < 4; k++)
      kernels.push(flat(ellipseD(-9 + k * 5 + (row % 2) * 2, -24 + row * 4, 1.8, 1.5), corn.dark));
  return g(
    { transform: 'translate(1 3) scale(0.86)' },
    // The cob standing in the hopper (husk leaves either side).
    inked(ellipseD(-2, -20, 11, 7), corn.fill, p.ink, 2),
    ...kernels,
    inked('M-14 -14Q-18 -24 -12 -30Q-12 -20 -8 -14Z', green.fill, p.ink, 1.8),
    inked('M10 -14Q16 -24 10 -30Q10 -20 4 -14Z', green.fill, p.ink, 1.8),
    // Hopper, the fat barrel with its bands, the crank and the bipod legs.
    inked('M-14 -14L10 -14L6 -4L-10 -4Z', steel.dark, p.ink, 2.2),
    inked('M-26 -6L22 -8Q30 -8 30 0Q30 8 22 8L-26 8Q-30 1 -26 -6Z', green.fill, p.ink, 2.5),
    flat('M-24 3L24 3Q28 3 27 6L-25 6Z', green.dark),
    flat('M-22 -3L22 -5L22 -3L-22 -1Z', green.light),
    inked('M8 -8L12 -8L12 8L8 8Z', steel.fill, p.ink, 1.6),
    inked('M-12 -6L-8 -6L-8 8L-12 8Z', steel.fill, p.ink, 1.6),
    inked(ellipseD(30, 0, 3, 7), '#2A2422', p.ink, 2),
    line('M-26 0L-32 -6L-34 -2', { ink: p.ink, w: 2.5 }),
    line('M-14 8L-20 24M2 8L8 24', { ink: p.ink, w: 3 }),
    // Kernels flying out of the muzzle.
    inked(ellipseD(26, -14, 2.4, 2), corn.fill, p.ink, 1.4),
    inked(ellipseD(33, -18, 2.4, 2), corn.fill, p.ink, 1.4),
    inked(ellipseD(30, -24, 2.4, 2), corn.fill, p.ink, 1.4),
  );
}

/** v1.6b (D-043) Blitslaai's glint on the belt: a small spark of lightning (a local sprite). */
function boltGlint(p: SpriteCtx): string {
  return g(
    {},
    inked(boltD(48), p.c('flashOuter'), p.ink, 2.5),
    flat(boltD(24), '#FFFFFF', { opacity: 0.9 }),
  );
}

/**
 * v1.6 (D-042, product owner: "the clouds need to be more realistic"): soft clouds, drawn small
 * (shown at 2×: soft edges need no resolution, and it keeps them a few KB) in white and neutral
 * grey; the game tints them per biome and weather. No ink: rounded lobes with sunlit tops, a
 * soft grey-blue flat base, blurred edges.
 */
function cloudSprite(kind: 'cumulus' | 'wide' | 'cirrus' | 'tower') {
  return (p: SpriteCtx): string => {
    const blur = nextId();
    const grad = nextId();
    const defs = el(
      'defs',
      {},
      el(
        'filter',
        { id: blur, x: '-20%', y: '-30%', width: '140%', height: '160%' },
        el('feGaussianBlur', { stdDeviation: kind === 'cirrus' ? 2.2 : 1.6 }),
      ),
      el(
        'linearGradient',
        { id: grad, x1: 0, y1: 0, x2: 0, y2: 1 },
        el('stop', { offset: 0, 'stop-color': '#FFFFFF' }),
        el('stop', { offset: 0.55, 'stop-color': '#EEF1F4' }),
        el('stop', { offset: 1, 'stop-color': '#B4C0CC' }),
      ),
    );
    if (kind === 'cirrus') {
      const d: string[] = [];
      for (let k = 0; k < 9; k++) {
        const y = -14 + p.rnd() * 28;
        const x0 = -140 + p.rnd() * 60;
        const len = 110 + p.rnd() * 90;
        d.push(
          `M${r2(x0)} ${r2(y)}q${r2(len * 0.5)} ${r2(-6 - p.rnd() * 8)} ${r2(len)} ${r2(2 + p.rnd() * 8)}`,
        );
      }
      return g(
        {},
        defs,
        el('path', {
          d: d.join(''),
          fill: 'none',
          stroke: '#FFFFFF',
          'stroke-width': 5,
          'stroke-linecap': 'round',
          opacity: 0.75,
          filter: `url(#${blur})`,
        }),
        el('path', {
          d: d.slice(0, 4).join(''),
          fill: 'none',
          stroke: '#FFFFFF',
          'stroke-width': 1.6,
          'stroke-linecap': 'round',
          opacity: 0.8,
        }),
      );
    }
    // v1.6 look note D: soft billows (no dotted highlights), a flat grey-blue base.
    const tones = { base: '#B4C0CE', body: '#E4E9EE', top: '#FFFFFF' };
    if (kind === 'tower')
      return g({}, defs, billowCloud(p.rnd, 0, 66, 150, 70, tones, { towers: 2, blur: 1.6 }));
    if (kind === 'wide')
      return g({}, defs, billowCloud(p.rnd, 0, 38, 228, 62, tones, { blur: 1.4 }));
    return g({}, defs, billowCloud(p.rnd, 0, 38, 168, 70, tones, { blur: 1.4 }));
  };
}

/** Every shared sprite key → its drawing (sizes/origins come from the placeholder manifest). */
export const SPRITES: readonly SpriteSpec[] = [
  { key: 'ui/badge_no', wobble: 0, draw: badgeNo },
  { key: 'ui/windsock', wobble: 1, draw: windsock },
  // v1.7b (D-046): every power-up and crate gun has an icon, drawn in a 64-unit box and shown
  // on a 128 px texture (crisp on HUD chips, crates and the Gun Shed's big cards).
  ...(
    [
      ['blitslaai', puBlitslaai],
      ['oupa_laai', puOupaLaai],
      ['chilli_biltong', puChilliBiltong],
      ['boeretroos', puBoeretroos],
      ['bush_buckshot', puBushBuckshot],
      ['meerkat_spotter', puMeerkatSpotter],
      ['voorlaaier', puVoorlaaier],
      ['mielie_masjien', puMielieMasjien],
    ] as const
  ).map(([id, draw]) => ({
    key: `ui/pu_${id}`,
    wobble: 0.6,
    draw: (p: SpriteCtx) => g({ transform: 'scale(2)' }, draw(p)),
  })),
  { key: 'fx/bolt', wobble: 0.4, draw: boltGlint },
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
  { key: 'fx/weaver_up', wobble: 0, draw: (p) => weaver(p, true) },
  { key: 'fx/weaver_down', wobble: 0, draw: (p) => weaver(p, false) },
  { key: 'omen/glare', wobble: 0, draw: glare },
  { key: 'omen/rain', wobble: 0, draw: rain },
  { key: 'omen/rainbow', wobble: 0, draw: rainbow },
  { key: 'secret/mark', wobble: 0.8, draw: mark },
  { key: 'secret/mark_hit', wobble: 0.8, draw: markHit },
  { key: 'secret/rotor', wobble: 0, draw: rotor },
  { key: 'fx/windpomp_vane', wobble: 0, draw: windpompVane },
  { key: 'sky/cloud_cumulus', wobble: 0, draw: cloudSprite('cumulus') },
  { key: 'sky/cloud_wide', wobble: 0, draw: cloudSprite('wide') },
  { key: 'sky/cloud_cirrus', wobble: 0, draw: cloudSprite('cirrus') },
  { key: 'sky/cloud_tower', wobble: 0, draw: cloudSprite('tower') },
  { key: 'biome/water', wobble: 1.5, draw: water },
];

/**
 * v1.4 B (D-039): a sociable weaver in flight (96 × 64, centred, facing right): a sparrow-sized
 * brown bird with a black chin and face, a scaly back of dark feathers with pale edges, black
 * flank bars and a pale bluish bill. Wings up or down for the wingbeat.
 */
function weaver(p: SpriteCtx, up: boolean): string {
  const ink = mix(p.ink, '#4A3624', 0.4);
  const brown = '#8C6A48';
  const wing = (dir: number): string => {
    const d = `M-4 -3Q-12 ${dir * 22} -34 ${dir * 27}Q-30 ${dir * 20} -26 ${dir * 17}Q-20 ${dir * 9} 8 -1Z`;
    const bars: string[] = [];
    for (let k = 0; k < 4; k++) {
      const t = 0.3 + k * 0.17;
      bars.push(`M${r2(-4 - 26 * t)} ${r2(dir * 24 * t)}l${r2(-4)} ${r2(dir * 5)}`);
    }
    return g(
      {},
      el('path', {
        d,
        fill: '#6E5136',
        stroke: ink,
        'stroke-width': 1.2,
        'stroke-linejoin': 'round',
      }),
      el('path', {
        d: bars.join(''),
        stroke: '#E9DCC2',
        'stroke-width': 1.4,
        'stroke-linecap': 'round',
        opacity: 0.8,
      }),
    );
  };
  const body = smoothD(
    [
      [-24, -1],
      [-14, -9],
      [4, -10],
      [16, -6],
      [18, 4],
      [4, 10],
      [-14, 8],
    ],
    true,
    0.8,
  );
  const clip = nextId();
  const grad = nextId();
  // The scaly back: rows of dark feathers, each with a pale crescent edge.
  const scales: string[] = [];
  const edges: string[] = [];
  for (let row = 0; row < 3; row++)
    for (let k = 0; k < 6; k++) {
      const x = -18 + k * 6 + (row % 2) * 3;
      const y = -8 + row * 3.6;
      scales.push(ellipseD(x, y, 3.4, 2.4));
      edges.push(`M${r2(x - 3)} ${r2(y + 1)}Q${r2(x)} ${r2(y + 3.4)} ${r2(x + 3)} ${r2(y + 1)}`);
    }
  return g(
    {},
    el(
      'linearGradient',
      { id: grad, x1: 0, y1: 0, x2: 0, y2: 1 },
      el('stop', { offset: 0, 'stop-color': shade(brown, -0.2) }),
      el('stop', { offset: 1, 'stop-color': '#D9C7A6' }),
    ),
    up ? wing(-1) : '',
    // Tail.
    el('path', {
      d: 'M-20 -2L-38 -7L-37 5Z',
      fill: '#5E4430',
      stroke: ink,
      'stroke-width': 1.2,
      'stroke-linejoin': 'round',
    }),
    el('clipPath', { id: clip }, el('path', { d: body })),
    el('path', { d: body, fill: `url(#${grad})` }),
    g(
      { 'clip-path': `url(#${clip})` },
      el('path', { d: scales.join(''), fill: '#5A4230' }),
      el('path', { d: edges.join(''), fill: 'none', stroke: '#EFE4CC', 'stroke-width': 1.1 }),
      // Black bars on the pale flank.
      el('path', {
        d: 'M-8 6l3 -3M-2 7l3 -3M4 7l3 -3',
        stroke: '#1B1410',
        'stroke-width': 1.4,
        'stroke-linecap': 'round',
      }),
    ),
    el('path', { d: body, fill: 'none', stroke: ink, 'stroke-width': 1.2 }),
    // Head: brown crown, black face and chin, pale bill, a bright eye.
    el('path', {
      d: ellipseD(20, -3, 8.5, 7.5),
      fill: '#A17E5A',
      stroke: ink,
      'stroke-width': 1.2,
    }),
    el('path', { d: 'M17 -2Q21 -6 27 -3Q28 3 24 6Q19 6 17 -2Z', fill: '#16100C' }),
    el('path', { d: 'M27 -4L36 -1.5L27 1.5Z', fill: '#BFC4C2', stroke: ink, 'stroke-width': 0.8 }),
    el('circle', { cx: 22.5, cy: -4.5, r: 1.3, fill: '#F6EEDC' }),
    up ? '' : wing(1),
  );
}

/** One sprite at its placeholder size; `origin` in fractions. */
export function renderSprite(
  cfg: ArtConfig,
  spec: SpriteSpec,
  size: { width: number; height: number },
  origin: { x: number; y: number },
  /** D-053: texture px per design px of the result (2 for an HD pack; never above masterScale). */
  res = 1,
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
  const out = Math.min(res, k);
  return out === k ? big : resize(big, size.width * out, size.height * out);
}
