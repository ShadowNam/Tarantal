// v1.7 (D-044): interim art for the desert maps' meerkat colonies — one sheet (layout in
// src/game/assets/desertAssets.ts) drawn at 2× in the D-035 semi-realistic style. Second look
// round (the product owner, 25 Oct: "a little bit more hairy … a tick more furry, and a little
// bit nicer faces"):
// - every figure is drawn as fur: no smooth ink line, but a broken edge of short tufts that lie
//   the way the fur grows, and curved strokes in three tones that follow each part's form;
// - the parts of one body (torso, haunch, neck, head, tail base) are drawn in passes (all the
//   edges, then all the fills, then the fur), so they blend with no outline between them;
// - arms and front legs are drawn over the body with their own edge, with small dark claws;
// - faces: a teardrop mask sloping down to the nose, a small almond eye with a white
//   catch-light, a pale brow, a short tapering muzzle with a small nose and a mouth line, low
//   crescent ears and full, fluffy cheeks;
// - the pup is rounder and fluffier, with a bigger head.
// Coordinates: design px at the near plane, the feet (or a hole's rim) at (0, 0), facing right,
// y down.
import {
  CELL_H,
  CELL_W,
  MOUND_FRAMES,
  SHEET_H,
  SHEET_MASTER,
  SHEET_W,
  sheetFrames,
  type MeerkatFrame,
} from '../../src/game/assets/desertAssets';
import type { Rgba } from '../assets/image';
import { renderSvg } from './raster';
import { el, ellipseD, g, polyD, prng, r2, smoothD, svgDoc } from './svg';

type P = readonly [number, number];

const C = {
  furLit: '#E6C493',
  fur: '#BC966A',
  furMid: '#A0805C',
  furShade: '#735C45',
  furDark: '#5A4635',
  edge: '#4A3628',
  band: '#4C3A2B',
  cream: '#F5E8CE',
  creamShade: '#DCC6A0',
  brow: '#F7EEDB',
  mask: '#231912',
  ear: '#2E2119',
  nose: '#1A130E',
  eye: '#2B1A0E',
  glint: '#FFFFFF',
  tip: '#130E0B',
  ink: '#3A2A1D',
  mouth: '#4A2219',
  claw: '#1C1410',
  sand: '#CF8A57',
  sandLit: '#EDB988',
  sandFresh: '#F2C99C',
  sandShade: '#9E5E37',
  sandDeep: '#7A4426',
  hole: '#2A140B',
  holeDeep: '#0D0604',
  pebble: '#8C6A4F',
} as const;

const INK = 1.1;

const DEFS = [
  el(
    'linearGradient',
    { id: 'fur', x1: 0.15, y1: 0, x2: 0.85, y2: 1 },
    el('stop', { offset: 0, 'stop-color': C.furLit }),
    el('stop', { offset: 0.45, 'stop-color': C.fur }),
    el('stop', { offset: 1, 'stop-color': C.furMid }),
  ),
  el(
    'linearGradient',
    { id: 'cream', x1: 0, y1: 0, x2: 0.4, y2: 1 },
    el('stop', { offset: 0, 'stop-color': C.cream }),
    el('stop', { offset: 1, 'stop-color': C.creamShade }),
  ),
  el(
    'radialGradient',
    { id: 'lit', cx: 0.22, cy: 0.18, r: 0.65 },
    el('stop', { offset: 0, 'stop-color': '#FFF4DC', 'stop-opacity': 0.5 }),
    el('stop', { offset: 1, 'stop-color': '#FFF4DC', 'stop-opacity': 0 }),
  ),
  el(
    'linearGradient',
    { id: 'shade', x1: 0.35, y1: 0.25, x2: 1, y2: 0.95 },
    el('stop', { offset: 0, 'stop-color': C.furShade, 'stop-opacity': 0 }),
    el('stop', { offset: 1, 'stop-color': C.furShade, 'stop-opacity': 0.7 }),
  ),
  el(
    'filter',
    { id: 'soft', x: -0.2, y: -0.2, width: 1.4, height: 1.4 },
    el('feGaussianBlur', { stdDeviation: 0.9 }),
  ),
  el(
    'linearGradient',
    { id: 'sand', x1: 0.1, y1: 0, x2: 0.5, y2: 1 },
    el('stop', { offset: 0, 'stop-color': C.sandLit }),
    el('stop', { offset: 0.5, 'stop-color': C.sand }),
    el('stop', { offset: 1, 'stop-color': C.sandShade }),
  ),
  el(
    'radialGradient',
    { id: 'hole', cx: 0.5, cy: 0.28, r: 0.62 },
    el('stop', { offset: 0, 'stop-color': C.holeDeep }),
    el('stop', { offset: 0.65, 'stop-color': C.hole }),
    el('stop', { offset: 1, 'stop-color': C.sandDeep }),
  ),
  el(
    'radialGradient',
    { id: 'shadow', cx: 0.5, cy: 0.5, r: 0.5 },
    el('stop', { offset: 0, 'stop-color': '#3A2216', 'stop-opacity': 0.38 }),
    el('stop', { offset: 1, 'stop-color': '#3A2216', 'stop-opacity': 0 }),
  ),
].join('');

let seq = 0;
const uid = (p: string): string => `${p}${seq++}`;

const fill = (d: string, f: string, extra: Record<string, string | number> = {}): string =>
  el('path', { d, fill: f, ...extra });
const inked = (d: string, f: string, w = INK): string =>
  el('path', { d, fill: f, stroke: C.ink, 'stroke-width': w, 'stroke-linejoin': 'round' });
const line = (d: string, colour: string, w: number, op = 1): string =>
  el('path', {
    d,
    fill: 'none',
    stroke: colour,
    'stroke-width': w,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'stroke-opacity': op,
  });
const seg = (a: P, b: P): string => `M${r2(a[0])} ${r2(a[1])}L${r2(b[0])} ${r2(b[1])}`;
const quad = (a: P, c: P, b: P): string =>
  `M${r2(a[0])} ${r2(a[1])}Q${r2(c[0])} ${r2(c[1])} ${r2(b[0])} ${r2(b[1])}`;

// --- vector maths ---------------------------------------------------------------------------------
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const norm = (a: P): P => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};
const rot = (p: P, deg: number): P => {
  const a = (deg * Math.PI) / 180;
  return [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
};
/** Quadratic Bézier point and tangent. */
function bez(a: P, c: P, b: P, t: number): { p: P; d: P } {
  const p = lerp(lerp(a, c, t), lerp(c, b, t), t);
  const d = norm(add(mul(sub(c, a), 2 * (1 - t)), mul(sub(b, c), 2 * t)));
  return { p, d };
}
/** The control point that makes a quadratic through `a` and `b` pass through `m` at t = ½. */
const through = (a: P, m: P, b: P): P => sub(mul(m, 2), mul(add(a, b), 0.5));
/** Local points (facing right) placed at `at`, turned `deg`, scaled, mirrored when dir is −1. */
const place = (pts: readonly P[], at: P, deg: number, k: number, dir: 1 | -1): P[] =>
  pts.map((q) => add(at, rot([q[0] * k * dir, q[1] * k], deg * dir)));

/** Dense points along a closed Catmull-Rom curve through `pts`. */
function sample(pts: readonly P[], per = 5): P[] {
  const n = pts.length;
  const out: P[] = [];
  const at = (i: number): P => pts[((i % n) + n) % n] ?? [0, 0];
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 *
        (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

// --- fur ----------------------------------------------------------------------------------------

/** A body part drawn as fur. */
interface Part {
  /** Closed outline (control points of a smooth curve). */
  readonly pts: readonly P[];
  /** Tuft length at a point of the edge (0 = a smooth edge there, e.g. the muzzle). */
  readonly amp: number | ((p: P) => number);
  /** Which way the fur lies (tufts lean this way). */
  readonly flow: P;
  /** Fur strokes: from `a` (the root end) toward `b`, across `half` px either side. */
  readonly axis?: { a: P; b: P; half: number; n: number };
  readonly base?: string;
  /** Drawn inside the part, under the fur strokes (cream belly, mask …). */
  readonly under?: readonly string[];
  /** Drawn inside the part, over the fur strokes (bands). */
  readonly over?: readonly string[];
  readonly seed: number;
}

/** The part's edge as a broken line of short tufts leaning with the fur. */
function tuftD(part: Part): string {
  const rnd = prng(part.seed + 911);
  const pts = sample(part.pts, 5);
  // Outward normals: the outline's winding decides which side is out.
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] ?? [0, 0];
    const b = pts[(i + 1) % pts.length] ?? [0, 0];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const out = area > 0 ? 1 : -1;
  const flow = norm(part.flow);
  const poly: P[] = [];
  pts.forEach((q, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length] ?? q;
    const next = pts[(i + 1) % pts.length] ?? q;
    const t = norm(sub(next, prev));
    const n: P = [t[1] * out, -t[0] * out];
    const amp = typeof part.amp === 'number' ? part.amp : part.amp(q);
    poly.push(q);
    if (amp > 0.05 && i % 3 === 0) {
      const k = amp * (0.6 + rnd() * 0.7);
      const tip = add(add(q, mul(n, k)), mul(flow, k * 0.9));
      // A tuft: out to its tip and back a little further along the edge.
      poly.push(tip, lerp(q, next, 0.55));
    }
  });
  return polyD(poly, true);
}

/** Curved fur strokes in three tones, following the part's axis and fanning out to its sides. */
function strokes(part: Part): string {
  const ax = part.axis;
  if (ax === undefined) return '';
  const rnd = prng(part.seed + 37);
  const dir = norm(sub(ax.b, ax.a));
  const side: P = [-dir[1], dir[0]];
  const tones: Record<'dark' | 'mid' | 'lit', string[]> = { dark: [], mid: [], lit: [] };
  for (let i = 0; i < ax.n; i++) {
    const s = rnd();
    const u = rnd() * 2 - 1;
    const at = add(lerp(ax.a, ax.b, s), mul(side, u * ax.half));
    const d = rot(dir, u * 32 + (rnd() - 0.5) * 16);
    const len = 2.6 + rnd() * 2.8;
    const end = add(at, mul(d, len));
    const bend = add(lerp(at, end, 0.5), mul([-d[1], d[0]], (rnd() - 0.5) * 1.6));
    const tone = u > 0.35 || rnd() < 0.25 ? 'dark' : u < -0.4 && rnd() < 0.7 ? 'lit' : 'mid';
    tones[tone].push(quad(at, bend, end));
  }
  return [
    line(tones.mid.join(''), C.furMid, 0.6, 0.8),
    line(tones.dark.join(''), C.furDark, 0.55, 0.75),
    line(tones.lit.join(''), C.furLit, 0.6, 0.85),
  ].join('');
}

/** One layer of a figure: all the parts' tufted edges, then their fills and fur, so parts of
 *  the same layer blend into one another with no outline between them. */
function layer(parts: readonly Part[]): string {
  const edges = parts.map((p) => {
    const d = tuftD(p);
    return fill(d, C.edge, { stroke: C.edge, 'stroke-width': 1.3, 'stroke-linejoin': 'round' });
  });
  const fills = parts.map((p) => {
    const d = tuftD(p);
    const id = uid('c');
    return g(
      {},
      el('clipPath', { id }, fill(d, '#000')),
      fill(d, p.base ?? 'url(#fur)'),
      g(
        { 'clip-path': `url(#${id})` },
        fill(d, 'url(#shade)'),
        fill(d, 'url(#lit)'),
        ...(p.under ?? []),
        strokes(p),
        ...(p.over ?? []),
      ),
    );
  });
  return g({}, ...edges, ...fills);
}

/** A figure: its layers back to front (the body, then arms and front legs over it). */
const figure = (...layers: (readonly Part[])[]): string => g({}, ...layers.map(layer));

/** An oval part (a haunch, a cheek), turned `deg`. */
function oval(
  at: P,
  rx: number,
  ry: number,
  deg: number,
  seed: number,
  amp = 1.6,
  flow: P = [0, 1],
): Part {
  const pts: P[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    pts.push(add(at, rot([Math.cos(a) * rx, Math.sin(a) * ry], deg)));
  }
  return {
    pts,
    amp,
    flow,
    seed,
    axis: {
      a: add(at, rot([0, -ry * 0.8], deg)),
      b: add(at, rot([0, ry * 0.8], deg)),
      half: rx * 0.8,
      n: Math.round(rx * ry * 0.22),
    },
  };
}

/** A limb from `a` through the joint `m` to `b` (widths at a and b): a part, with claws. */
function limbPart(a: P, m: P, b: P, wa: number, wb: number, seed: number, colour?: string): Part {
  const c = through(a, m, b);
  const left: P[] = [];
  const right: P[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const { p, d } = bez(a, c, b, t);
    const w = (wa + (wb - wa) * t) / 2;
    const n: P = [-d[1], d[0]];
    left.push(add(p, mul(n, w)));
    right.push(add(p, mul(n, -w)));
  }
  const dir = norm(sub(b, a));
  return {
    pts: [...left, ...right.reverse()],
    amp: 0.9,
    flow: dir,
    seed,
    axis: { a, b, half: (wa + wb) / 4, n: 5 },
    ...(colour === undefined ? {} : { base: colour }),
  };
}

/** Small dark claws at a hand or foot, pointing `deg`. */
function claws(at: P, deg: number, k = 1): string {
  const parts: string[] = [];
  for (const o of [-1.4, 0, 1.4]) {
    const base = add(at, rot([0, o * k], deg));
    parts.push(seg(base, add(base, rot([2.2 * k, 0.3 * o * k], deg))));
  }
  return line(parts.join(''), C.claw, 0.9);
}

/** The tail: a thin tapering part, fluffy at the base, with a black tip. */
function tailPart(a: P, c: P, b: P, w: number, seed: number): { part: Part; tip: string } {
  const left: P[] = [];
  const right: P[] = [];
  const tipL: P[] = [];
  const tipR: P[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const { p, d } = bez(a, c, b, t);
    const half = (w * (1 - t * 0.82)) / 2;
    const n: P = [-d[1], d[0]];
    left.push(add(p, mul(n, half)));
    right.push(add(p, mul(n, -half)));
    if (t >= 0.68) {
      tipL.push(add(p, mul(n, half)));
      tipR.push(add(p, mul(n, -half)));
    }
  }
  return {
    part: {
      pts: [...left, ...right.reverse()],
      // Fluffy at the base, smooth toward the tip.
      amp: (q) => (Math.hypot(q[0] - a[0], q[1] - a[1]) < w * 3 ? 1.2 : 0),
      flow: norm(sub(b, a)),
      seed,
      axis: { a, b: bez(a, c, b, 0.6).p, half: w * 0.35, n: 8 },
    },
    tip: fill(smoothD([...tipL, ...tipR.reverse()], true, 0.6), C.tip),
  };
}

/** A soft contact shadow on the sand. */
const shadow = (w: number, x = 0): string =>
  el('ellipse', { cx: x, cy: 1.2, rx: w, ry: w * 0.16, fill: 'url(#shadow)' });

interface Torso {
  readonly hip: P;
  readonly mid: P;
  readonly chest: P;
  /** Back-side and belly-side half widths at hip, middle and chest. */
  readonly back: readonly [number, number, number];
  readonly belly: readonly [number, number, number];
  readonly seed: number;
  readonly bands?: number;
  /** Tuft length (the pup's is longer). */
  readonly amp?: number;
}

/** The torso along its spine: a fur part with the pale belly and throat and the back's bands. */
function torso(t: Torso): Part {
  const back: P[] = [];
  const belly: P[] = [];
  const creamIn: P[] = [];
  const N = 10;
  const prof = (w: readonly [number, number, number], s: number): number =>
    s < 0.5 ? w[0] + (w[1] - w[0]) * (s / 0.5) : w[1] + (w[2] - w[1]) * ((s - 0.5) / 0.5);
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const { p, d } = bez(t.hip, t.mid, t.chest, s);
    const nb: P = [d[1], -d[0]];
    const vw = prof(t.belly, s);
    back.push(add(p, mul(nb, prof(t.back, s))));
    belly.push(add(p, mul(nb, -vw)));
    creamIn.push(add(p, mul(nb, -vw * (0.9 - 0.95 * s))));
  }
  const { p: r0, d: rd } = bez(t.hip, t.mid, t.chest, 0);
  const rump = add(r0, mul(rd, -Math.max(t.back[0], t.belly[0]) * 0.9));
  const { p: c0, d: cd } = bez(t.hip, t.mid, t.chest, 1);
  const cap = add(c0, mul(cd, Math.max(t.back[2], t.belly[2]) * 0.75));
  const bands: string[] = [];
  const nb = t.bands ?? 6;
  for (let i = 0; i < nb; i++) {
    const s = 0.18 + (i / Math.max(1, nb - 1)) * 0.6;
    const { p, d } = bez(t.hip, t.mid, t.chest, s);
    const n: P = [d[1], -d[0]];
    const w = prof(t.back, s);
    bands.push(
      quad(
        add(p, mul(n, w * 1.1)),
        add(add(p, mul(n, w * 0.65)), mul(d, 1.6)),
        add(add(p, mul(n, w * 0.2)), mul(d, -2)),
      ),
    );
  }
  const cream = smoothD(
    [...creamIn.slice(1), cap, ...[...belly].reverse().slice(0, N - 1)],
    true,
    1,
  );
  return {
    pts: [...back, cap, ...[...belly].reverse(), rump],
    amp: t.amp ?? 1.7,
    flow: norm(sub(t.hip, t.chest)),
    seed: t.seed,
    axis: { a: t.chest, b: t.hip, half: Math.max(...t.back, ...t.belly), n: 38 },
    under: [fill(cream, 'url(#cream)', { filter: 'url(#soft)' })],
    over: [line(bands.join(''), C.band, 2, 0.42)],
  };
}

// --- heads --------------------------------------------------------------------------------------

interface HeadOpts {
  /** Where the neck meets the head, and the head's tilt (deg, + = chin down). */
  readonly at: P;
  readonly tilt: number;
  readonly view: 'side' | 'front';
  readonly dir: 1 | -1;
  readonly k?: number;
  readonly mouth?: boolean;
  readonly seed: number;
  readonly amp?: number;
}

/** A teardrop mask round an eye, its point sloping down toward the nose; the almond eye with a
 *  catch-light, and the pale brow above. Local coordinates (the caller places them). */
function eyeParts(T: (pts: readonly P[]) => P[], centre: P, toNose: P, k: number): string {
  const q = (p: P): P => T([p])[0] ?? centre;
  const [cx, cy] = centre;
  const [nx, ny] = toNose;
  // The teardrop: round over the eye, pointed toward the nose.
  const mask = T([
    [cx - nx * 0.6 - 1.2, cy - 3.2],
    [cx + 1.6 - nx * 0.2, cy - 3.6],
    [cx + 3.2 - nx * 0.3, cy - 1.2],
    [cx + nx * 0.9, cy + ny * 0.9 + 1],
    [cx + nx * 1.25, cy + ny * 1.25],
    [cx - 2.6, cy + 1.4],
    [cx - 3.4 - nx * 0.2, cy - 1.2],
  ]);
  const eye = q(centre);
  const glint = q([cx - 0.6, cy - 0.7]);
  const browA = q([cx - 3.6, cy - 4.4]);
  const browC = q([cx, cy - 5.8]);
  const browB = q([cx + 3.4, cy - 4.4]);
  const tilt = (Math.atan2(ny, nx) * 180) / Math.PI;
  return g(
    {},
    line(quad(browA, browC, browB), C.brow, 1.2, 0.95),
    fill(smoothD(mask, true, 1), C.mask),
    el('ellipse', {
      cx: eye[0],
      cy: eye[1],
      rx: 1.9 * k,
      ry: 1.2 * k,
      fill: C.eye,
      transform: `rotate(${r2(tilt * 0.35)} ${r2(eye[0])} ${r2(eye[1])})`,
    }),
    fill(ellipseD(glint[0], glint[1], 0.62 * k, 0.62 * k), C.glint),
  );
}

/** A small crescent ear, set low at the side of the head. */
function ear(at: P, s: number, k: number): string {
  const [x, y] = at;
  return fill(
    `M${r2(x)} ${r2(y - 3 * k)}Q${r2(x + s * 3.6 * k)} ${r2(y - 0.4 * k)} ${r2(x + s * 0.4 * k)} ${r2(y + 3 * k)}Q${r2(x + s * 1.6 * k)} ${r2(y)} ${r2(x)} ${r2(y - 3 * k)}Z`,
    C.ear,
  );
}

/** The head as fur parts (skull and cheeks) plus its face. */
function head(o: HeadOpts): { parts: Part[]; face: string } {
  const k = o.k ?? 1;
  const amp = o.amp ?? 1.4;
  if (o.view === 'front') {
    const T = (pts: readonly P[]): P[] => place(pts, o.at, o.tilt, k, 1);
    const skull = T([
      [-11, -11],
      [-8, -19],
      [0, -22],
      [8, -19],
      [11, -11],
      [12.5, -4],
      [8, 1.5],
      [3.6, 5],
      [0, 7],
      [-3.6, 5],
      [-8, 1.5],
      [-12.5, -4],
    ]);
    const q = (p: P): P => T([p])[0] ?? o.at;
    const muzzleY = q([0, 0])[1];
    const parts: Part[] = [
      {
        pts: skull,
        // Fluffy cheeks and crown; the muzzle stays smooth.
        amp: (p) => (p[1] > muzzleY + 1 && Math.abs(p[0] - o.at[0]) < 6 * k ? 0 : amp),
        flow: [0, 1],
        seed: o.seed,
        axis: { a: q([0, -21]), b: q([0, -2]), half: 10 * k, n: 14 },
        under: [
          // Pale face: cheeks, the muzzle and the throat.
          fill(
            smoothD(
              T([
                [-9, -8],
                [-3, -12],
                [3, -12],
                [9, -8],
                [10, -2],
                [5, 3],
                [0, 6.4],
                [-5, 3],
                [-10, -2],
              ]),
              true,
              1,
            ),
            'url(#cream)',
            { filter: 'url(#soft)' },
          ),
        ],
      },
    ];
    const nose = q([0, 2.8]);
    const mouthA = q([-1.8, 5.2]);
    const mouthM = q([0, 6]);
    const mouthB = q([1.8, 5.2]);
    const face = g(
      {},
      ear(q([-12.6, -8]), -1, k),
      ear(q([12.6, -8]), 1, k),
      // Darker fur down the bridge of the nose.
      line(quad(q([0, -14]), q([0.4, -6]), q([0, 0.6])), C.furMid, 2.2 * k, 0.55),
      eyeParts(T, [-5.2, -9], [3.4, 5.2], k),
      eyeParts(T, [5.2, -9], [-3.4, 5.2], k),
      fill(smoothD([q([-2, 1.8]), q([2, 1.8]), q([0.9, 3.8]), q([-0.9, 3.8])], true, 1), C.nose),
      fill(ellipseD(nose[0] - 0.5 * k, nose[1] - 0.6 * k, 0.5 * k, 0.35 * k), C.glint, {
        opacity: 0.5,
      }),
      o.mouth === true
        ? fill(ellipseD(mouthM[0], mouthM[1], 2 * k, 1.8 * k), C.mouth)
        : line(
            `M${r2(mouthA[0])} ${r2(mouthA[1])}Q${r2(mouthM[0])} ${r2(mouthM[1] + 0.8)} ${r2(mouthB[0])} ${r2(mouthB[1])}`,
            C.mouth,
            0.7,
          ),
    );
    return { parts, face };
  }
  const T = (pts: readonly P[]): P[] => place(pts, o.at, o.tilt, k, o.dir);
  const q = (p: P): P => T([p])[0] ?? o.at;
  const skull = T([
    [-7, -2],
    [-8, -10],
    [-3, -15],
    [5, -14.5],
    [11, -10.5],
    [15.6, -6.4],
    [19, -2.8],
    [19.8, -0.6],
    [17.4, 1.8],
    [11, 3.6],
    [3, 5],
    [-4.6, 3.4],
  ]);
  const parts: Part[] = [
    {
      pts: skull,
      // The muzzle (its front third) stays smooth; crown, nape and cheek are fluffy.
      amp: (p) => ((p[0] - o.at[0]) * o.dir > 12 * k ? 0 : amp),
      flow: rot([-o.dir, 0.5], o.tilt * o.dir),
      seed: o.seed,
      axis: { a: q([14, -6]), b: q([-6, -4]), half: 7 * k, n: 12 },
      under: [
        fill(
          smoothD(
            T([
              [0, -3],
              [8, -6],
              [14, -5.4],
              [19.4, -1.4],
              [17, 1.6],
              [10, 3.4],
              [2, 4.6],
              [-3, 2],
            ]),
            true,
            1,
          ),
          'url(#cream)',
          { filter: 'url(#soft)' },
        ),
      ],
    },
    // A full, fluffy cheek behind the jaw.
    {
      ...oval(q([2, 1]), 6.2 * k, 4.6 * k, 0, o.seed + 3, amp * 1.1, [-o.dir, 0.6]),
      base: 'url(#cream)',
    },
  ];
  const nose = q([19, -1.2]);
  const face = g(
    {},
    ear(q([-3.2, -6.6]), -o.dir, k),
    eyeParts(T, [8.4, -7.6], [4.4, 3.6], k),
    fill(ellipseD(nose[0], nose[1], 1.7 * k, 1.4 * k), C.nose),
    o.mouth === true
      ? fill(ellipseD(q([15.6, 2.6])[0], q([15.6, 2.6])[1], 2.6 * k, 1.8 * k), C.mouth)
      : line(quad(q([17.6, 1.4]), q([15.6, 2.6]), q([13.2, 2.4])), C.mouth, 0.7),
  );
  return { parts, face };
}

// --- poses ---------------------------------------------------------------------------------------

/** Standing tall (the sentinel and a dash's halfway stop): chin up, paws together at the belly. */
function upright(look: -1 | 0 | 1, seed: number, opts: { mouth?: boolean } = {}): string {
  const body = torso({
    hip: [-3, -22],
    mid: [-3, -58],
    chest: [2, -92],
    back: [15, 13, 9],
    belly: [10, 12, 9],
    seed,
  });
  const neck: Part = { ...oval([3, -96], 8, 10, 0, seed + 1, 1.4, [0, 1]), base: 'url(#fur)' };
  const view = look === 0 ? 'front' : 'side';
  const dir: 1 | -1 = look < 0 ? -1 : 1;
  const h = head({
    at: view === 'front' ? [3, -100] : [dir > 0 ? 2 : 5, -103],
    tilt: view === 'front' ? 0 : -16,
    view,
    dir,
    seed: seed + 2,
    ...(opts.mouth === true ? { mouth: true } : {}),
  });
  const tail = tailPart([-10, -9], [-30, 0], [-56, -3], 5.4, seed + 4);
  // The haunch: a fur oval that blends into the body (same layer, no outline between).
  const haunch = oval([-4, -21], 10, 14, 8, seed + 5, 1.8, [0.2, 1]);
  const foot = limbPart([0, -6], [5, -3], [13, -1.5], 6, 4, seed + 6, 'url(#fur)');
  const armFar = limbPart([2, -84], [10, -73], [6, -64], 6.2, 4.4, seed + 7);
  const armNear = limbPart([9, -84], [15, -74], [10, -63], 6.6, 4.6, seed + 8);
  return g(
    {},
    shadow(24),
    figure([tail.part, foot, body, haunch, neck, ...h.parts], [armFar, armNear]),
    tail.tip,
    claws([13, -1.4], 0),
    claws([6.6, -62.4], 70, 0.9),
    claws([10.6, -61.6], 80, 0.9),
    h.face,
  );
}

/** Front-facing, for the photo row: shorter than the side view, the cream belly softly shaded,
 *  haunches and hind feet, the tail curled round on the sand, paws together, eyes on the camera. */
function front(seed: number, opts: { mouth?: boolean } = {}): string {
  const body: Part = {
    pts: [
      [-10, -2],
      [-17, -16],
      [-18, -38],
      [-15, -62],
      [-10, -80],
      [-6, -86],
      [6, -86],
      [10, -80],
      [15, -62],
      [18, -38],
      [17, -16],
      [10, -2],
    ],
    amp: 1.7,
    flow: [0, 1],
    seed,
    axis: { a: [0, -84], b: [0, -6], half: 16, n: 44 },
    under: [
      fill(
        smoothD(
          [
            [-8, -8],
            [-11, -36],
            [-9, -64],
            [-4, -82],
            [4, -82],
            [9, -64],
            [11, -36],
            [8, -8],
          ],
          true,
          1,
        ),
        'url(#cream)',
        { filter: 'url(#soft)' },
      ),
      // Soft shading down the belly's sides.
      fill(ellipseD(-10, -40, 4, 26), C.furShade, { opacity: 0.25, filter: 'url(#soft)' }),
      fill(ellipseD(10, -40, 4, 26), C.furShade, { opacity: 0.35, filter: 'url(#soft)' }),
    ],
  };
  const hl = oval([-11, -12], 8, 11, -10, seed + 5, 1.8, [0, 1]);
  const hr = oval([11, -12], 8, 11, 10, seed + 6, 1.8, [0, 1]);
  const fl = limbPart([-8, -4], [-9, -2], [-12, -1], 7, 6, seed + 9, 'url(#fur)');
  const fr = limbPart([8, -4], [9, -2], [12, -1], 7, 6, seed + 10, 'url(#fur)');
  const tail = tailPart([9, -5], [30, 1], [46, -4], 5, seed + 4);
  const h = head({
    at: [0, -88],
    tilt: 0,
    view: 'front',
    dir: 1,
    seed: seed + 2,
    ...(opts.mouth === true ? { mouth: true } : {}),
  });
  const armL = limbPart([-10, -76], [-12, -64], [-3, -56], 6.4, 4.6, seed + 7);
  const armR = limbPart([10, -76], [12, -64], [3, -56], 6.4, 4.6, seed + 8);
  return g(
    {},
    shadow(24),
    figure([tail.part, fl, fr, body, hl, hr, ...h.parts], [armL, armR]),
    tail.tip,
    claws([-13, -1], 180, 0.9),
    claws([13, -1], 0, 0.9),
    claws([-2, -55], 90, 0.85),
    claws([2, -55], 90, 0.85),
    h.face,
  );
}

/** Sitting on its haunches, leaning forward, front paws down. */
function sit(seed: number, k = 1, pup = false): string {
  const amp = pup ? 2.6 : 1.7;
  const body = torso({
    hip: [-10, -16],
    mid: [0, -30],
    chest: [12, -42],
    back: pup ? [16, 15, 11] : [15, 13, 9],
    belly: pup ? [12, 12, 9] : [10, 11, 8],
    seed,
    bands: pup ? 3 : 5,
    amp,
  });
  const h = head({
    at: [14, -46],
    tilt: -6,
    view: 'side',
    dir: 1,
    k: pup ? 1.55 : 1,
    seed: seed + 2,
    amp: pup ? 2.2 : 1.4,
  });
  const tail = tailPart([-18, -6], [-36, 0], [-56, -2], 5, seed + 4);
  const haunch = oval([-8, -14], 12, 10, -20, seed + 5, amp, [0.4, 1]);
  const hind = limbPart([-8, -6], [0, -2], [6, -1.5], 7, 4.4, seed + 6, 'url(#fur)');
  const far = limbPart([12, -34], [17, -18], [18, -1.5], 6, 4.2, seed + 7, C.furMid);
  const near = limbPart([16, -36], [21, -18], [23, -1.5], 6.2, 4.4, seed + 8);
  return g(
    { transform: k === 1 ? '' : `scale(${k})` },
    shadow(26),
    figure([tail.part, far, hind, body, haunch, ...h.parts], [near]),
    tail.tip,
    claws([23.5, -1.2], 0),
    claws([7, -1.2], 0, 0.8),
    h.face,
  );
}

/** Sitting back on its haunches, belly to the sun, arms hanging, chin up. */
function sunbathe(seed: number): string {
  const body = torso({
    hip: [-4, -12],
    mid: [-6, -36],
    chest: [-12, -60],
    back: [13, 12, 9],
    belly: [11, 13, 9],
    seed,
  });
  const h = head({ at: [-10, -66], tilt: -38, view: 'side', dir: 1, seed: seed + 2 });
  const tail = tailPart([-10, -6], [-30, 0], [-52, -2], 5, seed + 4);
  const haunch = oval([-2, -12], 12, 9, -10, seed + 5, 1.8, [0.3, 1]);
  const hind = limbPart([2, -8], [8, -3], [15, -1.5], 7, 4.4, seed + 6, 'url(#fur)');
  const arm = limbPart([-6, -54], [6, -46], [8, -35], 6, 4.2, seed + 7);
  return g(
    {},
    shadow(26),
    figure([tail.part, hind, body, haunch, ...h.parts], [arm]),
    tail.tip,
    claws([15.4, -1.3], 0),
    claws([8.4, -34], 80, 0.85),
    h.face,
  );
}

/** Digging: rump up, head down, front paws scraping at the sand. */
function dig(phase: 0 | 1, seed: number): string {
  const reach = phase === 0 ? 0 : 5;
  const body = torso({
    hip: [-14, -28],
    mid: [0, -30],
    chest: [14, -20],
    back: [14, 13, 10],
    belly: [10, 11, 8],
    seed,
  });
  const h = head({ at: [18, -22], tilt: 34, view: 'side', dir: 1, seed: seed + 2 });
  const tail = tailPart([-24, -32], [-40, -30], [-56, -16], 5, seed + 4);
  const haunch = oval([-13, -24], 10, 11, 20, seed + 5, 1.8, [0.3, 1]);
  const hind = limbPart([-14, -18], [-19, -9], [-12, -1.5], 7.4, 4.4, seed + 6, 'url(#fur)');
  const far = limbPart([10, -18], [18, -12], [22 - reach, -1.5], 6, 4.2, seed + 7, C.furMid);
  const near = limbPart([14, -18], [24 + reach, -11], [27 + reach, -1.5], 6.4, 4.4, seed + 8);
  return g(
    {},
    shadow(30),
    figure([tail.part, far, hind, body, haunch, ...h.parts], [near]),
    tail.tip,
    claws([28 + reach, -1.4], 20),
    claws([-11.4, -1.3], 0, 0.8),
    h.face,
  );
}

/** Running: the body low and stretched, the tail up; legs bent at the knee in the gather and
 *  push phases. */
function run(phase: number, seed: number, k = 1, pup = false): string {
  const ph = phase % 4;
  const lift = [0, 2.5, 1, 3][ph] ?? 0;
  const y = -24 - lift;
  const amp = pup ? 2.6 : 1.6;
  const body = torso({
    hip: [-22, y],
    mid: [0, y - 3],
    chest: [20, y - 1],
    back: pup ? [13, 12, 10] : [11, 10, 8],
    belly: pup ? [10, 10, 9] : [9, 9, 8],
    seed,
    bands: pup ? 3 : 6,
    amp,
  });
  const h = head({
    at: [24, y - 4],
    tilt: -4,
    view: 'side',
    dir: 1,
    k: pup ? 1.55 : 1,
    seed: seed + 2,
    amp: pup ? 2.2 : 1.4,
  });
  const tail = tailPart([-28, y - 4], [-46, y - 18], [-42, y - 48], 4.8, seed + 4);
  // Legs: [hip/shoulder, knee/elbow, paw] per phase; the knees bend in the gather (1) and push
  // (3) phases.
  // Legs per phase, [hip or shoulder, knee or elbow, paw]: reached out (0), gathered under (1),
  // pushing off (2) and in flight (3). The knees bend in every phase but the push.
  const hindNear: [P, P, P][] = [
    [
      [-16, y + 4],
      [-25, y + 13],
      [-33, -1],
    ],
    [
      [-16, y + 4],
      [-8, y + 12],
      [-14, -1],
    ],
    [
      [-16, y + 4],
      [-19, y + 14],
      [-21, -1],
    ],
    [
      [-16, y + 4],
      [-27, y + 9],
      [-35, y + 15],
    ],
  ];
  const foreNear: [P, P, P][] = [
    [
      [18, y + 6],
      [27, y + 13],
      [33, -1],
    ],
    [
      [18, y + 6],
      [20, y + 15],
      [11, -1],
    ],
    [
      [18, y + 6],
      [21, y + 15],
      [24, -1],
    ],
    [
      [18, y + 6],
      [28, y + 9],
      [36, y + 13],
    ],
  ];
  const hn = hindNear[ph] ?? hindNear[0];
  const fn = foreNear[ph] ?? foreNear[0];
  const hf = hindNear[(ph + 2) % 4] ?? hindNear[0];
  const ff = foreNear[(ph + 2) % 4] ?? foreNear[0];
  const off = (l: [P, P, P] | undefined, dx: number): [P, P, P] => {
    const [a, m, b] = l ?? [
      [0, 0],
      [0, 0],
      [0, 0],
    ];
    return [add(a, [dx, -2]), add(m, [dx, 0]), add(b, [dx, 0])];
  };
  const [ha, hm, hb] = off(hf, -3);
  const [fa, fm, fb] = off(ff, -2);
  const [na, nm, nbp] = off(hn, 0);
  const [ea, em, eb] = off(fn, 0);
  return g(
    { transform: k === 1 ? '' : `scale(${k})` },
    shadow(30),
    figure(
      [
        tail.part,
        limbPart(ha, hm, hb, 8, 4, seed + 6, C.furMid),
        limbPart(fa, fm, fb, 6, 3.8, seed + 7, C.furMid),
        body,
        oval([-16, y + 1], 10, 9, 10, seed + 5, amp, [0.4, 1]),
        ...h.parts,
      ],
      [limbPart(na, nm, nbp, 9, 4.2, seed + 8), limbPart(ea, em, eb, 6.4, 4, seed + 9)],
    ),
    tail.tip,
    claws(nbp, 0, 0.8),
    claws(eb, 0, 0.8),
    h.face,
  );
}

/** Head first into the hole: the hindquarters and tail still up (a), then only the tail (b). */
function dive(stage: 0 | 1, seed: number): string {
  const sink = stage === 0 ? 0 : 26;
  const body = torso({
    hip: [-2, -30 + sink],
    mid: [0, -14 + sink],
    chest: [2, 6 + sink],
    back: [13, 12, 10],
    belly: [10, 10, 9],
    seed,
    bands: 3,
  });
  const tail = tailPart([-2, -36 + sink], [-14, -54 + sink], [-6, -70 + sink], 5, seed + 4);
  const leg = limbPart([-6, -28 + sink], [-16, -26 + sink], [-20, -18 + sink], 8, 4, seed + 6);
  return g({}, figure([tail.part, body], [leg]), tail.tip, claws([-21, -17.4 + sink], 160, 0.8));
}

/** A ball of fur rolling into the hole (the view spins it). */
function tumble(seed: number): string {
  const ball: Part = {
    pts: [
      [-18, -20],
      [-12, -38],
      [4, -42],
      [17, -32],
      [18, -14],
      [4, -4],
      [-12, -6],
    ],
    amp: 2,
    flow: [0.4, 1],
    seed,
    axis: { a: [0, -40], b: [0, -6], half: 16, n: 50 },
    under: [fill(ellipseD(4, -22, 8, 10), 'url(#cream)', { filter: 'url(#soft)' })],
  };
  const tail = tailPart([-14, -28], [-30, -44], [-10, -52], 5, seed + 4);
  const h = head({ at: [10, -28], tilt: 80, view: 'side', dir: 1, seed: seed + 2 });
  return g({}, figure([tail.part, ball, ...h.parts]), tail.tip, h.face);
}

function frameArt(name: MeerkatFrame, seed: number): string {
  switch (name) {
    case 'peek_l':
      return rim(upright(-1, seed), 82);
    case 'peek_r':
      return rim(upright(1, seed), 82);
    case 'stand_l':
      return upright(-1, seed);
    case 'stand_c':
      return upright(0, seed);
    case 'stand_r':
      return upright(1, seed);
    case 'bark':
      return upright(1, seed, { mouth: true });
    case 'front':
      return front(seed);
    case 'sit':
      return sit(seed);
    case 'sunbathe':
      return sunbathe(seed);
    case 'dig_a':
      return dig(0, seed);
    case 'dig_b':
      return dig(1, seed);
    case 'run_0':
      return run(0, seed);
    case 'run_1':
      return run(1, seed);
    case 'run_2':
      return run(2, seed);
    case 'run_3':
      return run(3, seed);
    case 'dive_a':
      return rim(dive(0, seed), 0);
    case 'dive_b':
      return rim(dive(1, seed), 0);
    case 'scold':
      return rim(front(seed, { mouth: true }), 52);
    case 'emerge':
      return rim(upright(1, seed), 44);
    case 'tumble':
      return tumble(seed);
    case 'pup_sit':
      return sit(seed, 0.62, true);
    case 'pup_run_a':
      return run(1, seed, 0.62, true);
    case 'pup_run_b':
      return run(3, seed, 0.62, true);
    case 'flick':
      return flick(seed);
  }
}

/** Sand thrown up by digging: a fan of grains. */
function flick(seed: number): string {
  const rnd = prng(seed);
  const grains: string[] = [];
  for (let i = 0; i < 18; i++) {
    const a = -0.25 - rnd() * 1.2;
    const r = 6 + rnd() * 28;
    const x = -Math.cos(a) * r;
    const y = Math.sin(a) * r - 6;
    const s = 0.9 + rnd() * 2.2;
    grains.push(fill(ellipseD(x, y, s, s * 0.8), rnd() < 0.5 ? C.sand : C.sandFresh));
  }
  return g({}, ...grains);
}

/** In a hole: what shows above the rim (y = 0); `body` is drawn sunk by `sink`. */
function rim(body: string, sink: number): string {
  const id = uid('r');
  return g(
    {},
    el(
      'clipPath',
      { id },
      el('rect', { x: -CELL_W / 2, y: -CELL_H, width: CELL_W, height: CELL_H }),
    ),
    g({ 'clip-path': `url(#${id})` }, g({ transform: `translate(0 ${r2(sink)})` }, body)),
    // Loose sand along the rim where the body meets the hole.
    line(`M-15 -0.4Q0 2 15 -0.4`, C.sandShade, 2.2, 0.9),
  );
}

/** One burrow hole: dark and deep, shaded inside at the back, its front lip lit. */
function hole(x: number, y: number, rx: number, ry: number): string {
  return g(
    {},
    fill(ellipseD(x, y, rx + 2.4, ry + 1.8), C.sandShade, { opacity: 0.7 }),
    fill(ellipseD(x, y, rx, ry), 'url(#hole)'),
    // Inner shadow under the back rim.
    fill(ellipseD(x, y - ry * 0.35, rx * 0.86, ry * 0.5), C.holeDeep, { opacity: 0.6 }),
    // The lit front lip.
    line(
      `M${r2(x - rx * 0.9)} ${r2(y + ry * 0.35)}Q${r2(x)} ${r2(y + ry * 1.35)} ${r2(x + rx * 0.9)} ${r2(y + ry * 0.35)}`,
      C.sandFresh,
      1.6,
      0.95,
    ),
    // The far rim in shade.
    line(
      `M${r2(x - rx * 0.95)} ${r2(y - ry * 0.1)}Q${r2(x)} ${r2(y - ry * 1.3)} ${r2(x + rx * 0.95)} ${r2(y - ry * 0.1)}`,
      C.sandDeep,
      1.2,
      0.8,
    ),
  );
}

/** Fresh, lighter sand fanned out downhill from a hole, with grains. */
function spoil(rnd: () => number, x: number, y: number, w: number, len: number): string {
  const fan = smoothD(
    [
      [x - w * 0.45, y + 1],
      [x + w * 0.45, y + 1],
      [x + w * 0.75, y + len * 0.7],
      [x + w * 0.2, y + len],
      [x - w * 0.3, y + len * 0.95],
      [x - w * 0.8, y + len * 0.65],
    ],
    true,
    1,
  );
  const grains: string[] = [];
  for (let i = 0; i < 14; i++) {
    const gx = x + (rnd() - 0.5) * w * 1.8;
    const gy = y + 3 + rnd() * len;
    grains.push(
      fill(
        ellipseD(gx, gy, 0.8 + rnd() * 1.4, 0.6 + rnd()),
        rnd() < 0.5 ? C.sandFresh : C.sandShade,
        { opacity: 0.85 },
      ),
    );
  }
  return g({}, fill(fan, C.sandFresh, { opacity: 0.32 }), ...grains);
}

/** A burrow mound: low sand with 2–3 holes (the meerkats use the one at (0, 0)), fresh spoil from
 *  each, scratch marks and tiny tracks. `w` is the half width. */
function mound(w: number, holes: readonly [number, number, number][], seed: number): string {
  const rnd = prng(seed);
  const base = 30;
  const outline: P[] = [
    [-w, base],
    [-w * 0.78, base - 9],
    [-w * 0.45, -4],
    [-w * 0.1, -9],
    [w * 0.25, -8],
    [w * 0.55, -2],
    [w * 0.82, base - 11],
    [w, base],
  ];
  const scratches: string[] = [];
  for (let i = 0; i < 4; i++) {
    const sx = (rnd() - 0.5) * w * 1.3;
    const sy = 10 + rnd() * 14;
    for (let j = 0; j < 3; j++) scratches.push(seg([sx + j * 2.2, sy], [sx + j * 2.2 + 4, sy + 3]));
  }
  const tracks: string[] = [];
  for (let i = 0; i < 9; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const tx = side * (w * 0.58 + Math.floor(i / 2) * 9 + rnd() * 3);
    const ty = base - 3 - (i % 3) * 2.2;
    tracks.push(fill(ellipseD(tx, ty, 1.3, 0.85), C.sandDeep, { opacity: 0.65 }));
    tracks.push(fill(ellipseD(tx + 2.2, ty - 1.4, 0.8, 0.55), C.sandDeep, { opacity: 0.55 }));
  }
  const pebbles: string[] = [];
  for (let i = 0; i < 4; i++)
    pebbles.push(
      inked(ellipseD((rnd() - 0.5) * w * 1.5, base - 4 - rnd() * 9, 2, 1.4), C.pebble, 0.5),
    );
  return g(
    {},
    el('ellipse', { cx: 0, cy: base, rx: w * 1.05, ry: 6, fill: 'url(#shadow)' }),
    fill(smoothD(outline, true, 1), 'url(#sand)', { stroke: C.sandShade, 'stroke-width': 0.9 }),
    // Lit crest on the upper left, shade on the lower right.
    line(
      `M${r2(-w * 0.72)} ${r2(base - 11)}Q${r2(-w * 0.35)} -9 ${r2(w * 0.1)} -10`,
      C.sandLit,
      2.6,
      0.7,
    ),
    fill(
      smoothD(
        [
          [w * 0.4, 6],
          [w * 0.95, base],
          [w * 0.2, base],
          [w * 0.1, 14],
        ],
        true,
        1,
      ),
      C.sandShade,
      { opacity: 0.28 },
    ),
    ...holes.map(([hx, hy, hr]) => spoil(rnd, hx, hy + hr * 0.4, hr * 1.4, base - hy - 2)),
    line(scratches.join(''), C.sandDeep, 0.8, 0.6),
    ...pebbles,
    ...holes.map(([hx, hy, hr]) => hole(hx, hy, hr, hr * 0.42)),
    ...tracks,
  );
}

/** Each mound's holes: [x, y, radius] from the main hole at (0, 0). */
const MOUNDS: Readonly<Record<string, { w: number; holes: readonly [number, number, number][] }>> =
  {
    mound_a: {
      w: 86,
      holes: [
        [0, 0, 19],
        [-44, 12, 12],
        [40, 14, 10],
      ],
    },
    mound_b: {
      w: 74,
      holes: [
        [0, 0, 18],
        [34, 12, 11],
      ],
    },
    mound_c: {
      w: 94,
      holes: [
        [0, 0, 20],
        [-46, 13, 13],
        [44, 11, 11],
      ],
    },
  };

/** The whole sheet as SVG (design px viewBox, rendered at SHEET_MASTER×). */
export function meerkatSheetSvg(): string {
  seq = 0;
  const parts: string[] = [];
  for (const f of sheetFrames()) {
    // Mirrored frames share their twin's cell (the view flips them).
    if (f.mirror === true) continue;
    const seed = 5200 + parts.length * 17;
    const m = MOUNDS[f.name];
    const art =
      (MOUND_FRAMES as readonly string[]).includes(f.name) && m !== undefined
        ? mound(m.w, m.holes, seed)
        : frameArt(f.name as MeerkatFrame, seed);
    const id = uid('cell');
    parts.push(
      g(
        {},
        el('clipPath', { id }, el('rect', { x: f.x, y: f.y, width: f.w, height: f.h })),
        g(
          { 'clip-path': `url(#${id})` },
          g({ transform: `translate(${r2(f.x + f.ox)} ${r2(f.y + f.oy)})` }, art),
        ),
      ),
    );
  }
  return svgDoc(
    SHEET_W * SHEET_MASTER,
    SHEET_H * SHEET_MASTER,
    [0, 0, SHEET_W, SHEET_H],
    DEFS,
    parts.join(''),
  );
}

export function renderMeerkatSheet(): Rgba {
  return renderSvg(meerkatSheetSvg());
}
