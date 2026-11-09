// v1.8b (D-062, art bible §5.3) Chacma baboons, interim art at the v1.6/v1.7 bar (D-035
// semi-realistic): olive grey-brown coat with a lit back and a paler grey belly, the long dark
// dog-like muzzle, pale eyelids under a heavy brow, small ears, dark hands and feet, the tail
// carried in its typical "broken" arch (up from the rump, then hanging down). The adult male has a
// shoulder mane; a mother carries her small dark baby jockey-style on her back (so the player sees
// at once she is not a target). Drawn from a posed skeleton (torso, head, four limbs, tail) so
// every frame is the same animal; layered shading (a lit back, a shaded belly), short fur strokes,
// edges a shade darker than the part (no ink), a soft contact shadow; light from the upper left.
// Frames face right with the feet at the origin; sizes from src/game/view/baboon/baboonSheet.ts.
// Pure: frame → SVG.
import {
  BABOON_SHEET_H,
  BABOON_SHEET_W,
  baboonFrames,
  RAIDER_H,
  RIDGE_H,
  type BaboonFrame,
} from '../../src/game/view/baboon/baboonSheet';
import { ROCK_H, ROCK_HALF_W, rockTop } from '../../src/game/view/baboon/troopRock';
import type { Rgba } from '../assets/image';
import { add, clipOf, limb, mul, sub, unit, nrm, type V } from './farFauna';
import { renderSvg } from './raster';
import { nextId, shade } from './scenery';
import { el as svgEl, g, prng, smoothD, svgDoc } from './svg';

type Attrs = Record<string, string | number>;

// These poses use body-height units, not pixels. The shared two-decimal serializer
// erased fine fur widths and eye highlights before scaling to the delivered texture.
const r2 = (value: number): string => String(Math.round(value * 10000) / 10000);
function el(tag: string, attrs: Attrs, ...children: string[]): string {
  return svgEl(
    tag,
    Object.fromEntries(
      Object.entries(attrs).map(([key, value]) => [
        key,
        typeof value === 'number' ? r2(value) : value,
      ]),
    ),
    ...children,
  );
}
function ellipseD(cx: number, cy: number, rx: number, ry: number): string {
  return `M${r2(cx - rx)} ${r2(cy)}a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(rx * 2)} 0a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(-rx * 2)} 0Z`;
}

interface Coat {
  readonly coat: string;
  readonly lit: string;
  readonly dark: string;
  readonly belly: string;
  readonly face: string;
  readonly hand: string;
  readonly lid: string;
  readonly pad: string;
}

/** Chacma colours (the far frames get the same; the far haze is the layer's tint). */
const MALE: Coat = {
  // v1.15 review: more contrast — a lighter olive-grey lit back, a darker belly and muzzle.
  coat: '#776650',
  lit: '#B2A47E',
  dark: '#3A3026',
  belly: '#5E5446',
  face: '#4A3E3A',
  hand: '#2C2723',
  lid: '#CDBFAF',
  pad: '#9A7A74',
};
const MOTHER: Coat = { ...MALE, coat: '#7E6E58', lit: '#B8A985', belly: '#665B4C' };
const BABY: Coat = {
  coat: '#2E2824',
  lit: '#4A403A',
  dark: '#1C1815',
  belly: '#3A322D',
  face: '#C69A8C',
  hand: '#5A4A44',
  lid: '#D8B8AE',
  pad: '#B08880',
};

/** A limb: points from the body down (shoulder → elbow → hand, or hip → knee → heel → toe). */
type Limb = readonly V[];

interface Pose {
  /** Torso: the rump end and the shoulder end (units of a sitting male's height), and its
   *  thickness. */
  readonly rear: V;
  readonly front: V;
  readonly thick: number;
  /** Head centre, the muzzle's direction (deg from straight ahead, + = down), mouth open. */
  readonly head: V;
  readonly muzzle: number;
  readonly open?: boolean;
  /** Face turned toward the viewer (the moon: looking back over the shoulder). */
  readonly back?: boolean;
  /** Far and near arm, far and near leg. */
  readonly arms: readonly [Limb, Limb];
  readonly legs: readonly [Limb, Limb];
  readonly tail: readonly V[];
  /** Sitting: the rump pad shows. */
  readonly sit?: boolean;
  /** Whole figure rotated about its middle (the tumble), and how. */
  readonly spin?: number;
  /** Held in the near hand, or worn. */
  readonly item?: 'hat' | 'fruit' | 'mielie' | 'throwFruit';
  readonly hatOn?: boolean;
  readonly water?: boolean;
  readonly post?: boolean;
  /** A mother: the baby on her back. */
  readonly baby?: boolean;
  /** The male's shoulder mane (off for mothers and youngsters). */
  readonly mane?: boolean;
  /** Eyes shut (lying still after the tumble). */
  readonly shut?: boolean;
  /** v1.16 (D-078): head and shoulders only, rising over the ridge's edge: no legs, tail or
   *  hands, everything below the origin row cut off flat (the view hides it behind the edge). */
  readonly bust?: boolean;
  /** v1.16: a baby's head peeking over a bust's shoulder (the mother's peek). */
  readonly babyPeek?: boolean;
}

/** Quadruped stance: the four feet's phase (−1 back … +1 forward) for a gait frame. */
function walkPose(phase: number, run = false, open = false): Pose {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const stride = run ? 0.2 : 0.13;
  const lift = run ? 0.09 : 0.06;
  const bob = run ? -0.04 * Math.abs(c) : -0.012 * Math.abs(c);
  const y = (v: number): number => v + bob;
  const foot = (x: number, ph: number): V => [
    x + stride * Math.sin(ph),
    -Math.max(0, lift * Math.cos(ph)),
  ];
  const fNear = foot(0.28, phase);
  const fFar = foot(0.24, phase + Math.PI);
  const hNear = foot(-0.3, phase + Math.PI);
  const hFar = foot(-0.34, phase);
  const shoulder: V = [0.17, y(run ? -0.58 : -0.6)];
  const hip: V = [-0.3, y(run ? -0.54 : -0.53)];
  // Baboon elbows point back; the hand sits under the shoulder ± the stride.
  const arm = (hand: V, sh: V): Limb => [
    sh,
    [sh[0] - 0.03 + (hand[0] - sh[0]) * 0.45, sh[1] + 0.29],
    hand,
  ];
  const leg = (toe: V, hp: V): Limb => [
    hp,
    [hp[0] + 0.07 + (toe[0] - hp[0]) * 0.4, hp[1] + 0.25],
    [toe[0] - 0.11, toe[1] - 0.09],
    toe,
  ];
  return {
    rear: [-0.33, y(-0.58)],
    front: [0.18, y(run ? -0.63 : -0.65)],
    thick: 0.34,
    head: [0.3 + (run ? 0.03 : 0), y(run ? -0.68 : -0.71) + 0.01 * s],
    muzzle: run ? 22 : 28,
    open,
    arms: [arm(fFar, shoulder), arm(fNear, shoulder)],
    legs: [leg(hFar, hip), leg(hNear, hip)],
    // The "broken" tail: up from the rump, a sharp bend, then hanging (streams back running).
    tail: run
      ? [
          [-0.43, y(-0.64)],
          [-0.51, y(-0.79)],
          [-0.61, y(-0.81)],
          [-0.69, y(-0.66)],
          [-0.73, y(-0.47)],
        ]
      : [
          [-0.42, y(-0.64)],
          [-0.47, y(-0.77)],
          [-0.53, y(-0.79)],
          [-0.57, y(-0.6)],
          [-0.58, y(-0.34)],
        ],
    mane: true,
  };
}

/** Sitting on the rump, knees up, hands at `hands` (far, near). */
function sitPose(o: {
  hands?: readonly [V, V];
  head?: V;
  muzzle?: number;
  open?: boolean;
  lean?: number;
  item?: Pose['item'];
  hatOn?: boolean;
}): Pose {
  const lean = o.lean ?? 0;
  const sh: V = [0.04 + lean, -0.6];
  const hands = o.hands ?? [
    [0.2, -0.22],
    [0.24, -0.2],
  ];
  const arm = (h: V): Limb => [sh, [sh[0] + 0.04, sh[1] + 0.24], h];
  return {
    rear: [-0.1, -0.2],
    front: sh,
    thick: 0.34,
    head: o.head ?? [0.1 + lean, -0.8],
    muzzle: o.muzzle ?? 28,
    open: o.open ?? false,
    arms: [arm(hands[0]), arm(hands[1])],
    legs: [
      [
        [-0.06, -0.14],
        [0.16, -0.3],
        [0.2, -0.06],
        [0.28, 0],
      ],
      [
        [-0.02, -0.12],
        [0.22, -0.28],
        [0.24, -0.05],
        [0.34, 0],
      ],
    ],
    // The tail curled round on the ground beside it.
    tail: [
      [-0.22, -0.12],
      [-0.3, -0.05],
      [-0.26, -0.01],
      [-0.12, 0],
    ],
    sit: true,
    mane: true,
    ...(o.item === undefined ? {} : { item: o.item }),
    ...(o.hatOn === true ? { hatOn: true } : {}),
  };
}

/** Up on the hind legs (the tap, the throw, the lookout's bark). */
function standPose(o: {
  near: Limb;
  far?: Limb;
  open?: boolean;
  item?: Pose['item'];
  water?: boolean;
}): Pose {
  const sh: V = [0.06, -0.98];
  return {
    rear: [-0.06, -0.58],
    front: sh,
    thick: 0.32,
    head: [0.14, -1.18],
    muzzle: 24,
    open: o.open ?? false,
    arms: [o.far ?? [sh, [0.14, -0.74], [0.2, -0.62]], o.near],
    legs: [
      [
        [-0.08, -0.6],
        [0.02, -0.34],
        [-0.1, -0.06],
        [0.04, 0],
      ],
      [
        [-0.02, -0.6],
        [0.1, -0.32],
        [0.0, -0.05],
        [0.16, 0],
      ],
    ],
    tail: [
      [-0.18, -0.6],
      [-0.3, -0.72],
      [-0.38, -0.66],
      [-0.4, -0.36],
    ],
    mane: true,
    ...(o.item === undefined ? {} : { item: o.item }),
    ...(o.water === true ? { water: true } : {}),
  };
}

/** v1.16 (D-078): head and shoulders rising over the ridge's edge (the origin row): a broad
 *  maned chest (narrower for a mother), the upper arms going down out of sight. */
function bustPose(o: { head: V; muzzle: number; mane: boolean }): Pose {
  const sh: V = [0.0, -0.19];
  // The parts below the edge end just under it (resvg panics on a clipped group that lies wholly
  // outside a small canvas, as in the frames test's box-sized render).
  return {
    rear: [-0.06, 0.1],
    front: sh,
    thick: o.mane ? 0.44 : 0.38,
    head: o.head,
    muzzle: o.muzzle,
    arms: [
      [
        [0.04, -0.15],
        [0.09, -0.04],
        [0.11, 0.04],
      ],
      [
        [0.08, -0.13],
        [0.14, -0.03],
        [0.16, 0.04],
      ],
    ],
    legs: [[], []],
    tail: [],
    mane: o.mane,
    bust: true,
  };
}

export const POSES: Readonly<
  Record<Exclude<BaboonFrame, 'fx_fruit' | 'fx_water' | 'r_rock'>, Pose>
> = {
  walk_a: walkPose(0),
  walk_b: walkPose(Math.PI / 2),
  walk_c: walkPose(Math.PI),
  walk_d: walkPose((3 * Math.PI) / 2),
  run_a: walkPose(0.4, true),
  run_b: walkPose(0.4 + Math.PI, true),
  // Oupa's hat: on its head, scratching under it.
  hat_a: sitPose({
    hatOn: true,
    hands: [
      [0.2, -0.24],
      [0.26, -0.22],
    ],
  }),
  hat_b: sitPose({
    hatOn: true,
    hands: [
      [0.2, -0.24],
      [0.12, -0.86],
    ],
    muzzle: 18,
  }),
  fruit_a: sitPose({
    item: 'fruit',
    hands: [
      [0.22, -0.28],
      [0.3, -0.5],
    ],
  }),
  fruit_b: sitPose({
    item: 'fruit',
    hands: [
      [0.22, -0.28],
      [0.26, -0.68],
    ],
    muzzle: 40,
    open: true,
  }),
  mielie_a: sitPose({
    item: 'mielie',
    hands: [
      [0.26, -0.5],
      [0.3, -0.52],
    ],
  }),
  mielie_b: sitPose({
    item: 'mielie',
    hands: [
      [0.24, -0.62],
      [0.28, -0.64],
    ],
    muzzle: 40,
    open: true,
  }),
  tap_a: standPose({
    near: [
      [0.06, -0.98],
      [0.22, -0.92],
      [0.34, -0.96],
    ],
  }),
  throw_a: standPose({
    near: [
      [0.06, -0.98],
      [-0.12, -1.06],
      [-0.22, -1.24],
    ],
    item: 'throwFruit',
  }),
  throw_b: standPose({
    near: [
      [0.06, -0.98],
      [0.26, -1.02],
      [0.44, -0.96],
    ],
    open: true,
  }),
  // The moon: on a fence post, its back to the player, looking over its shoulder.
  moon_a: { ...sitPose({ lean: 0.08, head: [0.1, -0.84] }), back: true, post: true },
  tumble: { ...walkPose(Math.PI / 2, true), spin: 160, open: true },
  down: {
    rear: [-0.36, -0.2],
    front: [0.22, -0.22],
    thick: 0.32,
    head: [0.46, -0.18],
    muzzle: 4,
    shut: true,
    arms: [
      [
        [0.2, -0.24],
        [0.36, -0.08],
        [0.52, -0.04],
      ],
      [
        [0.2, -0.2],
        [0.3, -0.06],
        [0.46, -0.02],
      ],
    ],
    legs: [
      [
        [-0.34, -0.22],
        [-0.16, -0.08],
        [-0.3, -0.04],
        [-0.12, -0.02],
      ],
      [
        [-0.32, -0.18],
        [-0.12, -0.06],
        [-0.22, -0.02],
        [-0.04, 0],
      ],
    ],
    tail: [
      [-0.52, -0.2],
      [-0.66, -0.14],
      [-0.8, -0.06],
      [-0.9, -0.02],
    ],
    mane: true,
  },
  // v1.16 (D-078): the ridge troop hides behind the skyline and peeks over it. The busts are the
  // head and shoulders above the edge (cut flat at the origin row); the sentinel sits up on top.
  r_peek_a: bustPose({ head: [0.15, -0.37], muzzle: 14, mane: true }),
  r_peek_b: { ...bustPose({ head: [0.06, -0.37], muzzle: 0, mane: true }), back: true },
  r_mother_peek: {
    ...bustPose({ head: [0.14, -0.35], muzzle: 18, mane: false }),
    babyPeek: true,
  },
  r_sentinel: {
    rear: [-0.1, -0.2],
    front: [0.0, -0.62],
    thick: 0.34,
    head: [0.1, -0.83],
    muzzle: 14,
    // Arms straight down to the rock in front (a sitting baboon props itself on them).
    arms: [
      [
        [0.03, -0.6],
        [0.13, -0.32],
        [0.2, -0.03],
      ],
      [
        [0.05, -0.58],
        [0.17, -0.3],
        [0.26, -0.03],
      ],
    ],
    legs: [
      [
        [-0.06, -0.16],
        [0.12, -0.36],
        [0.1, -0.08],
        [0.17, 0],
      ],
      [
        [-0.02, -0.14],
        [0.17, -0.33],
        [0.15, -0.07],
        [0.24, 0],
      ],
    ],
    // The broken tail: out behind the rump, then hanging straight down over the rock.
    tail: [
      [-0.2, -0.16],
      [-0.31, -0.24],
      [-0.37, -0.14],
      [-0.38, 0],
    ],
    sit: true,
    mane: true,
  },
  r_bark_a: standPose({
    near: [
      [0.06, -0.98],
      [0.14, -0.74],
      [0.22, -0.6],
    ],
    open: true,
  }),
  r_bark_b: {
    ...standPose({
      near: [
        [0.06, -0.98],
        [0.14, -0.74],
        [0.22, -0.6],
      ],
    }),
    muzzle: 4,
    open: true,
  },
};

// --- drawing -------------------------------------------------------------------------------

function part(d: string, fillC: string, w: number, extra: Attrs = {}): string {
  const id = nextId();
  // Model each anatomical mass with soft light instead of a flat outlined cutout.
  return (
    el(
      'defs',
      {},
      el(
        'linearGradient',
        { id, x1: '15%', y1: '0%', x2: '75%', y2: '100%' },
        el('stop', { offset: 0, 'stop-color': shade(fillC, 0.28) }),
        el('stop', { offset: 0.35, 'stop-color': fillC }),
        el('stop', { offset: 1, 'stop-color': shade(fillC, -0.3) }),
      ),
    ) +
    el('path', {
      d,
      fill: `url(#${id})`,
      // Edges a shade darker than the part at full width (art bible §5.3, "no ink"): the softer,
      // half-width edge of 3 Nov let near raiders melt into the veld (7 Nov screenshots).
      stroke: shade(fillC, -0.42),
      'stroke-width': w,
      'stroke-linejoin': 'round',
      ...extra,
    })
  );
}

/** The torso as one smooth outline: a small rounded rump, the back rising to the shoulders, a
 *  deep chest and the lean, tucked-up waist of a chacma (v1.16, D-078). */
function torsoD(p: Pose): string {
  const ax = unit(sub(p.front, p.rear));
  const n = nrm(ax);
  const t = p.thick / 2;
  const at = (k: number, w: number): V => add(add(p.rear, mul(ax, k)), mul(n, -w));
  const len = Math.hypot(p.front[0] - p.rear[0], p.front[1] - p.rear[1]);
  const m = p.mane === true;
  const pts: V[] = [
    add(p.rear, mul(ax, -t * 0.85)),
    at(len * 0.06, t * 0.8),
    at(len * 0.4, t * 0.84),
    at(len * 0.75, t * (m ? 1.08 : 0.96)),
    at(len * 0.97, t * (m ? 1.1 : 0.88)),
    add(p.front, mul(ax, t * 0.62)),
    at(len * 0.9, -t * 1.06),
    at(len * 0.62, -t * 0.8),
    at(len * 0.34, -t * 0.62),
    at(len * 0.07, -t * 0.82),
  ];
  return smoothD(pts, true, 0.9);
}

/** v1.16 (D-078): the adult male's cape — the long hair over the neck and shoulders, ending in a
 *  ragged hem of locks over the chest and the middle of the back. */
function maneD(p: Pose, small: boolean): string {
  const ax = unit(sub(p.front, p.rear));
  const n = nrm(ax);
  const t = p.thick / 2;
  const len = Math.hypot(p.front[0] - p.rear[0], p.front[1] - p.rear[1]);
  const at = (k: number, w: number): V => add(add(p.rear, mul(ax, len * k)), mul(n, -w));
  const nd = unit(sub(p.head, p.front));
  const up = mul(nrm(nd), -1);
  const neck = (k: number, w: number): V => add(lerpV(p.front, p.head, k), mul(up, w));
  const top: V[] = [
    at(0.55, t * 0.88),
    at(0.78, t * 1.08),
    at(0.95, t * 1.14),
    neck(0.45, 0.115),
    neck(0.78, 0.075),
    neck(0.8, -0.06),
    neck(0.45, -0.12),
    add(add(p.front, mul(ax, t * 0.55)), mul(n, t * 0.5)),
  ];
  // The hem: locks hanging from the chest back to the middle of the back.
  const hem: V[] = [];
  const a = at(0.92, -t * 0.75);
  const b = at(0.55, t * 0.55);
  const m = small ? 4 : 8;
  for (let i = 0; i <= m; i++) {
    const q = lerpV(a, b, i / m);
    hem.push(i % 2 === 1 ? add(q, mul(n, small ? 0.05 : 0.045)) : q);
  }
  return smoothD([...top, ...hem], true, 0.55);
}

/** Short fur strokes over a part (lit on top, dark below), clipped to it. */
function fur(
  clip: string,
  box: { x0: number; y0: number; x1: number; y1: number },
  coat: Coat,
  seed: number,
  k: number,
): string {
  const rnd = prng(seed);
  const strokes: string[] = [];
  const n = Math.round(((box.x1 - box.x0) * (box.y1 - box.y0)) / (0.0016 * k));
  for (let i = 0; i < Math.min(n, 340); i++) {
    const x = box.x0 + rnd() * (box.x1 - box.x0);
    const y = box.y0 + rnd() * (box.y1 - box.y0);
    const t = (y - box.y0) / Math.max(1e-6, box.y1 - box.y0);
    const c = t < 0.45 ? coat.lit : coat.dark;
    const len = 0.025 + rnd() * 0.02;
    const a = -0.6 + rnd() * 0.5;
    strokes.push(
      el('path', {
        d: `M${r2(x)} ${r2(y)}l${r2(-len * Math.cos(a))} ${r2(len * Math.sin(a) * 0.6)}`,
        stroke: c,
        'stroke-width': 0.004,
        'stroke-linecap': 'round',
        opacity: r2(0.35 + rnd() * 0.35),
        fill: 'none',
      }),
    );
  }
  return g({ 'clip-path': `url(#${clip})` }, ...strokes);
}

/** A limb's width at joint `i` of `n`: `ws` spread evenly from the body end to the hand or foot
 *  (two values: a straight taper; more: a thigh or forearm swelling and slimming). */
function wAt(ws: readonly number[], i: number, n: number): number {
  const t = (i / Math.max(1, n - 1)) * (ws.length - 1);
  const k = Math.min(ws.length - 2, Math.floor(t));
  const a = ws[k] ?? 0;
  const b = ws[k + 1] ?? a;
  return a + (b - a) * (t - k);
}

function limbD(l: Limb, w0: number, w1: number): string {
  return limbWs(l, [w0, w1]);
}

function limbWs(l: Limb, ws: readonly number[]): string {
  const n = l.length;
  return limb(
    l.map((p, i) => ({ p, w: wAt(ws, i, n) })),
    0.8,
  );
}

/** v1.15 (D-077): a limb's coat — shade down its underside (light from the upper left), a lit
 *  ridge on top and short hair strokes along it, clipped to the limb. Returns [defs, art]. */
function limbCoat(
  l: Limb,
  ws: readonly number[],
  coat: Coat,
  seed: number,
  small: boolean,
): [string, string] {
  const clip = clipOf([limbWs(l, ws)]);
  const shadeD: string[] = [];
  const litD: string[] = [];
  for (let i = 0; i + 1 < l.length; i++) {
    const a = l[i] ?? [0, 0];
    const b = l[i + 1] ?? [0, 0];
    let n = nrm(unit(sub(b, a)));
    // The shade side faces down-right (away from the light).
    if (n[0] + n[1] < 0) n = mul(n, -1);
    const w = wAt(ws, i, l.length) * 0.36;
    shadeD.push(
      `M${r2(a[0] + n[0] * w)} ${r2(a[1] + n[1] * w)}L${r2(b[0] + n[0] * w)} ${r2(b[1] + n[1] * w)}`,
    );
    litD.push(
      `M${r2(a[0] - n[0] * w)} ${r2(a[1] - n[1] * w)}L${r2(b[0] - n[0] * w)} ${r2(b[1] - n[1] * w)}`,
    );
  }
  // Hair along the limb: short strokes laid toward the hand or foot.
  const rnd = prng(seed);
  const hair: string[] = [];
  const per = small ? 3 : 9;
  for (let i = 0; i + 1 < l.length; i++) {
    const a = l[i] ?? [0, 0];
    const b = l[i + 1] ?? [0, 0];
    const d = unit(sub(b, a));
    const n = nrm(d);
    const w = wAt(ws, i, l.length) * 0.4;
    for (let k = 0; k < per; k++) {
      const t = (k + rnd()) / per;
      const o = (rnd() - 0.5) * 2 * w;
      const x = a[0] + (b[0] - a[0]) * t + n[0] * o;
      const y = a[1] + (b[1] - a[1]) * t + n[1] * o;
      const len = 0.02 + rnd() * 0.015;
      hair.push(
        `M${r2(x)} ${r2(y)}l${r2(d[0] * len + n[0] * 0.004)} ${r2(d[1] * len + n[1] * 0.004)}`,
      );
    }
  }
  const sw = (k: number): number => (small ? k * 1.8 : k);
  return [
    clip.def,
    g(
      { class: 'limb-coat', 'clip-path': `url(#${clip.id})` },
      el('path', {
        d: shadeD.join(''),
        stroke: coat.dark,
        'stroke-width': r2(sw(0.03)),
        'stroke-linecap': 'round',
        fill: 'none',
        opacity: 0.45,
      }),
      el('path', {
        d: litD.join(''),
        stroke: coat.lit,
        'stroke-width': r2(sw(0.012)),
        'stroke-linecap': 'round',
        fill: 'none',
        opacity: 0.45,
      }),
      el('path', {
        d: hair.join(''),
        stroke: shade(coat.coat, -0.3),
        'stroke-width': r2(sw(0.0045)),
        'stroke-linecap': 'round',
        fill: 'none',
        opacity: 0.6,
      }),
    ),
  ];
}

/** v1.15 (D-077): a hand or foot (dark leathery skin): the knuckles' lit edge, finger creases. */
function digits(x: number, y: number, rx: number, ry: number, coat: Coat): string {
  return el('path', {
    d:
      `M${r2(x - rx * 0.5)} ${r2(y - ry * 0.1)}l${r2(rx * 0.12)} ${r2(ry * 0.8)}` +
      `M${r2(x)} ${r2(y - ry * 0.2)}l${r2(rx * 0.1)} ${r2(ry * 0.9)}` +
      `M${r2(x + rx * 0.45)} ${r2(y - ry * 0.1)}l${r2(rx * 0.08)} ${r2(ry * 0.8)}` +
      `M${r2(x - rx * 0.8)} ${r2(y - ry * 0.55)}Q${r2(x)} ${r2(y - ry * 1.1)} ${r2(x + rx * 0.8)} ${r2(y - ry * 0.55)}`,
    stroke: shade(coat.hand, 0.35),
    'stroke-width': r2(rx * 0.09),
    'stroke-linecap': 'round',
    fill: 'none',
    opacity: 0.6,
  });
}

/** v1.16 (D-078): the chacma's head in profile, drawn along the muzzle (+x forward, +y the jaw
 *  side) and turned by `p.muzzle`: a low furred crown, a heavy brow ridge over a close-set,
 *  deep-set eye with the pale lid, and the long, deep, dog-like muzzle in dark grey-brown skin
 *  (darkest at the nose, which juts past the lips), the ridges down its side, the paler cheek fur
 *  swept back behind it. Units: a sitting male's height. */
function headParts(p: Pose, coat: Coat, small: boolean): string[] {
  const [hx, hy] = p.head;
  const out: string[] = [];
  const thin = (k: number): number => (small ? k * 1.7 : k);
  // The furred skull: crown, cheeks and the fluff under the jaw (the face skin covers its front).
  const skull = smoothD(
    [
      [-0.112, 0.012],
      [-0.1, -0.05],
      [-0.048, -0.088],
      [0.018, -0.085],
      [0.068, -0.062],
      [0.07, -0.02],
      [0.1, 0.045],
      [0.05, 0.088],
      [-0.035, 0.092],
      [-0.098, 0.06],
    ],
    true,
    0.85,
  );
  out.push(part(skull, coat.coat, thin(0.006)));
  // The lit crown.
  out.push(el('path', { d: ellipseD(-0.035, -0.055, 0.06, 0.026), fill: coat.lit, opacity: 0.6 }));
  const sclip = clipOf([skull]);
  out.push(el('defs', {}, sclip.def));
  out.push(fur(sclip.id, { x0: -0.12, y0: -0.1, x1: 0.1, y1: 0.1 }, coat, 73, 0.5));
  // The small ear, half hidden in the fur behind the eye.
  out.push(
    el('path', {
      d: ellipseD(-0.07, -0.02, 0.014, 0.019),
      fill: shade(coat.coat, -0.2),
      opacity: 0.8,
    }),
  );
  // The pale grey cheek fur (whiskers swept back from behind the muzzle).
  const cheek = smoothD(
    [
      [0.075, 0.0],
      [0.1, 0.05],
      [0.06, 0.082],
      [-0.01, 0.075],
      [-0.06, 0.05],
      [-0.015, 0.035],
      [0.03, 0.01],
    ],
    true,
    0.8,
  );
  out.push(el('path', { d: cheek, fill: shade(coat.lit, 0.2), opacity: small ? 0.6 : 0.4 }));
  if (!small)
    out.push(
      el('path', {
        d: 'M0.07 0.02q-0.05 0.01 -0.11 0.03M0.075 0.04q-0.06 0.015 -0.12 0.025M0.07 0.06q-0.05 0.01 -0.1 0.005',
        stroke: shade(coat.lit, 0.45),
        'stroke-width': 0.004,
        fill: 'none',
        opacity: 0.8,
        'stroke-linecap': 'round',
      }),
    );
  // The lower jaw (dropped when barking), and the gape behind it.
  const open = p.open === true;
  const jawPts: V[] = [
    [0.07, 0.03],
    [0.245, 0.022],
    [0.24, 0.042],
    [0.16, 0.066],
    [0.08, 0.074],
  ];
  const pivot: V = [0.07, 0.035];
  const ja = open ? (24 * Math.PI) / 180 : 0;
  const jaw = jawPts.map((q): V => [
    pivot[0] + (q[0] - pivot[0]) * Math.cos(ja) - (q[1] - pivot[1]) * Math.sin(ja),
    pivot[1] + (q[0] - pivot[0]) * Math.sin(ja) + (q[1] - pivot[1]) * Math.cos(ja),
  ]);
  if (open) {
    const jt = jaw[1] ?? [0, 0];
    out.push(
      el('path', {
        d: smoothD([pivot, [0.27, 0.02], [jt[0] + 0.01, jt[1]], [0.1, 0.06]], true, 0.5),
        fill: '#4E2220',
      }),
    );
    // The male's long canines, upper and lower.
    out.push(
      el('path', {
        d:
          `M0.2 0.03l0.008 ${small ? 0.04 : 0.036}l0.01 -0.038z` +
          `M${r2(jt[0] - 0.05)} ${r2(jt[1] - 0.008)}l0.006 -0.026l0.01 0.022z`,
        fill: '#EFE6D4',
      }),
    );
  }
  out.push(part(smoothD(jaw, true, 0.8), shade(coat.face, 0.12), thin(0.005)));
  // The long muzzle: the brow, a slight stop, the straight nose bridge, the nose jutting past the
  // upper lip.
  const muzzleD = smoothD(
    [
      [0.03, -0.054],
      [0.078, -0.062],
      [0.108, -0.05],
      [0.18, -0.041],
      [0.252, -0.034],
      [0.284, -0.018],
      [0.284, 0.006],
      [0.266, 0.02],
      [0.2, 0.032],
      [0.13, 0.046],
      [0.07, 0.05],
      [0.035, 0.02],
    ],
    true,
    0.7,
  );
  out.push(part(muzzleD, coat.face, thin(0.006)));
  const mclip = clipOf([muzzleD]);
  out.push(el('defs', {}, mclip.def));
  out.push(
    g(
      { 'clip-path': `url(#${mclip.id})` },
      // Darker toward the nose; the lit bridge; the ridges along the side.
      el('path', { d: ellipseD(0.27, -0.004, 0.06, 0.04), fill: shade(coat.face, -0.45) }),
      el('path', {
        d: 'M0.1 -0.041L0.25 -0.03',
        stroke: shade(coat.face, 0.75),
        'stroke-width': 0.012,
        fill: 'none',
        opacity: small ? 0.5 : 0.75,
        'stroke-linecap': 'round',
      }),
      el('path', {
        d: 'M0.1 -0.02Q0.17 -0.022 0.24 -0.014M0.1 0.0Q0.17 -0.002 0.23 0.006',
        stroke: shade(coat.face, -0.5),
        'stroke-width': thin(0.005),
        fill: 'none',
        opacity: 0.8,
        'stroke-linecap': 'round',
      }),
      el('path', {
        d: 'M0.1 -0.027Q0.17 -0.03 0.24 -0.021',
        stroke: shade(coat.face, 0.5),
        'stroke-width': thin(0.004),
        fill: 'none',
        opacity: small ? 0 : 0.7,
        'stroke-linecap': 'round',
      }),
    ),
  );
  if (!open)
    out.push(
      el('path', {
        d: 'M0.265 0.022Q0.18 0.036 0.09 0.042',
        stroke: '#140E0C',
        'stroke-width': thin(0.005),
        fill: 'none',
        'stroke-linecap': 'round',
      }),
    );
  // The nose pad and (near raiders) the nostrils at the snout's end.
  out.push(el('path', { d: ellipseD(0.274, -0.006, 0.013, 0.017), fill: '#141010' }));
  if (!small) {
    out.push(
      el('path', {
        d: ellipseD(0.27, -0.02, 0.008, 0.004),
        fill: shade(coat.face, 0.5),
        opacity: 0.6,
      }),
    );
    out.push(
      el('path', {
        d: ellipseD(0.281, -0.004, 0.004, 0.006) + ellipseD(0.274, 0.006, 0.0035, 0.005),
        fill: '#050303',
        class: 'nostrils',
      }),
    );
  }
  // The deep eye socket under the heavy brow ridge; the close-set eye with its pale upper lid.
  out.push(el('path', { d: ellipseD(0.048, -0.03, 0.03, 0.02), fill: '#1A1412', opacity: 0.55 }));
  if (p.shut === true)
    out.push(
      el('path', {
        d: 'M0.03 -0.033l0.036 0.004',
        stroke: coat.lid,
        'stroke-width': 0.01,
        fill: 'none',
      }),
    );
  else {
    out.push(
      el('path', {
        d: ellipseD(0.05, -0.037, small ? 0.02 : 0.017, small ? 0.009 : 0.0065),
        fill: coat.lid,
      }),
    );
    out.push(
      el('path', {
        d: ellipseD(0.053, -0.029, small ? 0.012 : 0.01, 0.0075),
        fill: small ? '#3A2210' : '#6A4420',
      }),
    );
    if (!small) {
      out.push(el('path', { d: ellipseD(0.055, -0.029, 0.0045, 0.0048), fill: '#0A0604' }));
      out.push(
        el('path', { d: ellipseD(0.051, -0.031, 0.0018, 0.0018), fill: '#FFFFFF', opacity: 0.85 }),
      );
    }
  }
  out.push(
    el('path', {
      d: 'M0.0 -0.07Q0.045 -0.074 0.088 -0.056',
      stroke: shade(coat.coat, -0.25),
      'stroke-width': thin(0.017),
      fill: 'none',
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: 'M0.004 -0.077Q0.045 -0.081 0.084 -0.064',
      stroke: coat.lit,
      'stroke-width': thin(0.007),
      fill: 'none',
      opacity: 0.85,
      'stroke-linecap': 'round',
    }),
  );
  const head = g(
    { transform: `translate(${r2(hx)} ${r2(hy)}) rotate(${r2(p.muzzle)}) scale(1.1)` },
    ...out,
  );
  // The hat keeps its v1.8b height (0.092 above the skull's centre) on the crown.
  return p.hatOn === true ? [head, ...hat(hx - 0.01, hy - 0.092, 1)] : [head];
}

const lerpV = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** The head turned to look at the player (the moon over its shoulder, a peeking male looking
 *  round): close-set eyes under one heavy brow, the long dark muzzle running down from between
 *  them to the nose pad, the pale grey cheek fur flaring out on both sides. */
function faceOn(h: V, coat: Coat, open: boolean, small = false): string[] {
  const [x, y] = h;
  const t = (k: number): number => (small ? k * 1.7 : k);
  const cheeks = smoothD(
    [
      [x - 0.06, y - 0.07],
      [x - 0.11, y + 0.0],
      [x - 0.12, y + 0.07],
      [x - 0.05, y + 0.06],
      [x + 0.05, y + 0.06],
      [x + 0.12, y + 0.07],
      [x + 0.11, y + 0.0],
      [x + 0.06, y - 0.07],
    ],
    true,
    0.8,
  );
  const muzzle = smoothD(
    [
      [x - 0.03, y - 0.045],
      [x + 0.03, y - 0.045],
      [x + 0.04, y + 0.04],
      [x + 0.05, y + 0.12],
      [x + 0.03, y + 0.15],
      [x - 0.03, y + 0.15],
      [x - 0.05, y + 0.12],
      [x - 0.04, y + 0.04],
    ],
    true,
    0.75,
  );
  return [
    part(ellipseD(x - 0.085, y - 0.04, 0.022, 0.028), shade(coat.face, 0.15), t(0.005)),
    part(ellipseD(x + 0.085, y - 0.04, 0.022, 0.028), shade(coat.face, 0.15), t(0.005)),
    part(ellipseD(x, y - 0.025, 0.085, 0.075), coat.coat, t(0.007)),
    el('path', { d: ellipseD(x - 0.01, y - 0.07, 0.06, 0.025), fill: coat.lit, opacity: 0.6 }),
    el('path', { d: cheeks, fill: shade(coat.lit, 0.25), opacity: 0.85 }),
    ...(open ? [el('path', { d: ellipseD(x, y + 0.15, 0.04, 0.035), fill: '#4E2220' })] : []),
    part(muzzle, coat.face, t(0.006)),
    el('path', {
      d: `M${r2(x)} ${r2(y - 0.035)}L${r2(x)} ${r2(y + 0.11)}`,
      stroke: shade(coat.face, 0.6),
      'stroke-width': t(0.012),
      opacity: 0.7,
      fill: 'none',
      'stroke-linecap': 'round',
    }),
    el('path', { d: ellipseD(x, y + 0.13, 0.04, 0.022), fill: '#141010' }),
    el('path', {
      d:
        ellipseD(x - 0.014, y + 0.135, 0.009, 0.006) + ellipseD(x + 0.014, y + 0.135, 0.009, 0.006),
      fill: '#050303',
    }),
    // Brow band, pale lids, eyes close either side of the nose bridge.
    el('path', {
      d: `M${r2(x - 0.065)} ${r2(y - 0.05)}Q${r2(x)} ${r2(y - 0.075)} ${r2(x + 0.065)} ${r2(y - 0.05)}`,
      stroke: shade(coat.coat, -0.25),
      'stroke-width': t(0.018),
      fill: 'none',
      'stroke-linecap': 'round',
    }),
    el('path', { d: ellipseD(x - 0.03, y - 0.036, 0.018, 0.009), fill: coat.lid }),
    el('path', { d: ellipseD(x + 0.03, y - 0.036, 0.018, 0.009), fill: coat.lid }),
    el('path', { d: ellipseD(x - 0.03, y - 0.027, 0.011, 0.008), fill: '#3A2210' }),
    el('path', { d: ellipseD(x + 0.03, y - 0.027, 0.011, 0.008), fill: '#3A2210' }),
  ];
}

/** Oupa's khaki bush hat (on a head at (x, y), or held). */
function hat(x: number, y: number, k: number): string[] {
  return [
    part(ellipseD(x, y + 0.02 * k, 0.16 * k, 0.035 * k), '#8C6F45', 0.008),
    part(
      smoothD(
        [
          [x - 0.09 * k, y + 0.02 * k],
          [x - 0.08 * k, y - 0.08 * k],
          [x, y - 0.11 * k],
          [x + 0.08 * k, y - 0.08 * k],
          [x + 0.09 * k, y + 0.02 * k],
        ],
        true,
        0.8,
      ),
      '#9C7E50',
      0.008,
    ),
    el('path', {
      d: `M${r2(x - 0.088 * k)} ${r2(y - 0.005 * k)}h${r2(0.176 * k)}`,
      stroke: '#4A3A28',
      'stroke-width': r2(0.03 * k),
      fill: 'none',
    }),
  ];
}

function fruitAt(x: number, y: number, r = 0.05): string[] {
  return [
    part(ellipseD(x, y, r, r * 0.95), '#B8A040', 0.008),
    el('path', {
      d: ellipseD(x - r * 0.35, y - r * 0.35, r * 0.4, r * 0.3),
      fill: '#E2CF78',
      opacity: 0.8,
    }),
    el('path', {
      d: `M${r2(x)} ${r2(y - r)}l0.008 -0.02`,
      stroke: '#4A3A20',
      'stroke-width': 0.008,
      fill: 'none',
    }),
  ];
}

function mielieAt(x: number, y: number): string[] {
  const kernels: string[] = [];
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 2; j++)
      kernels.push(
        el('path', {
          d: ellipseD(x - 0.07 + i * 0.026, y - 0.012 + j * 0.024, 0.011, 0.01),
          fill: '#F0C83C',
          stroke: '#B88E1E',
          'stroke-width': 0.003,
        }),
      );
  return [
    part(ellipseD(x, y, 0.09, 0.034), '#E0B030', 0.008),
    ...kernels,
    part(
      smoothD(
        [
          [x + 0.06, y - 0.03],
          [x + 0.16, y - 0.06],
          [x + 0.13, y],
          [x + 0.17, y + 0.05],
          [x + 0.06, y + 0.03],
        ],
        true,
        0.7,
      ),
      '#8A9A4A',
      0.006,
    ),
  ];
}

/** The baby riding on its mother's back (jockey-style): a small dark body, pink face. */
/** The baby, k × its size (the far troop's are bigger, so they read at 1× on a phone). */
function baby(p: Pose, k = 1): string[] {
  const ax = unit(sub(p.front, p.rear));
  const n = nrm(ax);
  const seat = add(lerpV(p.rear, p.front, 0.4), mul(n, -p.thick * 0.5));
  if (k !== 1)
    return [
      g(
        {
          transform: `translate(${r2(seat[0])} ${r2(seat[1])}) scale(${r2(k)}) translate(${r2(-seat[0])} ${r2(-seat[1])})`,
        },
        ...baby(p),
      ),
    ];
  const c = BABY;
  return [
    part(ellipseD(seat[0], seat[1] - 0.08, 0.1, 0.075), c.coat, 0.008),
    part(
      limbD(
        [
          [seat[0] + 0.02, seat[1] - 0.06],
          [seat[0] + 0.1, seat[1] - 0.02],
          [seat[0] + 0.12, seat[1] + 0.04],
        ],
        0.04,
        0.03,
      ),
      c.coat,
      0.006,
    ),
    part(ellipseD(seat[0] + 0.08, seat[1] - 0.17, 0.065, 0.06), c.coat, 0.008),
    part(ellipseD(seat[0] + 0.12, seat[1] - 0.16, 0.035, 0.03), c.face, 0.006),
    el('path', { d: ellipseD(seat[0] + 0.13, seat[1] - 0.175, 0.008, 0.008), fill: '#1A1210' }),
    part(ellipseD(seat[0] + 0.03, seat[1] - 0.2, 0.02, 0.022), c.face, 0.005),
  ];
}

/** One baboon in `pose` (units: a sitting male's height = 1), facing right, feet at 0. */
export function drawBaboon(p: Pose, coat: Coat, small: boolean, seed: number): string {
  const defs: string[] = [];
  const parts: string[] = [];
  const far = shade(coat.coat, -0.32);
  const w = small ? 0.016 : 0.008;
  const bust = p.bust === true;
  // Limb widths along the limb: a muscular thigh and upper arm, long slim shins and forearms.
  const LEG_FAR = [0.14, 0.08, 0.055, 0.045];
  const LEG_NEAR = [0.16, 0.09, 0.06, 0.05];
  const ARM_FAR = [0.09, 0.06, 0.046];
  const ARM_NEAR = [0.1, 0.066, 0.05];
  // Contact shadow (not while tumbling, nor for a bust behind the ridge's edge).
  if (!bust && (p.spin === undefined || Math.abs(p.spin) < 30)) {
    const xs = [
      ...p.arms.flatMap((a) => a.map((q) => q[0])),
      ...p.legs.flatMap((l) => l.map((q) => q[0])),
    ];
    parts.push(shadow(Math.min(...xs) - 0.05, Math.max(...xs) + 0.05));
  }
  if (p.post === true) {
    parts.push(part('M-0.07 0L-0.06 -0.62L0.08 -0.62L0.09 0Z', '#7A5E3E', 0.01));
    parts.push(
      el('path', {
        d: 'M-0.04 -0.58L-0.03 -0.04M0.04 -0.6L0.05 -0.1',
        stroke: '#5A4430',
        'stroke-width': 0.008,
        fill: 'none',
      }),
    );
  }
  const lift: V = p.post === true ? [0, -0.6] : [0, 0];
  const body: string[] = [];
  const coatLimb = (l: Limb, ws: readonly number[], c: Coat, sd: number): void => {
    const [d, art] = limbCoat(l, ws, c, seed + sd, small);
    defs.push(d);
    body.push(art);
  };
  // Far limbs (shaded), the tail, the torso, near legs, near arm, head.
  const farCoat: Coat = { ...coat, coat: far, lit: coat.coat, dark: shade(coat.dark, -0.2) };
  if (!bust) {
    body.push(part(limbWs(p.legs[0], LEG_FAR), far, w));
    coatLimb(p.legs[0], LEG_FAR, farCoat, 151);
  }
  body.push(part(limbWs(p.arms[0], ARM_FAR), far, w));
  coatLimb(p.arms[0], ARM_FAR, farCoat, 171);
  if (p.tail.length > 1) {
    body.push(part(limbD(p.tail, 0.05, 0.026), coat.coat, w));
    // The lit top of the tail's rising base.
    body.push(
      el('path', {
        d: smoothD(p.tail.slice(0, 3), false, 0.6),
        stroke: coat.lit,
        'stroke-width': small ? 0.014 : 0.01,
        fill: 'none',
        opacity: 0.45,
        'stroke-linecap': 'round',
      }),
    );
  }
  const tclip = clipOf([torsoD(p)]);
  defs.push(tclip.def);
  body.push(part(torsoD(p), coat.coat, w));
  // Belly shade and lit back (washes inside the torso).
  const ys = [p.rear[1], p.front[1]];
  const box = {
    x0: Math.min(p.rear[0], p.front[0]) - p.thick,
    x1: Math.max(p.rear[0], p.front[0]) + p.thick,
    y0: Math.min(...ys) - p.thick,
    y1: Math.max(...ys) + p.thick,
  };
  const gid = nextId();
  defs.push(
    el(
      'linearGradient',
      { id: gid, gradientUnits: 'userSpaceOnUse', x1: 0, y1: r2(box.y0), x2: 0, y2: r2(box.y1) },
      el('stop', { offset: 0, 'stop-color': shade(coat.lit, 0.15), 'stop-opacity': 0.95 }),
      el('stop', { offset: 0.3, 'stop-color': coat.lit, 'stop-opacity': 0.55 }),
      el('stop', { offset: 0.5, 'stop-color': coat.coat, 'stop-opacity': 0 }),
      el('stop', { offset: 0.72, 'stop-color': coat.belly, 'stop-opacity': 0.7 }),
      el('stop', { offset: 1, 'stop-color': coat.dark, 'stop-opacity': 0.9 }),
    ),
  );
  body.push(
    g(
      { 'clip-path': `url(#${tclip.id})` },
      el('rect', {
        x: r2(box.x0),
        y: r2(box.y0),
        width: r2(box.x1 - box.x0),
        height: r2(box.y1 - box.y0),
        fill: `url(#${gid})`,
      }),
    ),
  );
  body.push(fur(tclip.id, box, coat, seed, small ? 1.4 : 0.65));
  if (p.sit === true || p.back === true) {
    // The pink-grey sitting pad (ischial callosity) at the rump.
    const big = p.back === true && !bust;
    if (!bust)
      body.push(
        el('path', {
          d: ellipseD(
            p.rear[0] - (big ? 0.12 : 0.08),
            p.rear[1] + 0.08,
            big ? 0.07 : 0.05,
            big ? 0.06 : 0.04,
          ),
          fill: big ? '#B88A84' : coat.pad,
          opacity: big ? 1 : 0.6,
        }),
      );
  }
  if (!bust) {
    body.push(part(limbWs(p.legs[1], LEG_NEAR), coat.coat, w));
    coatLimb(p.legs[1], LEG_NEAR, coat, 101);
    const toe = p.legs[1][p.legs[1].length - 1] ?? [0, 0];
    body.push(part(ellipseD(toe[0] + 0.012, toe[1] - 0.016, 0.065, 0.018), coat.hand, w));
    if (!small) body.push(digits(toe[0] + 0.03, toe[1] - 0.016, 0.045, 0.017, coat));
    const toeF = p.legs[0][p.legs[0].length - 1] ?? [0, 0];
    body.push(
      part(ellipseD(toeF[0] + 0.01, toeF[1] - 0.016, 0.058, 0.017), shade(coat.hand, -0.1), w),
    );
  }
  if (p.baby === true) body.push(...baby(p, small ? 1.45 : 1));
  const nearArm = (): void => {
    body.push(part(limbWs(p.arms[1], ARM_NEAR), coat.coat, w));
    coatLimb(p.arms[1], ARM_NEAR, coat, 131);
  };
  // A bust's near arm goes down behind the cape (only its top shows above the edge).
  if (bust) nearArm();
  // A sloping muscular neck joins the shoulders to the skull in every pose.
  const neckW = p.mane === true ? 0.23 : 0.17;
  body.push(
    part(limbD([p.front, lerpV(p.front, p.head, 0.55), p.head], neckW, 0.14), coat.coat, w),
  );
  const neckClip = clipOf([limbD([p.front, p.head], neckW, 0.14)]);
  defs.push(neckClip.def);
  body.push(
    fur(
      neckClip.id,
      {
        x0: Math.min(p.front[0], p.head[0]) - 0.12,
        x1: Math.max(p.front[0], p.head[0]) + 0.12,
        y0: Math.min(p.front[1], p.head[1]) - 0.12,
        y1: Math.max(p.front[1], p.head[1]) + 0.12,
      },
      coat,
      seed + 53,
      0.55,
    ),
  );
  if (p.mane === true) body.push(...mane(p, coat, small, seed));
  if (p.babyPeek === true) body.push(...babyHead([-0.085, -0.3], small));
  // Head before the near arm (a hand to the mouth sits in front of the face).
  if (p.back === true) body.push(...faceOn(p.head, coat, p.open === true, small));
  else body.push(...headParts(p, coat, small));
  if (!bust) {
    nearArm();
    const hand = p.arms[1][p.arms[1].length - 1] ?? [0, 0];
    // A hand on the ground lies flat, fingers forward; a raised one is a loose fist.
    const flat = (q: V): [number, number, number, number] =>
      q[1] > -0.03 ? [q[0] + 0.018, q[1] - 0.014, 0.046, 0.017] : [q[0], q[1], 0.038, 0.026];
    const [hx0, hy0, hrx, hry] = flat(hand);
    body.push(part(ellipseD(hx0, hy0, hrx, hry), coat.hand, w));
    if (!small) body.push(digits(hx0, hy0, hrx, hry, coat));
    const handF = p.arms[0][p.arms[0].length - 1] ?? [0, 0];
    const [fx0, fy0, frx, fry] = flat(handF);
    body.push(part(ellipseD(fx0, fy0, frx * 0.95, fry * 0.95), shade(coat.hand, -0.1), w));
    if (p.item === 'fruit' || p.item === 'throwFruit')
      body.push(...fruitAt(hand[0] + 0.02, hand[1] - 0.04));
    if (p.item === 'mielie') body.push(...mielieAt(hand[0], hand[1] - 0.03));
    if (p.item === 'hat') body.push(...hat(hand[0], hand[1] - 0.02, 0.8));
    if (p.water === true) body.push(...waterAt(hand[0] + 0.04, hand[1] + 0.02));
  }
  let fig = g({ transform: `translate(${r2(lift[0])} ${r2(lift[1])})` }, ...body);
  if (p.spin !== undefined) {
    const c: V = [(p.rear[0] + p.front[0]) / 2, (p.rear[1] + p.front[1]) / 2];
    fig = g({ transform: `rotate(${r2(p.spin)} ${r2(c[0])} ${r2(c[1])})` }, fig);
  }
  if (bust) {
    // Cut flat at the ridge's edge (the origin row).
    const cut = nextId();
    defs.push(el('clipPath', { id: cut }, el('rect', { x: -2, y: -2, width: 4, height: 2 })));
    fig = g({ 'clip-path': `url(#${cut})` }, fig);
  }
  parts.push(fig);
  return g({}, el('defs', {}, ...defs), ...parts);
}

/** The male's cape (maneD): longer, lighter hair than the coat, lit over the shoulders, laid
 *  back in long strands that hang over the hem (no hard edge: it is hair over hair). */
function mane(p: Pose, coat: Coat, small: boolean, seed: number): string[] {
  const d = maneD(p, small);
  const clip = clipOf([d]);
  const sh = p.front;
  const gid = nextId();
  const y0 = Math.min(sh[1], p.head[1]) - 0.15;
  const y1 = sh[1] + 0.25;
  const out: string[] = [
    el(
      'defs',
      {},
      clip.def,
      el(
        'linearGradient',
        { id: gid, gradientUnits: 'userSpaceOnUse', x1: 0, y1: r2(y0), x2: 0, y2: r2(y1) },
        el('stop', { offset: 0, 'stop-color': coat.lit }),
        el('stop', { offset: 0.4, 'stop-color': coat.coat }),
        el('stop', { offset: 1, 'stop-color': shade(coat.coat, -0.2) }),
      ),
    ),
    el('path', {
      d,
      fill: `url(#${gid})`,
      opacity: 0.95,
    }),
  ];
  // Strands: from the neck and shoulders, back and down.
  const back = unit(sub(p.rear, p.front));
  const lit: string[] = [];
  const dk: string[] = [];
  const rnd = prng(seed + 7);
  const n = small ? 14 : 70;
  for (let i = 0; i < n; i++) {
    const t = rnd();
    const base = lerpV(lerpV(sh, p.head, 0.55), lerpV(sh, p.rear, 0.3), t);
    const x = base[0] + (rnd() - 0.5) * 0.14;
    const y = base[1] + (rnd() - 0.5) * 0.2;
    const len = 0.07 + rnd() * 0.07;
    const sd = `M${r2(x)} ${r2(y)}q${r2(back[0] * len * 0.6)} ${r2(back[1] * len * 0.6)} ${r2(back[0] * len)} ${r2(back[1] * len + len * 0.5)}`;
    (y < sh[1] - 0.03 && rnd() < 0.7 ? lit : dk).push(sd);
  }
  out.push(
    g(
      { 'clip-path': `url(#${clip.id})` },
      el('path', {
        d: dk.join(''),
        stroke: shade(coat.coat, -0.35),
        'stroke-width': small ? 0.014 : 0.006,
        fill: 'none',
        opacity: 0.6,
        'stroke-linecap': 'round',
      }),
      el('path', {
        d: lit.join(''),
        stroke: shade(coat.lit, 0.15),
        'stroke-width': small ? 0.012 : 0.005,
        fill: 'none',
        opacity: 0.7,
        'stroke-linecap': 'round',
      }),
    ),
  );
  return out;
}

/** v1.16 (D-078): a baby's head peeking over its mother's shoulder: dark fur, the pink face and
 *  big ears of a young chacma, looking out the same way she does. */
function babyHead(at: V, small: boolean): string[] {
  const c = BABY;
  const [x, y] = at;
  const k = small ? 1.15 : 1;
  const r = 0.055 * k;
  return [
    part(ellipseD(x - r * 0.7, y - r * 0.5, r * 0.42, r * 0.5), c.face, small ? 0.01 : 0.005),
    part(ellipseD(x, y, r, r * 0.95), c.coat, small ? 0.012 : 0.006),
    part(ellipseD(x + r * 0.6, y + r * 0.15, r * 0.6, r * 0.5), c.face, small ? 0.01 : 0.005),
    el('path', { d: ellipseD(x + r * 0.4, y - r * 0.2, r * 0.2, r * 0.18), fill: '#1A1210' }),
    el('path', { d: ellipseD(x + r * 1.1, y + r * 0.2, r * 0.12, r * 0.1), fill: '#5A3A34' }),
    // A small dark hand gripping her shoulder.
    part(ellipseD(x + r * 0.9, y + r * 1.25, r * 0.38, r * 0.26), c.coat, small ? 0.01 : 0.005),
  ];
}

/** A soft contact shadow under the feet (units). */
function shadow(x0: number, x1: number): string {
  const id = nextId();
  return (
    el(
      'radialGradient',
      { id },
      el('stop', { offset: 0, 'stop-color': '#2A1E14', 'stop-opacity': 0.4 }),
      el('stop', { offset: 1, 'stop-color': '#2A1E14', 'stop-opacity': 0 }),
    ) + el('path', { d: ellipseD((x0 + x1) / 2, 0, (x1 - x0) / 2, 0.035), fill: `url(#${id})` })
  );
}

function waterAt(x: number, y: number): string[] {
  return [
    el('path', {
      d: `M${r2(x)} ${r2(y)}q0.18 -0.06 0.26 0.24`,
      stroke: '#BFE0EE',
      'stroke-width': 0.035,
      fill: 'none',
      opacity: 0.85,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: `M${r2(x)} ${r2(y)}q0.18 -0.06 0.26 0.24`,
      stroke: '#F4FBFF',
      'stroke-width': 0.012,
      fill: 'none',
    }),
  ];
}

/** v1.8b (screenshot review round 1): the far troop in darker, warmer fur, so it stands out from
 *  the pale haze of the far ridge at 1× on a phone (same look, more value contrast). */
const FAR_MALE: Coat = {
  ...MALE,
  coat: '#5C4936',
  lit: '#7C6448',
  dark: '#382A1E',
  belly: '#6E5C48',
  face: '#3A302C',
  hand: '#201A16',
};
const FAR_MOTHER: Coat = { ...FAR_MALE, coat: '#65513C', lit: '#86704F', belly: '#776450' };

function coatOf(frame: BaboonFrame): Coat {
  const far = frame.startsWith('r_');
  if (frame.startsWith('r_mother')) return far ? FAR_MOTHER : MOTHER;
  return far ? FAR_MALE : MALE;
}

/** The rock outcrop under a troop (ridge px at 1×, base middle at 0): a weathered granite dome
 *  with boulder knobs, lit from the upper left, a few cracks, grass at its foot (troopRock.ts). */
function rockArt(): string {
  const top: [number, number][] = [];
  for (let dx = -ROCK_HALF_W; dx <= ROCK_HALF_W; dx += 6) top.push([dx, rockTop(dx)]);
  const outline = smoothD([[-ROCK_HALF_W - 4, 2], ...top, [ROCK_HALF_W + 4, 2]], true, 0.6);
  const gid = nextId();
  const clip = clipOf([outline]);
  const rnd = prng(77);
  const cracks: string[] = [];
  for (let i = 0; i < 9; i++) {
    const x = -ROCK_HALF_W * 0.8 + rnd() * ROCK_HALF_W * 1.6;
    const y0 = rockTop(x) + 6;
    cracks.push(
      `M${r2(x)} ${r2(y0)}q${r2(rnd() * 8 - 4)} ${r2(10 + rnd() * 10)} ${r2(rnd() * 6 - 3)} ${r2(22 + rnd() * 18)}`,
    );
  }
  const grass: string[] = [];
  for (let i = 0; i < 26; i++) {
    const x = -ROCK_HALF_W + rnd() * ROCK_HALF_W * 2;
    grass.push(`M${r2(x)} 2l${r2(rnd() * 4 - 2)} ${r2(-4 - rnd() * 7)}`);
  }
  return g(
    {},
    el(
      'defs',
      {},
      el(
        'linearGradient',
        { id: gid, x1: 0, y1: 0, x2: 0.4, y2: 1 },
        el('stop', { offset: 0, 'stop-color': '#9C9484' }),
        el('stop', { offset: 0.55, 'stop-color': '#7E786A' }),
        el('stop', { offset: 1, 'stop-color': '#5E5A50' }),
      ),
      clip.def,
    ),
    el('path', { d: outline, fill: `url(#${gid})`, stroke: '#57534A', 'stroke-width': 1.2 }),
    // The shaded right flank and the lit crest.
    g(
      { 'clip-path': `url(#${clip.id})` },
      el('path', {
        d: ellipseD(ROCK_HALF_W * 0.55, -ROCK_H * 0.2, ROCK_HALF_W * 0.6, ROCK_H * 0.9),
        fill: '#4A463E',
        opacity: 0.35,
      }),
      el('path', {
        d: ellipseD(-ROCK_HALF_W * 0.25, -ROCK_H * 0.85, ROCK_HALF_W * 0.55, ROCK_H * 0.22),
        fill: '#B4AC9A',
        opacity: 0.45,
      }),
      el('path', {
        d: cracks.join(''),
        stroke: '#4E4A42',
        'stroke-width': 1.1,
        fill: 'none',
        opacity: 0.7,
      }),
    ),
    el('path', {
      d: grass.join(''),
      stroke: '#6E7A4E',
      'stroke-width': 1.3,
      fill: 'none',
      'stroke-linecap': 'round',
    }),
  );
}

/** One frame's drawing in design px (feet at 0). */
export function drawFrame(frame: BaboonFrame, seed: number): string {
  if (frame === 'r_rock') return rockArt();
  if (frame === 'fx_fruit') return g({ transform: `scale(${RAIDER_H})` }, ...fruitAt(0, 0, 0.055));
  if (frame === 'fx_water') {
    // A few drops and a splash arc.
    const k = RAIDER_H;
    return g(
      { transform: `scale(${k})` },
      el('path', {
        d: 'M0 0q0.16 -0.04 0.3 0.2',
        stroke: '#BFE0EE',
        'stroke-width': 0.03,
        fill: 'none',
        opacity: 0.8,
      }),
      ...[0.1, 0.18, 0.26, 0.34].map((x, i) =>
        el('path', {
          d: ellipseD(x, 0.06 + i * 0.04, 0.012, 0.016),
          fill: '#D8EEF6',
          opacity: 0.85,
        }),
      ),
    );
  }
  const ridge = frame.startsWith('r_');
  const k = ridge ? RIDGE_H : RAIDER_H;
  return g({ transform: `scale(${k})` }, drawBaboon(POSES[frame], coatOf(frame), ridge, seed));
}

/** A frame's fur seed (stable whatever the packing order). */
export function frameSeed(name: string): number {
  let h = 101;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 9973;
  return h;
}

/** The sheet at `k` texture px per design px (2: the delivered master). */
export function renderBaboonSheet(k: number): Rgba {
  const cells = baboonFrames().map((f) => {
    const id = nextId();
    return g(
      {},
      el('clipPath', { id }, el('rect', { x: f.x, y: f.y, width: f.w, height: f.h })),
      g(
        { 'clip-path': `url(#${id})` },
        g(
          { transform: `translate(${r2(f.x + f.ox)} ${r2(f.y + f.oy)})` },
          drawFrame(f.name, frameSeed(f.name)),
        ),
      ),
    );
  });
  return renderSvg(
    svgDoc(
      BABOON_SHEET_W * k,
      BABOON_SHEET_H * k,
      [0, 0, BABOON_SHEET_W, BABOON_SHEET_H],
      '',
      g({}, ...cells),
    ),
  );
}
