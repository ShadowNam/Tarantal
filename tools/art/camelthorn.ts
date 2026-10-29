// v1.4 B (D-039): the camelthorn (Vachellia erioloba, kameeldoring) and the sociable-weaver family
// nest, drawn in layers at a much higher detail level than the D-031 interim props (product owner,
// 24 Oct: "increase quality by 500%"). Shared by the Kalahari props, the Kalahari far veld and the
// Namibië area. Coordinates are design px with the tree's foot at (x, foot); props are rendered at
// 2× (PropPlan.master), so strokes down to ~0.6 design px still show.
//
// A camelthorn: a short, thick, furrowed trunk that leans or forks low into 2–4 zig-zag limbs
// tapering into fine twigs; a broad, flat umbrella crown of 30–60 separate feathery clumps (dark
// undersides, lit tops, sky between them); grey velvety half-moon pods in the crown and on the
// ground; a dappled shade circle with blonde grass tufts. Light from the upper left.
import { mix, nextId, shade, tone, tuft, type Pen, type Pt, type Rnd } from './scenery';
import { el, ellipseD, g, polyD, r2 } from './svg';
import { fruit } from './fruitSink';
import { camelPodHi } from './fruitLook';

export type CamelthornVariant = 'young' | 'mature' | 'old' | 'nest';

/** Palette lookup (already hazed for the plane the art sits on). */
export type PaletteFn = (name: string) => string;

export interface CamelthornLook {
  /** Foliage ramp, darkest (crown undersides) to lightest (sunlit tops). */
  readonly leaf: readonly string[];
  readonly bark: { readonly fill: string; readonly lit: string; readonly shade: string };
  readonly furrow: string;
  readonly ridge: string;
  readonly dead: { readonly fill: string; readonly lit: string; readonly shade: string };
  readonly pod: { readonly fill: string; readonly lit: string; readonly dark: string };
  readonly ink: string;
  readonly ground: string;
  readonly grass: string;
  readonly grassPale: string;
  /** Straw ramp of the nest's sides (dark brown → cream) and its weathered roof (grey-brown). */
  readonly straw: readonly string[];
  readonly roof: readonly string[];
}

export function camelthornLook(c: PaletteFn, pen: Pen): CamelthornLook {
  // Feathery grey-green to olive (bible §4 Namibië line): the palette's camelthorn green pulled
  // toward a dusty grey-green.
  const leafBase = mix(c('camelthorn'), c('greyGreen'), 0.35);
  const trunk = c('trunk');
  const dead = c('deadwood');
  const thatch = c('thatch');
  const roofBase = mix(thatch, '#7C7468', 0.62);
  return {
    leaf: [
      shade(mix(leafBase, '#1E2A1A', 0.25), -0.45),
      shade(leafBase, -0.3),
      shade(leafBase, -0.12),
      leafBase,
      shade(leafBase, 0.16),
      shade(mix(leafBase, '#D8DCB0', 0.3), 0.22),
    ],
    bark: { fill: trunk, lit: shade(trunk, 0.3), shade: shade(trunk, -0.38) },
    furrow: shade(trunk, -0.62),
    ridge: shade(trunk, 0.45),
    dead: { fill: dead, lit: shade(dead, 0.32), shade: shade(dead, -0.35) },
    pod: {
      fill: mix('#9A978A', trunk, 0.12),
      lit: '#C9C6B8',
      dark: '#5E5A50',
    },
    ink: mix(pen.ink, trunk, 0.35),
    ground: c('sandDark'),
    grass: c('grass'),
    grassPale: c('grassPale'),
    straw: [
      shade(thatch, -0.72),
      shade(thatch, -0.55),
      shade(thatch, -0.38),
      shade(thatch, -0.2),
      thatch,
      shade(thatch, 0.18),
      shade(thatch, 0.36),
      shade(thatch, 0.55),
    ],
    roof: [
      shade(roofBase, -0.55),
      shade(roofBase, -0.35),
      shade(roofBase, -0.15),
      roofBase,
      shade(roofBase, 0.18),
      shade(roofBase, 0.36),
    ],
  };
}

// --- small helpers ---------------------------------------------------------------------------

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/** A smooth periodic noise: a sum of sines with random phases (k = lo … hi, amplitude ∝ 1/k). */
export function ringNoise(rnd: Rnd, lo: number, hi: number, amp: number): (t: number) => number {
  const terms: { k: number; a: number; p: number }[] = [];
  for (let k = lo; k <= hi; k++) terms.push({ k, a: (amp / k) * (0.5 + rnd()), p: rnd() * 7 });
  return (t) => terms.reduce((s, q) => s + q.a * Math.sin(q.k * t + q.p), 0);
}

export function inside(pts: readonly Pt[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i] as Pt;
    const [xj, yj] = pts[j] as Pt;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Collects stroke segments per (colour, width) and emits one <path> each. */
export class StrokeBin {
  private readonly bins = new Map<string, string[]>();
  private extra = 0;
  /** Counts strokes drawn elsewhere (in a limb's own bin). */
  tally(n: number): void {
    this.extra += n;
  }
  add(colour: string, w: number, d: string): void {
    const key = `${colour}|${r2(w)}`;
    const b = this.bins.get(key);
    if (b === undefined) this.bins.set(key, [d]);
    else b.push(d);
  }
  get count(): number {
    let n = this.extra;
    for (const b of this.bins.values()) n += b.length;
    return n;
  }
  /** Paths in `order` of colours (others last), so darker strokes sit under lighter ones. */
  svg(order: readonly string[], extra: Record<string, string | number> = {}): string {
    const rank = (k: string): number => {
      const i = order.indexOf(k.split('|')[0] ?? '');
      return i < 0 ? order.length : i;
    };
    return [...this.bins.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]))
      .map(([k, ds]) => {
        const [colour, w] = k.split('|');
        return el('path', {
          d: ds.join(''),
          fill: 'none',
          stroke: colour,
          'stroke-width': w,
          'stroke-linecap': 'round',
          ...extra,
        });
      })
      .join('');
  }
}

export function blurFilter(sd: number): { id: string; def: string } {
  const id = nextId();
  return {
    id,
    def: el(
      'filter',
      { id, x: '-60%', y: '-60%', width: '220%', height: '220%' },
      el('feGaussianBlur', { stdDeviation: sd }),
    ),
  };
}

// --- bark ------------------------------------------------------------------------------------

export interface Limb {
  /** Centre line, base to tip. */
  readonly pts: readonly Pt[];
  /** Width at each point. */
  readonly w: readonly number[];
  readonly dead?: boolean;
  /** A rounded knuckle (disc radius) at the limb's start, where it forks off its parent. */
  readonly knot?: number;
}

/** Zig-zag centre line from a to b: `kinks` angular bends alternating side to side. */
export function zigzag(rnd: Rnd, a: Pt, b: Pt, kinks: number, amp: number): Pt[] {
  const pts: Pt[] = [a];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  let side = rnd() < 0.5 ? -1 : 1;
  for (let k = 1; k <= kinks; k++) {
    const f = (k + (rnd() - 0.5) * 0.4) / (kinks + 1);
    const off = side * len * amp * (0.5 + rnd() * 0.7);
    pts.push([a[0] + dx * f + nx * off, a[1] + dy * f + ny * off]);
    side = -side;
  }
  pts.push(b);
  return soften(pts);
}

/** One Chaikin pass that keeps the ends: the zig-zag stays angular but its joints round off. */
export function soften(pts: readonly Pt[]): Pt[] {
  if (pts.length < 3) return [...pts];
  const out: Pt[] = [pts[0] as Pt];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i] as Pt;
    const b = pts[i + 1] as Pt;
    if (i > 0) out.push([a[0] * 0.82 + b[0] * 0.18, a[1] * 0.82 + b[1] * 0.18]);
    if (i < pts.length - 2) out.push([a[0] * 0.18 + b[0] * 0.82, a[1] * 0.18 + b[1] * 0.82]);
  }
  out.push(pts[pts.length - 1] as Pt);
  return out;
}

/** Linear width taper along a polyline (by arc length). */
export function taper(pts: readonly Pt[], w0: number, w1: number): number[] {
  const seg: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i] as Pt;
    const q = pts[i - 1] as Pt;
    seg.push((seg[i - 1] ?? 0) + Math.hypot(p[0] - q[0], p[1] - q[1]));
  }
  const total = seg[seg.length - 1] || 1;
  return seg.map((s) => w0 + (w1 - w0) * Math.pow(s / total, 0.85));
}

/** Densified copy (each segment split into `n` pieces) with interpolated widths. */
export function densify(l: Limb, n: number): Limb {
  const pts: Pt[] = [];
  const w: number[] = [];
  for (let i = 0; i < l.pts.length - 1; i++) {
    const a = l.pts[i] as Pt;
    const b = l.pts[i + 1] as Pt;
    const wa = l.w[i] ?? 1;
    const wb = l.w[i + 1] ?? 1;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      w.push(wa + (wb - wa) * t);
    }
  }
  pts.push(l.pts[l.pts.length - 1] as Pt);
  w.push(l.w[l.w.length - 1] ?? 1);
  return { pts, w, ...(l.dead ? { dead: true } : {}) };
}

/** Unit normal at point i, pointed to the shade side (away from the upper-left light). */
export function shadeNormal(pts: readonly Pt[], i: number): Pt {
  const a = pts[Math.max(0, i - 1)] as Pt;
  const b = pts[Math.min(pts.length - 1, i + 1)] as Pt;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (nx * 0.9 + ny * 0.45 < 0) {
    nx = -nx;
    ny = -ny;
  }
  return [nx, ny];
}

/** A band of the limb between normal offsets f0 and f1 (× half width), as a closed path. */
export function band(l: Limb, f0: number, f1: number): string {
  const a: Pt[] = [];
  const b: Pt[] = [];
  for (let i = 0; i < l.pts.length; i++) {
    const p = l.pts[i] as Pt;
    const n = shadeNormal(l.pts, i);
    const hw = (l.w[i] ?? 1) / 2;
    a.push([p[0] + n[0] * hw * f0, p[1] + n[1] * hw * f0]);
    b.push([p[0] + n[0] * hw * f1, p[1] + n[1] * hw * f1]);
  }
  return polyD([...a, ...b.reverse()]);
}

/**
 * The limbs as one merged silhouette: every outline first, then every fill over them, so the
 * joints (trunk into limbs, limbs into branches) show no seams.
 */
export function limbSilhouette(limbs: readonly Limb[], look: CamelthornLook): string {
  const live: string[] = [];
  const dead: string[] = [];
  const outlines = new Map<string, string[]>();
  for (const l of limbs) {
    const knot =
      l.knot === undefined ? '' : ellipseD(l.pts[0]?.[0] ?? 0, l.pts[0]?.[1] ?? 0, l.knot, l.knot);
    const d = band(densify(l, 5), -1, 1) + knot;
    (l.dead ? dead : live).push(d);
    const w = r2(clamp(Math.max(...l.w) * 0.07, 0.5, 2) * 2);
    const o = outlines.get(w);
    if (o === undefined) outlines.set(w, [d]);
    else o.push(d);
  }
  return g(
    {},
    ...[...outlines.entries()].map(([w, ds]) =>
      el('path', {
        d: ds.join(''),
        fill: look.ink,
        stroke: look.ink,
        'stroke-width': w,
        'stroke-linejoin': 'round',
      }),
    ),
    el('path', { d: live.join(''), fill: look.bark.fill }),
    el('path', { d: dead.join(''), fill: look.dead.fill }),
  );
}

/** One limb: soft outline, base fill, shade and lit bands, furrows, ridges and cracks. */
export function drawLimb(
  rnd: Rnd,
  limb: Limb,
  look: CamelthornLook,
  strokes: StrokeBin,
  withBody = true,
): string {
  const l = densify(limb, 5);
  // Each limb's own furrows sit on it (a later limb covers an earlier one's bark lines).
  const local = new StrokeBin();
  const col = l.dead ? look.dead : look.bark;
  const furrow = l.dead ? shade(look.dead.fill, -0.5) : look.furrow;
  const ridge = l.dead ? shade(look.dead.fill, 0.5) : look.ridge;
  const body = band(l, -1, 1);
  const maxW = Math.max(...l.w);
  const parts = [
    withBody
      ? el('path', {
          d: body,
          fill: col.fill,
          stroke: look.ink,
          'stroke-width': clamp(maxW * 0.06, 0.6, 2.2),
          'stroke-linejoin': 'round',
        })
      : '',
    el('path', { d: band(l, 0.05, 1), fill: col.shade, opacity: 0.85 }),
    el('path', { d: band(l, 0.55, 1), fill: shade(col.shade, -0.25), opacity: 0.7 }),
    el('path', { d: band(l, -1, -0.45), fill: col.lit, opacity: 0.8 }),
  ];
  // Furrows: broken lines along the limb, as many as its width allows.
  if (maxW > 3) {
    const lines = clamp(Math.round(maxW / 2.6), 2, 26);
    for (let k = 0; k < lines; k++) {
      const f = -0.85 + (1.7 * (k + 0.5)) / lines + (rnd() - 0.5) * 0.12;
      let d = '';
      let on = false;
      for (let i = 0; i < l.pts.length; i++) {
        const hw = (l.w[i] ?? 1) / 2;
        if (hw < 1.4) break;
        const p = l.pts[i] as Pt;
        const n = shadeNormal(l.pts, i);
        const j = (rnd() - 0.5) * hw * 0.12;
        const x = p[0] + n[0] * hw * f + n[0] * j;
        const y = p[1] + n[1] * hw * f + n[1] * j;
        if (!on || rnd() < 0.12) {
          d += `M${r2(x)} ${r2(y)}`;
          on = rnd() < 0.85;
        } else d += `L${r2(x)} ${r2(y)}`;
      }
      if (d.includes('L')) {
        const lit = f < -0.35;
        const w = clamp(maxW * (0.025 + rnd() * 0.03), 0.45, 1.6);
        local.add(lit ? shade(col.fill, -0.35) : furrow, w, d);
        // A thin light ridge on the lit half.
        if (f < -0.1 && rnd() < 0.5) local.add(ridge, w * 0.5, d);
      }
    }
    // Cracks: short ticks across the bark.
    const cracks = Math.round((maxW * l.pts.length) / 30);
    for (let k = 0; k < cracks; k++) {
      const i = Math.floor(rnd() * l.pts.length);
      const p = l.pts[i] as Pt;
      const hw = (l.w[i] ?? 1) / 2;
      if (hw < 3) continue;
      const n = shadeNormal(l.pts, i);
      const f = (rnd() - 0.5) * 1.5;
      const x = p[0] + n[0] * hw * f;
      const y = p[1] + n[1] * hw * f;
      const len = hw * (0.15 + rnd() * 0.3);
      local.add(
        furrow,
        clamp(hw * 0.08, 0.5, 1.4),
        `M${r2(x)} ${r2(y)}l${r2(n[0] * len)} ${r2(n[1] * len + (rnd() - 0.5) * 2)}`,
      );
    }
  }
  strokes.tally(local.count);
  return g({}, ...parts, local.svg([]));
}

// --- foliage ---------------------------------------------------------------------------------

export interface Clump {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
  /** 0 = back (darker), 1 = front. */
  readonly depth: number;
}

/** A clump's lumpy underside shadow mass (keeps the clump's core dense). */
export function clumpCore(rnd: Rnd, c: Clump): string {
  const n = ringNoise(rnd, 3, 9, 0.5);
  const pts: Pt[] = [];
  for (let k = 0; k < 28; k++) {
    const t = (k / 28) * Math.PI * 2;
    const r = 0.72 + n(t) * 0.35;
    pts.push([c.x + Math.cos(t) * c.rx * r, c.y + c.ry * 0.18 + Math.sin(t) * c.ry * 0.62 * r]);
  }
  return polyD(pts);
}

/**
 * Foliage of a set of clumps: per depth layer, a dark core per clump, then feathery leaf dabs
 * coloured by height in the clump (dark underside → lit top) and by side (lit left).
 */
export function foliage(
  rnd: Rnd,
  clumps: readonly Clump[],
  look: CamelthornLook,
  density: number,
  dabLen: number,
): string {
  const leaf = look.leaf;
  const cores: string[] = [];
  const bin = new StrokeBin();
  for (const c of clumps) {
    cores.push(clumpCore(rnd, c));
    const count = Math.round(c.rx * c.ry * density);
    for (let k = 0; k < count; k++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * 1.08;
      const x = c.x + Math.cos(a) * c.rx * rr;
      const y = c.y + Math.sin(a) * c.ry * rr;
      const v = (y - c.y) / c.ry; // −1 top … 1 bottom
      const u = (x - c.x) / c.rx; // −1 left (lit) … 1 right
      const lum = -v * 0.55 - u * 0.25 + (rnd() - 0.5) * 0.7 + c.depth * 0.35 - 0.15;
      const idx = clamp(Math.round(2.5 + lum * 2.4), 0, leaf.length - 1);
      const colour = leaf[idx] as string;
      const len = dabLen * (0.55 + rnd() * 0.8);
      const ang = rnd() * Math.PI;
      const w = dabLen * (0.42 + rnd() * 0.3);
      bin.add(
        colour,
        r2(w * 2) === '0' ? 0.5 : Math.round(w * 4) / 4,
        `M${r2(x)} ${r2(y)}l${r2(Math.cos(ang) * len)} ${r2(Math.sin(ang) * len * 0.6)}`,
      );
    }
    // Tiny sun flecks on the upper-left of each clump.
    for (let k = 0; k < Math.round(c.rx * 0.5); k++) {
      const a = Math.PI * (1.05 + rnd() * 0.6);
      const rr = 0.45 + rnd() * 0.55;
      const x = c.x + Math.cos(a) * c.rx * rr;
      const y = c.y + Math.sin(a) * c.ry * rr;
      bin.add(
        leaf[leaf.length - 1] as string,
        Math.round(dabLen * 0.35 * 4) / 4 || 0.5,
        `M${r2(x)} ${r2(y)}l${r2(dabLen * 0.5)} ${r2(-dabLen * 0.15)}`,
      );
    }
  }
  return g({}, el('path', { d: cores.join(''), fill: leaf[0], opacity: 0.92 }), bin.svg(leaf));
}

// --- pods ------------------------------------------------------------------------------------

/** A grey velvety half-moon pod (ear-shaped), length `len`, at angle `ang`. */
export function pod(x: number, y: number, len: number, ang: number, look: CamelthornLook): string {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const P = (u: number, v: number): string =>
    `${r2(x + u * ca - v * sa)} ${r2(y + u * sa + v * ca)}`;
  const h = len * 0.5;
  const outer = `M${P(-h, 0)}Q${P(0, len * 0.62)} ${P(h, 0)}Q${P(h * 0.9, -len * 0.1)} ${P(h * 0.7, -len * 0.06)}Q${P(0, len * 0.28)} ${P(-h * 0.75, -len * 0.08)}Q${P(-h * 0.95, -len * 0.08)} ${P(-h, 0)}Z`;
  const rim = `M${P(-h * 0.8, len * 0.12)}Q${P(0, len * 0.55)} ${P(h * 0.8, len * 0.12)}`;
  return g(
    {},
    el('path', {
      d: outer,
      fill: look.pod.fill,
      stroke: look.pod.dark,
      'stroke-width': clamp(len * 0.06, 0.4, 1.2),
    }),
    el('path', {
      d: rim,
      fill: 'none',
      stroke: look.pod.lit,
      'stroke-width': clamp(len * 0.08, 0.4, 1.4),
      'stroke-linecap': 'round',
      opacity: 0.8,
    }),
  );
}

/**
 * v1.7c (D-047): a pod lying on the sand (it rocks when shot). `turn` false: no random half
 * turn (the dead tree's pods, as drawn since v1.4). Uses the random stream as the old inline
 * calls did.
 */
export function groundPod(
  rnd: Rnd,
  x: number,
  y: number,
  len: number,
  look: CamelthornLook,
  turn = true,
): string {
  const ang = (rnd() - 0.5) * 0.8 + (turn ? (rnd() < 0.5 ? 0 : Math.PI) : 0);
  return fruit({
    species: 'camelthorn_pod',
    motion: 'ground',
    x,
    y: y + len * 0.2,
    ground: y + len * 0.2,
    reach: len + 4,
    svg: pod(x, y, len, ang, look),
    hi: () => ({ body: camelPodHi(x, y, len, ang, look.pod) }),
  });
}

// --- the tree --------------------------------------------------------------------------------

export interface CamelthornSpec {
  readonly variant: CamelthornVariant;
  /** Foot of the trunk. */
  readonly x: number;
  readonly foot: number;
  /** Crown half-width, its top y and its depth (top to underside). */
  readonly crownW: number;
  readonly crownTop: number;
  readonly crownDepth: number;
  /** Where the trunk forks (y). */
  readonly forkY: number;
  /** Trunk lean at the fork (px, + = right). */
  readonly lean: number;
  /** Trunk width at the foot. */
  readonly trunkW: number;
  /** Leaf dab length (design px): smaller on far trees. */
  readonly dab?: number;
  /** Dab density (per px² of clump). */
  readonly density?: number;
  /** Draw the shade circle, pods and grass on the ground. */
  readonly ground?: boolean;
  /** The weaver nest (nest variant): drawn between the back and front of the tree. */
  readonly nest?: NestSpec;
  /** Clump count override. */
  readonly clumps?: number;
  /** v1.7d (D-059): the biome's own grass tuft at the foot (default: the inked blonde tuft). */
  readonly tuft?: (rnd: Rnd, x: number, y: number, h: number) => string;
}

export interface CamelthornArt {
  readonly svg: string;
  /** Strokes and dabs drawn (for the detail check in tests). */
  readonly strokes: number;
  readonly clumps: number;
}

/** Limb tips where clumps gather, plus the limbs themselves. */
/** A tapering limb from a to b with gentle kinks and rounded joints (two softening passes). */
export function bough(
  rnd: Rnd,
  a: Pt,
  b: Pt,
  w0: number,
  w1: number,
  kinks: number,
  amp: number,
): Limb {
  const pts = soften(zigzag(rnd, a, b, kinks, amp));
  return { pts, w: taper(pts, w0, w1) };
}

/** Width of a limb at the point nearest to p (to start a child limb as wide as its parent). */
export function widthNear(l: Limb, p: Pt): number {
  let best = l.w[0] ?? 1;
  let dist = Infinity;
  l.pts.forEach((q, i) => {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < dist) {
      dist = d;
      best = l.w[i] ?? best;
    }
  });
  return best;
}

/**
 * The nest tree (refinement 2): the mature umbrella's build — a short, thick, furrowed trunk
 * that forks at different heights and angles into tapering limbs with rounded joints, the
 * crown spreading wider than the nest. The nest sits on the upper limbs.
 */
function nestSkeleton(rnd: Rnd, s: CamelthornSpec): { limbs: Limb[]; tips: Pt[]; deadTips: Pt[] } {
  const x = s.x;
  const W = s.crownW;
  const under = s.crownTop + s.crownDepth;
  const limbs: Limb[] = [];
  const tips: Pt[] = [];
  const fork1: Pt = [x + s.lean, s.forkY];
  const t0 = bough(rnd, [x, s.foot], fork1, s.trunkW, s.trunkW * 0.86, 1, 0.03);
  /** A point a little way back inside a limb from its end: children start there, so the joint
   *  is covered by wood instead of showing the parent's square end. */
  const back = (l: Limb): Pt => {
    const n = l.pts.length;
    const end = l.pts[n - 1] ?? fork1;
    const prev = l.pts[n - 2] ?? end;
    const seg = Math.hypot(end[0] - prev[0], end[1] - prev[1]) || 1;
    const f = Math.min(0.9, ((l.w[n - 1] ?? 4) * 1.6) / seg);
    return [end[0] + (prev[0] - end[0]) * f, end[1] + (prev[1] - end[1]) * f];
  };
  // Root flare at the sand.
  limbs.push({ pts: t0.pts, w: t0.w.map((w, i) => (i === 0 ? w * 1.3 : w)) });
  const tw = s.trunkW * 0.86;
  // Left limb: leans out early and forks again lower down.
  const forkA: Pt = [x - W * 0.32, s.forkY - (s.forkY - under) * 0.3];
  const A: Limb = { ...bough(rnd, back(t0), forkA, tw * 0.84, tw * 0.6, 0, 0), knot: tw * 0.5 };
  // Right limb: the main stem, rising to a higher fork.
  const forkB: Pt = [x + W * 0.18, s.forkY - (s.forkY - under) * 0.5];
  const B: Limb = { ...bough(rnd, back(t0), forkB, tw * 0.9, tw * 0.66, 0, 0), knot: tw * 0.5 };
  limbs.push(A, B);
  const out = (from: Limb, a: Pt, b: Pt, k: number, kinks = 1): Limb => {
    const w0 = widthNear(from, a) * k;
    const b0 = bough(rnd, a, b, w0, Math.max(2.5, w0 * 0.2), kinks, 0.09);
    const l: Limb = { ...b0, knot: widthNear(from, a) * 0.5 };
    limbs.push(l);
    tips.push(b);
    return l;
  };
  const yC = (f: number): number => s.crownTop + s.crownDepth * f;
  const A1 = out(A, forkA, [x - W * 0.86, yC(0.62)], 0.95, 2);
  const A2 = out(A, forkA, [x - W * 0.3, yC(0.3)], 0.85, 2);
  const B1 = out(B, forkB, [x + W * 0.05, yC(0.22)], 0.9, 2);
  const B2 = out(B, forkB, [x + W * 0.84, yC(0.58)], 0.95, 2);
  // A low side branch off the right limb, out under the crown edge.
  const mid = B.pts[Math.floor(B.pts.length * 0.45)] ?? forkB;
  out(B, mid, [x + W * 0.55, yC(0.85)], 0.5, 1);
  // Secondary branches spreading through the crown from the upper limbs.
  for (const l of [A1, A2, B1, B2]) {
    for (const f of [0.55, 0.8]) {
      const p = l.pts[Math.floor(l.pts.length * f)] ?? l.pts[0];
      if (p === undefined) continue;
      const side = rnd() < 0.5 ? -1 : 1;
      const bx = clamp(p[0] + side * W * (0.15 + rnd() * 0.25), x - W * 0.95, x + W * 0.95);
      const by = clamp(p[1] - s.crownDepth * (0.15 + rnd() * 0.3), yC(0.15), yC(0.8));
      out(l, p, [bx, by], 0.6, 1);
    }
  }
  return { limbs, tips, deadTips: [] };
}

function skeleton(rnd: Rnd, s: CamelthornSpec): { limbs: Limb[]; tips: Pt[]; deadTips: Pt[] } {
  if (s.variant === 'nest') return nestSkeleton(rnd, s);
  const limbs: Limb[] = [];
  const tips: Pt[] = [];
  const deadTips: Pt[] = [];
  const fork: Pt = [s.x + s.lean, s.forkY];
  const trunkPts = zigzag(rnd, [s.x, s.foot], fork, 2, 0.04);
  // Root flare: the trunk widens toward the sand.
  const tw = taper(trunkPts, s.trunkW, s.trunkW * 0.72).map((w, i) => (i === 0 ? w * 1.25 : w));
  limbs.push({ pts: trunkPts, w: tw });
  const under = s.crownTop + s.crownDepth;
  const young = s.variant === 'young';
  const main = young ? 3 : 3 + Math.floor(rnd() * 2);
  for (let k = 0; k < main; k++) {
    const f = main === 1 ? 0 : k / (main - 1) - 0.5; // −0.5 … 0.5
    const tx = s.x + f * s.crownW * 1.55 + (rnd() - 0.5) * s.crownW * 0.12;
    const ty = under - s.crownDepth * (0.25 + rnd() * 0.25) - Math.abs(f) * s.crownDepth * 0.1;
    const dead = s.variant === 'old' && tx > s.x + s.crownW * 0.05;
    const pts = zigzag(rnd, fork, [tx, ty], young ? 1 : 2 + Math.floor(rnd() * 2), 0.12);
    const w0 = s.trunkW * (main > 3 ? 0.5 : 0.6) * (0.85 + rnd() * 0.2);
    // Each main limb starts as wide as the trunk top, so the fork flares out of the trunk.
    const lw = taper(pts, w0, w0 * 0.22);
    lw[0] = Math.max(w0, s.trunkW * 0.66);
    limbs.push({ pts, w: lw, ...(dead ? { dead } : {}) });
    // Secondary branches from the kinks, out and up to the crown.
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i] as Pt;
      const n = young ? 2 : 2 + Math.floor(rnd() * 2);
      for (let b = 0; b < n; b++) {
        const side = b % 2 === 0 ? -1 : 1;
        const reach = s.crownW * (0.25 + rnd() * 0.35);
        const bx = clamp(
          p[0] + side * reach * (0.6 + Math.abs(f)),
          s.x - s.crownW * 0.98,
          s.x + s.crownW * 0.98,
        );
        const by = clamp(
          p[1] - s.crownDepth * (0.2 + rnd() * 0.45),
          s.crownTop + s.crownDepth * 0.25,
          under - s.crownDepth * 0.05,
        );
        const bp = zigzag(rnd, p, [bx, by], 1 + Math.floor(rnd() * 2), 0.14);
        const bw = (w0 * 0.3 + 2) * (0.7 + rnd() * 0.3);
        limbs.push({ pts: bp, w: taper(bp, bw, bw * 0.18), ...(dead ? { dead } : {}) });
        (dead ? deadTips : tips).push([bx, by]);
      }
    }
    (dead ? deadTips : tips).push([tx, ty]);
  }
  return { limbs, tips, deadTips };
}

/** Fine twigs fanning from a tip (thin zig-zag strokes). */
export function twigs(
  rnd: Rnd,
  tip: Pt,
  s: CamelthornSpec,
  colour: string,
  bin: StrokeBin,
  n: number,
  up: number,
): void {
  for (let k = 0; k < n; k++) {
    const ang = -Math.PI / 2 + (rnd() - 0.5) * 2.4;
    const len = s.crownDepth * (0.1 + rnd() * 0.16) * up;
    const end: Pt = [tip[0] + Math.cos(ang) * len * 1.4, tip[1] + Math.sin(ang) * len];
    const pts = zigzag(rnd, tip, end, 2, 0.18);
    bin.add(colour, clamp(s.trunkW * 0.02, 0.5, 1), polyD(pts, false));
    // Side spurs.
    const m = pts[1] as Pt;
    bin.add(
      colour,
      clamp(s.trunkW * 0.014, 0.4, 0.7),
      `M${r2(m[0])} ${r2(m[1])}l${r2((rnd() - 0.5) * len * 0.6)} ${r2(-len * 0.3 * rnd())}`,
    );
  }
}

export function camelthornTree(
  rnd: Rnd,
  s: CamelthornSpec,
  look: CamelthornLook,
  pen: Pen,
): CamelthornArt {
  const { limbs, tips, deadTips } = skeleton(rnd, s);
  const under = s.crownTop + s.crownDepth;
  const dab = s.dab ?? 2.6;
  const density = s.density ?? 0.3;
  // Clumps: one on every live tip, the rest spread across the umbrella (flat top, deeper
  // middle), avoiding the bare side of an old tree.
  const nClumps = s.clumps ?? (s.variant === 'young' ? 32 : s.variant === 'old' ? 34 : 50);
  const clumps: Clump[] = [];
  const bareFrom = s.variant === 'old' ? s.x + s.crownW * 0.15 : Infinity;
  const addClump = (x: number, y: number, size: number): void => {
    if (x > bareFrom) return;
    const rx = s.crownW * (0.11 + rnd() * 0.1) * size;
    const ry = rx * (0.42 + rnd() * 0.18);
    clumps.push({ x, y, rx, ry, depth: rnd() });
  };
  for (const t of tips) addClump(t[0], t[1] - s.crownDepth * 0.1, s.variant === 'young' ? 1.6 : 1);
  // The limbs that pass out of the nest end in foliage too, and a few clumps hang in front of
  // and over the nest's top edge, so it sits among the branches rather than under the crown.
  const nest = s.nest;
  if (nest !== undefined) {
    const front = (x: number, y: number, size: number): void => {
      addClump(x, y, size);
      const c = clumps[clumps.length - 1];
      if (c !== undefined) clumps[clumps.length - 1] = { ...c, depth: 0.9 };
    };
    for (const l of nest.limbsOut) front(l[1][0], l[1][1] - s.crownDepth * 0.05, 1);
    const roofY = nest.cy - nest.top;
    for (const f of [-0.72, -0.28, 0.12, 0.5, 0.82])
      front(
        nest.cx + f * nest.a + (rnd() - 0.5) * 16,
        roofY + nest.top * (0.05 + rnd() * 0.2),
        0.62,
      );
  }
  let guard = 0;
  while (clumps.length < nClumps && guard++ < nClumps * 20) {
    const u = rnd() * 2 - 1;
    const x = s.x + u * s.crownW * 0.92;
    // Umbrella envelope: a nearly flat top that rounds off at the rim, a gently domed underside.
    const top =
      s.crownTop + s.crownDepth * 0.12 * u * u + s.crownDepth * 0.08 * Math.pow(Math.abs(u), 6);
    const bottom = under - s.crownDepth * 0.25 * u * u;
    if (bottom - top < s.crownDepth * 0.25) continue;
    const y = top + (bottom - top) * (0.15 + rnd() * 0.7);
    addClump(x, y, s.variant === 'young' ? 1.7 : 1 - Math.abs(u) * 0.25);
  }
  const back = clumps.filter((c) => c.depth < 0.45).map((c) => ({ ...c, depth: c.depth * 0.6 }));
  const front = clumps.filter((c) => c.depth >= 0.45);

  const bark = new StrokeBin();
  // Thin limbs first, the trunk last: thicker wood overlaps the joints of thinner.
  const limbSvg = [...limbs]
    .sort((a, b) => (b.w[0] ?? 0) - (a.w[0] ?? 0))
    .map((l) => drawLimb(rnd, l, look, bark, false));
  limbSvg.unshift(limbSilhouette(limbs, look));
  const twigBin = new StrokeBin();
  for (const t of tips)
    twigs(rnd, t, s, shade(look.bark.fill, -0.2), twigBin, 4 + Math.floor(rnd() * 3), 1);
  for (const t of deadTips) twigs(rnd, t, s, look.dead.fill, twigBin, 5, 1.2);
  // A few bare dead branches poking out of the crown top.
  const deadBin = new StrokeBin();
  const pokes = s.variant === 'young' ? 1 : 3;
  for (let k = 0; k < pokes; k++) {
    const t = tips[Math.floor(rnd() * tips.length)] ?? [s.x, s.crownTop];
    const end: Pt = [
      t[0] + (rnd() - 0.5) * s.crownW * 0.4,
      s.crownTop - s.crownDepth * (0.08 + rnd() * 0.17),
    ];
    const pts = zigzag(rnd, t, end, 3, 0.15);
    deadBin.add(look.ink, clamp(s.trunkW * 0.09, 1.2, 3.6), polyD(pts, false));
    deadBin.add(look.dead.fill, clamp(s.trunkW * 0.06, 0.8, 2.6), polyD(pts, false));
    twigs(rnd, end, s, look.dead.fill, deadBin, 2, 0.5);
  }

  // Pods hanging under clumps (on a short stalk) and lying in the shade.
  const pods: string[] = [];
  const podLen = s.crownW * (s.variant === 'young' ? 0.06 : 0.048);
  const hanging = s.variant === 'young' ? 4 : 11;
  const low = front.filter((c) => c.y > under - s.crownDepth * 0.45);
  for (let k = 0; k < hanging && low.length > 0; k++) {
    const c = low[Math.floor(rnd() * low.length)] as Clump;
    const x = c.x + (rnd() - 0.5) * c.rx;
    const y = c.y + c.ry * (0.45 + rnd() * 0.4);
    const plen = podLen * (0.8 + rnd() * 0.4);
    const pang = Math.PI / 2 + (rnd() - 0.5) * 0.9;
    const stalk = el('path', {
      d: `M${r2(x)} ${r2(y - podLen * 0.3)}l0 ${r2(podLen * 0.3)}`,
      stroke: look.pod.dark,
      'stroke-width': 0.6,
    });
    const one = g({}, stalk, pod(x, y + podLen * 0.1, plen, pang, look));
    // v1.7c (D-047): each hanging pod swings and drops when shot.
    pods.push(
      fruit({
        species: 'camelthorn_pod',
        motion: 'hang',
        x,
        y: y - podLen * 0.3,
        ground: s.foot,
        reach: podLen * 1.6 + 4,
        svg: one,
        hi: () => {
          // The pod hangs from its upper tip, at the end of a short stalk.
          const tip = { x, y: y + podLen * 0.05 };
          const cx = tip.x + Math.cos(pang) * plen * 0.5;
          const cy = tip.y + Math.sin(pang) * plen * 0.5;
          return {
            body: g(
              {},
              el('path', {
                d: `M${r2(x)} ${r2(y - podLen * 0.3)}L${r2(tip.x)} ${r2(tip.y + 0.4)}`,
                stroke: shade(look.pod.dark, -0.3),
                'stroke-width': 0.8,
                'stroke-linecap': 'round',
              }),
              camelPodHi(cx, cy, plen, pang, look.pod),
            ),
          };
        },
        trunk: { x: s.x, half: s.trunkW / 2 + 3 },
      }),
    );
  }

  const parts: string[] = [];
  const defs: string[] = [];
  if (s.ground !== false) {
    // Dappled shade circle (under the crown, the sun high and a little left).
    const blur = blurFilter(Math.max(1.5, s.crownW * 0.02));
    defs.push(blur.def);
    const cx = s.x + s.lean * 0.4 + s.crownW * 0.08;
    const ry = Math.max(6, s.crownW * 0.075);
    const spots: string[] = [];
    for (let k = 0; k < 18; k++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * 0.8;
      spots.push(
        ellipseD(
          cx + Math.cos(a) * s.crownW * 0.85 * rr,
          s.foot + 2 + Math.sin(a) * ry * rr,
          s.crownW * (0.03 + rnd() * 0.05),
          ry * (0.12 + rnd() * 0.15),
        ),
      );
    }
    parts.push(
      g(
        { filter: `url(#${blur.id})` },
        el('path', {
          d: ellipseD(cx, s.foot + 2, s.crownW * 0.95, ry),
          fill: '#2A1A14',
          opacity: 0.3,
        }),
        el('path', {
          d: ellipseD(s.x, s.foot + 1, s.trunkW * 1.6, ry * 0.4),
          fill: '#2A1A14',
          opacity: 0.35,
        }),
        el('path', { d: spots.join(''), fill: shade(look.ground, 0.15), opacity: 0.5 }),
      ),
    );
  }
  // Back half of the crown (darker, behind the limbs), then the limbs and twigs.
  parts.push(
    g({ opacity: 1 }, foliage(rnd, back, { ...look, leaf: look.leaf.slice(0, -1) }, density, dab)),
  );
  parts.push(twigBin.svg([]), ...limbSvg, bark.svg([look.furrow]));
  if (s.nest !== undefined)
    parts.push(weaverNest(rnd, s.nest, look, pen, s).svg, nestFront(rnd, s.nest, look));
  parts.push(deadBin.svg([look.ink]));
  parts.push(foliage(rnd, front, look, density, dab));
  parts.push(...pods);
  if (s.ground !== false) {
    // Pods on the sand and blonde grass tufts round the shade.
    for (let k = 0; k < (s.variant === 'young' ? 3 : 9); k++) {
      const x = s.x + (rnd() - 0.5) * s.crownW * 1.4;
      parts.push(groundPod(rnd, x, s.foot + (rnd() - 0.3) * 6, podLen * (1.1 + rnd() * 0.4), look));
    }
    const tufts: { x: number; y: number }[] = [];
    for (let k = 0; k < (s.variant === 'young' ? 3 : 6); k++) {
      const side = k % 2 === 0 ? -1 : 1;
      tufts.push({ x: s.x + side * s.crownW * (0.35 + rnd() * 0.75), y: s.foot + 4 + rnd() * 8 });
    }
    tufts.sort((a, b) => a.y - b.y);
    for (const t of tufts)
      parts.push(
        s.tuft !== undefined
          ? s.tuft(rnd, t.x, t.y, Math.max(22, s.crownW * (0.1 + rnd() * 0.08)))
          : tuft(
              rnd,
              t.x,
              t.y,
              Math.max(22, s.crownW * (0.1 + rnd() * 0.08)),
              tone(rnd() < 0.5 ? look.grass : look.grassPale, 0.25, 0.25),
              { ink: look.ink, w: Math.max(0.4, pen.w * 0.18) },
              9,
            ),
      );
  }
  return {
    svg: g({}, ...defs, ...parts),
    strokes: bark.count + twigBin.count + deadBin.count,
    clumps: clumps.length,
  };
}

// --- the sociable-weaver family nest ---------------------------------------------------------

export interface NestSpec {
  /** Centre of the main mass and its half-width / half-heights (roof above, belly below). */
  readonly cx: number;
  readonly cy: number;
  readonly a: number;
  readonly top: number;
  readonly bottom: number;
  /** The smaller lobe hanging below (centre and radii). */
  readonly lobe: {
    readonly x: number;
    readonly y: number;
    readonly rx: number;
    readonly ry: number;
  };
  /** Limbs that come out of the nest (from a point on the nest to a point in the crown). */
  readonly limbsOut: readonly (readonly [Pt, Pt, number])[];
  /** Entrance holes (count; 10–20). */
  readonly holes: number;
  /** Straw strokes inside the silhouette (≥ 1500 at full size). */
  readonly straws: number;
}

interface Mass {
  readonly pts: Pt[];
  readonly cx: number;
  readonly cy: number;
  readonly a: number;
  readonly top: number;
  readonly bottom: number;
  /** Roof eave y at x (the thatched roof sits above it). */
  readonly eave: (x: number) => number;
  readonly bottomAt: (x: number) => number;
}

/** A lumpy, noise-displaced nest mass: a domed roof, bulging sides and a sagging belly. */
function nestMass(
  rnd: Rnd,
  cx: number,
  cy: number,
  a: number,
  top: number,
  bottom: number,
  bumps: readonly number[],
): Mass {
  const lumps = ringNoise(rnd, 3, 7, Math.min(a, top + bottom) * 0.12);
  const fine = ringNoise(rnd, 14, 34, Math.min(a, top + bottom) * 0.14);
  // 2–3 irregular bulges on the sides (angle, size).
  const bulges: { t: number; amp: number; w: number }[] = [];
  const nb = 2 + Math.floor(rnd() * 2);
  for (let k = 0; k < nb; k++) {
    const side = k % 2 === 0 ? 0 : Math.PI;
    bulges.push({
      t: side + (rnd() - 0.3) * 0.9,
      amp: a * (0.05 + rnd() * 0.06),
      w: 0.3 + rnd() * 0.25,
    });
  }
  const angDist = (p: number, q: number): number => {
    const d = Math.abs(p - q) % (Math.PI * 2);
    return Math.min(d, Math.PI * 2 - d);
  };
  const pts: Pt[] = [];
  const N = 240;
  for (let k = 0; k < N; k++) {
    const t = (k / N) * Math.PI * 2;
    const c = Math.cos(t);
    const sn = Math.sin(t);
    const up = sn < 0;
    // A haystack: a rounded dome narrowing toward its crest, fat bulging sides, and a flat-ish
    // underside (seen a little from below) with a slight sag.
    let x: number;
    let y: number;
    if (up) {
      const narrow = 0.8 + 0.2 * (1 - Math.abs(sn));
      x = cx + Math.sign(c) * Math.pow(Math.abs(c), 0.85) * a * narrow;
      y = cy - top * Math.pow(Math.abs(sn), 1.15);
    } else {
      x = cx + Math.sign(c) * Math.pow(Math.abs(c), 0.6) * a;
      y = cy + bottom * Math.pow(Math.abs(sn), 0.5);
      y += Math.pow(Math.max(0, 1 - Math.abs(c)), 2) * bottom * 0.1;
    }
    // The roof rises a little where a branch enters it.
    if (up) for (const bx of bumps) y -= top * 0.16 * Math.exp(-Math.pow((x - bx) / (a * 0.13), 2));
    let d = lumps(t) + fine(t);
    for (const b of bulges) d += b.amp * Math.exp(-Math.pow(angDist(t, b.t) / b.w, 2));
    x += c * d;
    y += sn * d * 0.7;
    pts.push([x, y]);
  }
  // An irregular eave: two incommensurate noises plus random steps, not a regular wave.
  const eaveA = ringNoise(rnd, 2, 5, top * 0.35);
  const eaveB = ringNoise(rnd, 9, 23, top * 0.45);
  const eaveN = (t: number): number => eaveA(t) + eaveB(t * 1.37 + 0.6);
  const roofEdge = (x: number): number => {
    let best = cy - top;
    let dist = Infinity;
    for (const p of pts)
      if (p[1] < cy && Math.abs(p[0] - x) < dist) {
        dist = Math.abs(p[0] - x);
        best = p[1];
      }
    return best;
  };
  const bottomAt = (x: number): number => {
    let best = cy + bottom;
    let dist = Infinity;
    for (const p of pts)
      if (p[1] > cy && Math.abs(p[0] - x) < dist) {
        dist = Math.abs(p[0] - x);
        best = p[1];
      }
    return best;
  };
  return {
    pts,
    cx,
    cy,
    a,
    top,
    bottom,
    eave: (x) =>
      roofEdge(x) + top * 0.7 + eaveN((x / a) * 2) - Math.pow((x - cx) / a, 2) * top * 0.35,
    bottomAt,
  };
}

/** Shading, straws, strays, fringe and holes of one nest mass. */
function paintMass(
  rnd: Rnd,
  m: Mass,
  look: CamelthornLook,
  nStraws: number,
  nHoles: number,
  strayScale: number,
): { svg: string; straws: number; holes: number; holeHeight: number } {
  const clip = nextId();
  const body = polyD(m.pts);
  const defs: string[] = [el('clipPath', { id: clip }, el('path', { d: body }))];
  const S = look.straw;
  const R = look.roof;
  const ys = m.cy - m.top * 1.3;
  const ye = m.cy + m.bottom * 1.25;
  // Side shading: golden mid-tone, deep shadow on the belly.
  const vg = nextId();
  defs.push(
    el(
      'linearGradient',
      { id: vg, x1: 0, y1: ys, x2: 0, y2: ye, gradientUnits: 'userSpaceOnUse' },
      el('stop', { offset: 0, 'stop-color': S[5] }),
      el('stop', { offset: 0.45, 'stop-color': S[4] }),
      el('stop', { offset: 0.72, 'stop-color': S[3] }),
      el('stop', { offset: 0.9, 'stop-color': S[1] }),
      el('stop', { offset: 1, 'stop-color': S[0] }),
    ),
  );
  // Sunlit left, shaded right.
  const hg = nextId();
  defs.push(
    el(
      'linearGradient',
      {
        id: hg,
        x1: m.cx - m.a,
        y1: 0,
        x2: m.cx + m.a * 1.1,
        y2: 0,
        gradientUnits: 'userSpaceOnUse',
      },
      el('stop', { offset: 0, 'stop-color': S[7], 'stop-opacity': 0.45 }),
      el('stop', { offset: 0.35, 'stop-color': S[6], 'stop-opacity': 0 }),
      el('stop', { offset: 0.65, 'stop-color': S[1], 'stop-opacity': 0 }),
      el('stop', { offset: 1, 'stop-color': S[0], 'stop-opacity': 0.55 }),
    ),
  );
  // The roof: everything above the ragged eave line.
  const roofPts: Pt[] = [];
  for (let x = m.cx - m.a * 1.4; x <= m.cx + m.a * 1.4; x += m.a / 40) roofPts.push([x, m.eave(x)]);
  const roof = polyD([
    [m.cx - m.a * 1.4, m.cy - m.top * 2],
    ...roofPts,
    [m.cx + m.a * 1.4, m.cy - m.top * 2],
  ]);
  const rg = nextId();
  defs.push(
    el(
      'linearGradient',
      {
        id: rg,
        x1: m.cx - m.a,
        y1: m.cy - m.top,
        x2: m.cx + m.a,
        y2: m.cy,
        gradientUnits: 'userSpaceOnUse',
      },
      el('stop', { offset: 0, 'stop-color': R[5] }),
      el('stop', { offset: 0.4, 'stop-color': R[3] }),
      el('stop', { offset: 1, 'stop-color': R[1] }),
    ),
  );
  const eaveD = polyD(roofPts, false);
  const roofSoft = blurFilter(Math.max(2, m.top * 0.14));
  defs.push(roofSoft.def);
  const soft = blurFilter(Math.max(1.6, m.top * 0.1));
  const softer = blurFilter(Math.max(2, m.bottom * 0.18));
  defs.push(soft.def, softer.def);

  // Straws that follow the form: roof thatch down the slope, sides hanging vertically.
  const bin = new StrokeBin();
  let placed = 0;
  let guard = 0;
  while (placed < nStraws && guard++ < nStraws * 6) {
    const x = m.cx + (rnd() * 2 - 1) * m.a * 1.15;
    const y = m.cy - m.top * 1.25 + rnd() * (m.top + m.bottom) * 1.35;
    if (!inside(m.pts, x, y)) continue;
    placed++;
    const u = (x - m.cx) / m.a;
    const eave = m.eave(x);
    // A soft, ragged change: near the eave a straw is roof thatch or side straw by chance.
    const roofness = clamp((eave - y) / (m.top * 0.32) + 0.5 + (rnd() - 0.5) * 0.5, 0, 1);
    const onRoof = rnd() < roofness;
    let ang: number;
    let len: number;
    let colour: string;
    const lightSide = -u * 0.35;
    if (onRoof) {
      // Down the slope: outward and down, steeper toward the rim.
      ang = Math.atan2(1, u * 1.6) + (rnd() - 0.5) * 0.3;
      len = m.top * (0.16 + rnd() * 0.3);
      // Roof thatch near the eave is longer and hangs over the side straws (ragged edge).
      if (y > eave - m.top * 0.25) len *= 1.5;
      const lum =
        0.5 +
        lightSide +
        (rnd() - 0.5) * 1.1 -
        Math.max(0, (y - (eave - m.top * 0.2)) / (m.top * 0.2)) * 0.25;
      colour = R[clamp(Math.round(lum * (R.length - 1)), 0, R.length - 1)] as string;
    } else {
      ang = Math.PI / 2 + u * 0.18 + (rnd() - 0.5) * 0.22;
      len = m.bottom * (0.14 + rnd() * 0.3);
      const below = clamp((y - eave) / Math.max(1, m.bottomAt(x) - eave), 0, 1); // 0 eave … 1 belly
      // Deep shadow just under the overhang and on the belly, golden between.
      const lum =
        0.62 +
        lightSide +
        (rnd() - 0.5) * 0.55 -
        Math.exp(-below * 9) * 0.5 -
        Math.pow(below, 2.2) * 0.55;
      colour = S[clamp(Math.round(lum * (S.length - 1)), 0, S.length - 1)] as string;
    }
    const dx = Math.cos(ang) * len;
    const dy = Math.sin(ang) * len;
    const w = (rnd() < 0.15 ? 1.5 : rnd() < 0.5 ? 1.05 : 0.7) * (onRoof ? 1.25 : 1);
    bin.add(
      colour,
      w,
      `M${r2(x)} ${r2(y)}q${r2(dx * 0.5 + (rnd() - 0.5) * 2)} ${r2(dy * 0.5)} ${r2(dx)} ${r2(dy)}`,
    );
  }

  // Stray straws out of the outline all round, and a ragged fringe from the belly.
  const strays = new StrokeBin();
  for (let k = 0; k < m.pts.length; k++) {
    const p = m.pts[k] as Pt;
    const q = m.pts[(k + 1) % m.pts.length] as Pt;
    const tx = q[0] - p[0];
    const ty = q[1] - p[1];
    const tl = Math.hypot(tx, ty) || 1;
    // Outward normal (points run clockwise in screen space: y down).
    const nx = ty / tl;
    const ny = -tx / tl;
    const belly = p[1] > m.cy + m.bottom * 0.2;
    const roofish = p[1] < m.eave(p[0]);
    const n = belly ? 2 : rnd() < 0.7 ? 1 : 2;
    for (let j = 0; j < n; j++) {
      if (belly) {
        // Hanging fringe: longest mid-belly.
        const mid = 1 - Math.abs(p[0] - m.cx) / (m.a * 1.1);
        const len = (6 + rnd() * 16 + mid * 18 * rnd()) * strayScale;
        const x0 = p[0] + (rnd() - 0.5) * 3;
        const y0 = p[1] - 3 * strayScale;
        const sway = (rnd() - 0.5) * len * 0.35;
        const colour = S[clamp(Math.floor(rnd() * 5), 0, S.length - 1)] as string;
        strays.add(
          colour,
          rnd() < 0.3 ? 1.1 : 0.75,
          `M${r2(x0)} ${r2(y0)}q${r2(sway * 0.3)} ${r2(len * 0.5)} ${r2(sway)} ${r2(len)}`,
        );
      } else {
        const len = (5 + rnd() * 14) * strayScale;
        const a =
          Math.atan2(ny, nx) + (rnd() - 0.5) * 1.1 + (roofish ? 0.25 * Math.sign(nx) : 0.35);
        const x0 = p[0] - nx * 3;
        const y0 = p[1] - ny * 3;
        const colour = (
          roofish ? R[Math.floor(rnd() * R.length)] : S[2 + Math.floor(rnd() * 5)]
        ) as string;
        strays.add(
          colour,
          rnd() < 0.3 ? 1.05 : 0.7,
          `M${r2(x0)} ${r2(y0)}l${r2(Math.cos(a) * len)} ${r2(Math.sin(a) * len)}`,
        );
      }
    }
  }

  // Entrance holes on the underside: dark ovals with an inner depth gradient and a light rim.
  const hole = nextId();
  defs.push(
    el(
      'radialGradient',
      { id: hole, cx: 0.5, cy: 0.62, r: 0.6 },
      el('stop', { offset: 0, 'stop-color': '#0C0806' }),
      el('stop', { offset: 0.55, 'stop-color': '#1E140C' }),
      el('stop', { offset: 1, 'stop-color': shade(S[1] as string, -0.3) }),
    ),
  );
  // Refinement 1: the entrances are in the flat-ish underside, seen from below — wide, thin
  // foreshortened ovals (about 3:1) in the lower quarter, a few half hidden by the fringe.
  const holes: string[] = [];
  const rims = new StrokeBin();
  const veil = new StrokeBin();
  const taken: { x: number; y: number; rx: number }[] = [];
  const height = m.top + m.bottom;
  /** How high the highest entrance sits above the belly (fraction of the nest's height). */
  let highest = 0;
  let tries = 0;
  while (taken.length < nHoles && tries++ < 600) {
    const x = m.cx + (rnd() * 2 - 1) * m.a * 0.8;
    const bot = m.bottomAt(x);
    const y = bot - height * (0.04 + rnd() * 0.17);
    if (!inside(m.pts, x, y) || !inside(m.pts, x, y + 2)) continue;
    const rx = Math.max(3, m.a * (0.032 + rnd() * 0.022));
    const ry = rx / (2.7 + rnd() * 0.6);
    if (taken.some((t) => Math.abs(t.x - x) < (t.rx + rx) * 1.25 && Math.abs(t.y - y) < ry * 4))
      continue;
    taken.push({ x, y, rx });
    highest = Math.max(highest, (bot - y) / height);
    holes.push(
      // Lighter straw rim, then the dark opening with its depth gradient and a shadowed far lip.
      // The near (lower) lip is lit straw; the far lip falls into the opening's shadow.
      el('path', {
        d: ellipseD(x, y + ry * 0.45, rx * 1.3, ry * 1.6),
        fill: S[4],
        opacity: 0.42,
      }),
      el('path', { d: ellipseD(x, y - ry * 0.1, rx * 1.15, ry * 1.4), fill: S[1], opacity: 0.55 }),
      el('path', { d: ellipseD(x, y, rx, ry), fill: `url(#${hole})` }),
      el('path', {
        d: `M${r2(x - rx * 0.92)} ${r2(y)}Q${r2(x)} ${r2(y - ry * 1.5)} ${r2(x + rx * 0.92)} ${r2(y)}`,
        fill: 'none',
        stroke: '#080503',
        'stroke-width': Math.max(0.6, ry * 0.45),
        opacity: 0.75,
      }),
    );
    for (let j = 0; j < 8; j++) {
      const a = rnd() * Math.PI * 2;
      const px = x + Math.cos(a) * rx * 1.3;
      const py = y + Math.sin(a) * ry * 1.7;
      const len = rx * (0.35 + rnd() * 0.5);
      rims.add(
        S[3 + Math.floor(rnd() * 3)] as string,
        0.6,
        `M${r2(px)} ${r2(py)}l${r2(Math.cos(a + Math.PI / 2) * len)} ${r2(Math.sin(a + Math.PI / 2) * len * 0.35)}`,
      );
    }
    // Some entrances half hidden behind hanging straws.
    if (rnd() < 0.55)
      for (let j = 0; j < 4 + Math.floor(rnd() * 4); j++) {
        const sx = x + (rnd() - 0.5) * rx * 2;
        const len = ry * (3 + rnd() * 5);
        veil.add(
          S[2 + Math.floor(rnd() * 4)] as string,
          rnd() < 0.4 ? 1 : 0.7,
          `M${r2(sx)} ${r2(y - ry * 2.5)}q${r2((rnd() - 0.5) * 2)} ${r2(len * 0.5)} ${r2((rnd() - 0.5) * 3)} ${r2(len)}`,
        );
      }
  }

  const holeTotal = taken.length;
  return {
    svg: g(
      {},
      ...defs,
      el('path', { d: body, fill: `url(#${vg})` }),
      g(
        { 'clip-path': `url(#${clip})` },
        g(
          { filter: `url(#${roofSoft.id})` },
          el('path', { d: roof, fill: `url(#${rg})`, opacity: 0.8 }),
        ),
        bin.svg([...S, ...R]),
        el('path', { d: body, fill: `url(#${hg})` }),
        // Deep shadow under the roof overhang (soft, just below the eave).
        g(
          { filter: `url(#${soft.id})` },
          el('path', {
            d: eaveD,
            fill: 'none',
            stroke: S[0],
            'stroke-width': Math.max(3, m.top * 0.26),
            opacity: 0.72,
            transform: `translate(0 ${r2(m.top * 0.16)})`,
          }),
        ),
        // Belly shadow.
        g(
          { filter: `url(#${softer.id})` },
          el('path', {
            d: ellipseD(m.cx + m.a * 0.1, m.cy + m.bottom * 1.05, m.a * 0.95, m.bottom * 0.42),
            fill: S[0],
            opacity: 0.7,
          }),
        ),
        ...holes,
        rims.svg([]),
        veil.svg(S),
      ),
      el('path', {
        d: body,
        fill: 'none',
        stroke: S[0],
        'stroke-width': 0.9,
        'stroke-linejoin': 'round',
        opacity: 0.55,
      }),
      strays.svg(S),
    ),
    straws: bin.count + strays.count + rims.count,
    holes: holeTotal,
    holeHeight: highest,
  };
}

let lastNest: { straws: number; holes: number; holeHeight: number } = {
  straws: 0,
  holes: 0,
  holeHeight: 0,
};

/** The nest's straw and hole counts from the last weaverNest call (detail tests). */
export function lastNestStats(): { straws: number; holes: number; holeHeight: number } {
  return lastNest;
}

/** The family nest: the lobe, then the main mass with contact shadows from limbs and crown. */
export function weaverNest(
  rnd: Rnd,
  n: NestSpec,
  look: CamelthornLook,
  _pen: Pen,
  tree?: CamelthornSpec,
): { svg: string } {
  const bumps = n.limbsOut.filter((l) => l[0][1] < n.cy).map((l) => l[0][0]);
  const main = nestMass(rnd, n.cx, n.cy, n.a, n.top, n.bottom, bumps);
  const lobe = nestMass(rnd, n.lobe.x, n.lobe.y, n.lobe.rx, n.lobe.ry * 0.9, n.lobe.ry, []);
  const lobeHoles = Math.max(2, Math.round(n.holes * 0.25));
  const pl = paintMass(rnd, lobe, look, Math.round(n.straws * 0.22), lobeHoles, 0.7);
  const pm = paintMass(rnd, main, look, n.straws, n.holes - pl.holes, 1);
  lastNest = {
    straws: pl.straws + pm.straws,
    holes: pl.holes + pm.holes,
    holeHeight: Math.max(pl.holeHeight, pm.holeHeight),
  };
  const shadow = blurFilter(Math.max(2, n.top * 0.16));
  const parts = [shadow.def];
  // The crown above darkens where the nest sits under it (and the nest's roof under the crown).
  if (tree !== undefined)
    parts.push(
      g(
        { filter: `url(#${shadow.id})` },
        el('path', {
          d: ellipseD(n.cx, n.cy - n.top * 0.85, n.a * 0.95, n.top * 0.4),
          fill: '#1A140C',
          opacity: 0.3,
        }),
      ),
    );
  parts.push(pl.svg, pm.svg);
  return { svg: g({}, ...parts) };
}

/** Limbs passing out of the nest into the crown, with soft contact shadows where they meet it. */
function nestFront(rnd: Rnd, n: NestSpec, look: CamelthornLook): string {
  const shadow = blurFilter(Math.max(1.5, n.top * 0.1));
  const bark = new StrokeBin();
  const parts: string[] = [shadow.def];
  const shadows: string[] = [];
  for (const [from, to, w] of n.limbsOut) {
    parts.push(drawLimb(rnd, bough(rnd, from, to, w, w * 0.35, 1, 0.1), look, bark));
    shadows.push(ellipseD(from[0] + w * 0.3, from[1] + w * 0.5, w * 2.2, w * 1));
  }
  return g(
    {},
    g(
      { filter: `url(#${shadow.id})` },
      el('path', { d: shadows.join(''), fill: '#140E08', opacity: 0.62 }),
    ),
    ...parts,
    bark.svg([look.furrow]),
  );
}

// --- ready-made trees ------------------------------------------------------------------------

/** A tree of `variant` with its foot at (x, foot), `k` × the mature size. */
export function camelthornSpec(
  variant: Exclude<CamelthornVariant, 'nest'>,
  x: number,
  foot: number,
  k = 1,
  lean = 0,
): CamelthornSpec {
  if (variant === 'young')
    return {
      variant,
      x,
      foot,
      crownW: 92 * k,
      crownTop: foot - 205 * k,
      crownDepth: 92 * k,
      forkY: foot - 78 * k,
      lean: lean * k,
      trunkW: 15 * k,
      dab: 2.2 * Math.sqrt(k),
      density: 0.36 / k,
    };
  return {
    variant,
    x,
    foot,
    crownW: (variant === 'old' ? 225 : 250) * k,
    crownTop: foot - 330 * k,
    crownDepth: 112 * k,
    forkY: foot - 110 * k,
    lean: lean * k,
    trunkW: 48 * k,
    dab: 2.6 * Math.sqrt(k),
    density: 0.3 / k,
  };
}

/** The Kalahari weaver tree (prop frame: foot at y 260, nest part ellipse 150 × 46 at (0, −78)). */
export function nestTreeSpec(): CamelthornSpec {
  return {
    variant: 'nest',
    x: 0,
    foot: 260,
    crownW: 240,
    crownTop: -246,
    crownDepth: 116,
    forkY: 150,
    lean: 10,
    trunkW: 62,
    nest: {
      cx: 0,
      cy: -84,
      a: 142,
      top: 70,
      bottom: 44,
      lobe: { x: 60, y: -30, rx: 58, ry: 30 },
      limbsOut: [
        // Into the crown from the roof, and out of both sides.
        [[-62, -136], [-104, -214], 11],
        [[30, -144], [62, -226], 11],
        [[132, -98], [218, -150], 9],
        [[-134, -92], [-212, -146], 8],
        [[96, -128], [150, -196], 7],
      ],
      holes: 16,
      straws: 2300,
    },
  };
}

/**
 * The dead camelthorn (Kalahari prop frame: foot at y 230; the secret dry branch stub at
 * (−90, −60)): bleached grey wood, the same furrowed zig-zag limbs, no leaves, a few pods
 * left on the sand.
 */
export function deadCamelthorn(rnd: Rnd, look: CamelthornLook, pen: Pen): string {
  const s: CamelthornSpec = {
    variant: 'old',
    x: 0,
    foot: 230,
    crownW: 175,
    crownTop: -262,
    crownDepth: 120,
    forkY: -10,
    lean: -10,
    trunkW: 40,
    ground: false,
  };
  const sk = skeleton(rnd, { ...s, variant: 'mature' });
  const limbs = sk.limbs.map((l) => ({ ...l, dead: true }));
  const bark = new StrokeBin();
  const twigBin = new StrokeBin();
  for (const t of [...sk.tips, ...sk.deadTips]) twigs(rnd, t, s, look.dead.fill, twigBin, 2, 1.1);
  // The snapped dry branch: a thick stub out to (−90, −60) ending in a pale broken face.
  const stubPts = zigzag(rnd, [-4, 4], [-96, -60], 0, 0);
  const stub: Limb = { pts: stubPts, w: taper(stubPts, 22, 17), dead: true };
  const blur = blurFilter(2.5);
  const parts = [
    blur.def,
    g(
      { filter: `url(#${blur.id})` },
      el('path', { d: ellipseD(14, s.foot + 3, 120, 10), fill: '#2A1A14', opacity: 0.3 }),
    ),
    twigBin.svg([]),
    limbSilhouette([...limbs, stub], look),
    ...[...limbs, stub]
      .sort((a, b) => (b.w[0] ?? 0) - (a.w[0] ?? 0))
      .map((l) => drawLimb(rnd, l, look, bark, false)),
    bark.svg([]),
    el('path', {
      d: ellipseD(-98, -61, 7, 9.5),
      fill: look.dead.lit,
      stroke: look.ink,
      'stroke-width': 1,
    }),
    el('path', { d: ellipseD(-98, -61, 3.5, 5), fill: shade(look.dead.fill, -0.15) }),
  ];
  for (let k = 0; k < 5; k++)
    parts.push(
      groundPod(rnd, (rnd() - 0.5) * 220, s.foot + rnd() * 6, 11 + rnd() * 4, look, false),
    );
  for (const x of [-110, -60, 70, 120])
    parts.push(
      tuft(
        rnd,
        x + (rnd() - 0.5) * 20,
        s.foot + 6,
        26 + rnd() * 14,
        tone(look.grassPale, 0.25, 0.25),
        {
          ink: look.ink,
          w: Math.max(0.6, pen.w * 0.4),
        },
        9,
      ),
    );
  return g({}, ...parts);
}
