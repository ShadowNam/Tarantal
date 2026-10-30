// D-064: interim art for "Christmas in the sun" — one sheet (layout in
// src/game/feesdae/christmasAssets.ts) drawn at 2× in the D-035 semi-realistic style of the
// Halloween sheet: form from gradients and layered tones, a warm-dark broken edge instead of a
// cartoon outline, small highlights where the midsummer sun catches.
// - Presents: three wraps (red with a gold ribbon, bottle green with a red one, sky blue with a
//   silver one), a glossy bow on a lid; open, the box shows its tissue and a little gift, and the
//   lid with its bow is its own frame (it hops off when shot).
// - Tinsel: a silver and a red garland, each a fringed rope sagging between two hooks; three
//   baubles (red, gold, silver) on little caps; a soft four-point glint.
// - Santa hats in three sizes (bolder and simpler the smaller), on the witch hats' anchors.
// - Paper confetti: a puff of coloured paper bits and curls (no flash).
// - Oupa: an old Karoo farmer with a white beard, khaki shirt and shorts, vellies and a Santa hat,
//   waving (the title badge, the tally slate); his head alone for the bark bubble.
// Coordinates: design px; each frame is drawn round its origin (christmasAssets.ts).
import {
  XMAS_MASTER,
  XMAS_SHEET_H,
  XMAS_SHEET_W,
  xmasFrames,
  type PresentWrap,
  type XmasFrame,
} from '../../src/game/feesdae/christmasAssets';
import type { Rgba } from '../assets/image';
import { renderSvg } from './raster';
import { el, ellipseD, g, polyD, prng, r2, smoothD, svgDoc } from './svg';

const C = {
  ink: '#2A1A14',
  white: '#FFFDF6',
  fur: '#F4EEE4',
  furShade: '#CFC6B8',
  santa: '#C8202A',
  santaLit: '#EE4A48',
  santaShade: '#86121C',
  khaki: '#C4A872',
  khakiLit: '#DCC594',
  khakiShade: '#8E7646',
  skin: '#D69A72',
  skinLit: '#EDBA92',
  skinShade: '#A4684A',
  beard: '#F2F0EA',
  beardShade: '#C9C4BA',
  velskoen: '#7A5432',
  velskoenLit: '#A0764C',
  sock: '#E8E0CC',
  silver: '#D8DEE6',
  silverLit: '#FFFFFF',
  silverShade: '#8C96A4',
  red: '#D6262E',
  redLit: '#FF6A62',
  redShade: '#8A1218',
  gold: '#E6B23A',
  goldLit: '#FFE48A',
  goldShade: '#A07018',
  tissue: '#FFF4D8',
  inside: '#3A2418',
} as const;

/** Each wrap: paper (lit, mid, shade) and its ribbon (lit, mid, shade). */
const WRAPS: Record<
  PresentWrap,
  { paper: [string, string, string]; ribbon: [string, string, string]; dot: string }
> = {
  a: {
    paper: ['#F2585A', '#C8202A', '#7E1018'],
    ribbon: [C.goldLit, C.gold, C.goldShade],
    dot: '#FFD9A0',
  },
  b: {
    paper: ['#4FA26A', '#226B3E', '#103A22'],
    ribbon: [C.redLit, C.red, C.redShade],
    dot: '#E8F4C8',
  },
  c: {
    paper: ['#7EC2F0', '#3C88C8', '#1C4C7A'],
    ribbon: [C.silverLit, C.silver, C.silverShade],
    dot: '#FFFFFF',
  },
};

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
function linear(stops: readonly [number, string][], x2 = 0, y2 = 1): { def: string; url: string } {
  const id = uid('lg');
  return {
    def: el(
      'linearGradient',
      { id, x1: 0, y1: 0, x2, y2 },
      ...stops.map(([o, c]) => el('stop', { offset: o, 'stop-color': c })),
    ),
    url: `url(#${id})`,
  };
}
function radial(
  stops: readonly [number, string, number][],
  cx = 0.4,
  cy = 0.35,
): { def: string; url: string } {
  const id = uid('rg');
  return {
    def: el(
      'radialGradient',
      { id, cx, cy, r: 0.6 },
      ...stops.map(([o, c, a]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a })),
    ),
    url: `url(#${id})`,
  };
}
const defs = (...d: { def: string }[]): string => el('defs', {}, ...d.map((x) => x.def));

// --- presents -----------------------------------------------------------------------------------

/** The bow on top of a lid, centred on (0, 0) = the lid's top. */
function bow(w: PresentWrap): string {
  const [lit, mid, shade] = WRAPS[w].ribbon;
  const loop = (s: 1 | -1): string =>
    edge(
      smoothD(
        [
          [0, 0],
          [s * 16, -20],
          [s * 38, -30],
          [s * 46, -16],
          [s * 30, -4],
        ],
        true,
        0.8,
      ),
      mid,
      2.2,
    );
  const tail = (s: 1 | -1): string =>
    edge(
      polyD([
        [s * 2, 2],
        [s * 26, 22],
        [s * 20, 28],
        [s * 30, 30],
        [s * 8, 6],
      ]),
      shade,
      2,
    );
  return g(
    {},
    tail(-1),
    tail(1),
    loop(-1),
    loop(1),
    stroke('M-30 -20Q-22 -26 -10 -14', lit, 3, 0.8),
    stroke('M30 -22Q24 -27 12 -16', lit, 2.4, 0.6),
    edge(ellipseD(0, -4, 9, 8), mid, 2.2),
    path(ellipseD(-3, -7, 3.5, 3), lit, { opacity: 0.85 }),
  );
}

/** The lid (130 × 22) with its bow; (0, 0) = where it sits on the box (its bottom centre). */
function lid(w: PresentWrap): string {
  const [pl, pm, ps] = WRAPS[w].paper;
  const [rl, rm] = WRAPS[w].ribbon;
  const paper = linear([
    [0, pl],
    [0.45, pm],
    [1, ps],
  ]);
  return g(
    {},
    defs(paper),
    edge(
      polyD([
        [-66, 0],
        [-66, -22],
        [66, -22],
        [66, 0],
      ]),
      paper.url,
      2.4,
    ),
    path(
      polyD([
        [-12, 0],
        [-12, -22],
        [12, -22],
        [12, 0],
      ]),
      rm,
    ),
    stroke('M-6 -20L-6 -2', rl, 3, 0.7),
    stroke('M-62 -19L62 -19', pl, 2, 0.5),
    g({ transform: 'translate(0 -22)' }, bow(w)),
  );
}

/** A present's box (120 × 100, centred on the origin). Open: its tissue and gift show. */
function present(w: PresentWrap, open: boolean, seed: number): string {
  const [pl, pm, ps] = WRAPS[w].paper;
  const [rl, rm, rs] = WRAPS[w].ribbon;
  const paper = linear(
    [
      [0, pl],
      [0.35, pm],
      [1, ps],
    ],
    1,
    0.3,
  );
  const rnd = prng(seed);
  const dots: string[] = [];
  for (let i = 0; i < 16; i++) {
    const x = -52 + rnd() * 104;
    const y = -44 + rnd() * 90;
    if (Math.abs(x) < 16 || Math.abs(y) < 14) continue;
    dots.push(
      // Little stars printed on the paper.
      path(
        polyD([
          [x, y - 5],
          [x + 1.6, y - 1.6],
          [x + 5, y],
          [x + 1.6, y + 1.6],
          [x, y + 5],
          [x - 1.6, y + 1.6],
          [x - 5, y],
          [x - 1.6, y - 1.6],
        ]),
        WRAPS[w].dot,
        { opacity: 0.75 },
      ),
    );
  }
  const box = polyD([
    [-60, -50],
    [60, -50],
    [60, 50],
    [-60, 50],
  ]);
  const inside = open
    ? g(
        {},
        // The open top: the box's dark inside, tissue paper and a small gift peeping out.
        path(
          polyD([
            [-56, -50],
            [56, -50],
            [52, -38],
            [-52, -38],
          ]),
          C.inside,
        ),
        edge(
          smoothD(
            [
              [-54, -44],
              [-38, -66],
              [-20, -52],
              [-4, -74],
              [14, -54],
              [34, -70],
              [54, -46],
              [30, -40],
              [-30, -40],
            ],
            true,
            0.7,
          ),
          C.tissue,
          1.8,
        ),
        edge(
          polyD([
            [-14, -46],
            [-14, -68],
            [16, -68],
            [16, -46],
          ]),
          C.gold,
          1.8,
        ),
        stroke('M-14 -60L16 -60', C.redShade, 3),
      )
    : '';
  return g(
    {},
    defs(paper),
    // A soft contact shadow on the ground.
    path(ellipseD(0, 52, 70, 8), '#000000', { opacity: 0.22 }),
    edge(box, paper.url, 2.6),
    ...dots,
    // The ribbon crossing the box, lit on the sun side.
    path(
      polyD([
        [-12, -50],
        [12, -50],
        [12, 50],
        [-12, 50],
      ]),
      rm,
    ),
    path(
      polyD([
        [-60, -8],
        [60, -8],
        [60, 10],
        [-60, 10],
      ]),
      rm,
    ),
    stroke('M-7 -48L-7 48', rl, 3.2, 0.75),
    stroke('M-58 -3L58 -3', rl, 2.6, 0.6),
    stroke('M10 -48L10 48', rs, 2, 0.6),
    // Sun on the left face, shade on the right.
    path(
      polyD([
        [-60, -50],
        [-50, -50],
        [-50, 50],
        [-60, 50],
      ]),
      '#FFFFFF',
      { opacity: 0.16 },
    ),
    path(
      polyD([
        [48, -50],
        [60, -50],
        [60, 50],
        [48, 50],
      ]),
      '#000000',
      { opacity: 0.16 },
    ),
    edge(box, 'none', 2.6),
    inside,
    open ? '' : g({ transform: 'translate(0 -50)' }, lid(w).replace(/^/, '')),
  );
}

// --- tinsel -------------------------------------------------------------------------------------

/** A tinsel garland from (−150, 0) to (150, 0), sagging ~56 px: a twisted rope with a fringe. */
function garland(colour: 'silver' | 'red', seed: number): string {
  const [lit, mid, shade] =
    colour === 'silver' ? [C.silverLit, C.silver, C.silverShade] : [C.redLit, C.red, C.redShade];
  const rnd = prng(seed);
  const at = (t: number): [number, number] => [-150 + 300 * t, 56 * 4 * t * (1 - t)];
  const rope = Array.from({ length: 25 }, (_, i) => at(i / 24));
  const fringe: string[] = [];
  for (let i = 0; i < 140; i++) {
    const t = rnd();
    const [x, y] = at(t);
    const a = rnd() * Math.PI * 2;
    const l = 6 + rnd() * 10;
    const c = rnd() < 0.3 ? lit : rnd() < 0.6 ? mid : shade;
    fringe.push(
      stroke(
        `M${r2(x)} ${r2(y)}L${r2(x + Math.cos(a) * l)} ${r2(y + Math.sin(a) * l)}`,
        c,
        2.2,
        0.95,
      ),
    );
  }
  const sparks: string[] = [];
  for (let i = 0; i < 12; i++) {
    const [x, y] = at(rnd());
    sparks.push(
      el('circle', { cx: r2(x + rnd() * 6 - 3), cy: r2(y + rnd() * 6 - 3), r: 1.8, fill: C.white }),
    );
  }
  return g(
    {},
    stroke(polyD(rope, false), shade, 9),
    stroke(polyD(rope, false), mid, 6),
    ...fringe,
    stroke(polyD(rope, false), lit, 1.6, 0.8),
    ...sparks,
    // The hooks it hangs from.
    el('circle', { cx: -150, cy: 0, r: 3, fill: C.silverShade }),
    el('circle', { cx: 150, cy: 0, r: 3, fill: C.silverShade }),
  );
}

/** A bauble hanging from (0, 0): a little cap, the glossy ball below. */
function bauble(colour: 'red' | 'gold' | 'silver'): string {
  const [lit, mid, shade] =
    colour === 'red'
      ? [C.redLit, C.red, C.redShade]
      : colour === 'gold'
        ? [C.goldLit, C.gold, C.goldShade]
        : [C.silverLit, C.silver, C.silverShade];
  const ball = radial([
    [0, lit, 1],
    [0.55, mid, 1],
    [1, shade, 1],
  ]);
  return g(
    {},
    defs(ball),
    stroke('M0 0L0 7', C.silverShade, 1.4),
    edge(
      polyD([
        [-4, 6],
        [4, 6],
        [4, 11],
        [-4, 11],
      ]),
      C.gold,
      1,
    ),
    edge(ellipseD(0, 23, 12.5, 12.5), ball.url, 1.6),
    path(ellipseD(-4, 18, 3.6, 2.6), C.white, { opacity: 0.85 }),
  );
}

function glint(): string {
  const soft = radial(
    [
      [0, '#FFFFFF', 0.95],
      [0.4, '#FFF6D0', 0.5],
      [1, '#FFF6D0', 0],
    ],
    0.5,
    0.5,
  );
  return g(
    {},
    defs(soft),
    path(ellipseD(0, 0, 14, 14), soft.url),
    path(
      polyD([
        [0, -21],
        [3, -3],
        [21, 0],
        [3, 3],
        [0, 21],
        [-3, 3],
        [-21, 0],
        [-3, -3],
      ]),
      '#FFFFFF',
      {
        opacity: 0.9,
      },
    ),
  );
}

function confetti(seed: number): string {
  const rnd = prng(seed);
  const cols = [C.red, C.gold, '#3C88C8', '#4FA26A', C.white, C.silver];
  const bits: string[] = [];
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 8 + rnd() * 54;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * 0.85;
    const c = cols[i % cols.length] ?? C.red;
    const rot = r2(rnd() * 180);
    bits.push(
      i % 5 === 0
        ? stroke(`M${r2(x)} ${r2(y)}q4 -6 8 0t8 0`, c, 2.2)
        : el('rect', {
            x: r2(x - 4),
            y: r2(y - 2.5),
            width: 8,
            height: 5,
            fill: c,
            transform: `rotate(${rot} ${r2(x)} ${r2(y)})`,
          }),
    );
  }
  return g({}, ...bits);
}

// --- Santa hats ---------------------------------------------------------------------------------

/** A Santa hat on the witch hats' anchor: the brim's centre at (0, 0), the cone flopping back. */
function santaHat(scale: 'l' | 'm' | 's'): string {
  const k = scale === 'l' ? 1 : scale === 'm' ? 0.54 : 0.28;
  const w = scale === 'l' ? 2.2 : scale === 'm' ? 2 : 1.6;
  const cloth = linear(
    [
      [0, C.santaShade],
      [0.45, C.santaLit],
      [1, C.santa],
    ],
    1,
    0,
  );
  const cone = smoothD(
    [
      [-30 * k, -4 * k],
      [-24 * k, -46 * k],
      [-2 * k, -80 * k],
      [26 * k, -92 * k],
      [44 * k, -74 * k],
      [36 * k, -60 * k],
      [16 * k, -56 * k],
      [24 * k, -4 * k],
    ],
    true,
    0.6,
  );
  const fluff = (cx: number, cy: number, rx: number, ry: number): string => {
    const fur = radial([
      [0, C.white, 1],
      [0.7, C.fur, 1],
      [1, C.furShade, 1],
    ]);
    return g({}, defs(fur), edge(ellipseD(cx, cy, rx, ry), fur.url, w * 0.8, '#8A8072'));
  };
  return g(
    {},
    defs(cloth),
    edge(cone, cloth.url, w),
    scale === 's'
      ? ''
      : stroke(
          smoothD(
            [
              [-18 * k, -10 * k],
              [-12 * k, -48 * k],
              [6 * k, -76 * k],
            ],
            false,
          ),
          C.santaLit,
          2.4 * k + 0.4,
          0.6,
        ),
    fluff(0, -4 * k, 40 * k, 12 * k),
    fluff(42 * k, -70 * k, 12 * k, 12 * k),
  );
}

// --- Oupa ---------------------------------------------------------------------------------------

/** Oupa's head: a sun-browned face, a full white beard and moustache, smiling eyes, a Santa hat.
 *  (0, 0) = the middle of his face. */
function oupaHead(): string {
  const face = radial([
    [0, C.skinLit, 1],
    [0.7, C.skin, 1],
    [1, C.skinShade, 1],
  ]);
  const beardFill = radial(
    [
      [0, C.white, 1],
      [0.7, C.beard, 1],
      [1, C.beardShade, 1],
    ],
    0.45,
    0.3,
  );
  return g(
    {},
    defs(face, beardFill),
    // Ears and face.
    edge(ellipseD(-31, 2, 7, 11), C.skin, 2),
    edge(ellipseD(31, 2, 7, 11), C.skin, 2),
    edge(ellipseD(0, -2, 30, 34), face.url, 2.2),
    // The beard and moustache (white, full, a little wavy).
    edge(
      smoothD(
        [
          [-30, 4],
          [-26, 30],
          [-14, 52],
          [0, 58],
          [14, 52],
          [26, 30],
          [30, 4],
          [16, 16],
          [0, 14],
          [-16, 16],
        ],
        true,
        0.7,
      ),
      beardFill.url,
      2,
      '#8A8278',
    ),
    edge(
      smoothD(
        [
          [-20, 14],
          [-8, 8],
          [0, 11],
          [8, 8],
          [20, 14],
          [8, 18],
          [0, 16],
          [-8, 18],
        ],
        true,
        0.7,
      ),
      C.beard,
      1.6,
      '#8A8278',
    ),
    stroke('M-6 24Q0 28 6 24', C.ink, 2),
    // A sun-browned nose and smiling eyes, bushy white brows.
    path(ellipseD(0, 4, 6, 6), C.skinShade, { opacity: 0.6 }),
    stroke('M-17 -6Q-12 -10 -7 -6', C.ink, 2.6),
    stroke('M7 -6Q12 -10 17 -6', C.ink, 2.6),
    stroke('M-19 -14Q-12 -19 -5 -15', C.beard, 4),
    stroke('M5 -15Q12 -19 19 -14', C.beard, 4),
    path(ellipseD(-20, 6, 5, 3), '#E87A6A', { opacity: 0.45 }),
    path(ellipseD(20, 6, 5, 3), '#E87A6A', { opacity: 0.45 }),
    // His Santa hat, a little back on his head.
    g({ transform: 'translate(-2 -26) rotate(-6) scale(0.92)' }, santaHat('l')),
  );
}

/** Oupa standing and waving, his feet at (0, 0): khaki shirt and shorts, vellies, a Santa hat. */
function oupa(): string {
  const shirt = linear(
    [
      [0, C.khakiLit],
      [0.5, C.khaki],
      [1, C.khakiShade],
    ],
    1,
    0,
  );
  const shorts = linear(
    [
      [0, C.khaki],
      [1, C.khakiShade],
    ],
    1,
    0.4,
  );
  const leg = (x: number): string =>
    g(
      {},
      edge(
        polyD([
          [x - 10, -128],
          [x + 10, -128],
          [x + 9, -36],
          [x - 9, -36],
        ]),
        C.skin,
        2,
      ),
      // Socks rolled down over the vellies.
      edge(
        polyD([
          [x - 10, -40],
          [x + 10, -40],
          [x + 10, -22],
          [x - 10, -22],
        ]),
        C.sock,
        1.8,
      ),
      // Velskoene: brown suede, a light stitched rand.
      edge(
        smoothD(
          [
            [x - 12, -24],
            [x + 12, -24],
            [x + 30, -10],
            [x + 30, 0],
            [x - 14, 0],
          ],
          true,
          0.6,
        ),
        C.velskoen,
        2.2,
      ),
      stroke(`M${x - 13} -4L${x + 29} -4`, C.velskoenLit, 2, 0.8),
    );
  return g(
    {},
    defs(shirt, shorts),
    path(ellipseD(6, 2, 62, 8), '#000000', { opacity: 0.2 }),
    leg(-18),
    leg(18),
    // Shorts.
    edge(
      polyD([
        [-36, -184],
        [36, -184],
        [40, -120],
        [4, -120],
        [0, -150],
        [-4, -120],
        [-40, -120],
      ]),
      shorts.url,
      2.4,
    ),
    stroke('M0 -184L0 -150', C.khakiShade, 2),
    edge(
      polyD([
        [-36, -186],
        [36, -186],
        [36, -176],
        [-36, -176],
      ]),
      '#5A4028',
      1.6,
    ),
    // Shirt: short sleeves, two flap pockets, the buttons down the front.
    edge(
      smoothD(
        [
          [-38, -180],
          [-44, -236],
          [-30, -262],
          [0, -268],
          [30, -262],
          [44, -236],
          [38, -180],
        ],
        true,
        0.6,
      ),
      shirt.url,
      2.4,
    ),
    edge(
      polyD([
        [-30, -238],
        [-12, -238],
        [-12, -214],
        [-30, -214],
      ]),
      C.khakiLit,
      1.6,
    ),
    edge(
      polyD([
        [12, -238],
        [30, -238],
        [30, -214],
        [12, -214],
      ]),
      C.khakiLit,
      1.6,
    ),
    stroke('M0 -262L0 -186', C.khakiShade, 1.6),
    ...[-250, -230, -210, -192].map((y) => el('circle', { cx: 0, cy: y, r: 2, fill: '#6A5430' })),
    // Left arm down, right arm up waving.
    edge(
      polyD([
        [-42, -258],
        [-54, -250],
        [-60, -196],
        [-46, -196],
        [-38, -236],
      ]),
      shirt.url,
      2.2,
    ),
    edge(
      polyD([
        [-60, -198],
        [-46, -198],
        [-46, -168],
        [-60, -168],
      ]),
      C.skin,
      2,
    ),
    edge(ellipseD(-53, -162, 9, 10), C.skin, 2),
    edge(
      polyD([
        [60, -282],
        [74, -290],
        [90, -336],
        [78, -342],
      ]),
      C.skin,
      2,
    ),
    edge(ellipseD(86, -348, 10, 12), C.skin, 2),
    stroke('M80 -356L78 -366M86 -358L86 -369M92 -356L95 -366', C.skin, 4),
    edge(
      polyD([
        [36, -262],
        [48, -268],
        [76, -292],
        [62, -300],
        [40, -280],
      ]),
      shirt.url,
      2.2,
    ),
    // His head and beard, the Santa hat on top.
    g({ transform: 'translate(0 -290) scale(0.82)' }, oupaHead()),
  );
}

function frameArt(name: XmasFrame, seed: number): string {
  if (name.startsWith('present_')) {
    const [, w, state] = name.split('_') as [string, PresentWrap, 'shut' | 'open'];
    return present(w, state === 'open', seed);
  }
  if (name.startsWith('lid_')) return lid(name.slice(4) as PresentWrap);
  switch (name) {
    case 'garland_silver':
      return garland('silver', 1201);
    case 'garland_red':
      return garland('red', 1202);
    case 'bauble_red':
      return bauble('red');
    case 'bauble_gold':
      return bauble('gold');
    case 'bauble_silver':
      return bauble('silver');
    case 'glint':
      return glint();
    case 'confetti':
      return confetti(1225);
    case 'hat_l':
      return santaHat('l');
    case 'hat_m':
      return santaHat('m');
    case 'hat_s':
      return santaHat('s');
    case 'oupa':
      return oupa();
    case 'oupa_head':
      return oupaHead();
    default:
      return '';
  }
}

/** The whole sheet as SVG (design px viewBox, rendered at XMAS_MASTER×). */
export function christmasSheetSvg(): string {
  seq = 0;
  const parts: string[] = [];
  for (const f of xmasFrames()) {
    const id = uid('cell');
    parts.push(
      g(
        {},
        el('clipPath', { id }, el('rect', { x: f.x, y: f.y, width: f.w, height: f.h })),
        g(
          { 'clip-path': `url(#${id})` },
          g(
            { transform: `translate(${r2(f.x + f.ox)} ${r2(f.y + f.oy)})` },
            frameArt(f.name, 2500 + parts.length * 13),
          ),
        ),
      ),
    );
  }
  return svgDoc(
    XMAS_SHEET_W * XMAS_MASTER,
    XMAS_SHEET_H * XMAS_MASTER,
    [0, 0, XMAS_SHEET_W, XMAS_SHEET_H],
    '',
    parts.join(''),
  );
}

export function renderChristmasSheet(): Rgba {
  return renderSvg(christmasSheetSvg());
}
