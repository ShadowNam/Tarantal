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
  OUPA_DRAWN,
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

type P = readonly [number, number];

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
// D-064 round 2: a box seen a little from the right and above — the front face lit from the
// left, the right side in shade, the paper's print (stars, dots or stripes) clipped to each face,
// fold creases at the edges; a glossy ribbon (dark rims, a bright streak) and a full bow with
// shaded loops, inner shadows and a knot with a highlight. Fine detail (print, creases, streaks)
// is at the 2× master's scale: the 1× Standard pack softens it, HD keeps it.

/** The box: front face x −52 … 36, y −38 … 50; the side face skews 20 px right, 12 px up. */
const FRONT: P[] = [
  [-52, -38],
  [36, -38],
  [36, 50],
  [-52, 50],
];
const SIDE: P[] = [
  [36, -38],
  [56, -50],
  [56, 38],
  [36, 50],
];
const TOP: P[] = [
  [-52, -38],
  [-32, -50],
  [56, -50],
  [36, -38],
];

/** The paper's print over a face (clipped to it). */
function print(w: PresentWrap, face: readonly P[], seed: number, shade: number): string {
  const id = uid('face');
  const rnd = prng(seed);
  const ink = WRAPS[w].dot;
  const marks: string[] = [];
  if (w === 'a')
    // Little five-point gold stars in a loose grid.
    for (let y = -56; y < 56; y += 14)
      for (let x = -60; x < 64; x += 16) {
        const cx = x + ((y / 14) % 2 === 0 ? 0 : 8) + rnd() * 2;
        const cy = y + rnd() * 2;
        const pts: P[] = [];
        for (let k = 0; k < 10; k++) {
          const a = (k * Math.PI) / 5 - Math.PI / 2;
          const r = k % 2 === 0 ? 4.2 : 1.8;
          pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        marks.push(path(polyD(pts), ink, { opacity: 0.85 * shade }));
      }
  else if (w === 'b')
    // Polka dots, two sizes.
    for (let y = -56; y < 56; y += 11)
      for (let x = -60; x < 64; x += 11) {
        const big = ((x + y) / 11) % 2 === 0;
        marks.push(
          el('circle', {
            cx: r2(x + ((y / 11) % 2 === 0 ? 0 : 5.5)),
            cy: r2(y),
            r: big ? 2.6 : 1.4,
            fill: ink,
            opacity: 0.8 * shade,
          }),
        );
      }
  else
    // Diagonal stripes, a broad one and a fine one.
    for (let k = -140; k < 140; k += 16) {
      marks.push(stroke(`M${k} -60L${k + 120} 60`, ink, 4, 0.55 * shade));
      marks.push(stroke(`M${k + 8} -60L${k + 128} 60`, ink, 1, 0.7 * shade));
    }
  // Paper grain: a few faint flecks (a 2× detail).
  for (let i = 0; i < 26; i++)
    marks.push(
      el('circle', {
        cx: r2(-58 + rnd() * 116),
        cy: r2(-56 + rnd() * 108),
        r: 0.5,
        fill: '#FFFFFF',
        opacity: 0.18,
      }),
    );
  return g(
    {},
    el('clipPath', { id }, path(polyD(face), '#000')),
    g({ 'clip-path': `url(#${id})` }, ...marks),
  );
}

/** A glossy ribbon band along a line (from a to b, width w): dark rims, a bright streak. */
function ribbonBand(a: P, b: P, width: number, w: PresentWrap, shade = 1): string {
  const [lit, mid, dark] = WRAPS[w].ribbon;
  const d = `M${r2(a[0])} ${r2(a[1])}L${r2(b[0])} ${r2(b[1])}`;
  // Butt ends: the band stops at the box's edges.
  const band = (colour: string, wd: number, op = 1): string =>
    el('path', {
      d,
      fill: 'none',
      stroke: colour,
      'stroke-width': wd,
      'stroke-linecap': 'butt',
      opacity: op,
    });
  return g(
    { opacity: shade },
    band(dark, width),
    band(mid, width - 3),
    band(lit, Math.max(1, width * 0.18), 0.9),
  );
}

/** The bow, its knot at (0, 0): two shaded loops with inner shadows, two folded tails. */
function bow(w: PresentWrap): string {
  const [lit, mid, dark] = WRAPS[w].ribbon;
  const loop = (s: 1 | -1): string => {
    const outer = smoothD(
      [
        [0, 0],
        [s * 14, -22],
        [s * 36, -34],
        [s * 50, -22],
        [s * 40, -6],
      ],
      true,
      0.8,
    );
    const inner = smoothD(
      [
        [s * 10, -6],
        [s * 22, -20],
        [s * 36, -24],
        [s * 40, -14],
        [s * 30, -8],
      ],
      true,
      0.8,
    );
    return g(
      {},
      edge(outer, mid, 2.2),
      path(inner, dark, { opacity: 0.75 }),
      stroke(`M${s * 8} -10Q${s * 22} -30 ${s * 40} -28`, lit, 2.4, 0.9),
      stroke(`M${s * 30} -30Q${s * 40} -30 ${s * 46} -22`, '#FFFFFF', 1, 0.7),
    );
  };
  const tail = (s: 1 | -1): string =>
    g(
      {},
      edge(
        polyD([
          [s * 2, 2],
          [s * 22, 26],
          [s * 16, 30],
          [s * 28, 36],
          [s * 8, 8],
        ]),
        dark,
        1.8,
      ),
      stroke(`M${s * 5} 6L${s * 20} 26`, mid, 2, 0.8),
    );
  return g(
    {},
    tail(-1),
    tail(1),
    loop(-1),
    loop(1),
    edge(ellipseD(0, -3, 9, 8), mid, 2),
    path(ellipseD(-2.5, -6, 3.5, 2.6), lit),
    el('circle', { cx: -3.5, cy: -7, r: 1.1, fill: '#FFFFFF', opacity: 0.9 }),
  );
}

/** The lid (its front band and top) with its bow; (0, 0) = where it sits on the box. */
function lid(w: PresentWrap, withBow = true): string {
  const [pl, pm, ps] = WRAPS[w].paper;
  const front = linear(
    [
      [0, pl],
      [0.5, pm],
      [1, ps],
    ],
    1,
    0,
  );
  const top = linear([
    [0, pl],
    [1, pm],
  ]);
  // Front band x −56 … 40, y −16 … 0; side −> 60; top above, a little lighter.
  const bandF: P[] = [
    [-56, -16],
    [40, -16],
    [40, 2],
    [-56, 2],
  ];
  const bandS: P[] = [
    [40, -16],
    [60, -28],
    [60, -10],
    [40, 2],
  ];
  const lidTop: P[] = [
    [-56, -16],
    [-36, -28],
    [60, -28],
    [40, -16],
  ];
  return g(
    {},
    defs(front, top),
    edge(polyD(lidTop), top.url, 2),
    print(w, lidTop, 77, 0.8),
    edge(polyD(bandF), front.url, 2.2),
    print(w, bandF, 78, 0.9),
    edge(polyD(bandS), ps, 2),
    // The ribbon over the lid: down the front band and across the top.
    ribbonBand([-4, -16], [-4, 2], 14, w),
    ribbonBand([-24, -22], [56, -22], 9, w, 0.9),
    ribbonBand([4, -28], [-14, -16], 10, w, 0.9),
    stroke('M-54 -15L39 -15', '#FFFFFF', 1, 0.45),
    withBow ? g({ transform: 'translate(2 -24)' }, bow(w)) : '',
  );
}

/** A present (box centre at the origin, its foot 50 px below). Open: the lid leans against the
 *  box, the bow has flown, tissue and a toy guineafowl peep out of the dark inside. */
function present(w: PresentWrap, open: boolean, seed: number, restingLid = true): string {
  const [pl, pm, ps] = WRAPS[w].paper;
  const front = linear(
    [
      [0, pl],
      [0.35, pm],
      [1, ps],
    ],
    1,
    0.25,
  );
  const side = linear(
    [
      [0, ps],
      [1, '#000000'],
    ],
    1,
    0,
  );
  const box = g(
    {},
    path(ellipseD(4, 51, 70, 8), '#000000', { opacity: 0.24 }),
    edge(polyD(SIDE), side.url, 2.4),
    print(w, SIDE, seed + 1, 0.45),
    edge(polyD(FRONT), front.url, 2.6),
    print(w, FRONT, seed, 1),
    // Sun on the left of the front, shade into the bottom, the folds at the edges.
    path(
      polyD([
        [-52, -38],
        [-40, -38],
        [-40, 50],
        [-52, 50],
      ]),
      '#FFFFFF',
      { opacity: 0.14 },
    ),
    path(
      polyD([
        [-52, 36],
        [36, 36],
        [36, 50],
        [-52, 50],
      ]),
      '#000000',
      { opacity: 0.16 },
    ),
    stroke('M-47 -34L-47 46', '#FFFFFF', 1, 0.35),
    stroke('M33 -34L33 46', '#000000', 1, 0.25),
    stroke('M38 -30L54 -40', '#000000', 1, 0.3),
    // The ribbon: down the front and the side, round the middle.
    ribbonBand([-8, -38], [-8, 50], 16, w),
    ribbonBand([-52, 4], [36, 4], 13, w),
    ribbonBand([36, 4], [56, -8], 12, w, 0.75),
    edge(polyD(FRONT), 'none', 2.6),
  );
  if (!open) return g({}, defs(front, side), box, g({ transform: 'translate(0 -38)' }, lid(w)));
  const tissue = smoothD(
    [
      [-50, -40],
      [-36, -62],
      [-20, -48],
      [-6, -70],
      [12, -52],
      [30, -66],
      [54, -50],
      [34, -40],
    ],
    true,
    0.7,
  );
  return g(
    {},
    defs(front, side),
    // The lid, its bow flown, knocked back: it stands tilted behind the open box.
    restingLid ? g({ transform: 'translate(14 -54) rotate(-14) scale(0.92)' }, lid(w, false)) : '',
    // The open top: the dark inside, tissue paper, a toy guineafowl peeping out.
    path(polyD(TOP), C.inside),
    path(
      polyD([
        [-50, -39],
        [34, -39],
        [52, -49],
        [-30, -49],
      ]),
      '#1E120C',
      { opacity: 0.6 },
    ),
    toyFowl(),
    edge(tissue, C.tissue, 1.6, '#B8A888'),
    stroke('M-30 -52Q-20 -58 -8 -54M18 -56Q28 -62 40 -54', '#E8D8B4', 1.4),
    box,
    // The flaps of the open top fold outwards.
    edge(
      polyD([
        [-52, -38],
        [-62, -48],
        [-40, -54],
        [-32, -50],
      ]),
      pl,
      1.8,
    ),
    edge(
      polyD([
        [56, -50],
        [64, -60],
        [44, -62],
        [36, -52],
      ]),
      ps,
      1.8,
    ),
  );
}

/** A small plush guineafowl peeping out of an open present: speckled grey, a blue face, a red
 *  wattle and a yellow-brown helmet — the game's own bird, as a toy. */
function toyFowl(): string {
  const dots: string[] = [];
  for (let i = 0; i < 10; i++)
    dots.push(
      el('circle', {
        cx: r2(-8 + (i % 5) * 4),
        cy: r2(-52 + Math.floor(i / 5) * 4),
        r: 0.9,
        fill: '#FFFFFF',
      }),
    );
  return g(
    {},
    edge(ellipseD(0, -50, 14, 9), '#4A4E5A', 1.6),
    ...dots,
    edge(ellipseD(10, -62, 7, 7), '#5DA0D8', 1.4),
    path(
      polyD([
        [9, -69],
        [12, -76],
        [14, -68],
      ]),
      '#C89A50',
    ),
    path(ellipseD(12, -56, 2.2, 3), '#D8302E'),
    el('circle', { cx: 12, cy: -63, r: 1.3, fill: '#1A1016' }),
    el('circle', { cx: 12.4, cy: -63.4, r: 0.4, fill: '#FFFFFF' }),
    path(
      polyD([
        [16, -62],
        [21, -61],
        [16, -59],
      ]),
      '#E8C88A',
    ),
  );
}

// --- tinsel -------------------------------------------------------------------------------------

/** A tinsel garland from (−150, 0) to (150, 0), sagging ~56 px: a twisted strand of foil — a rope
 *  wound with a bright spiral, a dense fringe of fine foil hairs catching the light — and a few
 *  sparkles. */
function garland(colour: 'silver' | 'red', seed: number): string {
  const [lit, mid, shade] =
    colour === 'silver' ? [C.silverLit, C.silver, C.silverShade] : [C.redLit, C.red, C.redShade];
  const rnd = prng(seed);
  const at = (t: number): [number, number] => [-150 + 300 * t, 56 * 4 * t * (1 - t)];
  const rope = Array.from({ length: 41 }, (_, i) => at(i / 40));
  const fringe: string[] = [];
  for (let i = 0; i < 320; i++) {
    const t = rnd();
    const [x, y] = at(t);
    const a = rnd() * Math.PI * 2;
    const l = 5 + rnd() * 9;
    const c = rnd() < 0.25 ? lit : rnd() < 0.6 ? mid : shade;
    const bend = (rnd() - 0.5) * 4;
    fringe.push(
      stroke(
        `M${r2(x)} ${r2(y)}Q${r2(x + Math.cos(a) * l * 0.5 + bend)} ${r2(y + Math.sin(a) * l * 0.5)} ${r2(x + Math.cos(a) * l)} ${r2(y + Math.sin(a) * l)}`,
        c,
        0.9 + rnd() * 0.8,
        0.95,
      ),
    );
  }
  // The spiral: short bright dashes across the rope, every few px.
  const spiral: string[] = [];
  for (let i = 0; i < 60; i++) {
    const t = (i + 0.5) / 60;
    const [x, y] = at(t);
    spiral.push(stroke(`M${r2(x - 2)} ${r2(y - 3)}L${r2(x + 2)} ${r2(y + 3)}`, lit, 1.4, 0.85));
  }
  const sparks: string[] = [];
  for (let i = 0; i < 9; i++) {
    const [x, y] = at(0.06 + rnd() * 0.88);
    const r = 3 + rnd() * 2.5;
    sparks.push(
      path(
        polyD([
          [x, y - r],
          [x + 0.8, y - 0.8],
          [x + r, y],
          [x + 0.8, y + 0.8],
          [x, y + r],
          [x - 0.8, y + 0.8],
          [x - r, y],
          [x - 0.8, y - 0.8],
        ]),
        C.white,
        { opacity: 0.95 },
      ),
    );
  }
  return g(
    {},
    stroke(polyD(rope, false), shade, 8),
    stroke(polyD(rope, false), mid, 5),
    ...fringe,
    ...spiral,
    ...sparks,
    el('circle', { cx: -150, cy: 0, r: 3, fill: C.silverShade }),
    el('circle', { cx: 150, cy: 0, r: 3, fill: C.silverShade }),
  );
}

/** A bauble hanging from (0, 0): a ridged cap and wire loop, a glossy ball with a window
 *  reflection, a rim light on the shade side and a soft band of colour. */
function bauble(colour: 'red' | 'gold' | 'silver'): string {
  const [lit, mid, shade] =
    colour === 'red'
      ? [C.redLit, C.red, C.redShade]
      : colour === 'gold'
        ? [C.goldLit, C.gold, C.goldShade]
        : [C.silverLit, C.silver, C.silverShade];
  const ball = radial([
    [0, lit, 1],
    [0.5, mid, 1],
    [1, shade, 1],
  ]);
  return g(
    {},
    defs(ball),
    stroke('M0 0Q-2 3 0 7', C.silverShade, 1.2),
    edge(
      polyD([
        [-4, 6],
        [4, 6],
        [4, 11],
        [-4, 11],
      ]),
      C.gold,
      0.8,
    ),
    stroke('M-2.5 7L-2.5 10.5M0 7L0 10.5M2.5 7L2.5 10.5', C.goldShade, 0.6),
    edge(ellipseD(0, 23, 12.5, 12.5), ball.url, 1.4),
    stroke('M-11 26Q0 31 11 26', lit, 1.2, 0.45),
    // A window's reflection and a rim light.
    path(
      polyD([
        [-8, 15],
        [-4, 14],
        [-4, 19],
        [-8, 20],
      ]),
      C.white,
      { opacity: 0.8 },
    ),
    path(
      polyD([
        [-3.4, 14],
        [-1.2, 13.8],
        [-1.2, 18.6],
        [-3.4, 18.9],
      ]),
      C.white,
      { opacity: 0.6 },
    ),
    stroke('M8 17Q11 23 7 31', C.white, 1, 0.35),
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

/** Oupa's head: a sun-browned face, a full white beard and moustache, smiling eyes, a Santa hat
 *  (D-065: another special's hat instead, drawn by `hat` in the face's coordinates).
 *  (0, 0) = the middle of his face. */
export function oupaHead(
  hat: () => string = () =>
    g({ transform: 'translate(-2 -26) rotate(-6) scale(0.92)' }, santaHat('l')),
): string {
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
    hat(),
  );
}

/**
 * Oupa standing and waving, his feet at (0, 0) (D-064 round 2: at the v1.6/v1.7 bar): a lean old
 * farmer, a little stooped — a khaki short-sleeved shirt with flap pockets, rolled sleeves and
 * folds at the elbow and belt, a leather belt, khaki shorts with creases, sun-browned arms and
 * legs shaded round (knees, calves, knuckles), socks rolled over brown suede vellies, a Santa hat.
 */
export function oupa(
  head: () => string = () => oupaHead(),
  /** D-065: something held in the waving hand (New Year's party blower), drawn under it. */
  inHand: () => string = () => '',
): string {
  const shirt = linear(
    [
      [0, C.khakiLit],
      [0.45, C.khaki],
      [1, C.khakiShade],
    ],
    1,
    0,
  );
  const shorts = linear(
    [
      [0, C.khakiLit],
      [0.5, C.khaki],
      [1, C.khakiShade],
    ],
    1,
    0,
  );
  const limb = linear(
    [
      [0, C.skinLit],
      [0.55, C.skin],
      [1, C.skinShade],
    ],
    1,
    0,
  );
  const suede = linear(
    [
      [0, C.velskoenLit],
      [1, C.velskoen],
    ],
    0,
    1,
  );
  const leg = (x: number, lean: number): string =>
    g(
      {},
      // Thigh to ankle, a knee and a calf: a tapered, shaded shape.
      edge(
        smoothD(
          [
            [x - 11, -128],
            [x + 11, -128],
            [x + 10 + lean, -92],
            [x + 9 + lean, -80],
            [x + 10 + lean, -58],
            [x + 7 + lean, -36],
            [x - 7 + lean, -36],
            [x - 9 + lean, -60],
            [x - 10 + lean, -80],
            [x - 11 + lean * 0.5, -96],
          ],
          true,
          0.6,
        ),
        limb.url,
        2,
      ),
      // The knee: a soft highlight and a crease.
      path(ellipseD(x + lean - 1, -86, 6, 5), C.skinLit, { opacity: 0.55 }),
      stroke(`M${x + lean - 5} -80Q${x + lean} -77 ${x + lean + 5} -80`, C.skinShade, 1.2, 0.8),
      // Socks rolled down over the vellies, a ribbed edge.
      edge(
        polyD([
          [x - 9 + lean, -40],
          [x + 9 + lean, -40],
          [x + 10 + lean, -22],
          [x - 10 + lean, -22],
        ]),
        C.sock,
        1.6,
      ),
      stroke(
        `M${x - 8 + lean} -36L${x + 8 + lean} -36M${x - 8 + lean} -32L${x + 8 + lean} -32`,
        '#C8BEA8',
        1,
      ),
      // Velskoene: brown suede, a stitched rand, laces, a sole.
      edge(
        smoothD(
          [
            [x - 12 + lean, -24],
            [x + 12 + lean, -24],
            [x + 26 + lean, -14],
            [x + 32 + lean, -4],
            [x + 30 + lean, 0],
            [x - 14 + lean, 0],
          ],
          true,
          0.6,
        ),
        suede.url,
        2,
      ),
      stroke(`M${x - 13 + lean} -4L${x + 30 + lean} -4`, '#3A2618', 2.4),
      stroke(`M${x - 10 + lean} -8L${x + 26 + lean} -8`, '#E8D8B8', 0.8, 0.8),
      stroke(
        `M${x + 2 + lean} -20L${x + 10 + lean} -16M${x + 4 + lean} -16L${x + 12 + lean} -13`,
        '#2A1A10',
        1,
      ),
    );
  const hand = (cx: number, cy: number, rot: number): string =>
    g(
      { transform: `translate(${cx} ${cy}) rotate(${rot})` },
      // Palm and four fingers, a thumb; knuckles shaded.
      edge(ellipseD(0, 0, 8, 9), C.skin, 1.6),
      ...[-6, -2, 2, 6].map((fx, i) =>
        edge(
          `M${fx - 1.8} -6L${fx - 1.6} ${-16 - (i === 1 || i === 2 ? 2 : 0)}Q${fx} ${-19 - (i === 1 || i === 2 ? 2 : 0)} ${fx + 1.6} ${-16 - (i === 1 || i === 2 ? 2 : 0)}L${fx + 1.8} -6Z`,
          C.skinLit,
          1.2,
        ),
      ),
      edge('M7 0Q14 -4 15 -10Q12 -11 9 -6Z', C.skin, 1.2),
      stroke('M-6 -4L6 -4', C.skinShade, 0.8, 0.7),
    );
  return g(
    {},
    defs(shirt, shorts, limb, suede),
    path(ellipseD(8, 2, 62, 8), '#000000', { opacity: 0.2 }),
    leg(-17, -2),
    leg(17, 3),
    // Shorts: wide legs, creases at the fly and the hems, pockets.
    edge(
      polyD([
        [-36, -186],
        [36, -186],
        [42, -124],
        [6, -120],
        [0, -150],
        [-6, -120],
        [-42, -124],
      ]),
      shorts.url,
      2.4,
    ),
    stroke('M0 -184L0 -150', C.khakiShade, 1.6),
    stroke('M-30 -138L-14 -134M14 -134L30 -138', C.khakiShade, 1.2, 0.8),
    stroke('M-32 -178Q-24 -168 -26 -158M32 -178Q24 -168 26 -158', C.khakiShade, 1.2, 0.7),
    stroke('M-40 -128L-8 -124M8 -124L40 -128', C.khakiLit, 1.2, 0.7),
    // Belt and buckle.
    edge(
      polyD([
        [-37, -192],
        [37, -192],
        [37, -182],
        [-37, -182],
      ]),
      '#5A3A22',
      1.6,
    ),
    edge(
      polyD([
        [-5, -193],
        [5, -193],
        [5, -181],
        [-5, -181],
      ]),
      C.gold,
      1.2,
    ),
    // Shirt: a body with folds tucked into the belt, a collar, flap pockets, buttons.
    edge(
      smoothD(
        [
          [-38, -186],
          [-44, -236],
          [-30, -264],
          [0, -270],
          [30, -264],
          [44, -236],
          [38, -186],
        ],
        true,
        0.6,
      ),
      shirt.url,
      2.4,
    ),
    stroke(
      'M-30 -190Q-26 -200 -32 -210M28 -190Q24 -202 30 -212M-8 -190L-4 -200',
      C.khakiShade,
      1.2,
      0.8,
    ),
    edge(
      polyD([
        [-14, -268],
        [0, -254],
        [-4, -270],
      ]),
      C.khakiLit,
      1.4,
    ),
    edge(
      polyD([
        [14, -268],
        [0, -254],
        [4, -270],
      ]),
      C.khakiLit,
      1.4,
    ),
    edge(
      polyD([
        [-30, -240],
        [-12, -240],
        [-12, -216],
        [-30, -216],
      ]),
      C.khaki,
      1.4,
    ),
    edge(
      polyD([
        [-31, -242],
        [-11, -242],
        [-13, -233],
        [-29, -233],
      ]),
      C.khakiLit,
      1.4,
    ),
    edge(
      polyD([
        [12, -240],
        [30, -240],
        [30, -216],
        [12, -216],
      ]),
      C.khaki,
      1.4,
    ),
    edge(
      polyD([
        [11, -242],
        [31, -242],
        [29, -233],
        [13, -233],
      ]),
      C.khakiLit,
      1.4,
    ),
    stroke('M0 -254L0 -192', C.khakiShade, 1.4),
    ...[-246, -228, -210].map((y) => el('circle', { cx: 0, cy: y, r: 1.8, fill: '#6A5430' })),
    // Left arm down: a rolled sleeve, a shaded forearm, his hand.
    edge(
      polyD([
        [-40, -260],
        [-56, -248],
        [-60, -214],
        [-44, -212],
        [-38, -236],
      ]),
      shirt.url,
      2.2,
    ),
    stroke('M-60 -218L-44 -216', C.khakiShade, 2.4),
    edge(
      smoothD(
        [
          [-58, -214],
          [-46, -214],
          [-46, -180],
          [-50, -168],
          [-58, -168],
          [-60, -186],
        ],
        true,
        0.6,
      ),
      limb.url,
      1.8,
    ),
    hand(-53, -160, 180),
    // Right arm up, waving: the upper arm, its rolled sleeve, the forearm, an open hand.
    edge(
      polyD([
        [61.7, -279.1],
        [71.5, -291.7],
        [60.5, -300.3],
        [50.7, -287.7],
      ]),
      limb.url,
      1.8,
    ),
    edge(
      polyD([
        [45.1, -254.4],
        [63.3, -277.8],
        [49.1, -289],
        [30.9, -265.6],
      ]),
      shirt.url,
      2.2,
    ),
    stroke('M63.3 -277.8L49.1 -289', C.khakiShade, 2.6),
    stroke('M38 -262Q46 -270 52 -280', C.khakiShade, 1, 0.6),
    edge(
      smoothD(
        [
          [64, -298],
          [74, -292],
          [88, -326],
          [86, -340],
          [78, -340],
          [70, -320],
        ],
        true,
        0.6,
      ),
      limb.url,
      1.8,
    ),
    inHand(),
    hand(84, -348, 12),
    // His head and beard, the Santa hat on top.
    g({ transform: 'translate(0 -292) scale(0.82)' }, head()),
  );
}

function frameArt(name: XmasFrame, seed: number): string {
  if (name.startsWith('present_')) {
    const [, w, state] = name.split('_') as [string, PresentWrap, 'shut' | 'open'];
    // Open: lid-less — the game's lid sprite tumbles off and comes to rest behind the box.
    return present(w, state === 'open', seed, false);
  }
  // The flying lid has no bow: the bow pops off on its own (bow_<wrap>).
  if (name.startsWith('lid_')) return lid(name.slice(4) as PresentWrap, false);
  if (name.startsWith('bow_')) return bow(name.slice(4) as PresentWrap);
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
      return g({ transform: `scale(${OUPA_DRAWN})` }, oupa());
    case 'oupa_head':
      return g({ transform: `scale(${OUPA_DRAWN})` }, oupaHead());
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
