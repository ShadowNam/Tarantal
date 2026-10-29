// v1.7e (D-061): the Bushveld's winter ground without cartoon edges: a natural edge between
// planes (a lit crest, soft shade below it, grass breaking over it) instead of an ink line;
// patches of bare red earth and pale grass with soft edges; a game path; termite mounds.
// Pure: (rnd, arguments) → SVG.
import { blurFilter, ringNoise } from './camelthorn';
import { mix, nextId, shade, type Pt, type Rnd } from './scenery';
import { el, ellipseD, g, r2, smoothD } from './svg';

/** Shifted copy of an edge. */
const shifted = (edge: readonly Pt[], dy: number): Pt[] => edge.map(([x, y]): Pt => [x, y + dy]);

/**
 * The plane's top edge: `inside` goes into the band's clip (a lit crest, then soft shade), `over`
 * after the band (grass blades breaking over the edge). `s` scales it per plane.
 */
export function naturalEdge(
  rnd: Rnd,
  edge: readonly Pt[],
  s: number,
  c: { readonly lit: string; readonly shade: string; readonly grass: readonly string[] },
): { inside: string; over: string } {
  // A lit crest just under the edge (crisp: a blurred band costs palette entries and bytes).
  const inside = el('path', {
    d: smoothD(shifted(edge, s * 1.1), false, 0.8),
    fill: 'none',
    stroke: c.lit,
    'stroke-width': r2(Math.max(1, s * 1.4)),
    opacity: 0.55,
  });
  // Grass blades along the edge, in clumps, rising over it.
  const bins: string[][] = c.grass.map(() => []);
  const first = edge[0] as Pt;
  const last = edge.at(-1) as Pt;
  for (let x = first[0]; x < last[0];) {
    const clump = 3 + Math.floor(rnd() * 8);
    const y = yOn(edge, x) + s * (0.6 + rnd() * 1.2);
    for (let b = 0; b < clump; b++) {
      const bx = x + (rnd() - 0.5) * s * 4;
      const bh = s * (1.5 + rnd() * 3.5);
      const lean = (rnd() - 0.5) * bh * 0.7;
      bins[Math.floor(rnd() * bins.length)]?.push(
        `M${r2(bx)} ${r2(y)}q${r2(lean * 0.3)} ${r2(-bh * 0.6)} ${r2(lean)} ${r2(-bh)}`,
      );
    }
    x += s * (4 + rnd() * 16);
  }
  const over = g(
    {},
    ...bins.map((ds, i) =>
      el('path', {
        d: ds.join(''),
        fill: 'none',
        stroke: c.grass[i] ?? c.lit,
        'stroke-width': r2(Math.max(0.6, s * 0.45)),
        'stroke-linecap': 'round',
      }),
    ),
  );
  return { inside, over };
}

function yOn(pts: readonly Pt[], x: number): number {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Pt;
    const b = pts[i] as Pt;
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / Math.max(1e-6, b[0] - a[0]);
  }
  return (pts.at(-1) as Pt)[1];
}

/** A soft-edged, flattened, lumpy patch (bare earth, pale or dark grass) of `fill`. */
export function patch(
  rnd: Rnd,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
  opacity: number,
): string {
  const n = ringNoise(rnd, 2, 7, 0.6);
  const pts: Pt[] = [];
  for (let k = 0; k < 18; k++) {
    const t = (k / 18) * Math.PI * 2;
    const r = 1 + n(t) * 0.35;
    pts.push([x + Math.cos(t) * rx * r, y + Math.sin(t) * ry * r]);
  }
  // No blur: a soft edge costs many palette entries and bytes (D-061 size note).
  return g(
    {},
    el('path', {
      d: smoothD(pts, true, 0.7),
      fill,
      opacity: r2(opacity),
    }),
  );
}

/**
 * A game path: a narrow bare trail winding from (x0, y0) toward the viewer at (x1, y1), wider
 * as it comes nearer, its edges softened, small stones and hoof-worn darker ruts along it.
 */
export function gamePath(
  rnd: Rnd,
  from: Pt,
  to: Pt,
  w0: number,
  w1: number,
  c: { readonly earth: string; readonly dark: string },
): string {
  const n = 14;
  const mid: Pt[] = [];
  const wig = ringNoise(rnd, 1, 4, 1);
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    const x = from[0] + (to[0] - from[0]) * f + wig(f * 5) * 40 * (0.3 + f);
    const y = from[1] + (to[1] - from[1]) * f;
    mid.push([x, y]);
  }
  const left: Pt[] = [];
  const right: Pt[] = [];
  mid.forEach(([x, y], k) => {
    const hw = (w0 + (w1 - w0) * (k / n)) / 2;
    left.push([x - hw, y]);
    right.push([x + hw, y]);
  });
  const d = smoothD([...left, ...right.reverse()], true, 0.7);
  const blur = blurFilter(Math.max(0.8, w1 * 0.08));
  const ruts = smoothD(mid, false, 0.7);
  return g(
    {},
    blur.def,
    el('path', { d, fill: c.earth, opacity: 0.75 }),
    el('path', {
      d: ruts,
      fill: 'none',
      stroke: c.dark,
      'stroke-width': r2(Math.max(1, w1 * 0.12)),
      opacity: 0.25,
      filter: `url(#${blur.id})`,
    }),
  );
}

/**
 * A termite mound: a lumpy cone of red earth with a chimney or two, lit from the left, erosion
 * runnels, grass round its foot and a soft contact shadow. Stands on (x, y), `h` tall.
 */
export function termiteMound(
  rnd: Rnd,
  x: number,
  y: number,
  h: number,
  c: { readonly earth: string; readonly grass: string },
): string {
  const w = h * (1.1 + rnd() * 0.5);
  const lit = shade(c.earth, 0.28);
  const dark = shade(c.earth, -0.35);
  const n = ringNoise(rnd, 3, 9, 0.5);
  const pts: Pt[] = [[x - w * 0.62, y]];
  for (let k = 1; k < 12; k++) {
    const f = k / 12;
    const t = Math.sin(f * Math.PI);
    pts.push([x - w * 0.62 + f * w * 1.24, y - h * Math.pow(t, 1.8) * (1 + n(f * 6) * 0.25)]);
  }
  pts.push([x + w * 0.62, y]);
  // A chimney on the top.
  const cx = x + (rnd() - 0.5) * w * 0.2;
  const chimney: Pt[] = [
    [cx - w * 0.1, y - h * 0.85],
    [cx - w * 0.05, y - h * 1.15],
    [cx + w * 0.04, y - h * 1.2],
    [cx + w * 0.1, y - h * 0.85],
  ];
  const d = smoothD(pts, true, 0.6);
  const grad = nextId();
  const shadowBlur = blurFilter(Math.max(1, h * 0.06));
  const runnels: string[] = [];
  for (let k = 0; k < 5; k++) {
    const rx = x + (rnd() - 0.5) * w * 0.8;
    runnels.push(
      `M${r2(rx)} ${r2(y - h * (0.4 + rnd() * 0.4))}q${r2((rnd() - 0.5) * 4)} ${r2(h * 0.2)} ${r2((rnd() - 0.5) * 6)} ${r2(h * 0.4)}`,
    );
  }
  const blades: string[] = [];
  for (let k = 0; k < Math.round(w / 2); k++) {
    const bx = x + (rnd() - 0.5) * w * 1.4;
    const bh = h * (0.08 + rnd() * 0.14);
    blades.push(`M${r2(bx)} ${r2(y + 1)}l${r2((rnd() - 0.5) * bh * 0.6)} ${r2(-bh)}`);
  }
  return g(
    {},
    shadowBlur.def,
    el('path', {
      d: ellipseD(x + w * 0.2, y, w * 0.75, Math.max(2, h * 0.08)),
      fill: '#231B16',
      opacity: 0.32,
      filter: `url(#${shadowBlur.id})`,
    }),
    el(
      'linearGradient',
      { id: grad, x1: 0, y1: 0, x2: 1, y2: 0.3 },
      el('stop', { offset: 0, 'stop-color': lit }),
      el('stop', { offset: 0.5, 'stop-color': c.earth }),
      el('stop', { offset: 1, 'stop-color': dark }),
    ),
    el('path', { d: smoothD(chimney, true, 0.6), fill: mix(c.earth, dark, 0.3) }),
    el('path', { d, fill: `url(#${grad})` }),
    el('path', {
      d: runnels.join(''),
      fill: 'none',
      stroke: dark,
      'stroke-width': r2(Math.max(0.8, h * 0.03)),
      opacity: 0.45,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: blades.join(''),
      fill: 'none',
      stroke: c.grass,
      'stroke-width': r2(Math.max(0.7, h * 0.025)),
      'stroke-linecap': 'round',
    }),
  );
}
