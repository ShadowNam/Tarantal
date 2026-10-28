// 1.9.4 (D-057, art bible §4.2c) The Bushveld baobab, redrawn at the camelthorn quality bar
// (D-035) after the product owner's review (26 Oct): one smooth silhouette in which a fluted,
// slightly buttressed trunk flows into six thick, root-like limbs (no collar, no hard join);
// smooth grey-pink bark with horizontal wrinkles, vertical fluting, old elephant scars and lichen;
// light from the upper left, the limbs' undersides in shade; crooked branches and fine twigs; the
// hollows the residents use (src/game/view/tree/baobabShape.ts), the buffalo weavers' stick nests;
// small hairy pods hanging on long thin stalks in little groups. Drawing coords = prop px.
import {
  BAOBAB_LIMBS,
  HOLLOWS,
  POD_CLUSTER,
  STICK_NESTS,
  TRUNK,
  limbAt,
  limbDir,
  limbWidth,
  type BaobabLimb,
  type Hollow,
} from '../../src/game/view/tree/baobabShape';
import { blurFilter, clamp, soften, zigzag } from './camelthorn';
import { baobabPod } from './fruitLook';
import { fruit } from './fruitSink';
import { mix, nextId, shade, type Pt, type Rnd } from './scenery';
import type { Paint } from './species';
import { el, ellipseD, g, polyD, r2 } from './svg';

type Stop = readonly [number, string, number?];

export function gradient(
  kind: 'linear' | 'radial',
  attrs: Record<string, string | number>,
  stops: readonly Stop[],
): { id: string; def: string; url: string } {
  const id = nextId();
  const body = stops
    .map(([o, c, a]) =>
      el('stop', { offset: o, 'stop-color': c, ...(a === undefined ? {} : { 'stop-opacity': a }) }),
    )
    .join('');
  const def = el(
    'defs',
    {},
    el(`${kind}Gradient`, { id, gradientUnits: 'userSpaceOnUse', ...attrs }, body),
  );
  return { id, def, url: `url(#${id})` };
}

/** A tapered limb as a closed outline (left edge out, rounded tip, right edge back). */
interface Piece {
  readonly d: string;
}

export function limbOutline(l: BaobabLimb, n = 28): { d: string; left: Pt[]; right: Pt[] } {
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = limbAt(l, t);
    const d = limbDir(l, t);
    const h = limbWidth(l, t) / 2;
    left.push([p[0] - d[1] * h, p[1] + d[0] * h]);
    right.push([p[0] + d[1] * h, p[1] - d[0] * h]);
  }
  const tip = limbAt(l, 1);
  const dir = limbDir(l, 1);
  // A rounded tip (review T3: never a flat, sawn-off end); the limb runs on into finer branches.
  const cap: Pt[] = [];
  for (let k = 1; k < 6; k++) {
    const a = (k / 6) * Math.PI;
    const h = l.w1 / 2;
    // From the left edge round the end to the right edge.
    const nx = -dir[1];
    const ny = dir[0];
    cap.push([
      tip[0] + nx * h * Math.cos(a) + dir[0] * h * 1.4 * Math.sin(a),
      tip[1] + ny * h * Math.cos(a) + dir[1] * h * 1.4 * Math.sin(a),
    ]);
  }
  return { d: polyD([...left, ...cap, ...[...right].reverse()]), left, right };
}

/** A crooked branch from `a` to `b` as a tapered outline, with its centre line. */
export function branch(
  rnd: Rnd,
  a: Pt,
  b: Pt,
  w0: number,
  w1: number,
): { d: string; pts: Pt[]; w: number[] } {
  const raw = soften(zigzag(rnd, a, b, 2, 0.12));
  // Resample to a smooth polyline.
  const pts: Pt[] = [];
  for (let i = 0; i < raw.length - 1; i++) {
    const p = raw[i] as Pt;
    const q = raw[i + 1] as Pt;
    for (let k = 0; k < 4; k++) {
      const t = k / 4;
      pts.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  pts.push(b);
  const w = pts.map((_, i) => w0 + (w1 - w0) * Math.pow(i / (pts.length - 1), 0.9));
  const left: Pt[] = [];
  const right: Pt[] = [];
  pts.forEach((p, i) => {
    const prev = pts[Math.max(0, i - 1)] as Pt;
    const next = pts[Math.min(pts.length - 1, i + 1)] as Pt;
    const ang = Math.atan2(next[1] - prev[1], next[0] - prev[0]);
    const h = (w[i] ?? 1) / 2;
    left.push([p[0] - Math.sin(ang) * h, p[1] + Math.cos(ang) * h]);
    right.push([p[0] + Math.sin(ang) * h, p[1] - Math.cos(ang) * h]);
  });
  return { d: polyD([...left, b, ...[...right].reverse()]), pts, w };
}

/** The trunk's half width at height y (foot flare, waist, swelling shoulder). */
function trunkHalf(y: number): number {
  const T = TRUNK;
  if (y >= 200) {
    const s = (y - 200) / (T.foot - 200);
    return T.baseHalf + (T.footHalf - T.baseHalf) * s * s;
  }
  if (y >= T.waistY) {
    const s = (200 - y) / (200 - T.waistY);
    return T.baseHalf + (T.waistHalf - T.baseHalf) * (s * s * (3 - 2 * s));
  }
  const s = clamp((T.waistY - y) / (T.waistY - T.shoulderY), 0, 1.4);
  return T.waistHalf + (T.shoulderHalf - T.waistHalf) * s * s;
}

/** The light comes from the upper left: 1 on the lit side of a horizontal span, −1 shaded. */
const LIGHT: Pt = [-0.6, -0.8];

export interface BaobabNearOpts {
  /** Content perches (branch tips the birds land on). */
  readonly reach: readonly Pt[];
}

/**
 * The near (prop) baobab. `p.tint` hazes colours per plane (the mid layer here).
 */
export function baobabNear(rnd: Rnd, p: Paint, o: BaobabNearOpts): string {
  const bark = p.tint('#9A8A80');
  const barkPink = p.tint('#A88F86');
  const ink = mix(p.pen.ink, shade(bark, -0.5), 0.35);
  const inkW = 2.4;
  const T = TRUNK;
  const parts: string[] = [];

  // --- ground shadow -------------------------------------------------------------------------
  const blur = blurFilter(5);
  parts.push(
    blur.def,
    g(
      { filter: `url(#${blur.id})` },
      el('path', { d: ellipseD(30, T.foot + 2, 230, 18), fill: '#2A1A14', opacity: 0.3 }),
    ),
  );

  // --- the pieces of one silhouette ----------------------------------------------------------
  const n = ringNoiseLocal(rnd);
  const tl: Pt[] = [];
  const tr: Pt[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const y = T.foot - ((T.foot - (T.shoulderY - 10)) * i) / steps;
    const h = trunkHalf(y);
    // Root lobes at the foot: a few bulges where the buttress roots run into the ground.
    const lobe = y > 210 ? Math.sin(((y - 210) / 50) * Math.PI) * 6 : 0;
    tl.push([-h - lobe + n(y * 0.02) * 3, y]);
    tr.push([h + lobe * 0.7 + n(y * 0.02 + 5) * 3, y]);
  }
  const top = T.shoulderY - 10;
  const trunkD = polyD([
    ...tl,
    [-T.shoulderHalf * 0.6, top - 26],
    [0, top - 34],
    [T.shoulderHalf * 0.6, top - 26],
    ...[...tr].reverse(),
  ]);
  const limbs = BAOBAB_LIMBS.map((l) => ({ l, ...limbOutline(l) }));

  // Fillets: where the outer limbs leave the trunk's sides, and in each crotch between limbs, a
  // filled curve so the bark flows from one into the other.
  const fillets: string[] = [];
  const first = limbs[0];
  const last = limbs[limbs.length - 1];
  if (first !== undefined) {
    const a = trunkPt(tl, 12);
    const b = first.left[8] as Pt;
    const c: Pt = [a[0] + 4, b[1] + 6];
    const inner = limbAt(first.l, 0.08);
    fillets.push(
      `M${r2(a[0])} ${r2(a[1])}Q${r2(c[0])} ${r2(c[1])} ${r2(b[0])} ${r2(b[1])}L${r2(inner[0])} ${r2(inner[1])}L${r2(a[0] + 30)} ${r2(a[1])}Z`,
    );
  }
  if (last !== undefined) {
    const a = trunkPt(tr, 12);
    const b = last.right[8] as Pt;
    const c: Pt = [a[0] - 4, b[1] + 6];
    const inner = limbAt(last.l, 0.08);
    fillets.push(
      `M${r2(a[0])} ${r2(a[1])}Q${r2(c[0])} ${r2(c[1])} ${r2(b[0])} ${r2(b[1])}L${r2(inner[0])} ${r2(inner[1])}L${r2(a[0] - 30)} ${r2(a[1])}Z`,
    );
  }
  for (let i = 0; i + 1 < limbs.length; i++) {
    const A = limbs[i];
    const B = limbs[i + 1];
    if (A === undefined || B === undefined) continue;
    // The edges that face each other: A's right (clockwise) edge and B's left.
    const k = 5;
    const a = A.right[k] as Pt;
    const b = B.left[k] as Pt;
    const mid: Pt = [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 10];
    const ia = limbAt(A.l, 0.05);
    const ib = limbAt(B.l, 0.05);
    fillets.push(
      `M${r2(ia[0])} ${r2(ia[1])}L${r2(a[0])} ${r2(a[1])}Q${r2(mid[0])} ${r2(mid[1])} ${r2(b[0])} ${r2(b[1])}L${r2(ib[0])} ${r2(ib[1])}Z`,
    );
  }

  // Branches off each limb's outer half, the content perches among them.
  const branches: { d: string; pts: Pt[]; w: number[] }[] = [];
  const tips: Pt[] = [];
  const reach = [...o.reach];
  BAOBAB_LIMBS.forEach((l, i) => {
    // The limb forks at its end into two finer branches (review T3), twigs on their tips.
    const end = limbAt(l, 1);
    const ed = limbDir(l, 1);
    for (const side of [-1, 1]) {
      const ang = Math.atan2(ed[1], ed[0]) + side * (0.35 + rnd() * 0.3);
      const len = 30 + rnd() * 26;
      const fork: Pt = [
        clamp(end[0] + Math.cos(ang) * len, -246, 246),
        Math.max(end[1] + Math.sin(ang) * len, -312),
      ];
      const from = limbAt(l, 0.94);
      branches.push(branch(rnd, from, fork, limbWidth(l, 0.94) * 0.75, 2.5));
      tips.push(fork);
    }
    const count = 2 + (i % 2);
    for (let b = 0; b < count; b++) {
      const t = 0.55 + b * 0.16 + rnd() * 0.06;
      const s = limbAt(l, t);
      const d = limbDir(l, t);
      const side = b % 2 === 0 ? 1 : -1;
      const ang = Math.atan2(d[1], d[0]) + side * (0.5 + rnd() * 0.4);
      const len = 50 + rnd() * 40;
      let end: Pt = [s[0] + Math.cos(ang) * len, s[1] + Math.sin(ang) * len - 10];
      // A content perch close by takes this branch's tip.
      const ri = reach.findIndex((r) => Math.hypot(r[0] - end[0], r[1] - end[1]) < 90);
      if (ri >= 0) {
        end = reach[ri] as Pt;
        reach.splice(ri, 1);
      }
      if (end[1] > s[1] + 10) end = [end[0], s[1] - 20];
      // Inside the texture (frame ±300 px), with room for the twigs.
      end = [clamp(end[0], -238, 238), Math.max(end[1], -300)];
      const w0 = limbWidth(l, t) * 0.5;
      branches.push(branch(rnd, s, end, w0, Math.max(3, w0 * 0.3)));
      tips.push(end);
    }
  });
  // Perches no branch came near: a branch of their own from the nearest limb.
  for (const r of reach) {
    let best: { l: BaobabLimb; t: number } | null = null;
    let dist = Infinity;
    for (const l of BAOBAB_LIMBS)
      for (let t = 0.4; t <= 0.95; t += 0.05) {
        const q = limbAt(l, t);
        const dd = Math.hypot(q[0] - r[0], q[1] - r[1]);
        if (q[1] > r[1] && dd < dist) {
          dist = dd;
          best = { l, t };
        }
      }
    if (best === null) continue;
    const s = limbAt(best.l, best.t);
    const w0 = limbWidth(best.l, best.t) * 0.5;
    branches.push(branch(rnd, s, r, w0, Math.max(3, w0 * 0.3)));
    tips.push(r);
  }

  const pieces: Piece[] = [
    { d: trunkD },
    ...limbs.map((x) => ({ d: x.d })),
    ...fillets.map((d) => ({ d })),
    ...branches.map((b) => ({ d: b.d })),
  ];

  // Twigs behind the silhouette: fine, crooked, greyer toward the tips.
  const twigs: string[] = [];
  const twigsFine: string[] = [];
  for (const t of tips)
    for (let k = 0; k < 4; k++) {
      const ang = -Math.PI / 2 + (rnd() - 0.5) * 2.6;
      const len = 16 + rnd() * 26;
      const end: Pt = [
        clamp(t[0] + Math.cos(ang) * len * 1.2, -288, 288),
        Math.max(t[1] + Math.sin(ang) * len, -338),
      ];
      const z = zigzag(rnd, t, end, 2, 0.22);
      twigs.push(polyD(z, false));
      // Two fine side shoots.
      for (let s = 0; s < 2; s++) {
        const q = z[1 + s] ?? end;
        const a2 = ang + (s === 0 ? -0.7 : 0.7);
        const l2 = len * (0.3 + rnd() * 0.25);
        const e2: Pt = [
          clamp(q[0] + Math.cos(a2) * l2, -292, 292),
          Math.max(q[1] + Math.sin(a2) * l2, -350),
        ];
        twigsFine.push(polyD([q, e2], false));
      }
    }
  parts.push(
    el('path', {
      d: twigs.join(''),
      fill: 'none',
      stroke: shade(bark, -0.32),
      'stroke-width': 1.5,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: twigsFine.join(''),
      fill: 'none',
      stroke: shade(bark, -0.15),
      'stroke-width': 0.9,
      'stroke-linecap': 'round',
    }),
  );

  // Pass 1: the ink outline of the whole silhouette (strokes under every fill → one outline).
  // Each piece is its own path: joined into one, overlapping outlines of opposite winding
  // would cancel and leave holes.
  parts.push(
    g(
      { fill: ink, stroke: ink, 'stroke-width': inkW * 2, 'stroke-linejoin': 'round' },
      ...pieces.map((x) => el('path', { d: x.d })),
    ),
  );
  // Pass 2: the bark, one paint across trunk and limbs.
  const base = gradient('linear', { x1: -140, y1: 0, x2: 150, y2: 0 }, [
    [0, shade(barkPink, 0.3)],
    [0.3, shade(barkPink, 0.12)],
    [0.55, bark],
    [0.8, shade(bark, -0.32)],
    [1, shade(bark, -0.24)],
  ]);
  parts.push(base.def, g({ fill: base.url }, ...pieces.map((x) => el('path', { d: x.d }))));

  // Everything below is clipped to the silhouette.
  const clipId = nextId();
  parts.push(el('clipPath', { id: clipId }, ...pieces.map((x) => el('path', { d: x.d }))));
  const inner: string[] = [];

  // Limb shading: a lit band along the upper (light) side, the underside in shade.
  for (const L of limbs) {
    const lit: Pt[] = [];
    const litIn: Pt[] = [];
    const dark: Pt[] = [];
    const darkIn: Pt[] = [];
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      const c = limbAt(L.l, t);
      const d = limbDir(L.l, t);
      const h = limbWidth(L.l, t) / 2;
      // The normal toward the light.
      let nx = -d[1];
      let ny = d[0];
      if (nx * LIGHT[0] + ny * LIGHT[1] < 0) {
        nx = -nx;
        ny = -ny;
      }
      lit.push([c[0] + nx * h * 1.1, c[1] + ny * h * 1.1]);
      litIn.push([c[0] + nx * h * 0.35, c[1] + ny * h * 0.35]);
      dark.push([c[0] - nx * h * 1.1, c[1] - ny * h * 1.1]);
      darkIn.push([c[0] - nx * h * 0.05, c[1] - ny * h * 0.05]);
    }
    inner.push(
      el('path', {
        d: polyD([...dark, ...[...darkIn].reverse()]),
        fill: shade(bark, -0.36),
        opacity: 0.55,
      }),
      el('path', {
        d: polyD([...lit, ...[...litIn].reverse()]),
        fill: shade(barkPink, 0.26),
        opacity: 0.5,
      }),
    );
  }
  for (const b of branches) {
    const sh: Pt[] = [];
    const shIn: Pt[] = [];
    b.pts.forEach((c, i) => {
      const prev = b.pts[Math.max(0, i - 1)] as Pt;
      const next = b.pts[Math.min(b.pts.length - 1, i + 1)] as Pt;
      const ang = Math.atan2(next[1] - prev[1], next[0] - prev[0]);
      let nx = -Math.sin(ang);
      let ny = Math.cos(ang);
      if (nx * LIGHT[0] + ny * LIGHT[1] > 0) {
        nx = -nx;
        ny = -ny;
      }
      const h = (b.w[i] ?? 1) / 2;
      sh.push([c[0] + nx * h * 1.1, c[1] + ny * h * 1.1]);
      shIn.push([c[0], c[1]]);
    });
    inner.push(
      el('path', {
        d: polyD([...sh, ...[...shIn].reverse()]),
        fill: shade(bark, -0.34),
        opacity: 0.5,
      }),
    );
  }
  // The trunk: a core shadow right of centre, a soft bounce light at the far right edge, and the
  // limbs' shade on the shoulder.
  const soft = blurFilter(9);
  const softer = blurFilter(16);
  inner.push(
    soft.def,
    softer.def,
    g(
      { filter: `url(#${softer.id})` },
      el('path', { d: ellipseD(54, 120, 34, 150), fill: shade(bark, -0.42), opacity: 0.62 }),
      el('path', { d: ellipseD(-58, 110, 22, 140), fill: shade(barkPink, 0.3), opacity: 0.45 }),
      el('path', { d: ellipseD(0, -24, 120, 26), fill: shade(bark, -0.4), opacity: 0.4 }),
    ),
  );
  // Crotch shadows between the limbs.
  for (let i = 0; i + 1 < BAOBAB_LIMBS.length; i++) {
    const a = limbAt(BAOBAB_LIMBS[i] as BaobabLimb, 0.16);
    const b = limbAt(BAOBAB_LIMBS[i + 1] as BaobabLimb, 0.16);
    inner.push(
      g(
        { filter: `url(#${soft.id})` },
        el('path', {
          d: ellipseD((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 6, 10, 14),
          fill: shade(bark, -0.55),
          opacity: 0.6,
        }),
      ),
    );
  }

  // Vertical fluting: from the foot up the trunk and on into the limbs' bases.
  const flutesDark: string[] = [];
  const flutesLit: string[] = [];
  for (let k = 0; k < 9; k++) {
    const f = (k + 0.5) / 9 - 0.5;
    const fx = f * T.footHalf * 1.8;
    const limb =
      BAOBAB_LIMBS[Math.min(BAOBAB_LIMBS.length - 1, Math.floor((f + 0.5) * BAOBAB_LIMBS.length))];
    const end = limb === undefined ? ([fx * 0.6, top] as Pt) : limbAt(limb, 0.22);
    const wx = f * T.waistHalf * 1.7;
    const d = `M${r2(fx)} ${r2(T.foot + 4)}C${r2(wx + (rnd() - 0.5) * 8)} ${r2(150)} ${r2(wx + (rnd() - 0.5) * 8)} ${r2(40)} ${r2((wx + end[0]) / 2)} ${r2(-20)}S${r2(end[0])} ${r2(end[1] + 20)} ${r2(end[0])} ${r2(end[1])}`;
    flutesDark.push(d);
    flutesLit.push(d);
  }
  inner.push(
    el('path', {
      d: flutesDark.join(''),
      fill: 'none',
      stroke: shade(bark, -0.32),
      'stroke-width': 7,
      opacity: 0.22,
    }),
    el('path', {
      d: flutesDark.join(''),
      fill: 'none',
      stroke: shade(bark, -0.4),
      'stroke-width': 1.6,
      opacity: 0.45,
    }),
    el('path', {
      d: flutesLit.join(''),
      fill: 'none',
      stroke: shade(barkPink, 0.35),
      'stroke-width': 1.4,
      opacity: 0.45,
      transform: 'translate(-3.5 0)',
    }),
  );

  // Horizontal wrinkles and folds: arcs that follow the trunk's round, denser at the foot and
  // the shoulder; across each limb, short folds.
  const wrinkles: string[] = [];
  const wrinklesLit: string[] = [];
  for (let k = 0; k < 150; k++) {
    const u = rnd();
    const y = u < 0.35 ? 170 + rnd() * 85 : u < 0.6 ? -40 + rnd() * 70 : -40 + rnd() * 300;
    const hw = trunkHalf(y);
    const cx = (rnd() * 2 - 1) * hw * 0.92;
    const len = 6 + rnd() * 22;
    // Sag: the fold bends down toward the sides (the trunk is round).
    const sag = (cx / hw) * len * 0.18 + len * 0.08;
    const d = `M${r2(cx - len / 2)} ${r2(y)}q${r2(len / 2)} ${r2(sag)} ${r2(len)} ${r2(sag * 0.4)}`;
    wrinkles.push(d);
    if (cx < hw * 0.3)
      wrinklesLit.push(
        `M${r2(cx - len / 2)} ${r2(y + 1.6)}q${r2(len / 2)} ${r2(sag)} ${r2(len)} ${r2(sag * 0.4)}`,
      );
  }
  for (const L of BAOBAB_LIMBS)
    for (let k = 0; k < 18; k++) {
      const t = 0.08 + rnd() * 0.8;
      const c = limbAt(L, t);
      const d = limbDir(L, t);
      const h = limbWidth(L, t) / 2;
      const off = (rnd() - 0.5) * h;
      const len = h * (0.5 + rnd() * 0.7);
      const px = c[0] - d[1] * off;
      const py = c[1] + d[0] * off;
      const ex = -d[1] * len;
      const ey = d[0] * len;
      wrinkles.push(
        `M${r2(px - ex / 2)} ${r2(py - ey / 2)}q${r2(ex / 2 + d[0] * 2)} ${r2(ey / 2 + d[1] * 2)} ${r2(ex)} ${r2(ey)}`,
      );
    }
  inner.push(
    el('path', {
      d: wrinkles.join(''),
      fill: 'none',
      stroke: shade(bark, -0.38),
      'stroke-width': 1.2,
      opacity: 0.55,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: wrinklesLit.join(''),
      fill: 'none',
      stroke: shade(barkPink, 0.38),
      'stroke-width': 0.9,
      opacity: 0.5,
      'stroke-linecap': 'round',
    }),
  );

  // Old elephant scars: paler, pinkish gouged patches with dark grooves.
  for (const s of [
    { x: -14, y: 214, w: 26, h: 20, a: -0.5 },
    { x: 78, y: 196, w: 16, h: 26, a: -0.8 },
  ]) {
    const pts: Pt[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = 1 + (rnd() - 0.5) * 0.35;
      pts.push([s.x + Math.cos(a) * s.w * r, s.y + Math.sin(a) * s.h * r]);
    }
    const grooves: string[] = [];
    for (let k = 0; k < 5; k++) {
      const ox = (k - 2) * s.w * 0.32;
      grooves.push(
        `M${r2(s.x + ox - Math.cos(s.a) * s.h * 0.7)} ${r2(s.y - s.h * 0.7)}l${r2(Math.cos(s.a) * s.h * 1.3 + (rnd() - 0.5) * 3)} ${r2(s.h * 1.3)}`,
      );
    }
    inner.push(
      el('path', { d: polyD(pts), fill: shade(barkPink, 0.22), opacity: 0.45 }),
      el('path', {
        d: grooves.join(''),
        fill: 'none',
        stroke: shade(bark, -0.45),
        'stroke-width': 1.6,
        opacity: 0.5,
        'stroke-linecap': 'round',
      }),
      el('path', {
        d: grooves.join(''),
        fill: 'none',
        stroke: shade(barkPink, 0.5),
        'stroke-width': 0.9,
        opacity: 0.6,
        transform: 'translate(-1.5 0)',
      }),
    );
  }

  // Lichen: small pale grey-green and ochre spots in loose clusters, on the trunk and limbs.
  const lichens: Record<string, string[]> = { '#C8CAAE': [], '#B3B78E': [], '#D2B46C': [] };
  const keys = Object.keys(lichens);
  const centres: Pt[] = [
    [-70, 70],
    [-40, 150],
    [30, 30],
    [-88, -40],
    [96, -60],
    [-20, 100],
    [10, 236],
  ];
  for (const c of centres)
    for (let k = 0; k < 14; k++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 14;
      const key = keys[Math.floor(rnd() * keys.length)] ?? '#C8CAAE';
      const s = 0.8 + rnd() * 2.2;
      lichens[key]?.push(
        ellipseD(c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r * 0.8, s, s * 0.8),
      );
    }
  for (const [col, ds] of Object.entries(lichens))
    inner.push(el('path', { d: ds.join(''), fill: p.tint(col), opacity: 0.62 }));

  // The hollows.
  inner.push(cavity(HOLLOWS.owl, bark, barkPink, 5));
  inner.push(cavity(HOLLOWS.galago, bark, barkPink, 3));
  inner.push(cavity(HOLLOWS.squirrel, bark, barkPink, 2.5));
  inner.push(sealedSlit(HOLLOWS.slit, p));
  inner.push(beeCrack(HOLLOWS.bees, p));

  parts.push(g({ 'clip-path': `url(#${clipId})` }, ...inner));

  // The buffalo weavers' stick nests, on top of their limbs.
  for (const nst of STICK_NESTS) parts.push(stickNest(rnd, nst, p));

  // The secret pod cluster (content: 22 × 34 at (110, −120)): three pods on long stalks from
  // limb 5's underside. They stay put (the sim's secret drops them; FruitView's pods swing).
  const cl = BAOBAB_LIMBS[POD_CLUSTER.limb];
  if (cl !== undefined) {
    const under = limbUnder(cl, POD_CLUSTER.t);
    const pods: { x: number; y: number; rx: number; ry: number; top: Pt }[] = [
      {
        x: POD_CLUSTER.x - 10,
        y: POD_CLUSTER.y + 26,
        rx: 5.5,
        ry: 11,
        top: [under[0] - 6, under[1]],
      },
      {
        x: POD_CLUSTER.x + 3,
        y: POD_CLUSTER.y + 32,
        rx: 6,
        ry: 12.5,
        top: [under[0] + 1, under[1] + 1],
      },
      {
        x: POD_CLUSTER.x + 14,
        y: POD_CLUSTER.y + 20,
        rx: 5,
        ry: 10,
        top: [under[0] + 7, under[1] + 2],
      },
    ];
    for (const q of pods) {
      const d = baobabPod(q.x, q.y, q.rx, q.ry, q.top, ink);
      parts.push(g({}, d.stalk ?? '', d.body));
    }
  }
  // The pods that swing and drop (v1.7c, D-047; sprites): in pairs and threes under the limbs.
  const groups: { limb: number; t: number; n: number }[] = [
    { limb: 0, t: 0.78, n: 2 },
    { limb: 2, t: 0.72, n: 2 },
    { limb: 5, t: 0.8, n: 3 },
  ];
  for (const gr of groups) {
    const l = BAOBAB_LIMBS[gr.limb];
    if (l === undefined) continue;
    for (let k = 0; k < gr.n; k++) {
      const t = gr.t + (k - (gr.n - 1) / 2) * 0.05;
      const top = limbUnder(l, t);
      const rx = 4.6 + rnd() * 1.4;
      const ry = rx * (1.9 + rnd() * 0.4);
      const len = 22 + rnd() * 22;
      const px = top[0] + (rnd() - 0.5) * 6;
      const py = top[1] + len + ry;
      const drawn = baobabPod(px, py, rx, ry, top, ink);
      parts.push(
        fruit({
          species: 'baobab_pod',
          motion: 'hang',
          x: top[0],
          y: top[1],
          ground: T.foot,
          reach: Math.hypot(px - top[0], py - top[1]) + ry + 6,
          svg: g({}, drawn.stalk ?? '', drawn.body),
          hi: () => drawn,
          trunk: { x: 0, half: T.baseHalf + 30 },
        }),
      );
    }
  }
  return g({}, ...parts);
}

/** The underside of a limb at t (where a stalk hangs from). */
function limbUnder(l: BaobabLimb, t: number): Pt {
  const c = limbAt(l, t);
  const d = limbDir(l, t);
  let nx = -d[1];
  let ny = d[0];
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const h = limbWidth(l, t) / 2;
  return [c[0] + nx * h * 0.85, c[1] + ny * h * 0.85];
}

function trunkPt(side: readonly Pt[], fromTop: number): Pt {
  return side[Math.max(0, side.length - 1 - fromTop)] as Pt;
}

/** A small smooth noise in [−1, 1]. */
function ringNoiseLocal(rnd: Rnd): (t: number) => number {
  const a = rnd() * 6;
  const b = rnd() * 6;
  return (t: number) => Math.sin(t * 2.1 + a) * 0.6 + Math.sin(t * 4.7 + b) * 0.4;
}

/**
 * A hollow's opening: a swollen lip of healed bark (lit above left), a dark inside that is
 * darkest under the upper lip, and a pale worn sill.
 */
function cavity(h: Hollow, bark: string, barkPink: string, lip: number): string {
  const inside = gradient(
    'radial',
    { cx: h.x + h.rx * 0.15, cy: h.y + h.ry * 0.3, r: Math.max(h.rx, h.ry) * 1.1 },
    [
      [0, '#2A1E18'],
      [0.7, '#140D0A'],
      [1, '#0C0806'],
    ],
  );
  return g(
    {},
    inside.def,
    // The healed lip: a ring of swollen bark, its upper left lit and its lower right in shade.
    el('path', {
      d: ellipseD(h.x + 1, h.y + 1.5, h.rx + lip, h.ry + lip),
      fill: shade(bark, -0.3),
      opacity: 0.8,
    }),
    el('path', {
      d: ellipseD(h.x - lip * 0.25, h.y - lip * 0.3, h.rx + lip * 0.8, h.ry + lip * 0.8),
      fill: shade(barkPink, 0.22),
    }),
    el('path', { d: ellipseD(h.x, h.y, h.rx, h.ry), fill: inside.url }),
    // The upper lip's shadow inside, and the worn sill.
    el('path', {
      d: ellipseD(h.x, h.y - h.ry * 0.45, h.rx * 0.95, h.ry * 0.5),
      fill: '#000000',
      opacity: 0.35,
    }),
    el('path', {
      d: `M${r2(h.x - h.rx * 0.8)} ${r2(h.y + h.ry * 0.62)}Q${r2(h.x)} ${r2(h.y + h.ry * 1.08)} ${r2(h.x + h.rx * 0.8)} ${r2(h.y + h.ry * 0.62)}`,
      fill: 'none',
      stroke: shade(barkPink, 0.4),
      'stroke-width': clamp(lip * 0.45, 0.8, 2),
      opacity: 0.8,
      'stroke-linecap': 'round',
    }),
  );
}

/** The hornbill's nest: a hole the female has sealed with mud and droppings, leaving a narrow
 *  vertical slit. */
function sealedSlit(h: Hollow, p: Paint): string {
  // Review T2: dried mud close to the bark's grey-brown, a lumpy, irregular edge, crumbs and
  // cracks; a narrow, uneven vertical slit (never a smooth oval with a line: a cat's eye).
  const rnd = (() => {
    let a = 0x51a7;
    return (): number => {
      a = (Math.imul(a, 1103515245) + 12345) >>> 0;
      return (a >>> 8) / 16777216;
    };
  })();
  const mud = p.tint('#857565');
  const blob = (sx: number, sy: number, lump: number): Pt[] => {
    const pts: Pt[] = [];
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const r = 1 + (rnd() - 0.5) * lump;
      pts.push([
        h.x + Math.cos(a) * sx * r,
        h.y + Math.sin(a) * sy * r * (Math.sin(a) > 0 ? 1.1 : 1),
      ]);
    }
    return pts;
  };
  const crumbs: string[] = [];
  for (let k = 0; k < 16; k++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd());
    crumbs.push(
      ellipseD(
        h.x + Math.cos(a) * h.rx * 4.4 * r,
        h.y + Math.sin(a) * h.ry * 1.25 * r,
        0.9 + rnd() * 1.4,
        0.8 + rnd() * 1.1,
      ),
    );
  }
  // The slit: a ragged dark sliver, wider in places.
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const y = h.y - h.ry + t * h.ry * 2;
    const w = h.rx * (0.35 + 0.55 * Math.sin(Math.PI * t)) * (0.7 + rnd() * 0.6);
    const x = h.x + Math.sin(t * 5.3) * 0.8;
    left.push([x - w * 0.5, y]);
    right.push([x + w * 0.5, y]);
  }
  return g(
    {},
    el('path', { d: polyD(blob(h.rx * 5.6, h.ry * 1.42, 0.45)), fill: shade(mud, -0.3) }),
    el('path', { d: polyD(blob(h.rx * 5, h.ry * 1.3, 0.4)), fill: mud }),
    el('path', { d: crumbs.join(''), fill: shade(mud, 0.18), opacity: 0.7 }),
    el('path', {
      d: `M${r2(h.x - h.rx * 3.4)} ${r2(h.y - h.ry * 0.3)}l${r2(h.rx * 1.6)} ${r2(1.6)}l${r2(h.rx)} ${r2(-0.8)}M${r2(h.x + h.rx * 1.2)} ${r2(h.y + h.ry * 0.55)}l${r2(h.rx * 1.5)} ${r2(-1.2)}`,
      fill: 'none',
      stroke: shade(mud, -0.4),
      'stroke-width': 0.8,
      opacity: 0.8,
    }),
    el('path', { d: polyD([...left, ...[...right].reverse()]), fill: '#140D0A' }),
  );
}

/** The bees' crack: a dark split in the bark with a glint of wax comb. */
function beeCrack(h: Hollow, p: Paint): string {
  return g(
    {},
    el('path', { d: ellipseD(h.x, h.y, h.rx, h.ry), fill: '#160E0A' }),
    el('path', {
      d: ellipseD(h.x + h.rx * 0.2, h.y + h.ry * 0.3, h.rx * 0.45, h.ry * 0.35),
      fill: p.tint('#B88A2E'),
      opacity: 0.8,
    }),
  );
}

/** A red-billed buffalo weaver nest: an untidy heap of thorny sticks with an entrance below. */
function stickNest(rnd: Rnd, n: { x: number; y: number; w: number; h: number }, p: Paint): string {
  const dark = p.tint('#4A3A2C');
  const mid = p.tint('#6E5A44');
  const pale = p.tint('#9C8A6E');
  const sticks: Record<string, string[]> = { [dark]: [], [mid]: [], [pale]: [] };
  for (let k = 0; k < 120; k++) {
    const a = (rnd() - 0.5) * Math.PI * 0.9;
    const r = Math.sqrt(rnd());
    const ang = rnd() * Math.PI * 2;
    const cx = n.x + Math.cos(ang) * r * n.w * 0.5;
    const cy = n.y + Math.sin(ang) * r * n.h * 0.5;
    const len = 6 + rnd() * 12;
    const col = r > 0.75 && cy < n.y ? pale : rnd() < 0.5 ? mid : dark;
    sticks[col]?.push(
      `M${r2(cx - (Math.cos(a) * len) / 2)} ${r2(cy - (Math.sin(a) * len) / 2)}l${r2(Math.cos(a) * len)} ${r2(Math.sin(a) * len)}`,
    );
  }
  return g(
    {},
    el('path', { d: ellipseD(n.x, n.y + 2, n.w * 0.46, n.h * 0.44), fill: shade(dark, -0.2) }),
    ...Object.entries(sticks).map(([c, ds]) =>
      el('path', {
        d: ds.join(''),
        fill: 'none',
        stroke: c,
        'stroke-width': 1.3,
        'stroke-linecap': 'round',
      }),
    ),
    // The entrance tunnel at the lower front.
    el('path', { d: ellipseD(n.x + n.w * 0.12, n.y + n.h * 0.3, 4, 3.5), fill: '#140D0A' }),
  );
}
