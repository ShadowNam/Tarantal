// v1.11 (D-068, art bible §6.1) interim art for Die Braai, the tally's night at Oupa's fire: one
// small sheet (layout in src/game/braai/braaiSheet.ts), drawn at `k`× (1 = the Standard pack,
// 2 = its HD twin). Inked Bosveld Comic at night: every figure lit warm from the fire on its right
// (the screen's right: the fire burns between Oupa and the slate) and cool from the sky on its
// left, ink outlines, form from gradients.
// - Oupa (D-064's old Karoo farmer: sun-browned, a full white beard, bushy brows, a khaki shirt
//   and shorts, socks over brown vellies, his khaki bush hat) in a canvas camp chair, three poses:
//   at rest with his enamel mug on his knee, a sip, leaning to poke the coals (the poker is its own
//   frame, rotated by the view toward the coals). Two vastrap frames standing (a knee up with his
//   hat raised; a stamp with his knees bent), mirrored by the view for the other foot.
// - The fire: four flame frames (layered tongues that never repeat a shape), the hearth (a ring of
//   stones, glowing coals, the grid, a blue enamel coffee pot at its side), a soft glow, three
//   spark frames (a few embers rising, so the loop climbs).
// - The sky: a star tile (wraps at its edges), the Milky Way's band with its dust lanes, the
//   Southern Cross (Acrux, Mimosa, Gacrux, Delta and Epsilon Crucis). The bakkie: a generic pickup
//   in silhouette (no brand), a cool rim of sky light on its roof and a warm glint from the fire.
// Coordinates: design px round each frame's origin; figures are drawn in Oupa units × OUPA_K.
import {
  BRAAI_SHEET_H,
  BRAAI_SHEET_W,
  FLAME,
  POKE_HAND,
  POKER,
  STAR_TILE,
  braaiFrames,
  sheetRect,
  type BraaiFrame,
} from '../../src/game/braai/braaiSheet';
import type { Rgba } from '../assets/image';
import { renderSvg } from './raster';
import { el, ellipseD, g, polyD, prng, r2, smoothD, svgDoc } from './svg';

type P = readonly [number, number];

/** Oupa units (D-064's figure: ~330 tall standing) to design px. */
export const OUPA_K = 0.52;

const C = {
  ink: '#140C0A',
  // Khaki and skin by firelight: lit (warm, the fire's side), mid, shade (cool, the sky's side).
  khakiLit: '#E8B574',
  khaki: '#9C8054',
  khakiShade: '#4C4234',
  skinLit: '#F2A676',
  skin: '#B4724E',
  skinShade: '#5C3A30',
  beardLit: '#FFE6C8',
  beard: '#D8D2CA',
  beardShade: '#8A8690',
  hatLit: '#C8A068',
  hat: '#7E6644',
  hatShade: '#3E3428',
  sock: '#C8BCA8',
  sockShade: '#6A645C',
  velskoenLit: '#A06A3A',
  velskoen: '#5A3820',
  canvasLit: '#7E8C5A',
  canvas: '#465036',
  canvasShade: '#262C20',
  steel: '#3A3A40',
  steelLit: '#C8A078',
  enamelLit: '#9AC0F0',
  enamel: '#3C6AA8',
  enamelShade: '#1C3458',
  stoneLit: '#B88A66',
  stone: '#5A4A44',
  stoneShade: '#24201E',
} as const;

let seq = 0;
const uid = (p: string): string => `br${p}${seq++}`;
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

interface Grad {
  readonly def: string;
  readonly url: string;
}
function linear(stops: readonly [number, string, number?][], x2 = 1, y2 = 0): Grad {
  const id = uid('lg');
  return {
    def: el(
      'linearGradient',
      { id, x1: 0, y1: 0, x2, y2 },
      ...stops.map(([o, c, a]) =>
        el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a ?? 1 }),
      ),
    ),
    url: `url(#${id})`,
  };
}
function radial(stops: readonly [number, string, number][], cx = 0.5, cy = 0.5, r = 0.5): Grad {
  const id = uid('rg');
  return {
    def: el(
      'radialGradient',
      { id, cx, cy, r },
      ...stops.map(([o, c, a]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a })),
    ),
    url: `url(#${id})`,
  };
}
const defs = (...d: Grad[]): string => el('defs', {}, ...d.map((x) => x.def));

/** Firelit from the right: shade on the left, lit on the right (objectBoundingBox). */
const lit3 = (shade: string, mid: string, lit: string): Grad =>
  linear([
    [0, shade],
    [0.5, mid],
    [1, lit],
  ]);

// --- Oupa: a puppet of shaded limbs --------------------------------------------------------------

/** A tapered limb from a (width wa) to b (width wb), round at both ends. */
function limbD(a: P, b: P, wa: number, wb: number): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const ra = wa / 2;
  const rb = wb / 2;
  const p1: P = [a[0] + nx * ra, a[1] + ny * ra];
  const p2: P = [b[0] + nx * rb, b[1] + ny * rb];
  const p3: P = [b[0] - nx * rb, b[1] - ny * rb];
  const p4: P = [a[0] - nx * ra, a[1] - ny * ra];
  return (
    `M${r2(p1[0])} ${r2(p1[1])}L${r2(p2[0])} ${r2(p2[1])}` +
    `A${r2(rb)} ${r2(rb)} 0 0 0 ${r2(p3[0])} ${r2(p3[1])}` +
    `L${r2(p4[0])} ${r2(p4[1])}A${r2(ra)} ${r2(ra)} 0 0 0 ${r2(p1[0])} ${r2(p1[1])}Z`
  );
}

interface Paints {
  readonly skin: Grad;
  readonly khaki: Grad;
  readonly sock: Grad;
  readonly suede: Grad;
  readonly hat: Grad;
  readonly face: Grad;
  readonly beard: Grad;
}

function paints(): Paints {
  return {
    skin: lit3(C.skinShade, C.skin, C.skinLit),
    khaki: lit3(C.khakiShade, C.khaki, C.khakiLit),
    sock: lit3(C.sockShade, C.sock, '#F0E4D0'),
    suede: lit3('#2A1A10', C.velskoen, C.velskoenLit),
    hat: lit3(C.hatShade, C.hat, C.hatLit),
    face: radial(
      [
        [0, C.skinLit, 1],
        [0.55, C.skin, 1],
        [1, C.skinShade, 1],
      ],
      0.7,
      0.4,
      0.75,
    ),
    beard: radial(
      [
        [0, C.beardLit, 1],
        [0.6, C.beard, 1],
        [1, C.beardShade, 1],
      ],
      0.72,
      0.3,
      0.8,
    ),
  };
}

/** v1.15 (D-077): children clipped to the shape `d` (folds, strands and texture stay inside). */
function clipped(d: string, ...children: string[]): string {
  const id = uid('cp');
  return g(
    {},
    el('clipPath', { id }, el('path', { d })),
    g({ 'clip-path': `url(#${id})` }, ...children),
  );
}

/** v1.15: a dashed stitch line. */
const stitch = (d: string, colour: string, w: number, dash: number, op = 0.8): string =>
  el('path', {
    d,
    fill: 'none',
    stroke: colour,
    'stroke-width': w,
    'stroke-dasharray': `${r2(dash)} ${r2(dash * 0.9)}`,
    'stroke-linecap': 'round',
    opacity: op,
  });

/** v1.15: a cloth fold: a shade crease with the lit ridge beside it (toward the fire). */
const fold = (d: string, ridge: string, w = 1.6): string =>
  g({}, stroke(d, C.khakiShade, w, 0.75), stroke(ridge, C.khakiLit, w * 0.7, 0.5));

/** One guineafowl feather tucked in the hat band (slate grey, white spots). */
function feather(): string {
  const d = smoothD(
    [
      [0, 0],
      [-4, -10],
      [-2, -24],
      [3, -30],
      [5, -18],
      [3, -6],
    ],
    true,
    0.7,
  );
  return g(
    { transform: 'translate(-22 -6) rotate(-28)' },
    edge(d, '#3C4250', 1),
    stroke('M1 -2Q0 -16 3 -28', '#1E222A', 0.8),
    ...[
      [-1, -8],
      [2, -12],
      [-1, -16],
      [2, -20],
      [0.5, -24],
    ].map(([x, y]) => path(ellipseD(x ?? 0, y ?? 0, 0.9, 0.9), '#F4F0E8')),
  );
}

/** His khaki bush hat: a soft crown with a pinched dent, a leather band with a guineafowl
 *  feather, the brim curled a little with its stitching and its shaded underside. */
function bushHat(p: Paints): string {
  const brim = smoothD(
    [
      [-50, 2],
      [-30, -6],
      [30, -6],
      [50, 2],
      [30, 8],
      [-30, 8],
    ],
    true,
    0.7,
  );
  const crown = smoothD(
    [
      [-28, -2],
      [-26, -26],
      [-10, -36],
      [0, -30],
      [10, -36],
      [26, -26],
      [28, -2],
    ],
    true,
    0.6,
  );
  return g(
    {},
    edge(brim, p.hat.url, 2.2),
    clipped(
      brim,
      // The underside shows under the front edge, darker; the fire catches the right rim.
      path('M-52 4Q0 14 52 4L52 12L-52 12Z', C.hatShade, { opacity: 0.7 }),
      stroke('M30 -4Q46 -2 48 3', C.hatLit, 1.6, 0.8),
    ),
    stitch('M-44 2Q-28 -3 0 -3Q28 -3 44 2', C.hatShade, 0.8, 2.2, 0.7),
    edge(crown, p.hat.url, 2.2),
    clipped(
      crown,
      // Shade in the pinch and down the sky side, the felt's soft lit flank on the fire side.
      path('M-30 -40L-14 -40L-20 0L-30 0Z', C.hatShade, { opacity: 0.35 }),
      stroke('M-6 -30Q0 -22 6 -30', C.hatShade, 2, 0.9),
      stroke('M-4 -28Q-2 -16 -3 -8', C.hatShade, 1.2, 0.5),
      stroke('M14 -30Q22 -24 24 -12', C.hatLit, 1.6, 0.8),
      stroke('M-18 -30Q-22 -20 -22 -8', '#2E261C', 1, 0.4),
    ),
    // The leather band, its stitched edge and a brass ring.
    edge(
      polyD([
        [-28, -9],
        [28, -9],
        [28, -1],
        [-28, -1],
      ]),
      '#3A2A1C',
      1.4,
    ),
    stroke('M-26 -7.5L26 -7.5', '#6A4A2E', 0.8, 0.8),
    stroke('M6 -3L26 -3', '#7A5634', 0.8, 0.6),
    edge(ellipseD(20, -5, 2.6, 3), '#C89A52', 0.8),
    feather(),
  );
}

/** Oupa's head (D-064's face) by firelight, his bush hat on (or not: the dance raises it). */
function head(p: Paints, hat: boolean, mouthOpen = false): string {
  const face = ellipseD(0, -2, 30, 34);
  const beardD = smoothD(
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
  );
  const tache = smoothD(
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
  );
  // Beard strands: curling down from the cheeks to the point, darker under, lit on the fire side.
  const rnd = prng(311);
  const strands: string[] = [];
  for (let k = 0; k < 22; k++) {
    const x0 = -26 + (k / 21) * 52 + (rnd() - 0.5) * 4;
    const y0 = 10 + Math.abs(x0) * 0.2 + rnd() * 6;
    const x1 = x0 * 0.45 + (rnd() - 0.5) * 6;
    const y1 = 40 + (1 - Math.abs(x0) / 30) * 14 + rnd() * 4;
    const mx = (x0 + x1) / 2 + (x0 < 0 ? -4 : 4);
    const colour = k % 3 === 0 ? C.beardShade : x0 > 6 ? C.beardLit : '#EEEAE4';
    strands.push(
      stroke(
        `M${r2(x0)} ${r2(y0)}Q${r2(mx)} ${r2((y0 + y1) / 2)} ${r2(x1)} ${r2(y1)}`,
        colour,
        k % 3 === 0 ? 1.1 : 0.9,
        k % 3 === 0 ? 0.7 : 0.8,
      ),
    );
  }
  return g(
    {},
    edge(ellipseD(-31, 2, 7, 11), C.skinShade, 2),
    edge(ellipseD(31, 2, 7, 11), C.skinLit, 2),
    // The ears' inner curl.
    stroke('M-32 -4Q-36 2 -31 9', '#3A2420', 1.2, 0.8),
    stroke('M32 -4Q36 2 31 9', C.skin, 1.2, 0.9),
    edge(face, p.face.url, 2.2),
    clipped(
      face,
      // The sky side of the face in cool shade, the brim's shadow over the brow, forehead lines.
      path('M-34 -40L-16 -40Q-24 0 -14 40L-34 40Z', '#3A2C3A', { opacity: 0.22 }),
      ...(hat
        ? [path(ellipseD(0, -22, 34, 9), '#2A1810', { opacity: 0.35 })]
        : [
            stroke('M-16 -22Q0 -26 16 -22', C.skinShade, 1.1, 0.6),
            stroke('M-12 -27Q0 -30 12 -27', C.skinShade, 1, 0.5),
          ]),
      // Crow's feet from the laughing eyes, the cheeks ruddy in the heat.
      stroke('M-21 -4L-25 -6M-21 -2L-25 -1', C.skinShade, 0.9, 0.7),
      stroke('M21 -4L25 -6M21 -2L25 -1', '#8A4A34', 0.9, 0.7),
      path(ellipseD(-17, 5, 6, 3.6), '#D06048', { opacity: 0.3 }),
      path(ellipseD(20, 6, 6, 3.6), '#F07A5A', { opacity: 0.5 }),
    ),
    // Thin white hair at the temples when the hat is off.
    ...(hat
      ? []
      : [
          stroke('M-28 -18Q-20 -34 0 -36Q20 -34 28 -18', C.beard, 5, 0.9),
          stroke('M-24 -24Q-14 -32 -4 -32', C.beardLit, 2, 0.8),
          stroke('M4 -33Q16 -32 24 -24', C.beardLit, 1.4, 0.7),
        ]),
    edge(beardD, p.beard.url, 2, '#4A4650'),
    clipped(
      beardD,
      path('M-34 0L-18 0Q-20 30 -6 64L-34 64Z', C.beardShade, { opacity: 0.35 }),
      ...strands,
    ),
    // The nose: a sun-browned bulb, lit on the fire side, nostrils.
    edge(
      smoothD(
        [
          [-3, -4],
          [4, -4],
          [8, 6],
          [6, 11],
          [-5, 11],
          [-8, 6],
        ],
        true,
        0.8,
      ),
      p.face.url,
      1.4,
      '#3A2018',
    ),
    path(ellipseD(4, 4, 2.4, 3), C.skinLit, { opacity: 0.8 }),
    path(ellipseD(-3, 10, 1.6, 1), '#3A1A14', { opacity: 0.7 }),
    path(ellipseD(4, 10, 1.6, 1), '#3A1A14', { opacity: 0.7 }),
    edge(tache, C.beard, 1.6, '#4A4650'),
    clipped(
      tache,
      stroke('M-18 14Q-10 12 -4 14M-16 16Q-10 15 -6 17', C.beardShade, 0.9, 0.8),
      stroke('M4 14Q10 12 18 14M6 17Q10 15 16 16', C.beardLit, 0.9, 0.9),
    ),
    mouthOpen ? edge(ellipseD(0, 25, 6, 5), '#3A1A14', 1.6) : stroke('M-6 24Q0 28 6 24', C.ink, 2),
    ...(mouthOpen ? [path(ellipseD(0, 28, 3.4, 1.8), '#B8504A', { opacity: 0.9 })] : []),
    stroke('M-17 -6Q-12 -10 -7 -6', C.ink, 2.6),
    stroke('M7 -6Q12 -10 17 -6', C.ink, 2.6),
    // A wet glint in each eye's crease (the fire on the right).
    path(ellipseD(14, -8, 1.3, 0.9), '#FFE8C8', { opacity: 0.9 }),
    path(ellipseD(-10, -8, 1.1, 0.8), '#E8E0F0', { opacity: 0.6 }),
    stroke('M-19 -14Q-12 -19 -5 -15', C.beard, 4),
    stroke('M5 -15Q12 -19 19 -14', C.beardLit, 4),
    stroke('M-17 -15L-13 -18M-12 -16L-9 -18M8 -16L11 -18M13 -16L17 -18', C.beardShade, 0.7, 0.8),
    ...(hat ? [g({ transform: 'translate(0 -24) rotate(-3)' }, bushHat(p))] : []),
  );
}

/** A hand (a mitten with a thumb), its back toward us: knuckles, a lit edge. */
function hand(p: Paints, cx: number, cy: number, rot: number, r = 10): string {
  return g(
    { transform: `translate(${r2(cx)} ${r2(cy)}) rotate(${r2(rot)})` },
    edge(ellipseD(0, 0, r, r * 1.1), p.skin.url, 1.8),
    edge(ellipseD(r * 0.8, -r * 0.5, r * 0.42, r * 0.6), p.skin.url, 1.4),
    stroke(`M${-r * 0.5} ${r * 0.2}L${r * 0.4} ${r * 0.3}`, C.skinShade, 1, 0.7),
    stroke(
      `M${-r * 0.6} ${-r * 0.35}L${-r * 0.35} ${-r * 0.5}M${-r * 0.15} ${-r * 0.55}L${r * 0.1} ${-r * 0.65}`,
      C.skinShade,
      0.9,
      0.6,
    ),
    stroke(
      `M${r * 0.6} ${-r * 0.1}Q${r * 0.9} ${r * 0.4} ${r * 0.4} ${r * 0.85}`,
      C.skinLit,
      1,
      0.7,
    ),
  );
}

/** The enamel mug, handle right; its rim at (0, 0): a dark rim, a chip, coffee, steam. */
function mug(): string {
  const body = lit3(C.enamelShade, C.enamel, C.enamelLit);
  return g(
    {},
    defs(body),
    edge('M13 4Q22 4 22 12Q22 20 13 20', 'none', 3.2),
    edge(
      polyD([
        [-12, 0],
        [13, 0],
        [12, 24],
        [-11, 24],
      ]),
      body.url,
      1.8,
    ),
    stroke('M-11.5 22.5L12 22.5', '#14223A', 2, 0.8),
    edge(ellipseD(0.5, 0, 12.5, 3.4), '#E8EEF4', 1.4),
    stroke('M-11 0.6Q0.5 4.6 12 0.6', '#1C2A40', 1.2, 0.9),
    path(ellipseD(0.5, 0.6, 10, 2.2), '#3A2010'),
    path(ellipseD(-6, 14, 2.2, 1.6), '#F4F0E8', { opacity: 0.9 }),
    path(ellipseD(-6, 14, 1.2, 0.9), '#1A1A20'),
    stroke('M-8 6L-8 20', '#E8F0FF', 1.4, 0.4),
    stroke('M11 4L10.5 20', '#FFB070', 1.2, 0.6),
    // Steam: two soft curls.
    stroke('M-3 -6Q-7 -14 -2 -20Q2 -26 -2 -32', '#E8E4E0', 2, 0.35),
    stroke('M5 -5Q1 -12 6 -18', '#E8E4E0', 1.6, 0.3),
  );
}

/** A leg from hip to foot with a knee: shorts on the thigh (hem, creases), the bare shin, a
 *  ribbed sock folded over, and a velskoen with laces, a welted sole and a scuffed toe. */
function leg(p: Paints, hip: P, knee: P, foot: P, toe: 1 | -1): string {
  const ankle: P = [foot[0], foot[1] - 30];
  const sockTop: P = [
    foot[0] + (knee[0] - foot[0]) * 0.22,
    foot[1] - 30 - (foot[1] - 30 - knee[1]) * 0.22,
  ];
  const hem: P = [knee[0] + (hip[0] - knee[0]) * 0.18, knee[1] + (hip[1] - knee[1]) * 0.18];
  const thigh = limbD(hip, hem, 34, 28);
  const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  // Across-the-limb unit vector at the hem (for the cuff and the creases).
  const tx = hem[0] - hip[0];
  const ty = hem[1] - hip[1];
  const tl = Math.hypot(tx, ty) || 1;
  const nx = -ty / tl;
  const ny = tx / tl;
  const across = (c: P, w: number, bend = 0): string =>
    `M${r2(c[0] - nx * w)} ${r2(c[1] - ny * w)}Q${r2(c[0] + (tx / tl) * bend)} ${r2(c[1] + (ty / tl) * bend)} ${r2(c[0] + nx * w)} ${r2(c[1] + ny * w)}`;
  const cuff = lerp(hip, hem, 0.84);
  const along = (off: number, bulge: number, reach: number): string => {
    const m = lerp(hip, hem, reach * 0.55);
    const e = lerp(hip, hem, reach);
    return `M${r2(hip[0] + nx * off)} ${r2(hip[1] + ny * off)}Q${r2(m[0] + nx * bulge)} ${r2(m[1] + ny * bulge)} ${r2(e[0] + nx * off)} ${r2(e[1] + ny * off)}`;
  };
  const shoe = smoothD(
    [
      [foot[0] - 13, foot[1] - 26],
      [foot[0] + 11, foot[1] - 26],
      [foot[0] + 14 + toe * 10, foot[1] - 10],
      [foot[0] + 12 + toe * 16, foot[1]],
      [foot[0] - 14 + toe * 2, foot[1]],
    ],
    true,
    0.6,
  );
  const fx = foot[0];
  const fy = foot[1];
  const lace = [0, 1]
    .map((k) => {
      const y = fy - 22 + k * 5;
      const x = fx + 2 + toe * k * 3;
      return `M${r2(x - 5)} ${r2(y)}L${r2(x + 5)} ${r2(y + 3)}M${r2(x + 5)} ${r2(y)}L${r2(x - 5)} ${r2(y + 3)}`;
    })
    .join('');
  return g(
    {},
    edge(limbD(knee, ankle, 22, 16), p.skin.url, 2),
    // The shin's lit ridge and the calf in shade.
    stroke(
      `M${r2(knee[0] + 6)} ${r2(knee[1] + 8)}L${r2(ankle[0] + 5)} ${r2(ankle[1] - 6)}`,
      C.skinLit,
      1.4,
      0.6,
    ),
    edge(limbD(sockTop, ankle, 19, 18), p.sock.url, 1.6),
    // The folded-over sock top (a band) and its ribs.
    stroke(
      `M${r2(sockTop[0] - 9)} ${r2(sockTop[1] + 3)}L${r2(sockTop[0] + 9)} ${r2(sockTop[1] + 3)}`,
      C.sockShade,
      1.2,
      0.7,
    ),
    stroke(
      [0.35, 0.5, 0.65, 0.8]
        .map((t) => {
          const c = lerp(sockTop, ankle, t);
          return `M${r2(c[0] - 7)} ${r2(c[1])}L${r2(c[0] + 7)} ${r2(c[1])}`;
        })
        .join(''),
      C.sockShade,
      0.8,
      0.55,
    ),
    edge(shoe, p.suede.url, 2),
    clipped(
      shoe,
      // Laces over the instep, the eyelets, a scuffed lit toe, the welt and its stitching.
      stroke(lace, '#D8B888', 0.7, 0.6),
      path(ellipseD(fx + 10 + toe * 12, fy - 9, 6, 4), C.velskoenLit, { opacity: 0.55 }),
      stroke(`M${fx - 12} ${fy - 15}Q${fx - 6} ${fy - 9} ${fx - 12} ${fy - 4}`, '#1E120A', 1, 0.6),
    ),
    stroke(`M${fx - 14 + toe * 2} ${fy - 3}L${fx + 12 + toe * 16} ${fy - 3}`, '#1A100A', 2.6),
    stitch(
      `M${fx - 12 + toe * 2} ${fy - 5.6}L${fx + 10 + toe * 16} ${fy - 5.6}`,
      '#C8A070',
      0.6,
      1.4,
      0.7,
    ),
    // Shorts over the thigh to just above the knee: the hem's cuff, creases from the hip.
    edge(thigh, p.khaki.url, 2.2),
    clipped(
      thigh,
      stroke(across(cuff, 18, -1), C.khakiShade, 1.4, 0.8),
      stroke(across(lerp(cuff, hem, 0.35), 18, -1), C.khakiLit, 0.9, 0.6),
      // Pull creases running along the thigh from the hip toward the knee.
      fold(along(4, 8, 0.7), along(7, 11, 0.7), 1.2),
      fold(along(-6, -2, 0.5), along(-3, 1, 0.5), 1),
      // The underside of the thigh in shade.
      stroke(
        `M${r2(hip[0] - nx * 15)} ${r2(hip[1] - ny * 15)}L${r2(hem[0] - nx * 13)} ${r2(hem[1] - ny * 13)}`,
        C.khakiShade,
        5,
        0.4,
      ),
    ),
    path(ellipseD(knee[0] + 1, knee[1] + 2, 6, 5), C.skinLit, { opacity: 0.45 }),
    stroke(
      `M${knee[0] - 4} ${knee[1] + 7}Q${knee[0]} ${knee[1] + 9} ${knee[0] + 4} ${knee[1] + 7}`,
      C.skinShade,
      0.9,
      0.6,
    ),
  );
}

/** An arm: the rolled sleeve (its cuff and folds) at the shoulder, upper arm to elbow, forearm
 *  to the hand. */
function arm(p: Paints, shoulder: P, elbow: P, wrist: P, handRot: number): string {
  const mid: P = [
    shoulder[0] + (elbow[0] - shoulder[0]) * 0.5,
    shoulder[1] + (elbow[1] - shoulder[1]) * 0.5,
  ];
  const sleeve = limbD(shoulder, mid, 30, 24);
  const dx = mid[0] - shoulder[0];
  const dy = mid[1] - shoulder[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const at = (t: number, w: number): string => {
    const c: P = [shoulder[0] + dx * t, shoulder[1] + dy * t];
    return `M${r2(c[0] - nx * w)} ${r2(c[1] - ny * w)}Q${r2(c[0] + (dx / l) * 3)} ${r2(c[1] + (dy / l) * 3)} ${r2(c[0] + nx * w)} ${r2(c[1] + ny * w)}`;
  };
  const along = (off: number, bulge: number): string =>
    `M${r2(shoulder[0] + nx * off)} ${r2(shoulder[1] + ny * off)}Q${r2(shoulder[0] + dx * 0.4 + nx * bulge)} ${r2(shoulder[1] + dy * 0.4 + ny * bulge)} ${r2(shoulder[0] + dx * 0.75 + nx * off)} ${r2(shoulder[1] + dy * 0.75 + ny * off)}`;
  return g(
    {},
    edge(limbD(shoulder, elbow, 20, 16), p.skin.url, 1.8),
    edge(limbD(elbow, wrist, 16, 13), p.skin.url, 1.8),
    // Sinew along the forearm's lit side.
    stroke(
      `M${r2(elbow[0] + (wrist[0] - elbow[0]) * 0.2)} ${r2(elbow[1] + (wrist[1] - elbow[1]) * 0.2)}L${r2(elbow[0] + (wrist[0] - elbow[0]) * 0.8)} ${r2(elbow[1] + (wrist[1] - elbow[1]) * 0.8)}`,
      C.skinLit,
      1.2,
      0.45,
    ),
    edge(sleeve, p.khaki.url, 2),
    clipped(
      sleeve,
      // The rolled cuff: a band, its lit roll, then a crease up toward the shoulder seam.
      stroke(at(0.82, 16), C.khakiShade, 1.8, 0.85),
      stroke(at(0.9, 16), C.khakiLit, 1.2, 0.7),
      fold(along(4, 8), along(7, 11), 1.1),
    ),
    hand(p, wrist[0], wrist[1], handRot),
  );
}

/** The shirt and belt: a torso from the shoulders (y top) to the belt (y bottom): collar,
 *  buttoned placket, flap pockets with buttons, a yoke seam, folds from the arms and the cloth
 *  bunching over the belt, a worn belt with a brass buckle. */
function torso(p: Paints, top: number, bottom: number, lean = 0): string {
  const l = lean;
  const body = smoothD(
    [
      [-38 + l * 0.2, bottom],
      [-44 + l * 0.6, bottom - 50],
      [-32 + l, top + 6],
      [0 + l, top],
      [32 + l, top + 6],
      [44 + l * 0.6, bottom - 50],
      [38 + l * 0.2, bottom],
    ],
    true,
    0.6,
  );
  const pocket = (x0: number, x1: number): string => {
    const a = x0 + l * 0.8;
    const b = x1 + l * 0.8;
    const m = (a + b) / 2;
    return g(
      {},
      edge(
        polyD([
          [a, top + 26],
          [b, top + 26],
          [b, top + 48],
          [a, top + 48],
        ]),
        p.khaki.url,
        1.4,
      ),
      stitch(
        `M${a + 2} ${top + 30}L${a + 2} ${top + 46}L${b - 2} ${top + 46}L${b - 2} ${top + 30}`,
        C.khakiShade,
        0.6,
        1.3,
        0.7,
      ),
      // The flap, its shadow and button.
      edge(
        polyD([
          [a - 1, top + 25],
          [b + 1, top + 25],
          [b + 1, top + 32],
          [m, top + 35],
          [a - 1, top + 32],
        ]),
        p.khaki.url,
        1.2,
      ),
      stroke(`M${a} ${top + 34}L${m} ${top + 37}L${b} ${top + 34}`, C.khakiShade, 1.4, 0.5),
      edge(ellipseD(m, top + 32, 1.6, 1.6), '#5A4A36', 0.6),
    );
  };
  return g(
    {},
    edge(body, p.khaki.url, 2.4),
    clipped(
      body,
      // The sky side in deeper shade, the fire side's warm rim.
      path(
        `M${-48 + l} ${top}L${-30 + l} ${top}Q${-36 + l} ${(top + bottom) / 2} ${-28} ${bottom}L${-48} ${bottom}Z`,
        C.khakiShade,
        { opacity: 0.35 },
      ),
      stroke(
        `M${34 + l} ${top + 10}Q${44 + l * 0.6} ${bottom - 50} ${38 + l * 0.2} ${bottom}`,
        '#FFC88A',
        2.4,
        0.45,
      ),
      // The yoke seam across the shoulders.
      stitch(
        `M${-32 + l} ${top + 14}Q${l} ${top + 10} ${32 + l} ${top + 14}`,
        C.khakiShade,
        0.7,
        1.6,
        0.6,
      ),
      // Folds: from the armpits down toward the belt, the cloth bunched over the belt.
      fold(
        `M${-34 + l * 0.7} ${top + 30}Q${-24 + l * 0.5} ${top + 56} ${-28 + l * 0.4} ${bottom - 22}`,
        `M${-31 + l * 0.7} ${top + 32}Q${-21 + l * 0.5} ${top + 56} ${-25 + l * 0.4} ${bottom - 24}`,
      ),
      fold(
        `M${34 + l * 0.7} ${top + 30}Q${26 + l * 0.5} ${top + 58} ${30 + l * 0.4} ${bottom - 20}`,
        `M${31 + l * 0.7} ${top + 32}Q${23 + l * 0.5} ${top + 58} ${27 + l * 0.4} ${bottom - 22}`,
      ),
      fold(
        `M${-30 + l * 0.3} ${bottom - 12}Q${-18 + l * 0.3} ${bottom - 18} ${-8 + l * 0.3} ${bottom - 11}`,
        `M${-28 + l * 0.3} ${bottom - 15}Q${-18 + l * 0.3} ${bottom - 21} ${-10 + l * 0.3} ${bottom - 14}`,
        1.3,
      ),
      fold(
        `M${8 + l * 0.3} ${bottom - 11}Q${18 + l * 0.3} ${bottom - 19} ${30 + l * 0.3} ${bottom - 12}`,
        `M${10 + l * 0.3} ${bottom - 14}Q${18 + l * 0.3} ${bottom - 22} ${28 + l * 0.3} ${bottom - 15}`,
        1.3,
      ),
      stroke(
        `M${-26 + l * 0.4} ${bottom - 6}Q${-20 + l * 0.4} ${bottom - 18} ${-28 + l * 0.5} ${bottom - 30}`,
        C.khakiShade,
        1.2,
        0.8,
      ),
    ),
    // Collar, placket and its buttons.
    edge(
      polyD([
        [-14 + l, top + 2],
        [l, top + 16],
        [-4 + l, top],
      ]),
      C.khakiLit,
      1.4,
    ),
    edge(
      polyD([
        [14 + l, top + 2],
        [l, top + 16],
        [4 + l, top],
      ]),
      C.khakiLit,
      1.4,
    ),
    stroke(`M${l} ${top + 16}L${l * 0.3} ${bottom}`, C.khakiShade, 1.4),
    stroke(`M${l + 2.6} ${top + 18}L${l * 0.3 + 2.6} ${bottom - 8}`, C.khakiLit, 0.8, 0.6),
    ...[0.22, 0.48, 0.74].map((t) =>
      edge(
        ellipseD(l + (l * 0.3 - l) * t - 1.6, top + 16 + (bottom - top - 16) * t, 1.7, 1.7),
        '#5A4A36',
        0.6,
      ),
    ),
    pocket(-30, -12),
    pocket(12, 30),
    // Belt (worn leather, stitched edges, a keeper loop) and buckle.
    edge(
      polyD([
        [-38, bottom - 8],
        [38, bottom - 8],
        [38, bottom + 2],
        [-38, bottom + 2],
      ]),
      '#3A2618',
      1.6,
    ),
    stitch(
      `M-36 ${bottom - 6}L36 ${bottom - 6}M-36 ${bottom}L36 ${bottom}`,
      '#8A6040',
      0.5,
      1.4,
      0.7,
    ),
    stroke(`M8 ${bottom - 7}L32 ${bottom - 7}`, '#A06A3A', 1, 0.6),
    edge(
      polyD([
        [-5, bottom - 9],
        [5, bottom - 9],
        [5, bottom + 3],
        [-5, bottom + 3],
      ]),
      '#D8A060',
      1.2,
    ),
    edge(
      polyD([
        [-2.6, bottom - 6],
        [2.6, bottom - 6],
        [2.6, bottom],
        [-2.6, bottom],
      ]),
      '#3A2618',
      0.6,
      '#7A5220',
    ),
    stroke(`M3 ${bottom - 8}L4 ${bottom + 2}`, '#FFE0A0', 0.8, 0.8),
    edge(
      polyD([
        [9, bottom - 9],
        [13, bottom - 9],
        [13, bottom + 3],
        [9, bottom + 3],
      ]),
      '#2E1E12',
      0.8,
    ),
  );
}

type SeatPose = 'idle' | 'sip' | 'poke';

/** A tube of the chair's frame: dark steel, the fire's warm line along its lit side, the sky's
 *  cool line on the other. */
function tube(a: P, b: P, w: number, near: boolean): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * w * 0.22;
  const ny = (dx / l) * w * 0.22;
  // The lit side is the one facing right (the fire).
  const s = nx > 0 || (nx === 0 && ny < 0) ? 1 : -1;
  return g(
    {},
    edge(limbD(a, b, w, w), near ? C.steel : '#26262C', near ? 1.4 : 1.2),
    stroke(
      `M${r2(a[0] + nx * s)} ${r2(a[1] + ny * s)}L${r2(b[0] + nx * s)} ${r2(b[1] + ny * s)}`,
      C.steelLit,
      Math.max(0.8, w * 0.22),
      near ? 0.9 : 0.5,
    ),
    stroke(
      `M${r2(a[0] - nx * s)} ${r2(a[1] - ny * s)}L${r2(b[0] - nx * s)} ${r2(b[1] - ny * s)}`,
      '#6A7088',
      Math.max(0.6, w * 0.14),
      near ? 0.5 : 0.3,
    ),
  );
}

/** The canvas camp chair, side view (facing right): its slanted back and sagging seat sling
 *  behind him (stitched hems, a seam), the far frame; the near armrest (a wooden rest on its
 *  post), the X legs with a rivet and rubber feet in front. */
function campChair(back: boolean): string {
  const cv = lit3(C.canvasShade, C.canvas, C.canvasLit);
  if (back) {
    const backD =
      'M-60 -236Q-46 -232 -36 -228Q-28 -170 -14 -110Q-30 -104 -40 -100Q-52 -170 -60 -236Z';
    const seatD = 'M-42 -108Q6 -88 52 -106L50 -90Q4 -74 -40 -92Z';
    return g(
      {},
      defs(cv),
      // The far frame (darker), the canvas back slanting back, the seat sling sagging.
      tube([-58, -238], [-30, -96], 6, false),
      edge(backD, cv.url, 2),
      clipped(
        backD,
        stitch('M-56 -230Q-46 -226 -38 -222', C.canvasLit, 0.8, 2, 0.7),
        stitch('M-55 -226Q-48 -168 -36 -106', C.canvasShade, 0.8, 2, 0.8),
        stroke('M-52 -200L-34 -196', C.canvasShade, 1.4, 0.6),
        stroke('M-48 -170Q-38 -168 -28 -164', C.canvasShade, 1.2, 0.5),
        stroke('M-46 -168Q-36 -166 -27 -162', C.canvasLit, 0.8, 0.4),
        // The canvas weave: faint threads.
        stroke(
          [0, 1, 2, 3, 4, 5, 6].map((k) => `M-58 ${-224 + k * 18}L-20 ${-218 + k * 18}`).join(''),
          C.canvasShade,
          0.5,
          0.35,
        ),
      ),
      edge(seatD, cv.url, 2),
      clipped(
        seatD,
        path('M-44 -100Q6 -80 54 -98L54 -86L-44 -86Z', C.canvasShade, { opacity: 0.6 }),
        stitch('M-38 -104Q6 -85 48 -102', C.canvasLit, 0.8, 2, 0.7),
      ),
      tube([-66, -236], [-36, -96], 7, true),
      // The back's top cap.
      edge(ellipseD(-66, -237, 4.4, 3.4), '#1A1A1E', 1),
    );
  }
  return g(
    {},
    // The near armrest: a wooden rest (grain, the fire on its edge) on the frame, its post.
    tube([34, -142], [44, -96], 6, true),
    edge(
      'M-44 -154Q-40 -158 -30 -157L42 -147Q48 -146 46 -140L44 -137L-42 -146Q-46 -148 -44 -154Z',
      '#6A4426',
      1.4,
    ),
    stroke('M-38 -153L40 -144', '#C88A50', 1.2, 0.8),
    stroke('M-30 -150L10 -146M14 -146L34 -143', '#3A2414', 0.6, 0.6),
    // The X legs, their rivet, rubber feet and the ground bar.
    tube([-40, -96], [54, 0], 6, true),
    tube([50, -96], [-44, 0], 6, true),
    edge(ellipseD(5, -48, 3, 3), '#8A8A92', 1),
    path(ellipseD(6, -49, 1.2, 1.2), '#FFD0A0'),
    stroke('M-48 0L58 0', '#1A1A1E', 3),
    edge(ellipseD(-44, 0, 5, 2.6), '#101012', 1),
    edge(ellipseD(54, 0, 5, 2.6), '#101012', 1),
  );
}

/** Oupa in his camp chair, side on and facing the fire (right), feet at (0, 0) in Oupa units:
 *  thighs level, shins down, his back against the canvas. */
function seated(pose: SeatPose): string {
  const p = paints();
  const hip: P = [-26, -104];
  const shoulders = -200;
  const lean = pose === 'poke' ? 12 : 0;
  const far = (s: string): string => g({ opacity: 0.88 }, s);
  const parts: string[] = [defs(p.skin, p.khaki, p.sock, p.suede, p.hat, p.face, p.beard)];
  parts.push(campChair(true));
  // The far leg (a little behind and higher), then the near one.
  parts.push(far(leg(p, [hip[0] + 8, hip[1] - 4], [38, -112], [34, -4], 1)));
  // The far arm resting on his far knee.
  parts.push(far(arm(p, [-12 + lean, shoulders + 18], [-2, shoulders + 70], [30, -120], 10)));
  parts.push(torso(p, shoulders, hip[1] + 2, lean));
  parts.push(leg(p, hip, [44, -104], [46, 0], 1));
  const hx = 4 + lean;
  if (pose === 'idle') {
    parts.push(g({ transform: `translate(${hx} ${shoulders - 40}) rotate(4)` }, head(p, true)));
    parts.push(g({ transform: 'translate(62 -138)' }, mug()));
    parts.push(arm(p, [30, shoulders + 14], [34, shoulders + 74], [58, -116], -20));
  } else if (pose === 'sip') {
    parts.push(g({ transform: `translate(${hx} ${shoulders - 40}) rotate(-6)` }, head(p, true)));
    parts.push(g({ transform: `translate(18 ${shoulders - 18}) rotate(-28)` }, mug()));
    parts.push(arm(p, [30, shoulders + 14], [56, shoulders + 48], [30, shoulders - 2], -70));
  } else {
    // Leaning toward the fire, the poker in his near hand (the poker frame starts at the hand).
    parts.push(
      g({ transform: `translate(${hx + 4} ${shoulders - 36}) rotate(10)` }, head(p, true)),
    );
    const at: P = [POKE_HAND.x / OUPA_K, POKE_HAND.y / OUPA_K];
    parts.push(arm(p, [30 + lean, shoulders + 16], [at[0] - 30, shoulders + 66], at, 60));
  }
  parts.push(campChair(false));
  return g({ transform: `scale(${OUPA_K})` }, ...parts);
}

type DanceStep = 'a' | 'b';

/** Oupa dancing the vastrap, feet at (0, 0) in Oupa units, his bush hat on (review 7): a: his
 *  left knee up and his right hand raised high, waving; b: the stamp, knees bent, both hands out. */
function dancing(step: DanceStep): string {
  const p = paints();
  const parts: string[] = [defs(p.skin, p.khaki, p.sock, p.suede, p.hat, p.face, p.beard)];
  // The hat's crown stays ≥ 8 px inside the frame's top (DANCING.oy, lesson 12).
  const shoulders = step === 'a' ? -292 : -284;
  const belt = shoulders + 108;
  if (step === 'a') {
    parts.push(leg(p, [16, belt], [20, belt + 82], [24, 0], 1));
    parts.push(leg(p, [-18, belt], [-44, belt + 44], [-38, belt + 128], -1));
  } else {
    parts.push(leg(p, [-18, belt], [-36, belt + 84], [-40, 0], -1));
    parts.push(leg(p, [18, belt], [36, belt + 84], [40, 0], 1));
  }
  parts.push(torso(p, shoulders, belt, step === 'a' ? -4 : 0));
  parts.push(g({ transform: `translate(0 ${shoulders - 40})` }, head(p, true, true)));
  if (step === 'a') {
    // Right hand high, waving (his hat stays on), the left on his hip.
    parts.push(arm(p, [40, shoulders + 14], [66, shoulders - 26], [70, shoulders - 84], -10));
    parts.push(arm(p, [-40, shoulders + 14], [-66, shoulders + 54], [-36, belt - 8], 30));
  } else {
    parts.push(arm(p, [40, shoulders + 14], [72, shoulders + 44], [90, shoulders + 12], -40));
    parts.push(arm(p, [-40, shoulders + 14], [-72, shoulders + 44], [-90, shoulders + 12], 40));
  }
  return g({ transform: `scale(${OUPA_K})` }, ...parts);
}

/** The poker: a bent steel rod, its hot tip glowing; held at (0, 0), pointing right. */
function poker(): string {
  const hot = radial([
    [0, '#FFE8A0', 1],
    [0.5, '#FF7A2A', 0.9],
    [1, '#FF3A10', 0],
  ]);
  return g(
    {},
    defs(hot),
    edge(limbD([0, 0], [POKER.w - 12, 0], 4, 3.4), C.steel, 1.2),
    stroke(`M2 -1L${POKER.w - 14} -1`, C.steelLit, 1, 0.8),
    path(ellipseD(POKER.w - 10, 0, 8, 4.5), hot.url),
  );
}

// --- the fire ------------------------------------------------------------------------------------

/** One flame frame: three layers of tongues from the base (0, 0) upward, frame `i` of 4 (v1.15:
 *  deep red at the root and the edges → orange → yellow tips, a white-hot heart low down, a
 *  soft halo, licks breaking off). */
function flame(i: number): string {
  const rnd = prng(4100 + i * 97);
  const tongue = (w: number, h: number, dx: number, lean: number): string => {
    const tip: P = [dx + lean, -h];
    return smoothD(
      [
        [dx - w, 0],
        [dx - w * 0.9, -h * 0.35],
        [dx - w * 0.4 + lean * 0.5, -h * 0.7],
        tip,
        [dx + w * 0.4 + lean * 0.4, -h * 0.66],
        [dx + w * 0.95, -h * 0.32],
        [dx + w, 0],
      ],
      true,
      0.55,
    );
  };
  // Vertical gradients (top → bottom): each layer's tip is its lightest colour.
  const outer = linear(
    [
      [0, '#FF8A1A', 0.1],
      [0.2, '#FF6A10', 0.8],
      [0.55, '#C8240A', 0.95],
      [1, '#6A0C04', 1],
    ],
    0,
    1,
  );
  const mid = linear(
    [
      [0, '#FFD040', 0.2],
      [0.25, '#FFB030', 0.95],
      [0.7, '#FF7A14', 1],
      [1, '#E0400A', 1],
    ],
    0,
    1,
  );
  const core = linear(
    [
      [0, '#FFFFF0', 0.4],
      [0.3, '#FFFBE0', 1],
      [1, '#FFE27A', 1],
    ],
    0,
    1,
  );
  const halo = radial([
    [0, '#FF9A3A', 0.45],
    [0.6, '#FF6A1A', 0.15],
    [1, '#FF6A1A', 0],
  ]);
  const parts: string[] = [defs(outer, mid, core, halo)];
  const H = FLAME.oy - 4;
  parts.push(path(ellipseD(0, -H * 0.3, 26, H * 0.42), halo.url));
  // v1.15 review: separate outer tongues with darker red edges (each its own flame).
  for (let k = 0; k < 4; k++) {
    const dx = (k - 1.5) * 9 + (rnd() - 0.5) * 5;
    const d = tongue(8 + rnd() * 3, H * (0.6 + rnd() * 0.4), dx, (rnd() - 0.5) * 18);
    parts.push(
      el('path', {
        d,
        fill: outer.url,
        stroke: '#7A0E04',
        'stroke-width': 1.3,
        'stroke-opacity': 0.75,
        'stroke-linejoin': 'round',
      }),
    );
  }
  for (let k = 0; k < 3; k++) {
    const dx = (k - 1) * 7 + (rnd() - 0.5) * 5;
    parts.push(
      path(tongue(7 + rnd() * 3, H * (0.42 + rnd() * 0.3), dx, (rnd() - 0.5) * 12), mid.url),
    );
  }
  parts.push(
    path(tongue(10, H * (0.36 + rnd() * 0.12), (rnd() - 0.5) * 4, (rnd() - 0.5) * 8), core.url),
  );
  // The white-hot heart at the root and two bright inner streaks.
  parts.push(path(ellipseD((rnd() - 0.5) * 3, -5, 8, 5), '#FFFFF4', { opacity: 0.9 }));
  for (let k = 0; k < 2; k++) {
    const x = (k - 0.5) * 8 + (rnd() - 0.5) * 3;
    parts.push(
      stroke(
        `M${r2(x)} -6Q${r2(x + (rnd() - 0.5) * 6)} ${r2(-H * 0.2)} ${r2(x + (rnd() - 0.5) * 8)} ${r2(-H * (0.3 + rnd() * 0.1))}`,
        '#FFF2B0',
        1.6,
        0.6,
      ),
    );
  }
  // Loose tongues breaking off above (small flames of their own: one orange-yellow, one red).
  const lick = (x: number, y: number, w: number, h: number, fill: string): string =>
    g(
      { transform: `translate(${r2(x)} ${r2(y)})` },
      el('path', {
        d: tongue(w, h, 0, (rnd() - 0.5) * 4),
        fill,
        stroke: '#7A0E04',
        'stroke-width': 0.8,
        'stroke-opacity': 0.6,
      }),
    );
  parts.push(lick((rnd() - 0.5) * 14, -H * (0.8 + rnd() * 0.08), 3, 9, '#FFA52A'));
  parts.push(lick((rnd() - 0.5) * 24, -H * (0.66 + rnd() * 0.08), 2.4, 7, '#E8420E'));
  return g({}, ...parts);
}

/** v1.15 (D-077): one fieldstone of the fire ring. */
export interface HearthStone {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
  /** Outline points (irregular, its own shape). */
  readonly pts: readonly P[];
  /** Base colour (granite grey, ochre sandstone, dark dolerite, pale quartzite). */
  readonly colour: string;
  readonly front: boolean;
}

const STONE_COLOURS = ['#6E6A66', '#8C7C68', '#46444A', '#9C968C', '#7A5E48'] as const;

/** v1.15: the ring of fieldstones round the coals: a back row (lit on the face toward us and the
 *  fire) and a front row (lit on top, toward the fire), every stone its own size, shape and rock. */
export function hearthStones(): readonly HearthStone[] {
  const rnd = prng(733);
  const out: HearthStone[] = [];
  const ring = (
    n: number,
    from: number,
    to: number,
    ry: number,
    dy: number,
    front: boolean,
  ): void => {
    for (let k = 0; k < n; k++) {
      const a = from + ((k + 0.5) / n) * (to - from) + (rnd() - 0.5) * 0.12;
      const x = Math.cos(a) * 58;
      const y = Math.sin(a) * ry + dy;
      const rx = 9 + rnd() * 5;
      const sy = 5.5 + rnd() * 3.5;
      const m = 7 + Math.floor(rnd() * 3);
      const pts: P[] = [];
      for (let j = 0; j < m; j++) {
        const t = (j / m) * Math.PI * 2;
        const f = 0.72 + rnd() * 0.36;
        // Flatter bottoms: stones sit on the ground.
        const yy = Math.sin(t) * sy * f;
        pts.push([x + Math.cos(t) * rx * f, y + (yy > 0 ? yy * 0.7 : yy)]);
      }
      const colour = STONE_COLOURS[Math.floor(rnd() * STONE_COLOURS.length)] ?? '#7A7068';
      out.push({ x, y, rx, ry: sy, pts, colour, front });
    }
  };
  ring(7, Math.PI, Math.PI * 2, 10, -2, false);
  ring(7, 0, Math.PI, 9, 6, true);
  return out;
}

/** Mixes two #RRGGBB colours (t = 0 → a). */
function mix(a: string, b: string, t: number): string {
  const p = (h: string, k: number): number => parseInt(h.slice(k, k + 2), 16);
  return `#${[1, 3, 5]
    .map((k) =>
      Math.round(p(a, k) + (p(b, k) - p(a, k)) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** One stone: its rock colour lit warm on the side toward the fire (the ring's middle), cool and
 *  dark on the far side, a few speckles and a crack, a contact shadow. */
function stone(s: HearthStone, k: number): string {
  // Toward the fire in objectBoundingBox terms: back-row stones face us (down), front-row stones
  // face up; the side stones also face inward.
  const ix = Math.max(-1, Math.min(1, -s.x / 40));
  const iy = s.front ? -1 : 0.6;
  const len = Math.hypot(ix, iy) || 1;
  const id = uid('st');
  const gr = el(
    'linearGradient',
    {
      id,
      x1: r2(0.5 - (ix / len) * 0.5),
      y1: r2(0.5 - (iy / len) * 0.5),
      x2: r2(0.5 + (ix / len) * 0.5),
      y2: r2(0.5 + (iy / len) * 0.5),
    },
    el('stop', { offset: 0, 'stop-color': mix(s.colour, '#0E0C14', 0.7) }),
    el('stop', { offset: 0.5, 'stop-color': s.colour }),
    el('stop', { offset: 0.85, 'stop-color': mix(s.colour, '#FFB070', 0.45) }),
    el('stop', { offset: 1, 'stop-color': mix(s.colour, '#FFD8A0', 0.6) }),
  );
  const d = smoothD(s.pts, true, 0.45);
  const rnd = prng(919 + k * 31);
  const speck: string[] = [];
  for (let j = 0; j < 5; j++)
    speck.push(
      path(
        ellipseD(s.x + (rnd() - 0.5) * s.rx * 1.2, s.y + (rnd() - 0.5) * s.ry, 0.9, 0.7),
        j % 2 === 0 ? mix(s.colour, '#000000', 0.5) : mix(s.colour, '#FFFFFF', 0.4),
        { opacity: 0.7 },
      ),
    );
  const cx = s.x + (rnd() - 0.5) * s.rx * 0.6;
  return g(
    {},
    el('defs', {}, gr),
    path(ellipseD(s.x, s.y + s.ry * 0.7, s.rx * 1.05, s.ry * 0.45), '#0A0604', { opacity: 0.55 }),
    edge(d, `url(#${id})`, 0.9, mix(s.colour, '#100A08', 0.75)),
    clipped(
      d,
      ...speck,
      stroke(
        `M${r2(cx)} ${r2(s.y - s.ry)}L${r2(cx + 2)} ${r2(s.y - s.ry * 0.2)}L${r2(cx - 1)} ${r2(s.y + s.ry * 0.4)}`,
        mix(s.colour, '#000000', 0.6),
        0.7,
        0.6,
      ),
    ),
  );
}

/** A log lying from `a` (its cut outer end) to `b` (its burning end in the coals): bark, the
 *  cut end's rings, a charred end with glowing cracks. */
function log(a: P, b: P, w: number): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const bark = linear(
    [
      [0, '#B07848'],
      [0.25, '#7A5236'],
      [0.6, '#4A3020'],
      [1, '#1A100A'],
    ],
    0,
    1,
  );
  const d = limbD(a, b, w, w * 0.9);
  const at = (t: number, o: number): P => [a[0] + dx * t + nx * o, a[1] + dy * t + ny * o];
  const ridges: string[] = [];
  for (let k = -1; k <= 1; k++) {
    const p0 = at(0.12, k * w * 0.26);
    const p1 = at(0.6, k * w * 0.24 + 0.6);
    ridges.push(`M${r2(p0[0])} ${r2(p0[1])}L${r2(p1[0])} ${r2(p1[1])}`);
  }
  const char = at(0.62, 0);
  const crack = [0.68, 0.78, 0.88].map((t) => {
    const p0 = at(t, -w * 0.3);
    const p1 = at(t + 0.03, w * 0.3);
    return `M${r2(p0[0])} ${r2(p0[1])}L${r2(p1[0])} ${r2(p1[1])}`;
  });
  return g(
    {},
    defs(bark),
    edge(d, bark.url, 1.2, '#120A06'),
    clipped(
      d,
      stroke(ridges.join(''), '#1A100A', 0.8, 0.7),
      // The charred half: black, the cracks glowing.
      path(
        `M${r2(char[0] - nx * w)} ${r2(char[1] - ny * w)}L${r2(b[0] - nx * w + dx * 0.2)} ${r2(b[1] - ny * w + dy * 0.2)}L${r2(b[0] + nx * w + dx * 0.2)} ${r2(b[1] + ny * w + dy * 0.2)}L${r2(char[0] + nx * w)} ${r2(char[1] + ny * w)}Z`,
        '#140C0A',
        { opacity: 0.9 },
      ),
      stroke(crack.join(''), '#FF7A2A', 1, 0.9),
      path(ellipseD(b[0], b[1], w * 0.5, w * 0.45), '#FF9A3A', { opacity: 0.7 }),
    ),
    // The cut end: pale wood with its rings.
    edge(ellipseD(a[0], a[1], w * 0.32, w * 0.5), '#C8A070', 0.9, '#3A2414'),
    stroke(ellipseD(a[0], a[1], w * 0.18, w * 0.3), '#7A5236', 0.6, 0.8),
  );
}

/** The enamel camp kettle, its base at (0, 0): blue enamel (chips showing the black iron), a
 *  black rim, a domed lid and knob, a spout away from the fire, a wire bail with a wooden grip,
 *  soot up its base, the fire's warm line on its right. */
function kettle(): string {
  const body = lit3(C.enamelShade, C.enamel, C.enamelLit);
  const soot = linear(
    [
      [0, '#0A0A0E', 0],
      [0.55, '#0A0A0E', 0],
      [1, '#0A0A0E', 0.85],
    ],
    0,
    1,
  );
  const bodyD = 'M-11 0Q-13 -6 -12 -12Q-11 -18 -6 -19L6 -19Q11 -18 12 -12Q13 -6 11 0Z';
  const chips: readonly [number, number, number][] = [
    [-7, -9, 1.1],
    [4, -5, 0.8],
    [8, -12, 0.7],
  ];
  return g(
    {},
    defs(body, soot),
    // The spout (left, away from the fire) behind the body.
    edge('M-10 -9Q-16 -10 -19 -18L-17 -19Q-14 -14 -9 -13Z', body.url, 1.1),
    path(ellipseD(-18, -18.6, 1.6, 0.9), '#0E1420'),
    edge(bodyD, body.url, 1.4),
    clipped(
      bodyD,
      path('M-14 -20L14 -20L14 2L-14 2Z', soot.url),
      ...chips.map(([x, y, r]) =>
        g(
          {},
          path(ellipseD(x, y, r * 1.3, r), '#E8EEF4', { opacity: 0.6 }),
          path(ellipseD(x + 0.2, y + 0.1, r * 0.9, r * 0.7), '#14141A'),
        ),
      ),
      stroke('M-8 -16Q-10 -10 -9 -3', '#E8F0FF', 1.2, 0.45),
      stroke('M10 -17Q12 -10 10 -1', '#FFB070', 1.4, 0.8),
    ),
    // Rim, lid and knob.
    edge(ellipseD(0, -19, 7, 2.2), '#1C2A40', 1),
    edge('M-6 -19.5Q0 -24 6 -19.5Z', body.url, 0.9),
    edge(ellipseD(0, -23.6, 1.8, 1.4), '#14141A', 0.8),
    path(ellipseD(0.8, -24, 0.7, 0.5), '#FFC890'),
    // The wire bail over the top, pivots at the rim's ends, a wooden grip.
    stroke('M-10 -14Q-10 -29 0 -29Q10 -29 10 -14', '#1A1A1E', 1.4),
    stroke('M2 -28.6Q8 -27 9.6 -18', '#FFA060', 0.7, 0.8),
    edge('M-4 -30.6L4 -30.6L4 -27.4L-4 -27.4Z', '#6A4426', 0.8),
    path(ellipseD(-10, -14, 1.2, 1.2), '#1A1A1E'),
    path(ellipseD(10, -14, 1.2, 1.2), '#FFB070'),
  );
}

/** The hearth: a ring of fieldstones round the glowing coals, two logs burning in, the grid
 *  across, the enamel kettle on its left end. */
function hearth(): string {
  const coal = radial([
    [0, '#FFD27A', 1],
    [0.35, '#FF6A1A', 1],
    [0.8, '#A0200A', 1],
    [1, '#3A0A04', 1],
  ]);
  const rnd = prng(733);
  const stones = hearthStones();
  const parts: string[] = [defs(coal)];
  // The coal bed: ash at the edge, coals glowing through, a few lumps (some ashen, some white-hot).
  parts.push(path(ellipseD(0, 2, 52, 11), '#2A0A06'));
  parts.push(path(ellipseD(0, 0, 44, 9), coal.url));
  parts.push(stroke(ellipseD(0, 1, 47, 9.6), '#6A5A54', 1.4, 0.5));
  // The back row of stones.
  stones.forEach((s, k) => {
    if (!s.front) parts.push(stone(s, k));
  });
  for (let i = 0; i < 11; i++) {
    const x = (rnd() - 0.5) * 72;
    const y = (rnd() - 0.5) * 8;
    const hot = i % 3 === 0;
    parts.push(
      edge(
        ellipseD(x, y, 5 + rnd() * 3, 2.6 + rnd() * 2),
        hot ? '#FFB04A' : i % 3 === 1 ? '#C8340E' : '#4A2A22',
        0.9,
        '#3A0A04',
      ),
    );
    if (!hot)
      parts.push(stroke(`M${r2(x - 3)} ${r2(y)}L${r2(x + 2)} ${r2(y + 1)}`, '#FF8A2A', 0.8, 0.8));
    else parts.push(path(ellipseD(x + 1, y - 0.6, 2.2, 1), '#FFF2C0', { opacity: 0.8 }));
  }
  // Two logs burning in from the left and the right (their ends in the coals).
  parts.push(log([-56, 4], [-10, -4], 9));
  parts.push(log([54, 2], [12, -5], 8));
  // The grid: a frame with bars, catching the glow.
  parts.push(stroke('M-46 -10L46 -10M-46 -10L-50 6M46 -10L50 6', '#1A1414', 3));
  for (let x = -40; x <= 40; x += 8) parts.push(stroke(`M${x} -14L${x + 2} -6`, '#2A2220', 1.6));
  parts.push(stroke('M-46 -14L46 -14', '#2A2220', 2.4));
  parts.push(stroke('M-30 -15L34 -15', '#FF9A4A', 1, 0.6));
  // The front row of stones over the coals' edge.
  stones.forEach((s, k) => {
    if (s.front) parts.push(stone(s, k));
  });
  parts.push(g({ transform: 'translate(-34 -9.5) scale(0.8)' }, kettle()));
  return g({}, ...parts);
}

/** The fire's soft glow (drawn additively by the view). */
function glow(): string {
  const r = radial([
    [0, '#FFB060', 0.9],
    [0.35, '#FF7A2A', 0.45],
    [0.7, '#C8400A', 0.12],
    [1, '#C8400A', 0],
  ]);
  return g({}, defs(r), path(ellipseD(0, 0, 158, 118), r.url));
}

/** Embers rising from the fire's base (0, 0): frame `i` of 3 of a loop that climbs. */
function sparks(i: number): string {
  const rnd = prng(901);
  const parts: string[] = [];
  const H = 140;
  for (let k = 0; k < 7; k++) {
    const x0 = (rnd() - 0.5) * 30;
    const drift = (rnd() - 0.5) * 50;
    const phase = rnd();
    const t = (phase + i / 3) % 1;
    const y = -20 - t * (H - 24);
    const x = x0 + drift * t + Math.sin((t + k) * 6) * 4;
    const op = (1 - t) * 0.9 + 0.1;
    const r = 2.6 - t * 1.4;
    parts.push(path(ellipseD(x, y + 5, r * 0.6, r * 2.4), '#FF7A2A', { opacity: op * 0.4 }));
    parts.push(path(ellipseD(x, y, r, r), t < 0.4 ? '#FFE7A0' : '#FF9A3A', { opacity: op }));
  }
  return g({}, ...parts);
}

// --- the sky -------------------------------------------------------------------------------------

/** The star tile: stars of every brightness, each drawn at its wrapped copies (no seam). */
function starTile(): string {
  const rnd = prng(1607);
  const S = STAR_TILE;
  const parts: string[] = [];
  const colours = ['#FFFFFF', '#DDE8FF', '#FFF1D6', '#CFE0FF', '#FFE2C0'];
  for (let i = 0; i < 38; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const b = rnd() ** 4;
    const r = 1.1 + b * 2.4;
    const c = colours[Math.floor(rnd() * colours.length)] ?? '#FFFFFF';
    const op = 0.25 + b * 0.75;
    for (const dx of [-S, 0, S])
      for (const dy of [-S, 0, S]) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx < -8 || cx > S + 8 || cy < -8 || cy > S + 8) continue;
        if (b > 0.5) parts.push(path(ellipseD(cx, cy, r * 2.6, r * 2.6), c, { opacity: 0.18 }));
        parts.push(path(ellipseD(cx, cy, r, r), c, { opacity: op }));
      }
  }
  return g({}, ...parts);
}

/** The Milky Way's band round (0, 0): a soft glow, a brighter core, star dust, dark dust lanes. */
function milky(): string {
  const band = radial([
    [0, '#E8E4FF', 0.55],
    [0.4, '#B8C0F0', 0.28],
    [0.8, '#7080C0', 0.08],
    [1, '#7080C0', 0],
  ]);
  const core = radial([
    [0, '#FFF0D8', 0.6],
    [0.6, '#E8D0C0', 0.18],
    [1, '#E8D0C0', 0],
  ]);
  const rnd = prng(2207);
  const parts: string[] = [defs(band, core)];
  parts.push(path(ellipseD(0, 0, 356, 100), band.url));
  parts.push(path(ellipseD(60, 6, 170, 62), core.url));
  for (let i = 0; i < 260; i++) {
    const x = (rnd() - 0.5) * 680;
    const y = (rnd() - 0.5) * 150 * (1 - Math.abs(x) / 420);
    parts.push(path(ellipseD(x, y, 2.4, 2.4), '#F4F0FF', { opacity: 0.25 + rnd() * 0.5 }));
  }
  // Dust lanes (the Great Rift's dark clouds), blurred soft.
  const blur = uid('blur');
  parts.push(
    el(
      'filter',
      { id: blur, x: -0.2, y: -0.6, width: 1.4, height: 2.2 },
      el('feGaussianBlur', { stdDeviation: 9 }),
    ),
  );
  parts.push(
    g(
      { filter: `url(#${blur})`, opacity: 0.6 },
      path(
        smoothD(
          [
            [-300, -10],
            [-120, -26],
            [40, -6],
            [220, -18],
            [320, -4],
            [220, 14],
            [40, 22],
            [-120, 8],
          ],
          true,
          0.6,
        ),
        '#0A0E24',
      ),
      path(ellipseD(-210, 22, 40, 24), '#0A0E24'),
    ),
  );
  return g({}, ...parts);
}

/** The Southern Cross round (0, 0): Gacrux (orange) at the top, Acrux at the foot, Mimosa on the
 *  left (east, facing south), Delta on the right, faint Epsilon off the middle. */
function southernCross(): string {
  const star = (x: number, y: number, r: number, c: string): string => {
    const halo = radial([
      [0, c, 0.7],
      [0.4, c, 0.18],
      [1, c, 0],
    ]);
    return g(
      {},
      defs(halo),
      path(ellipseD(x, y, r * 4.2, r * 4.2), halo.url),
      stroke(
        `M${x - r * 3} ${y}L${x + r * 3} ${y}M${x} ${y - r * 3}L${x} ${y + r * 3}`,
        c,
        0.8,
        0.5,
      ),
      path(ellipseD(x, y, r, r), '#FFFFFF'),
    );
  };
  return g(
    {},
    star(-1, -29, 2.6, '#FFC890'),
    star(2, 30, 3.4, '#C8DCFF'),
    star(-22, 1, 3.0, '#C8DCFF'),
    star(19, -6, 2.2, '#D8E4FF'),
    star(11, 14, 1.5, '#FFE0C0'),
  );
}

/** One of the bakkie's wheels at (x, −18): a treaded tyre, a steel rim with its holes and lug
 *  nuts, the hub; the fire's warm light on the left of the tread, the moon's on top. */
function wheel(x: number): string {
  const cy = -18;
  const tread: string[] = [];
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    tread.push(
      `M${r2(x + c * 22.5)} ${r2(cy + s * 22.5)}L${r2(x + c * 26.5)} ${r2(cy + s * 26.5)}`,
    );
  }
  const rim = radial(
    [
      [0, '#9AA0AA', 1],
      [0.6, '#5A606A', 1],
      [1, '#262A32', 1],
    ],
    0.4,
    0.35,
    0.7,
  );
  const holes: string[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    holes.push(ellipseD(x + Math.cos(a) * 9, cy + Math.sin(a) * 9, 2, 2));
  }
  const lugs: string[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    lugs.push(ellipseD(x + Math.cos(a) * 4.2, cy + Math.sin(a) * 4.2, 0.9, 0.9));
  }
  return g(
    {},
    defs(rim),
    path(ellipseD(x, cy, 26.5, 26.5), '#08090C'),
    stroke(tread.join(''), '#1C1E24', 2.4),
    path(ellipseD(x, cy, 21, 21), '#121318'),
    stroke(ellipseD(x, cy, 18, 18), '#2A2C34', 1, 0.8),
    edge(ellipseD(x, cy, 14, 14), rim.url, 1, '#0A0A0E'),
    path(holes.join(''), '#0A0B10'),
    edge(ellipseD(x, cy, 5.6, 5.6), '#B8BEC8', 0.8, '#1A1C22'),
    path(lugs.join(''), '#2A2C34'),
    // Light: the fire on the tyre's left shoulder, the moon along its top.
    stroke(
      `M${r2(x - 20)} ${r2(cy - 17)}A26 26 0 0 0 ${r2(x - 25)} ${r2(cy + 8)}`,
      '#FF9A50',
      2,
      0.55,
    ),
    stroke(
      `M${r2(x - 12)} ${r2(cy - 23.5)}A26 26 0 0 1 ${r2(x + 14)} ${r2(cy - 22.5)}`,
      '#8EA4D0',
      1.4,
      0.45,
    ),
    stroke(
      `M${r2(x - 11)} ${r2(cy - 6)}A14 14 0 0 1 ${r2(x - 3)} ${r2(cy - 13.6)}`,
      '#FFC890',
      1.2,
      0.8,
    ),
  );
}

/** The bakkie: a generic single-cab pickup (no badge, no brand), side view, nose to the left,
 *  its wheels on y = 0 at ±104. Faded red paint by night: panels and door lines, a swage line,
 *  wheel arches, side glass with a faint sky reflection, chrome bumpers and a mirror catching the
 *  fire (on the left), the load bay with its tailgate, the red tail light and a dim headlight
 *  glint; the moon's cool rim along every top edge. */
function bakkie(): string {
  const paint = linear(
    [
      [0, '#5E342E'],
      [0.35, '#40252A'],
      [0.8, '#24181C'],
      [1, '#140E12'],
    ],
    0,
    1,
  );
  const glass = linear(
    [
      [0, '#3A4A6E'],
      [0.45, '#1C2438'],
      [1, '#0C1220'],
    ],
    0.6,
    1,
  );
  const chrome = linear(
    [
      [0, '#D8DEE8'],
      [0.4, '#7A808C'],
      [0.6, '#30343C'],
      [1, '#9AA0AA'],
    ],
    0,
    1,
  );
  const fireSide = linear(
    [
      [0, '#FF9A50', 0.45],
      [0.25, '#FF9A50', 0],
      [1, '#FF9A50', 0],
    ],
    1,
    0,
  );
  const outline: P[] = [
    [-150, -36],
    [-146, -62],
    [-96, -70],
    [-66, -104],
    [6, -106],
    [16, -72],
    [150, -72],
    [154, -30],
    [150, -20],
    [-148, -20],
  ];
  const bodyD = smoothD(outline, true, 0.25);
  // Wheel arches: the body cut round each wheel, dark inside.
  const arch = (x: number): string =>
    `M${x - 33} -20L${x - 33} -24A33 33 0 0 1 ${x + 33} -24L${x + 33} -20Z`;
  return g(
    {},
    defs(paint, glass, chrome, fireSide),
    // The ground shadow.
    path(ellipseD(0, 2, 150, 5), '#000000', { opacity: 0.45 }),
    edge(bodyD, paint.url, 1.6, '#06070A'),
    clipped(
      bodyD,
      path(arch(-104) + arch(104), '#050608'),
      // The fire's warmth on the nose and the cab's front.
      path('M-160 -110L40 -110L40 0L-160 0Z', fireSide.url),
      // The swage line along the flank: a lit ridge over a shade line.
      stroke('M-146 -50L150 -50', '#8A5444', 1.6, 0.7),
      stroke('M-146 -47L150 -47', '#140C0E', 1.4, 0.7),
      // Panel gaps: the bonnet's edge, the door, the cab's back, the bin's front, the tailgate.
      stroke(
        'M-96 -70L-92 -24M-62 -98L-62 -24L-2 -24L0 -72M14 -72L16 -24M140 -72L140 -22',
        '#0A0608',
        1.2,
        0.9,
      ),
      stroke('M-60 -97L-60 -25M16 -71L18 -25M142 -71L142 -23', '#7A4A3E', 0.8, 0.5),
      // The door handle and keyhole, chrome catching the fire.
      edge('M-14 -64L-2 -64L-2 -60L-14 -60Z', chrome.url, 0.8, '#0A0A0E'),
      path(ellipseD(-6, -55, 1, 1), '#0A0A0E'),
      // The load bin's top rail and its tie-down hooks.
      stroke('M18 -69L148 -69', '#140C0E', 2, 0.8),
      stroke('M44 -66l0 4M84 -66l0 4M124 -66l0 4', '#A0A6B0', 1.4, 0.8),
      // Dust and mud low down.
      path('M-150 -30L150 -30L150 -20L-150 -20Z', '#2A1E18', { opacity: 0.5 }),
    ),
    path(arch(-104) + arch(104), 'none'),
    stroke('M-137 -24A33 33 0 0 1 -71 -24M71 -24A33 33 0 0 1 137 -24', '#7A4A3E', 1.4, 0.7),
    // Windows: the side glass and the cab's back glass, a sky streak and a star across them.
    edge('M-88 -72L-62 -98L-20 -98L-20 -72Z', glass.url, 1, '#06070A'),
    edge('M-14 -98L2 -98L10 -72L-14 -72Z', glass.url, 1, '#06070A'),
    path('M-70 -72L-50 -98L-40 -98L-60 -72Z', '#8EA4D0', { opacity: 0.18 }),
    path('M-44 -72L-26 -96L-22 -96L-40 -72Z', '#8EA4D0', { opacity: 0.12 }),
    path(ellipseD(-6, -90, 0.9, 0.9), '#E8EEFF', { opacity: 0.9 }),
    // The mirror on its arm at the windscreen's foot, its chrome edge in firelight.
    stroke('M-84 -73L-89 -77', '#1A1A20', 2),
    edge('M-97 -86L-88 -86L-87 -75L-98 -75Z', '#2A2C34', 1, '#06070A'),
    stroke('M-97 -85L-97.6 -76', '#FFB070', 1.4, 0.85),
    // Bumpers (chrome), the headlight's dim glint, an amber indicator, the red tail light.
    edge('M-156 -38L-142 -38L-142 -26L-156 -26Z', chrome.url, 1, '#06070A'),
    stroke('M-155 -37L-155 -27', '#FFB070', 1.6, 0.9),
    edge('M146 -36L157 -36L157 -24L146 -24Z', chrome.url, 1, '#06070A'),
    edge(ellipseD(-147, -54, 3.6, 6), '#3A3A30', 0.8, '#06070A'),
    path(ellipseD(-148, -55, 2, 3.4), '#FFF0C0', { opacity: 0.55 }),
    path(ellipseD(-146, -44, 1.6, 2.4), '#D88A2A', { opacity: 0.9 }),
    edge('M148 -66L154 -66L154 -46L148 -46Z', '#8A140E', 0.8, '#06070A'),
    path('M149 -64L153 -64L153 -54L149 -54Z', '#FF4A2A', { opacity: 0.8 }),
    path(ellipseD(153, -56, 4, 10), '#FF3A1A', { opacity: 0.15 }),
    // Wheels.
    wheel(-104),
    wheel(104),
    // The moon's cool rim along the top edges, the fire's warm one down the nose.
    stroke('M-146 -62L-96 -70L-66 -104L6 -106L16 -72L150 -72', '#8EA4D0', 1.8, 0.6),
    stroke('M-65 -103L5 -105', '#C8D4F0', 1, 0.5),
    stroke('M-149 -38L-146 -60', '#FF9A50', 2, 0.8),
    stroke('M-95 -70L-67 -102', '#FF9A50', 1.2, 0.5),
  );
}

function frameArt(name: BraaiFrame): string {
  if (name.startsWith('flame_')) return flame(Number(name.slice(6)));
  if (name.startsWith('spark_')) return sparks(Number(name.slice(6)));
  switch (name) {
    case 'sit_idle':
      return seated('idle');
    case 'sit_sip':
      return seated('sip');
    case 'sit_poke':
      return seated('poke');
    case 'dance_a':
      return dancing('a');
    case 'dance_b':
      return dancing('b');
    case 'poker':
      return poker();
    case 'hearth':
      return hearth();
    case 'glow':
      return glow();
    case 'stars':
      return starTile();
    case 'milky':
      return g({ transform: 'scale(0.98)' }, milky());
    case 'cross':
      return southernCross();
    case 'bakkie':
      return bakkie();
    default:
      return '';
  }
}

/** The whole sheet as SVG (sheet px viewBox, rendered at `k`×). */
export function braaiSheetSvg(k = 1): string {
  seq = 0;
  const parts: string[] = [];
  for (const f of braaiFrames()) {
    const id = uid('cell');
    const c = sheetRect(f);
    parts.push(
      g(
        {},
        el('clipPath', { id }, el('rect', { x: c.x, y: c.y, width: c.w, height: c.h })),
        g(
          { 'clip-path': `url(#${id})` },
          g(
            {
              transform: `translate(${r2(f.x + f.ox * f.res)} ${r2(f.y + f.oy * f.res)})${
                f.res === 1 ? '' : ` scale(${f.res})`
              }`,
            },
            frameArt(f.name),
          ),
        ),
      ),
    );
  }
  return svgDoc(
    BRAAI_SHEET_W * k,
    BRAAI_SHEET_H * k,
    [0, 0, BRAAI_SHEET_W, BRAAI_SHEET_H],
    '',
    parts.join(''),
  );
}

export function renderBraaiSheet(k = 1): Rgba {
  return renderSvg(braaiSheetSvg(k));
}

/** The star tile's edge must wrap: used by the tests. */
export const BRAAI_ART = { starTile: STAR_TILE } as const;

/** v1.15 (D-077): one frame's art round its origin, for the fit tests. */
export const frameArtForFit = (name: BraaiFrame): string => {
  seq = 0;
  return frameArt(name);
};
