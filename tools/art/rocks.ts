// v1.6 (D-042, product owner 25 Oct: "faceted grey/ochre granite boulders, not orange balloons"):
// weathered granite boulders. Each is a rounded, slightly faceted block: planes lit from the upper
// left, a shaded underside, iron-stained ochre patches, cracks and peeling exfoliation sheets
// (onion-skin weathering), lichen spots, dark crevices where it meets the ground or its
// neighbours, and grass (now and then a small aloe) in the cracks. Coordinates: the boulder sits
// on (x, y) (its foot line), `w` wide and `h` tall.
import { blurFilter, ringNoise } from './camelthorn';
import { mix, nextId, shade, type Pen, type Pt, type Rnd } from './scenery';
import { el, ellipseD, g, polyD, r2, smoothD } from './svg';

export interface RockLook {
  /** Base granite (grey with ochre), its lit and shaded tones, the iron stain, lichen. */
  readonly base: string;
  readonly lit: string;
  readonly shade: string;
  readonly stain: string;
  readonly lichen: readonly string[];
  readonly ink: string;
  readonly grass: string;
}

/** Grey/ochre granite (or another rock colour `base`), hazed for the plane by `tint`. */
export function graniteLook(
  tint: (hex: string) => string,
  pen: Pen,
  grass = '#C9B98F',
  base = '#A39684',
): RockLook {
  const b = tint(base);
  return {
    base: b,
    lit: shade(mix(b, '#F0E6D2', 0.35), 0.12),
    shade: shade(b, -0.38),
    stain: tint('#B48552'),
    lichen: [tint('#C9C27A'), tint('#D8D2C0'), tint('#C88A4A')],
    ink: mix(pen.ink, '#4A423A', 0.45),
    grass: tint(grass),
  };
}

export interface BoulderOpts {
  /** A deep crack (the boulder_crack secret): from (cx, cy), `len` long. */
  readonly crack?: { readonly x: number; readonly y: number; readonly len: number };
  /** Grass in the cracks and at the foot (default true). */
  readonly grass?: boolean;
  /** A small aloe growing from a crack. */
  readonly aloe?: boolean;
  /** Fine detail (lichen, peeling sheets): off for small far rocks. */
  readonly detail?: boolean;
}

/** One boulder. */
export function boulder(
  rnd: Rnd,
  x: number,
  y: number,
  w: number,
  h: number,
  look: RockLook,
  pen: Pen,
  o: BoulderOpts = {},
): string {
  const detail = o.detail !== false && w > 30;
  const n = ringNoise(rnd, 2, 7, 0.55);
  const hw = w / 2;
  const cy = y - h * 0.55;
  // Outline: a rounded block, flatter at the base, lumpy (facets) round the top.
  const pts: Pt[] = [];
  const steps = 22;
  // A dome: rounded shoulders, the widest point low down, a flattened foot; lumpy facets.
  for (let k = 0; k < steps; k++) {
    const f = k / (steps - 1);
    const t = Math.PI * (1 + f);
    const r = 1 + n(t * 1.7) * 0.1;
    const px = x + Math.cos(t) * hw * r * (1.02 - 0.04 * Math.sin(f * Math.PI));
    const py = y - h * Math.pow(Math.abs(Math.sin(t)), 0.75) * r;
    pts.push([px, Math.min(y, py)]);
  }
  pts.push([x + hw * 0.92, y], [x - hw * 0.92, y]);
  const outline = smoothD(pts, true, 0.55);
  // Facets: a ridge point up left of centre; planes from it to pairs of rim points.
  const peak: Pt = [x - hw * 0.15 + (rnd() - 0.5) * hw * 0.2, cy - h * 0.12];
  const facets: { d: string; lum: number }[] = [];
  const rim = pts.slice(0, steps);
  const every = 3;
  for (let k = 0; k + every < rim.length; k += every) {
    const a = rim[k] as Pt;
    const b = rim[Math.min(rim.length - 1, k + every)] as Pt;
    const mx = (a[0] + b[0]) / 2 - peak[0];
    const my = (a[1] + b[1]) / 2 - peak[1];
    const len = Math.hypot(mx, my) || 1;
    // Facing the light (upper left) → lit; facing down/right → shaded.
    const lum = (-mx / len) * 0.55 + (-my / len) * 0.75;
    facets.push({ d: polyD([peak, a, b]), lum });
  }
  const id = nextId();
  const parts: string[] = [];
  const blur = blurFilter(Math.max(0.8, w * 0.02));
  parts.push(
    blur.def,
    g(
      { filter: `url(#${blur.id})` },
      el('path', {
        d: ellipseD(x + w * 0.08, y + 1, hw * 1.05, Math.max(2, h * 0.08)),
        fill: '#2A2018',
        opacity: 0.32,
      }),
    ),
    el('clipPath', { id }, el('path', { d: outline })),
    el('path', { d: outline, fill: look.base }),
  );
  const inner: string[] = [];
  for (const f of facets) {
    const c = f.lum > 0.35 ? look.lit : f.lum < -0.3 ? look.shade : look.base;
    const op = f.lum > 0.35 ? 0.65 + f.lum * 0.3 : f.lum < -0.3 ? 0.55 - f.lum * 0.3 : 0.3;
    inner.push(el('path', { d: f.d, fill: c, opacity: r2(Math.min(0.9, op)) }));
  }
  // The rounded underside in shade, a bounce of reflected light along the very bottom.
  inner.push(
    el('path', {
      d: ellipseD(x + hw * 0.2, y - h * 0.08, hw * 1.05, h * 0.32),
      fill: look.shade,
      opacity: 0.6,
    }),
    el('path', {
      d: ellipseD(x + hw * 0.1, y - h * 0.02, hw * 0.7, h * 0.06),
      fill: look.base,
      opacity: 0.35,
    }),
  );
  // Iron-stain streaks running down from the top, ochre.
  for (let k = 0; k < 1 + Math.floor(rnd() * 2); k++) {
    const sx = x + (rnd() - 0.5) * hw * 1.2;
    const sy = cy - h * (0.2 + rnd() * 0.25);
    inner.push(
      el('path', {
        d: `M${r2(sx)} ${r2(sy)}q${r2((rnd() - 0.5) * w * 0.05)} ${r2(h * 0.3)} ${r2((rnd() - 0.5) * w * 0.04)} ${r2(h * 0.55)}`,
        fill: 'none',
        stroke: look.stain,
        'stroke-width': r2(Math.max(1, w * (0.02 + rnd() * 0.025))),
        'stroke-linecap': 'round',
        opacity: 0.22,
      }),
    );
  }
  if (detail) {
    // Exfoliation: thin curved sheets peeling along the top, a lit lip over a dark gap.
    for (let k = 0; k < 2 + Math.floor(rnd() * 2); k++) {
      const a0 = Math.PI * (1.1 + rnd() * 0.5);
      const a1 = a0 + 0.35 + rnd() * 0.4;
      const rr = 0.72 + rnd() * 0.18;
      const p0: Pt = [x + Math.cos(a0) * hw * rr, cy + Math.sin(a0) * h * 0.55 * rr];
      const p1: Pt = [x + Math.cos(a1) * hw * rr, cy + Math.sin(a1) * h * 0.55 * rr];
      const arc = `M${r2(p0[0])} ${r2(p0[1])}A${r2(hw * rr)} ${r2(h * 0.55 * rr)} 0 0 1 ${r2(p1[0])} ${r2(p1[1])}`;
      inner.push(
        el('path', {
          d: arc,
          fill: 'none',
          stroke: look.shade,
          'stroke-width': r2(Math.max(1, w * 0.018)),
          transform: `translate(0 ${r2(h * 0.025)})`,
        }),
        el('path', {
          d: arc,
          fill: 'none',
          stroke: look.lit,
          'stroke-width': r2(Math.max(0.8, w * 0.01)),
        }),
      );
    }
    // Lichen: little rosettes of yellow-green, grey and orange on the lit top.
    const lichen: string[][] = [[], [], []];
    for (let k = 0; k < Math.round(w / 9); k++) {
      const a = Math.PI * (1.05 + rnd() * 0.9);
      const rr = Math.sqrt(rnd()) * 0.85;
      const lx = x + Math.cos(a) * hw * rr;
      const ly = cy + Math.sin(a) * h * 0.5 * rr;
      const s = Math.max(1, w * (0.012 + rnd() * 0.02));
      lichen[Math.floor(rnd() * 3)]?.push(ellipseD(lx, ly, s, s * 0.75));
    }
    lichen.forEach((ds, i) =>
      inner.push(el('path', { d: ds.join(''), fill: look.lichen[i] ?? look.lit, opacity: 0.85 })),
    );
  }
  // Cracks: a jagged line or two, dark with a lit edge on one side.
  const crackD = (sx: number, sy: number, len: number): string => {
    let d = `M${r2(sx)} ${r2(sy)}`;
    let cx = sx;
    let cyy = sy;
    for (let k = 0; k < 5; k++) {
      cx += (rnd() - 0.5) * len * 0.35;
      cyy += len / 5;
      d += `L${r2(cx)} ${r2(cyy)}`;
    }
    return d;
  };
  const cracks: string[] = [];
  if (o.crack !== undefined)
    cracks.push(crackD(o.crack.x, o.crack.y - o.crack.len * 0.5, o.crack.len));
  if (detail) cracks.push(crackD(x + (rnd() - 0.3) * hw, cy - h * 0.3, h * (0.4 + rnd() * 0.3)));
  if (cracks.length > 0)
    inner.push(
      el('path', {
        d: cracks.join(''),
        fill: 'none',
        stroke: look.lit,
        'stroke-width': r2(Math.max(1, w * 0.012)),
        transform: `translate(${r2(-w * 0.006)} 0)`,
      }),
      el('path', {
        d: cracks.join(''),
        fill: 'none',
        stroke: shade(look.shade, -0.4),
        'stroke-width': r2(Math.max(1.2, w * (o.crack ? 0.03 : 0.014))),
        'stroke-linejoin': 'round',
      }),
    );
  parts.push(g({ 'clip-path': `url(#${id})` }, ...inner));
  // Soft outline, heavier under the shade side.
  parts.push(
    el('path', {
      d: outline,
      fill: 'none',
      stroke: look.ink,
      'stroke-width': r2(Math.max(0.8, pen.w * 0.55)),
      'stroke-linejoin': 'round',
    }),
    // The crevice where it meets the ground.
    el('path', {
      d: `M${r2(x - hw * 0.85)} ${r2(y - 0.5)}L${r2(x + hw * 0.9)} ${r2(y - 0.5)}`,
      fill: 'none',
      stroke: shade(look.shade, -0.45),
      'stroke-width': r2(Math.max(1.5, h * 0.04)),
      'stroke-linecap': 'round',
    }),
  );
  if (o.grass !== false) {
    // Grass tufts at the foot and in a crack.
    const tufts: string[] = [];
    for (let k = 0; k < 2 + Math.floor(rnd() * 2); k++) {
      const tx = x + (rnd() < 0.5 ? -1 : 1) * hw * (0.6 + rnd() * 0.45);
      const ty = y + 1;
      const th = Math.max(6, h * (0.18 + rnd() * 0.15));
      for (let b = 0; b < 7; b++) {
        const a = -Math.PI / 2 + (b / 6 - 0.5) * 1.6 + (rnd() - 0.5) * 0.2;
        tufts.push(
          `M${r2(tx)} ${r2(ty)}q${r2(Math.cos(a) * th * 0.3)} ${r2(Math.sin(a) * th * 0.6)} ${r2(Math.cos(a) * th * 0.6)} ${r2(Math.sin(a) * th)}`,
        );
      }
    }
    parts.push(
      el('path', {
        d: tufts.join(''),
        fill: 'none',
        stroke: shade(look.grass, -0.35),
        'stroke-width': r2(Math.max(1, w * 0.012)),
        'stroke-linecap': 'round',
      }),
      el('path', {
        d: tufts.join(''),
        fill: 'none',
        stroke: look.grass,
        'stroke-width': r2(Math.max(0.6, w * 0.007)),
        'stroke-linecap': 'round',
      }),
    );
  }
  if (o.aloe === true) parts.push(smallAloe(x + hw * 0.35, cy - h * 0.05, h * 0.35));
  return g({}, ...parts);
}

/** A small aloe rosette with a red-orange flower candle, growing from a crack. */
function smallAloe(x: number, y: number, s: number): string {
  const leaves: string[] = [];
  for (const a of [-70, -40, -12, 15, 42, 72]) {
    const r = (a * Math.PI) / 180;
    const tx = x + Math.sin(r) * s;
    const ty = y - Math.cos(r) * s * 0.75;
    leaves.push(
      `M${r2(x - s * 0.08)} ${r2(y)}Q${r2((x + tx) / 2 - s * 0.05)} ${r2((y + ty) / 2)} ${r2(tx)} ${r2(ty)}Q${r2((x + tx) / 2 + s * 0.08)} ${r2((y + ty) / 2 + s * 0.08)} ${r2(x + s * 0.08)} ${r2(y)}Z`,
    );
  }
  return g(
    {},
    el('path', {
      d: `M${r2(x)} ${r2(y)}L${r2(x + s * 0.1)} ${r2(y - s * 1.6)}`,
      fill: 'none',
      stroke: '#6E7A52',
      'stroke-width': r2(Math.max(1, s * 0.06)),
    }),
    el('path', {
      d: ellipseD(x + s * 0.1, y - s * 1.75, s * 0.1, s * 0.28),
      fill: '#E04A2B',
      stroke: '#8A2A18',
      'stroke-width': r2(Math.max(0.5, s * 0.03)),
    }),
    el('path', {
      d: leaves.join(''),
      fill: '#7E9A86',
      stroke: '#3E4E44',
      'stroke-width': r2(Math.max(0.6, s * 0.04)),
    }),
  );
}

/** A pile of boulders (a koppie or a heap), back to front; returns the svg. */
export function boulderPile(
  rnd: Rnd,
  x: number,
  base: number,
  w: number,
  h: number,
  look: RockLook,
  pen: Pen,
  n = 6,
  o: BoulderOpts = {},
): string {
  const rocks: [number, number, number, number][] = [];
  for (let k = 0; k < n; k++) {
    const f = n === 1 ? 0 : k / (n - 1) - 0.5;
    const rw = w * (0.34 + rnd() * 0.14);
    const rh = h * (0.42 + rnd() * 0.16);
    const lift = Math.max(0, 1 - Math.abs(f) * 1.6) * h * 0.4;
    rocks.push([x + f * w * 0.7, base - lift, rw, rh]);
  }
  rocks.sort((a, b) => a[1] - b[1]);
  return g(
    {},
    ...rocks.map(([rx, ry, rw, rh], i) =>
      boulder(rnd, rx, ry, rw, rh, look, pen, {
        ...o,
        aloe: o.aloe === true && i === rocks.length - 1,
      }),
    ),
  );
}
