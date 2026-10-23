// D-035 graphics pass 3: far and mid ridges with varied, Namibia-inspired silhouettes (the product
// owner: "the mountains can't all be flat, look at mountains in Namibia"):
// - inselberg: a steep rounded granite dome with a sharp summit and a shoulder (Spitzkoppe);
// - massif: a broad dark mass with an uneven summit and ravines down its flanks (Brandberg);
// - strata: a jagged ridge of tilted rock layers (Naukluft, the escarpment);
// - koppie: a pointed hill of boulders with a scree apron;
// - boulders: a low pile of rounded granite boulders;
// - mesa: a flat-topped Karoo dolerite hill (where it fits).
// Each mountain has a lit side (upper left) and a shadow side as gradients, rock texture (joints,
// cracks, exfoliation sheets, gullies, strata), a thin soft outline, and aerial perspective: `haze`
// mixes it toward the horizon and fades its detail. Pure: (rnd, arguments) → SVG.
import { el, g, polyD, r2, smoothD } from './svg';
import { mix, nextId, shade, type Pen, type Pt, type Rnd } from './scenery';

export type MountainKind =
  'inselberg' | 'massif' | 'strata' | 'koppie' | 'boulders' | 'mesa' | 'spire';

export interface RockColours {
  /** Mid tone of the rock in light. */
  readonly rock: string;
  /** Shadow tone (cool, darker). */
  readonly shadow: string;
  /** Lit tone (warm, lighter). */
  readonly lit: string;
  /** Scree, talus and the foot of the slope. */
  readonly scree: string;
  /** A sparse dark vegetation fleck colour (bushes in gullies), or null for bare rock. */
  readonly bush: string | null;
}

export interface Mountain {
  readonly kind: MountainKind;
  /** Left foot, base line, width, height (design px). */
  readonly x: number;
  readonly base: number;
  readonly w: number;
  readonly h: number;
  /** 0 = near and crisp … 1 = lost in the haze. */
  readonly haze: number;
}

/** The silhouette as points from the left foot to the right foot (closed along the base). */
function profile(rnd: Rnd, m: Mountain): Pt[] {
  const { x, base, w, h } = m;
  const pts: Pt[] = [[x, base]];
  const add = (fx: number, fy: number): void => {
    pts.push([x + w * fx, base - h * fy]);
  };
  const jit = (k: number): number => (rnd() - 0.5) * k;
  switch (m.kind) {
    case 'inselberg': {
      // Steep, bulging granite: near-vertical walls, rounded domes as shoulders, a horn summit
      // set off-centre, and a second, lower dome beside it.
      const peak = 0.36 + rnd() * 0.28;
      const side = rnd() < 0.5 ? -1 : 1;
      add(0.06, 0.04);
      add(0.1, 0.22);
      add(0.13, 0.46 + jit(0.06));
      add(0.17, 0.64);
      add(peak - 0.17, 0.74 + jit(0.05));
      add(peak - 0.09, 0.86);
      add(peak - 0.03, 0.97);
      add(peak, 1);
      add(peak + 0.04, 0.95);
      add(peak + 0.09, 0.8);
      add(peak + 0.14 + side * 0.03, 0.68 + jit(0.06));
      add(0.8, 0.6 + jit(0.08));
      add(0.85, 0.44);
      add(0.89, 0.22);
      add(0.93, 0.05);
      break;
    }
    case 'massif': {
      // A broad dome-like mass with an uneven, knobbly summit plateau.
      const n = 9;
      add(0.04, 0.12);
      add(0.12, 0.38);
      for (let k = 0; k <= n; k++) {
        const f = 0.2 + (k / n) * 0.6;
        const crown = Math.sin(((f - 0.2) / 0.6) * Math.PI);
        add(f, 0.72 + crown * 0.24 + jit(0.08));
      }
      add(0.88, 0.4);
      add(0.96, 0.14);
      break;
    }
    case 'strata': {
      // D-035 round 2: tilted layers weather into cuestas: a long gentle dip slope rising to a
      // crest, then a steep, stepped scarp; two or three of them, of different sizes.
      let f = 0.03;
      add(0.02, 0.1);
      const dir = rnd() < 0.5 ? 1 : -1;
      while (f < 0.9) {
        const span = 0.28 + rnd() * 0.22;
        const crestH = 0.55 + rnd() * 0.45;
        const dip = span * 0.72;
        const scarp = span - dip;
        const a = dir > 0 ? dip : scarp;
        const b = dir > 0 ? scarp : dip;
        const low = 0.32 + rnd() * 0.15;
        if (dir > 0) {
          add(f + a * 0.5, low + (crestH - low) * 0.45 + jit(0.04));
          add(f + a, crestH);
          add(f + a + b * 0.35, crestH * 0.8);
          add(f + a + b * 0.5, crestH * 0.72);
          add(f + a + b * 0.85, low + 0.04);
        } else {
          add(f + a * 0.15, crestH * 0.72);
          add(f + a * 0.5, crestH * 0.8);
          add(f + a, crestH);
          add(f + a + b * 0.5, low + (crestH - low) * 0.45 + jit(0.04));
          add(f + a + b, low);
        }
        f += span;
      }
      add(0.97, 0.12);
      break;
    }
    case 'koppie': {
      // D-035 round 2: a Karoo dolerite koppie: a rounded, lopsided hill strewn with boulders,
      // its skyline broken by blocks; the crown sits off-centre.
      const peak = 0.3 + rnd() * 0.4;
      const n = 18;
      for (let k = 1; k < n; k++) {
        const f = k / n;
        const u = f < peak ? (f / peak) * 0.5 : 0.5 + ((f - peak) / (1 - peak)) * 0.5;
        const dome = Math.pow(Math.sin(u * Math.PI), 0.75);
        const block = k % 3 === 0 ? 0.05 + rnd() * 0.05 : k % 3 === 1 ? -0.02 : 0.01;
        add(f, Math.max(0.03, Math.min(1, dome * (0.88 + jit(0.1)) + block * dome)));
      }
      break;
    }
    case 'spire': {
      // A single landmark spire per biome at most: a pointed cone of piled boulders.
      const peak = 0.42 + rnd() * 0.16;
      const n = 16;
      for (let k = 1; k < n; k++) {
        const f = k / n;
        const up = f < peak ? f / peak : (1 - f) / (1 - peak);
        // Concave lower slopes (scree), knobbly boulders on the skyline.
        const hgt = Math.pow(up, 1.5) * (0.92 + jit(0.14)) + (k % 2 === 0 ? 0.03 : -0.02);
        add(f, Math.max(0.02, Math.min(1, hgt)));
      }
      break;
    }
    case 'boulders': {
      // Rounded boulders stacked into a low heap.
      const n = 5 + Math.floor(rnd() * 3);
      for (let k = 0; k <= n; k++) {
        const f = 0.05 + (k / n) * 0.9;
        const heap = Math.sin(((f - 0.05) / 0.9) * Math.PI);
        add(f, 0.25 + heap * 0.75 + jit(0.12));
      }
      break;
    }
    case 'mesa': {
      // Concave talus, a vertical cliff band, a flat (very slightly tilted) top.
      // Long concave talus slopes up to a short vertical dolerite cliff.
      const l = 0.3 + rnd() * 0.08;
      const r = 0.66 + rnd() * 0.08;
      const tilt = jit(0.04);
      add(0.06, 0.06);
      add(0.15, 0.17);
      add(l - 0.1, 0.36 + jit(0.04));
      add(l - 0.05, 0.56);
      add(l - 0.015, 0.74);
      add(l - 0.005, 0.8);
      add(l, 1 + tilt);
      add((l + r) / 2, 1 + jit(0.02));
      add(r, 1 - tilt);
      add(r + 0.008, 0.8);
      add(r + 0.025, 0.72);
      add(r + 0.07, 0.52);
      add(r + 0.13, 0.32 + jit(0.04));
      add(0.88, 0.15);
      add(0.95, 0.05);
      break;
    }
  }
  pts.push([x + w, base]);
  return pts;
}

/** Rough skyline per kind: midpoint displacement (fraction of a segment's length). */
const ROUGH: Readonly<Record<MountainKind, number>> = {
  inselberg: 0.06,
  massif: 0.2,
  strata: 0.32,
  koppie: 0.12,
  boulders: 0.1,
  mesa: 0.07,
  spire: 0.22,
};

/**
 * Fractal skyline: each segment gets a displaced midpoint, three times over with halving
 * amplitude (natural ridges instead of straight tents). The two feet stay where they are.
 */
function roughen(rnd: Rnd, pts: readonly Pt[], amp: number, keepFlatTop: boolean): Pt[] {
  let cur: Pt[] = [...pts];
  let a = amp;
  const top = Math.min(...pts.map((p) => p[1]));
  for (let it = 0; it < 3; it++) {
    const next: Pt[] = [];
    for (let i = 0; i < cur.length - 1; i++) {
      const p = cur[i];
      const q = cur[i + 1];
      if (p === undefined || q === undefined) continue;
      next.push(p);
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const flatTop = keepFlatTop && Math.abs(p[1] - top) < 3 && Math.abs(q[1] - top) < 3;
      const d = flatTop ? (rnd() - 0.5) * 1.5 : (rnd() - 0.5) * len * a;
      next.push([(p[0] + q[0]) / 2 + (rnd() - 0.5) * len * a * 0.3, (p[1] + q[1]) / 2 + d]);
    }
    const last = cur.at(-1);
    if (last !== undefined) next.push(last);
    cur = next;
    a *= 0.55;
  }
  return cur;
}

/** Height of the silhouette at x (linear between the points), for texture placement. */
function topAt(pts: readonly Pt[], x: number): number {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a === undefined || b === undefined) continue;
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / Math.max(1e-6, b[0] - a[0]);
  }
  return pts.at(-1)?.[1] ?? 0;
}

const path = (d: string, attrs: Readonly<Record<string, string | number>>): string =>
  el('path', { d, ...attrs });

/** One mountain: silhouette, shading, rock texture, soft outline. */
export function mountain(rnd: Rnd, m: Mountain, c: RockColours, pen: Pen, horizon: string): string {
  const hz = (col: string, extra = 0): string => mix(col, horizon, Math.min(0.92, m.haze + extra));
  const rock = hz(c.rock);
  const lit = hz(c.lit);
  const dark = hz(c.shadow);
  const deep = hz(shade(c.shadow, -0.25));
  const scree = hz(c.scree);
  const detail = 1 - m.haze; // texture opacity falls off with distance
  const pts = roughen(rnd, profile(rnd, m), ROUGH[m.kind], m.kind === 'mesa');
  const smooth =
    m.kind === 'inselberg' || m.kind === 'boulders' ? 0.8 : m.kind === 'koppie' ? 0.65 : 0.35;
  const body = smoothD(pts, true, smooth);
  const id = nextId();
  const grad = nextId();
  const { x, base, w, h } = m;
  const peakX = pts.reduce((best, p) => (p[1] < best[1] ? p : best), pts[0] ?? [x, base])[0];
  const tex: string[] = [];
  const ink = (o: number, sw: number, col = deep): Record<string, string | number> => ({
    fill: 'none',
    stroke: col,
    'stroke-width': sw,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'stroke-opacity': r2(o * detail),
  });
  const fine = Math.max(0.6, pen.w * 0.45);
  if (m.kind === 'inselberg' || m.kind === 'boulders') {
    // Exfoliation sheets: long curved cracks following the dome, a few vertical joints.
    for (let k = 0; k < 7; k++) {
      const f = 0.15 + k * 0.11 + (rnd() - 0.5) * 0.05;
      const cx = x + w * f;
      const top = topAt(pts, cx);
      const len = (base - top) * (0.4 + rnd() * 0.4);
      const bend = (cx - peakX) * 0.25;
      tex.push(
        path(
          `M${r2(cx)} ${r2(top + 3)}q${r2(bend)} ${r2(len * 0.5)} ${r2(bend * 1.6)} ${r2(len)}`,
          ink(0.55, fine),
        ),
      );
    }
    for (let k = 0; k < 4; k++) {
      const yy = base - h * (0.25 + rnd() * 0.5);
      const cx = x + w * (0.25 + rnd() * 0.5);
      tex.push(
        path(
          `M${r2(cx - w * 0.1)} ${r2(yy)}q${r2(w * 0.1)} ${r2(-h * 0.06)} ${r2(w * 0.2)} 0`,
          ink(0.4, fine, lit),
        ),
      );
    }
  } else if (m.kind === 'massif') {
    // Ravines: dark gullies from the summit down, with lit spurs between them.
    for (let k = 0; k < 11; k++) {
      const cx = x + w * (0.14 + k * 0.075 + (rnd() - 0.5) * 0.03);
      const top = topAt(pts, cx) + 4;
      const len = (base - top) * (0.5 + rnd() * 0.45);
      const drift = (cx - (x + w / 2)) * 0.18;
      const d = `M${r2(cx)} ${r2(top)}q${r2(drift * 0.4 + (rnd() - 0.5) * 6)} ${r2(len * 0.5)} ${r2(drift)} ${r2(len)}`;
      tex.push(path(d, ink(0.75, fine * 2.2, deep)));
      tex.push(
        path(
          `M${r2(cx + 5)} ${r2(top + 2)}q${r2(drift * 0.4)} ${r2(len * 0.45)} ${r2(drift + 4)} ${r2(len * 0.85)}`,
          ink(0.45, fine, lit),
        ),
      );
    }
  } else if (m.kind === 'strata') {
    // Tilted rock layers: alternating bands across the whole ridge, plus fractures.
    const tilt = (rnd() - 0.5) * 0.5;
    for (let yy = base - h * 1.1; yy < base; yy += 5 + rnd() * 7) {
      const y0 = yy - tilt * w * 0.5;
      const y1 = yy + tilt * w * 0.5;
      tex.push(
        path(
          `M${r2(x - 10)} ${r2(y0)}L${r2(x + w + 10)} ${r2(y1)}`,
          ink(0.5, fine * (1 + rnd()), rnd() < 0.5 ? deep : lit),
        ),
      );
    }
  } else if (m.kind === 'koppie' || m.kind === 'spire') {
    // Boulder outlines climbing the cone.
    for (let k = 0; k < 14; k++) {
      const by = base - h * (0.12 + rnd() * 0.75);
      const half = (w / 2) * (1 - (base - by) / h) * 0.9;
      const bx = x + w * 0.52 + (rnd() - 0.5) * half * 2;
      const r = 3 + rnd() * Math.max(3, w * 0.035);
      tex.push(
        path(`M${r2(bx - r)} ${r2(by)}q${r2(r)} ${r2(-r * 1.2)} ${r2(r * 2)} 0`, ink(0.6, fine)),
      );
    }
  } else {
    // Mesa: horizontal sandstone/shale bands on the talus, erosion gullies down it, and a darker
    // cap-rock band with vertical joints.
    const top = Math.min(...pts.map((p) => p[1]));
    const capH = h * (0.12 + rnd() * 0.06);
    for (let yy = top + capH + 4; yy < base; yy += 4 + rnd() * 6) {
      const wav = (rnd() - 0.5) * 3;
      tex.push(
        path(
          `M${r2(x)} ${r2(yy)}Q${r2(x + w / 2)} ${r2(yy + wav)} ${r2(x + w)} ${r2(yy)}`,
          ink(0.45, fine * (0.8 + rnd() * 1.4), rnd() < 0.45 ? lit : deep),
        ),
      );
    }
    for (let k = 0; k < 18; k++) {
      const gx = x + w * (0.12 + rnd() * 0.76);
      const gy = top + capH + rnd() * h * 0.1;
      const len = (base - gy) * (0.3 + rnd() * 0.6);
      tex.push(
        path(
          `M${r2(gx)} ${r2(gy)}q${r2((rnd() - 0.5) * 6)} ${r2(len * 0.5)} ${r2((gx - (x + w / 2)) * 0.12)} ${r2(len)}`,
          ink(0.5, fine * 1.4),
        ),
      );
    }
    tex.push(
      path(
        polyD([
          [x, top - 4],
          [x + w, top - 4],
          [x + w, top + capH],
          [x, top + capH],
        ]),
        { fill: deep, 'fill-opacity': r2(0.55) },
      ),
    );
    for (let k = x + w * 0.2; k < x + w * 0.85; k += 8 + rnd() * 14)
      tex.push(
        path(`M${r2(k)} ${r2(top + 2)}l${r2((rnd() - 0.5) * 3)} ${r2(capH - 2)}`, ink(0.7, fine)),
      );
  }
  // Cracks and grit everywhere (fewer with distance).
  const cracks: string[] = [];
  const nCracks = Math.round(((w * h) / 4400) * detail);
  for (let k = 0; k < nCracks; k++) {
    const cx = x + w * (0.08 + rnd() * 0.84);
    const top = topAt(pts, cx);
    const cy = top + (base - top) * (0.1 + rnd() * 0.8);
    const len = 3 + rnd() * 9;
    cracks.push(`M${r2(cx)} ${r2(cy)}l${r2((rnd() - 0.5) * len)} ${r2(len)}`);
  }
  tex.push(path(cracks.join(''), ink(0.6, fine)));
  // Painterly dapples: soft patches of lit and shadowed rock.
  const dLit: string[] = [];
  const dDark: string[] = [];
  for (let k = 0; k < Math.round((w / 60) * detail) + 1; k++) {
    const cx = x + w * (0.1 + rnd() * 0.8);
    const top = topAt(pts, cx);
    const cy = top + (base - top) * (0.15 + rnd() * 0.6);
    const rx = w * (0.012 + rnd() * 0.025);
    const ry = rx * (1.4 + rnd() * 1.2);
    (cx < peakX ? dLit : dDark).push(
      `M${r2(cx - rx)} ${r2(cy)}a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(rx * 2)} 0a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(-rx * 2)} 0Z`,
    );
  }
  tex.unshift(
    path(dLit.join(''), { fill: lit, 'fill-opacity': r2(0.22 * detail) }),
    path(dDark.join(''), { fill: deep, 'fill-opacity': r2(0.16 * detail) }),
  );
  // Scree apron and bushes along the foot.
  const apron: Pt[] = [];
  for (let k = 0; k <= 10; k++) {
    const f = k / 10;
    apron.push([x + w * f, base - h * (0.05 + 0.1 * Math.sin(f * Math.PI)) * (0.7 + rnd() * 0.6)]);
  }
  const apronD = smoothD([...apron, [x + w, base + 4], [x, base + 4]], true, 0.8);
  const bushes: string[] = [];
  if (c.bush !== null && detail > 0.25)
    for (let k = 0; k < w / 22; k++) {
      const bx = x + w * (0.05 + rnd() * 0.9);
      const by = base - rnd() * h * 0.16;
      bushes.push(`M${r2(bx - 2.2)} ${r2(by)}a2.2 1.6 0 1 0 4.4 0a2.2 1.6 0 1 0 -4.4 0Z`);
    }
  // Light: a gradient from the lit left to the shadow right, angled toward the summit.
  const sideShadow = polyD([
    [peakX, base - h * 1.2],
    [x + w + 20, base - h * 1.2],
    [x + w + 20, base + 6],
    [peakX + w * 0.12, base + 6],
  ]);
  const outline = Math.max(0.6, pen.w * 0.5);
  return g(
    {},
    el(
      'linearGradient',
      { id: grad, x1: x, y1: 0, x2: x + w, y2: 0, gradientUnits: 'userSpaceOnUse' },
      el('stop', { offset: 0, 'stop-color': lit }),
      el('stop', {
        offset: r2(Math.max(0.15, Math.min(0.85, (peakX - x) / w)) * 0.8),
        'stop-color': rock,
      }),
      el('stop', { offset: 1, 'stop-color': dark }),
    ),
    el('clipPath', { id }, el('path', { d: body })),
    path(body, { fill: `url(#${grad})` }),
    g(
      { 'clip-path': `url(#${id})` },
      path(sideShadow, { fill: dark, 'fill-opacity': 0.55 }),
      // Reflected light on the shadow side's lower edge, and a darker foot (the ground's shade).
      path(
        polyD([
          [peakX + w * 0.2, base],
          [x + w, base - h * 0.35],
          [x + w, base],
        ]),
        { fill: lit, 'fill-opacity': r2(0.12 * detail) },
      ),
      ...tex,
      path(apronD, { fill: scree, 'fill-opacity': 0.8 }),
      bushes.length === 0
        ? ''
        : path(bushes.join(''), {
            fill: hz(c.bush ?? rock, 0.05),
            'fill-opacity': r2(0.8 * detail),
          }),
    ),
    path(body, {
      fill: 'none',
      stroke: mix(pen.ink, dark, 0.45),
      'stroke-width': outline,
      'stroke-linejoin': 'round',
      'stroke-opacity': r2(0.55 + 0.35 * detail),
    }),
  );
}

/** Plans a row of mountains across [x0, x1]: varied kinds, widths, heights and gaps (no stamp). */
export function mountainRow(
  rnd: Rnd,
  kinds: readonly { kind: MountainKind; w: number }[],
  o: {
    readonly x0: number;
    readonly x1: number;
    readonly base: number;
    readonly width: readonly [number, number];
    readonly height: readonly [number, number];
    readonly overlap: readonly [number, number];
    readonly haze: number;
    /** D-035 round 2: one landmark spire at this fraction of the row (at most one per biome). */
    readonly spireAt?: number;
  },
): Mountain[] {
  const total = kinds.reduce((s, k) => s + k.w, 0);
  const pick = (): MountainKind => {
    let r = rnd() * total;
    for (const k of kinds) {
      r -= k.w;
      if (r <= 0) return k.kind;
    }
    return kinds[0]?.kind ?? 'koppie';
  };
  const out: Mountain[] = [];
  let last: MountainKind | null = null;
  for (let x = o.x0; x < o.x1;) {
    let kind = pick();
    if (kind === last && rnd() < 0.7) kind = pick(); // rarely two of a kind side by side
    last = kind;
    const narrow = kind === 'boulders' || kind === 'inselberg' || kind === 'spire';
    const w =
      (o.width[0] + rnd() * (o.width[1] - o.width[0])) *
      (narrow ? 0.6 : kind === 'koppie' ? 0.75 + rnd() * 0.3 : 1);
    const h =
      (o.height[0] + Math.pow(rnd(), 1.4) * (o.height[1] - o.height[0])) *
      (kind === 'boulders'
        ? 0.45
        : kind === 'inselberg'
          ? 1.15
          : kind === 'mesa'
            ? 0.8
            : kind === 'koppie'
              ? 0.55 + rnd() * 0.3
              : 1);
    out.push({ kind, x, base: o.base + rnd() * 8, w, h, haze: o.haze + (rnd() - 0.5) * 0.06 });
    x += w * (1 - (o.overlap[0] + rnd() * (o.overlap[1] - o.overlap[0])));
  }
  if (o.spireAt !== undefined) {
    const w = o.width[0] * 0.75;
    out.push({
      kind: 'spire',
      x: o.x0 + (o.x1 - o.x0) * o.spireAt - w / 2,
      base: o.base + 4,
      w,
      h: o.height[1] * 0.95,
      haze: o.haze,
    });
  }
  // Paint the lower ones last within a row, so peaks never hide behind a smaller neighbour's top.
  return out.sort((a, b) => b.h - a.h);
}

/** The biome's rock colours from its palette (`rock`, `rockShadow`, `rockLit`, `scree`, `rockBush`). */
export function rockColours(c: (name: string) => string): RockColours {
  return {
    rock: c('rock'),
    shadow: c('rockShadow'),
    lit: c('rockLit'),
    scree: c('scree'),
    bush: c('rockBush'),
  };
}

/** Paints a planned row (each mountain with its own texture draws from `rnd`). */
export function paintRow(
  rnd: Rnd,
  row: readonly Mountain[],
  c: RockColours,
  pen: Pen,
  horizon: string,
): string[] {
  return row.map((m) => mountain(rnd, m, c, pen, horizon));
}
