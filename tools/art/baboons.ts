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
import type { Rgba } from '../assets/image';
import { add, clipOf, limb, mul, sub, unit, nrm, type V } from './farFauna';
import { renderSvg } from './raster';
import { nextId, shade } from './scenery';
import { el, ellipseD, g, prng, r2, smoothD, svgDoc } from './svg';

type Attrs = Record<string, string | number>;

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
  coat: '#776650',
  lit: '#9A8869',
  dark: '#4B3F31',
  belly: '#8F8372',
  face: '#4A403C',
  hand: '#2C2723',
  lid: '#CDBFAF',
  pad: '#9A7A74',
};
const MOTHER: Coat = { ...MALE, coat: '#7E6E58', lit: '#A29174', belly: '#978B7A' };
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
    head: [0.37 + (run ? 0.03 : 0), y(run ? -0.68 : -0.71) + 0.01 * s],
    muzzle: run ? 24 : 34,
    open,
    arms: [arm(fFar, shoulder), arm(fNear, shoulder)],
    legs: [leg(hFar, hip), leg(hNear, hip)],
    // The "broken" tail: up from the rump, a sharp bend, then hanging (streams back running).
    tail: run
      ? [
          [-0.47, y(-0.66)],
          [-0.56, y(-0.78)],
          [-0.66, y(-0.78)],
          [-0.74, y(-0.62)],
        ]
      : [
          [-0.47, y(-0.66)],
          [-0.53, y(-0.8)],
          [-0.6, y(-0.8)],
          [-0.63, y(-0.5)],
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

export const POSES: Readonly<Record<Exclude<BaboonFrame, 'fx_fruit' | 'fx_water'>, Pose>> = {
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
  r_sit: sitPose({}),
  r_groom: sitPose({
    hands: [
      [0.3, -0.5],
      [0.36, -0.56],
    ],
    muzzle: 44,
    lean: 0.06,
  }),
  r_look: { ...walkPose(0), head: [0.44, -0.84], muzzle: 6 },
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
    muzzle: 6,
    open: true,
  },
  r_walk_a: walkPose(0),
  r_walk_b: walkPose(Math.PI),
  r_play_a: {
    ...sitPose({
      hands: [
        [0.3, -0.62],
        [0.36, -0.78],
      ],
      open: true,
    }),
    mane: false,
  },
  r_play_b: { ...walkPose(Math.PI / 2, true), spin: -16, mane: false },
  r_mother_sit: { ...sitPose({}), baby: true, mane: false },
  r_mother_walk_a: { ...walkPose(0), baby: true, mane: false },
  r_mother_walk_b: { ...walkPose(Math.PI), baby: true, mane: false },
  r_down: { ...walkPose(Math.PI / 2), spin: 24 },
  r_up: { ...walkPose(0), spin: -22 },
};

// --- drawing -------------------------------------------------------------------------------

const edge = (c: string): string => shade(c, -0.42);

function part(d: string, fillC: string, w: number, extra: Attrs = {}): string {
  return el('path', {
    d,
    fill: fillC,
    stroke: edge(fillC),
    'stroke-width': r2(w),
    'stroke-linejoin': 'round',
    ...extra,
  });
}

/** The torso as one smooth outline round the rump and shoulder ends (with the male's mane). */
function torsoD(p: Pose): string {
  const ax = unit(sub(p.front, p.rear));
  const n = nrm(ax);
  const t = p.thick / 2;
  const back = (k: number, w: number): V => add(add(p.rear, mul(ax, k)), mul(n, -w));
  const len = Math.hypot(p.front[0] - p.rear[0], p.front[1] - p.rear[1]);
  const pts: V[] = [
    add(p.rear, mul(ax, -t * 0.9)),
    back(len * 0.05, t * 0.95),
    back(len * 0.45, t * 0.92),
    back(len * 0.85, t * (p.mane === true ? 1.18 : 1.0)),
    add(p.front, mul(ax, t * 0.6)),
    back(len * 0.85, -t * 0.82),
    back(len * 0.5, -t * 0.78),
    back(len * 0.1, -t * 0.9),
  ];
  return smoothD(pts, true, 0.9);
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
  for (let i = 0; i < Math.min(n, 160); i++) {
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
        'stroke-width': 0.008,
        'stroke-linecap': 'round',
        opacity: r2(0.55 + rnd() * 0.3),
        fill: 'none',
      }),
    );
  }
  return g({ 'clip-path': `url(#${clip})` }, ...strokes);
}

function limbD(l: Limb, w0: number, w1: number): string {
  const n = l.length;
  return limb(
    l.map((p, i) => ({ p, w: w0 + ((w1 - w0) * i) / Math.max(1, n - 1) })),
    0.8,
  );
}

function headParts(p: Pose, coat: Coat, small: boolean): string[] {
  const [hx, hy] = p.head;
  const r = 0.115;
  const a = (p.muzzle * Math.PI) / 180;
  const dir: V = [Math.cos(a), Math.sin(a)];
  const tip: V = [hx + dir[0] * 0.2, hy + dir[1] * 0.2];
  const nn = nrm(dir);
  const out: string[] = [];
  // Ear (small, behind the brow).
  out.push(part(ellipseD(hx - 0.07, hy - 0.06, 0.03, 0.036), coat.dark, 0.006));
  // Skull and cheek.
  out.push(part(ellipseD(hx - 0.01, hy, r, r * 0.92), coat.coat, 0.008));
  out.push(
    el('path', {
      d: ellipseD(hx - 0.03, hy - 0.05, r * 0.7, r * 0.42),
      fill: coat.lit,
      opacity: 0.55,
    }),
  );
  // The long dark muzzle (a tapered snout), the nostrils at its tip.
  // nn points down-and-back from the muzzle line (the jaw side); −nn is the nose's top.
  const m0a = add([hx + dir[0] * 0.02, hy + dir[1] * 0.02], mul(nn, -0.072));
  const m0b = add([hx + dir[0] * 0.0, hy + dir[1] * 0.0], mul(nn, 0.075));
  const m1a = add(tip, mul(nn, -0.036));
  const m1b = add(tip, mul(nn, 0.034));
  const jaw = p.open === true ? 0.05 : 0;
  out.push(
    part(
      smoothD(
        [
          m0a,
          lerpV(m0a, m1a, 0.55),
          m1a,
          add(tip, mul(dir, 0.026)),
          m1b,
          add(lerpV(m0b, m1b, 0.5), mul(nn, jaw)),
          m0b,
        ],
        true,
        0.85,
      ),
      coat.face,
      0.007,
    ),
  );
  // The nose ridge's light and the cheek's shadow.
  out.push(
    el('path', {
      d: smoothD([add(m0a, mul(nn, 0.018)), add(m1a, mul(nn, 0.014))], false, 0.6),
      stroke: shade(coat.face, 0.45),
      'stroke-width': 0.016,
      fill: 'none',
      opacity: 0.55,
      'stroke-linecap': 'round',
    }),
  );
  if (p.open === true) {
    // An open mouth: the gape, and (males) a canine.
    const g0 = add(lerpV(m0b, m1b, 0.25), mul(nn, -0.01));
    const g1 = add(m1b, mul(nn, -0.012));
    out.push(
      el('path', {
        d: smoothD([g0, g1, add(g1, mul(nn, jaw * 0.9)), add(g0, mul(nn, jaw))], true, 0.6),
        fill: '#5A2A26',
      }),
    );
    if (!small)
      out.push(
        el('path', {
          d: `M${r2(g1[0] - 0.03)} ${r2(g1[1])}l0.006 0.03l0.008 -0.03z`,
          fill: '#EDE4D2',
        }),
      );
  }
  out.push(
    el('path', {
      d: ellipseD(tip[0] - dir[0] * 0.004, tip[1] - 0.012, 0.012, 0.009),
      fill: '#1A1614',
    }),
  );
  // Brow ridge, pale eyelid, the eye.
  const ex = hx + dir[0] * 0.04 + 0.01;
  const ey = hy - 0.025;
  out.push(
    el('path', {
      d: smoothD(
        [
          [ex - 0.05, ey - 0.03],
          [ex + 0.02, ey - 0.045],
          [ex + 0.05, ey - 0.02],
        ],
        false,
        0.6,
      ),
      stroke: shade(coat.coat, -0.3),
      'stroke-width': 0.016,
      fill: 'none',
      'stroke-linecap': 'round',
    }),
  );
  if (p.shut === true)
    out.push(
      el('path', {
        d: `M${r2(ex - 0.022)} ${r2(ey)}l0.04 0.004`,
        stroke: coat.lid,
        'stroke-width': 0.01,
        fill: 'none',
      }),
    );
  else {
    out.push(el('path', { d: ellipseD(ex, ey, 0.024, 0.016), fill: coat.lid }));
    out.push(el('path', { d: ellipseD(ex + 0.006, ey + 0.004, 0.011, 0.011), fill: '#2A1A10' }));
    if (!small)
      out.push(el('path', { d: ellipseD(ex + 0.002, ey, 0.004, 0.004), fill: '#F2E8D8' }));
  }
  if (p.hatOn === true) out.push(...hat(hx - 0.01, hy - r * 0.8, 1));
  return out;
}

const lerpV = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** The head turned to look at the player over its shoulder (the moon): the face seen from the
 *  front, the muzzle a dark rounded snout pointing out at us. */
function faceOn(h: V, coat: Coat, open: boolean): string[] {
  const [x, y] = h;
  return [
    part(ellipseD(x - 0.09, y - 0.05, 0.03, 0.035), coat.dark, 0.006),
    part(ellipseD(x + 0.09, y - 0.05, 0.03, 0.035), coat.dark, 0.006),
    part(ellipseD(x, y, 0.115, 0.11), coat.coat, 0.008),
    el('path', { d: ellipseD(x - 0.02, y - 0.05, 0.08, 0.04), fill: coat.lit, opacity: 0.5 }),
    el('path', { d: ellipseD(x - 0.04, y - 0.03, 0.022, 0.015), fill: coat.lid }),
    el('path', { d: ellipseD(x + 0.04, y - 0.03, 0.022, 0.015), fill: coat.lid }),
    el('path', { d: ellipseD(x - 0.04, y - 0.026, 0.01, 0.01), fill: '#2A1A10' }),
    el('path', { d: ellipseD(x + 0.04, y - 0.026, 0.01, 0.01), fill: '#2A1A10' }),
    part(ellipseD(x, y + 0.045, 0.05, 0.065), coat.face, 0.007),
    el('path', { d: ellipseD(x - 0.014, y + 0.08, 0.01, 0.007), fill: '#1A1614' }),
    el('path', { d: ellipseD(x + 0.014, y + 0.08, 0.01, 0.007), fill: '#1A1614' }),
    ...(open ? [el('path', { d: ellipseD(x, y + 0.1, 0.025, 0.014), fill: '#5A2A26' })] : []),
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
function baby(p: Pose): string[] {
  const ax = unit(sub(p.front, p.rear));
  const n = nrm(ax);
  const seat = add(lerpV(p.rear, p.front, 0.4), mul(n, -p.thick * 0.5));
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
  const far = shade(coat.coat, -0.18);
  const w = small ? 0.016 : 0.008;
  // Contact shadow (not while tumbling).
  if (p.spin === undefined || Math.abs(p.spin) < 30) {
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
  // Far limbs (shaded), the tail, the torso, near legs, near arm, head.
  body.push(part(limbD(p.legs[0], 0.11, 0.05), far, w));
  body.push(part(limbD(p.arms[0], 0.085, 0.05), far, w));
  const tail = p.tail;
  body.push(part(limbD(tail, 0.05, 0.03), coat.coat, w));
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
      el('stop', { offset: 0, 'stop-color': coat.lit, 'stop-opacity': 0.75 }),
      el('stop', { offset: 0.45, 'stop-color': coat.coat, 'stop-opacity': 0 }),
      el('stop', { offset: 0.75, 'stop-color': coat.belly, 'stop-opacity': 0.5 }),
      el('stop', { offset: 1, 'stop-color': coat.dark, 'stop-opacity': 0.7 }),
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
  if (!small) body.push(fur(tclip.id, box, coat, seed, 1));
  if (p.mane === true) {
    // The male's rougher shoulder cape: darker strokes over the shoulders.
    const sh = p.front;
    const strokes: string[] = [];
    const rnd = prng(seed + 7);
    for (let i = 0; i < (small ? 6 : 22); i++) {
      const x = sh[0] - 0.16 + rnd() * 0.22;
      const y = sh[1] - 0.12 + rnd() * 0.16;
      strokes.push(`M${r2(x)} ${r2(y)}l${r2(-0.03 - rnd() * 0.03)} ${r2(0.02 + rnd() * 0.03)}`);
    }
    body.push(
      el('path', {
        d: strokes.join(''),
        stroke: shade(coat.coat, -0.25),
        'stroke-width': small ? 0.02 : 0.012,
        fill: 'none',
        'stroke-linecap': 'round',
        opacity: 0.7,
        'clip-path': `url(#${tclip.id})`,
      }),
    );
  }
  if (p.sit === true || p.back === true) {
    // The pink-grey sitting pad (ischial callosity) at the rump.
    const big = p.back === true;
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
  body.push(part(limbD(p.legs[1], 0.13, 0.055), coat.coat, w));
  const toe = p.legs[1][p.legs[1].length - 1] ?? [0, 0];
  body.push(part(ellipseD(toe[0], toe[1] - 0.018, 0.055, 0.022), coat.hand, w));
  const toeF = p.legs[0][p.legs[0].length - 1] ?? [0, 0];
  body.push(part(ellipseD(toeF[0], toeF[1] - 0.018, 0.05, 0.02), shade(coat.hand, -0.1), w));
  if (p.baby === true) body.push(...baby(p));
  // Head before the near arm (a hand to the mouth sits in front of the face).
  if (p.back === true) body.push(...faceOn(p.head, coat, p.open === true));
  else body.push(...headParts(p, coat, small));
  body.push(part(limbD(p.arms[1], 0.1, 0.055), coat.coat, w));
  const hand = p.arms[1][p.arms[1].length - 1] ?? [0, 0];
  body.push(part(ellipseD(hand[0], hand[1], 0.042, 0.03), coat.hand, w));
  const handF = p.arms[0][p.arms[0].length - 1] ?? [0, 0];
  body.push(part(ellipseD(handF[0], handF[1], 0.04, 0.028), shade(coat.hand, -0.1), w));
  if (p.item === 'fruit' || p.item === 'throwFruit')
    body.push(...fruitAt(hand[0] + 0.02, hand[1] - 0.04));
  if (p.item === 'mielie') body.push(...mielieAt(hand[0], hand[1] - 0.03));
  if (p.item === 'hat') body.push(...hat(hand[0], hand[1] - 0.02, 0.8));
  if (p.water === true) body.push(...waterAt(hand[0] + 0.04, hand[1] + 0.02));
  let fig = g({ transform: `translate(${r2(lift[0])} ${r2(lift[1])})` }, ...body);
  if (p.spin !== undefined) {
    const c: V = [(p.rear[0] + p.front[0]) / 2, (p.rear[1] + p.front[1]) / 2];
    fig = g({ transform: `rotate(${r2(p.spin)} ${r2(c[0])} ${r2(c[1])})` }, fig);
  }
  parts.push(fig);
  return g({}, el('defs', {}, ...defs), ...parts);
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

function coatOf(frame: BaboonFrame): Coat {
  return frame.startsWith('r_mother') ? MOTHER : MALE;
}

/** One frame's drawing in design px (feet at 0). */
export function drawFrame(frame: BaboonFrame, seed: number): string {
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
