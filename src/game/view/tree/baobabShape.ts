// 1.9.4 (D-057, art bible §4.2c) The Bushveld baobab's shape: its main limbs, its hollows, the
// buffalo weavers' stick nests and the squirrel's run, in prop px (the prop's position on the mid
// layer is (0, 0); the foot is at y 260). Pure constants and small curve helpers: the interim art
// (tools/art/baobab.ts) draws the tree through these points, and the residents' view
// (BaobabLifeView) puts its sprites on the same points, so a hole in the bark and the bushbaby
// that peeks out of it always line up.

export type BPt = readonly [number, number];

/** One of the main limbs: a cubic curve from inside the trunk's top to its tip, and its width. */
export interface BaobabLimb {
  readonly p0: BPt;
  readonly c1: BPt;
  readonly c2: BPt;
  readonly p1: BPt;
  /** Width at the base (where it leaves the trunk) and at the tip. */
  readonly w0: number;
  readonly w1: number;
}

/** The foot (ground line) and the trunk's half-widths: at the foot (with the buttress flare), at
 *  the waist (the narrowest point) and at the shoulder, where the limbs leave it. */
export const TRUNK = {
  foot: 260,
  footHalf: 128,
  baseHalf: 96,
  waistY: 30,
  waistHalf: 80,
  shoulderY: -34,
  shoulderHalf: 104,
} as const;

/**
 * Six main limbs, left to right, splaying up like roots. The content's perches (bushveld-winter
 * baobab: (−124, −214), (158, −252)) are branch tips the art adds; the secret pod cluster hangs
 * under limb 4 at (110, −120).
 */
export const BAOBAB_LIMBS: readonly BaobabLimb[] = [
  { p0: [-62, -6], c1: [-130, -30], c2: [-190, -80], p1: [-246, -184], w0: 54, w1: 6 },
  { p0: [-40, -22], c1: [-80, -80], c2: [-100, -170], p1: [-160, -262], w0: 48, w1: 6 },
  { p0: [-14, -30], c1: [-26, -110], c2: [-6, -190], p1: [-46, -290], w0: 40, w1: 6 },
  { p0: [18, -30], c1: [40, -100], c2: [18, -180], p1: [54, -268], w0: 42, w1: 6 },
  { p0: [42, -18], c1: [96, -70], c2: [110, -190], p1: [178, -262], w0: 52, w1: 6 },
  { p0: [62, -4], c1: [140, -24], c2: [200, -90], p1: [250, -182], w0: 50, w1: 6 },
];

/** A point on a limb at t ∈ [0, 1]. */
export function limbAt(l: BaobabLimb, t: number): BPt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * l.p0[0] + b * l.c1[0] + c * l.c2[0] + d * l.p1[0],
    a * l.p0[1] + b * l.c1[1] + c * l.c2[1] + d * l.p1[1],
  ];
}

/** A limb's width at t (eased taper: it stays thick for a while, then thins). */
export function limbWidth(l: BaobabLimb, t: number): number {
  const k = Math.pow(t, 0.8);
  return l.w0 + (l.w1 - l.w0) * k;
}

/** The limb's direction at t (unit vector along it, base → tip). */
export function limbDir(l: BaobabLimb, t: number): BPt {
  const e = 0.01;
  const a = limbAt(l, Math.max(0, t - e));
  const b = limbAt(l, Math.min(1, t + e));
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
}

/** The upper surface of a limb at t (where something sits on it): the centre line moved up by
 *  half the width along the normal that points up. */
export function limbTop(l: BaobabLimb, t: number): BPt {
  const p = limbAt(l, t);
  const d = limbDir(l, t);
  // The two normals; the one with the smaller y points up.
  let nx = -d[1];
  let ny = d[0];
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const h = limbWidth(l, t) / 2;
  return [p[0] + nx * h, p[1] + ny * h];
}

export type HollowId = 'owl' | 'galago' | 'squirrel' | 'slit' | 'bees';

/** A hollow: its opening's centre and radii (prop px). */
export interface Hollow {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
}

const SQUIRREL_LIMB = 1;
// Review T1: the squirrel's hole sits high up limb 2, the bushbaby's small and low on the
// trunk's right side, so the holes never line up into a "face" with the owl's cavity.
const SQUIRREL_T = 0.52;

function onLimb(i: number, t: number, rx: number, ry: number): Hollow {
  const l = BAOBAB_LIMBS[i];
  if (l === undefined) throw new Error(`no limb ${i}`);
  const p = limbAt(l, t);
  return { x: Math.round(p[0] * 10) / 10, y: Math.round(p[1] * 10) / 10, rx, ry };
}

/**
 * The hollows: a big cavity in the trunk (the barn owl's), a small hole high on the trunk (the
 * bushbaby's), a hole in limb 2 (the squirrel's), the hornbill's sealed slit low on the trunk's
 * shade side, and a crack the wild bees use.
 */
export const HOLLOWS: Readonly<Record<HollowId, Hollow>> = {
  owl: { x: -44, y: 118, rx: 19, ry: 25 },
  // Review R1: a visible opening a bit wider than the bushbaby's head, well inside the trunk.
  galago: { x: 50, y: 44, rx: 12, ry: 13 },
  squirrel: onLimb(SQUIRREL_LIMB, SQUIRREL_T, 7, 8.5),
  slit: { x: 34, y: 168, rx: 2.4, ry: 13 },
  bees: { x: -74, y: 200, rx: 3.5, ry: 6 },
};

/** The squirrel's run: from its hole up limb 2 (along the top of the limb) and back. */
export function squirrelPath(n = 12): BPt[] {
  const l = BAOBAB_LIMBS[SQUIRREL_LIMB];
  if (l === undefined) return [];
  const out: BPt[] = [];
  for (let i = 0; i <= n; i++) out.push(limbTop(l, SQUIRREL_T + (i / n) * 0.36));
  return out;
}

/** The red-billed buffalo weavers' untidy stick nests: on top of limbs 1 and 6 (the bird lands
 *  at the entrance, the nest's lower front). */
export const STICK_NESTS: readonly { x: number; y: number; w: number; h: number }[] = [
  nestOn(0, 0.62, 46, 30),
  nestOn(5, 0.66, 42, 28),
];

function nestOn(
  i: number,
  t: number,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } {
  const l = BAOBAB_LIMBS[i];
  if (l === undefined) throw new Error(`no limb ${i}`);
  const p = limbTop(l, t);
  return { x: Math.round(p[0]), y: Math.round(p[1] - h * 0.32), w, h };
}

/** The secret pod cluster (content: ellipse 22 × 34 at (110, −120)) hangs from limb 5 here. */
export const POD_CLUSTER = { limb: 4, t: 0.47, x: 110, y: -120 } as const;
