// Interim non-target and special flyers (D-031, bible §3.2–3.3): hadeda, the crop-sprayer
// biplane, the kwêvoël, the fish eagle (visarend) and Die Stormvoël. Drawn in the shared bird
// frame box (620 × 400 units, sim position at (310, 230), facing right) with the plane's ink
// weight, like the tarentaal (D-029), and only the clips the game plays for them:
//   fly-overs (hadeda, sproeier, visarend): flap (+ glide for the eagle's soaring look)
//   kwêvoël (perched): alert while sitting, flap when it leaves
//   Stormvoël (boss): flap, and hit_poof when bagged
// Every creature's silhouette differs (bible §1 rule 6): ibis bill, biplane, crest + long tail,
// broad eagle wings with a white head, a giant casqued guineafowl.
import type { BirdClip } from '../../src/game/assets/assetIndex';
import type { ContentBundle } from '../../src/content/schemas';
import type { PlaneId } from '../../src/sim/types';
import type { Rgba } from '../assets/image';
import { BIRD_BOX } from '../assets/targets';
import { masterSize, planeLook } from './birdFrames';
import type { ArtConfig } from './config';
import { renderSvg, tint } from './raster';
import { flat, line, nextId, resetIds, type Pt } from './scenery';
import { el, ellipseD, g, place, polyD, prng, r2, smoothD, svgDoc, wobbleFilter } from './svg';

/** Clips drawn per flyer and plane (rig.json planeClips). */
// Each also gets a one-frame `forage_walk` hold pose: the game never asks a flyer for it, but it
// ends every fallback chain (docs/06 §3), so no state can drop to placeholder frames (D-031).
export const FLYERS: Readonly<Record<string, Partial<Record<PlaneId, readonly BirdClip[]>>>> = {
  hadeda: { far: ['flap', 'forage_walk'] },
  sproeier: { far: ['flap', 'forage_walk'] },
  visarend: { far: ['flap', 'glide', 'forage_walk'] },
  kwevoel: { mid: ['alert', 'flap', 'forage_walk'] },
  stormvoel: {
    far: ['flap', 'hit_poof', 'forage_walk'],
    mid: ['flap', 'hit_poof', 'forage_walk'],
  },
};

export const FLYER_FRAMES: Readonly<Partial<Record<BirdClip, number>>> = {
  flap: 6,
  glide: 2,
  forage_walk: 1,
  alert: 4,
  hit_poof: 6,
};

/** Download group override (rig.json `group`); the rest follow the catalog. */
export const FLYER_GROUPS: Readonly<Record<string, string>> = { stormvoel: 'late' };

interface Draw {
  readonly ink: string;
  /** Ink width in bird units for this plane. */
  readonly w: number;
  readonly far: boolean;
  readonly rnd: () => number;
}

/** Wing beat for frame k of a 6-frame flap: +1 = fully up, −1 = fully down. */
const beat = (k: number): number => Math.cos((k / 6) * Math.PI * 2);

/**
 * A wing in span coordinates: x along the body (chord), s 0 … 1 outward from the shoulder. `a`
 * folds it: +1 raised above the back, −1 below the belly, near 0 edge-on (kept a sliver thick).
 */
function wingD(
  pts: readonly (readonly [number, number])[],
  sx: number,
  sy: number,
  len: number,
  a: number,
): string {
  const k0 = Math.abs(a) < 0.18 ? Math.sign(a || 1) * 0.18 : a;
  // Down-strokes are foreshortened (the wing swings toward the viewer) and stay inside the box.
  const k = k0 < 0 ? k0 * 0.72 : k0;
  return smoothD(
    pts.map(([x, s]) => [sx + x, sy - s * len * k] as Pt),
    true,
    0.55,
  );
}

/** #RRGGBB lighter (k > 0) or darker (k < 0). */
function tone(hex: string, k: number): string {
  const to = k > 0 ? 255 : 0;
  const t = Math.abs(k);
  return `#${[1, 3, 5]
    .map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16);
      return Math.round(v + (to - v) * t)
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}

/** Gradients and the feather pattern already emitted in this SVG (reset per frame). */
const emitted = new Set<string>();
const FEATHER = 'fp';

/**
 * D-035: a plumage part. A soft gradient lit from the upper left (object bounding box), a fine
 * feather-edge pattern (not at the far plane, where it would only blur), and a thin outline
 * leaning toward the part's own colour. Every textured part of every flyer goes through here.
 */
const fill = (d: string, c: string, o: Draw, w = o.w): string => {
  const gid = `g${c.slice(1)}`;
  const defs: string[] = [];
  if (!emitted.has(gid)) {
    emitted.add(gid);
    defs.push(
      el(
        'linearGradient',
        { id: gid, x1: 0, y1: 0, x2: 0.55, y2: 1 },
        el('stop', { offset: 0, 'stop-color': tone(c, 0.22) }),
        el('stop', { offset: 0.5, 'stop-color': c }),
        el('stop', { offset: 1, 'stop-color': tone(c, -0.28) }),
      ),
    );
  }
  if (!o.far && !emitted.has(FEATHER)) {
    emitted.add(FEATHER);
    defs.push(
      el(
        'pattern',
        { id: FEATHER, width: 16, height: 11, patternUnits: 'userSpaceOnUse' },
        el('path', {
          d: 'M0 4Q8 11 16 4M-8 9.5Q0 16.5 8 9.5M8 9.5Q16 16.5 24 9.5',
          fill: 'none',
          stroke: '#FFFFFF',
          'stroke-width': 1.1,
          opacity: 0.5,
        }),
        el('path', { d: 'M8 1L8 6', stroke: '#000000', 'stroke-width': 0.9, opacity: 0.35 }),
      ),
    );
  }
  const ink = tone(c, -0.62);
  return [
    ...defs,
    el('path', { d, fill: `url(#${gid})` }),
    o.far ? '' : el('path', { d, fill: `url(#${FEATHER})`, opacity: 0.32 }),
    w > 0
      ? el('path', {
          d,
          fill: 'none',
          stroke: ink,
          'stroke-width': w * 0.7,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        })
      : '',
  ].join('');
};

// --- hadeda --------------------------------------------------------------------------------

const HADEDA = {
  body: '#7A7466',
  dark: '#5C574C',
  light: '#958E7E',
  sheen: '#6E8F5A',
  sheen2: '#8A6A8E',
  bill: '#3A3530',
  ridge: '#B8403A',
  cheek: '#E8E2D0',
};
const BROAD_WING: readonly (readonly [number, number])[] = [
  [38, 0],
  [52, 0.4],
  [36, 0.78],
  [6, 1],
  [-10, 0.93],
  [-20, 1],
  [-34, 0.9],
  [-46, 0.94],
  [-58, 0.82],
  [-70, 0.84],
  [-78, 0.62],
  [-70, 0.3],
  [-46, 0],
];

function hadeda(o: Draw, clip: BirdClip, k: number): string {
  const a = clip === 'glide' ? 0.15 : beat(k);
  const P = HADEDA;
  const wing = (dx: number, len: number) => wingD(BROAD_WING, dx, -18, len, a);
  const farWing = fill(wing(24, 185), P.dark, o);
  const nearWing = fill(wing(4, 200), P.dark, o);
  const sheen = flat(
    wingD(
      [
        [30, 0.05],
        [40, 0.35],
        [16, 0.5],
        [-18, 0.42],
        [-26, 0.1],
      ],
      4,
      -18,
      200,
      a,
    ),
    P.sheen,
  );
  const body = smoothD(
    [
      [-128, -6],
      [-70, -40],
      [40, -50],
      [118, -30],
      [132, 0],
      [100, 36],
      [-20, 50],
      [-112, 24],
    ],
    true,
    0.8,
  );
  const id = nextId();
  return g(
    {},
    farWing,
    // Legs trailing behind (short, dark).
    line('M-90 30L-170 46M-92 36L-168 58', { ink: o.ink, w: o.w * 1.6 }),
    line('M-90 30L-170 46M-92 36L-168 58', { ink: '#4A4540', w: o.w * 0.7 }),
    el('clipPath', { id }, el('path', { d: body })),
    fill(body, P.body, o),
    g(
      { 'clip-path': `url(#${id})` },
      flat(ellipseD(10, 40, 140, 34), P.dark, { opacity: 0.55 }),
      flat(ellipseD(-20, -38, 70, 10), P.light, { opacity: 0.6 }),
      // Iridescent green-purple sheen on the shoulder.
      flat(ellipseD(-30, -22, 60, 14), P.sheen, { opacity: 0.45 }),
      flat(ellipseD(10, -16, 40, 10), P.sheen2, { opacity: 0.35 }),
    ),
    // Neck, head, white cheek stripe, the long down-curved bill with its red ridge.
    fill(
      smoothD(
        [
          [96, -30],
          [140, -38],
          [168, -18],
          [160, 6],
          [120, 20],
          [100, 10],
        ],
        true,
        0.8,
      ),
      P.body,
      o,
    ),
    fill(ellipseD(152, -12, 28, 25), P.dark, o),
    o.far
      ? ''
      : flat('M134 -2Q150 6 168 -2', P.cheek, { stroke: P.cheek, 'stroke-width': o.w * 0.5 }),
    fill('M172 -22Q232 -18 270 52Q266 60 258 56Q226 0 172 -4Z', P.bill, o),
    o.far ? '' : line('M176 -18Q210 -16 228 4', { ink: P.ridge, w: o.w * 0.6 }),
    flat(ellipseD(160, -18, 6, 6), '#E8D8B0'),
    flat(ellipseD(161, -18, 2.6, 2.6), o.ink),
    a >= 0 ? g({}, fill(wing(4, 200), P.body, o), sheen) : g({}, nearWing, sheen),
  );
}

// --- sproeier (crop sprayer) ---------------------------------------------------------------

const PLANE = {
  yellow: '#F2C230',
  yellowDark: '#D19A1C',
  yellowLight: '#FBE38A',
  stripe: '#C8302A',
  metal: '#9AA3A8',
  glass: '#BFE0F2',
  tyre: '#2A2522',
  mist: '#E8F1E0',
  leather: '#7A4A2A',
};

function sproeier(o: Draw, _clip: BirdClip, k: number): string {
  const P = PLANE;
  const fuselage = smoothD(
    [
      [-250, -18],
      [-120, -30],
      [60, -48],
      [200, -42],
      [232, -20],
      [232, 22],
      [196, 40],
      [40, 42],
      [-120, 22],
      [-252, 8],
    ],
    true,
    0.5,
  );
  const id = nextId();
  const mist: string[] = [];
  const rnd = prng(31 + k);
  for (let i = 0; i < 7; i++) {
    const x = -80 - i * 24 - rnd() * 8;
    const y = 76 + i * 9 + Math.sin(i + k) * 4;
    mist.push(
      flat(ellipseD(x, y, 20 + i * 4, 10 + i * 2.5), P.mist, { opacity: r2(0.55 - i * 0.06) }),
    );
  }
  // Propeller: a pale blur disc and two blades at this frame's angle (seen from the side: a line).
  const ang = (k * 60 * Math.PI) / 180;
  const bladeY = Math.cos(ang) * 64;
  return g(
    {},
    ...mist,
    // Lower wing (far side first), struts, landing gear.
    fill(
      polyD([
        [-70, 24],
        [140, 24],
        [150, 40],
        [-62, 40],
      ]),
      P.yellowDark,
      o,
    ),
    line('M-30 40L-34 70M110 40L114 70', { ink: o.ink, w: o.w }),
    line('M-56 74L136 74', { ink: o.ink, w: o.w * 1.2 }),
    line('M-56 74L136 74', { ink: P.metal, w: o.w * 0.5 }),
    line('M60 40L40 96M80 40L70 96', { ink: o.ink, w: o.w }),
    fill(ellipseD(40, 104, 20, 20), P.tyre, o),
    fill(ellipseD(72, 104, 20, 20), P.tyre, o),
    fill(ellipseD(-232, 30, 10, 10), P.tyre, o),
    // Fuselage with a red stripe and the tail fin.
    fill(
      polyD([
        [-250, -16],
        [-232, -96],
        [-200, -96],
        [-178, -26],
      ]),
      P.yellow,
      o,
    ),
    flat(
      polyD([
        [-236, -78],
        [-206, -78],
        [-203, -62],
        [-240, -62],
      ]),
      P.stripe,
    ),
    el('clipPath', { id }, el('path', { d: fuselage })),
    flat(fuselage, P.yellow),
    g(
      { 'clip-path': `url(#${id})` },
      flat(
        polyD([
          [-260, 6],
          [240, 4],
          [240, 50],
          [-260, 50],
        ]),
        P.yellowDark,
      ),
      flat(
        polyD([
          [-260, -8],
          [240, -10],
          [240, 2],
          [-260, 4],
        ]),
        P.stripe,
      ),
      flat(
        polyD([
          [-120, -30],
          [180, -46],
          [180, -38],
          [-120, -24],
        ]),
        P.yellowLight,
      ),
    ),
    el('path', {
      d: fuselage,
      fill: 'none',
      stroke: o.ink,
      'stroke-width': o.w,
      'stroke-linejoin': 'round',
    }),
    fill(
      polyD([
        [-250, -2],
        [-170, -6],
        [-172, 10],
        [-252, 12],
      ]),
      P.yellowDark,
      o,
      o.w * 0.8,
    ),
    // Cowling and spinner.
    fill(
      polyD([
        [196, -40],
        [232, -26],
        [232, 26],
        [196, 40],
      ]),
      P.metal,
      o,
    ),
    // Cockpit and the pilot (cap + goggles), then the upper wing on struts.
    fill(
      smoothD(
        [
          [-30, -46],
          [-10, -84],
          [30, -86],
          [40, -50],
        ],
        true,
        0.6,
      ),
      P.leather,
      o,
    ),
    fill(ellipseD(6, -78, 10, 7), P.glass, o, o.w * 0.6),
    line('M-80 -56L-60 -112M120 -50L110 -112', { ink: o.ink, w: o.w }),
    fill(
      polyD([
        [-110, -128],
        [150, -128],
        [160, -108],
        [-100, -108],
      ]),
      P.yellow,
      o,
    ),
    flat(
      polyD([
        [-106, -126],
        [148, -126],
        [150, -120],
        [-104, -120],
      ]),
      P.yellowLight,
    ),
    flat(
      polyD([
        [-100, -112],
        [156, -112],
        [158, -109],
        [-100, -109],
      ]),
      P.yellowDark,
    ),
    // Propeller blur and blades.
    flat(ellipseD(246, 0, 12, 74), '#E8E4DA', { opacity: 0.45 }),
    fill(
      polyD([
        [240, bladeY - 4],
        [252, bladeY - 4],
        [252, -bladeY + 4],
        [240, -bladeY + 4],
      ]),
      '#4A4540',
      o,
      o.w * 0.7,
    ),
    fill(ellipseD(244, 0, 12, 14), P.stripe, o),
  );
}

// --- kwêvoël (grey go-away-bird) -----------------------------------------------------------

const KWE = {
  body: '#A4A7A6',
  dark: '#7E8180',
  light: '#C4C7C4',
  wing: '#8C8F8E',
  crest: '#8C8F8E',
  beak: '#2C2C2C',
  legs: '#4A4D4C',
};
const SLIM_WING: readonly (readonly [number, number])[] = [
  [30, 0],
  [40, 0.4],
  [20, 0.8],
  [-6, 1],
  [-24, 0.9],
  [-44, 0.6],
  [-42, 0.25],
  [-30, 0],
];

/** Crest: tall pointed tuft of 4 feathers, raised by `up` (0 … 1). */
function crest(o: Draw, up: number): string {
  const tips: Pt[] = [
    [-2, -200 - up * 10],
    [14, -196 - up * 14],
    [30, -184 - up * 10],
    [42, -164],
  ];
  const parts = tips.map(([tx, ty], i) =>
    fill(
      smoothD(
        [
          [0 + i * 10, -132],
          [tx - 6, ty + 30],
          [tx, ty],
          [tx + 8, ty + 26],
          [12 + i * 10, -130],
        ],
        true,
        0.6,
      ),
      i % 2 === 0 ? KWE.crest : KWE.dark,
      o,
    ),
  );
  return g({}, ...parts);
}

function kwevoel(o: Draw, clip: BirdClip, k: number): string {
  const P = KWE;
  const perched = clip === 'alert';
  const tilt = perched ? 0 : 28;
  const a = perched ? 0 : beat(k);
  const body = smoothD(
    [
      [-52, -30],
      [-30, -84],
      [24, -92],
      [56, -40],
      [56, 40],
      [24, 86],
      [-24, 86],
      [-56, 40],
    ],
    true,
    0.8,
  );
  const id = nextId();
  // Alert: crest flicks up, then the beak opens wide for "KWÊ" (frames 2–3).
  const up = perched ? ([0.2, 0.7, 1, 1][k] ?? 1) : 0.4;
  const open = perched && k >= 2 ? 10 : 0;
  const tail = perched
    ? smoothD(
        [
          [-30, 60],
          [-56, 140],
          [-40, 154],
          [-14, 140],
          [12, 70],
        ],
        true,
        0.6,
      )
    : smoothD(
        [
          [-40, 40],
          [-150, 100],
          [-160, 80],
          [-56, 10],
        ],
        true,
        0.6,
      );
  const legs = perched
    ? g(
        {},
        line('M-6 84L-12 120M14 84L20 120', { ink: o.ink, w: o.w * 1.6 }),
        line('M-6 84L-12 120M14 84L20 120', { ink: P.legs, w: o.w * 0.7 }),
        line('M-24 122L4 122M8 122L34 122', { ink: o.ink, w: o.w }),
      )
    : line('M-10 80L-40 110M6 84L-24 116', { ink: o.ink, w: o.w });
  const wingSvg = perched
    ? fill(
        smoothD(
          [
            [-30, -50],
            [20, -60],
            [36, 0],
            [10, 70],
            [-36, 60],
            [-52, 0],
          ],
          true,
          0.8,
        ),
        P.wing,
        o,
      )
    : fill(wingD(SLIM_WING, 0, -40, 180, a), a >= 0 ? P.wing : P.dark, o);
  return g(
    {},
    !perched ? fill(wingD(SLIM_WING, 18, -40, 160, a), P.dark, o) : '',
    fill(tail, P.dark, o),
    legs,
    g(
      { transform: `rotate(${tilt} 0 0)` },
      el('clipPath', { id }, el('path', { d: body })),
      fill(body, P.body, o),
      g(
        { 'clip-path': `url(#${id})` },
        // Paler grey breast, darker back; fine dark shaft streaks on the breast.
        flat(ellipseD(30, 40, 50, 70), P.dark, { opacity: 0.45 }),
        flat(ellipseD(40, -10, 22, 50), P.light, { opacity: 0.5 }),
        el('path', {
          d: 'M30 -40l4 14M44 -30l4 14M36 -10l4 14M50 0l4 14M28 14l4 14M44 22l4 14',
          stroke: P.dark,
          'stroke-width': 1.2,
          opacity: o.far ? 0 : 0.6,
        }),
      ),
    ),
    perched ? wingSvg : '',
    // Head (hitbox r 30 at (20, −110)), crest, beak (open for the call), dark eye.
    crest(o, up),
    fill(ellipseD(20, -110, 32, 30), P.body, o),
    // Pale face around the eye, darker nape.
    flat(ellipseD(30, -112, 14, 11), P.light, { opacity: 0.6 }),
    flat(ellipseD(4, -100, 14, 18), P.dark, { opacity: 0.4 }),
    fill(
      polyD([
        [46, -118 - open * 0.3],
        [74, -110],
        [46, -102],
      ]),
      P.beak,
      o,
      o.w * 0.8,
    ),
    open > 0
      ? fill(
          polyD([
            [46, -104],
            [70, -96 + open * 0.4],
            [46, -96],
          ]),
          P.beak,
          o,
          o.w * 0.8,
        )
      : '',
    flat(ellipseD(30, -116, 5, 5), '#3A2A22'),
    flat(ellipseD(30.5, -116, 2.4, 2.4), '#0E0C0A'),
    flat(ellipseD(29, -117.5, 1.1, 1.1), '#FFFFFF'),
    perched ? '' : wingSvg,
  );
}

// --- visarend (African fish eagle) ---------------------------------------------------------

const EAGLE = {
  white: '#F4F1E8',
  whiteShade: '#D9D2C2',
  chestnut: '#8A3E22',
  chestnutDark: '#6A2C18',
  wing: '#2E2622',
  wingLight: '#4A3E36',
  face: '#E9C23B',
  bill: '#2C2622',
};
const EAGLE_WING: readonly (readonly [number, number])[] = [
  [50, 0],
  [66, 0.4],
  [48, 0.76],
  [16, 1],
  [2, 0.92],
  [-10, 1],
  [-22, 0.9],
  [-34, 0.95],
  [-46, 0.84],
  [-60, 0.86],
  [-74, 0.64],
  [-80, 0.3],
  [-60, 0],
];

function visarend(o: Draw, clip: BirdClip, k: number): string {
  const P = EAGLE;
  const a = clip === 'glide' ? 0.2 + k * 0.05 : beat(k);
  const len = clip === 'glide' ? 190 : 180;
  const body = smoothD(
    [
      [-150, -6],
      [-60, -48],
      [70, -50],
      [150, -20],
      [150, 20],
      [60, 56],
      [-80, 46],
    ],
    true,
    0.8,
  );
  const id = nextId();
  return g(
    {},
    fill(wingD(EAGLE_WING, 30, -20, len * 0.9, a), P.wing, o),
    // White wedge tail.
    fill(
      polyD([
        [-140, -16],
        [-224, -40],
        [-232, 20],
        [-140, 22],
      ]),
      P.white,
      o,
    ),
    el('clipPath', { id }, el('path', { d: body })),
    fill(body, P.chestnut, o),
    g(
      { 'clip-path': `url(#${id})` },
      flat(ellipseD(80, -4, 90, 70), P.white),
      flat(ellipseD(70, 10, 70, 40), P.whiteShade, { opacity: 0.5 }),
      flat(ellipseD(-10, 44, 150, 22), P.chestnutDark, { opacity: 0.8 }),
    ),
    // White head (hitbox r 30 at (120, −20)), yellow face, hooked bill.
    fill(ellipseD(124, -22, 34, 30), P.white, o),
    flat(ellipseD(134, -12, 18, 10), P.whiteShade),
    fill('M150 -30Q172 -32 178 -16Q176 -6 168 -10Q166 -20 150 -16Z', P.face, o, o.w * 0.8),
    flat('M168 -24Q178 -22 178 -14L172 -12Z', P.bill),
    flat(ellipseD(138, -28, 5, 5), P.face),
    flat(ellipseD(139, -28, 2.6, 2.6), o.ink),
    fill(wingD(EAGLE_WING, 10, -24, len, a), a >= 0 ? P.wing : P.wingLight, o),
    o.far
      ? ''
      : flat(
          wingD(
            [
              [40, 0.05],
              [52, 0.32],
              [30, 0.36],
              [0, 0.3],
              [-20, 0.05],
            ],
            10,
            -24,
            len,
            a,
          ),
          P.chestnut,
        ),
  );
}

// --- Die Stormvoël -------------------------------------------------------------------------

const STORM = {
  body: '#1C2030',
  dark: '#11131D',
  light: '#2E3448',
  dots: '#5A6378',
  eye: '#FFE066',
  eyeGlow: '#FFF3B0',
  casque: '#2A2F42',
  rim: '#8FA8D8',
  puff: '#3B4256',
  puffLight: '#5A6378',
};
/** Long, swept-back, ragged storm wings (the box limits the span, so they sweep over the tail). */
const STORM_WING: readonly (readonly [number, number])[] = [
  [90, 0],
  [96, 0.4],
  [40, 0.82],
  [-40, 1],
  [-70, 0.86],
  [-110, 0.98],
  [-140, 0.8],
  [-180, 0.88],
  [-200, 0.66],
  [-236, 0.7],
  [-220, 0.42],
  [-170, 0.18],
  [-120, 0],
];

function stormBird(o: Draw, a: number, squash = 1, swirl = false): string {
  const P = STORM;
  const body = ellipseD(0, 0, 214 * squash, 154 / squash);
  const id = nextId();
  const dots: string[] = [];
  const rnd = prng(77);
  for (let i = 0; i < (o.far ? 10 : 34); i++) {
    const t = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd());
    const r = o.far ? 14 : 7;
    dots.push(flat(ellipseD(Math.cos(t) * 180 * d, -20 + Math.sin(t) * 120 * d, r, r), P.dots));
  }
  const eyes = swirl
    ? g(
        {},
        line('M240 -128m-14 0a14 14 0 1 1 14 14a8 8 0 1 1 -6 -8', { ink: P.eye, w: o.w }),
        line('M206 -128m-10 0a10 10 0 1 1 10 10', { ink: P.eye, w: o.w * 0.8 }),
      )
    : g(
        {},
        flat(ellipseD(244, -130, 26, 18), P.eye, { opacity: 0.35 }),
        flat(ellipseD(244, -130, 15, 10), P.eye),
        flat(ellipseD(246, -131, 6, 4), P.eyeGlow),
        flat(ellipseD(212, -130, 10, 7), P.eye),
      );
  return g(
    {},
    fill(wingD(STORM_WING, 40, -60, 150, a), P.dark, o),
    // Ragged tail.
    fill(
      polyD([
        [-190, -40],
        [-290, -86],
        [-262, -40],
        [-292, -20],
        [-258, 6],
        [-292, 40],
        [-188, 40],
      ]),
      P.dark,
      o,
    ),
    el('clipPath', { id }, el('path', { d: body })),
    flat(body, P.body),
    g(
      { 'clip-path': `url(#${id})` },
      flat(ellipseD(30, 110, 230, 80), P.dark),
      ...dots,
      flat(ellipseD(-80, -110, 70, 20), P.light),
    ),
    el('path', { d: body, fill: 'none', stroke: o.ink, 'stroke-width': o.w }),
    // Cold rim light along the back: the storm's glow catching him.
    el('path', {
      d: `M${-170 * squash} ${-70 / squash}A${214 * squash} ${154 / squash} 0 0 1 ${120 * squash} ${-126 / squash}`,
      fill: 'none',
      stroke: P.rim,
      'stroke-width': o.w * 0.6,
      'stroke-linecap': 'round',
    }),
    // Neck, head (hitbox r 70 at (230, −120)), casque, the glowing eyes.
    fill(
      smoothD(
        [
          [120, -100],
          [190, -150],
          [240, -110],
          [190, -40],
          [140, -40],
        ],
        true,
        0.8,
      ),
      P.body,
      o,
    ),
    fill(ellipseD(230, -120, 66, 60), P.body, o),
    fill(
      polyD([
        [200, -170],
        [222, -212],
        [256, -172],
      ]),
      P.casque,
      o,
    ),
    fill('M284 -122L298 -108L284 -98Z', P.light, o, o.w * 0.8),
    eyes,
    fill(wingD(STORM_WING, 10, -66, 156, a), a >= 0 ? P.body : P.light, o),
  );
}

function stormvoel(o: Draw, clip: BirdClip, k: number): string {
  if (clip !== 'hit_poof') return stormBird(o, beat(k));
  // Bagged: the giant shrinks into a storm-cloud puff with swirl eyes, feathers flying.
  const P = STORM;
  const f = k / 5;
  const parts: string[] = [];
  if (k < 3)
    parts.push(g({ transform: `scale(${r2(1 - f * 0.9)})` }, stormBird(o, 0.3, 1 + f * 0.2, true)));
  const rnd = prng(91);
  if (k >= 2)
    parts.push(
      fill(
        smoothD(
          Array.from({ length: 9 }, (_, i): Pt => {
            const t = (i / 9) * Math.PI * 2;
            const r = (90 + (i % 2) * 30) * (1.2 - f * 0.6);
            return [Math.cos(t) * r * 1.3, Math.sin(t) * r * 0.8];
          }),
          true,
          1,
        ),
        P.puff,
        o,
      ),
    );
  for (let i = 0; i < 9; i++) {
    const t = (i / 9) * Math.PI * 2 + rnd() * 0.4;
    const r = 60 + f * 115;
    const x = Math.cos(t) * r * 1.2;
    const y = Math.sin(t) * r * 0.75;
    const cr = (40 + rnd() * 30) * (1 - f * 0.55);
    parts.push(fill(ellipseD(x, y, cr, cr * 0.85), i % 2 === 0 ? P.puff : P.puffLight, o));
  }
  for (let i = 0; i < 7; i++) {
    const t = rnd() * Math.PI * 2;
    const r = 40 + f * 120 + rnd() * 20;
    parts.push(
      fill(
        smoothD(
          place(
            [
              [0, -18],
              [7, 0],
              [0, 18],
              [-7, 0],
            ],
            Math.cos(t) * r * 1.25,
            Math.sin(t) * r * 0.75,
            t * 57,
          ),
          true,
          0.8,
        ),
        P.light,
        o,
        o.w * 0.6,
      ),
    );
  }
  return g({ opacity: r2(k >= 4 ? 1 - (k - 3) * 0.3 : 1) }, ...parts);
}

const DRAW: Readonly<Record<string, (o: Draw, clip: BirdClip, k: number) => string>> = {
  hadeda,
  sproeier,
  kwevoel,
  visarend,
  stormvoel,
};

/** One master frame (masterScale × the plane's @1x frame), far frames tinted toward the sky. */
export function renderFlyerFrame(
  cfg: ArtConfig,
  content: ContentBundle,
  creature: string,
  plane: PlaneId,
  clip: BirdClip,
  k: number,
): Rgba {
  const draw0 = DRAW[creature];
  if (draw0 === undefined) throw new Error(`no flyer drawing for ${creature}`);
  // The hold pose: perched for the kwêvoël, mid-beat for the rest.
  const draw = (o: Draw, c: BirdClip, f: number): string =>
    c !== 'forage_walk'
      ? draw0(o, c, f)
      : creature === 'kwevoel'
        ? draw0(o, 'alert', 0)
        : draw0(o, 'flap', 1);
  resetIds();
  emitted.clear();
  const look = planeLook(cfg, content, plane);
  const o: Draw = { ink: cfg.ink, w: look.line, far: plane === 'far', rnd: prng(k + 1) };
  const { w, h } = masterSize(cfg, content, plane);
  const wob = cfg.birds.wobble[plane];
  const filter = wobbleFilter('wob', cfg.birds.wobble.frequency, wob, 13);
  const svg = svgDoc(
    w,
    h,
    [-BIRD_BOX.originX, -BIRD_BOX.originY, BIRD_BOX.width, BIRD_BOX.height],
    filter,
    g(filter === '' ? {} : { filter: 'url(#wob)' }, draw(o, clip, k)),
  );
  const img = renderSvg(svg);
  return plane === 'far' ? tint(img, cfg.birds.skyTint.colour, cfg.birds.skyTint.far) : img;
}
