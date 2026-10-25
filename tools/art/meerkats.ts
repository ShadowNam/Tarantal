// v1.7 (D-044, look round 25 Oct): interim art for the desert maps' meerkat colonies — one sheet
// (layout in src/game/assets/desertAssets.ts) drawn at 2× in the D-035 semi-realistic style, at
// the v1.4 camelthorn / v1.6 bar. One rig builds every pose:
// - the torso grows along a spine (hip → chest) with separate back and belly widths;
// - a pale cream belly and throat run down the belly side, clearly lighter than the back;
// - faint darker bands cross the back, and fine fur strokes follow the body;
// - it is lit from the upper left, with a shaded far side;
// - the head has the dark eye mask with a small bright eye inside, a dark nose, a small dark
//   crescent ear and a pale face;
// - legs and the thin tapering tail (black tip) are tapered strokes.
// The pup is the same rig, smaller, with a bigger head and a fluffy edge.
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
import { el, ellipseD, g, prng, r2, smoothD, svgDoc } from './svg';

type P = readonly [number, number];

const C = {
  furLit: '#E2BE8C',
  fur: '#B99368',
  furMid: '#9C7D5A',
  furShade: '#6E5843',
  band: '#4A3829',
  cream: '#F6EAD0',
  creamShade: '#D8C29C',
  mask: '#1E1611',
  ear: '#2C2018',
  nose: '#15100C',
  eye: '#3A2410',
  glint: '#FFF8E8',
  tip: '#120D0A',
  ink: '#3A2A1D',
  mouth: '#5C2A20',
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
  // Light from the upper left (a soft white bloom) and the far side's shade (lower right).
  el(
    'radialGradient',
    { id: 'lit', cx: 0.22, cy: 0.18, r: 0.65 },
    el('stop', { offset: 0, 'stop-color': '#FFF4DC', 'stop-opacity': 0.55 }),
    el('stop', { offset: 1, 'stop-color': '#FFF4DC', 'stop-opacity': 0 }),
  ),
  el(
    'linearGradient',
    { id: 'shade', x1: 0.35, y1: 0.25, x2: 1, y2: 0.95 },
    el('stop', { offset: 0, 'stop-color': C.furShade, 'stop-opacity': 0 }),
    el('stop', { offset: 1, 'stop-color': C.furShade, 'stop-opacity': 0.75 }),
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

// --- small vector maths -----------------------------------------------------------------------
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const norm = (a: P): P => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};
/** Quadratic Bézier point and tangent. */
function bez(a: P, c: P, b: P, t: number): { p: P; d: P } {
  const p = lerp(lerp(a, c, t), lerp(c, b, t), t);
  const d = norm(add(mul(add(c, mul(a, -1)), 2 * (1 - t)), mul(add(b, mul(c, -1)), 2 * t)));
  return { p, d };
}
const rot = (p: P, deg: number): P => {
  const a = (deg * Math.PI) / 180;
  return [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
};
/** Local points (facing right) placed at `at`, turned `deg`, scaled, mirrored when dir is −1. */
const place = (pts: readonly P[], at: P, deg: number, k: number, dir: 1 | -1): P[] =>
  pts.map((q) => add(at, rot([q[0] * k * dir, q[1] * k], deg * dir)));

// --- parts --------------------------------------------------------------------------------------

/** A furred shape: gradient fill, the lit bloom and far-side shade clipped to it, extras on top
 *  (bands, fur), and the ink edge. */
function furShape(d: string, extras: readonly string[] = [], base = 'url(#fur)'): string {
  const id = uid('c');
  return g(
    {},
    el('clipPath', { id }, fill(d, '#000')),
    fill(d, base),
    g({ 'clip-path': `url(#${id})` }, fill(d, 'url(#shade)'), fill(d, 'url(#lit)'), ...extras),
    fill(d, 'none', { stroke: C.ink, 'stroke-width': INK, 'stroke-linejoin': 'round' }),
  );
}

/** Fine fur strokes along a direction inside a box (clipped by the caller's shape). */
function furStrokes(
  rnd: () => number,
  box: { x0: number; y0: number; x1: number; y1: number },
  dir: P,
  n: number,
  colour: string,
  op: number,
  len = 3.2,
): string {
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = box.x0 + (box.x1 - box.x0) * rnd();
    const y = box.y0 + (box.y1 - box.y0) * rnd();
    const l = len * (0.6 + rnd() * 0.8);
    parts.push(seg([x, y], [x + dir[0] * l, y + dir[1] * l]));
  }
  return line(parts.join(''), colour, 0.55, op);
}

/** A tapered limb from `a` through `b` to `c` (widths at a and c), fur-coloured with ink. */
function limb(a: P, b: P, c: P, wa: number, wc: number, colour: string = C.fur): string {
  const left: P[] = [];
  const right: P[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const { p, d } = bez(a, b, c, t);
    const w = (wa + (wc - wa) * t) / 2;
    const n: P = [-d[1], d[0]];
    left.push(add(p, mul(n, w)));
    right.push(add(p, mul(n, -w)));
  }
  return inked(smoothD([...left, ...right.reverse()], true, 0.8), colour);
}

/** A small paw: an oval with two toe lines and darker claws. */
const paw = (at: P, k = 1, deg = 0): string =>
  g(
    { transform: `translate(${r2(at[0])} ${r2(at[1])}) rotate(${r2(deg)})` },
    inked(ellipseD(0, 0, 3.6 * k, 2.6 * k), C.furMid, 0.8),
    line(seg([-0.8 * k, -1.2 * k], [-0.8 * k, 1.6 * k]), C.ink, 0.5, 0.7),
    line(seg([1 * k, -1.2 * k], [1 * k, 1.6 * k]), C.ink, 0.5, 0.7),
    fill(ellipseD(3.2 * k, 0.6 * k, 0.9 * k, 0.6 * k), C.tip),
  );

/** The tail: a thin tapering shape along a curve, its last third black. */
function tail(a: P, c: P, b: P, w = 4.6): string {
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
    if (t >= 0.66) {
      tipL.push(add(p, mul(n, half)));
      tipR.push(add(p, mul(n, -half)));
    }
  }
  const all = smoothD([...left, ...right.reverse()], true, 0.6);
  return g(
    {},
    inked(all, 'url(#fur)'),
    fill(smoothD([...tipL, ...tipR.reverse()], true, 0.6), C.tip),
    line(smoothD(left.slice(1, 8), false, 1), C.furLit, 0.8, 0.6),
  );
}

/** A haunch: a furred oval over the hip, turned `deg`. */
function thigh(at: P, rx: number, ry: number, deg: number, seed: number): string {
  const rnd = prng(seed);
  const pts: P[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    pts.push(add(at, rot([Math.cos(a) * rx, Math.sin(a) * ry], deg)));
  }
  return furShape(smoothD(pts, true, 1), [
    furStrokes(
      rnd,
      { x0: at[0] - rx, y0: at[1] - ry, x1: at[0] + rx, y1: at[1] + ry },
      [0.3, 1],
      8,
      C.furShade,
      0.5,
      2.6,
    ),
  ]);
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
  /** 1: the back is on the left of the spine (facing right, upright) — the usual case. */
  readonly seed: number;
  /** A fluffy edge (the pup). */
  readonly fluffy?: boolean;
  /** Fewer bands (the pup). */
  readonly bands?: number;
}

/** The torso along its spine: outline, the pale belly and throat, bands across the back, fur. */
function torso(t: Torso): { d: string; art: string; top: P; dir: P } {
  const rnd = prng(t.seed);
  const back: P[] = [];
  const belly: P[] = [];
  const creamIn: P[] = [];
  const N = 14;
  const prof = (w: readonly [number, number, number], s: number): number =>
    s < 0.5 ? w[0] + (w[1] - w[0]) * (s / 0.5) : w[1] + (w[2] - w[1]) * ((s - 0.5) / 0.5);
  let topDir: P = [0, -1];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const { p, d } = bez(t.hip, t.mid, t.chest, s);
    // The back is to the spine's left (its normal turned −90°), the belly to its right.
    const nb: P = [d[1], -d[0]];
    const bw = prof(t.back, s) * (t.fluffy === true ? 1 + (rnd() - 0.5) * 0.18 : 1);
    const vw = prof(t.belly, s);
    back.push(add(p, mul(nb, bw)));
    belly.push(add(p, mul(nb, -vw)));
    // The cream runs from a thin line at the rump to past the spine at the chest and throat.
    const inset = 0.92 - 0.95 * s;
    creamIn.push(add(p, mul(nb, -vw * inset)));
    topDir = d;
  }
  const { p: rumpP, d: rumpD } = bez(t.hip, t.mid, t.chest, 0);
  const rump = add(rumpP, mul(rumpD, -Math.max(t.back[0], t.belly[0]) * 0.9));
  const { p: chestP, d: chestD } = bez(t.hip, t.mid, t.chest, 1);
  const cap = add(chestP, mul(chestD, Math.max(t.back[2], t.belly[2]) * 0.75));
  const outline: P[] = [...back, cap, ...[...belly].reverse(), rump];
  const d = smoothD(outline, true, 1);
  // The pale belly and throat, tapering in from the rump and widening up to the throat.
  const cream = smoothD(
    [...creamIn.slice(1), cap, ...[...belly].reverse().slice(0, N - 1)],
    true,
    1,
  );
  // Bands across the back: short dark arcs from the back edge inward.
  const bands: string[] = [];
  const nb = t.bands ?? 6;
  for (let i = 0; i < nb; i++) {
    const s = 0.18 + (i / Math.max(1, nb - 1)) * 0.6;
    const { p, d: dd } = bez(t.hip, t.mid, t.chest, s);
    const n: P = [dd[1], -dd[0]];
    const w = prof(t.back, s);
    const a = add(p, mul(n, w * 1.05));
    const b = add(add(p, mul(n, w * 0.25)), mul(dd, -2));
    const c = add(add(p, mul(n, w * 0.65)), mul(dd, 1.6));
    bands.push(`M${r2(a[0])} ${r2(a[1])}Q${r2(c[0])} ${r2(c[1])} ${r2(b[0])} ${r2(b[1])}`);
  }
  const xs = outline.map((q) => q[0]);
  const ys = outline.map((q) => q[1]);
  const box = {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
  };
  const along = norm(add(t.hip, mul(t.chest, -1)));
  const fluff =
    t.fluffy === true
      ? line(
          back
            .slice(1, -1)
            .map((q, i) => seg(q, add(q, rot(mul(along, 3.4), i % 2 === 0 ? 35 : -35))))
            .join(''),
          C.furLit,
          0.9,
          0.85,
        )
      : '';
  const art = furShape(d, [
    fill(cream, 'url(#cream)'),
    line(bands.join(''), C.band, 2.1, 0.5),
    furStrokes(rnd, box, along, 26, C.furShade, 0.55),
    furStrokes(rnd, box, along, 12, C.furLit, 0.5, 2.6),
    fluff,
  ]);
  return { d, art, top: t.chest, dir: topDir };
}

interface HeadOpts {
  /** Where the neck meets the head (skull's back-bottom), and the head's tilt (deg, + = down). */
  readonly at: P;
  readonly tilt: number;
  readonly view: 'side' | 'front';
  /** Side view: which way the snout points. */
  readonly dir: 1 | -1;
  readonly k?: number;
  readonly mouth?: boolean;
  readonly seed: number;
}

/** The head: skull, pale face, the dark eye mask with a small bright eye, ear, nose. */
function head(o: HeadOpts): string {
  const k = o.k ?? 1;
  const rnd = prng(o.seed);
  if (o.view === 'front') {
    const T = (pts: readonly P[]): P[] => place(pts, o.at, o.tilt, k, 1);
    const skull = T([
      [-11, -10],
      [-8, -20],
      [0, -23],
      [8, -20],
      [11, -10],
      [9, -2],
      [4, 6],
      [0, 8],
      [-4, 6],
      [-9, -2],
    ]);
    const face = T([
      [-7, -12],
      [0, -15],
      [7, -12],
      [6, -2],
      [3, 6],
      [0, 7.5],
      [-3, 6],
      [-6, -2],
    ]);
    const q = (p: P): P => T([p])[0] ?? o.at;
    const eyes = ([-1, 1] as const).map((s) => {
      const c = q([s * 4.6, -9]);
      return g(
        {},
        fill(ellipseD(c[0], c[1], 3.6 * k, 4.4 * k), C.mask),
        fill(ellipseD(c[0], c[1] + 0.4 * k, 1.6 * k, 1.6 * k), C.eye),
        fill(ellipseD(c[0] - 0.6 * k, c[1] - 0.5 * k, 0.75 * k, 0.75 * k), C.glint),
      );
    });
    const ears = ([-1, 1] as const).map((s) => {
      const c = q([s * 11.5, -13]);
      return inked(
        `M${r2(c[0] - s * 1)} ${r2(c[1] - 3.4 * k)}Q${r2(c[0] + s * 3.8 * k)} ${r2(c[1])} ${r2(c[0])} ${r2(c[1] + 3.4 * k)}Q${r2(c[0] + s * 1.4 * k)} ${r2(c[1])} ${r2(c[0] - s * 1)} ${r2(c[1] - 3.4 * k)}Z`,
        C.ear,
        0.7,
      );
    });
    const nose = q([0, 3.8]);
    const mouth = q([0, 7]);
    return g(
      {},
      ...ears,
      furShape(smoothD(skull, true, 1), [
        furStrokes(
          rnd,
          { x0: o.at[0] - 10, y0: o.at[1] - 22, x1: o.at[0] + 10, y1: o.at[1] },
          [0, -1],
          8,
          C.furShade,
          0.5,
          2.4,
        ),
      ]),
      fill(smoothD(face, true, 1), 'url(#cream)'),
      ...eyes,
      fill(ellipseD(nose[0], nose[1], 2.4 * k, 1.8 * k), C.nose),
      o.mouth === true ? fill(ellipseD(mouth[0], mouth[1], 2.2 * k, 2 * k), C.mouth) : '',
    );
  }
  const T = (pts: readonly P[]): P[] => place(pts, o.at, o.tilt, k, o.dir);
  const skull = T([
    [-6, -2],
    [-7, -10],
    [-2, -15],
    [6, -14],
    [13, -9],
    [20, -4],
    [24, -1.5],
    [23, 1],
    [16, 2.5],
    [8, 3.5],
    [0, 4],
  ]);
  const face = T([
    [2, -4],
    [9, -7],
    [16, -5],
    [23, -1.5],
    [22, 1],
    [15, 2.4],
    [6, 3.4],
    [0, 2],
  ]);
  const q = (p: P): P => T([p])[0] ?? o.at;
  // The mask: a dark teardrop round the eye, pointing down the snout.
  const mask = T([
    [3, -8.5],
    [8.5, -10],
    [13, -7],
    [15.5, -4.6],
    [11, -4],
    [5, -4.6],
  ]);
  const eye = q([8.8, -7.4]);
  const glint = q([8.2, -8.1]);
  const ear = q([-2.4, -9.6]);
  const nose = q([23.2, -0.6]);
  const jaw = q([17, 3.2]);
  const earD = (() => {
    const a = q([-4.4, -12.4]);
    const b = q([-0.6, -6.4]);
    const c1 = q([-7.6, -10]);
    const c2 = q([-3.4, -9.4]);
    return `M${r2(a[0])} ${r2(a[1])}Q${r2(c1[0])} ${r2(c1[1])} ${r2(b[0])} ${r2(b[1])}Q${r2(c2[0])} ${r2(c2[1])} ${r2(a[0])} ${r2(a[1])}Z`;
  })();
  return g(
    {},
    furShape(smoothD(skull, true, 1), [
      furStrokes(
        rnd,
        { x0: o.at[0] - 8, y0: o.at[1] - 15, x1: o.at[0] + 14, y1: o.at[1] },
        [o.dir, -0.3],
        8,
        C.furShade,
        0.5,
        2.4,
      ),
    ]),
    fill(smoothD(face, true, 1), 'url(#cream)'),
    fill(smoothD(mask, true, 1), C.mask),
    fill(ellipseD(eye[0], eye[1], 1.7 * k, 1.7 * k), C.eye),
    fill(ellipseD(glint[0], glint[1], 0.8 * k, 0.8 * k), C.glint),
    inked(earD, C.ear, 0.6),
    fill(ellipseD(ear[0], ear[1], 0.6 * k, 0.6 * k), C.furShade),
    fill(ellipseD(nose[0], nose[1], 2.1 * k, 1.8 * k), C.nose),
    o.mouth === true ? fill(ellipseD(jaw[0], jaw[1] + 0.6 * k, 3 * k, 2 * k), C.mouth) : '',
  );
}

// --- poses ---------------------------------------------------------------------------------------

/** Standing tall (the sentinel and a dash's halfway stop): chin up, paws together at the belly. */
function upright(look: -1 | 0 | 1, seed: number, opts: { mouth?: boolean } = {}): string {
  const t = torso({
    hip: [-3, -22],
    mid: [-3, -58],
    chest: [2, -92],
    back: [15, 13, 9],
    belly: [10, 12, 9],
    seed,
  });
  const view = look === 0 ? 'front' : 'side';
  const dir: 1 | -1 = look < 0 ? -1 : 1;
  const neck = torso({
    hip: [1, -86],
    mid: [3, -96],
    chest: [4, -104],
    back: [8, 7, 6],
    belly: [7, 6, 5],
    seed: seed + 1,
    bands: 0,
  });
  return g(
    {},
    shadow(24),
    // The tail rests on the sand behind, a prop for standing tall.
    tail([-10, -10], [-30, 0], [-56, -3], 5),
    limb([-6, -16], [-8, -6], [-3, -1], 11, 5),
    inked(ellipseD(5, -1.6, 9, 2.8), C.furMid, 0.9),
    neck.art,
    t.art,
    thigh([-4, -20], 9, 14, 8, seed + 5),
    // Forearms down from the shoulders; the paws together in front of the belly.
    limb([8, -82], [13, -72], [10, -63], 5.4, 3.6),
    limb([2, -82], [9, -70], [6, -62], 5.4, 3.6),
    paw([8.4, -61], 1, 20),
    paw([11.6, -62.6], 1, 10),
    head({
      at: view === 'front' ? [3, -102] : [dir > 0 ? 2 : 6, -104],
      tilt: view === 'front' ? 0 : -16,
      view,
      dir,
      seed: seed + 2,
      ...(opts.mouth === true ? { mouth: true } : {}),
    }),
  );
}

/** Front-facing, for the photo row: symmetric, paws together, looking at the camera. */
function front(seed: number, opts: { mouth?: boolean } = {}): string {
  const rnd = prng(seed);
  const body: P[] = [
    [-9, -1],
    [-15, -18],
    [-17, -44],
    [-15, -70],
    [-10, -90],
    [-6, -98],
    [6, -98],
    [10, -90],
    [15, -70],
    [17, -44],
    [15, -18],
    [9, -1],
  ];
  const cream: P[] = [
    [-7, -8],
    [-10, -40],
    [-8, -78],
    [-4, -96],
    [4, -96],
    [8, -78],
    [10, -40],
    [7, -8],
  ];
  const d = smoothD(body, true, 1);
  return g(
    {},
    shadow(22),
    tail([10, -6], [26, 0], [44, -2], 4.6),
    inked(ellipseD(-6, -1.6, 7, 2.6), C.furMid, 0.9),
    inked(ellipseD(6, -1.6, 7, 2.6), C.furMid, 0.9),
    furShape(d, [
      fill(smoothD(cream, true, 1), 'url(#cream)'),
      furStrokes(rnd, { x0: -16, y0: -96, x1: 16, y1: -4 }, [0, 1], 22, C.furShade, 0.45),
    ]),
    limb([-9, -84], [-12, -72], [-3, -64], 5.4, 3.6),
    limb([9, -84], [12, -72], [3, -64], 5.4, 3.6),
    paw([-2, -63], 1, 80),
    paw([2, -63], 1, 100),
    head({
      at: [0, -100],
      tilt: 0,
      view: 'front',
      dir: 1,
      seed: seed + 2,
      ...(opts.mouth === true ? { mouth: true } : {}),
    }),
  );
}

/** Sitting on its haunches, leaning forward, front paws down. */
function sit(seed: number, k = 1, fluffy = false): string {
  const t = torso({
    hip: [-10, -16],
    mid: [0, -30],
    chest: [12, -42],
    back: [15, 13, 9],
    belly: [10, 11, 8],
    seed,
    fluffy,
    bands: fluffy ? 3 : 5,
  });
  return g(
    { transform: k === 1 ? '' : `scale(${k})` },
    shadow(26),
    tail([-18, -6], [-36, 0], [-56, -2], 4.6),
    limb([12, -34], [16, -18], [18, -1.5], 5.4, 3.6),
    limb([-12, -14], [-6, -4], [2, -1], 12, 5),
    t.art,
    thigh([-8, -14], 12, 10, -20, seed + 5),
    limb([16, -36], [20, -18], [23, -1.5], 5.4, 3.6),
    paw([24, -1.6], 1, 0),
    head({ at: [14, -46], tilt: -6, view: 'side', dir: 1, k: fluffy ? 1.5 : 1, seed: seed + 2 }),
  );
}

/** Sitting back on its haunches, belly to the sun, arms hanging, chin up. */
function sunbathe(seed: number): string {
  const t = torso({
    hip: [-4, -12],
    mid: [-6, -36],
    chest: [-12, -60],
    back: [13, 12, 9],
    belly: [11, 13, 9],
    seed,
  });
  return g(
    {},
    shadow(26),
    tail([-10, -6], [-30, 0], [-52, -2], 4.6),
    limb([-4, -10], [6, -4], [14, -1.5], 11, 5),
    t.art,
    thigh([-2, -12], 12, 9, -10, seed + 5),
    limb([-6, -54], [4, -46], [8, -36], 5, 3.4),
    paw([8.6, -35], 0.9, 70),
    head({ at: [-10, -66], tilt: -38, view: 'side', dir: 1, seed: seed + 2 }),
  );
}

/** Digging: rump up, head down, front paws scraping at the sand. */
function dig(phase: 0 | 1, seed: number): string {
  const reach = phase === 0 ? 0 : 5;
  const t = torso({
    hip: [-14, -28],
    mid: [0, -30],
    chest: [14, -20],
    back: [14, 13, 10],
    belly: [10, 11, 8],
    seed,
  });
  return g(
    {},
    shadow(30),
    tail([-24, -32], [-40, -30], [-56, -16], 4.6),
    limb([-14, -22], [-18, -10], [-12, -1], 11, 5),
    t.art,
    thigh([-13, -24], 10, 11, 20, seed + 5),
    limb([14, -18], [22 + reach, -10], [26 + reach, -1.5], 5.4, 3.6),
    paw([28 + reach, -1.8], 1, 10),
    head({ at: [18, -22], tilt: 34, view: 'side', dir: 1, seed: seed + 2 }),
  );
}

/** Running: the body low and stretched, the tail up; four phases of the gallop. */
function run(phase: number, seed: number, k = 1, fluffy = false): string {
  const lift = [0, 2.5, 1, 3][phase % 4] ?? 0;
  const reachF = [8, 2, -4, 4][phase % 4] ?? 0;
  const reachH = [-6, 2, 8, -2][phase % 4] ?? 0;
  const y = -24 - lift;
  const t = torso({
    hip: [-22, y],
    mid: [0, y - 3],
    chest: [20, y - 1],
    back: [11, 10, 8],
    belly: [9, 9, 8],
    seed,
    fluffy,
    bands: fluffy ? 3 : 6,
  });
  return g(
    { transform: k === 1 ? '' : `scale(${k})` },
    shadow(30),
    // The tail up behind, curving high, its black tip at the top.
    tail([-28, y - 4], [-46, y - 18], [-42, y - 48], 4.4),
    limb([-20, y + 6], [-22 + reachH, y + 14], [-18 + reachH * 1.4, -1], 8, 3.6, C.furMid),
    limb([16, y + 6], [18 + reachF, y + 14], [20 + reachF * 1.4, -1], 5, 3.2, C.furMid),
    t.art,
    limb([-16, y + 4], [-14 - reachH, y + 14], [-10 - reachH * 1.2, -1], 9, 3.8),
    thigh([-16, y + 2], 9, 8, 10 + reachH * 2, seed + 5),
    limb([20, y + 6], [24 - reachF, y + 14], [26 - reachF * 1.2, -1], 5.4, 3.4),
    head({ at: [24, y - 4], tilt: -4, view: 'side', dir: 1, k: fluffy ? 1.5 : 1, seed: seed + 2 }),
  );
}

/** Head first into the hole: the hindquarters and tail still up (a), then only the tail (b). */
function dive(stage: 0 | 1, seed: number): string {
  const sink = stage === 0 ? 0 : 26;
  const t = torso({
    hip: [-2, -30 + sink],
    mid: [0, -14 + sink],
    chest: [2, 6 + sink],
    back: [13, 12, 10],
    belly: [10, 10, 9],
    seed,
    bands: 3,
  });
  return g(
    {},
    tail([-2, -36 + sink], [-14, -54 + sink], [-6, -70 + sink], 4.6),
    limb([-6, -28 + sink], [-16, -26 + sink], [-20, -18 + sink], 8, 4),
    t.art,
  );
}

/** A ball of fur rolling into the hole (the view spins it). */
function tumble(seed: number): string {
  const rnd = prng(seed);
  const d = smoothD(
    [
      [-18, -20],
      [-12, -38],
      [4, -42],
      [17, -32],
      [18, -14],
      [4, -4],
      [-12, -6],
    ],
    true,
    1,
  );
  return g(
    {},
    tail([-14, -28], [-30, -44], [-10, -52], 4.4),
    furShape(d, [
      fill(ellipseD(4, -22, 8, 10), 'url(#cream)'),
      furStrokes(rnd, { x0: -18, y0: -42, x1: 18, y1: -4 }, [0.6, 0.8], 18, C.furShade, 0.5),
    ]),
    limb([10, -14], [16, -8], [14, -3], 5, 3.4),
    head({ at: [10, -28], tilt: 80, view: 'side', dir: 1, seed: seed + 2 }),
  );
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
      return rim(front(seed, { mouth: true }), 64);
    case 'emerge':
      return rim(upright(1, seed), 44);
    case 'tumble':
      return tumble(seed);
    case 'pup_sit':
      return sit(seed, 0.62, true);
    case 'pup_run_a':
      return run(0, seed, 0.62, true);
    case 'pup_run_b':
      return run(2, seed, 0.62, true);
    case 'flick':
      return flick(seed);
  }
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
