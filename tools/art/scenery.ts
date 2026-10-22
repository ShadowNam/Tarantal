// Shared scenery shapes for the interim landscapes and props (D-031): flat-topped mesas, koppies,
// karoo bossies, grass, stones, fences, tracks and clouds, as SVG strings in the bible's "inked
// Bosveld comic" style (§1): warm-black ink, flat fill + one shadow + one highlight, light from
// the upper left. Pure functions of their arguments and a seeded PRNG, so output never changes
// between runs.
import { el, ellipseD, g, inked, polyD, r2, smoothD } from './svg';

export type Pt = readonly [number, number];

let uid = 0;
/** Unique clip-path ids within one SVG document (reset per document: deterministic). */
export function nextId(): string {
  uid++;
  return `z${uid}`;
}
export function resetIds(): void {
  uid = 0;
}
export type Rnd = () => number;

/** Colour arithmetic on #RRGGBB. */
function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
function hexOf([r, gg, b]: readonly number[]): string {
  return `#${[r, gg, b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v ?? 0)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;
}
/** a → b by t (0 = a). Aerial perspective: mix toward the horizon colour. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return hexOf(x.map((v, i) => v + ((y[i] ?? 0) - v) * t));
}
/** Darker (k < 0, toward a warm shadow) or lighter (k > 0, toward warm white). */
export function shade(hex: string, k: number): string {
  return k < 0 ? mix(hex, '#2A1A22', -k) : mix(hex, '#FFF4DC', k);
}

/** The tones of one surface: fill, its one shadow and its one highlight (bible §1 rule 2). */
export interface Tone {
  readonly fill: string;
  readonly dark: string;
  readonly light: string;
}
export const tone = (fill: string, dark = 0.22, light = 0.28): Tone => ({
  fill,
  dark: shade(fill, -dark),
  light: shade(fill, light),
});

/** Line style of one depth plane (bible §1 rule 4: 6 / 4 / 2 px, far ink tinted). */
export interface Pen {
  readonly ink: string;
  readonly w: number;
}

const stroke = (pen: Pen, w = pen.w): Record<string, string | number> => ({
  fill: 'none',
  stroke: pen.ink,
  'stroke-width': w,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
});

/** An open ink line (no fill). */
export function line(d: string, pen: Pen, w = pen.w, extra: Record<string, string> = {}): string {
  return el('path', { d, ...stroke(pen, w), ...extra });
}

/** A flat fill without outline. */
export const flat = (d: string, fill: string, extra: Record<string, string | number> = {}) =>
  el('path', { d, fill, ...extra });

/** A rolling ground edge from x0 to x1 around y (closed down to `bottom`). */
export function groundD(
  rnd: Rnd,
  x0: number,
  x1: number,
  y: number,
  amp: number,
  step: number,
  bottom: number,
): string {
  const pts: Pt[] = [];
  for (let x = x0; x <= x1 + step; x += step) pts.push([x, y + (rnd() - 0.5) * amp * 2]);
  const top = smoothD(pts, false, 0.8);
  return `${top}L${r2(x1 + step)} ${r2(bottom)}L${r2(x0)} ${r2(bottom)}Z`;
}

/** Same edge as a list of points (to stroke the top only, or to place things on it). */
export function edgePts(rnd: Rnd, x0: number, x1: number, y: number, amp: number, step: number) {
  const pts: Pt[] = [];
  for (let x = x0; x <= x1 + step; x += step) pts.push([x, y + (rnd() - 0.5) * amp * 2]);
  return pts;
}

/** y of a polyline at x (linear between points). */
export function yAt(pts: readonly Pt[], x: number): number {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a === undefined || b === undefined) continue;
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / Math.max(1e-6, b[0] - a[0]);
  }
  return pts.at(-1)?.[1] ?? 0;
}

/**
 * A flat-topped dolerite mesa (Karoo, bible §2 `1.jpeg`): concave talus slopes, a cliff band of
 * darker cap rock with vertical joints, a flat top. Lit from the left; the right third in shadow.
 */
export function mesa(
  rnd: Rnd,
  x: number,
  base: number,
  w: number,
  h: number,
  t: Tone,
  cap: string,
  pen: Pen,
): string {
  const top = base - h;
  const capH = h * (0.16 + rnd() * 0.08);
  const l = x + w * (0.2 + rnd() * 0.06);
  const r = x + w * (0.78 + rnd() * 0.05);
  const wob = (k: number) => (rnd() - 0.5) * k;
  const outline: Pt[] = [
    [x, base],
    [x + w * 0.1, base - h * 0.18],
    [l - w * 0.03, top + capH + h * 0.12],
    [l, top + capH],
    [l + w * 0.01, top + wob(3)],
    [(l + r) / 2, top + wob(4)],
    [r, top + wob(3)],
    [r + w * 0.015, top + capH],
    [r + w * 0.05, top + capH + h * 0.14],
    [x + w * 0.9, base - h * 0.16],
    [x + w, base],
  ];
  const body = polyD(outline);
  const shadow = polyD([
    [(l + r) / 2 + w * 0.12, top],
    [r, top],
    [r + w * 0.015, top + capH],
    [r + w * 0.05, top + capH + h * 0.14],
    [x + w * 0.9, base - h * 0.16],
    [x + w, base],
    [x + w * 0.62, base],
    [r - w * 0.04, top + capH + h * 0.2],
  ]);
  const capBand = polyD([
    [l, top + capH],
    [l + w * 0.01, top],
    [r, top],
    [r + w * 0.015, top + capH],
  ]);
  const lit = polyD([
    [x + w * 0.04, base],
    [x + w * 0.11, base - h * 0.2],
    [l - w * 0.02, top + capH + h * 0.12],
    [l + w * 0.05, top + capH + h * 0.18],
    [x + w * 0.2, base],
  ]);
  const joints: string[] = [];
  for (let k = l + 12 + rnd() * 10; k < r - 8; k += 14 + rnd() * 20)
    joints.push(line(`M${r2(k)} ${r2(top + 3)}l${r2(wob(3))} ${r2(capH - 5)}`, pen, pen.w * 0.6));
  const id = nextId();
  return g(
    {},
    el('clipPath', { id }, el('path', { d: body })),
    flat(body, t.fill),
    g(
      { 'clip-path': `url(#${id})` },
      flat(lit, t.light),
      flat(capBand, cap),
      flat(shadow, t.dark, { opacity: 0.9 }),
      ...joints,
    ),
    el('path', { d: body, ...stroke(pen) }),
  );
}

/** A conical koppie of piled boulders (lit left). */
export function koppie(
  rnd: Rnd,
  x: number,
  base: number,
  w: number,
  h: number,
  t: Tone,
  pen: Pen,
): string {
  const pts: Pt[] = [[x, base]];
  const n = 7;
  for (let k = 1; k < n; k++) {
    const f = k / n;
    const bump = Math.sin(f * Math.PI);
    pts.push([x + w * f, base - h * Math.pow(bump, 0.8) * (0.85 + rnd() * 0.25)]);
  }
  pts.push([x + w, base]);
  const body = smoothD(pts, true, 0.6);
  const id = nextId();
  const boulders: string[] = [];
  for (let k = 0; k < 5; k++) {
    const bx = x + w * (0.25 + rnd() * 0.5);
    const by = base - h * (0.2 + rnd() * 0.5);
    boulders.push(line(`M${r2(bx - 10)} ${r2(by)}q10 -8 20 0`, pen, pen.w * 0.7));
  }
  return g(
    {},
    el('clipPath', { id }, el('path', { d: body })),
    flat(body, t.fill),
    g(
      { 'clip-path': `url(#${id})` },
      flat(ellipseD(x + w * 0.78, base - h * 0.2, w * 0.38, h * 0.95), t.dark),
      flat(ellipseD(x + w * 0.3, base - h * 0.55, w * 0.12, h * 0.25), t.light),
      ...boulders,
    ),
    el('path', { d: body, ...stroke(pen) }),
  );
}

/**
 * A karoo bossie: a low, rounded dwarf shrub built from overlapping lobes (ink round the
 * silhouette only), shadow lower right, highlights top left. s = size (≈ half-width px).
 */
export function bossie(rnd: Rnd, x: number, y: number, s: number, t: Tone, pen: Pen): string {
  const lobes: [number, number, number][] = [];
  const n = 6 + Math.floor(rnd() * 4);
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1) - 0.5; // −0.5 … 0.5 across
    const lx = x + f * s * 1.5 + (rnd() - 0.5) * s * 0.15;
    const ly = y - s * 0.32 - Math.cos(f * Math.PI) * s * 0.38 + (rnd() - 0.5) * s * 0.12;
    lobes.push([lx, ly, s * (0.3 + rnd() * 0.14) * (1 - Math.abs(f) * 0.35)]);
  }
  for (let k = 0; k < 3; k++)
    lobes.push([
      x + (rnd() - 0.5) * s * 0.8,
      y - s * 0.55 - rnd() * s * 0.15,
      s * (0.3 + rnd() * 0.1),
    ]);
  lobes.push([x, y - s * 0.12, s * 0.6]);
  const body = lobes.map(([lx, ly, r]) => ellipseD(lx, ly, r, r * 0.9)).join('');
  const id = nextId();
  return g(
    {},
    flat(ellipseD(x + s * 0.15, y + s * 0.02, s * 0.95, s * 0.14), t.dark, { opacity: 0.5 }),
    el('path', {
      d: body,
      fill: pen.ink,
      stroke: pen.ink,
      'stroke-width': pen.w * 2,
      'stroke-linejoin': 'round',
    }),
    el('clipPath', { id }, el('path', { d: body })),
    flat(body, t.fill),
    g(
      { 'clip-path': `url(#${id})` },
      flat(ellipseD(x + s * 0.5, y + s * 0.05, s * 0.85, s * 0.5), t.dark),
      ...lobes
        .filter(([lx, , r]) => lx < x + s * 0.2 && r > s * 0.25)
        .slice(0, 3)
        .map(([lx, ly, r]) =>
          flat(ellipseD(lx - r * 0.3, ly - r * 0.4, r * 0.4, r * 0.22), t.light),
        ),
      ...Array.from({ length: Math.round(s / 5) }, () =>
        flat(ellipseD(x + (rnd() - 0.4) * s * 1.3, y - rnd() * s * 0.7, 1.4, 1.4), t.dark),
      ),
    ),
  );
}

/**
 * A tuft of grass blades rising from (x, y), height h. The ink goes round the tuft's silhouette
 * only (a wide ink stroke under the fill), so thin blades stay coloured, not black.
 */
export function tuft(
  rnd: Rnd,
  x: number,
  y: number,
  h: number,
  t: Tone,
  pen: Pen,
  blades = 7,
): string {
  const half = h * 0.3;
  const back: string[] = [];
  const front: string[] = [];
  for (let k = 0; k < blades; k++) {
    const f = k / (blades - 1) - 0.5;
    const bx = x + f * half * 1.3;
    const lean = f * h * 0.75 + (rnd() - 0.5) * h * 0.3;
    const hh = h * (0.62 + rnd() * 0.38) * (1 - Math.abs(f) * 0.45);
    const w = Math.max(2.5, h * 0.085);
    const tipX = bx + lean;
    const tipY = y - hh;
    const d = `M${r2(bx - w)} ${r2(y + 2)}Q${r2(bx + lean * 0.25 - w * 0.5)} ${r2(y - hh * 0.55)} ${r2(tipX)} ${r2(tipY)}Q${r2(bx + lean * 0.3 + w * 0.7)} ${r2(y - hh * 0.5)} ${r2(bx + w)} ${r2(y + 2)}Z`;
    (k % 2 === 0 ? back : front).push(d);
  }
  const all = back.join('') + front.join('');
  return g(
    {},
    el('path', {
      d: all,
      fill: pen.ink,
      stroke: pen.ink,
      'stroke-width': pen.w * 1.6,
      'stroke-linejoin': 'round',
    }),
    el('path', { d: back.join(''), fill: t.dark }),
    el('path', { d: front.join(''), fill: t.fill }),
    el('path', {
      d: front.join(''),
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': Math.max(1, pen.w * 0.35),
      'stroke-linejoin': 'round',
    }),
  );
}

/** A stone half sunk in the ground, lit top left. */
export function stone(rnd: Rnd, x: number, y: number, r: number, t: Tone, pen: Pen): string {
  const pts: Pt[] = [];
  const n = 7;
  for (let k = 0; k < n; k++) {
    const a = Math.PI + (k / (n - 1)) * Math.PI;
    pts.push([x + Math.cos(a) * r * (0.85 + rnd() * 0.3), y + Math.sin(a) * r * 0.7]);
  }
  pts.push([x + r, y + r * 0.12], [x - r, y + r * 0.12]);
  const body = smoothD(pts, true, 0.5);
  const id = nextId();
  return g(
    {},
    el('clipPath', { id }, el('path', { d: body })),
    flat(body, t.fill),
    g(
      { 'clip-path': `url(#${id})` },
      flat(ellipseD(x + r * 0.5, y + r * 0.1, r * 0.75, r * 0.6), t.dark),
      flat(ellipseD(x - r * 0.35, y - r * 0.45, r * 0.32, r * 0.16), t.light),
    ),
    el('path', { d: body, ...stroke(pen) }),
  );
}

/** A wooden fence post (lit left), top at y − h. */
export function post(x: number, y: number, h: number, w: number, t: Tone, pen: Pen): string {
  const d = polyD([
    [x - w / 2, y],
    [x - w / 2 + 1, y - h + 2],
    [x, y - h - 2],
    [x + w / 2 - 1, y - h + 1],
    [x + w / 2, y],
  ]);
  return g(
    {},
    flat(d, t.fill),
    flat(
      polyD([
        [x + w * 0.1, y],
        [x + w * 0.1, y - h],
        [x + w / 2, y - h + 1],
        [x + w / 2, y],
      ]),
      t.dark,
    ),
    el('path', { d, ...stroke(pen) }),
  );
}

/** A sagging wire between posts (ink, thin). */
export function wire(points: readonly Pt[], sag: number, pen: Pen, w: number): string {
  let d = '';
  points.forEach(([x, y], i) => {
    if (i === 0) {
      d += `M${r2(x)} ${r2(y)}`;
      return;
    }
    const prev = points[i - 1];
    if (prev === undefined) return;
    d += `Q${r2((prev[0] + x) / 2)} ${r2((prev[1] + y) / 2 + sag)} ${r2(x)} ${r2(y)}`;
  });
  return line(d, pen, w);
}

/**
 * A flat comic cumulus: bumpy top, flat base, a shadow band along the base and a highlight on the
 * top-left lobes. Thin ink (pen) or none.
 */
export function cloud(
  rnd: Rnd,
  x: number,
  y: number,
  w: number,
  h: number,
  t: Tone,
  pen: Pen | null,
): string {
  const pts: Pt[] = [[x + w, y]];
  const bumps = 3 + Math.floor(rnd() * 3);
  for (let k = 0; k <= bumps; k++) {
    const f = 1 - k / bumps;
    const bh = h * (0.45 + Math.sin(f * Math.PI) * 0.55) * (0.8 + rnd() * 0.35);
    pts.push([x + w * f, y - bh]);
    if (k < bumps) pts.push([x + w * (f - 0.5 / bumps), y - bh * 0.72 - h * 0.12]);
  }
  pts.push([x, y]);
  const body = smoothD(pts, true, 1);
  const id = nextId();
  return g(
    {},
    el('clipPath', { id }, el('path', { d: body })),
    flat(body, t.fill),
    g(
      { 'clip-path': `url(#${id})` },
      flat(ellipseD(x + w * 0.55, y + h * 0.05, w * 0.6, h * 0.3), t.dark),
      flat(ellipseD(x + w * 0.3, y - h * 0.62, w * 0.16, h * 0.18), t.light),
    ),
    pen === null ? '' : el('path', { d: body, ...stroke(pen) }),
  );
}

/** A tree-line blob (distant bluegums / thorn trees): rounded crown on a short trunk. */
export function treeBlob(
  rnd: Rnd,
  x: number,
  y: number,
  w: number,
  h: number,
  t: Tone,
  trunk: string,
  pen: Pen,
): string {
  const trunkD = polyD([
    [x - w * 0.05, y],
    [x - w * 0.03, y - h * 0.45],
    [x + w * 0.03, y - h * 0.45],
    [x + w * 0.05, y],
  ]);
  const pts: Pt[] = [];
  const n = 9;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const rr = 0.85 + rnd() * 0.3;
    pts.push([x + Math.cos(a) * (w / 2) * rr, y - h * 0.62 + Math.sin(a) * h * 0.38 * rr]);
  }
  const crown = smoothD(pts, true, 1);
  const id = nextId();
  return g(
    {},
    inked(trunkD, trunk, pen.ink, pen.w),
    el('clipPath', { id }, el('path', { d: crown })),
    flat(crown, t.fill),
    g(
      { 'clip-path': `url(#${id})` },
      flat(ellipseD(x + w * 0.25, y - h * 0.45, w * 0.45, h * 0.35), t.dark),
      flat(ellipseD(x - w * 0.18, y - h * 0.82, w * 0.16, h * 0.1), t.light),
    ),
    el('path', { d: crown, ...stroke(pen) }),
  );
}

/** Short dry-grass hatching strokes scattered over a band (texture that compresses well). */
export function hatch(
  rnd: Rnd,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  count: number,
  len: number,
  colour: string,
  w: number,
): string {
  let d = '';
  for (let k = 0; k < count; k++) {
    const x = x0 + rnd() * (x1 - x0);
    const y = y0 + rnd() * (y1 - y0);
    const l = len * (0.6 + rnd() * 0.8);
    d += `M${r2(x)} ${r2(y)}l${r2(l * 0.25)} ${r2(-l)}M${r2(x + 3)} ${r2(y)}l${r2(-l * 0.2)} ${r2(-l * 0.8)}`;
  }
  return el('path', {
    d,
    fill: 'none',
    stroke: colour,
    'stroke-width': w,
    'stroke-linecap': 'round',
  });
}
