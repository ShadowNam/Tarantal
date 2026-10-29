// v1.7e (D-061): real Bushveld koppies and ridges for the far plane (Waterberg, Limpopo): broken,
// bushy silhouettes whose skyline is made of tree crowns, grey granite faces and boulder knobs
// catching the light, gullies in shade, trees as dots thickening toward the foot, and aerial
// perspective by row (each row is tinted toward a cool haze and the horizon, never faded by
// alpha). No outlines. Pure: (rnd, arguments) → SVG.
import { ringNoise } from './camelthorn';
import { mix, type Pt, type Rnd } from './scenery';
import { el, ellipseD, g, polyD, smoothD } from './svg';

export type HillKind = 'koppie' | 'ridge' | 'escarpment';

export interface Hill {
  readonly kind: HillKind;
  /** Left foot x, base line y, width, height (design px). */
  readonly x: number;
  readonly base: number;
  readonly w: number;
  readonly h: number;
}

export interface HillColours {
  /** The bushy slope (olive-khaki), its shaded side, the trees, the granite faces. */
  readonly slope: string;
  readonly slopeShade: string;
  readonly tree: string;
  readonly rock: string;
  readonly rockShade: string;
}

/** Colours for a row at `haze` (0 near … 1 lost): mixed toward a cool haze, then the horizon. */
export function hillColours(haze: number, horizon: string, cool: string): HillColours {
  const h = (hex: string): string => mix(mix(hex, cool, haze * 0.75), horizon, haze * 0.45);
  return {
    slope: h('#8A7E58'),
    slopeShade: h('#665F4A'),
    tree: h('#4E4A2C'),
    rock: h('#CBBFAE'),
    rockShade: h('#7C7168'),
  };
}

/** Height profile (0 … 1) of a hill kind at f (0 … 1 across). */
function shapeOf(kind: HillKind, f: number, peak: number, rnd: () => number): number {
  switch (kind) {
    case 'koppie': {
      // A rounded hill, a little steeper on one side.
      const t = f < peak ? f / peak : 1 - (f - peak) / (1 - peak);
      return Math.pow(Math.sin((t * Math.PI) / 2), 0.9);
    }
    case 'ridge': {
      // A long hill with a broad, saggy crest.
      const t = Math.sin(f * Math.PI);
      return Math.pow(t, 0.55) * (0.85 + 0.15 * Math.sin(f * 9 + rnd() * 0.01));
    }
    case 'escarpment': {
      // A plateau with a steep front and a long back slope.
      if (f < 0.08) return Math.pow(f / 0.08, 0.7) * 0.92;
      if (f > 0.88) return Math.pow((1 - f) / 0.12, 1.4) * 0.92;
      return 0.92 + 0.08 * Math.sin(f * 7);
    }
  }
}

/** One hill: silhouette, shading, granite faces, tree dots. */
export function bushHill(rnd: Rnd, m: Hill, c: HillColours, scale = 1): string {
  const { x, base, w, h } = m;
  const n = ringNoise(rnd, 3, 14, 0.45);
  const peak = 0.35 + rnd() * 0.3;
  const step = Math.max(2, 3 * scale);
  // Granite outcrops along the crest (fractions of the width): bare rock, no trees on top.
  const outcrops: [number, number][] = [];
  for (let k = 0; k < 1 + Math.floor(rnd() * (m.kind === 'escarpment' ? 4 : 3)); k++) {
    const at = 0.15 + rnd() * 0.7;
    outcrops.push([at, at + 0.04 + rnd() * 0.08]);
  }
  const inRock = (f: number): boolean => outcrops.some(([a, b]) => f >= a && f <= b);
  const top: Pt[] = [];
  const crowns: string[] = [];
  for (let px = x; px <= x + w + 0.01; px += step) {
    const f = (px - x) / w;
    let y = base - h * shapeOf(m.kind, f, peak, rnd) * (1 + n(f * Math.PI * 2) * 0.22);
    // Boulder knobs on the outcrops: a stepped, blocky skyline.
    if (inRock(f)) y -= h * 0.04 * (Math.floor(rnd() * 3) / 2);
    top.push([px, y]);
    // Tree crowns breaking the skyline elsewhere.
    if (!inRock(f) && rnd() < 0.7 && y < base - 2) {
      const r = (1.2 + rnd() * 1.6) * scale;
      crowns.push(ellipseD(px + (rnd() - 0.5) * step, y + r * 0.3, r, r * 0.8));
    }
  }
  const outline: Pt[] = [[x, base + 2], ...top, [x + w, base + 2]];
  const d = polyD(outline);
  const topAt = (px: number): number => {
    const i = Math.max(0, Math.min(top.length - 1, Math.round((px - x) / step)));
    return (top[i] as Pt)[1];
  };
  const parts: string[] = [el('path', { d, fill: c.slope })];
  parts.push(el('path', { d: crowns.join(''), fill: c.slope }));
  // The shaded side (right of the summit) and gullies: darker wedges running down the slope.
  const summit = top.reduce((a, b) => (b[1] < a[1] ? b : a));
  const shadeSide: Pt[] = [
    summit,
    ...top.filter((p) => p[0] > summit[0]),
    [x + w, base + 2],
    [summit[0] + w * 0.05, base + 2],
  ];
  parts.push(el('path', { d: polyD(shadeSide), fill: c.slopeShade, opacity: 0.55 }));
  const gullies: string[] = [];
  for (let k = 0; k < Math.max(2, Math.round(w / 70)); k++) {
    const gx = x + w * (0.1 + rnd() * 0.8);
    const gt = topAt(gx) + 4 * scale;
    if (gt > base - 6) continue;
    const gw = (3 + rnd() * 6) * scale;
    const lean = (gx - summit[0]) * 0.15;
    gullies.push(
      polyD([
        [gx - gw * 0.3, gt],
        [gx + gw * 0.3, gt],
        [gx + lean + gw, base],
        [gx + lean - gw, base],
      ]),
    );
  }
  parts.push(el('path', { d: gullies.join(''), fill: c.slopeShade, opacity: 0.5 }));
  // Granite outcrops: a bare, rounded face under the crest, lit on the sun side, and a heap of
  // boulders on it (each lit at the upper left, its shadow below and to the right).
  const faceLit: string[] = [];
  const faceDark: string[] = [];
  const knobLit: string[] = [];
  const knobDark: string[] = [];
  for (const [a, b] of outcrops) {
    const x0 = x + a * w;
    const x1 = x + b * w;
    const span = x1 - x0;
    const depth =
      Math.min(h * 0.25, (base - Math.min(topAt(x0), topAt(x1))) * 0.3) * (0.5 + rnd() * 0.5);
    const face: Pt[] = [];
    for (let s = 0; s <= 6; s++) face.push([x0 + (span * s) / 6, topAt(x0 + (span * s) / 6) + 1]);
    for (let s = 6; s >= 0; s--) {
      const fx = x0 + (span * s) / 6;
      const bulge = Math.sin((s / 6) * Math.PI);
      face.push([fx, topAt(fx) + depth * (0.25 + bulge * (0.6 + rnd() * 0.3))]);
    }
    (x0 + span / 2 < summit[0] ? faceLit : faceDark).push(smoothD(face, true, 0.6));
    for (let k = 0; k < 4 + Math.round(span / (5 * scale)); k++) {
      const bx = x0 + rnd() * span;
      const by = topAt(bx) + rnd() * depth * 0.7 + 1;
      const r = (1.4 + rnd() * 2.6) * scale;
      knobDark.push(ellipseD(bx + r * 0.35, by + r * 0.3, r, r * 0.75));
      knobLit.push(ellipseD(bx - r * 0.15, by - r * 0.1, r * 0.75, r * 0.55));
    }
  }
  parts.push(
    el('path', { d: faceLit.join(''), fill: c.rock, opacity: 0.6 }),
    el('path', { d: faceDark.join(''), fill: c.rockShade, opacity: 0.75 }),
    el('path', { d: knobDark.join(''), fill: c.rockShade }),
    el('path', { d: knobLit.join(''), fill: c.rock }),
  );
  // Boulders scattered on the slopes (lit tops).
  const boulders: string[] = [];
  for (let k = 0; k < Math.round(w / 40); k++) {
    const bx = x + w * (0.05 + rnd() * 0.9);
    const bt = topAt(bx);
    const by = bt + (base - bt) * (0.15 + rnd() * 0.6);
    const r = (1.5 + rnd() * 2.5) * scale;
    boulders.push(ellipseD(bx, by, r, r * 0.7));
  }
  parts.push(el('path', { d: boulders.join(''), fill: c.rock, opacity: 0.45 }));
  // Trees: dots thickening toward the foot and in the gullies, never on the bare faces.
  const trees: string[] = [];
  const area = w * h;
  for (let k = 0; k < Math.round(area / (75 * scale * scale)); k++) {
    const tx = x + rnd() * w;
    const tt = topAt(tx);
    if (tt > base - 3) continue;
    const v = Math.pow(rnd(), 0.6);
    const ty = tt + 3 * scale + v * (base - tt);
    const f = (tx - x) / w;
    if (inRock(f) && ty < tt + h * 0.35) continue;
    const r = (0.9 + rnd() * 1.3) * scale;
    trees.push(ellipseD(tx, ty, r * 1.2, r));
  }
  parts.push(el('path', { d: trees.join(''), fill: c.tree, opacity: 0.8 }));
  return g({}, ...parts);
}

/** A row of hills from x0 to x1 (left to right; later ones overlap earlier ones). */
export function hillRow(
  rnd: Rnd,
  kinds: readonly HillKind[],
  o: {
    readonly x0: number;
    readonly x1: number;
    readonly base: number;
    readonly width: readonly [number, number];
    readonly height: readonly [number, number];
    readonly gap: readonly [number, number];
  },
): Hill[] {
  const out: Hill[] = [];
  for (let x = o.x0; x < o.x1;) {
    const w = o.width[0] + rnd() * (o.width[1] - o.width[0]);
    const h = o.height[0] + rnd() * (o.height[1] - o.height[0]);
    const kind = kinds[Math.floor(rnd() * kinds.length)] ?? 'koppie';
    out.push({ kind, x, base: o.base + rnd() * 6, w, h });
    x += w * (1 + o.gap[0] + rnd() * (o.gap[1] - o.gap[0]));
  }
  return out;
}
