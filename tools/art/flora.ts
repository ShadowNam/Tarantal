// v1.6 veld art pass (D-042): the biomes' trees and shrubs drawn the way the v1.4 camelthorn is
// (D-039): limbs with a merged ink silhouette, lit and shade bands and bark texture; crowns built
// from separate clumps of leaf dabs (dark undersides, lit tops, sky between them); fruit, pods and
// flowers where the species has them; a soft contact shadow. Light from the upper left.
//
// One engine (`growTree`) covers the broadleaf and fine-leaved trees: a crown shape, a leaf style
// and a bark style per species. The species functions below add what makes each one itself. All
// coordinates are design px with the foot of the plant at (x, foot). `detail` sets how much is
// drawn: far trees get a few big clumps and plain limbs, near ones the full texture.
import {
  band,
  blurFilter,
  clamp,
  densify,
  drawLimb,
  limbSilhouette,
  ringNoise,
  soften,
  StrokeBin,
  taper,
  zigzag,
  type CamelthornLook,
  type Clump,
  type Limb,
} from './camelthorn';
import { mix, nextId, shade, type Pen, type Pt, type Rnd } from './scenery';
import { el, ellipseD, g, polyD, r2 } from './svg';
import { fruit } from './fruitSink';

export type Detail = 'near' | 'mid' | 'far';
export type CrownShape = 'umbrella' | 'round' | 'oval' | 'spread' | 'vase' | 'irregular';
export type LeafKind = 'feather' | 'leafy' | 'butterfly';
export type BarkKind = 'furrowed' | 'smooth' | 'flaky';

/** A plant's colours: the camelthorn's look, so its limb and leaf drawing can be reused. */
export type PlantLook = CamelthornLook;

/** The look of a species from a few base colours (leaf ramp and bark tones derived). */
export function plantLook(o: {
  readonly leaf: string;
  readonly bark: string;
  readonly ink: string;
  readonly dead?: string;
  readonly ground?: string;
  readonly grass?: string;
  /** Warmer/paler mix for the lit tops (default: a dusty cream). */
  readonly sun?: string;
}): PlantLook {
  const leaf = o.leaf;
  const sun = o.sun ?? '#E2E2B8';
  const dead = o.dead ?? mix(o.bark, '#B8B0A4', 0.5);
  const ground = o.ground ?? '#8A6A48';
  const grass = o.grass ?? '#D9C27A';
  return {
    leaf: [
      shade(mix(leaf, '#1E2A1A', 0.3), -0.45),
      shade(leaf, -0.32),
      shade(leaf, -0.14),
      leaf,
      shade(mix(leaf, sun, 0.15), 0.14),
      shade(mix(leaf, sun, 0.35), 0.22),
    ],
    bark: { fill: o.bark, lit: shade(o.bark, 0.3), shade: shade(o.bark, -0.36) },
    furrow: shade(o.bark, -0.6),
    ridge: shade(o.bark, 0.45),
    dead: { fill: dead, lit: shade(dead, 0.3), shade: shade(dead, -0.35) },
    pod: { fill: '#8A6A44', lit: '#B8946A', dark: '#4E3A26' },
    ink: mix(o.ink, o.bark, 0.35),
    ground,
    grass,
    grassPale: mix(grass, '#F4ECD0', 0.4),
    straw: [],
    roof: [],
  };
}

// --- the tree engine -------------------------------------------------------------------------

export interface TreeSpec {
  readonly x: number;
  readonly foot: number;
  /** Foot to crown top (px). */
  readonly h: number;
  /** Crown half-width (px). */
  readonly w: number;
  /** Crown depth as a fraction of h. */
  readonly depth: number;
  readonly crown: CrownShape;
  readonly trunkW: number;
  /** Fork height as a fraction of h above the foot. */
  readonly fork: number;
  /** Main limbs out of the fork. */
  readonly limbs: number;
  /** Lean of the trunk top (px, + = right). */
  readonly lean?: number;
  readonly leaf: LeafKind;
  /** Leaf dab length (px) and dabs per px² of clump. */
  readonly dab: number;
  readonly density: number;
  readonly clumps: number;
  readonly bark: BarkKind;
  /** 0 … 1: share of the clumps left out (winter thinning, an open crown). */
  readonly bare?: number;
  readonly detail: Detail;
  /** Contact shadow under the tree (default true). */
  readonly shadow?: boolean;
}

export interface TreeParts {
  /** Contact shadow, back foliage, wood (limbs and twigs), front foliage. */
  readonly shadow: string;
  readonly back: string;
  readonly wood: string;
  readonly front: string;
  readonly clumps: readonly Clump[];
  readonly tips: readonly Pt[];
  readonly limbs: readonly Limb[];
  /** Crown top and underside (y). */
  readonly top: number;
  readonly under: number;
}

/** Envelope of a crown shape at u (−1 … 1 across): top and underside as fractions of depth. */
function envelope(shape: CrownShape, u: number, bump: (t: number) => number): [number, number] {
  const a = Math.abs(u);
  const round = 1 - Math.sqrt(Math.max(0, 1 - u * u));
  switch (shape) {
    case 'umbrella':
      return [0.12 * u * u + 0.08 * Math.pow(a, 6), 1 - 0.25 * u * u];
    case 'round':
      return [round * 0.75, 1 - round * 0.55];
    case 'oval':
      return [round * 0.9, 1 - round * 0.7];
    case 'spread':
      return [0.3 * u * u + 0.1 * Math.sin(u * 5), 1 - 0.3 * u * u];
    case 'vase':
      return [0.2 * u * u, 1 - 0.65 * (1 - a)];
    case 'irregular':
      return [
        clamp(round * 0.6 + bump(u * 3) * 0.25, 0, 0.6),
        1 - round * 0.5 + bump(u * 2 + 1) * 0.15,
      ];
  }
}

/** Fine twigs fanning up and out from a tip. */
function twigFan(
  rnd: Rnd,
  tip: Pt,
  len: number,
  w: number,
  colour: string,
  bin: StrokeBin,
  n: number,
): void {
  for (let k = 0; k < n; k++) {
    const ang = -Math.PI / 2 + (rnd() - 0.5) * 2.4;
    const l = len * (0.5 + rnd() * 0.7);
    const end: Pt = [tip[0] + Math.cos(ang) * l * 1.3, tip[1] + Math.sin(ang) * l];
    const pts = zigzag(rnd, tip, end, 1, 0.2);
    bin.add(colour, w, polyD(pts, false));
  }
}

/**
 * Leaf dabs over a set of clumps (the camelthorn's foliage, with leaf styles): per clump a dark
 * lumpy core, then dabs coloured by height in the clump and by side (lit upper left). Feathery
 * leaves are thin strokes; leafy ones short, round dabs; butterfly ones (mopane) paired lobes.
 */
export function leafMass(
  rnd: Rnd,
  clumps: readonly Clump[],
  look: PlantLook,
  density: number,
  dab: number,
  kind: LeafKind,
): string {
  const leaf = look.leaf;
  const cores: string[] = [];
  const bin = new StrokeBin();
  for (const c of clumps) {
    const n = ringNoise(rnd, 3, 8, 0.5);
    const pts: Pt[] = [];
    for (let k = 0; k < 22; k++) {
      const t = (k / 22) * Math.PI * 2;
      const r = 0.62 + n(t) * 0.3;
      pts.push([c.x + Math.cos(t) * c.rx * r, c.y + c.ry * 0.24 + Math.sin(t) * c.ry * 0.58 * r]);
    }
    cores.push(polyD(pts));
    const count = Math.round(c.rx * c.ry * density);
    for (let k = 0; k < count; k++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * 1.06;
      const x = c.x + Math.cos(a) * c.rx * rr;
      const y = c.y + Math.sin(a) * c.ry * rr;
      const v = (y - c.y) / c.ry;
      const u = (x - c.x) / c.rx;
      const lum = -v * 0.6 - u * 0.25 + (rnd() - 0.5) * 0.6 + c.depth * 0.35 - 0.15;
      const idx = clamp(Math.round(2.5 + lum * 2.4), 0, leaf.length - 1);
      const colour = leaf[idx] as string;
      const len = dab * (0.55 + rnd() * 0.7);
      if (kind === 'butterfly') {
        // Two kidney lobes joined at the stalk, a little open V.
        const ang = rnd() * Math.PI;
        const l = len * 0.55;
        const dx = Math.cos(ang) * l;
        const dy = Math.sin(ang) * l * 0.7;
        const w = Math.max(0.5, Math.round(dab * 0.45 * 4) / 4);
        bin.add(
          colour,
          w,
          `M${r2(x)} ${r2(y)}l${r2(dx)} ${r2(dy - l * 0.35)}M${r2(x)} ${r2(y)}l${r2(-dx)} ${r2(-dy - l * 0.35)}`,
        );
      } else {
        const ang = rnd() * Math.PI;
        const w = kind === 'leafy' ? dab * (0.6 + rnd() * 0.3) : dab * (0.4 + rnd() * 0.28);
        const l = kind === 'leafy' ? len * 0.45 : len;
        bin.add(
          colour,
          Math.max(0.5, Math.round(w * 4) / 4),
          `M${r2(x)} ${r2(y)}l${r2(Math.cos(ang) * l)} ${r2(Math.sin(ang) * l * 0.6)}`,
        );
      }
    }
    // Sun flecks on the upper left of each clump.
    for (let k = 0; k < Math.round(c.rx * 0.4); k++) {
      const a = Math.PI * (1.05 + rnd() * 0.6);
      const rr = 0.45 + rnd() * 0.5;
      bin.add(
        leaf[leaf.length - 1] as string,
        Math.max(0.5, Math.round(dab * 0.4 * 4) / 4),
        `M${r2(c.x + Math.cos(a) * c.rx * rr)} ${r2(c.y + Math.sin(a) * c.ry * rr)}l${r2(dab * 0.5)} ${r2(-dab * 0.15)}`,
      );
    }
  }
  return g({}, el('path', { d: cores.join(''), fill: leaf[1], opacity: 0.85 }), bin.svg(leaf));
}

/**
 * Far clumps: flat masses with ragged edges (a dark underside, the body, a lit cap upper left)
 * and a few darker holes, no dabs: they read as foliage at a distance and stay small in bytes.
 */
export function clumpMasses(clumps: readonly Clump[], look: PlantLook, rnd: Rnd): string {
  const leaf = look.leaf;
  const dark: string[] = [];
  const body: string[] = [];
  const lit: string[] = [];
  const holes: string[] = [];
  for (const c of clumps) {
    const n = ringNoise(rnd, 3, 10, 0.9);
    const ring = (k: number, dx: number, dy: number, sx: number, sy: number): string => {
      const pts: Pt[] = [];
      for (let i = 0; i < 18; i++) {
        const t = (i / 18) * Math.PI * 2;
        const r = 1 + n(t * 1.3 + k) * 0.32;
        pts.push([c.x + dx + Math.cos(t) * c.rx * sx * r, c.y + dy + Math.sin(t) * c.ry * sy * r]);
      }
      return polyD(pts);
    };
    dark.push(ring(0, c.rx * 0.06, c.ry * 0.12, 1, 0.92));
    body.push(ring(1.7, -c.rx * 0.05, -c.ry * 0.1, 0.84, 0.72));
    lit.push(ring(3.1, -c.rx * 0.28, -c.ry * 0.38, 0.42, 0.3));
    if (c.rx > 4 && rnd() < 0.6)
      holes.push(
        ellipseD(
          c.x + (rnd() - 0.3) * c.rx * 0.8,
          c.y + c.ry * (0.1 + rnd() * 0.3),
          c.rx * 0.14,
          c.ry * 0.12,
        ),
      );
  }
  return g(
    {},
    el('path', { d: dark.join(''), fill: leaf[1] }),
    el('path', { d: body.join(''), fill: leaf[3] }),
    el('path', { d: lit.join(''), fill: leaf[leaf.length - 1], opacity: 0.8 }),
    el('path', { d: holes.join(''), fill: leaf[2], opacity: 0.9 }),
  );
}

/**
 * v1.6 (D-042 review: "the trees in the far background look like blobs"): a far crown as a
 * broken canopy. Each clump is a scatter of small leaf clusters with sky between them: dark ones
 * low and right, mid ones, lit ones upper left, so the edge is ragged and the crown reads as
 * foliage on its limbs, not a solid shape. Cheap: a few ellipses per clump, three fills.
 */
export function clumpSpeckle(clumps: readonly Clump[], look: PlantLook, rnd: Rnd): string {
  const leaf = look.leaf;
  const dark: string[] = [];
  const body: string[] = [];
  const lit: string[] = [];
  for (const c of clumps) {
    const r = Math.max(0.7, Math.min(c.rx, c.ry) * 0.42);
    const n = Math.max(4, Math.round((c.rx * c.ry) / (r * r * 2)));
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * 1.05;
      const x = c.x + Math.cos(a) * c.rx * rr;
      const y = c.y + Math.sin(a) * c.ry * rr;
      const v = (y - c.y) / c.ry - ((x - c.x) / c.rx) * 0.4 + (rnd() - 0.5) * 0.6;
      const e = ellipseD(x, y, r * (0.8 + rnd() * 0.5), r * (0.6 + rnd() * 0.4));
      (v > 0.35 ? dark : v < -0.45 ? lit : body).push(e);
    }
  }
  return g(
    {},
    el('path', { d: dark.join(''), fill: leaf[1] }),
    el('path', { d: body.join(''), fill: leaf[3] }),
    el('path', { d: lit.join(''), fill: leaf[leaf.length - 1] }),
  );
}

/** One limb in a smooth (baobab, shepherd's tree) or flaky (marula) bark. */
export function smoothLimb(
  rnd: Rnd,
  limb: Limb,
  look: PlantLook,
  kind: 'smooth' | 'flaky',
): string {
  const l = densify(limb, 4);
  const col = look.bark;
  const maxW = Math.max(...l.w);
  const parts = [
    el('path', { d: band(l, 0.1, 1), fill: col.shade, opacity: 0.8 }),
    el('path', { d: band(l, 0.6, 1), fill: shade(col.shade, -0.2), opacity: 0.6 }),
    el('path', { d: band(l, -1, -0.5), fill: col.lit, opacity: 0.75 }),
  ];
  if (maxW < 4) return g({}, ...parts);
  const id = nextId();
  const clip = el('clipPath', { id }, el('path', { d: band(l, -1, 1) }));
  const marks: string[] = [];
  const marksLit: string[] = [];
  const n = Math.round((maxW * l.pts.length) / (kind === 'flaky' ? 14 : 40));
  for (let k = 0; k < n; k++) {
    const i = Math.floor(rnd() * l.pts.length);
    const p = l.pts[i] as Pt;
    const hw = (l.w[i] ?? 1) / 2;
    if (hw < 2) continue;
    const f = (rnd() - 0.5) * 1.8;
    const a = l.pts[Math.max(0, i - 1)] as Pt;
    const b = l.pts[Math.min(l.pts.length - 1, i + 1)] as Pt;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    const x = p[0] + nx * hw * f;
    const y = p[1] + ny * hw * f;
    if (kind === 'flaky') {
      // A bark plate: an irregular patch, lighter or darker than the bark round it.
      const rx = hw * (0.18 + rnd() * 0.22);
      const ry = rx * (0.5 + rnd() * 0.4);
      (rnd() < 0.55 ? marks : marksLit).push(ellipseD(x, y, rx, ry));
    } else {
      // Smooth bark: a soft fold across the limb.
      const len = hw * (0.3 + rnd() * 0.5);
      marks.push(
        `M${r2(x - nx * len)} ${r2(y - ny * len)}q${r2(Math.cos(ang) * len * 0.3)} ${r2(Math.sin(ang) * len * 0.3)} ${r2(nx * len * 2)} ${r2(ny * len * 2)}`,
      );
    }
  }
  const inner =
    kind === 'flaky'
      ? [
          el('path', { d: marks.join(''), fill: shade(col.fill, -0.25), opacity: 0.8 }),
          el('path', { d: marksLit.join(''), fill: shade(col.fill, 0.22), opacity: 0.85 }),
        ]
      : [
          el('path', {
            d: marks.join(''),
            fill: 'none',
            stroke: shade(col.fill, -0.28),
            'stroke-width': clamp(maxW * 0.03, 0.5, 1.6),
            'stroke-linecap': 'round',
            opacity: 0.7,
          }),
        ];
  return g({}, clip, ...parts, g({ 'clip-path': `url(#${id})` }, ...inner));
}

/** Builds a tree: its skeleton, clumps, foliage and wood, returned in drawing layers. */
export function growTree(rnd: Rnd, s: TreeSpec, look: PlantLook): TreeParts {
  const far = s.detail === 'far';
  const top = s.foot - s.h;
  const depth = s.h * s.depth;
  const under = top + depth;
  const lean = s.lean ?? 0;
  const cx = s.x + lean;
  const forkY = s.foot - s.h * s.fork;
  const limbs: Limb[] = [];
  const tips: Pt[] = [];
  const fork: Pt = [cx, forkY];
  const trunkPts = zigzag(rnd, [s.x, s.foot], fork, far ? 0 : 2, 0.04);
  limbs.push({
    pts: trunkPts,
    w: taper(trunkPts, s.trunkW, s.trunkW * 0.74).map((w, i) => (i === 0 ? w * 1.22 : w)),
  });
  const bump = ringNoise(rnd, 1, 4, 1);
  const env = (u: number): [number, number] => {
    const [t, b] = envelope(s.crown, u, bump);
    return [top + depth * t, top + depth * b];
  };
  for (let k = 0; k < s.limbs; k++) {
    const f = s.limbs === 1 ? 0 : k / (s.limbs - 1) - 0.5;
    const u = clamp(f * 1.5 + (rnd() - 0.5) * 0.15, -0.95, 0.95);
    const [et, eb] = env(u);
    const tx = cx + u * s.w;
    const ty = et + (eb - et) * (0.35 + rnd() * 0.25);
    const pts = soften(zigzag(rnd, fork, [tx, ty], far ? 1 : 2, 0.1));
    const w0 = s.trunkW * (s.limbs > 3 ? 0.52 : 0.62) * (0.85 + rnd() * 0.2);
    const lw = taper(pts, w0, w0 * 0.2);
    lw[0] = Math.max(w0, s.trunkW * 0.64);
    limbs.push({ pts, w: lw, knot: s.trunkW * 0.3 });
    tips.push([tx, ty]);
    if (far) continue;
    // Secondary branches from the kinks, out and up into the crown.
    for (let i = 2; i < pts.length - 1; i += 2) {
      const p = pts[i] as Pt;
      for (const side of [-1, 1]) {
        if (rnd() < 0.3) continue;
        const bu = clamp((p[0] - cx) / s.w + side * (0.2 + rnd() * 0.35), -0.98, 0.98);
        const [bt, bb] = env(bu);
        const bx = cx + bu * s.w;
        const by = clamp(bt + (bb - bt) * (0.2 + rnd() * 0.5), top + depth * 0.1, p[1] - 4);
        const bp = zigzag(rnd, p, [bx, by], 1, 0.14);
        const bw = Math.max(1.2, (w0 * 0.3 + 1.5) * (0.7 + rnd() * 0.3));
        limbs.push({ pts: bp, w: taper(bp, bw, bw * 0.2) });
        tips.push([bx, by]);
      }
    }
  }
  // Clumps: on the tips and spread through the envelope, smaller toward the rim, with gaps.
  const clumps: Clump[] = [];
  const size = far ? 1.5 : 1;
  const add = (x: number, y: number, k: number): void => {
    const rx = s.w * (0.2 + rnd() * 0.12) * k * size;
    const ry = rx * (s.leaf === 'feather' ? 0.5 + rnd() * 0.15 : 0.62 + rnd() * 0.2);
    clumps.push({ x, y, rx, ry, depth: rnd() });
  };
  for (const t of tips) if (rnd() > (s.bare ?? 0)) add(t[0], t[1] - depth * 0.08, 0.9);
  const want = Math.round(s.clumps * (1 - (s.bare ?? 0)));
  for (let guard = 0; clumps.length < want && guard < want * 30; guard++) {
    const u = rnd() * 2 - 1;
    const [et, eb] = env(u);
    if (eb - et < depth * 0.18) continue;
    const y = et + (eb - et) * (0.15 + rnd() * 0.7);
    add(cx + u * s.w * 0.93, y, 1 - Math.abs(u) * 0.3);
  }
  const back = clumps.filter((c) => c.depth < 0.42).map((c) => ({ ...c, depth: c.depth * 0.6 }));
  const front = clumps.filter((c) => c.depth >= 0.42);
  const backLook = { ...look, leaf: look.leaf.slice(0, -1) };
  const foliage = (cs: readonly Clump[], lk: PlantLook): string =>
    far ? clumpSpeckle(cs, lk, rnd) : leafMass(rnd, cs, lk, s.density, s.dab, s.leaf);
  // Wood: twigs, the merged silhouette, then each limb's texture (thick limbs last).
  const twigBin = new StrokeBin();
  if (!far)
    for (const t of tips)
      twigFan(
        rnd,
        t,
        depth * 0.18,
        clamp(s.trunkW * 0.03, 0.5, 1.1),
        shade(look.bark.fill, -0.15),
        twigBin,
        3,
      );
  const bin = new StrokeBin();
  const sorted = [...limbs].sort((a, b) => (b.w[0] ?? 0) - (a.w[0] ?? 0));
  const tex = sorted.map((l) =>
    s.bark === 'furrowed' ? drawLimb(rnd, l, look, bin, false) : smoothLimb(rnd, l, look, s.bark),
  );
  const wood = g({}, twigBin.svg([]), limbSilhouette(limbs, look), ...tex, bin.svg([look.furrow]));
  let shadow = '';
  if (s.shadow !== false) {
    const blur = blurFilter(Math.max(0.8, s.w * 0.03));
    const ry = Math.max(2, s.w * 0.09);
    shadow = g(
      {},
      blur.def,
      g(
        { filter: `url(#${blur.id})` },
        el('path', {
          d: ellipseD(s.x + s.w * 0.15, s.foot + 1, s.w * 0.85, ry),
          fill: '#2A1A14',
          opacity: 0.26,
        }),
        el('path', {
          d: ellipseD(s.x + s.trunkW * 0.3, s.foot + 1, s.trunkW * 1.7, ry * 0.45),
          fill: '#2A1A14',
          opacity: 0.32,
        }),
      ),
    );
  }
  return {
    shadow,
    back: g({}, foliage(back, backLook)),
    wood,
    front: foliage(front, look),
    clumps,
    tips,
    limbs,
    top,
    under,
  };
}

/** Draws a grown tree in order, with optional extras between the wood and the front leaves. */
export function treeSvg(t: TreeParts, mid = '', after = ''): string {
  return g({}, t.shadow, t.back, t.wood, mid, t.front, after);
}

// --- fruit, pods and flowers -----------------------------------------------------------------

/** Clumps low in the crown's front: where hanging fruit shows. */
function lowFront(t: TreeParts): Clump[] {
  const low = t.clumps.filter((c) => c.depth >= 0.42 && c.y > t.top + (t.under - t.top) * 0.45);
  return low.length > 0 ? low : [...t.clumps];
}

/** A curved, flat sickle pod (sweet thorn): brown, a lit edge, seeds hinted. */
export function sicklePod(x: number, y: number, len: number, ang: number, c: string): string {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const P = (u: number, v: number): string =>
    `${r2(x + u * ca - v * sa)} ${r2(y + u * sa + v * ca)}`;
  const w = len * 0.14;
  const d = `M${P(0, 0)}Q${P(len * 0.5, len * 0.3)} ${P(len, len * 0.05)}Q${P(len * 0.5, len * 0.3 + w)} ${P(0, w * 0.6)}Z`;
  return g(
    {},
    el('path', { d, fill: c, stroke: shade(c, -0.45), 'stroke-width': clamp(len * 0.04, 0.4, 1) }),
    el('path', {
      d: `M${P(len * 0.1, w * 0.1)}Q${P(len * 0.5, len * 0.27)} ${P(len * 0.9, len * 0.05)}`,
      fill: 'none',
      stroke: shade(c, 0.35),
      'stroke-width': clamp(len * 0.04, 0.35, 0.9),
      opacity: 0.8,
    }),
  );
}

/** Pods hanging under the crown on short stalks (v1.7c: each one a fruit sprite, D-047). */
export function hangingPods(
  rnd: Rnd,
  t: TreeParts,
  n: number,
  len: number,
  c: string,
  ground: number,
  species = 'sweet_thorn_pod',
): string {
  const low = lowFront(t);
  const out: string[] = [];
  for (let k = 0; k < n && low.length > 0; k++) {
    const cl = low[Math.floor(rnd() * low.length)] as Clump;
    const x = cl.x + (rnd() - 0.5) * cl.rx * 1.2;
    const y = cl.y + cl.ry * (0.4 + rnd() * 0.4);
    const l = len * (0.8 + rnd() * 0.4);
    out.push(
      fruit({
        species,
        motion: 'hang',
        x,
        y,
        ground,
        reach: l * 1.3 + 4,
        svg: sicklePod(x, y, l, Math.PI * (0.35 + rnd() * 0.35), c),
      }),
    );
  }
  return g({}, ...out);
}

/** Round flower heads (pompoms) dotted over the crown's upper surface. */
export function pompoms(rnd: Rnd, t: TreeParts, n: number, r: number, c: string): string {
  const front = t.clumps.filter((c0) => c0.depth > 0.3);
  const body: string[] = [];
  const lit: string[] = [];
  for (let k = 0; k < n && front.length > 0; k++) {
    const cl = front[Math.floor(rnd() * front.length)] as Clump;
    const a = Math.PI * (1.05 + rnd() * 0.9);
    const rr = 0.3 + rnd() * 0.7;
    const x = cl.x + Math.cos(a) * cl.rx * rr;
    const y = cl.y + Math.sin(a) * cl.ry * rr;
    const rad = r * (0.75 + rnd() * 0.5);
    body.push(ellipseD(x, y, rad, rad));
    lit.push(ellipseD(x - rad * 0.3, y - rad * 0.3, rad * 0.5, rad * 0.5));
  }
  return g(
    {},
    el('path', { d: body.join(''), fill: c, stroke: shade(c, -0.35), 'stroke-width': r * 0.25 }),
    el('path', { d: lit.join(''), fill: shade(c, 0.4) }),
  );
}

/** Paired white thorns along the outer limbs (Vachellia), visible only up close. */
export function thorns(rnd: Rnd, t: TreeParts, colour: string, len: number): string {
  const d: string[] = [];
  for (const l of t.limbs.slice(1)) {
    const w0 = l.w[0] ?? 0;
    if (w0 > 14) continue;
    for (let i = 1; i < l.pts.length - 1; i++) {
      if (rnd() < 0.7) continue;
      const p = l.pts[i] as Pt;
      const q = l.pts[i + 1] as Pt;
      const ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
      for (const side of [-1, 1]) {
        const a = ang + side * 0.9;
        d.push(`M${r2(p[0])} ${r2(p[1])}l${r2(Math.cos(a) * len)} ${r2(Math.sin(a) * len)}`);
      }
    }
  }
  return el('path', {
    d: d.join(''),
    fill: 'none',
    stroke: colour,
    'stroke-width': clamp(len * 0.12, 0.4, 0.9),
    'stroke-linecap': 'round',
    opacity: 0.85,
  });
}

/** Round fruit (marula, jackalberry): body, a lit spot and a dark rim. */
export function roundFruit(x: number, y: number, r: number, c: string): string {
  return g(
    {},
    el('path', {
      d: ellipseD(x, y, r, r * 0.92),
      fill: c,
      stroke: shade(c, -0.45),
      'stroke-width': clamp(r * 0.18, 0.4, 1.1),
    }),
    el('path', {
      d: ellipseD(x - r * 0.32, y - r * 0.32, r * 0.38, r * 0.3),
      fill: shade(c, 0.45),
    }),
  );
}

/** Fallen fruit scattered under a tree (on the ground band, in the shade). */
export function fallenFruit(
  rnd: Rnd,
  x: number,
  foot: number,
  spread: number,
  n: number,
  r: number,
  c: string,
  species = 'marula',
): string {
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    const fx = x + (rnd() - 0.5) * spread * 2;
    const fy = foot - r * 0.4 + rnd() * r * 2.5;
    const rr = r * (0.8 + rnd() * 0.4);
    out.push(
      fruit({
        species,
        motion: 'ground',
        x: fx,
        y: fy + rr * 0.92,
        ground: fy + rr * 0.92,
        reach: rr * 2 + 3,
        svg: roundFruit(fx, fy, rr, mix(c, '#8A6A3A', rnd() * 0.35)),
      }),
    );
  }
  return g({}, ...out);
}

/**
 * Long fruit on long rope-like stalks (Kigelia, the sausage tree; baobab pods are short and
 * oval): `len` long, `w` thick, hanging from the crown's underside.
 */
export function hangingFruit(
  rnd: Rnd,
  t: TreeParts,
  n: number,
  stalk: [number, number],
  len: number,
  w: number,
  c: { fill: string; lit: string; dark: string },
  ink: string,
  ground: number,
  species = 'sausage',
): string {
  const low = lowFront(t);
  const out: string[] = [];
  const used: number[] = [];
  let placed = 0;
  for (let k = 0; placed < n && k < n * 6 && low.length > 0; k++) {
    const cl = low[Math.floor(rnd() * low.length)] as Clump;
    const x0 = cl.x + (rnd() - 0.5) * cl.rx;
    if (used.some((u) => Math.abs(u - x0) < w * 2.2)) continue;
    used.push(x0);
    placed++;
    const y0 = cl.y + cl.ry * 0.3;
    const sl = stalk[0] + rnd() * (stalk[1] - stalk[0]);
    const sway = (rnd() - 0.5) * sl * 0.12;
    const x1 = x0 + sway;
    const y1 = y0 + sl;
    const l = len * (0.75 + rnd() * 0.5);
    const tilt = (rnd() - 0.5) * 0.25;
    const ex = x1 + Math.sin(tilt) * l;
    const ey = y1 + Math.cos(tilt) * l;
    const body = `M${r2(x1)} ${r2(y1)}L${r2(ex)} ${r2(ey)}`;
    const one = g(
      {},
      el('path', {
        d: `M${r2(x0)} ${r2(y0)}Q${r2(x0 + sway * 1.6)} ${r2((y0 + y1) / 2)} ${r2(x1)} ${r2(y1)}`,
        fill: 'none',
        stroke: shade(c.dark, -0.2),
        'stroke-width': clamp(w * 0.12, 0.5, 1.4),
      }),
      el('path', {
        d: body,
        fill: 'none',
        stroke: ink,
        'stroke-width': w + clamp(w * 0.2, 0.6, 2.2),
        'stroke-linecap': 'round',
      }),
      el('path', {
        d: body,
        fill: 'none',
        stroke: c.fill,
        'stroke-width': w,
        'stroke-linecap': 'round',
      }),
      // Shade on the right, light down the left (the light is upper left).
      el('path', {
        d: `M${r2(x1 + w * 0.22)} ${r2(y1 + w * 0.2)}L${r2(ex + w * 0.22)} ${r2(ey)}`,
        fill: 'none',
        stroke: c.dark,
        'stroke-width': w * 0.42,
        'stroke-linecap': 'round',
        opacity: 0.8,
      }),
      el('path', {
        d: `M${r2(x1 - w * 0.22)} ${r2(y1 + w * 0.3)}L${r2(ex - w * 0.22)} ${r2(ey - w * 0.4)}`,
        fill: 'none',
        stroke: c.lit,
        'stroke-width': w * 0.24,
        'stroke-linecap': 'round',
        opacity: 0.85,
      }),
    );
    out.push(
      fruit({
        species,
        motion: 'hang',
        x: x0,
        y: y0,
        ground,
        reach: sl + l + w * 2 + 4,
        svg: one,
      }),
    );
  }
  return g({}, ...out);
}

// --- shrubs ----------------------------------------------------------------------------------

export type ShrubKind = 'renoster' | 'ganna' | 'mopane' | 'driedoring' | 'leafy';

/**
 * A low veld shrub as layered mounds: 2–5 overlapping lumpy domes (dark base, lighter tops),
 * leaf texture as dabs at mid and near size, bare stems at the base and a few twigs poking out,
 * a soft contact shadow. Renosterbos: fine grey-green; ganna: olive, more upright and twiggy;
 * mopane scrub: butterfly leaves in olive and copper; driedoring: grey, open and spiny.
 */
export function veldShrub(
  rnd: Rnd,
  x: number,
  y: number,
  s: number,
  kind: ShrubKind,
  look: PlantLook,
  pen: Pen,
): string {
  const leaf = look.leaf;
  const tall = kind === 'ganna' ? 1.3 : kind === 'driedoring' ? 1.1 : 1.05;
  const wide = kind === 'renoster' ? 1.15 : kind === 'ganna' ? 0.95 : 1.1;
  const nM = 2 + Math.floor(rnd() * 3);
  const mounds: { x: number; y: number; rx: number; ry: number; n: (t: number) => number }[] = [];
  for (let k = 0; k < nM; k++) {
    const f = nM === 1 ? 0 : k / (nM - 1) - 0.5;
    const rx = s * wide * (0.55 + rnd() * 0.25) * (1 - Math.abs(f) * 0.3);
    const ry = s * tall * (0.5 + rnd() * 0.25) * (1 - Math.abs(f) * 0.35);
    mounds.push({
      x: x + f * s * wide * 0.9 + (rnd() - 0.5) * s * 0.15,
      y: y - ry * 0.55 - (1 - Math.abs(f)) * s * 0.1,
      rx,
      ry,
      n: ringNoise(rnd, 3, 13, kind === 'driedoring' ? 0.95 : 0.75),
    });
  }
  // Back mounds first (higher and smaller), front ones over them.
  mounds.sort((a, b) => a.y - b.y);
  /** A mound's rim from ground to ground (rounded sides into the ground), left to right. */
  const rim = (m: (typeof mounds)[number]): Pt[] => {
    const pts: Pt[] = [];
    const steps = 26;
    for (let i = 0; i < steps; i++) {
      const t = Math.PI * 0.86 + (i / (steps - 1)) * Math.PI * 1.28;
      const r = 1 + m.n(t) * 0.35;
      pts.push([m.x + Math.cos(t) * m.rx * r, Math.min(y, m.y + Math.sin(t) * m.ry * r)]);
    }
    return pts;
  };
  const parts: string[] = [];
  const blur = blurFilter(Math.max(0.6, s * 0.06));
  parts.push(
    blur.def,
    g(
      { filter: `url(#${blur.id})` },
      el('path', {
        d: ellipseD(x + s * 0.2, y + 1, s * wide * 1.2, Math.max(1.2, s * 0.14)),
        fill: '#2A1A14',
        opacity: 0.3,
      }),
    ),
  );
  // Stems at the base, showing between the mounds.
  const stems: string[] = [];
  for (let k = 0; k < 4 + Math.floor(s / 8); k++) {
    const bx = x + (rnd() - 0.5) * s * wide * 1.3;
    stems.push(
      `M${r2(bx)} ${r2(y + 0.5)}L${r2(bx + (rnd() - 0.5) * s * 0.4)} ${r2(y - s * (0.3 + rnd() * 0.4) * tall)}`,
    );
  }
  const stemW = Math.max(0.6, s * 0.035);
  parts.push(
    el('path', {
      d: stems.join(''),
      fill: 'none',
      stroke: shade(look.bark.fill, -0.2),
      'stroke-width': stemW,
      'stroke-linecap': 'round',
    }),
  );
  const ink = mix(pen.ink, leaf[1] as string, 0.45);
  const lineW = Math.max(0.5, pen.w * 0.35);
  for (const m of mounds) {
    const edge = rim(m);
    const d = polyD(edge);
    const id = nextId();
    parts.push(
      // A broken outline over the top only (gaps where light catches the edge), then the fill.
      el('path', {
        d: polyD(edge, false),
        fill: 'none',
        stroke: ink,
        'stroke-width': lineW * 2,
        'stroke-linejoin': 'round',
        'stroke-dasharray': `${r2(s * 0.5 + 3)} ${r2(Math.max(1, s * 0.12))}`,
      }),
      el('path', { d, fill: leaf[2] }),
      el('clipPath', { id }, el('path', { d })),
    );
    const inner: string[] = [
      // Shade low and to the right, a lit cap upper left.
      el('path', {
        d: ellipseD(m.x + m.rx * 0.35, m.y + m.ry * 0.55, m.rx * 1.05, m.ry * 0.75),
        fill: leaf[1],
        opacity: 0.9,
      }),
      el('path', {
        d: ellipseD(m.x - m.rx * 0.25, m.y - m.ry * 0.55, m.rx * 0.6, m.ry * 0.35),
        fill: leaf[4],
        opacity: 0.9,
      }),
    ];
    if (s >= 9) {
      // Leaf texture: dabs (fine for renosterbos, paired lobes for mopane).
      const bin = new StrokeBin();
      const n = Math.round(m.rx * m.ry * (kind === 'renoster' ? 0.32 : 0.22));
      const dab = Math.max(0.8, s * (kind === 'renoster' ? 0.05 : 0.08));
      for (let k = 0; k < n; k++) {
        const a = Math.PI + rnd() * Math.PI;
        const rr = Math.sqrt(rnd());
        const px = m.x + Math.cos(a) * m.rx * rr;
        const py = m.y + Math.sin(a) * m.ry * rr * 1.05 + m.ry * 0.25 * rnd();
        const v = (py - m.y) / m.ry;
        const u = (px - m.x) / m.rx;
        const lum = -v * 0.7 - u * 0.3 + (rnd() - 0.5) * 0.7;
        const c = leaf[clamp(Math.round(2.6 + lum * 2), 0, leaf.length - 1)] as string;
        const ang = rnd() * Math.PI;
        if (kind === 'mopane') {
          const l = dab * 0.7;
          bin.add(
            c,
            Math.max(0.5, Math.round(dab * 0.5 * 4) / 4),
            `M${r2(px)} ${r2(py)}l${r2(Math.cos(ang) * l)} ${r2(-l * 0.5)}M${r2(px)} ${r2(py)}l${r2(-Math.cos(ang) * l)} ${r2(-l * 0.5)}`,
          );
        } else {
          bin.add(
            c,
            Math.max(0.5, Math.round(dab * 0.55 * 4) / 4),
            `M${r2(px)} ${r2(py)}l${r2(Math.cos(ang) * dab)} ${r2(Math.sin(ang) * dab * 0.5)}`,
          );
        }
      }
      inner.push(bin.svg(leaf));
    }
    parts.push(g({ 'clip-path': `url(#${id})` }, ...inner));
    if (s >= 6) {
      // A leafy fringe over the top edge: the silhouette breaks into sprigs.
      const fringe = new StrokeBin();
      const dab = Math.max(0.8, s * 0.07);
      for (let k = 0; k < Math.round(m.rx / Math.max(1, dab * 0.9)); k++) {
        const t = Math.PI * (1.05 + rnd() * 0.9);
        const r = 1 + m.n(t) * 0.35;
        const px = m.x + Math.cos(t) * m.rx * r;
        const py = m.y + Math.sin(t) * m.ry * r;
        const up = Math.sin(t) < -0.5;
        const c = leaf[up && Math.cos(t) < 0.2 ? 4 : 2] as string;
        const ang = t + (rnd() - 0.5) * 0.8;
        fringe.add(
          c,
          Math.max(0.5, Math.round(dab * 0.5 * 4) / 4),
          `M${r2(px - Math.cos(ang) * dab * 0.4)} ${r2(py - Math.sin(ang) * dab * 0.4)}l${r2(Math.cos(ang) * dab * 1.2)} ${r2(Math.sin(ang) * dab * 1.2)}`,
        );
      }
      parts.push(fringe.svg(leaf));
    }
  }
  // Twigs out of the top and sides (spiny on driedoring, upright on ganna).
  const twigs: string[] = [];
  const nt = kind === 'driedoring' ? 9 : kind === 'ganna' ? 7 : 4;
  for (let k = 0; k < nt; k++) {
    const m = mounds[Math.floor(rnd() * mounds.length)];
    if (m === undefined) continue;
    const a = Math.PI * (1.1 + rnd() * 0.8);
    const r0 = 0.7;
    const r1 = 1.05 + rnd() * (kind === 'ganna' ? 0.5 : 0.3);
    const ax = m.x + Math.cos(a) * m.rx * r0;
    const ay = m.y + Math.sin(a) * m.ry * r0;
    const bx = m.x + Math.cos(a) * m.rx * r1;
    const by = m.y + Math.sin(a) * m.ry * r1 * (kind === 'ganna' ? 1.3 : 1);
    twigs.push(`M${r2(ax)} ${r2(ay)}L${r2(bx)} ${r2(by)}`);
    if (kind === 'driedoring')
      twigs.push(`M${r2(bx)} ${r2(by)}l${r2((rnd() - 0.5) * s * 0.3)} ${r2(-s * 0.12)}`);
  }
  parts.push(
    el('path', {
      d: twigs.join(''),
      fill: 'none',
      stroke: shade(look.bark.fill, kind === 'driedoring' ? 0.25 : -0.1),
      'stroke-width': Math.max(0.5, s * 0.03),
      'stroke-linecap': 'round',
    }),
  );
  return g({}, ...parts);
}

// --- grass -----------------------------------------------------------------------------------

/**
 * A grass tuft with seed heads: blades fanning from a tight base (shaded base, lit tips), and
 * thin culms ending in seed heads (feathery plumes or open panicles). Dune grass (Stipagrostis)
 * has silvery plumes; veld grass golden heads.
 */
export function seedTuft(
  rnd: Rnd,
  x: number,
  y: number,
  h: number,
  c: { base: string; blade: string; tip: string; seed: string },
  pen: Pen,
  heads: number,
  plume = false,
): string {
  const blades: { d: string; c: string; w: number }[] = [];
  const n = 9 + Math.floor(rnd() * 7);
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1) - 0.5;
    const len = h * (0.55 + rnd() * 0.45) * (1 - Math.abs(f) * 0.45);
    const lean = f * 1.6 + (rnd() - 0.5) * 0.5;
    const bx = x + f * h * 0.18;
    const tx = bx + Math.sin(lean) * len;
    const ty = y - Math.cos(lean) * len;
    const mx = bx + Math.sin(lean) * len * 0.35;
    const my = y - Math.cos(lean) * len * 0.55;
    const col = rnd() < 0.35 ? c.tip : rnd() < 0.5 ? c.blade : c.base;
    blades.push({
      d: `M${r2(bx)} ${r2(y)}Q${r2(mx)} ${r2(my)} ${r2(tx)} ${r2(ty)}`,
      c: col,
      w: Math.max(0.6, h * 0.025 * (0.8 + rnd() * 0.5)),
    });
  }
  const parts: string[] = [
    el('path', {
      d: ellipseD(x + h * 0.05, y + 0.5, h * 0.2, Math.max(0.8, h * 0.035)),
      fill: '#2A1A14',
      opacity: 0.25,
    }),
  ];
  // Ink under the blades (soft, thin), then the blades.
  parts.push(
    el('path', {
      d: blades.map((b) => b.d).join(''),
      fill: 'none',
      stroke: mix(pen.ink, c.base, 0.4),
      'stroke-width': Math.max(0.8, h * 0.04),
      'stroke-linecap': 'round',
    }),
  );
  for (const b of blades)
    parts.push(
      el('path', {
        d: b.d,
        fill: 'none',
        stroke: b.c,
        'stroke-width': b.w,
        'stroke-linecap': 'round',
      }),
    );
  // Culms and their seed heads.
  for (let k = 0; k < heads; k++) {
    const lean = (rnd() - 0.5) * 0.7;
    const len = h * (1.05 + rnd() * 0.45);
    const tx = x + Math.sin(lean) * len;
    const ty = y - Math.cos(lean) * len;
    parts.push(
      el('path', {
        d: `M${r2(x)} ${r2(y)}Q${r2(x + Math.sin(lean) * len * 0.3)} ${r2(y - len * 0.6)} ${r2(tx)} ${r2(ty)}`,
        fill: 'none',
        stroke: shade(c.tip, -0.1),
        'stroke-width': Math.max(0.5, h * 0.012),
      }),
    );
    const hl = h * (plume ? 0.32 : 0.22);
    if (plume) {
      // A feathery plume: a soft spindle along the culm's end.
      const ang = lean;
      const bx = tx - Math.sin(ang) * hl;
      const by = ty + Math.cos(ang) * hl;
      parts.push(
        el('path', {
          d: `M${r2(bx)} ${r2(by)}L${r2(tx)} ${r2(ty)}`,
          fill: 'none',
          stroke: c.seed,
          'stroke-width': Math.max(1, h * 0.06),
          'stroke-linecap': 'round',
          opacity: 0.9,
        }),
        el('path', {
          d: `M${r2(bx - 0.4)} ${r2(by)}L${r2(tx - 0.4)} ${r2(ty)}`,
          fill: 'none',
          stroke: shade(c.seed, 0.35),
          'stroke-width': Math.max(0.5, h * 0.025),
          'stroke-linecap': 'round',
        }),
      );
    } else {
      // An open panicle: short spikelets off the top of the culm.
      const d: string[] = [];
      for (let i = 0; i < 6; i++) {
        const f = i / 6;
        const px = tx - Math.sin(lean) * hl * f;
        const py = ty + Math.cos(lean) * hl * f;
        const side = i % 2 === 0 ? -1 : 1;
        d.push(`M${r2(px)} ${r2(py)}l${r2(side * hl * 0.3)} ${r2(hl * 0.12)}`);
      }
      parts.push(
        el('path', {
          d: d.join(''),
          fill: 'none',
          stroke: c.seed,
          'stroke-width': Math.max(0.6, h * 0.022),
          'stroke-linecap': 'round',
        }),
      );
    }
  }
  return g({}, ...parts);
}

/**
 * A single bare branch from `a` to `b` (a perch, a snag), drawn like the tree's limbs: merged
 * ink silhouette, lit and shade bands, bark texture of the given kind.
 */
export function bareBranch(
  rnd: Rnd,
  a: Pt,
  b: Pt,
  w0: number,
  look: PlantLook,
  bark: BarkKind,
): string {
  const pts = soften(zigzag(rnd, a, b, 2, 0.08));
  const limb: Limb = { pts, w: taper(pts, w0, Math.max(1, w0 * 0.3)) };
  const bin = new StrokeBin();
  return g(
    {},
    limbSilhouette([limb], look),
    bark === 'furrowed' ? drawLimb(rnd, limb, look, bin, false) : smoothLimb(rnd, limb, look, bark),
    bin.svg([look.furrow]),
  );
}
