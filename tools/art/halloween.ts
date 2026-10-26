// D-048: interim art for Halloween's Spookjag — one sheet (layout in
// src/game/feesdae/feesdaeAssets.ts) drawn at 2× in the D-035 semi-realistic style of the v1.6
// camelthorn: form from gradients and layered tones rather than flat fills, a warm-dark broken
// edge instead of a cartoon outline, small highlights where light catches.
// - Bats: a furry body and ears, membrane wings stretched between finger bones (translucent
//   where the moonlight comes through), three wing poses for the flap.
// - The spotted eagle-owl (Bubo africanus): grey-brown, a pale finely barred belly, ear tufts,
//   big yellow eyes, broad barred wings and tail; glide, wings up, wings down.
// - Pumpkin lanterns: a ribbed, glossy pumpkin with a carved face lit from inside, on a lichen
//   rock or a weathered fence post; the dark pair is the same pumpkin shot out (sooty cuts).
// - The moon (soft maria and a rim), little sky bats, witch hats in three sizes (bolder and
//   simpler the smaller they are), a corner cobweb with dew, a puff of smoke, a lantern glow.
// Coordinates: design px; each frame is drawn round its origin (feesdaeAssets.ts), facing right.
import {
  LANTERN_GROUND_PX,
  SHEET_H,
  SHEET_MASTER,
  SHEET_W,
  sheetFrames,
  type HalloweenFrame,
} from '../../src/game/feesdae/feesdaeAssets';
import type { Rgba } from '../assets/image';
import { renderSvg } from './raster';
import { el, ellipseD, g, polyD, prng, r2, smoothD, svgDoc } from './svg';

type P = readonly [number, number];

const C = {
  ink: '#1A1016',
  batFur: '#3A2E34',
  batFurLit: '#5C4A50',
  batSkin: '#2A1F28',
  batWing: '#3E2E3A',
  batWingLit: '#6A5262',
  batBone: '#22161E',
  owlBrown: '#7A6450',
  owlDark: '#4A3B30',
  owlLit: '#B8A288',
  owlPale: '#E8DCC8',
  owlBar: '#5C4A3C',
  owlEye: '#F2B21E',
  pumpkin: '#E8761C',
  pumpkinLit: '#FFA640',
  pumpkinShade: '#A9480E',
  pumpkinDeep: '#6E2C08',
  pumpkinDead: '#7E4A26',
  pumpkinDeadShade: '#4E2A14',
  stem: '#5E6B2C',
  stemShade: '#3A4418',
  flame: '#FFE68A',
  flameCore: '#FFFBE0',
  soot: '#1E120C',
  rock: '#8C8478',
  rockLit: '#B4AC9E',
  rockShade: '#5A544C',
  lichen: '#B8B26A',
  wood: '#7A6044',
  woodLit: '#A68A66',
  woodShade: '#4C3A28',
  moon: '#F6EDCB',
  moonShade: '#E0D2A4',
  moonMare: '#D4C496',
  hat: '#2A1C36',
  hatLit: '#4A3460',
  hatShade: '#170F20',
  band: '#E8761C',
  buckle: '#E8C25A',
  web: '#EDEFF6',
  smoke: '#6E6670',
} as const;

let seq = 0;
const uid = (p: string): string => `${p}${seq++}`;
const path = (d: string, fill: string, extra: Record<string, string | number> = {}): string =>
  el('path', { d, fill, ...extra });
const edge = (d: string, fill: string, w: number, ink: string = C.ink): string =>
  el('path', {
    d,
    fill,
    stroke: ink,
    'stroke-width': w,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
  });
const stroke = (d: string, colour: string, w: number, op = 1): string =>
  el('path', {
    d,
    fill: 'none',
    stroke: colour,
    'stroke-width': w,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    opacity: op,
  });

function radial(
  id: string,
  stops: readonly [number, string, number][],
  cx = 0.5,
  cy = 0.5,
): string {
  return el(
    'radialGradient',
    { id, cx, cy, r: 0.5 },
    ...stops.map(([o, c, a]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a })),
  );
}
function linear(id: string, stops: readonly [number, string][], x2 = 0, y2 = 1): string {
  return el(
    'linearGradient',
    { id, x1: 0, y1: 0, x2, y2 },
    ...stops.map(([o, c]) => el('stop', { offset: o, 'stop-color': c })),
  );
}

const DEFS = [
  radial(
    'moonFace',
    [
      [0, C.moon, 1],
      [0.8, C.moon, 1],
      [1, C.moonShade, 1],
    ],
    0.42,
    0.4,
  ),
  radial('moonHalo', [
    [0.82, '#FFF6D8', 0.5],
    [1, '#FFF6D8', 0],
  ]),
  radial('glow', [
    [0, '#FFD27A', 0.95],
    [0.35, '#FFA640', 0.55],
    [1, '#FF7A1A', 0],
  ]),
  radial(
    'pumpkin',
    [
      [0, C.pumpkinLit, 1],
      [0.6, C.pumpkin, 1],
      [1, C.pumpkinShade, 1],
    ],
    0.38,
    0.32,
  ),
  radial(
    'pumpkinDead',
    [
      [0, '#9A6038', 1],
      [0.6, C.pumpkinDead, 1],
      [1, C.pumpkinDeadShade, 1],
    ],
    0.38,
    0.32,
  ),
  radial(
    'carve',
    [
      [0, C.flameCore, 1],
      [0.5, C.flame, 1],
      [1, '#FF9A2A', 1],
    ],
    0.5,
    0.6,
  ),
  radial(
    'rock',
    [
      [0, C.rockLit, 1],
      [0.7, C.rock, 1],
      [1, C.rockShade, 1],
    ],
    0.35,
    0.25,
  ),
  linear(
    'post',
    [
      [0, C.woodShade],
      [0.35, C.woodLit],
      [0.7, C.wood],
      [1, C.woodShade],
    ],
    1,
    0,
  ),
  radial(
    'owlBody',
    [
      [0, C.owlLit, 1],
      [0.7, C.owlBrown, 1],
      [1, C.owlDark, 1],
    ],
    0.45,
    0.35,
  ),
  radial(
    'owlBelly',
    [
      [0, '#F4ECDC', 1],
      [1, '#CDBEA4', 1],
    ],
    0.45,
    0.3,
  ),
  linear('owlWing', [
    [0, C.owlLit],
    [0.5, C.owlBrown],
    [1, C.owlDark],
  ]),
  linear('batWing', [
    [0, C.batWingLit],
    [1, C.batWing],
  ]),
  radial(
    'batBody',
    [
      [0, C.batFurLit, 1],
      [1, C.batFur, 1],
    ],
    0.4,
    0.3,
  ),
  linear(
    'hat',
    [
      [0, C.hatShade],
      [0.4, C.hatLit],
      [1, C.hat],
    ],
    1,
    0,
  ),
  radial('smoke', [
    [0, '#8E8690', 0.75],
    [0.7, C.smoke, 0.45],
    [1, C.smoke, 0],
  ]),
].join('');

// --- bats ---------------------------------------------------------------------------------------

/** One bat, wing pose −1 (down) … 1 (up), size k (1 = the near-plane bat). */
function bat(pose: number, k: number, silhouette = false): string {
  const tip = -38 * pose;
  const parts: string[] = [];
  for (const side of [-1, 1] as const) {
    // Wrist and three finger tips; the membrane scallops between them.
    const wrist: P = [side * 34, -14 * pose - 6];
    const f1: P = [side * 78, tip - 8];
    const f2: P = [side * 72, tip + 22 + 6 * pose];
    const f3: P = [side * 48, 22 + 4 * pose];
    const body: P = [side * 8, 10];
    const pts: P[] = [
      [side * 6, -6],
      wrist,
      f1,
      [side * 70, tip + 8],
      f2,
      [side * 58, 18],
      f3,
      [side * 26, 20],
      body,
    ];
    const wing = smoothD(pts, true, 0.5);
    parts.push(
      silhouette
        ? path(wing, C.batSkin)
        : edge(wing, 'url(#batWing)', 1.4, C.batBone) +
            stroke(
              `M${r2(side * 6)} -6L${r2(wrist[0])} ${r2(wrist[1])}L${r2(f1[0])} ${r2(f1[1])}`,
              C.batBone,
              3,
            ) +
            stroke(`M${r2(wrist[0])} ${r2(wrist[1])}L${r2(f2[0])} ${r2(f2[1])}`, C.batBone, 2) +
            stroke(`M${r2(wrist[0])} ${r2(wrist[1])}L${r2(f3[0])} ${r2(f3[1])}`, C.batBone, 2) +
            // Moonlight through the thin skin near the bones.
            stroke(smoothD([wrist, [side * 60, tip + 4], f2], false), C.batWingLit, 3, 0.35),
    );
  }
  const head = smoothD(
    [
      [-9, -22],
      [-12, -34],
      [-5, -26],
      [0, -27],
      [5, -26],
      [12, -34],
      [9, -22],
      [8, -12],
      [0, -8],
      [-8, -12],
    ],
    true,
    0.6,
  );
  const body = ellipseD(0, 4, 12, 17);
  const out = silhouette
    ? path(body, C.batSkin) + path(head, C.batSkin)
    : edge(body, 'url(#batBody)', 1.6) +
      edge(head, 'url(#batBody)', 1.6) +
      stroke('M-4 -4Q0 2 4 -4M-5 4Q0 10 5 4M-4 12Q0 17 4 12', C.batFurLit, 1.4, 0.7) +
      el('circle', { cx: -4, cy: -19, r: 1.9, fill: '#F0E4C8' }) +
      el('circle', { cx: 4, cy: -19, r: 1.9, fill: '#F0E4C8' }) +
      el('circle', { cx: -4.3, cy: -19.4, r: 0.7, fill: '#FFFFFF' }) +
      el('circle', { cx: 3.7, cy: -19.4, r: 0.7, fill: '#FFFFFF' });
  return g({ transform: `scale(${r2(k)})` }, ...parts, out);
}

// --- the spotted eagle-owl ------------------------------------------------------------------------


/**
 * Wing pose −1 (down) … 1 (up). Seen from below and in front as it glides over: broad wings
 * spread wide (barred flight feathers, splayed dark-tipped primaries), the pale barred belly, and
 * the round face turned to the hunter — ear tufts, a grey facial disc and big yellow eyes.
 */
function owl(pose: number): string {
  const rnd = prng(900 + Math.round(pose * 10));
  const parts: string[] = [];
  for (const side of [-1, 1] as const) {
    const lift = -44 * pose;
    const sx = (x: number): number => side * x;
    // Leading edge from the shoulder to the wrist and out to the tip, trailing edge back in.
    const wing = smoothD(
      [
        [sx(22), -14],
        [sx(60), -26 + lift * 0.5],
        [sx(104), -34 + lift * 0.85],
        [sx(134), -30 + lift],
        [sx(150), -18 + lift],
        [sx(142), -4 + lift * 0.9],
        [sx(128), 14 + lift * 0.7],
        [sx(96), 26 + lift * 0.45],
        [sx(60), 28 + lift * 0.2],
        [sx(26), 20],
      ],
      true,
      0.6,
    );
    const id = uid('ow');
    // Splayed primaries at the tip: five dark-tipped fingers.
    const fingers: string[] = [];
    for (let i = 0; i < 5; i++) {
      const fx = 116 + i * 5;
      const fy = -26 + lift + i * 9;
      fingers.push(
        edge(
          smoothD(
            [
              [sx(fx - 18), fy - 2],
              [sx(fx + 12), fy - 4],
              [sx(fx + 22), fy + 1],
              [sx(fx + 10), fy + 5],
              [sx(fx - 18), fy + 5],
            ],
            true,
            0.6,
          ),
          i % 2 === 0 ? C.owlBrown : C.owlDark,
          1,
        ),
      );
    }
    const barsD: string[] = [];
    for (let x = 34; x < 150; x += 11)
      barsD.push(
        `M${r2(sx(x))} ${r2(-22 + lift * (x / 160))}Q${r2(sx(x + 4))} ${r2(4 + lift * (x / 180))} ${r2(sx(x - 2))} ${r2(26 + lift * (x / 260))}`,
      );
    parts.push(
      ...fingers,
      edge(wing, 'url(#owlWing)', 1.6),
      el('clipPath', { id }, path(wing, '#000')),
      g(
        { 'clip-path': `url(#${id})` },
        stroke(barsD.join(''), C.owlBar, 3, 0.75),
        // The pale coverts along the leading edge, catching the moonlight.
        stroke(
          smoothD(
            [
              [sx(26), -10],
              [sx(70), -20 + lift * 0.55],
              [sx(118), -24 + lift * 0.9],
            ],
            false,
          ),
          C.owlLit,
          7,
          0.55,
        ),
      ),
    );
  }
  const body = smoothD(
    [
      [0, -40],
      [26, -30],
      [32, 0],
      [24, 36],
      [0, 52],
      [-24, 36],
      [-32, 0],
      [-26, -30],
    ],
    true,
    0.7,
  );
  const belly = smoothD(
    [
      [0, -10],
      [20, -2],
      [22, 26],
      [0, 46],
      [-22, 26],
      [-20, -2],
    ],
    true,
    0.7,
  );
  const tail = smoothD(
    [
      [-16, 42],
      [16, 42],
      [22, 70],
      [0, 76],
      [-22, 70],
    ],
    true,
    0.6,
  );
  const bellyId = uid('ob');
  const barLines: string[] = [];
  for (let y = 0; y < 48; y += 4.5) barLines.push(`M-24 ${r2(y)}Q0 ${r2(y + 2.4)} 24 ${r2(y)}`);
  const spots: string[] = [];
  for (let i = 0; i < 12; i++)
    spots.push(ellipseD(-18 + rnd() * 36, -30 + rnd() * 16, 2 + rnd() * 1.4, 1.4 + rnd()));
  const head = ellipseD(0, -48, 30, 27);
  const tufts = `${polyD([
    [-22, -62],
    [-30, -88],
    [-10, -70],
  ])}${polyD([
    [22, -62],
    [30, -88],
    [10, -70],
  ])}`;
  const discL = ellipseD(-11, -46, 13, 14);
  const discR = ellipseD(11, -46, 13, 14);
  const eye = (x: number): string =>
    el('circle', { cx: x, cy: -48, r: 7.4, fill: C.owlEye, stroke: C.ink, 'stroke-width': 1.4 }) +
    el('circle', { cx: x, cy: -48, r: 3.9, fill: C.ink }) +
    el('circle', { cx: x - 1.8, cy: -50, r: 1.5, fill: '#FFFFFF' });
  return g(
    {},
    ...parts,
    edge(tail, C.owlBrown, 1.4),
    stroke('M-16 52L16 52M-18 60L18 60M-20 68L20 68', C.owlBar, 2.4, 0.8),
    edge(body, 'url(#owlBody)', 1.6),
    path(belly, 'url(#owlBelly)'),
    el('clipPath', { id: bellyId }, path(belly, '#000')),
    g({ 'clip-path': `url(#${bellyId})` }, stroke(barLines.join(''), C.owlBar, 1.3, 0.8)),
    path(spots.join(''), C.owlPale, { opacity: 0.85 }),
    // Yellow feet tucked under, dark talons.
    edge(ellipseD(-9, 48, 5, 4), '#C9A23A', 1),
    edge(ellipseD(9, 48, 5, 4), '#C9A23A', 1),
    edge(tufts, C.owlDark, 1.2),
    edge(head, 'url(#owlBody)', 1.6),
    path(discL, '#C9B79A'),
    path(discR, '#C9B79A'),
    stroke(
      smoothD(
        [
          [-24, -46],
          [-12, -62],
          [0, -54],
          [12, -62],
          [24, -46],
        ],
        false,
      ),
      C.owlDark,
      2.4,
    ),
    eye(-11),
    eye(11),
    edge(
      polyD([
        [-4, -40],
        [4, -40],
        [0, -31],
      ]),
      '#3A3430',
      1,
    ),
  );
}

// --- pumpkin lanterns -----------------------------------------------------------------------------

function pumpkin(lit: boolean): string {
  const fill = lit ? 'url(#pumpkin)' : 'url(#pumpkinDead)';
  const ribs: string[] = [];
  for (const [cx, rx] of [
    [-24, 18],
    [24, 18],
    [-11, 20],
    [11, 20],
    [0, 17],
  ] as const)
    ribs.push(edge(ellipseD(cx, 2, rx, 36), fill, 1.6, lit ? '#5A2408' : '#2E180C'));
  const shine = lit ? stroke('M-30 -18Q-26 -28 -16 -32', '#FFD9A0', 3.4, 0.7) : '';
  const face = [
    polyD([
      [-24, -10],
      [-9, -16],
      [-12, -2],
    ]),
    polyD([
      [24, -10],
      [9, -16],
      [12, -2],
    ]),
    polyD([
      [-3, 0],
      [3, 0],
      [0, 7],
    ]),
    polyD([
      [-26, 12],
      [-14, 16],
      [-8, 12],
      [0, 18],
      [8, 12],
      [14, 16],
      [26, 12],
      [18, 26],
      [6, 23],
      [0, 28],
      [-6, 23],
      [-18, 26],
    ]),
  ].join('');
  const cut = lit
    ? path(face, 'url(#carve)') + stroke(face, '#B4560E', 1.2)
    : path(face, C.soot) + stroke(face, '#3A2214', 1.2);
  const stem = edge(
    smoothD(
      [
        [-5, -33],
        [-4, -44],
        [2, -50],
        [8, -47],
        [5, -42],
        [5, -33],
      ],
      true,
      0.6,
    ),
    C.stem,
    1.4,
    C.stemShade,
  );
  const soot = lit ? '' : path(ellipseD(0, -24, 16, 8), '#2A1A10', { opacity: 0.45 });
  return g({}, ...ribs, shine, cut, soot, stem);
}

function rock(seed: number): string {
  const rnd = prng(seed);
  const pts: P[] = [];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    pts.push([Math.cos(a) * (50 + rnd() * 6), Math.sin(a) * (24 + rnd() * 6)]);
  }
  pts.push([50, 4], [-50, 4]);
  const g0 = LANTERN_GROUND_PX;
  const d = smoothD(
    pts.map(([x, y]) => [x, g0 + y * 0.9 - 2] as const),
    true,
    0.7,
  );
  const lichen: string[] = [];
  for (let i = 0; i < 7; i++)
    lichen.push(ellipseD(-36 + rnd() * 70, g0 - 16 + rnd() * 10, 3 + rnd() * 4, 2 + rnd() * 2));
  return (
    path(ellipseD(0, g0 + 6, 58, 7), '#000', { opacity: 0.28 }) +
    edge(d, 'url(#rock)', 1.6, '#3A362F') +
    stroke(`M-30 ${r2(g0 - 14)}Q-10 ${r2(g0 - 20)} 18 ${r2(g0 - 16)}`, C.rockLit, 2.6, 0.6) +
    stroke(
      `M-12 ${r2(g0 - 6)}L-2 ${r2(g0 + 2)}M20 ${r2(g0 - 8)}L28 ${r2(g0)}`,
      C.rockShade,
      1.6,
      0.8,
    ) +
    path(lichen.join(''), C.lichen, { opacity: 0.75 })
  );
}

function post(): string {
  const g0 = LANTERN_GROUND_PX;
  const top = 26;
  const body = polyD([
    [-15, top],
    [15, top - 3],
    [16, g0 + 8],
    [-16, g0 + 8],
  ]);
  return (
    path(ellipseD(0, g0 + 8, 30, 5), '#000', { opacity: 0.28 }) +
    edge(body, 'url(#post)', 1.6, '#2E2216') +
    stroke(
      `M-8 ${top + 6}L-6 ${g0 + 4}M4 ${top + 10}L6 ${g0 + 2}M10 ${top + 4}L11 ${top + 20}`,
      C.woodShade,
      1.6,
      0.8,
    ) +
    edge(
      polyD([
        [-15, top],
        [15, top - 3],
        [12, top + 4],
        [-13, top + 6],
      ]),
      C.woodLit,
      1,
      '#2E2216',
    ) +
    // A strand of fence wire and a staple.
    stroke(
      `M-60 ${top + 18}Q-30 ${top + 22} -15 ${top + 18}M15 ${top + 17}Q40 ${top + 21} 62 ${top + 16}`,
      '#8A8C90',
      1.6,
      0.8,
    )
  );
}

function lantern(base: 'rock' | 'post', lit: boolean, seed: number): string {
  return g({}, base === 'rock' ? rock(seed) : post(), pumpkin(lit));
}

// --- moon, sky bats, hats, web, puff, glow --------------------------------------------------------

function moon(): string {
  const rnd = prng(1031);
  const maria: string[] = [];
  for (const [x, y, rx, ry] of [
    [-38, -30, 34, 24],
    [22, -40, 22, 16],
    [30, 16, 38, 26],
    [-20, 34, 24, 16],
    [-58, 10, 14, 12],
  ] as const)
    maria.push(path(ellipseD(x, y, rx, ry), C.moonMare, { opacity: 0.55 }));
  const craters: string[] = [];
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * 96;
    const s = 3 + rnd() * 6;
    craters.push(
      el('circle', {
        cx: Math.cos(a) * r,
        cy: Math.sin(a) * r,
        r: s,
        fill: C.moonShade,
        opacity: 0.6,
      }) +
        el('circle', {
          cx: Math.cos(a) * r - s * 0.3,
          cy: Math.sin(a) * r - s * 0.3,
          r: s * 0.55,
          fill: '#FFFBEA',
          opacity: 0.5,
        }),
    );
  }
  return g(
    {},
    path(ellipseD(0, 0, 138, 138), 'url(#moonHalo)'),
    path(ellipseD(0, 0, 118, 118), 'url(#moonFace)'),
    ...maria,
    ...craters,
  );
}

function hat(scale: 'l' | 'm' | 's'): string {
  // The smaller hats are bolder: thicker edge, no buckle detail on the smallest.
  const k = scale === 'l' ? 1 : scale === 'm' ? 0.54 : 0.28;
  const w = scale === 'l' ? 2.2 : scale === 'm' ? 2 : 1.6;
  const brim = ellipseD(0, 0, 60 * k, 11 * k);
  const cone = smoothD(
    [
      [-30 * k, -4 * k],
      [-20 * k, -46 * k],
      [-6 * k, -82 * k],
      [14 * k, -98 * k],
      [34 * k, -90 * k],
      [16 * k, -80 * k],
      [10 * k, -46 * k],
      [28 * k, -4 * k],
    ],
    true,
    0.55,
  );
  const band = polyD([
    [-29 * k, -6 * k],
    [28 * k, -6 * k],
    [25 * k, -20 * k],
    [-26 * k, -20 * k],
  ]);
  const buckle =
    scale === 's'
      ? ''
      : edge(
          polyD([
            [-6 * k, -8 * k],
            [6 * k, -8 * k],
            [6 * k, -19 * k],
            [-6 * k, -19 * k],
          ]),
          'none',
          2.4 * k + 0.6,
          C.buckle,
        );
  return g(
    {},
    edge(brim, 'url(#hat)', w),
    edge(cone, 'url(#hat)', w),
    path(band, C.band),
    buckle,
    scale === 's'
      ? ''
      : stroke(
          smoothD(
            [
              [-16 * k, -12 * k],
              [-10 * k, -52 * k],
              [4 * k, -84 * k],
            ],
            false,
          ),
          C.hatLit,
          2.4 * k + 0.4,
          0.6,
        ),
  );
}

function cobweb(): string {
  const rnd = prng(77);
  const spokes: P[] = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1)) * (Math.PI / 2);
    const r = 200 + rnd() * 16;
    spokes.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const lines = spokes.map(([x, y]) => `M0 0L${r2(x)} ${r2(y)}`).join('');
  const rings: string[] = [];
  for (let ring = 1; ring <= 6; ring++) {
    const f = ring / 6.4;
    const pts = spokes.map(([x, y]) => [x * f, y * f] as const);
    let d = `M${r2(pts[0]?.[0] ?? 0)} ${r2(pts[0]?.[1] ?? 0)}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1] ?? [0, 0];
      const [x1, y1] = pts[i] ?? [0, 0];
      // Each strand sags towards the corner between two spokes.
      d += `Q${r2(((x0 + x1) / 2) * 0.9)} ${r2(((y0 + y1) / 2) * 0.9)} ${r2(x1)} ${r2(y1)}`;
    }
    rings.push(d);
  }
  const dew: string[] = [];
  for (let i = 0; i < 9; i++) {
    const a = rnd() * (Math.PI / 2);
    const r = 40 + rnd() * 150;
    dew.push(
      el('circle', {
        cx: Math.cos(a) * r,
        cy: Math.sin(a) * r,
        r: 1.6 + rnd() * 1.2,
        fill: '#FFFFFF',
        opacity: 0.85,
      }),
    );
  }
  return g(
    {},
    stroke(lines, C.web, 1.8, 0.85),
    stroke(rings.join(''), C.web, 1.3, 0.75),
    ...dew,
    // A small spider at the hub's edge.
    el('circle', { cx: 46, cy: 40, r: 5, fill: '#1A1214' }),
    stroke(
      'M42 36L34 30M42 40L32 40M42 44L34 50M50 36L58 30M50 40L60 40M50 44L58 50',
      '#1A1214',
      1.4,
    ),
  );
}

function puff(): string {
  return g(
    {},
    path(ellipseD(0, 4, 46, 36), 'url(#smoke)'),
    path(ellipseD(-24, 12, 28, 22), 'url(#smoke)'),
    path(ellipseD(22, -12, 26, 22), 'url(#smoke)'),
    path(ellipseD(4, -26, 20, 16), 'url(#smoke)'),
  );
}

function frameArt(name: HalloweenFrame, seed: number): string {
  switch (name) {
    case 'moon':
      return moon();
    case 'glow':
      return path(ellipseD(0, 0, 108, 108), 'url(#glow)');
    case 'cobweb':
      return cobweb();
    case 'puff':
      return puff();
    case 'bat_0':
      return bat(1, 1);
    case 'bat_1':
      return bat(0.1, 1);
    case 'bat_2':
      return bat(-0.9, 1);
    case 'skybat_0':
      return bat(0.9, 0.4, true);
    case 'skybat_1':
      return bat(-0.7, 0.4, true);
    case 'owl_0':
      return owl(0.9);
    case 'owl_1':
      return owl(0);
    case 'owl_2':
      return owl(-0.8);
    case 'lantern_rock_lit':
      return lantern('rock', true, seed);
    case 'lantern_rock_dark':
      return lantern('rock', false, seed - 17);
    case 'lantern_post_lit':
      return lantern('post', true, seed);
    case 'lantern_post_dark':
      return lantern('post', false, seed);
    case 'hat_l':
      return hat('l');
    case 'hat_m':
      return hat('m');
    case 'hat_s':
      return hat('s');
  }
}

/** The whole sheet as SVG (design px viewBox, rendered at SHEET_MASTER×). */
export function halloweenSheetSvg(): string {
  seq = 0;
  const parts: string[] = [];
  for (const f of sheetFrames()) {
    const id = uid('cell');
    parts.push(
      g(
        {},
        el('clipPath', { id }, el('rect', { x: f.x, y: f.y, width: f.w, height: f.h })),
        g(
          { 'clip-path': `url(#${id})` },
          g(
            { transform: `translate(${r2(f.x + f.ox)} ${r2(f.y + f.oy)})` },
            frameArt(f.name, 3100 + parts.length * 13),
          ),
        ),
      ),
    );
  }
  return svgDoc(
    SHEET_W * SHEET_MASTER,
    SHEET_H * SHEET_MASTER,
    [0, 0, SHEET_W, SHEET_H],
    DEFS,
    parts.join(''),
  );
}

export function renderHalloweenSheet(): Rgba {
  return renderSvg(halloweenSheetSvg());
}
