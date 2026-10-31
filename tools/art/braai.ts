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

/** His khaki bush hat: a soft crown with a dent, a band, the brim curled a little. */
function bushHat(p: Paints): string {
  return g(
    {},
    edge(
      smoothD(
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
      ),
      p.hat.url,
      2.2,
    ),
    edge(
      smoothD(
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
      ),
      p.hat.url,
      2.2,
    ),
    edge(
      polyD([
        [-28, -8],
        [28, -8],
        [28, -1],
        [-28, -1],
      ]),
      '#3A2A1C',
      1.4,
    ),
    stroke('M-6 -30Q0 -22 6 -30', C.hatShade, 1.6),
    stroke('M14 -30Q22 -24 24 -12', C.hatLit, 1.4, 0.7),
  );
}

/** Oupa's head (D-064's face) by firelight, his bush hat on (or not: the dance raises it). */
function head(p: Paints, hat: boolean, mouthOpen = false): string {
  return g(
    {},
    edge(ellipseD(-31, 2, 7, 11), C.skinShade, 2),
    edge(ellipseD(31, 2, 7, 11), C.skinLit, 2),
    edge(ellipseD(0, -2, 30, 34), p.face.url, 2.2),
    // Thin white hair at the temples when the hat is off.
    ...(hat
      ? []
      : [
          stroke('M-28 -18Q-20 -34 0 -36Q20 -34 28 -18', C.beard, 5, 0.9),
          stroke('M-24 -24Q-14 -32 -4 -32', C.beardLit, 2, 0.8),
        ]),
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
      p.beard.url,
      2,
      '#4A4650',
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
      '#4A4650',
    ),
    mouthOpen ? edge(ellipseD(0, 25, 6, 5), '#3A1A14', 1.6) : stroke('M-6 24Q0 28 6 24', C.ink, 2),
    path(ellipseD(2, 4, 6, 6), C.skinLit, { opacity: 0.55 }),
    stroke('M-17 -6Q-12 -10 -7 -6', C.ink, 2.6),
    stroke('M7 -6Q12 -10 17 -6', C.ink, 2.6),
    stroke('M-19 -14Q-12 -19 -5 -15', C.beard, 4),
    stroke('M5 -15Q12 -19 19 -14', C.beardLit, 4),
    path(ellipseD(20, 6, 5, 3), '#F07A5A', { opacity: 0.5 }),
    ...(hat ? [g({ transform: 'translate(0 -24) rotate(-3)' }, bushHat(p))] : []),
  );
}

/** A hand (a mitten with a thumb), its back toward us. */
function hand(p: Paints, cx: number, cy: number, rot: number, r = 10): string {
  return g(
    { transform: `translate(${r2(cx)} ${r2(cy)}) rotate(${r2(rot)})` },
    edge(ellipseD(0, 0, r, r * 1.1), p.skin.url, 1.8),
    edge(ellipseD(r * 0.8, -r * 0.5, r * 0.42, r * 0.6), p.skin.url, 1.4),
    stroke(`M${-r * 0.5} ${r * 0.2}L${r * 0.4} ${r * 0.3}`, C.skinShade, 1, 0.7),
  );
}

/** The enamel mug, handle right; its rim at (0, 0). */
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
    edge(ellipseD(0.5, 0, 12.5, 3.4), '#E8EEF4', 1.4),
    path(ellipseD(0.5, 0.6, 10, 2.2), '#3A2010'),
    stroke('M-8 6L-8 20', '#E8F0FF', 1.4, 0.4),
    // Steam: two soft curls.
    stroke('M-3 -6Q-7 -14 -2 -20Q2 -26 -2 -32', '#E8E4E0', 2, 0.35),
    stroke('M5 -5Q1 -12 6 -18', '#E8E4E0', 1.6, 0.3),
  );
}

/** A leg from hip to foot with a knee: shorts on the thigh, the bare shin, sock and velskoen. */
function leg(p: Paints, hip: P, knee: P, foot: P, toe: 1 | -1): string {
  const ankle: P = [foot[0], foot[1] - 30];
  const sockTop: P = [
    foot[0] + (knee[0] - foot[0]) * 0.22,
    foot[1] - 30 - (foot[1] - 30 - knee[1]) * 0.22,
  ];
  return g(
    {},
    edge(limbD(knee, ankle, 22, 16), p.skin.url, 2),
    edge(limbD(sockTop, ankle, 19, 18), p.sock.url, 1.6),
    // The velskoen: a rounded boot with a sole, toe forward (or to one side).
    edge(
      smoothD(
        [
          [foot[0] - 13, foot[1] - 26],
          [foot[0] + 11, foot[1] - 26],
          [foot[0] + 14 + toe * 10, foot[1] - 10],
          [foot[0] + 12 + toe * 16, foot[1]],
          [foot[0] - 14 + toe * 2, foot[1]],
        ],
        true,
        0.6,
      ),
      p.suede.url,
      2,
    ),
    stroke(
      `M${foot[0] - 14 + toe * 2} ${foot[1] - 3}L${foot[0] + 12 + toe * 16} ${foot[1] - 3}`,
      '#1A100A',
      2.6,
    ),
    // Shorts over the thigh to just above the knee, a crease.
    edge(
      limbD(
        hip,
        [knee[0] + (hip[0] - knee[0]) * 0.18, knee[1] + (hip[1] - knee[1]) * 0.18],
        34,
        28,
      ),
      p.khaki.url,
      2.2,
    ),
    path(ellipseD(knee[0] + 1, knee[1] + 2, 6, 5), C.skinLit, { opacity: 0.45 }),
  );
}

/** An arm: the rolled sleeve at the shoulder, upper arm to elbow, forearm to the hand. */
function arm(p: Paints, shoulder: P, elbow: P, wrist: P, handRot: number): string {
  return g(
    {},
    edge(limbD(shoulder, elbow, 20, 16), p.skin.url, 1.8),
    edge(limbD(elbow, wrist, 16, 13), p.skin.url, 1.8),
    edge(
      limbD(
        shoulder,
        [
          shoulder[0] + (elbow[0] - shoulder[0]) * 0.5,
          shoulder[1] + (elbow[1] - shoulder[1]) * 0.5,
        ],
        30,
        24,
      ),
      p.khaki.url,
      2,
    ),
    hand(p, wrist[0], wrist[1], handRot),
  );
}

/** The shirt and belt: a torso from the shoulders (y top) to the belt (y bottom). */
function torso(p: Paints, top: number, bottom: number, lean = 0): string {
  const l = lean;
  return g(
    {},
    edge(
      smoothD(
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
      ),
      p.khaki.url,
      2.4,
    ),
    // Collar, placket, flap pockets.
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
    edge(
      polyD([
        [-30 + l * 0.8, top + 26],
        [-12 + l * 0.8, top + 26],
        [-12 + l * 0.8, top + 48],
        [-30 + l * 0.8, top + 48],
      ]),
      p.khaki.url,
      1.4,
    ),
    edge(
      polyD([
        [12 + l * 0.8, top + 26],
        [30 + l * 0.8, top + 26],
        [30 + l * 0.8, top + 48],
        [12 + l * 0.8, top + 48],
      ]),
      p.khaki.url,
      1.4,
    ),
    stroke(
      `M${-26 + l * 0.4} ${bottom - 6}Q${-20 + l * 0.4} ${bottom - 18} ${-28 + l * 0.5} ${bottom - 30}`,
      C.khakiShade,
      1.2,
      0.8,
    ),
    // Belt and buckle.
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
  );
}

type SeatPose = 'idle' | 'sip' | 'poke';

/** The canvas camp chair, side view (facing right): its slanted back and seat behind him, the
 *  near arm rest and X legs in front. */
function campChair(back: boolean): string {
  const cv = lit3(C.canvasShade, C.canvas, C.canvasLit);
  if (back)
    return g(
      {},
      defs(cv),
      // The far frame (darker), the canvas back slanting back, the seat sling.
      edge(limbD([-58, -238], [-30, -96], 6, 6), '#26262C', 1.2),
      edge('M-60 -236Q-46 -232 -36 -228L-14 -110Q-30 -104 -40 -100Z', cv.url, 2),
      stroke('M-52 -200L-34 -196', C.canvasShade, 1.4, 0.6),
      edge('M-42 -108Q6 -96 52 -106L50 -90Q4 -82 -40 -92Z', cv.url, 2),
      edge(limbD([-66, -236], [-36, -96], 7, 7), C.steel, 1.4),
    );
  return g(
    {},
    // The near arm rest and its post, the X legs, a cross bar on the ground.
    edge(limbD([-40, -150], [40, -140], 8, 8), C.steel, 1.4),
    stroke('M-36 -153L36 -143', C.steelLit, 1.2, 0.8),
    edge(limbD([34, -142], [44, -96], 6, 6), C.steel, 1.2),
    edge(limbD([-40, -96], [54, 0], 6, 6), C.steel, 1.4),
    edge(limbD([50, -96], [-44, 0], 6, 6), C.steelLit, 1.4),
    stroke('M-48 0L58 0', '#1A1A1E', 3),
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

/** Oupa dancing the vastrap, feet at (0, 0) in Oupa units: a: his left knee up and his hat raised
 *  high; b: the stamp, knees bent, both hands out. */
function dancing(step: DanceStep): string {
  const p = paints();
  const parts: string[] = [defs(p.skin, p.khaki, p.sock, p.suede, p.hat, p.face, p.beard)];
  const shoulders = step === 'a' ? -300 : -284;
  const belt = shoulders + 108;
  if (step === 'a') {
    parts.push(leg(p, [16, belt], [20, belt + 82], [24, 0], 1));
    parts.push(leg(p, [-18, belt], [-44, belt + 44], [-38, belt + 128], -1));
  } else {
    parts.push(leg(p, [-18, belt], [-36, belt + 84], [-40, 0], -1));
    parts.push(leg(p, [18, belt], [36, belt + 84], [40, 0], 1));
  }
  parts.push(torso(p, shoulders, belt, step === 'a' ? -4 : 0));
  parts.push(g({ transform: `translate(0 ${shoulders - 40})` }, head(p, step === 'b', true)));
  if (step === 'a') {
    // Right hand high with his hat in it, the left on his hip.
    parts.push(arm(p, [40, shoulders + 14], [66, shoulders - 26], [70, shoulders - 84], -10));
    parts.push(
      g({ transform: `translate(72 ${shoulders - 104}) rotate(16) scale(0.9)` }, bushHat(p)),
    );
    parts.push(arm(p, [-40, shoulders + 14], [-66, shoulders + 54], [-36, belt - 8], 30));
  } else {
    parts.push(arm(p, [40, shoulders + 14], [72, shoulders + 44], [92, shoulders + 12], -40));
    parts.push(arm(p, [-40, shoulders + 14], [-72, shoulders + 44], [-92, shoulders + 12], 40));
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

/** One flame frame: three layers of tongues from the base (0, 0) upward, frame `i` of 4. */
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
  const outer = linear(
    [
      [0, '#FF6A10', 0],
      [0.25, '#FF4A0C', 0.75],
      [1, '#C81E06', 0.95],
    ],
    0,
    1,
  );
  const mid = linear(
    [
      [0, '#FFB030', 0],
      [0.3, '#FF9A1E', 0.9],
      [1, '#FF6A10', 1],
    ],
    0,
    1,
  );
  const core = linear(
    [
      [0, '#FFF2B0', 0.2],
      [0.4, '#FFE27A', 1],
      [1, '#FFC24A', 1],
    ],
    0,
    1,
  );
  const parts: string[] = [defs(outer, mid, core)];
  const H = FLAME.oy - 4;
  for (let k = 0; k < 4; k++) {
    const dx = (k - 1.5) * 7 + (rnd() - 0.5) * 6;
    parts.push(
      path(tongue(10 + rnd() * 4, H * (0.6 + rnd() * 0.4), dx, (rnd() - 0.5) * 18), outer.url),
    );
  }
  for (let k = 0; k < 3; k++) {
    const dx = (k - 1) * 7 + (rnd() - 0.5) * 5;
    parts.push(
      path(tongue(7 + rnd() * 3, H * (0.42 + rnd() * 0.3), dx, (rnd() - 0.5) * 12), mid.url),
    );
  }
  parts.push(
    path(tongue(8, H * (0.28 + rnd() * 0.12), (rnd() - 0.5) * 4, (rnd() - 0.5) * 8), core.url),
  );
  // A loose lick breaking off the top.
  const ly = -H * (0.82 + rnd() * 0.14);
  parts.push(path(ellipseD((rnd() - 0.5) * 16, ly, 2.6, 5), '#FF9A2A', { opacity: 0.8 }));
  return g({}, ...parts);
}

/** The hearth: stones round the coals, the grid across, the coffee pot on its left edge. */
function hearth(): string {
  const coal = radial([
    [0, '#FFD27A', 1],
    [0.35, '#FF6A1A', 1],
    [0.8, '#A0200A', 1],
    [1, '#3A0A04', 1],
  ]);
  const stoneG = linear(
    [
      [0, C.stoneShade],
      [0.55, C.stone],
      [1, C.stoneLit],
    ],
    0.3,
    -1,
  );
  const rnd = prng(733);
  const parts: string[] = [defs(coal, stoneG)];
  // The coal bed and a few lumps glowing through the ash.
  parts.push(path(ellipseD(0, 2, 50, 11), '#2A0A06'));
  parts.push(path(ellipseD(0, 0, 44, 9), coal.url));
  for (let i = 0; i < 9; i++) {
    const x = (rnd() - 0.5) * 70;
    const y = (rnd() - 0.5) * 8;
    parts.push(
      edge(
        ellipseD(x, y, 6 + rnd() * 3, 3 + rnd() * 2),
        i % 3 === 0 ? '#FFB04A' : '#C8340E',
        1,
        '#3A0A04',
      ),
    );
  }
  // Stones: the back row first, the front row lit from above by the fire.
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + (i / 5) * Math.PI;
    const x = Math.cos(a) * 62;
    const y = Math.sin(a) * 10 - 2;
    parts.push(edge(ellipseD(x, y, 11 + rnd() * 4, 7 + rnd() * 2), stoneG.url, 1.6));
  }
  // The grid: a frame with bars, catching the glow.
  parts.push(stroke('M-46 -10L46 -10M-46 -10L-50 6M46 -10L50 6', '#1A1414', 3));
  for (let x = -40; x <= 40; x += 8) parts.push(stroke(`M${x} -14L${x + 2} -6`, '#2A2220', 1.6));
  parts.push(stroke('M-46 -14L46 -14', '#2A2220', 2.4));
  parts.push(stroke('M-30 -15L34 -15', '#FF9A4A', 1, 0.6));
  for (let i = 0; i < 6; i++) {
    const a = (i / 5) * Math.PI;
    const x = Math.cos(a) * 64;
    const y = Math.sin(a) * 9 + 6;
    parts.push(edge(ellipseD(x, y, 12 + rnd() * 4, 7 + rnd() * 2), stoneG.url, 1.6));
    parts.push(path(ellipseD(x + 2, y - 4, 7, 2), C.stoneLit, { opacity: 0.6 }));
  }
  // The coffee pot (a blue enamel moerkoffie kettle) on the grid's left end.
  const pot = lit3(C.enamelShade, C.enamel, C.enamelLit);
  parts.push(defs(pot));
  parts.push(
    g(
      { transform: 'translate(-34 -14)' },
      edge('M-10 0L-12 -18Q0 -24 12 -18L10 0Z', pot.url, 1.6),
      edge('M12 -14Q20 -16 22 -24', 'none', 3),
      edge(ellipseD(0, -19, 7, 2.4), '#E0E8F0', 1.2),
      edge(ellipseD(0, -23, 3, 2), '#1C2A40', 1),
      stroke('M-6 -16L-7 -4', '#E8F0FF', 1.4, 0.5),
    ),
  );
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

/** The bakkie: a generic pickup, side view, nose to the left, its wheels on y = 0 at ±104. */
function bakkie(): string {
  const body = linear(
    [
      [0, '#1A1E2A'],
      [1, '#0A0C12'],
    ],
    0,
    1,
  );
  return g(
    {},
    defs(body),
    path(
      smoothD(
        [
          [-150, -36],
          [-146, -64],
          [-96, -70],
          [-66, -104],
          [6, -106],
          [18, -70],
          [150, -70],
          [154, -30],
          [150, -20],
          [-148, -20],
        ],
        true,
        0.25,
      ),
      body.url,
    ),
    // Windows: a faint sky reflection.
    path(
      polyD([
        [-88, -72],
        [-62, -98],
        [-20, -98],
        [-20, -72],
      ]),
      '#2A3450',
      { opacity: 0.8 },
    ),
    path(
      polyD([
        [-14, -98],
        [2, -98],
        [10, -72],
        [-14, -72],
      ]),
      '#2A3450',
      { opacity: 0.8 },
    ),
    // Wheels.
    ...[-104, 104].map((x) =>
      g({}, path(ellipseD(x, -18, 26, 26), '#06070A'), path(ellipseD(x, -18, 11, 11), '#1C2028')),
    ),
    // A cool rim of sky light on the roof and bonnet, a warm glint from the fire on the tail.
    stroke('M-146 -64L-96 -70L-66 -104L6 -106L18 -70L150 -70', '#6C80B0', 2, 0.55),
    stroke('M150 -66L154 -32', '#FF9A4A', 2.4, 0.7),
    stroke('M118 -60L146 -60', '#FF9A4A', 1.4, 0.4),
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
