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
  skin: '#DDA49C',
  shin: '#D2665A',
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
  const rnd = prng((male ? 977 : 331) + poseId.length * 13 + poseId.charCodeAt(0) * 7);
  const P = (p: V): V => [p[0] * H, p[1] * H];
  const w = Math.max(0.5, H * 0.004);
  const sit = pose.sit === true;
  const rx = sit ? 0.29 : RX;
  const ry = sit ? 0.15 : RY;
  // Legs first, to find where the body sits: the lowest foot stands on the ground.
  let body: V = pose.body;
  const hipOf = (b: V): V => [b[0] - 0.02, b[1] + ry * 0.55];
  let legs: [V, V, V][] = [];
  if (pose.legs !== undefined && !sit) {
    const raw = pose.legs.map((l) => legJoints(hipOf(body), l));
    const low = Math.max(...raw.map((j) => j[2][1]));
    body = [body[0], body[1] - low];
    legs = pose.legs.map((l) => legJoints(hipOf(body), l));
  }
  const pivot = P(body);
  const T = (p: V): V => rot(P(p), pivot, pose.tilt);
  const [cx, cy] = body;
  const parts: string[] = [];
  parts.push(contactShadow(-0.3 * H, 0.34 * H, H * (sit ? 0.045 : 0.03)));

  // --- feathers: one plume (a soft spindle with barbs) ------------------------------------------
  const plumeD = (base: V, tip: V, wd: number): string => {
    const d = [tip[0] - base[0], tip[1] - base[1]] as V;
    const n = nrm(unit(d));
    return smoothD(
      [
        add(base, mul(n, wd * 0.35)),
        add(lerp(base, tip, 0.45), mul(n, wd * 0.6)),
        add(lerp(base, tip, 0.85), mul(n, wd * 0.3)),
        tip,
        add(lerp(base, tip, 0.85), mul(n, -wd * 0.3)),
        add(lerp(base, tip, 0.45), mul(n, -wd * 0.6)),
        add(base, mul(n, -wd * 0.35)),
      ],
      true,
      0.85,
    );
  };
  /** A soft drooping plume: a fill, its shadowed underside, fine barbs along it. */
  const plume = (base: V, dir: V, len: number, wd: number, col: string, droop: number): string => {
    const u = unit(dir);
    const mid = add(base, mul(u, len * 0.55));
    const tip = add(add(base, mul(u, len)), [0, droop * len]);
    const bend = add(mid, [0, droop * len * 0.35]);
    const d = plumeD(base, tip, wd);
    let barbs = '';
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      const p = t < 0.55 ? lerp(base, bend, t / 0.55) : lerp(bend, tip, (t - 0.55) / 0.45);
      const nn = nrm(unit([tip[0] - base[0], tip[1] - base[1]]));
      for (const sgn of [1, -1]) {
        const e = add(p, add(mul(nn, sgn * wd * (0.5 + rnd() * 0.25)), mul(u, wd * 0.25)));
        barbs += `M${r2(p[0])} ${r2(p[1])}L${r2(e[0])} ${r2(e[1])}`;
      }
    }
    return g(
      {},
      el('path', { d, fill: col, opacity: 0.92 }),
      el('path', {
        d: `M${r2(base[0])} ${r2(base[1])}Q${r2(bend[0])} ${r2(bend[1])} ${r2(tip[0])} ${r2(tip[1])}`,
        fill: 'none',
        stroke: shade(col, -0.18),
        'stroke-width': r2(w * 0.6),
      }),
      el('path', {
        d: barbs,
        fill: 'none',
        stroke: mix(col, '#FFFFFF', 0.35),
        'stroke-width': r2(w * 0.45),
        'stroke-linecap': 'round',
        opacity: 0.7,
      }),
    );
  };
  const plumeCol = (k: number): string =>
    male ? mix('#F6F2EA', '#CFC9BE', k) : mix('#DCD3C4', '#9C8F7E', 0.15 + k * 0.4);

  // --- legs (behind the body plumes) ------------------------------------------------------
  const legSvg = (j: [V, V, V], near: boolean, l: Leg): string => {
    const [hip, ankle, foot] = j.map(P) as [V, V, V];
    const skin = near ? C.skin : shade(C.skin, -0.2);
    const shin = near ? C.shin : shade(C.shin, -0.2);
    const thighD = limb(
      [
        { p: hip, w: 0.12 * H },
        { p: lerp(hip, ankle, 0.4), w: 0.085 * H },
        { p: lerp(hip, ankle, 0.8), w: 0.045 * H },
        { p: ankle, w: 0.034 * H },
      ],
      0.85,
    );
    const shankD = limb(
      [
        { p: ankle, w: 0.032 * H },
        { p: lerp(ankle, foot, 0.5), w: 0.022 * H },
        { p: foot, w: 0.026 * H },
      ],
      0.85,
    );
    const lift = l.lifted === true;
    const toeDir: V = lift ? unit([0.75, 0.66]) : [1, 0.02];
    const big = add(foot, mul(toeDir, 0.09 * H));
    const small = add(foot, mul(unit([toeDir[0], toeDir[1] + 0.3]), 0.055 * H));
    const toes =
      limb(
        [
          { p: add(foot, [-0.014 * H, 0]), w: 0.032 * H },
          { p: lerp(foot, big, 0.6), w: 0.022 * H },
          { p: big, w: 0.014 * H },
        ],
        0.8,
      ) +
      limb(
        [
          { p: foot, w: 0.02 * H },
          { p: small, w: 0.011 * H },
        ],
        0.8,
      );
    let scutes = '';
    const sd = unit([foot[0] - ankle[0], foot[1] - ankle[1]]);
    for (let k = 1; k < 9; k++) {
      const p = lerp(ankle, foot, k / 9.5);
      const a = add(p, mul(nrm(sd), 0.008 * H));
      const b = add(p, mul(nrm(sd), -0.01 * H));
      scutes += `M${r2(a[0])} ${r2(a[1])}L${r2(b[0])} ${r2(b[1])}`;
    }
    // Wrinkles on the bare thigh.
    let wr = '';
    for (let k = 0; k < 4; k++) {
      const p = lerp(hip, ankle, 0.35 + k * 0.13);
      const n = nrm(unit([ankle[0] - hip[0], ankle[1] - hip[1]]));
      const a = add(p, mul(n, 0.02 * H));
      const b = add(p, mul(n, -0.015 * H));
      wr += `M${r2(a[0])} ${r2(a[1])}Q${r2(p[0] + 0.006 * H)} ${r2(p[1] + 0.006 * H)} ${r2(b[0])} ${r2(b[1])}`;
    }
    const lit = vGrad(hip[1], ankle[1], [
      [0, '#FFFFFF', 0.2],
      [0.6, '#FFFFFF', 0.04],
      [1, '#000000', 0.08],
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
      el('path', {
        d: scutes,
        stroke: mix(shin, '#FFFFFF', 0.4),
        'stroke-width': r2(w * 0.55),
        fill: 'none',
        opacity: 0.7,
      }),
      el('path', { d: thighD, fill: skin, stroke: shade(skin, -0.32), 'stroke-width': r2(w) }),
      el('path', { d: thighD, fill: `url(#${lit.id})` }),
      el('path', {
        d: wr,
        stroke: shade(skin, -0.25),
        'stroke-width': r2(w * 0.6),
        fill: 'none',
        opacity: 0.6,
      }),
      el('path', { d: ellipseD(big[0], big[1], 0.011 * H, 0.0065 * H), fill: '#3A302C' }),
    );
  };
  if (legs[0] !== undefined && pose.legs !== undefined)
    parts.push(legSvg(legs[0], false, pose.legs[0]));
  if (legs[1] !== undefined && pose.legs !== undefined)
    parts.push(legSvg(legs[1], true, pose.legs[1]));

  // --- tail and far wing fans -------------------------------------------------------------
  const tailBase = T([cx - rx * 0.86, cy - 0.025]);
  const tailParts: string[] = [];
  for (let k = 0; k < 9; k++) {
    const a = ((200 + k * 10 + (rnd() - 0.5) * 8 + pose.tilt) * Math.PI) / 180;
    tailParts.push(
      plume(
        tailBase,
        [Math.cos(a), -Math.abs(Math.sin(a)) * 0.9 - 0.15],
        (0.11 + rnd() * 0.06) * H,
        0.05 * H,
        plumeCol(rnd() * 0.5),
        0.35,
      ),
    );
  }
  parts.push(g({}, ...tailParts));
  const fan = (side: -1 | 1, spread: number, over: boolean): string => {
    const root = T([cx + 0.03, cy - ry * 0.35]);
    const n = pose.wings === 'fan' ? 12 : 9;
    const out: string[] = [];
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const deg = side === -1 ? 180 - 25 - t * spread : 25 + t * spread;
      const a = (deg * Math.PI) / 180;
      const len = (pose.wings === 'fan' ? 0.36 : 0.25) * H * (0.82 + rnd() * 0.3);
      out.push(
        plume(
          root,
          [Math.cos(a), -Math.sin(a)],
          len,
          0.065 * H,
          plumeCol(t * 0.5 + (over ? 0 : 0.25)),
          0.12,
        ),
      );
    }
    // The wing's base (only the far wing's shows; the near one's roots sit in the body plumes).
    if (!over)
      out.push(
        el('path', {
          d: ellipseD(root[0] + side * 0.03 * H, root[1] - 0.02 * H, 0.1 * H, 0.06 * H),
          fill: C.coat,
        }),
      );
    return g({}, ...out);
  };
  if (pose.wings !== 'fold') parts.push(fan(-1, pose.wings === 'fan' ? 95 : 45, false));
  if (sit)
    // Sitting on the eggs: the wings a little spread, their plumes over the scrape's edges.
    for (const side of [-1, 1] as const)
      for (let k = 0; k < 6; k++) {
        const base = T([cx + side * rx * 0.55, cy + ry * 0.35]);
        const a = side === -1 ? Math.PI + 0.1 + k * 0.09 : -0.1 - k * 0.09;
        parts.push(
          plume(
            base,
            [Math.cos(a), Math.abs(Math.sin(a)) * 0.4 + 0.05],
            (0.12 + rnd() * 0.04) * H,
            0.05 * H,
            plumeCol(0.2 + rnd() * 0.4),
            0.15,
          ),
        );
      }

  // --- neck (a slight S; behind the body plumes) and head
  const neckParts: string[] = [];
  const root = T([cx + rx * 0.72, cy - ry * 0.45]);
  const bend = add(P([cx, cy]), P(pose.bend));
  const head = add(P([cx, cy]), P(pose.head));
  const along = unit([head[0] - root[0], head[1] - root[1]]);
  const side = nrm(along); // the throat side for a neck going up and forward
  const s1 = add(lerp(root, bend, 0.45), mul(side, 0.018 * H));
  const s2 = add(lerp(bend, head, 0.5), mul(side, -0.012 * H));
  const neckJ = [
    { p: T([cx + rx * 0.55, cy - ry * 0.2]), w: 0.1 * H },
    { p: root, w: 0.066 * H },
    { p: s1, w: 0.048 * H },
    { p: bend, w: 0.038 * H },
    { p: s2, w: 0.032 * H },
    { p: head, w: 0.033 * H },
  ];
  const neckD = limb(neckJ, 0.8);
  // The lighter throat: a narrower band along the front of the neck.
  const throatD = limb(
    neckJ.slice(1).map((j) => ({ p: add(j.p, mul(side, j.w * 0.22)), w: j.w * 0.45 })),
    0.8,
  );
  const neckClip = clipOf([neckD]);
  const nl = vGrad(head[1], root[1], [
    [0, '#FFFFFF', 0.14],
    [1, '#000000', 0.16],
  ]);
  let down = '';
  for (let k = 0; k < 40; k++) {
    const t = rnd();
    const p = t < 0.5 ? lerp(root, bend, t / 0.5) : lerp(bend, head, (t - 0.5) / 0.5);
    down += `M${r2(p[0] + (rnd() - 0.5) * 0.03 * H)} ${r2(p[1] + (rnd() - 0.5) * 0.02 * H)}l${r2(-0.006 * H)} ${r2(0.004 * H)}`;
  }
  neckParts.push(
    el('defs', {}, nl.def, neckClip.def),
    el('path', { d: neckD, fill: C.neck, stroke: shade(C.neck, -0.32), 'stroke-width': r2(w) }),
    g(
      { 'clip-path': `url(#${neckClip.id})` },
      el('path', { d: throatD, fill: mix(C.neck, '#FFF4EA', 0.35), opacity: 0.8 }),
      el('path', {
        d: down,
        stroke: shade(C.neck, -0.3),
        'stroke-width': r2(w * 0.5),
        fill: 'none',
        opacity: 0.55,
      }),
    ),
    wash(neckClip.id, `url(#${nl.id})`, { x0: -H, y0: -1.5 * H, x1: H, y1: 0.6 * H }),
  );
  parts.push(...neckParts);

  // --- body: ruffled plumes ---------------------------------------------------------------
  const pts: V[] = [];
  const N = 56;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const under = Math.sin(a) > -0.15;
    const rear = Math.cos(a) < -0.35;
    const ruff =
      under || rear
        ? 0.07 * (0.5 + 0.5 * Math.cos(a * 15)) + (rnd() - 0.5) * 0.03
        : (rnd() - 0.5) * 0.012;
    const x = Math.cos(a) * rx * (1 + ruff);
    const y = Math.sin(a) * ry * (1 + ruff) * (Math.cos(a) < 0 ? 1.06 : 0.94) - Math.cos(a) * 0.025;
    pts.push(T([cx + x, cy + y]));
  }
  if (sit)
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      if (p !== undefined && p[1] > -0.012 * H)
        pts[k] = [p[0], -0.012 * H + (p[1] + 0.012 * H) * 0.12];
    }
  const bodyD = smoothD(pts, true, 0.75);
  const clip = clipOf([bodyD]);
  parts.push(el('defs', {}, clip.def), el('path', { d: bodyD, fill: C.coat }));
  // Feathers in overlapping rows, back to front, each a drop with a lit upper edge; the hen's
  // with pale tips and darker centres (mottled), the cock's black with a soft grey sheen.
  const feathers: string[] = [];
  const rows = 8;
  for (let j = 0; j < rows; j++) {
    const v = -1 + (2 * (j + 0.5)) / rows;
    const yy = cy + v * ry * 0.95;
    const cols = 9 + Math.round(rnd() * 2);
    for (let i = 0; i < cols; i++) {
      const u = -1.05 + (2.1 * (i + rnd() * 0.6)) / cols + (j % 2) * 0.05;
      if (u * u + v * v > 1.15) continue;
      const base = T([cx + u * rx, yy]);
      const tip = add(
        base,
        mul(unit(rot([-1, 0.55], [0, 0], pose.tilt)), (0.06 + rnd() * 0.025) * H),
      );
      const fd = plumeD(base, tip, (0.035 + rnd() * 0.012) * H);
      const lum = -v * 0.5 - u * 0.15 + (rnd() - 0.5) * 0.5;
      const fill = male
        ? mix(C.coat, lum > 0 ? C.lit : C.dark, Math.min(1, Math.abs(lum) * 0.8))
        : mix(
            mix(C.coat, rnd() < 0.3 ? '#5E5244' : '#8C7E6A', 0.5),
            lum > 0 ? C.lit : C.dark,
            Math.min(1, Math.abs(lum) * 0.6),
          );
      feathers.push(el('path', { d: fd, fill }));
      if (!male) {
        // The hen's pale feather edge round the tip.
        const e1 = lerp(base, tip, 0.55);
        feathers.push(
          el('path', {
            d: `M${r2(e1[0])} ${r2(e1[1] - 0.012 * H)}Q${r2(tip[0])} ${r2(tip[1] - 0.004 * H)} ${r2(e1[0])} ${r2(e1[1] + 0.012 * H)}`,
            fill: 'none',
            stroke: '#D8CEBC',
            'stroke-width': r2(w * 0.7),
            opacity: 0.75,
          }),
        );
      } else if (lum > -0.2)
        // The cock's soft grey sheen along each plume's upper edge.
        feathers.push(
          el('path', {
            d: `M${r2(base[0])} ${r2(base[1] - 0.01 * H)}Q${r2(lerp(base, tip, 0.5)[0])} ${r2(lerp(base, tip, 0.5)[1] - 0.014 * H)} ${r2(tip[0])} ${r2(tip[1])}`,
            fill: 'none',
            stroke: '#7A726C',
            'stroke-width': r2(w * 0.75),
            opacity: Math.min(0.85, 0.3 + lum * 0.6),
          }),
        );
    }
  }
  const light = vGrad((cy - ry) * H, (cy + ry) * H, [
    [0, '#FFFFFF', male ? 0.16 : 0.2],
    [0.45, '#FFFFFF', 0],
    [1, '#000000', 0.38],
  ]);
  parts.push(
    el('defs', {}, light.def),
    g({ 'clip-path': `url(#${clip.id})` }, ...feathers),
    wash(clip.id, `url(#${light.id})`, { x0: -H, y0: -1.5 * H, x1: H, y1: 0.2 * H }),
    el('path', {
      d: bodyD,
      fill: 'none',
      stroke: shade(C.coat, -0.35),
      'stroke-width': r2(w * 0.8),
      opacity: 0.6,
    }),
  );
  // The folded wing over the flank and, from its rear edge, the drooping plumes (white on the
  // cock, greyish-white on the hen) over the thigh and the tail.
  if (pose.wings === 'fold') {
    const wingD = smoothD(
      [
        T([cx + 0.13, cy - 0.06]),
        T([cx - 0.04, cy - 0.09]),
        T([cx - 0.17, cy - 0.01]),
        T([cx - 0.12, cy + 0.07]),
        T([cx + 0.08, cy + 0.05]),
      ],
      true,
      0.9,
    );
    parts.push(el('path', { d: wingD, fill: mix(C.coat, C.dark, 0.35), opacity: 0.55 }));
    for (let k = 0; k < 8; k++) {
      const base = T([cx - 0.05 - k * 0.022, cy + 0.035 + (k % 2) * 0.01]);
      parts.push(
        plume(
          base,
          rot([-0.9, 0.55 + k * 0.05], [0, 0], pose.tilt),
          (0.1 + rnd() * 0.05) * H,
          0.05 * H,
          plumeCol(0.1 + rnd() * 0.35),
          0.45,
        ),
      );
    }
  } else parts.push(fan(1, pose.wings === 'fan' ? 80 : 40, true));

  // The collar ruff where the bare neck meets the body plumes.
  const ruff: string[] = [];
  for (let k = 0; k < 9; k++) {
    const b0 = T([cx + rx * (0.5 + k * 0.045), cy - ry * (0.75 - k * 0.07)]);
    ruff.push(
      el('path', {
        d: plumeD(
          b0,
          add(b0, mul(unit(rot([0.4, 0.9], [0, 0], -10 + k * 6)), 0.045 * H)),
          0.03 * H,
        ),
        fill: mix(C.coat, C.lit, k % 2 === 0 ? 0.35 : 0.1),
      }),
    );
  }
  parts.push(g({}, ...ruff));
  const turn = pose.turn ?? 0;
  const hd = unit(pose.headDir);
  const hn = nrm(hd);
  const hp = (u: number, v: number): V => add(head, add(mul(hd, u * H), mul(hn, v * H)));
  const billLen = 0.075 * (1 - turn * 0.45);
  const skull = smoothD(
    [
      hp(-0.036, -0.012),
      hp(-0.012, -0.033),
      hp(0.025, -0.029),
      hp(0.032, 0.012),
      hp(0.0, 0.027),
      hp(-0.03, 0.019),
    ],
    true,
    0.85,
  );
  const upper = smoothD(
    [hp(0.015, -0.015), hp(0.02 + billLen, -0.006), hp(0.025 + billLen, 0.002), hp(0.02, 0.006)],
    true,
    0.6,
  );
  const lower =
    pose.open === true
      ? smoothD(
          [
            hp(0.015, 0.008),
            hp(0.018 + billLen, 0.032),
            hp(0.012 + billLen, 0.036),
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
  const er = 0.014 * H;
  let lashes = '';
  for (let k = 0; k < 5; k++) {
    const a = add(eye, mul(rot([0, -1], [0, 0], -50 + k * 22), er * 1.05));
    const b = add(eye, mul(rot([0, -1], [0, 0], -58 + k * 24), er * 1.8));
    lashes += `M${r2(a[0])} ${r2(a[1])}L${r2(b[0])} ${r2(b[1])}`;
  }
  let crown = '';
  for (let k = 0; k < 9; k++) {
    const p = hp(-0.03 + k * 0.006, -0.028 + Math.abs(k - 4) * 0.0018);
    crown += `M${r2(p[0])} ${r2(p[1])}l${r2((rnd() - 0.7) * 0.012 * H)} ${r2(-0.013 * H)}`;
  }
  const skinEdge = shade(C.neck, -0.35);
  parts.push(
    el('path', {
      d: lower,
      fill: shade(C.skin, -0.1),
      stroke: skinEdge,
      'stroke-width': r2(w * 0.8),
    }),
    pose.open === true
      ? el('path', {
          d: smoothD([hp(0.02, 0.0), hp(0.02 + billLen * 0.8, 0.013), hp(0.02, 0.013)], true, 0.5),
          fill: '#8A4A48',
        })
      : '',
    el('path', { d: skull, fill: C.neck, stroke: skinEdge, 'stroke-width': r2(w * 0.8) }),
    el('path', {
      d: ellipseD(hp(0.008, 0.012)[0], hp(0.008, 0.012)[1], 0.014 * H, 0.008 * H),
      fill: mix(C.neck, '#FFF4EA', 0.4),
      opacity: 0.7,
    }),
    el('path', {
      d: upper,
      fill: mix(C.skin, '#E8D2C0', 0.35),
      stroke: skinEdge,
      'stroke-width': r2(w * 0.8),
    }),
    el('path', {
      d: crown,
      stroke: shade(C.coat, 0.15),
      'stroke-width': r2(w * 0.8),
      fill: 'none',
      'stroke-linecap': 'round',
    }),
    el('path', { d: ellipseD(eye[0], eye[1], er * 1.3, er * 1.2), fill: shade(C.neck, -0.3) }),
    el('path', { d: ellipseD(eye[0], eye[1], er, er), fill: '#1E1410' }),
    el('path', {
      d: ellipseD(eye[0] - er * 0.3, eye[1] - er * 0.35, er * 0.33, er * 0.28),
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
