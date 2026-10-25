// v1.6 (D-042, product owner 25 Oct: "This tree needs a lot of work"): the Kalahari's dead
// camelthorn, a weathered skeleton. A twisted trunk flaring into roots; branches that taper
// continuously from the trunk to the twigs and fork at acacia angles, spreading into a wide
// umbrella with twig clusters at the tips; silver-grey wood, sun-bleached on the lit (upper left)
// side and cool in the shade, with long cracks along the grain, peeling strips and knots at the
// forks; the snapped dry branch (the secret, content part at (−90, −60), 40 × 22) ends in a
// jagged, splintered break with pale inner wood. Prop frame: the foot at (0, 230).
import {
  band,
  blurFilter,
  densify,
  limbSilhouette,
  shadeNormal,
  soften,
  taper,
  zigzag,
  type CamelthornLook,
  type Limb,
} from './camelthorn';
import { mix, shade, tone, tuft, type Pen, type Pt, type Rnd } from './scenery';
import { el, ellipseD, g, polyD, r2 } from './svg';

const WOOD = '#9E9890';
const LIT = '#E4E0D6';
const COOL = '#626A74';
const CRACK = '#3E3A38';

/** One limb's weathered surface: lit and cool bands, long cracks, a peeling strip. */
function weathered(rnd: Rnd, limb: Limb): string {
  const l = densify(limb, 4);
  const maxW = Math.max(...l.w);
  const parts = [
    el('path', { d: band(l, 0.15, 1), fill: COOL, opacity: 0.75 }),
    el('path', { d: band(l, 0.6, 1), fill: shade(COOL, -0.2), opacity: 0.55 }),
    el('path', { d: band(l, -1, -0.45), fill: LIT, opacity: 0.85 }),
  ];
  if (maxW < 5) return g({}, ...parts);
  // Long cracks following the grain: two or three lines along the limb, broken here and there.
  const lines = maxW > 24 ? 4 : maxW > 12 ? 3 : 2;
  const cracks: string[] = [];
  const lit: string[] = [];
  for (let k = 0; k < lines; k++) {
    const f = -0.55 + (1.2 * (k + 0.5)) / lines + (rnd() - 0.5) * 0.1;
    let d = '';
    let on = false;
    for (let i = 0; i < l.pts.length; i++) {
      const hw = (l.w[i] ?? 1) / 2;
      if (hw < 2) break;
      const p = l.pts[i] as Pt;
      const n = shadeNormal(l.pts, i);
      const x = p[0] + n[0] * hw * f;
      const y = p[1] + n[1] * hw * f;
      if (!on || rnd() < 0.05) {
        d += `M${r2(x)} ${r2(y)}`;
        on = rnd() < 0.92;
      } else d += `L${r2(x)} ${r2(y)}`;
    }
    if (d.includes('L')) (f < -0.2 ? lit : cracks).push(d);
  }
  parts.push(
    el('path', {
      d: cracks.join(''),
      fill: 'none',
      stroke: CRACK,
      'stroke-width': r2(Math.max(0.6, maxW * 0.035)),
      'stroke-linecap': 'round',
      opacity: 0.85,
    }),
    el('path', {
      d: lit.join(''),
      fill: 'none',
      stroke: shade(WOOD, -0.25),
      'stroke-width': r2(Math.max(0.5, maxW * 0.025)),
      opacity: 0.8,
    }),
  );
  // A peeling strip: a pale sliver lifting off the lit side, its shadow underneath.
  if (maxW > 10 && l.pts.length > 8) {
    const i0 = Math.floor(rnd() * (l.pts.length - 6));
    const seg: Limb = { pts: l.pts.slice(i0, i0 + 5), w: l.w.slice(i0, i0 + 5) };
    parts.push(
      el('path', { d: band(seg, -0.7, -0.35), fill: shade(COOL, -0.3), opacity: 0.6 }),
      el('path', { d: band(seg, -0.78, -0.45), fill: LIT }),
    );
  }
  return g({}, ...parts);
}

/** The tree. */
export function deadCamelthornTree(rnd: Rnd, look: CamelthornLook, pen: Pen): string {
  const ink = mix(pen.ink, COOL, 0.35);
  const lk: CamelthornLook = {
    ...look,
    ink,
    bark: { fill: WOOD, lit: LIT, shade: COOL },
    dead: { fill: WOOD, lit: LIT, shade: COOL },
  };
  const limbs: Limb[] = [];
  const tips: Pt[] = [];
  const knots: Pt[] = [];
  // Trunk: twisted (an S), flaring at the foot.
  const trunkPts = soften(
    soften([
      [0, 230],
      [8, 170],
      [-6, 110],
      [4, 60],
      [-4, 20],
    ]),
  );
  const tw = taper(trunkPts, 50, 30).map((w, i) => (i === 0 ? w * 1.35 : w));
  limbs.push({ pts: trunkPts, w: tw });
  // Roots spreading over the sand.
  for (const [dx, dy, w] of [
    [-62, 238, 16],
    [-30, 242, 12],
    [44, 239, 15],
    [70, 234, 9],
  ] as const) {
    const pts = zigzag(rnd, [dx * 0.15, 222], [dx, dy], 1, 0.12);
    limbs.push({ pts, w: taper(pts, w, 2) });
  }
  /** A branch from p at angle a (radians from straight up), forking `depth` more times. */
  const grow = (p: Pt, a: number, len: number, w: number, depth: number): void => {
    const end: Pt = [p[0] + Math.sin(a) * len, Math.max(-282, p[1] - Math.cos(a) * len)];
    const pts = soften(zigzag(rnd, p, end, depth > 1 ? 2 : 1, 0.07));
    const w1 = Math.max(1.2, w * 0.66);
    limbs.push({ pts, w: taper(pts, w, w1), knot: w * 0.5 });
    if (depth <= 0) {
      tips.push(end);
      return;
    }
    if (w > 15) knots.push(end);
    // Acacia forks: two children spreading out, flattening toward the umbrella's rim.
    const spread = 0.38 + rnd() * 0.25;
    const out = Math.sign(a || rnd() - 0.5);
    for (const s of [-1, 1]) {
      const na = a + s * spread * (0.8 + rnd() * 0.4) + out * 0.12;
      const flat = Math.max(-1.45, Math.min(1.45, na));
      grow(end, flat, len * (0.6 + rnd() * 0.1), w1, depth - 1);
    }
  };
  grow([-4, 30], -0.72, 96, 26, 3);
  grow([-2, 26], 0.06, 100, 24, 3);
  grow([2, 34], 0.8, 96, 25, 3);
  // The snapped dry branch (the secret): out to the left, ending in a splintered break.
  const stubPts = soften(zigzag(rnd, [-6, 22], [-116, -66], 1, 0.05));
  const stub: Limb = { pts: stubPts, w: taper(stubPts, 22, 15) };
  limbs.push(stub);
  // Twig clusters at the tips: thin forked strokes.
  const twigs: string[] = [];
  for (const t of tips)
    for (let k = 0; k < 4; k++) {
      const a = -Math.PI / 2 + (rnd() - 0.5) * 2.2;
      const len = 10 + rnd() * 16;
      const m: Pt = [t[0] + Math.cos(a) * len * 0.55, t[1] + Math.sin(a) * len * 0.55];
      const e: Pt = [t[0] + Math.cos(a) * len, t[1] + Math.sin(a) * len];
      twigs.push(
        `M${r2(t[0])} ${r2(t[1])}L${r2(m[0])} ${r2(m[1])}L${r2(e[0])} ${r2(e[1])}M${r2(m[0])} ${r2(m[1])}l${r2((rnd() - 0.5) * 9)} ${r2(-4 - rnd() * 5)}`,
      );
    }
  // The break: jagged splinters with pale inner wood at the stub's end.
  const end = stubPts[stubPts.length - 1] as Pt;
  const prev = stubPts[stubPts.length - 2] as Pt;
  const dir: Pt = [end[0] - prev[0], end[1] - prev[1]];
  const dl = Math.hypot(dir[0], dir[1]) || 1;
  const u: Pt = [dir[0] / dl, dir[1] / dl];
  const n: Pt = [-u[1], u[0]];
  const hw = 9;
  const splinters: Pt[] = [];
  for (let k = 0; k <= 8; k++) {
    const f = -1 + (2 * k) / 8;
    const reach = k % 2 === 0 ? 6 + rnd() * 14 : rnd() * 3;
    splinters.push([end[0] + n[0] * hw * f + u[0] * reach, end[1] + n[1] * hw * f + u[1] * reach]);
  }
  const breakD = polyD([
    [end[0] + n[0] * hw - u[0] * 3, end[1] + n[1] * hw - u[1] * 3],
    ...splinters.reverse(),
    [end[0] - n[0] * hw - u[0] * 3, end[1] - n[1] * hw - u[1] * 3],
  ]);
  const blur = blurFilter(2.5);
  const parts: string[] = [
    blur.def,
    g(
      { filter: `url(#${blur.id})` },
      el('path', { d: ellipseD(16, 236, 128, 10), fill: '#2A1A14', opacity: 0.3 }),
    ),
    el('path', {
      d: twigs.join(''),
      fill: 'none',
      stroke: ink,
      'stroke-width': 2.2,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: twigs.join(''),
      fill: 'none',
      stroke: shade(WOOD, 0.12),
      'stroke-width': 1.1,
      'stroke-linecap': 'round',
    }),
    limbSilhouette(limbs, lk),
    ...[...limbs].sort((a, b) => (b.w[0] ?? 0) - (a.w[0] ?? 0)).map((l) => weathered(rnd, l)),
    // Knots at the forks: a dark eye with a lit rim.
    ...knots.map((k) =>
      g(
        {},
        el('path', { d: ellipseD(k[0], k[1], 2.6, 1.8), fill: shade(COOL, -0.3), opacity: 0.8 }),
        el('path', {
          d: ellipseD(k[0] - 0.6, k[1] - 0.6, 4.6, 3.4),
          fill: 'none',
          stroke: LIT,
          'stroke-width': 0.9,
        }),
      ),
    ),
    el('path', {
      d: breakD,
      fill: '#E8DCC0',
      stroke: ink,
      'stroke-width': 1.4,
      'stroke-linejoin': 'miter',
    }),
    el('path', {
      d: `M${r2(end[0] - n[0] * 3)} ${r2(end[1] - n[1] * 3)}l${r2(u[0] * 9)} ${r2(u[1] * 9)}M${r2(end[0] + n[0] * 2)} ${r2(end[1] + n[1] * 2)}l${r2(u[0] * 7)} ${r2(u[1] * 7)}`,
      fill: 'none',
      stroke: '#B8A888',
      'stroke-width': 1,
    }),
  ];
  // Grass round the foot.
  for (const x of [-110, -60, 70, 120])
    parts.push(
      tuft(
        rnd,
        x + (rnd() - 0.5) * 20,
        236,
        26 + rnd() * 14,
        tone(look.grassPale, 0.25, 0.25),
        { ink: look.ink, w: Math.max(0.6, pen.w * 0.4) },
        9,
      ),
    );
  return g({}, ...parts);
}
