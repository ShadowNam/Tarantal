// v1.7 (D-044): interim art for the desert maps' meerkat colonies — one sheet (layout in
// src/game/assets/desertAssets.ts) drawn at 2× in the D-035 semi-realistic style, at the v1.4
// camelthorn bar: layered shading, no flat shapes. The look (art bible §3.6): tan to grey-brown
// fur with faint darker bands across the back, a pale cream belly and face, dark eye patches,
// small dark ears and a dark nose, a thin tail with a black tip, a slim upright body; the
// sentinel holds its front paws in front of its belly. Light from the upper left.
//
// Every frame is built round the meerkat's feet at (0, 0) facing right (y up is negative), in
// design px at the near plane. Rim frames (in a hole) are cut at y = 0, the hole's rim.
import {
  CELL_H,
  CELL_W,
  MOUND_FRAMES,
  SHEET_H,
  SHEET_MASTER,
  SHEET_W,
  sheetFrames,
  type MeerkatFrame,
} from '../../src/game/assets/desertAssets';
import { renderSvg } from './raster';
import { el, ellipseD, g, place, prng, r2, smoothD, svgDoc } from './svg';
import type { Rgba } from '../assets/image';

type P = readonly [number, number];

const C = {
  furLit: '#D7B488',
  fur: '#B48E64',
  furShade: '#7D6247',
  band: '#4E3B2B',
  belly: '#F0E2C4',
  bellyShade: '#CDB693',
  face: '#EBDCC0',
  patch: '#2A1E16',
  ear: '#33251B',
  nose: '#1E1712',
  tip: '#17110D',
  ink: '#3D2C1F',
  eyeGlint: '#F6EBD6',
  mouth: '#5A2C22',
  sand: '#C98654',
  sandLit: '#E2A877',
  sandShade: '#A0603A',
  hole: '#2A150C',
  holeDeep: '#120905',
  pebble: '#8F6A4E',
} as const;

const INK_W = 1.3;

const DEFS = [
  el(
    'linearGradient',
    { id: 'fur', x1: 0, y1: 0, x2: 1, y2: 1 },
    el('stop', { offset: 0, 'stop-color': C.furLit }),
    el('stop', { offset: 0.5, 'stop-color': C.fur }),
    el('stop', { offset: 1, 'stop-color': C.furShade }),
  ),
  el(
    'linearGradient',
    { id: 'belly', x1: 0, y1: 0, x2: 0.6, y2: 1 },
    el('stop', { offset: 0, 'stop-color': C.belly }),
    el('stop', { offset: 1, 'stop-color': C.bellyShade }),
  ),
  el(
    'linearGradient',
    { id: 'sand', x1: 0, y1: 0, x2: 0.3, y2: 1 },
    el('stop', { offset: 0, 'stop-color': C.sandLit }),
    el('stop', { offset: 0.55, 'stop-color': C.sand }),
    el('stop', { offset: 1, 'stop-color': C.sandShade }),
  ),
  el(
    'radialGradient',
    { id: 'hole', cx: 0.5, cy: 0.35, r: 0.6 },
    el('stop', { offset: 0, 'stop-color': C.holeDeep }),
    el('stop', { offset: 0.7, 'stop-color': C.hole }),
    el('stop', { offset: 1, 'stop-color': C.sandShade }),
  ),
  el(
    'radialGradient',
    { id: 'shadow', cx: 0.5, cy: 0.5, r: 0.5 },
    el('stop', { offset: 0, 'stop-color': '#3A2216', 'stop-opacity': 0.35 }),
    el('stop', { offset: 1, 'stop-color': '#3A2216', 'stop-opacity': 0 }),
  ),
].join('');

let clipSeq = 0;

const path = (d: string, fill: string, extra: Record<string, string | number> = {}): string =>
  el('path', { d, fill, ...extra });
const inkPath = (d: string, fill: string, w = INK_W): string =>
  el('path', { d, fill, stroke: C.ink, 'stroke-width': w, 'stroke-linejoin': 'round' });
const stroke = (d: string, colour: string, w: number, opacity = 1): string =>
  el('path', {
    d,
    fill: 'none',
    stroke: colour,
    'stroke-width': w,
    'stroke-linecap': 'round',
    'stroke-opacity': opacity,
  });
const line = (pts: readonly P[]): string =>
  pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${r2(x)} ${r2(y)}`).join('');
const curve = (a: P, c: P, b: P): string =>
  `M${r2(a[0])} ${r2(a[1])}Q${r2(c[0])} ${r2(c[1])} ${r2(b[0])} ${r2(b[1])}`;

/**
 * A furred part: its gradient fill and ink, then — clipped to it — the shade on the far side,
 * the back's faint bands, a lit rim and a few fur strokes. `bands` are curves across the back.
 */
function furred(
  outline: readonly P[],
  opts: { bands?: readonly string[]; shade?: string; seed: number; strokes?: number },
): string {
  const d = smoothD(outline, true, 1);
  const id = `mk${clipSeq++}`;
  const rnd = prng(opts.seed);
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const hairs: string[] = [];
  for (let i = 0; i < (opts.strokes ?? 10); i++) {
    const x = x0 + (x1 - x0) * (0.15 + rnd() * 0.7);
    const y = y0 + (y1 - y0) * (0.1 + rnd() * 0.8);
    hairs.push(
      line([
        [x, y],
        [x - 1.5 - rnd() * 2, y + 2.5 + rnd() * 2],
      ]),
    );
  }
  return g(
    {},
    el('clipPath', { id }, path(d, '#000')),
    inkPath(d, 'url(#fur)'),
    g(
      { 'clip-path': `url(#${id})` },
      // Far-side shade: the lower right, away from the light.
      opts.shade === undefined ? '' : path(opts.shade, C.furShade, { opacity: 0.45 }),
      ...(opts.bands ?? []).map((b) => stroke(b, C.band, 2.2, 0.38)),
      stroke(hairs.join(''), C.furShade, 0.8, 0.55),
      // Lit rim on the upper left.
      path(d, 'none', {
        stroke: C.furLit,
        'stroke-width': 2.2,
        'stroke-opacity': 0.55,
        transform: 'translate(1.4 1.4)',
      }),
    ),
    path(d, 'none', { stroke: C.ink, 'stroke-width': INK_W }),
  );
}

/** A soft contact shadow on the sand under the feet. */
const shadow = (w: number, x = 0): string =>
  el('ellipse', { cx: x, cy: 1, rx: w, ry: w * 0.18, fill: 'url(#shadow)' });

/** The tail: thin and tapering along `pts`, its last third black. */
function tail(pts: readonly P[]): string {
  const n = pts.length;
  const origin: P = [0, 0];
  const a: P = pts[0] ?? origin;
  const b: P = pts[n - 1] ?? origin;
  const mid = pts[Math.floor(n / 2)] ?? a;
  const d = smoothD(pts, false, 1);
  const tipFrom = pts[Math.max(0, n - 2)] ?? mid;
  return g(
    {},
    stroke(d, C.ink, 5.6),
    stroke(d, C.fur, 3.6),
    stroke(smoothD([tipFrom, b], false, 1), C.tip, 3.8),
    stroke(curve(a, mid, mid), C.furLit, 1.2, 0.5),
  );
}

/** The head. view: 'side' (snout toward `dir`), or 'front'. mouth: open (scolding, barking). */
function head(
  cx: number,
  cy: number,
  view: 'side' | 'front',
  dir: 1 | -1,
  opts: { mouth?: boolean; up?: number; seed: number; scale?: number },
): string {
  const s = opts.scale ?? 1;
  const up = opts.up ?? 0;
  const T = (pts: readonly P[]): P[] => place(pts, cx, cy, up * dir, dir * s, s);
  if (view === 'front') {
    const skull = place(
      [
        [-12, -2],
        [-11, -11],
        [-4, -15],
        [4, -15],
        [11, -11],
        [12, -2],
        [7, 7],
        [3, 12],
        [-3, 12],
        [-7, 7],
      ],
      cx,
      cy,
      0,
      s,
      s,
    );
    return g(
      {},
      // Ears at the sides.
      inkPath(ellipseD(cx - 12 * s, cy - 6 * s, 3.5 * s, 4.5 * s), C.ear),
      inkPath(ellipseD(cx + 12 * s, cy - 6 * s, 3.5 * s, 4.5 * s), C.ear),
      furred(skull, { seed: opts.seed, strokes: 6 }),
      // The pale face and muzzle.
      path(
        smoothD(
          place(
            [
              [-8, 0],
              [-4, -6],
              [4, -6],
              [8, 0],
              [4, 11],
              [-4, 11],
            ],
            cx,
            cy,
            0,
            s,
            s,
          ),
        ),
        C.face,
        { opacity: 0.9 },
      ),
      // Dark eye patches with a glint.
      path(ellipseD(cx - 5 * s, cy - 3 * s, 3.6 * s, 2.6 * s), C.patch),
      path(ellipseD(cx + 5 * s, cy - 3 * s, 3.6 * s, 2.6 * s), C.patch),
      path(ellipseD(cx - 4.2 * s, cy - 3.8 * s, 0.9 * s, 0.9 * s), C.eyeGlint),
      path(ellipseD(cx + 5.8 * s, cy - 3.8 * s, 0.9 * s, 0.9 * s), C.eyeGlint),
      path(ellipseD(cx, cy + 8 * s, 2.4 * s, 1.8 * s), C.nose),
      opts.mouth === true ? path(ellipseD(cx, cy + 11.5 * s, 2.6 * s, 2.2 * s), C.mouth) : '',
    );
  }
  const skull = T([
    [-11, 2],
    [-10, -8],
    [-3, -13],
    [6, -11],
    [14, -5],
    [21, 1],
    [19, 4],
    [8, 6],
    [-4, 8],
  ]);
  const face = T([
    [2, -6],
    [12, -4],
    [20, 1],
    [17, 4],
    [6, 5],
    [1, 2],
  ]);
  const at = (p: P): P => T([p])[0] ?? [cx, cy];
  const ear = at([-6, -9]);
  const eye = at([7, -4]);
  const glint = at([8, -4.8]);
  const nose = at([20.5, 1.5]);
  const mouth = at([15, 5]);
  return g(
    {},
    inkPath(ellipseD(ear[0], ear[1], 3.6 * s, 3 * s), C.ear),
    furred(skull, { seed: opts.seed, strokes: 5 }),
    path(smoothD(face), C.face, { opacity: 0.85 }),
    path(ellipseD(eye[0], eye[1], 4 * s, 2.7 * s), C.patch),
    path(ellipseD(glint[0], glint[1], 0.9 * s, 0.9 * s), C.eyeGlint),
    path(ellipseD(nose[0], nose[1], 2 * s, 1.7 * s), C.nose),
    opts.mouth === true ? path(ellipseD(mouth[0], mouth[1], 2.6 * s, 2 * s), C.mouth) : '',
  );
}

/** A small paw (an oval with two toe lines). */
const paw = (x: number, y: number, s = 1): string =>
  g(
    {},
    inkPath(ellipseD(x, y, 4 * s, 3 * s), C.furShade, 1),
    stroke(
      line([
        [x - 1, y - 1],
        [x - 1, y + 2],
      ]),
      C.ink,
      0.6,
      0.6,
    ),
    stroke(
      line([
        [x + 1.5, y - 1],
        [x + 1.5, y + 2],
      ]),
      C.ink,
      0.6,
      0.6,
    ),
  );

/** Standing tall: the sentinel, a dash's halfway stop, the bark, the photo. */
function upright(
  look: -1 | 0 | 1,
  opts: { mouth?: boolean; front?: boolean; up?: number; seed: number },
): string {
  const front = opts.front === true;
  const body: P[] = front
    ? [
        [-10, -2],
        [-15, -24],
        [-18, -52],
        [-15, -80],
        [-10, -95],
        [10, -95],
        [15, -80],
        [18, -52],
        [15, -24],
        [10, -2],
      ]
    : [
        [-12, -3],
        [-19, -28],
        [-21, -58],
        [-17, -84],
        [-10, -97],
        [6, -99],
        [13, -88],
        [18, -62],
        [17, -32],
        [12, -8],
        [4, -2],
      ];
  const belly: P[] = front
    ? [
        [-8, -10],
        [-11, -40],
        [-8, -78],
        [8, -78],
        [11, -40],
        [8, -10],
      ]
    : [
        [2, -10],
        [7, -38],
        [8, -66],
        [4, -86],
        [12, -80],
        [16, -56],
        [15, -30],
        [9, -10],
      ];
  const bands = front
    ? []
    : [
        curve([-22, -40], [-12, -46], [-6, -42]),
        curve([-22, -54], [-12, -60], [-6, -56]),
        curve([-20, -68], [-11, -74], [-5, -70]),
        curve([-18, -80], [-11, -85], [-6, -82]),
      ];
  const view = look === 0 ? 'front' : 'side';
  const dir: 1 | -1 = look < 0 ? -1 : 1;
  const hx = front ? 0 : look < 0 ? -2 : 3;
  return g(
    {},
    shadow(26),
    tail(
      front
        ? [
            [-12, -6],
            [-26, -2],
            [-40, -1],
            [-50, -3],
          ]
        : [
            [-14, -8],
            [-30, -3],
            [-46, -1],
            [-58, -4],
          ],
    ),
    // Hind feet.
    inkPath(ellipseD(-6, -2, 8, 3), C.furShade, 1),
    inkPath(ellipseD(9, -2, 8, 3), C.fur, 1),
    // The neck (behind the shoulders) joins the head to the body.
    furred(
      front
        ? [
            [-9, -92],
            [-9, -106],
            [0, -110],
            [9, -106],
            [9, -92],
          ]
        : [
            [-11, -94],
            [-8, -108],
            [hx, -114],
            [hx + 10, -108],
            [12, -94],
          ],
      { seed: opts.seed + 3, strokes: 3 },
    ),
    furred(body, {
      seed: opts.seed,
      bands,
      shade: smoothD(
        front
          ? [
              [6, -95],
              [20, -60],
              [12, 0],
              [30, 0],
            ]
          : [
              [8, -99],
              [24, -60],
              [16, 0],
              [36, 0],
            ],
      ),
      strokes: 14,
    }),
    path(smoothD(belly), 'url(#belly)', { opacity: 0.95 }),
    // Arms: forearms down from the shoulders, the paws held in front of the belly.
    stroke(
      front ? curve([-9, -84], [-12, -72], [-6, -66]) : curve([8, -86], [15, -76], [13, -66]),
      C.ink,
      4.6,
    ),
    stroke(
      front ? curve([-9, -84], [-12, -72], [-6, -66]) : curve([8, -86], [15, -76], [13, -66]),
      C.fur,
      3,
    ),
    front ? stroke(curve([9, -84], [12, -72], [6, -66]), C.ink, 4.6) : '',
    front ? stroke(curve([9, -84], [12, -72], [6, -66]), C.fur, 3) : '',
    front ? paw(-5, -65) + paw(5, -65) : paw(12, -65) + paw(16, -62, 0.9),
    front
      ? ''
      : path(
          smoothD([
            [4, -92],
            [hx + 6, -104],
            [10, -104],
            [12, -92],
          ]),
          C.belly,
          { opacity: 0.8 },
        ),
    head(hx, -114, view, dir, {
      seed: opts.seed + 7,
      ...(opts.mouth === true ? { mouth: true } : {}),
      ...(opts.up === undefined ? {} : { up: opts.up }),
    }),
  );
}

/** Low poses: sitting on its haunches, digging, running (phase 0..3) and sunbathing. */
function low(kind: 'sit' | 'dig' | 'run' | 'sunbathe', phase: number, seed: number): string {
  if (kind === 'run') {
    const lift = [0, 3, 1, 4][phase] ?? 0;
    const legs: [P, P][] = [
      [
        [16, -14],
        [26 - phase * 6, -1 - (phase % 2) * 3],
      ],
      [
        [-16, -14],
        [-22 + phase * 6, -1 - ((phase + 1) % 2) * 3],
      ],
    ];
    return g(
      {},
      shadow(30),
      // Tail up behind, black tip high.
      tail([
        [-26, -26 - lift],
        [-38, -40 - lift],
        [-42, -58 - lift],
        [-40, -72 - lift],
      ]),
      ...legs.map(([a, b]) => stroke(line([a, b]), C.ink, 7.2) + stroke(line([a, b]), C.fur, 5.2)),
      furred(
        [
          [-30, -22 - lift],
          [-24, -34 - lift],
          [-4, -38 - lift],
          [16, -36 - lift],
          [28, -30 - lift],
          [26, -18 - lift],
          [8, -14 - lift],
          [-18, -14 - lift],
        ],
        {
          seed,
          bands: [
            curve([-20, -40 - lift], [-16, -30 - lift], [-18, -24 - lift]),
            curve([-10, -42 - lift], [-6, -32 - lift], [-8, -26 - lift]),
            curve([0, -42 - lift], [4, -32 - lift], [2, -26 - lift]),
          ],
          shade: smoothD([
            [-30, -14 - lift],
            [30, -14 - lift],
            [30, -8],
            [-30, -8],
          ]),
          strokes: 12,
        },
      ),
      path(
        smoothD([
          [-12, -16 - lift],
          [10, -16 - lift],
          [20, -20 - lift],
          [6, -20 - lift],
        ]),
        'url(#belly)',
        { opacity: 0.9 },
      ),
      head(34, -38 - lift, 'side', 1, { seed: seed + 3, up: -6 }),
    );
  }
  if (kind === 'dig') {
    const reach = phase === 0 ? 0 : 4;
    return g(
      {},
      shadow(30),
      tail([
        [-24, -30],
        [-36, -24],
        [-46, -14],
        [-52, -10],
      ]),
      stroke(
        line([
          [14, -16],
          [28 + reach, -2],
        ]),
        C.ink,
        6.6,
      ) +
        stroke(
          line([
            [14, -16],
            [28 + reach, -2],
          ]),
          C.fur,
          4.8,
        ),
      furred(
        [
          [-24, -18],
          [-22, -36],
          [-8, -42],
          [8, -36],
          [22, -24],
          [24, -14],
          [6, -10],
          [-16, -8],
        ],
        {
          seed,
          bands: [
            curve([-20, -42], [-14, -32], [-16, -24]),
            curve([-10, -46], [-4, -36], [-6, -28]),
            curve([0, -44], [6, -34], [4, -26]),
          ],
          shade: smoothD([
            [-24, -12],
            [24, -16],
            [24, -4],
            [-24, -4],
          ]),
          strokes: 12,
        },
      ),
      paw(30 + reach, -3),
      head(28, -18, 'side', 1, { seed: seed + 3, up: 30 }),
    );
  }
  if (kind === 'sunbathe') {
    // Sitting back on its haunches, belly turned to the sun, arms hanging.
    return g(
      {},
      shadow(26),
      tail([
        [-10, -6],
        [-26, -2],
        [-40, -1],
        [-50, -2],
      ]),
      inkPath(ellipseD(12, -3, 9, 3), C.fur, 1),
      furred(
        [
          [-14, -4],
          [-22, -24],
          [-24, -46],
          [-18, -64],
          [-6, -70],
          [6, -62],
          [12, -40],
          [12, -16],
          [4, -4],
        ],
        {
          seed,
          bands: [
            curve([-26, -36], [-18, -42], [-14, -38]),
            curve([-26, -50], [-18, -56], [-14, -52]),
          ],
          shade: smoothD([
            [-28, -6],
            [-28, -40],
            [-18, -40],
            [-14, -6],
          ]),
          strokes: 10,
        },
      ),
      path(
        smoothD([
          [-8, -10],
          [-6, -40],
          [0, -60],
          [8, -44],
          [8, -16],
        ]),
        'url(#belly)',
      ),
      stroke(curve([-4, -60], [6, -50], [8, -38]), C.ink, 4.4),
      stroke(curve([-4, -60], [6, -50], [8, -38]), C.fur, 2.8),
      paw(9, -36, 0.9),
      head(-6, -78, 'side', 1, { seed: seed + 3, up: -28 }),
    );
  }
  // sit: on its haunches, leaning forward, front paws down.
  return g(
    {},
    shadow(28),
    tail([
      [-18, -8],
      [-32, -3],
      [-46, -1],
      [-56, -3],
    ]),
    stroke(
      line([
        [16, -30],
        [22, -2],
      ]),
      C.ink,
      6.6,
    ) +
      stroke(
        line([
          [16, -30],
          [22, -2],
        ]),
        C.fur,
        4.8,
      ),
    furred(
      [
        [-20, -4],
        [-26, -22],
        [-18, -40],
        [0, -50],
        [18, -46],
        [24, -34],
        [16, -18],
        [2, -6],
      ],
      {
        seed,
        bands: [
          curve([-24, -26], [-16, -34], [-10, -32]),
          curve([-18, -38], [-10, -46], [-4, -44]),
          curve([-8, -46], [0, -54], [6, -52]),
        ],
        shade: smoothD([
          [-26, -4],
          [26, -10],
          [26, 0],
          [-26, 0],
        ]),
        strokes: 12,
      },
    ),
    path(
      smoothD([
        [4, -10],
        [16, -22],
        [20, -36],
        [12, -38],
        [6, -24],
      ]),
      'url(#belly)',
    ),
    paw(22, -3),
    head(26, -54, 'side', 1, { seed: seed + 3, up: -8 }),
  );
}

/** A pup: the sitting or running adult shapes, smaller, with a rounder, bigger head. */
function pup(kind: 'sit' | 'run', phase: number, seed: number): string {
  const body = low(kind, phase, seed);
  return g({ transform: 'scale(0.6)' }, body);
}

/** In a hole: what shows above the rim (y = 0); `body` is drawn as if standing, raised by
 *  `rise` (how far below the rim its feet are). */
function rim(body: string, sink: number): string {
  const id = `rim${clipSeq++}`;
  return g(
    {},
    el(
      'clipPath',
      { id },
      el('rect', { x: -CELL_W / 2, y: -CELL_H, width: CELL_W, height: CELL_H }),
    ),
    g({ 'clip-path': `url(#${id})` }, g({ transform: `translate(0 ${r2(sink)})` }, body)),
    // A line of loose sand along the rim where the body meets the hole.
    stroke(curve([-16, -0.5], [0, 1.5], [16, -0.5]), C.sandShade, 2.4, 0.9),
  );
}

/** Head first into the hole: the hindquarters and tail still up (a), then only the tail (b). */
function dive(stage: 0 | 1, seed: number): string {
  const sink = stage === 0 ? 0 : 22;
  return g(
    { transform: `translate(0 ${sink})` },
    tail([
      [-4, -28],
      [-10, -44],
      [-8, -60],
      [-2, -72],
    ]),
    furred(
      [
        [-14, 2],
        [-16, -18],
        [-10, -32],
        [2, -34],
        [12, -24],
        [12, 2],
      ],
      { seed, bands: [curve([-16, -16], [-4, -22], [8, -16])], strokes: 6 },
    ),
    stroke(
      line([
        [-8, -20],
        [-16, -10],
      ]),
      C.ink,
      4.8,
    ) +
      stroke(
        line([
          [-8, -20],
          [-16, -10],
        ]),
        C.fur,
        3.2,
      ),
  );
}

/** A ball of fur rolling into the hole (the view spins it). */
function tumble(seed: number): string {
  return g(
    {},
    tail([
      [-14, -26],
      [-26, -34],
      [-24, -48],
      [-12, -52],
    ]),
    furred(
      [
        [-20, -22],
        [-14, -40],
        [4, -46],
        [18, -34],
        [18, -14],
        [2, -4],
        [-14, -8],
      ],
      { seed, bands: [curve([-14, -40], [-2, -30], [-12, -16])], strokes: 10 },
    ),
    path(ellipseD(4, -22, 8, 9), 'url(#belly)'),
    head(12, -30, 'side', 1, { seed: seed + 2, up: 70 }),
  );
}

/** Sand thrown up by digging: a fan of grains. */
function flick(seed: number): string {
  const rnd = prng(seed);
  const grains: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = -0.3 - rnd() * 1.2;
    const r = 6 + rnd() * 26;
    const x = -Math.cos(a) * r;
    const y = Math.sin(a) * r - 6;
    const s = 1 + rnd() * 2.2;
    grains.push(path(ellipseD(x, y, s, s * 0.8), rnd() < 0.5 ? C.sand : C.sandLit));
  }
  return g({}, ...grains);
}

/** A burrow mound: low sand with a dark hole, freshly dug sand round it, and tiny tracks. The
 *  hole's centre is (0, 0); `w` its half width. */
function mound(w: number, seed: number): string {
  const rnd = prng(seed);
  const base = 30;
  const outline: P[] = [
    [-w, base],
    [-w * 0.75, base - 10],
    [-w * 0.4, 0 - 6],
    [0, -10],
    [w * 0.45, -4],
    [w * 0.8, base - 12],
    [w, base],
  ];
  const tracks: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = (rnd() < 0.5 ? -1 : 1) * (w * 0.55 + i * 6 + rnd() * 6);
    tracks.push(path(ellipseD(x, base - 2 - (i % 2) * 3, 1.4, 0.9), C.sandShade, { opacity: 0.7 }));
  }
  const spoil: string[] = [];
  for (let i = 0; i < 18; i++) {
    const x = (rnd() - 0.5) * w * 1.7;
    const y = 4 + rnd() * (base - 6);
    spoil.push(
      path(ellipseD(x, y, 1.2 + rnd() * 2, 1 + rnd()), rnd() < 0.4 ? C.sandLit : C.sandShade, {
        opacity: 0.8,
      }),
    );
  }
  const pebbles: string[] = [];
  for (let i = 0; i < 4; i++)
    pebbles.push(
      inkPath(ellipseD((rnd() - 0.5) * w * 1.4, base - 4 - rnd() * 10, 2.2, 1.6), C.pebble, 0.6),
    );
  return g(
    {},
    el('ellipse', { cx: 0, cy: base, rx: w * 1.05, ry: 6, fill: 'url(#shadow)' }),
    // A fan of freshly dug sand spilling down the front.
    path(
      smoothD([
        [-w * 0.35, 6],
        [w * 0.35, 6],
        [w * 0.55, base],
        [-w * 0.5, base],
      ]),
      C.sandLit,
      { opacity: 0.55 },
    ),
    path(smoothD(outline, true, 1), 'url(#sand)', { stroke: C.sandShade, 'stroke-width': 1 }),
    stroke(curve([-w * 0.7, base - 12], [-w * 0.3, -6], [w * 0.1, -9]), C.sandLit, 2.4, 0.6),
    ...spoil,
    ...pebbles,
    // The hole: dark and deep, a lit lip on its far rim.
    path(ellipseD(0, 0, 20, 8.5), 'url(#hole)', { stroke: C.sandShade, 'stroke-width': 1.2 }),
    stroke(curve([-18, -2], [0, -9], [18, -2]), C.sandLit, 1.6, 0.8),
    ...tracks,
  );
}

function frameArt(name: MeerkatFrame, seed: number): string {
  switch (name) {
    case 'peek_l':
      return rim(upright(-1, { seed }), 84);
    case 'peek_r':
      return rim(upright(1, { seed }), 84);
    case 'stand_l':
      return upright(-1, { seed });
    case 'stand_c':
      return upright(0, { seed });
    case 'stand_r':
      return upright(1, { seed });
    case 'bark':
      return upright(1, { seed, mouth: true, up: -16 });
    case 'front':
      return upright(0, { seed, front: true });
    case 'sit':
      return low('sit', 0, seed);
    case 'sunbathe':
      return low('sunbathe', 0, seed);
    case 'dig_a':
      return low('dig', 0, seed);
    case 'dig_b':
      return low('dig', 1, seed);
    case 'run_0':
      return low('run', 0, seed);
    case 'run_1':
      return low('run', 1, seed);
    case 'run_2':
      return low('run', 2, seed);
    case 'run_3':
      return low('run', 3, seed);
    case 'dive_a':
      return rim(dive(0, seed), 0);
    case 'dive_b':
      return rim(dive(1, seed), 0);
    case 'scold':
      return rim(upright(0, { seed, front: true, mouth: true }), 66);
    case 'emerge':
      return rim(upright(1, { seed }), 46);
    case 'tumble':
      return tumble(seed);
    case 'pup_sit':
      return pup('sit', 0, seed);
    case 'pup_run_a':
      return pup('run', 0, seed);
    case 'pup_run_b':
      return pup('run', 2, seed);
    case 'flick':
      return flick(seed);
  }
}

/** The whole sheet as SVG (design px viewBox, rendered at SHEET_MASTER×). */
export function meerkatSheetSvg(): string {
  clipSeq = 0;
  const parts: string[] = [];
  for (const f of sheetFrames()) {
    const seed = 4100 + parts.length * 13;
    const art = (MOUND_FRAMES as readonly string[]).includes(f.name)
      ? mound(f.name === 'mound_b' ? 72 : f.name === 'mound_c' ? 92 : 84, seed)
      : frameArt(f.name as MeerkatFrame, seed);
    const id = `cell${parts.length}`;
    parts.push(
      g(
        {},
        el('clipPath', { id }, el('rect', { x: f.x, y: f.y, width: f.w, height: f.h })),
        g(
          { 'clip-path': `url(#${id})` },
          g({ transform: `translate(${r2(f.x + f.ox)} ${r2(f.y + f.oy)})` }, art),
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

export function renderMeerkatSheet(): Rgba {
  return renderSvg(meerkatSheetSvg());
}
