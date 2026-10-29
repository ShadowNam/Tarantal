// v1.7d (D-059, art bible §4.5d) The ostriches of Namibië, close up on the mid plane: the cock
// black with white wing and tail plumes, the hen grey-brown with greyish-white plumes; bare
// pinkish-grey thighs and neck (the cock's shins redder), long legs with scaled shanks and a big
// two-toed foot, a small flat-billed head with a big dark eye and lashes, a bristly crown. Drawn
// from a posed skeleton (body, two legs, neck, head) so every frame is the same bird; layered
// shading (a lit back, a shaded belly, plume texture), thin edges a shade darker than the part
// (no ink), a soft contact shadow; light from the upper left. Same proportions and coat as the
// far-fauna ostrich (tools/art/farFauna.ts), at 197 px to the head (the mid plane).
import {
  EGG_SPOTS,
  OSTRICH_SHEET_H,
  OSTRICH_SHEET_W,
  ostrichFrames,
  type OstrichFramePose,
} from '../../src/game/view/namib/ostrichSheet';
import type { Rgba } from '../assets/image';
import {
  add,
  clipOf,
  contactShadow,
  lerp,
  limb,
  mul,
  nrm,
  rot,
  unit,
  vGrad,
  wash,
  type V,
} from './farFauna';
import { renderSvg } from './raster';
import { mix, nextId, shade } from './scenery';
import { el, ellipseD, g, prng, r2, smoothD, svgDoc } from './svg';

/** Height to the top of the head when standing (design px at the mid plane). */
export const OSTRICH_H = 197;

interface Coat {
  readonly coat: string;
  readonly lit: string;
  readonly dark: string;
  readonly plume: string;
  readonly skin: string;
  readonly shin: string;
  readonly neck: string;
}

const COCK: Coat = {
  coat: '#24201F',
  lit: '#4A433F',
  dark: '#100E0E',
  plume: '#F4F0E8',
  skin: '#C99C92',
  shin: '#C67468',
  neck: '#C4A29A',
};
const HEN: Coat = {
  coat: '#7B6E60',
  lit: '#9E9080',
  dark: '#4F453B',
  plume: '#D8D1C3',
  skin: '#B8A89E',
  shin: '#AC9C90',
  neck: '#AE9E92',
};

/** One leg: the drumstick's and the shank's angle from straight down (deg, + = forward). */
interface Leg {
  readonly thigh: number;
  readonly shank: number;
  /** Toes curled (a lifted foot). */
  readonly lifted?: boolean;
}

interface Pose {
  /** Body centre (H units) and tilt (deg, + = head end down). */
  readonly body: V;
  readonly tilt: number;
  readonly wings: 'fold' | 'half' | 'fan';
  /** Sitting: legs folded under, belly on the ground. */
  readonly sit?: boolean;
  /** Neck from its root on the body to the head (H units, relative to the body centre),
   *  through a bend point. */
  readonly bend: V;
  readonly head: V;
  /** Head direction (beak), and a turn toward the viewer (0 profile … 1 three-quarter). */
  readonly headDir: V;
  readonly turn?: number;
  readonly open?: boolean;
  /** Far leg, near leg (absent when sitting). */
  readonly legs?: readonly [Leg, Leg];
}

const THIGH = 0.27;
const SHANK = 0.27;

const stand = (far: Leg, near: Leg): Pose => ({
  body: [0, -0.6],
  tilt: 4,
  wings: 'fold',
  bend: [0.24, -0.33],
  head: [0.24, -0.4],
  headDir: [1, 0.1],
  legs: [far, near],
});

const POSES: Readonly<Record<OstrichFramePose, Pose>> = {
  stand: stand({ thigh: -4, shank: 2 }, { thigh: 6, shank: -2 }),
  look: { ...stand({ thigh: -4, shank: 2 }, { thigh: 6, shank: -2 }), turn: 1 },
  walk_0: {
    ...stand({ thigh: -18, shank: -14 }, { thigh: 20, shank: 6 }),
    bend: [0.27, -0.3],
    head: [0.3, -0.37],
  },
  walk_1: {
    ...stand({ thigh: 2, shank: -2 }, { thigh: 24, shank: -38, lifted: true }),
    bend: [0.28, -0.31],
    head: [0.31, -0.38],
  },
  walk_2: {
    ...stand({ thigh: 20, shank: 6 }, { thigh: -18, shank: -14 }),
    bend: [0.27, -0.3],
    head: [0.3, -0.37],
  },
  walk_3: {
    ...stand({ thigh: 24, shank: -38, lifted: true }, { thigh: 2, shank: -2 }),
    bend: [0.28, -0.31],
    head: [0.31, -0.38],
  },
  peck: {
    ...stand({ thigh: -6, shank: 4 }, { thigh: 8, shank: -2 }),
    tilt: 16,
    bend: [0.36, 0.0],
    head: [0.5, 0.48],
    headDir: [0.35, 1],
  },
  sit: {
    body: [0, -0.15],
    tilt: 2,
    wings: 'fold',
    sit: true,
    bend: [0.24, -0.38],
    head: [0.23, -0.6],
    headDir: [1, 0.12],
  },
  display: {
    body: [0, -0.22],
    tilt: -4,
    wings: 'fan',
    sit: true,
    bend: [0.12, -0.32],
    head: [0.05, -0.58],
    headDir: [0.9, 0.45],
  },
  run_0: {
    body: [0, -0.58],
    tilt: 12,
    wings: 'half',
    bend: [0.4, -0.18],
    head: [0.56, -0.3],
    headDir: [1, 0.05],
    legs: [
      { thigh: -34, shank: -40 },
      { thigh: 40, shank: 18 },
    ],
  },
  run_1: {
    body: [0, -0.62],
    tilt: 12,
    wings: 'half',
    bend: [0.4, -0.2],
    head: [0.57, -0.32],
    headDir: [1, 0.05],
    legs: [
      { thigh: 30, shank: -50, lifted: true },
      { thigh: -10, shank: -18, lifted: true },
    ],
  },
  run_2: {
    body: [0, -0.58],
    tilt: 12,
    wings: 'half',
    bend: [0.4, -0.18],
    head: [0.56, -0.3],
    headDir: [1, 0.05],
    legs: [
      { thigh: 40, shank: 18 },
      { thigh: -34, shank: -40 },
    ],
  },
  hiss: {
    ...stand({ thigh: -12, shank: 6 }, { thigh: 14, shank: -4 }),
    tilt: 10,
    wings: 'half',
    bend: [0.3, -0.05],
    head: [0.52, -0.2],
    headDir: [1, 0.2],
    open: true,
  },
};

const RX = 0.25;
const RY = 0.15;

/** The joints of a leg from the hip (H units): hip, ankle, foot. */
function legJoints(hip: V, leg: Leg): [V, V, V] {
  const a = (leg.thigh * Math.PI) / 180;
  const b = (leg.shank * Math.PI) / 180;
  const ankle: V = [hip[0] + Math.sin(a) * THIGH, hip[1] + Math.cos(a) * THIGH];
  const foot: V = [ankle[0] + Math.sin(b) * SHANK, ankle[1] + Math.cos(b) * SHANK];
  return [hip, ankle, foot];
}

/** Draws one pose of a cock or hen, feet (or belly) on (0, 0), facing right. */
export function drawOstrich(male: boolean, poseId: OstrichFramePose, H = OSTRICH_H): string {
  const pose = POSES[poseId];
  const C = male ? COCK : HEN;
  const rnd = prng((male ? 977 : 331) + poseId.length * 13 + poseId.charCodeAt(0));
  const P = (p: V): V => [p[0] * H, p[1] * H];
  const edge = shade(C.coat, -0.45);
  const skinEdge = shade(C.skin, -0.35);
  const w = Math.max(0.6, H * 0.0045);
  // Legs first, to find where the body sits: the lowest foot stands on the ground.
  let body: V = pose.body;
  const hipOf = (b: V): V => [b[0] - 0.02, b[1] + RY * 0.55];
  let legs: [V, V, V][] = [];
  if (pose.legs !== undefined && pose.sit !== true) {
    const raw = pose.legs.map((l) => legJoints(hipOf(body), l));
    const low = Math.max(...raw.map((j) => j[2][1]));
    body = [body[0], body[1] - low];
    legs = pose.legs.map((l) => legJoints(hipOf(body), l));
  }
  const tiltAbout = P(body);
  const T = (p: V): V => rot(P(p), tiltAbout, pose.tilt);
  const cx = body[0];
  const cy = body[1];
  const parts: string[] = [];
  // Contact shadow.
  parts.push(contactShadow(-0.28 * H, 0.32 * H, H * 0.03));
  // --- legs -------------------------------------------------------------------------------
  const legSvg = (j: [V, V, V], near: boolean, l: Leg): string => {
    const [hip, ankle, foot] = j.map(P) as [V, V, V];
    const skin = near ? C.skin : shade(C.skin, -0.18);
    const shin = near ? C.shin : shade(C.shin, -0.18);
    const thighD = limb(
      [
        { p: hip, w: 0.11 * H },
        { p: lerp(hip, ankle, 0.55), w: 0.065 * H },
        { p: ankle, w: 0.032 * H },
      ],
      0.85,
    );
    const shankD = limb(
      [
        { p: ankle, w: 0.03 * H },
        { p: lerp(ankle, foot, 0.5), w: 0.022 * H },
        { p: foot, w: 0.026 * H },
      ],
      0.85,
    );
    // Two toes: the big one forward with its claw, the small outer one beside it.
    const lift = l.lifted === true;
    const toeDir: V = lift ? unit([0.7, 0.7]) : [1, 0.02];
    const big = add(foot, mul(toeDir, 0.085 * H));
    const small = add(foot, mul(unit([toeDir[0], toeDir[1] + 0.25]), 0.05 * H));
    const toes =
      limb(
        [
          { p: add(foot, [-0.012 * H, 0]), w: 0.03 * H },
          { p: big, w: 0.016 * H },
        ],
        0.8,
      ) +
      limb(
        [
          { p: foot, w: 0.02 * H },
          { p: small, w: 0.012 * H },
        ],
        0.8,
      );
    // Scutes on the shank's front: short pale bars.
    let scutes = '';
    for (let k = 1; k < 7; k++) {
      const p = lerp(ankle, foot, k / 7.5);
      const n = nrm(unit([foot[0] - ankle[0], foot[1] - ankle[1]]));
      const a = add(p, mul(n, 0.006 * H));
      const b = add(p, mul(n, -0.009 * H));
      scutes += `M${r2(a[0])} ${r2(a[1])}L${r2(b[0])} ${r2(b[1])}`;
    }
    const lit = vGrad(hip[1], ankle[1], [
      [0, '#FFFFFF', 0.18],
      [1, '#FFFFFF', 0],
    ]);
    return g(
      {},
      el('defs', {}, lit.def),
      el('path', {
        d: shankD + toes,
        fill: shin,
        stroke: shade(shin, -0.35),
        'stroke-width': r2(w),
      }),
      el('path', { d: thighD, fill: skin, stroke: skinEdge, 'stroke-width': r2(w) }),
      el('path', { d: thighD, fill: `url(#${lit.id})` }),
      el('path', {
        d: scutes,
        stroke: mix(shin, '#FFFFFF', 0.35),
        'stroke-width': r2(w * 0.6),
        fill: 'none',
        opacity: 0.6,
      }),
      // The claw.
      el('path', { d: ellipseD(big[0], big[1], 0.01 * H, 0.006 * H), fill: '#3E3430' }),
    );
  };
  // Both legs come out from under the plumes: drawn before the body.
  if (legs[0] !== undefined && pose.legs !== undefined)
    parts.push(legSvg(legs[0], false, pose.legs[0]));
  if (legs[1] !== undefined && pose.legs !== undefined)
    parts.push(legSvg(legs[1], true, pose.legs[1]));
  // --- tail and far wing (behind the body) ---------------------------------------------------
  const plume = (base: V, dir: V, len: number, wd: number, col: string, op = 1): string => {
    const tip = add(base, mul(unit(dir), len));
    const n = nrm(unit(dir));
    const d = smoothD(
      [
        add(base, mul(n, wd * 0.4)),
        add(lerp(base, tip, 0.5), mul(n, wd * 0.6)),
        tip,
        add(lerp(base, tip, 0.5), mul(n, -wd * 0.6)),
        add(base, mul(n, -wd * 0.4)),
      ],
      true,
      0.9,
    );
    return el('path', { d, fill: col, opacity: op });
  };
  const plumeTone = (k: number): string =>
    male ? mix(C.plume, '#C8C2B6', k) : mix(C.plume, C.coat, 0.25 + k * 0.3);
  // Tail plume: a fluffy bunch at the rear.
  const tailBase = T([cx - RX * 0.85, cy - 0.02]);
  let tail = '';
  for (let k = 0; k < 9; k++) {
    const a = -150 - k * 9 + (rnd() - 0.5) * 8 - pose.tilt;
    const d: V = [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180) * -1 * -1];
    tail += plume(
      tailBase,
      [d[0], -Math.abs(d[1]) * 0.6 + 0.15],
      (0.1 + rnd() * 0.06) * H,
      0.045 * H,
      plumeTone(rnd() * 0.5),
      0.95,
    );
  }
  parts.push(g({}, tail));
  // Wings spread (display, run, hiss): the far wing shows above the back.
  const wingFan = (side: -1 | 1, spread: number): string => {
    const root = T([cx + 0.04, cy - RY * 0.4]);
    let out = '';
    const n = pose.wings === 'fan' ? 11 : 8;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const ang =
        ((side === -1 ? 180 - (90 - spread * 0.4) * t - 30 : (90 - spread * 0.4) * t + 30) *
          Math.PI) /
        180;
      const dir: V = [Math.cos(ang), -Math.sin(ang)];
      const len = (pose.wings === 'fan' ? 0.36 : 0.24) * H * (0.8 + rnd() * 0.3);
      out += plume(root, dir, len, 0.06 * H, plumeTone(t * 0.6), 0.96);
    }
    // The black wing base (the cock's black, the hen's brown) over the plume roots.
    out += el('path', {
      d: ellipseD(root[0] + side * 0.04 * H, root[1] - 0.03 * H, 0.1 * H, 0.06 * H),
      fill: C.coat,
    });
    return out;
  };
  if (pose.wings !== 'fold')
    parts.push(g({ opacity: 0.95 }, wingFan(-1, pose.wings === 'fan' ? 80 : 40)));
  // --- body --------------------------------------------------------------------------------
  // An egg of loose plumes: smooth along the back, ragged plume tips along the belly and rear.
  const bodyPts: V[] = [];
  const N = 30;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const under = Math.sin(a) > 0.1;
    const jag = under ? 1 + (k % 2 === 0 ? 0.07 : -0.03) + (rnd() - 0.5) * 0.04 : 1;
    const x = Math.cos(a) * RX * jag;
    const y = Math.sin(a) * RY * jag * (Math.cos(a) < 0 ? 1.06 : 0.94) - Math.cos(a) * 0.025;
    bodyPts.push(T([cx + x, cy + y]));
  }
  if (pose.sit === true) {
    // Sitting: the belly flattens on the ground.
    for (let k = 0; k < bodyPts.length; k++) {
      const p = bodyPts[k];
      if (p !== undefined && p[1] > -0.01 * H)
        bodyPts[k] = [p[0], -0.01 * H + (p[1] + 0.01 * H) * 0.15];
    }
  }
  const bodyD = smoothD(bodyPts, true, 0.9);
  const clip = clipOf([bodyD]);
  const bodyTop = (cy - RY) * H;
  const bodyBot = (cy + RY) * H;
  const light = vGrad(bodyTop, bodyBot, [
    [0, C.lit, 0.9],
    [0.4, C.lit, 0],
    [1, C.dark, 0.7],
  ]);
  // Plume texture: short curved strokes down the body, lit ones above, dark ones below.
  let texLit = '';
  let texDark = '';
  for (let k = 0; k < 70; k++) {
    const u = rnd() * 2 - 1;
    const v = rnd() * 2 - 1;
    if (u * u + v * v > 1) continue;
    const p = T([cx + u * RX * 0.95, cy + v * RY * 0.9]);
    const len = (0.03 + rnd() * 0.035) * H;
    const s = `M${r2(p[0])} ${r2(p[1])}q${r2(-len * 0.5)} ${r2(len * 0.15)} ${r2(-len)} ${r2(len * 0.55)}`;
    if (v < -0.1 + (rnd() - 0.5) * 0.4) texLit += s;
    else texDark += s;
  }
  parts.push(
    el('defs', {}, light.def, clip.def),
    el('path', { d: bodyD, fill: C.coat, stroke: edge, 'stroke-width': r2(w * 1.2) }),
    wash(clip.id, `url(#${light.id})`, { x0: -H, y0: -1.5 * H, x1: H, y1: 0.2 * H }),
    g(
      { 'clip-path': `url(#${clip.id})` },
      el('path', {
        d: texDark,
        stroke: shade(C.coat, -0.3),
        'stroke-width': r2(w * 0.9),
        fill: 'none',
        'stroke-linecap': 'round',
        opacity: 0.7,
      }),
      el('path', {
        d: texLit,
        stroke: mix(C.lit, '#FFFFFF', 0.15),
        'stroke-width': r2(w * 0.8),
        fill: 'none',
        'stroke-linecap': 'round',
        opacity: 0.55,
      }),
    ),
  );
  // The folded wing: its plumes lie along the flank, the tips white (grey-white on a hen).
  if (pose.wings === 'fold') {
    let wing = '';
    // The wing's dark coverts over the flank, then only its plume tips (white on a cock) show
    // at the rear, drooping over the tail.
    for (let k = 0; k < 6; k++) {
      const base = T([cx - 0.06 - k * 0.022, cy + 0.03 + (k % 2) * 0.012]);
      wing += plume(
        base,
        rot([-1, 0.45 + k * 0.05], [0, 0], pose.tilt),
        (0.085 + rnd() * 0.03) * H,
        0.04 * H,
        plumeTone(0.15 + rnd() * 0.35),
        0.9,
      );
    }
    wing += el('path', {
      d: smoothD(
        [
          T([cx + 0.12, cy - 0.05]),
          T([cx - 0.04, cy - 0.08]),
          T([cx - 0.14, cy + 0.0]),
          T([cx - 0.06, cy + 0.07]),
          T([cx + 0.1, cy + 0.04]),
        ],
        true,
        0.9,
      ),
      fill: mix(C.coat, C.lit, 0.35),
      opacity: 0.85,
    });
    parts.push(g({}, wing));
  } else parts.push(wingFan(1, pose.wings === 'fan' ? 70 : 34));
  // --- neck and head -------------------------------------------------------------------------
  const root = T([cx + RX * 0.72, cy - RY * 0.45]);
  const bend = add(P([cx, cy]), P(pose.bend));
  const head = add(P([cx, cy]), P(pose.head));
  const neckD = limb(
    [
      { p: T([cx + RX * 0.55, cy - RY * 0.2]), w: 0.1 * H },
      { p: root, w: 0.062 * H },
      { p: lerp(root, bend, 0.6), w: 0.042 * H },
      { p: bend, w: 0.034 * H },
      { p: lerp(bend, head, 0.5), w: 0.03 * H },
      { p: head, w: 0.032 * H },
    ],
    0.8,
  );
  // The neck's shaded back edge and a lit front.
  const nl = vGrad(head[1], root[1], [
    [0, '#FFFFFF', 0.12],
    [1, C.dark, 0.2],
  ]);
  const neckClip = clipOf([neckD]);
  let down = '';
  for (let k = 0; k < 26; k++) {
    const t = rnd();
    const p = t < 0.6 ? lerp(root, bend, t / 0.6) : lerp(bend, head, (t - 0.6) / 0.4);
    down += ellipseD(
      p[0] + (rnd() - 0.5) * 0.03 * H,
      p[1] + (rnd() - 0.5) * 0.02 * H,
      0.004 * H,
      0.003 * H,
    );
  }
  parts.push(
    el('defs', {}, nl.def, neckClip.def),
    el('path', { d: neckD, fill: C.neck, stroke: skinEdge, 'stroke-width': r2(w) }),
    wash(neckClip.id, `url(#${nl.id})`, { x0: -H, y0: -1.5 * H, x1: H, y1: 0.6 * H }),
    g(
      { 'clip-path': `url(#${neckClip.id})` },
      el('path', { d: down, fill: shade(C.neck, -0.25), opacity: 0.5 }),
    ),
    // The collar of body plumes where the neck meets the body.
    el('path', {
      d: smoothD(
        [
          T([cx + RX * 0.45, cy - RY * 0.75]),
          T([cx + RX * 0.85, cy - RY * 0.8]),
          T([cx + RX * 0.95, cy - RY * 0.1]),
          T([cx + RX * 0.7, cy + RY * 0.2]),
        ],
        true,
        0.9,
      ),
      fill: C.coat,
      stroke: edge,
      'stroke-width': r2(w * 0.8),
    }),
  );
  // Head: a small rounded skull, a broad flat bill, the big eye with lashes, a bristly crown.
  const turn = pose.turn ?? 0;
  const hd = unit(pose.headDir);
  const hn = nrm(hd);
  const hp = (u: number, v: number): V => add(head, add(mul(hd, u * H), mul(hn, v * H)));
  const billLen = 0.075 * (1 - turn * 0.45);
  const skull = smoothD(
    [
      hp(-0.035, -0.012),
      hp(-0.01, -0.032),
      hp(0.025, -0.028),
      hp(0.03, 0.012),
      hp(0.0, 0.026),
      hp(-0.03, 0.018),
    ],
    true,
    0.85,
  );
  const upper = smoothD(
    [hp(0.015, -0.014), hp(0.02 + billLen, -0.006), hp(0.024 + billLen, 0.002), hp(0.02, 0.006)],
    true,
    0.6,
  );
  const lower =
    pose.open === true
      ? smoothD(
          [
            hp(0.015, 0.008),
            hp(0.018 + billLen, 0.03),
            hp(0.012 + billLen, 0.034),
            hp(0.012, 0.016),
          ],
          true,
          0.6,
        )
      : smoothD(
          [
            hp(0.015, 0.004),
            hp(0.02 + billLen, 0.004),
            hp(0.016 + billLen, 0.01),
            hp(0.015, 0.012),
          ],
          true,
          0.6,
        );
  const eye = hp(0.002 + turn * 0.004, -0.008);
  const er = 0.0135 * H;
  let lashes = '';
  for (let k = 0; k < 4; k++) {
    const a = add(eye, mul(rot([0, -1], [0, 0], -40 + k * 22), er * 1.05));
    const b = add(eye, mul(rot([0, -1], [0, 0], -48 + k * 24), er * 1.75));
    lashes += `M${r2(a[0])} ${r2(a[1])}L${r2(b[0])} ${r2(b[1])}`;
  }
  let crown = '';
  for (let k = 0; k < 7; k++) {
    const p = hp(-0.025 + k * 0.007, -0.028 + Math.abs(k - 3) * 0.002);
    crown += `M${r2(p[0])} ${r2(p[1])}l${r2(-0.006 * H)} ${r2(-0.012 * H)}`;
  }
  parts.push(
    el('path', {
      d: lower,
      fill: shade(C.skin, -0.1),
      stroke: skinEdge,
      'stroke-width': r2(w * 0.8),
    }),
    pose.open === true
      ? el('path', {
          d: smoothD([hp(0.02, 0.0), hp(0.02 + billLen * 0.8, 0.012), hp(0.02, 0.012)], true, 0.5),
          fill: '#8A4A48',
        })
      : '',
    el('path', { d: skull, fill: C.neck, stroke: skinEdge, 'stroke-width': r2(w * 0.8) }),
    el('path', {
      d: upper,
      fill: mix(C.skin, '#E8D2C0', 0.35),
      stroke: skinEdge,
      'stroke-width': r2(w * 0.8),
    }),
    el('path', {
      d: crown,
      stroke: shade(C.coat, 0.1),
      'stroke-width': r2(w * 0.8),
      fill: 'none',
      'stroke-linecap': 'round',
    }),
    el('path', { d: ellipseD(eye[0], eye[1], er * 1.25, er * 1.15), fill: shade(C.neck, -0.3) }),
    el('path', { d: ellipseD(eye[0], eye[1], er, er), fill: '#1E1410' }),
    el('path', {
      d: ellipseD(eye[0] - er * 0.3, eye[1] - er * 0.35, er * 0.32, er * 0.28),
      fill: '#FFFFFF',
      opacity: 0.85,
    }),
    el('path', {
      d: lashes,
      stroke: '#1E1410',
      'stroke-width': r2(w * 0.7),
      fill: 'none',
      'stroke-linecap': 'round',
    }),
  );
  return g({}, ...parts);
}

/** The nest scrape: a shallow bowl in the sand with a raked rim, centred on (0, 0). */
export function drawScrape(): string {
  const rnd = prng(4421);
  const rim = '#E2A47C';
  const hollow = '#B86A48';
  let crumbs = '';
  for (let k = 0; k < 40; k++) {
    const a = rnd() * Math.PI * 2;
    const r = 0.85 + rnd() * 0.3;
    crumbs += ellipseD(Math.cos(a) * 70 * r, Math.sin(a) * 11 * r - 2, 1.4, 0.9);
  }
  const id = nextId();
  return g(
    {},
    el(
      'defs',
      {},
      el(
        'radialGradient',
        { id },
        el('stop', { offset: 0, 'stop-color': hollow, 'stop-opacity': 0.75 }),
        el('stop', { offset: 0.7, 'stop-color': hollow, 'stop-opacity': 0.35 }),
        el('stop', { offset: 1, 'stop-color': hollow, 'stop-opacity': 0 }),
      ),
    ),
    el('path', { d: ellipseD(0, 0, 78, 14), fill: `url(#${id})` }),
    el('path', {
      d: `M-78 1Q0 -22 78 1`,
      fill: 'none',
      stroke: rim,
      'stroke-width': 3,
      opacity: 0.8,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: `M-74 4Q0 18 74 4`,
      fill: 'none',
      stroke: mix(rim, '#FFE6C8', 0.4),
      'stroke-width': 2.4,
      opacity: 0.8,
      'stroke-linecap': 'round',
    }),
    el('path', { d: crumbs, fill: shade(rim, -0.15), opacity: 0.7 }),
  );
}

/** One cream egg lying on its side, its foot at (0, 0). */
export function drawEgg(): string {
  const id = nextId();
  return g(
    {},
    el('path', { d: ellipseD(1, 0, 7, 1.6), fill: '#5A3020', opacity: 0.3 }),
    el(
      'defs',
      {},
      el(
        'radialGradient',
        { id, cx: 0.35, cy: 0.3, r: 0.8 },
        el('stop', { offset: 0, 'stop-color': '#FFFBF0' }),
        el('stop', { offset: 0.6, 'stop-color': '#F1E6CC' }),
        el('stop', { offset: 1, 'stop-color': '#C9B796' }),
      ),
    ),
    el('path', {
      d: ellipseD(0, -5.6, 7, 5.6),
      fill: `url(#${id})`,
      stroke: '#B8A684',
      'stroke-width': 0.5,
    }),
    // Pitted shell.
    el('path', {
      d: ellipseD(-2, -7, 0.5, 0.4) + ellipseD(2, -4, 0.4, 0.3) + ellipseD(3.5, -7.5, 0.4, 0.3),
      fill: '#D6C8A8',
    }),
  );
}

/** The sheet at `k` texture px per design px (1 Standard, 2 HD). */
export function renderOstrichSheet(k: number): Rgba {
  const cells = ostrichFrames().map((f) => {
    const id = nextId();
    const [sex, ...rest] = f.name.split('_');
    const pose = rest.join('_') as OstrichFramePose;
    const art =
      f.name === 'scrape'
        ? drawScrape()
        : f.name === 'egg'
          ? drawEgg()
          : drawOstrich(sex === 'm', pose);
    return g(
      {},
      el('clipPath', { id }, el('rect', { x: f.x, y: f.y, width: f.w, height: f.h })),
      g(
        { 'clip-path': `url(#${id})` },
        g({ transform: `translate(${r2(f.x + f.ox)} ${r2(f.y + f.oy)})` }, art),
      ),
    );
  });
  return renderSvg(
    svgDoc(
      OSTRICH_SHEET_W * k,
      OSTRICH_SHEET_H * k,
      [0, 0, OSTRICH_SHEET_W, OSTRICH_SHEET_H],
      '',
      g({}, ...cells),
    ),
  );
}

/** The scrape with `eggs` eggs, for previews. */
export function drawNest(eggs: number): string {
  return g(
    {},
    drawScrape(),
    ...EGG_SPOTS.slice(0, eggs).map(([x, y]) =>
      g({ transform: `translate(${x} ${y})` }, drawEgg()),
    ),
  );
}
