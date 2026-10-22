// Grass and shrubs for the interim landscapes (D-031 look review): seven tuft shapes in mixed
// colours placed in irregular seeded clusters with gaps (never on a grid), with stones, twigs and
// dry stalks mixed in; low, twiggy, broken-outlined shrubs (karoo bossies, mopane scrub) in
// several shapes and sizes. One shadow + one highlight each, ink at the plane's weight. Every
// choice comes from the caller's seeded PRNG, so the art is the same on every run.
import { el, ellipseD, g, r2 } from './svg';
import { flat, mix, nextId, shade, stone, type Pen, type Rnd, type Tone } from './scenery';

/** The tuft shapes: how blades fan, lean, curl, and whether seed heads stand out. */
export const TUFT_KINDS = [
  'fan', // a spreading fan of curved blades
  'upright', // stiff, near-vertical blades
  'clump', // short, dense, rounded
  'wispy', // few long thin blades that flop over
  'windswept', // every blade leans one way
  'seeding', // a clump with tall seed stalks
  'sparse', // three or four ragged blades
] as const;
export type TuftKind = (typeof TUFT_KINDS)[number];

interface KindSpec {
  readonly blades: readonly [number, number];
  readonly spread: number;
  readonly lean: number;
  readonly curl: number;
  readonly width: number;
  readonly seeds: number;
}
const SPEC: Readonly<Record<TuftKind, KindSpec>> = {
  fan: { blades: [7, 10], spread: 1.0, lean: 0.75, curl: 0.25, width: 0.08, seeds: 0 },
  upright: { blades: [6, 9], spread: 0.45, lean: 0.25, curl: 0.05, width: 0.07, seeds: 0 },
  clump: { blades: [9, 13], spread: 0.8, lean: 0.55, curl: 0.15, width: 0.11, seeds: 0 },
  wispy: { blades: [4, 6], spread: 0.7, lean: 0.9, curl: 0.55, width: 0.05, seeds: 0 },
  windswept: { blades: [6, 9], spread: 0.6, lean: 0.35, curl: 0.3, width: 0.07, seeds: 0 },
  seeding: { blades: [6, 8], spread: 0.7, lean: 0.5, curl: 0.15, width: 0.08, seeds: 3 },
  sparse: { blades: [3, 4], spread: 0.6, lean: 0.6, curl: 0.3, width: 0.08, seeds: 1 },
};

/**
 * One tuft rising from (x, y), height h. Ink goes round the silhouette only (a wide ink stroke
 * under the fills), so thin blades keep their colour; back blades take the shadow tone.
 */
export function tuftOf(
  kind: TuftKind,
  rnd: Rnd,
  x: number,
  y: number,
  h: number,
  t: Tone,
  pen: Pen,
  seedHead = '#F1E6C8',
): string {
  const s = SPEC[kind];
  const n = s.blades[0] + Math.floor(rnd() * (s.blades[1] - s.blades[0] + 1));
  const wind = kind === 'windswept' ? (rnd() < 0.5 ? -1 : 1) * h * 0.55 : 0;
  const back: string[] = [];
  const front: string[] = [];
  for (let k = 0; k < n; k++) {
    const f = n === 1 ? 0 : k / (n - 1) - 0.5 + (rnd() - 0.5) * 0.15;
    const bx = x + f * h * 0.5 * s.spread;
    const lean = f * h * s.lean + wind + (rnd() - 0.5) * h * 0.25;
    const hh = h * (0.55 + rnd() * 0.45) * (1 - Math.abs(f) * 0.4);
    const w = Math.max(1.6, h * s.width * 0.75 * (0.8 + rnd() * 0.4));
    const curl = (rnd() - 0.5) * h * s.curl;
    const tipX = bx + lean + curl;
    const tipY = y - hh + Math.abs(curl) * 0.6;
    const d = `M${r2(bx - w)} ${r2(y + 2)}Q${r2(bx + lean * 0.3 - w * 0.4)} ${r2(y - hh * 0.6)} ${r2(tipX)} ${r2(tipY)}Q${r2(bx + lean * 0.35 + w * 0.6)} ${r2(y - hh * 0.55)} ${r2(bx + w)} ${r2(y + 2)}Z`;
    (rnd() < 0.45 ? back : front).push(d);
  }
  const stalks: string[] = [];
  const heads: string[] = [];
  for (let k = 0; k < s.seeds; k++) {
    if (kind === 'sparse' && rnd() < 0.5) continue;
    const sx = x + (rnd() - 0.5) * h * 0.3;
    const sh = h * (1.15 + rnd() * 0.45);
    const tx = sx + (rnd() - 0.5) * h * 0.35;
    stalks.push(
      `M${r2(sx)} ${r2(y)}Q${r2(sx + (tx - sx) * 0.3)} ${r2(y - sh * 0.6)} ${r2(tx)} ${r2(y - sh)}`,
    );
    heads.push(ellipseD(tx, y - sh + h * 0.07, Math.max(2, h * 0.035), Math.max(4, h * 0.1)));
  }
  const all = back.join('') + front.join('');
  const stalkD = stalks.join('');
  // Blades grow out of the ground: nothing is drawn below the base line (no inked "cup").
  const clip = nextId();
  return g(
    {},
    el(
      'clipPath',
      { id: clip },
      el('rect', { x: x - h * 3, y: y - h * 3, width: h * 6, height: h * 3 + 1 }),
    ),
    flat(ellipseD(x, y, h * 0.3 * s.spread + 4, Math.max(2, h * 0.05)), shade(t.dark, -0.25), {
      opacity: 0.4,
    }),
    g(
      { 'clip-path': `url(#${clip})` },
      stalkD === ''
        ? ''
        : el('path', {
            d: stalkD,
            fill: 'none',
            stroke: pen.ink,
            'stroke-width': Math.max(1.5, pen.w * 0.7) + 2,
            'stroke-linecap': 'round',
          }),
      stalkD === ''
        ? ''
        : el('path', {
            d: stalkD,
            fill: 'none',
            stroke: t.dark,
            'stroke-width': Math.max(1.2, pen.w * 0.45),
            'stroke-linecap': 'round',
          }),
      heads.length === 0
        ? ''
        : el('path', {
            d: heads.join(''),
            fill: seedHead,
            stroke: pen.ink,
            'stroke-width': Math.max(1, pen.w * 0.4),
          }),
      el('path', {
        d: all,
        fill: pen.ink,
        stroke: pen.ink,
        'stroke-width': pen.w * 1.1,
        'stroke-linejoin': 'round',
      }),
      back.length === 0 ? '' : el('path', { d: back.join(''), fill: t.dark }),
      front.length === 0 ? '' : el('path', { d: front.join(''), fill: t.fill }),
      front.length === 0
        ? ''
        : el('path', {
            d: front.join(''),
            fill: 'none',
            stroke: pen.ink,
            'stroke-width': Math.max(0.8, pen.w * 0.3),
            'stroke-linejoin': 'round',
          }),
      // A few sunlit blade edges.
      front.length === 0
        ? ''
        : el('path', {
            d: front.slice(0, 2).join(''),
            fill: t.light,
            transform: `translate(${r2(-h * 0.01)} 0)`,
            opacity: 0.55,
          }),
    ),
  );
}

/** A small forked dry twig lying on the ground. */
export function twig(
  rnd: Rnd,
  x: number,
  y: number,
  len: number,
  colour: string,
  pen: Pen,
): string {
  const a = (rnd() - 0.5) * 0.5;
  const ex = x + Math.cos(a) * len;
  const ey = y + Math.sin(a) * len * 0.3;
  const fx = x + (ex - x) * 0.55;
  const fy = y + (ey - y) * 0.55;
  const d = `M${r2(x)} ${r2(y)}L${r2(ex)} ${r2(ey)}M${r2(fx)} ${r2(fy)}l${r2(len * 0.25)} ${r2(-len * 0.18)}`;
  const w = Math.max(1.5, len * 0.06);
  return g(
    {},
    el('path', {
      d,
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': w + Math.max(1.5, pen.w * 0.6),
      'stroke-linecap': 'round',
    }),
    el('path', { d, fill: 'none', stroke: colour, 'stroke-width': w, 'stroke-linecap': 'round' }),
  );
}

/** A lone dry stalk with a small seed head. */
export function stalk(
  rnd: Rnd,
  x: number,
  y: number,
  h: number,
  colour: string,
  head: string,
  pen: Pen,
): string {
  const tx = x + (rnd() - 0.5) * h * 0.3;
  const d = `M${r2(x)} ${r2(y)}Q${r2(x)} ${r2(y - h * 0.5)} ${r2(tx)} ${r2(y - h)}`;
  return g(
    {},
    el('path', {
      d,
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': 2 + Math.max(1, pen.w * 0.5),
      'stroke-linecap': 'round',
    }),
    el('path', { d, fill: 'none', stroke: colour, 'stroke-width': 2, 'stroke-linecap': 'round' }),
    el('path', {
      d: ellipseD(tx, y - h + 4, 2.5, 6),
      fill: head,
      stroke: pen.ink,
      'stroke-width': 1.2,
    }),
  );
}

/** A colour choice with a weight (picked by the seeded PRNG). */
export interface Weighted<T> {
  readonly v: T;
  readonly w: number;
}
export function pick<T>(rnd: Rnd, items: readonly Weighted<T>[]): T {
  const total = items.reduce((s, i) => s + i.w, 0);
  let r = rnd() * total;
  for (const i of items) {
    r -= i.w;
    if (r <= 0) return i.v;
  }
  const last = items.at(-1);
  if (last === undefined) throw new Error('pick from nothing');
  return last.v;
}

export interface FieldOpts {
  readonly x0: number;
  readonly x1: number;
  /** Band of tuft bases (design y); size grows toward y1 by `grow`. */
  readonly y0: number;
  readonly y1: number;
  /** Tuft height at y0 (min, max); multiplied by 1 + grow · depth (0 at y0, 1 at y1). */
  readonly h: readonly [number, number];
  readonly grow: number;
  /** Mean gap between cluster centres (px); clusters hold 1–5 tufts. */
  readonly gap: number;
  readonly grass: readonly Weighted<Tone>[];
  readonly kinds?: readonly Weighted<TuftKind>[];
  readonly pen: Pen;
  /** Mixed in per cluster (probabilities). */
  readonly stones?: { readonly p: number; readonly tone: Tone };
  readonly twigs?: { readonly p: number; readonly colour: string };
  readonly stalks?: { readonly p: number; readonly colour: string; readonly head: string };
  /** x ranges kept clear (e.g. a track), as [x, halfWidth] at any y. */
  readonly avoid?: (x: number, y: number) => boolean;
}

const DEFAULT_KINDS: readonly Weighted<TuftKind>[] = [
  { v: 'fan', w: 4 },
  { v: 'upright', w: 2 },
  { v: 'clump', w: 3 },
  { v: 'wispy', w: 2 },
  { v: 'windswept', w: 2 },
  { v: 'seeding', w: 1.5 },
  { v: 'sparse', w: 1.5 },
];

/**
 * Grass in irregular clusters with gaps: cluster centres walk along x with random gaps (some
 * long), each cluster spreads 1–5 tufts of mixed shape, colour and size, sometimes with a stone,
 * a twig or a dry stalk. Returns items with their base y so callers can depth-sort them with
 * other things in the layer.
 */
export function grassField(rnd: Rnd, o: FieldOpts): { y: number; svg: string }[] {
  const out: { y: number; svg: string }[] = [];
  const kinds = o.kinds ?? DEFAULT_KINDS;
  let x = o.x0 + rnd() * o.gap;
  while (x < o.x1) {
    const cy = o.y0 + rnd() * (o.y1 - o.y0);
    const depth = (cy - o.y0) / Math.max(1, o.y1 - o.y0);
    const k = 1 + o.grow * depth;
    const members = 1 + Math.floor(Math.pow(rnd(), 1.6) * 5);
    const spread = (18 + rnd() * 50) * k;
    for (let m = 0; m < members; m++) {
      const tx = x + (rnd() - 0.5) * spread * 2;
      const ty = Math.min(o.y1, Math.max(o.y0, cy + (rnd() - 0.5) * 14 * k));
      if (o.avoid?.(tx, ty) === true) continue;
      const h = (o.h[0] + rnd() * (o.h[1] - o.h[0])) * k * (m === 0 ? 1 : 0.6 + rnd() * 0.5);
      out.push({ y: ty, svg: tuftOf(pick(rnd, kinds), rnd, tx, ty, h, pick(rnd, o.grass), o.pen) });
    }
    if (o.stones !== undefined && rnd() < o.stones.p) {
      const sx = x + (rnd() - 0.5) * spread * 2.4;
      const sy = Math.min(o.y1, cy + 4 * k);
      if (o.avoid?.(sx, sy) !== true)
        out.push({
          y: sy + 1,
          svg: stone(rnd, sx, sy, (4 + rnd() * 8) * k, o.stones.tone, {
            ink: o.pen.ink,
            w: Math.max(1.5, o.pen.w * 0.7),
          }),
        });
    }
    if (o.twigs !== undefined && rnd() < o.twigs.p) {
      const sx = x + (rnd() - 0.5) * spread * 2.4;
      out.push({
        y: cy + 2,
        svg: twig(rnd, sx, cy + 2, (10 + rnd() * 14) * k, o.twigs.colour, {
          ink: o.pen.ink,
          w: Math.max(1, o.pen.w * 0.4),
        }),
      });
    }
    if (o.stalks !== undefined && rnd() < o.stalks.p) {
      const sx = x + (rnd() - 0.5) * spread * 2;
      out.push({
        y: cy,
        svg: stalk(
          rnd,
          sx,
          cy,
          (o.h[1] * 1.3 + rnd() * o.h[1]) * k,
          o.stalks.colour,
          o.stalks.head,
          { ink: o.pen.ink, w: Math.max(1, o.pen.w * 0.5) },
        ),
      });
    }
    // Irregular gaps: mostly around the mean, sometimes a long empty stretch.
    const r = rnd();
    x += o.gap * (r < 0.15 ? 2.2 + rnd() * 1.5 : 0.35 + rnd() * 1.1) * (0.8 + depth * 0.4);
  }
  return out;
}

export type ShrubShape = 'dome' | 'wide' | 'tall' | 'sparse';

/**
 * A low, twiggy shrub (karoo bossie / mopane scrub): a dome of small leaf lobes with gaps in its
 * ink outline, bare twigs poking out at the top and edges and stems at the base, one shadow
 * (lower right) and one highlight (upper left), and a few lobes in a second colour.
 */
export function shrub(
  rnd: Rnd,
  x: number,
  y: number,
  s: number,
  main: Tone,
  second: Tone,
  twigColour: string,
  pen: Pen,
  shape: ShrubShape = 'dome',
): string {
  const wide = shape === 'wide' ? 1.45 : shape === 'tall' ? 0.75 : 1;
  const tall = shape === 'tall' ? 1.35 : shape === 'wide' ? 0.7 : 1;
  const n = shape === 'sparse' ? 16 : 30 + Math.floor(rnd() * 12);
  const lobes: [number, number, number, boolean][] = [];
  for (let k = 0; k < n; k++) {
    const a = Math.PI + rnd() * Math.PI;
    const d = Math.sqrt(rnd());
    const lx = x + Math.cos(a) * s * wide * d;
    const ly = y - s * 0.12 + Math.sin(a) * s * 0.85 * tall * d;
    const r = s * (shape === 'sparse' ? 0.13 : 0.16) * (0.7 + rnd() * 0.6);
    lobes.push([lx, ly, r, rnd() < 0.3]);
  }
  if (shape !== 'sparse') lobes.push([x, y - s * 0.28 * tall, s * 0.5 * Math.min(wide, 1), false]);
  const body = lobes.map(([lx, ly, r]) => ellipseD(lx, ly, r, r * 0.88)).join('');
  const odd = lobes
    .filter((l) => l[3])
    .map(([lx, ly, r]) => ellipseD(lx, ly, r * 0.9, r * 0.8))
    .join('');
  // Twigs: through the crown and out of the edges, stems at the base.
  const twigs: string[] = [];
  const tn = shape === 'sparse' ? 7 : 4 + Math.floor(rnd() * 3);
  for (let k = 0; k < tn; k++) {
    const a = Math.PI * (1.05 + rnd() * 0.9);
    const r0 = s * 0.4;
    const r1 = s * (1.05 + rnd() * 0.3);
    const ax = x + Math.cos(a) * r0 * wide;
    const ay = y - s * 0.1 + Math.sin(a) * r0 * tall;
    const bx = x + Math.cos(a) * r1 * wide;
    const by = y - s * 0.1 + Math.sin(a) * r1 * tall;
    twigs.push(
      `M${r2(ax)} ${r2(ay)}L${r2(bx)} ${r2(by)}l${r2((rnd() - 0.5) * s * 0.3)} ${r2(-s * 0.15)}`,
    );
  }
  for (let k = 0; k < 3; k++) {
    const bx = x + (k - 1) * s * 0.3 * wide;
    twigs.push(
      `M${r2(bx)} ${r2(y + s * 0.05)}L${r2(bx + (rnd() - 0.5) * s * 0.4)} ${r2(y - s * 0.35)}`,
    );
  }
  const twigD = twigs.join('');
  const tw = Math.max(1, s * 0.05);
  const id = nextId();
  const dash = `${r2(s * 0.45 + 5)} ${r2(Math.max(1.5, s * 0.07))}`;
  // The second colour only shifts the hue a little (mixed foliage, not patches).
  const alt = mix(main.fill, second.fill, 0.35);
  const specks: string[] = [];
  for (let k = 0; k < Math.round(s / 3); k++) {
    const a = Math.PI + rnd() * Math.PI;
    const d = Math.sqrt(rnd()) * 0.9;
    specks.push(
      ellipseD(
        x + Math.cos(a) * s * wide * d,
        y - s * 0.15 + Math.sin(a) * s * 0.75 * tall * d,
        Math.max(0.8, s * 0.035),
        Math.max(0.8, s * 0.035),
      ),
    );
  }
  return g(
    {},
    flat(ellipseD(x + s * 0.2, y + s * 0.04, s * wide * 1.05, s * 0.13), shade(main.dark, -0.2), {
      opacity: 0.45,
    }),
    el('path', {
      d: twigD,
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': tw + pen.w * 0.8,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: twigD,
      fill: 'none',
      stroke: twigColour,
      'stroke-width': tw,
      'stroke-linecap': 'round',
    }),
    // Broken outline: a dashed ink stroke under the fill shows as gaps round the silhouette.
    el('path', {
      d: body,
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': pen.w * 1.6,
      'stroke-dasharray': dash,
      'stroke-linejoin': 'round',
    }),
    el('clipPath', { id }, el('path', { d: body })),
    flat(body, main.fill),
    g(
      { 'clip-path': `url(#${id})` },
      odd === '' ? '' : flat(odd, alt),
      flat(
        ellipseD(x + s * 0.45 * wide, y + s * 0.05, s * 0.85 * wide, s * 0.5 * tall),
        main.dark,
        { opacity: 0.85 },
      ),
      flat(
        lobes
          .filter(([lx, ly]) => lx < x && ly < y - s * 0.3 * tall)
          .slice(0, 6)
          .map(([lx, ly, r]) => ellipseD(lx - r * 0.2, ly - r * 0.35, r * 0.5, r * 0.28))
          .join('') || ellipseD(x - s * 0.3, y - s * 0.5, s * 0.2, s * 0.1),
        main.light,
      ),
      flat(specks.join(''), shade(main.dark, -0.15)),
    ),
  );
}

/** Shrub shape picked by the PRNG. */
export function shrubShape(rnd: Rnd): ShrubShape {
  return pick<ShrubShape>(rnd, [
    { v: 'dome', w: 4 },
    { v: 'wide', w: 3 },
    { v: 'tall', w: 1.5 },
    { v: 'sparse', w: 1.5 },
  ]);
}
