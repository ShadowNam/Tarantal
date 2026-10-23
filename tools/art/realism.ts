// D-035 graphics pass 3: semi-realistic building blocks for the interim art (trees, ground
// shadows, soft ink, rock texture). Realistic proportions and materials, painterly shading (a
// lit side, a shadow side, reflected light), fine detail, thinner and softer outlines than the
// D-029/D-031 comic shapes. Light comes from the upper left, as before. Pure: same input, same SVG.
import { el, ellipseD, g, polyD, r2, smoothD } from './svg';
import { mix, nextId, shade, type Pen, type Pt, type Rnd, type Tone } from './scenery';

/** The pass-3 outline: thinner, and tinted toward the surface colour (soft ink, not black). */
export function softPen(pen: Pen, fill: string, k = 0.55, soft = 0.35): Pen {
  return { ink: mix(pen.ink, shade(fill, -0.45), soft), w: Math.max(0.6, pen.w * k) };
}

/** A soft contact shadow on the ground under an object (no outline). */
export function contactShadow(
  x: number,
  y: number,
  rx: number,
  ry: number,
  opacity = 0.28,
): string {
  return el('path', { d: ellipseD(x, y, rx, ry), fill: '#2A1A22', 'fill-opacity': opacity });
}

/** Closed path through points, without outline. */
export const fillD = (d: string, fill: string, opacity?: number): string =>
  el('path', { d, fill, ...(opacity === undefined ? {} : { 'fill-opacity': opacity }) });

export type TreeKind = 'round' | 'bluegum' | 'acacia' | 'pepper';

/**
 * A tree of overlapping leaf masses: a trunk with forks, a crown of lobes lit from the upper
 * left (light lobes top-left, shadow mass lower right, a few leaf-cluster flecks), a thin soft
 * outline around the whole crown, and a contact shadow. (x, y) is where the trunk meets the
 * ground: the tree always stands on its base.
 */
export function tree(
  rnd: Rnd,
  kind: TreeKind,
  x: number,
  y: number,
  w: number,
  h: number,
  leaves: Tone,
  bark: string,
  pen: Pen,
): string {
  const soft = softPen(pen, leaves.fill, 0.6);
  const trunkTop = kind === 'acacia' ? 0.62 : kind === 'bluegum' ? 0.55 : 0.42;
  const tw = Math.max(1.2, w * (kind === 'bluegum' ? 0.05 : 0.07));
  const lean = (rnd() - 0.5) * w * 0.08;
  // Trunk and two forks into the crown.
  const tx = x + lean;
  const ty = y - h * trunkTop;
  const trunk = polyD([
    [x - tw, y],
    [tx - tw * 0.55, ty],
    [tx + tw * 0.55, ty],
    [x + tw, y],
  ]);
  const forks = `M${r2(tx)} ${r2(ty + h * 0.08)}l${r2(-w * 0.18)} ${r2(-h * 0.14)}M${r2(tx)} ${r2(
    ty + h * 0.04,
  )}l${r2(w * 0.2)} ${r2(-h * 0.16)}`;
  // Crown lobes.
  const lobes: [number, number, number, number][] = [];
  const n = kind === 'acacia' ? 6 : kind === 'bluegum' ? 7 : 6;
  const cy = y - h * (kind === 'acacia' ? 0.8 : 0.66);
  const spanX = kind === 'acacia' ? w * 0.5 : w * 0.36;
  const spanY = kind === 'acacia' ? h * 0.1 : kind === 'bluegum' ? h * 0.26 : h * 0.2;
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1) - 0.5;
    const lx = tx + f * spanX * 2 + (rnd() - 0.5) * w * 0.08;
    const ly =
      cy +
      (rnd() - 0.5) * spanY * 2 -
      (kind === 'acacia' ? 0 : Math.abs(f) < 0.25 ? spanY * 0.5 : 0);
    const rx = w * (kind === 'acacia' ? 0.2 : 0.2 + rnd() * 0.08);
    const ry = kind === 'acacia' ? h * 0.1 : h * (0.16 + rnd() * 0.07);
    lobes.push([lx, ly, rx, ry]);
  }
  const lobeD = lobes.map(([lx, ly, rx, ry]) => ellipseD(lx, ly, rx, ry)).join('');
  const id = nextId();
  const flecks: string[] = [];
  for (let k = 0; k < n * 3; k++) {
    const [lx, ly, rx, ry] = lobes[k % n] ?? [tx, cy, w * 0.2, h * 0.2];
    const fx = lx + (rnd() - 0.6) * rx * 1.2;
    const fy = ly + (rnd() - 0.7) * ry * 1.1;
    flecks.push(ellipseD(fx, fy, rx * 0.22, ry * 0.18));
  }
  const darkFlecks: string[] = [];
  for (let k = 0; k < n * 2; k++) {
    const [lx, ly, rx, ry] = lobes[(k * 3) % n] ?? [tx, cy, w * 0.2, h * 0.2];
    darkFlecks.push(
      ellipseD(lx + (rnd() - 0.3) * rx, ly + (rnd() - 0.2) * ry, rx * 0.2, ry * 0.14),
    );
  }
  return g(
    {},
    contactShadow(x + w * 0.12, y + 1, w * 0.42, Math.max(1.5, h * 0.05)),
    el('path', {
      d: trunk,
      fill: bark,
      stroke: soft.ink,
      'stroke-width': soft.w,
      'stroke-linejoin': 'round',
    }),
    el('path', {
      d: forks,
      fill: 'none',
      stroke: bark,
      'stroke-width': Math.max(1, tw * 0.9),
      'stroke-linecap': 'round',
    }),
    // Outline: the lobes stroked, then filled over (only the crown's outer edge stays inked).
    el('path', { d: lobeD, fill: soft.ink, stroke: soft.ink, 'stroke-width': soft.w * 2 }),
    el('clipPath', { id }, el('path', { d: lobeD })),
    el('path', { d: lobeD, fill: leaves.fill }),
    g(
      { 'clip-path': `url(#${id})` },
      // Shadow side (lower right) and the crown's underside.
      fillD(ellipseD(tx + w * 0.22, cy + h * 0.14, w * 0.42, h * 0.24), leaves.dark),
      fillD(ellipseD(tx, cy + h * 0.24, w * 0.6, h * 0.08), shade(leaves.dark, -0.2), 0.7),
      // Lit side (upper left).
      fillD(ellipseD(tx - w * 0.2, cy - h * 0.12, w * 0.26, h * 0.12), leaves.light, 0.85),
      fillD(flecks.join(''), leaves.light, 0.55),
      fillD(darkFlecks.join(''), leaves.dark, 0.6),
    ),
  );
}

/** Rock texture inside a clip: cracks (dark, short), lit edges, and a speckle of grit. */
export function rockTexture(
  rnd: Rnd,
  box: { x0: number; x1: number; y0: number; y1: number },
  t: Tone,
  density: number,
  crackW: number,
): string {
  const cracks: string[] = [];
  const lit: string[] = [];
  const grit: string[] = [];
  const area = (box.x1 - box.x0) * (box.y1 - box.y0);
  const n = Math.round((area / 900) * density);
  for (let k = 0; k < n; k++) {
    const x = box.x0 + rnd() * (box.x1 - box.x0);
    const y = box.y0 + rnd() * (box.y1 - box.y0);
    const len = 4 + rnd() * 14;
    const a = 1.2 + (rnd() - 0.5) * 1.3; // mostly down-slope
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    const mx = (x + x2) / 2 + (rnd() - 0.5) * 4;
    const my = (y + y2) / 2 + (rnd() - 0.5) * 4;
    cracks.push(`M${r2(x)} ${r2(y)}Q${r2(mx)} ${r2(my)} ${r2(x2)} ${r2(y2)}`);
    lit.push(`M${r2(x - 1)} ${r2(y - 1)}Q${r2(mx - 1)} ${r2(my - 1)} ${r2(x2 - 1)} ${r2(y2 - 1)}`);
    if (rnd() < 0.6) grit.push(ellipseD(x + (rnd() - 0.5) * 20, y + (rnd() - 0.5) * 20, 0.9, 0.7));
  }
  return g(
    {},
    el('path', {
      d: lit.join(''),
      fill: 'none',
      stroke: t.light,
      'stroke-width': crackW * 0.8,
      'stroke-linecap': 'round',
      'stroke-opacity': 0.55,
    }),
    el('path', {
      d: cracks.join(''),
      fill: 'none',
      stroke: shade(t.dark, -0.25),
      'stroke-width': crackW,
      'stroke-linecap': 'round',
      'stroke-opacity': 0.7,
    }),
    el('path', { d: grit.join(''), fill: shade(t.dark, -0.2), 'fill-opacity': 0.5 }),
  );
}

/** Smooth outline helper for silhouettes (re-export, so mountain code reads in one place). */
export const outlineD = (pts: readonly Pt[], close = true): string => smoothD(pts, close, 0.9);
