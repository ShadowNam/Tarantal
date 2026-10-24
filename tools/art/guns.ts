// The six interim first-person guns (D-029, art bible §6, content/weapons.json). Barrels point up
// the screen in the placeholder's 420 × 520 box; units are box px at @1x with the grip (screen
// anchor) at (0, 0) = box (210, 520). Ink outlines at the near weight, flat fills with one shadow
// and one highlight, wood grain, metal shine, wear and scratches. No text, brands or logos.
import type { GunClip } from '../../src/game/assets/assetIndex';
import { GUN_BOX, GUN_FLASH_BOX } from '../assets/targets';
import { gunColour, type ArtConfig, type GunId } from './config';
import { ellipseD, el, g, place, polyD, prng, r2, smoothD, svgDoc, wobbleFilter } from './svg';

type Pt = readonly [number, number];

/** Muzzle distance from the grip along the barrel (local units, drawn pointing up). */
export const MUZZLE_Y = -500;
/** Kettie: the fork's centre is its "muzzle". */
export const KETTIE_TIP_Y = -400;

/**
 * How a gun sits in its 420 × 520 frame (tools/art/config.json guns.poses): drawn pointing up from
 * the grip at local (0, 0), widened about the barrel line, turned `angle` degrees (negative =
 * barrels up-left toward the screen centre) and moved `shift` px right, so the stock sits bottom
 * right and the barrels run into the scene in perspective (bible §6).
 */
export function poseFor(
  cfg: ArtConfig,
  id: GunId,
): { angle: number; shift: number; widen: number } {
  return cfg.guns.poses[id];
}

/** The muzzle in the frame (fractions), after the pose: rig.json tipX/tipY. */
export function tipFor(cfg: ArtConfig, id: GunId): { tipX: number; tipY: number } {
  const y = id === 'kettie' ? KETTIE_TIP_Y : MUZZLE_Y;
  const p = poseFor(cfg, id);
  const a = (p.angle * Math.PI) / 180;
  const tx = p.shift - y * Math.sin(a);
  const ty = y * Math.cos(a);
  const round = (v: number) => Math.round(v * 10000) / 10000;
  return {
    tipX: round((GUN_BOX.originX + tx) / GUN_BOX.width),
    tipY: round((GUN_BOX.originY + ty) / GUN_BOX.height),
  };
}

interface Ctx {
  readonly cfg: ArtConfig;
  readonly c: (name: string) => string;
  readonly ink: string;
  readonly L: number;
  readonly inner: number;
  /** Unique clip-path ids within one SVG. */
  next: number;
}

const uid = (x: Ctx, p: string): string => `${p}${x.next++}`;

/**
 * D-035 round 2: every gun part is edged with a 1–2 px darker shade of its own material instead
 * of a dark contour (the `ink` argument is kept for the call sites but only used for fills that
 * are not plain colours).
 */
function inked(d: string, fill: string, ink: string, width: number): string {
  // A gentle darkening: on dark materials (wood shadow, steel shadow) a strong one reads black.
  const edge = fill.startsWith('#') ? mixHex(fill, '#000000', 0.22) : ink;
  return el('path', {
    d,
    fill,
    stroke: width > 0 ? edge : 'none',
    'stroke-width': width > 0 ? Math.min(1.6, Math.max(1, width)) : undefined,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
  });
}

/** A soft cast shadow (D-035 round 2): `d` offset down-right, blurred, clipped to `onto`. */
function contactShadow(x: Ctx, d: string, onto: string, dx = 4, dy = 6, opacity = 0.45): string {
  const clip = uid(x, 'cs');
  const blur = uid(x, 'bl');
  return [
    el('clipPath', { id: clip }, el('path', { d: onto })),
    el(
      'filter',
      { id: blur, x: '-20%', y: '-20%', width: '140%', height: '140%' },
      el('feGaussianBlur', { stdDeviation: 3.5 }),
    ),
    g(
      { 'clip-path': `url(#${clip})` },
      el('path', {
        d,
        fill: '#120C08',
        opacity,
        transform: `translate(${dx} ${dy})`,
        filter: `url(#${blur})`,
      }),
    ),
  ].join('');
}

/** Mixes two #RRGGBB colours (t = 0 → a). */
function mixHex(a: string, b: string, t: number): string {
  const p = (h: string, i: number): number => parseInt(h.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) =>
      Math.round(p(a, i) + (p(b, i) - p(a, i)) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * D-035: a rounded surface across `axis` (x1 y1 → x2 y2, the part's width): reflected light at
 * the far edge, a highlight near the lit (left) edge, the body colour, then the shadow side.
 */
function roundGradient(
  x: Ctx,
  axis: readonly [number, number, number, number],
  fill: string,
  shadow: string,
  hi: string,
): { id: string; svg: string } {
  const id = uid(x, 'gr');
  const stop = (o: number, c: string): string => el('stop', { offset: o, 'stop-color': c });
  return {
    id,
    svg: el(
      'linearGradient',
      { id, x1: axis[0], y1: axis[1], x2: axis[2], y2: axis[3], gradientUnits: 'userSpaceOnUse' },
      stop(0, mixHex(shadow, fill, 0.5)),
      stop(0.14, hi),
      stop(0.3, fill),
      stop(0.66, mixHex(fill, shadow, 0.75)),
      stop(0.9, mixHex(shadow, '#000000', 0.18)),
      stop(1, mixHex(shadow, hi, 0.35)),
    ),
  };
}

/**
 * A shape with painterly shading (D-035): a rounded gradient across `axis` when given (else a flat
 * fill), a soft shadow (right edge, light from the top left), a soft highlight, details, and a thin
 * outline tinted toward the shadow colour.
 */
function shaded(
  x: Ctx,
  d: string,
  fill: string,
  shadow: string,
  hi: string,
  shadowD: string,
  hiD: string,
  extra = '',
  axis?: readonly [number, number, number, number],
): string {
  const id = uid(x, 'c');
  const grad = axis === undefined ? null : roundGradient(x, axis, fill, shadow, hi);
  return [
    grad?.svg ?? '',
    el('clipPath', { id }, el('path', { d })),
    el('path', { d, fill: grad === null ? fill : `url(#${grad.id})` }),
    el('path', { d: shadowD, fill: shadow, opacity: 0.4, 'clip-path': `url(#${id})` }),
    el('path', { d: hiD, fill: hi, opacity: 0.45, 'clip-path': `url(#${id})` }),
    extra === '' ? '' : g({ 'clip-path': `url(#${id})` }, extra),
    el('path', {
      d,
      fill: 'none',
      // The part's own material, a shade darker (not its shadow tone, which is near black).
      stroke: mixHex(mixHex(fill, shadow, 0.5), '#000000', 0.15),
      'stroke-width': 1.4,
      'stroke-linejoin': 'round',
    }),
  ].join('');
}

/** A slotted screw head (D-035): domed steel, a slot at `rot` degrees, a glint. */
function screw(x: Ctx, cx: number, cy: number, r: number, rot: number): string {
  const a = (rot * Math.PI) / 180;
  const dx = Math.cos(a) * r * 0.8;
  const dy = Math.sin(a) * r * 0.8;
  return [
    el('path', {
      d: ellipseD(cx, cy, r, r),
      fill: x.c('steel'),
      stroke: x.c('steelShadow'),
      'stroke-width': Math.max(0.8, r * 0.25),
    }),
    el('path', {
      d: `M${r2(cx - dx)} ${r2(cy - dy)}L${r2(cx + dx)} ${r2(cy + dy)}`,
      stroke: x.c('bluedShadow'),
      'stroke-width': Math.max(0.8, r * 0.35),
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: ellipseD(cx - r * 0.35, cy - r * 0.4, r * 0.3, r * 0.22),
      fill: x.c('steelHi'),
    }),
  ].join('');
}

/** A sling swivel (D-035): a stud on the wood and a steel loop hanging from it. */
function swivel(x: Ctx, cx: number, cy: number, rot: number): string {
  const loop = place(
    [
      [-7, 0],
      [-8, 9],
      [0, 15],
      [8, 9],
      [7, 0],
    ],
    cx,
    cy,
    rot,
  );
  return [
    el('path', { d: ellipseD(cx, cy, 4.5, 3.2), fill: x.c('steelShadow') }),
    el('path', {
      d: smoothD(loop, false, 0.9),
      fill: 'none',
      stroke: x.c('steelShadow'),
      'stroke-width': 3.6,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: smoothD(loop, false, 0.9),
      fill: 'none',
      stroke: x.c('steelHi'),
      'stroke-width': 1.2,
      'stroke-linecap': 'round',
      opacity: 0.8,
    }),
    screw(x, cx, cy, 2.4, rot + 30),
  ].join('');
}

/** Wavy wood grain lines running along a part (bounding box), clipped by the caller. */
function grain(
  x: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  seed: number,
  n = 7,
): string {
  // D-035 round 2: dense fine grain running along the part (long, nearly straight, gently
  // drifting lines), under it a few darker figure bands. No wavy cartoon lines, no knots.
  const rnd = prng(seed);
  const lines: string[] = [];
  const dense = n * 3;
  for (let k = 0; k < dense; k++) {
    const fx = x0 + ((k + rnd()) / dense) * (x1 - x0);
    const drift = (rnd() - 0.5) * 10;
    const bend = (rnd() - 0.5) * 4;
    lines.push(
      `M${r2(fx)} ${r2(y0)}Q${r2(fx + bend + drift / 2)} ${r2((y0 + y1) / 2)} ${r2(fx + drift)} ${r2(y1)}`,
    );
  }
  let figure = '';
  for (let k = 0; k < Math.max(3, Math.round(n / 2)); k++) {
    const fx = x0 + rnd() * (x1 - x0);
    const w0 = 2 + rnd() * 5;
    const drift = (rnd() - 0.5) * 14;
    figure += `M${r2(fx - w0)} ${r2(y0)}Q${r2(fx + drift / 2)} ${r2((y0 + y1) / 2)} ${r2(fx + drift - w0 * 0.6)} ${r2(y1)}L${r2(fx + drift + w0 * 0.6)} ${r2(y1)}Q${r2(fx + drift / 2 + w0)} ${r2((y0 + y1) / 2)} ${r2(fx + w0)} ${r2(y0)}Z`;
  }
  return (
    el('path', { d: figure, fill: x.c('woodGrain'), opacity: 0.22 }) +
    el('path', {
      d: lines.join(''),
      fill: 'none',
      stroke: x.c('woodGrain'),
      'stroke-width': 0.55,
      'stroke-linecap': 'round',
      opacity: 0.38,
    })
  );
}

/** Short light scratches on metal (wear). */
function scratches(
  x: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  seed: number,
  n = 5,
): string {
  const rnd = prng(seed);
  let d = '';
  for (let k = 0; k < n; k++) {
    const sx = x0 + rnd() * (x1 - x0);
    const sy = y0 + rnd() * (y1 - y0);
    const len = 3 + rnd() * 7;
    const a = -0.6 + rnd() * 1.2;
    d += `M${r2(sx)} ${r2(sy)}l${r2(Math.sin(a) * len)} ${r2(-Math.cos(a) * len * 0.4)}`;
  }
  return el('path', {
    d,
    fill: 'none',
    stroke: x.c('scratch'),
    'stroke-width': 0.7,
    'stroke-linecap': 'round',
    opacity: 0.45,
  });
}

/** A tapered part in perspective: half-widths at the top and the bottom. */
function taper(cx: number, yTop: number, wTop: number, yBot: number, wBot: number): Pt[] {
  return [
    [cx - wTop, yTop],
    [cx + wTop, yTop],
    [cx + wBot, yBot],
    [cx - wBot, yBot],
  ];
}

const shadowRight = (pts: readonly Pt[], frac = 0.32): string => {
  // The right `frac` of a tapered quad.
  const [tl, tr, br, bl] = pts as [Pt, Pt, Pt, Pt];
  const lerp = (a: Pt, b: Pt, t: number): Pt => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ];
  return polyD([lerp(tl, tr, 1 - frac), tr, br, lerp(bl, br, 1 - frac)]);
};
const hiStripe = (pts: readonly Pt[], at = 0.22, w = 0.12): string => {
  const [tl, tr, br, bl] = pts as [Pt, Pt, Pt, Pt];
  const lerp = (a: Pt, b: Pt, t: number): Pt => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ];
  return polyD([lerp(tl, tr, at), lerp(tl, tr, at + w), lerp(bl, br, at + w), lerp(bl, br, at)]);
};

/** The right-hand side face of a part seen in 3/4 view (darker, behind the front face). */
function sideFace(x: Ctx, pts: readonly Pt[], colour: string, depth: number): string {
  if (pts.length !== 4 || depth <= 0) return '';
  const [, tr, br] = pts as [Pt, Pt, Pt, Pt];
  return inked(
    polyD([
      tr,
      [tr[0] + depth * 0.6, tr[1] + depth * 0.5],
      [br[0] + depth, br[1] + depth * 0.4],
      br,
    ]),
    colour,
    x.ink,
    x.L,
  );
}

function metal(
  x: Ctx,
  pts: readonly Pt[],
  kind: 'steel' | 'blued' | 'brass',
  seed: number,
  wear = true,
  depth = 0,
): string {
  const [x0, y0] = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))];
  const [x1, y1] = [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
  // Across the part (left edge → right edge at mid height): the rounded-surface gradient axis.
  const [tl, tr, br, bl] = (pts.length === 4 ? pts : [pts[0], pts[1], pts[2], pts[3]]) as [
    Pt,
    Pt,
    Pt,
    Pt,
  ];
  const axis: [number, number, number, number] = [
    (tl[0] + bl[0]) / 2,
    (tl[1] + bl[1]) / 2,
    (tr[0] + br[0]) / 2,
    (tr[1] + br[1]) / 2,
  ];
  // A crisp specular line and bright wear on the lit edge.
  const spec = (t: number): string => {
    const a: Pt = [tl[0] + (tr[0] - tl[0]) * t, tl[1] + (tr[1] - tl[1]) * t];
    const b: Pt = [bl[0] + (br[0] - bl[0]) * t, bl[1] + (br[1] - bl[1]) * t];
    return `M${r2(a[0])} ${r2(a[1] + 3)}L${r2(b[0])} ${r2(b[1] - 3)}`;
  };
  // D-035 round 2: a long soft specular along the top of the tube (a wide faint band with a
  // fine bright core), and the bluing worn to grey steel along both edges.
  const worn = (t: number, o: number): string =>
    el('path', {
      d: spec(t),
      stroke: x.c('scratch'),
      'stroke-width': 2.2,
      opacity: o,
      'stroke-linecap': 'round',
    });
  const detail =
    el('path', {
      d: spec(0.2),
      stroke: '#FFFFFF',
      'stroke-width': Math.max(3, (Math.hypot(tr[0] - tl[0], tr[1] - tl[1]) || 10) * 0.16),
      opacity: 0.16,
      'stroke-linecap': 'round',
    }) +
    el('path', {
      d: spec(0.2),
      stroke: '#FFFFFF',
      'stroke-width': 0.9,
      opacity: 0.5,
      'stroke-linecap': 'round',
    }) +
    (wear ? worn(0.03, 0.35) + worn(0.97, 0.22) + scratches(x, x0, y0, x1, y1, seed) : '');
  return (
    sideFace(x, pts, x.c(`${kind}Shadow`), depth) +
    shaded(
      x,
      polyD(pts),
      x.c(kind),
      x.c(`${kind}Shadow`),
      x.c(`${kind}Hi`),
      shadowRight(pts),
      hiStripe(pts),
      detail,
      axis,
    )
  );
}

/** A wood part: smooth outline, shadow on the right, a highlight, grain. */
function wood(x: Ctx, pts: readonly Pt[], seed: number, light = false, smooth = 0.6): string {
  const d = smoothD(pts, true, smooth);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const w = x1 - x0;
  const shadowD = polyD([
    [x0 + w * 0.62, y0 - 5],
    [x1 + 10, y0 - 5],
    [x1 + 10, y1 + 5],
    [x0 + w * 0.72, y1 + 5],
  ]);
  const hiD = polyD([
    [x0 + w * 0.12, y0],
    [x0 + w * 0.22, y0],
    [x0 + w * 0.18, y1],
    [x0 + w * 0.06, y1],
  ]);
  const base = x.c(light ? 'lightWood' : 'wood');
  const dark = x.c(light ? 'lightWoodShadow' : 'woodShadow');
  const hi = x.c(light ? 'lightWoodHi' : 'woodHi');
  // D-035 round 2: the stain darkens toward the edges (a second gradient over the lit one), and
  // a long varnish highlight runs down the lit side.
  const stain = uid(x, 'st');
  const varnish = `M${r2(x0 + w * 0.2)} ${r2(y0 + 4)}Q${r2(x0 + w * 0.17)} ${r2((y0 + y1) / 2)} ${r2(
    x0 + w * 0.12,
  )} ${r2(y1 - 4)}`;
  const extra =
    el(
      'linearGradient',
      { id: stain, x1: x0, y1: 0, x2: x1, y2: 0, gradientUnits: 'userSpaceOnUse' },
      el('stop', { offset: 0, 'stop-color': '#1A0E06', 'stop-opacity': 0.55 }),
      el('stop', { offset: 0.14, 'stop-color': '#1A0E06', 'stop-opacity': 0 }),
      el('stop', { offset: 0.82, 'stop-color': '#1A0E06', 'stop-opacity': 0 }),
      el('stop', { offset: 1, 'stop-color': '#1A0E06', 'stop-opacity': 0.6 }),
    ) +
    grain(x, x0, y0, x1, y1, seed, Math.max(6, Math.round(w / 10))) +
    el('path', {
      d: polyD([
        [x0 - 2, y0 - 2],
        [x1 + 2, y0 - 2],
        [x1 + 2, y1 + 2],
        [x0 - 2, y1 + 2],
      ]),
      fill: `url(#${stain})`,
    }) +
    el('path', {
      d: varnish,
      fill: 'none',
      stroke: '#FFF4DC',
      'stroke-width': Math.max(3, w * 0.05),
      opacity: 0.16,
      'stroke-linecap': 'round',
    }) +
    el('path', {
      d: varnish,
      fill: 'none',
      stroke: '#FFF4DC',
      'stroke-width': 1,
      opacity: 0.35,
      'stroke-linecap': 'round',
    });
  return shaded(x, d, base, dark, hi, shadowD, hiD, extra, [x0, (y0 + y1) / 2, x1, (y0 + y1) / 2]);
}

/** Diamond checkering on a grip (thin crossing lines), clipped to a quad. */
function checkering(x: Ctx, pts: readonly Pt[]): string {
  const id = uid(x, 'k');
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let d = '';
  for (let k = x0 - (y1 - y0); k < x1 + (y1 - y0); k += 5.5) {
    d += `M${r2(k)} ${r2(y0)}L${r2(k + (y1 - y0) * 0.6)} ${r2(y1)}M${r2(k)} ${r2(y1)}L${r2(k + (y1 - y0) * 0.6)} ${r2(y0)}`;
  }
  return [
    el('clipPath', { id }, el('path', { d: polyD(pts) })),
    el('path', {
      d,
      stroke: x.c('woodShadow'),
      'stroke-width': 0.9,
      fill: 'none',
      opacity: 0.85,
      'clip-path': `url(#${id})`,
    }),
    // The checkered panel's cut border.
    el('path', {
      d: polyD(pts),
      fill: 'none',
      stroke: x.c('woodGrain'),
      'stroke-width': 1.1,
      opacity: 0.7,
    }),
  ].join('');
}

/** A soft smoke wisp (cloud of circles), drawn with an outline. */
function smoke(x: Ctx, cx: number, cy: number, size: number, alpha: number, seed: number): string {
  if (size <= 0 || alpha <= 0) return '';
  const rnd = prng(seed);
  const circles: string[] = [ellipseD(cx, cy, 16 * size, 14 * size)];
  for (let k = 0; k < 5; k++) {
    const a = rnd() * Math.PI * 2;
    const d = 14 * size;
    circles.push(
      ellipseD(
        cx + Math.cos(a) * d,
        cy + Math.sin(a) * d * 0.8 - 6 * size,
        (10 + rnd() * 8) * size,
        (9 + rnd() * 7) * size,
      ),
    );
  }
  const d = circles.join('');
  return g(
    { opacity: alpha },
    el('path', { d, fill: 'none', stroke: x.c('smokeShadow'), 'stroke-width': x.inner * 1.6 }),
    el('path', { d, fill: x.c('smoke') }),
    el('path', {
      d: ellipseD(cx + 5 * size, cy + 6 * size, 10 * size, 6 * size),
      fill: x.c('smokeShadow'),
    }),
  );
}

/** A red shotgun shell seen end-on or flying (brass head + red hull). */
function shell(x: Ctx, cx: number, cy: number, rot: number, s = 1): string {
  const hull = place(
    [
      [-7, -16],
      [7, -16],
      [7, 8],
      [-7, 8],
    ],
    cx,
    cy,
    rot,
    s,
    s,
  );
  const head = place(
    [
      [-8, 8],
      [8, 8],
      [8, 16],
      [-8, 16],
    ],
    cx,
    cy,
    rot,
    s,
    s,
  );
  return (
    inked(polyD(hull), x.c('shellRed'), x.ink, x.inner) +
    inked(polyD(head), x.c('brass'), x.ink, x.inner)
  );
}

/** End-on chamber: dark bore or a shell rim (brass ring, red centre). */
function chamber(
  x: Ctx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  state: 'empty' | 'spent' | 'fresh',
): string {
  const out = [inked(ellipseD(cx, cy, rx, ry), x.c('steelShadow'), x.ink, x.inner)];
  if (state === 'empty')
    out.push(el('path', { d: ellipseD(cx, cy, rx * 0.7, ry * 0.7), fill: x.ink }));
  else {
    out.push(
      inked(
        ellipseD(cx, cy, rx * 0.85, ry * 0.85),
        x.c(state === 'fresh' ? 'brassHi' : 'brassShadow'),
        x.ink,
        x.inner * 0.8,
      ),
    );
    out.push(
      el('path', {
        d: ellipseD(cx, cy, rx * 0.3, ry * 0.3),
        fill: x.c(state === 'fresh' ? 'shellRed' : 'shellRedShadow'),
      }),
    );
  }
  return out.join('');
}

// --- the guns ---------------------------------------------------------------------------------

interface DubbelState {
  readonly lever: number;
  readonly open: number;
  readonly shells: 'none' | 'spent' | 'fresh' | 'hidden';
  readonly eject: number;
  readonly smoke: number;
  readonly glow: number;
}

function stockButt(x: Ctx, top: number, seed: number, light = false): string {
  // In 3/4 view the butt swings out toward the player's shoulder (bottom right) and shows its
  // comb (the side face) on the right.
  const comb: Pt[] = [
    [34, top],
    [48, top + 8],
    [60, top + 64],
    [128, 4],
    [104, 4],
    [42, top + 60],
  ];
  // D-035 round 2: the wrist narrows, then the pistol grip swells out on the left before the
  // stock flares to the butt; a comb line runs down its top and a rubber butt pad closes it.
  const pts: Pt[] = [
    [-36, top],
    [36, top],
    [40, top + 40],
    [46, top + 66],
    [104, 4],
    [-74, 4],
    [-66, top + 128],
    [-62, top + 96],
    [-38, top + 72],
    [-30, top + 40],
  ];
  const side = smoothD(comb, true, 0.35);
  const combLine = `M${r2(30)} ${r2(top + 10)}Q${r2(40)} ${r2(top + 70)} ${r2(96)} ${r2(-2)}`;
  const pad = polyD([
    [-76, 4],
    [106, 4],
    [104, -8],
    [-72, -8],
  ]);
  const wrist: Pt[] = [
    [-32, top + 4],
    [32, top + 4],
    [36, top + 56],
    [-34, top + 56],
  ];
  const stockD = smoothD(pts, true, 0.35);
  return (
    inked(side, x.c(light ? 'lightWoodShadow' : 'woodShadow'), x.ink, x.L) +
    wood(x, pts, seed, light, 0.35) +
    // The receiver's soft shadow on the wrist (light from the top left).
    contactShadow(
      x,
      polyD([
        [-46, top - 40],
        [46, top - 40],
        [46, top + 4],
        [-46, top + 4],
      ]),
      stockD,
      3,
      7,
      0.5,
    ) +
    el('path', {
      d: combLine,
      fill: 'none',
      stroke: x.c('woodHi'),
      'stroke-width': 1.2,
      opacity: 0.45,
    }) +
    el('path', {
      d: combLine,
      fill: 'none',
      stroke: x.c('woodGrain'),
      'stroke-width': 0.8,
      opacity: 0.5,
      transform: 'translate(2 1)',
    }) +
    // Rubber butt pad with a white-line spacer.
    el('path', { d: pad, fill: '#24201D', stroke: '#14110F', 'stroke-width': 1 }) +
    el('path', { d: 'M-73 -8L104 -8', stroke: '#E9E2D2', 'stroke-width': 1.6, opacity: 0.8 }) +
    el('path', { d: 'M-60 -2L20 -2M40 -2L98 -2', stroke: '#3A3430', 'stroke-width': 0.8 }) +
    checkering(x, wrist) +
    triggerGuard(x, top) +
    // Tang screw behind the guard, the rear sling swivel under the butt, buttplate screws.
    screw(x, 38, top + 66, 3, 25) +
    swivel(x, 80, -40, -30) +
    screw(x, -40, -8, 3.2, 70) +
    screw(x, 70, -8, 3.2, 10)
  );
}

/** Steel trigger guard and trigger(s) peeking out on the right of the wrist (3/4 view). */
function triggerGuard(x: Ctx, top: number): string {
  // D-035 round 2: a slim forged bow (a thin steel band, not a disc) around a dark opening, and
  // narrow blade triggers; lit from the top left.
  const outer: Pt[] = [
    [34, top + 6],
    [54, top + 4],
    [66, top + 20],
    [64, top + 46],
    [48, top + 58],
    [36, top + 52],
  ];
  const inner: Pt[] = [
    [38, top + 11],
    [53, top + 10],
    [61, top + 22],
    [59, top + 43],
    [47, top + 53],
    [39, top + 47],
  ];
  const loop = smoothD(outer, true, 0.8);
  const hole = smoothD(inner, true, 0.8);
  const gid = uid(x, 'tg');
  const trig = (dx: number) =>
    inked(
      `M${r2(45 + dx)} ${r2(top + 14)}Q${r2(52 + dx)} ${r2(top + 26)} ${r2(48 + dx)} ${r2(top + 38)}L${r2(46 + dx)} ${r2(top + 37)}Q${r2(49 + dx)} ${r2(top + 26)} ${r2(43 + dx)} ${r2(top + 15)}Z`,
      x.c('steel'),
      x.ink,
      1,
    );
  return [
    el(
      'linearGradient',
      { id: gid, x1: 34, y1: top, x2: 66, y2: top + 58, gradientUnits: 'userSpaceOnUse' },
      el('stop', { offset: 0, 'stop-color': x.c('steelHi') }),
      el('stop', { offset: 0.5, 'stop-color': x.c('steel') }),
      el('stop', { offset: 1, 'stop-color': x.c('steelShadow') }),
    ),
    el('path', { d: hole, fill: '#1E1712' }),
    trig(0),
    trig(7),
    el('path', {
      d: loop + hole,
      fill: `url(#${gid})`,
      'fill-rule': 'evenodd',
      stroke: mixHex(x.c('steelShadow'), '#000000', 0.3),
      'stroke-width': 1,
      'stroke-linejoin': 'round',
    }),
  ].join('');
}

function muzzleGlow(x: Ctx, cx: number, cy: number, a: number): string {
  if (a <= 0) return '';
  return g(
    { opacity: a },
    el('path', { d: ellipseD(cx, cy, 14, 8), fill: x.c('flashOuter') }),
    el('path', { d: ellipseD(cx, cy, 8, 4.5), fill: x.c('flashCore') }),
  );
}

function dubbelloop(x: Ctx, s: DubbelState): string {
  const hinge = -236;
  const k = 1 - 0.62 * s.open;
  const top = hinge + (MUZZLE_Y - hinge) * k;
  // Two barrels converging toward the muzzle (perspective): centres ±9 there, ±21 at the breech.
  const bar = (side: -1 | 1): Pt[] => {
    const wTop = 8 * (1 + 0.25 * s.open);
    const cTop = side * 9 * (1 + 0.4 * s.open);
    const cBot = side * 21;
    return [
      [cTop - wTop, top],
      [cTop + wTop, top],
      [cBot + 21, hinge],
      [cBot - 21, hinge],
    ];
  };

  const out: string[] = [];
  // Stock and action first (barrels lie on top of the action when closed).
  out.push(stockButt(x, -162, 11));
  out.push(
    metal(
      x,
      [
        [-52, -244],
        [52, -244],
        [46, -160],
        [-46, -160],
      ],
      'steel',
      3,
      true,
      14,
    ),
  );
  // Engraving scrolls on the action.
  out.push(
    el('path', {
      d: 'M-38 -222q10 -10 20 0t20 0q6 -6 10 0M-4 -200q10 -10 20 0t20 0M-34 -184q8 -8 16 0t12 2M-40 -206q5 -5 10 0M20 -226q5 -6 10 0t8 2',
      fill: 'none',
      stroke: x.c('steelShadow'),
      'stroke-width': 0.9,
      'stroke-linecap': 'round',
    }),
  );
  // Safety slide.
  out.push(
    inked(
      polyD([
        [-6, -178],
        [6, -178],
        [6, -166],
        [-6, -166],
      ]),
      x.c('steelHi'),
      x.ink,
      x.inner,
    ),
  );
  // Fore-end under the barrels (drops with them).
  // A slim splinter fore-end: only its edges show beside the barrels from behind.
  const fore: Pt[] = [
    [-34, hinge + (-372 - hinge) * k],
    [34, hinge + (-372 - hinge) * k],
    [47, hinge - 22 * k],
    [-47, hinge - 22 * k],
  ];
  out.push(wood(x, fore, 21, false, 0.4));
  out.push(contactShadow(x, polyD(bar(-1)) + polyD(bar(1)), smoothD(fore, true, 0.4), 4, 6, 0.55));
  // Barrels with a fine rib between them.
  for (const side of [-1, 1] as const)
    out.push(metal(x, bar(side), 'blued', 30 + side, true, side === 1 ? 7 : 0));
  out.push(
    el('path', {
      d: polyD(taper(0, top - 2, 1.5, hinge, 2.6)),
      fill: x.c('bluedHi'),
      opacity: 0.8,
    }),
  );
  // Muzzle rims and the brass bead.
  for (const side of [-1, 1] as const)
    out.push(
      inked(
        ellipseD(
          side * 11 * (1 + (0.15 * (top - MUZZLE_Y)) / 300),
          top,
          11 * (1 + 0.25 * s.open),
          4 + 6 * s.open,
        ),
        x.c('bluedShadow'),
        x.ink,
        x.inner,
      ),
    );
  if (s.open < 0.2) out.push(inked(ellipseD(0, top - 5, 4.5, 4.5), x.c('brassHi'), x.ink, x.inner));
  for (const side of [-1, 1] as const) out.push(muzzleGlow(x, side * 9, top, s.glow));
  // Breech faces show when the gun is broken open.
  if (s.open > 0.3) {
    const ry = 13 * s.open;
    for (const side of [-1, 1] as const)
      out.push(
        chamber(
          x,
          side * 21,
          hinge - 4,
          17,
          ry,
          s.shells === 'none' || s.shells === 'hidden' ? 'empty' : s.shells,
        ),
      );
  }
  // Top lever: swings right to open.
  const lev = place(
    [
      [-5, 0],
      [5, 0],
      [7, -34],
      [-3, -36],
    ],
    0,
    -206,
    10 + s.lever * 55,
  );
  out.push(metal(x, lev, 'steel', 5, false));
  // Ejected spent shells flying up and right.
  if (s.eject > 0) {
    out.push(shell(x, 40 + s.eject * 70, -260 - s.eject * 90, 40 + s.eject * 200));
    out.push(shell(x, 70 + s.eject * 90, -230 - s.eject * 60, 120 + s.eject * 160));
  }
  // Muzzle smoke wisps drift up and to the left.
  out.push(
    smoke(
      x,
      -16 - s.smoke * 10,
      MUZZLE_Y - 22 - s.smoke * 30,
      0.6 + s.smoke * 0.7,
      s.smoke > 0 ? 1 - s.smoke * 0.55 : 0,
      5,
    ),
  );
  out.push(
    smoke(
      x,
      18 - s.smoke * 6,
      MUZZLE_Y - 18 - s.smoke * 36,
      0.5 + s.smoke * 0.6,
      s.smoke > 0 ? 1 - s.smoke * 0.6 : 0,
      6,
    ),
  );
  return out.join('');
}

function windbuks(x: Ctx, puff: number): string {
  const out: string[] = [];
  out.push(stockButt(x, -128, 41, true));
  // Compression cylinder / breech block, blued, with the cocking slot.
  out.push(
    metal(
      x,
      [
        [-24, -236],
        [24, -236],
        [27, -124],
        [-27, -124],
      ],
      'blued',
      7,
      true,
      10,
    ),
  );
  out.push(
    inked(
      polyD([
        [-4, -220],
        [4, -220],
        [4, -150],
        [-4, -150],
      ]),
      x.c('bluedShadow'),
      x.ink,
      x.inner,
    ),
  );
  // Slim barrel with the breech joint.
  out.push(metal(x, taper(0, MUZZLE_Y + 6, 5.5, -236, 14), 'blued', 8, true, 5));
  out.push(inked(ellipseD(0, -240, 18, 7), x.c('bluedHi'), x.ink, x.inner));
  // Front sight hood and rear sight leaf.
  out.push(
    metal(
      x,
      [
        [-11, MUZZLE_Y - 6],
        [11, MUZZLE_Y - 6],
        [10, MUZZLE_Y + 16],
        [-10, MUZZLE_Y + 16],
      ],
      'steel',
      9,
      false,
    ),
  );
  out.push(
    inked(
      polyD([
        [-14, -272],
        [14, -272],
        [12, -262],
        [-12, -262],
      ]),
      x.c('steelHi'),
      x.ink,
      x.inner,
    ),
  );
  out.push(el('path', { d: 'M-3 -272L3 -272L2 -266L-2 -266Z', fill: x.ink }));
  // Air puff ring (no fire: an air rifle).
  if (puff > 0)
    out.push(
      g(
        { opacity: 1 - puff * 0.7 },
        el('path', {
          d: ellipseD(0, MUZZLE_Y - 14 - puff * 26, 8 + puff * 16, 4 + puff * 7),
          fill: 'none',
          stroke: x.c('smokeShadow'),
          'stroke-width': x.inner * 1.8,
        }),
        el('path', {
          d: ellipseD(0, MUZZLE_Y - 14 - puff * 26, 8 + puff * 16, 4 + puff * 7),
          fill: 'none',
          stroke: x.c('smoke'),
          'stroke-width': x.inner * 0.9,
        }),
      ),
    );
  return out.join('');
}

/** v1.3 (D-036) Die Twee-Twee, a generic .22 bolt-action: a slim blued barrel, a round receiver
 *  with the bolt and its handle on the right (bolt 0 = closed, 1 = lifted and drawn back), a small
 *  box magazine under it (mag 0 = in, 1 = out), a walnut stock. Little smoke, a small flash. */
function tweeTwee(
  x: Ctx,
  s: { bolt: number; eject: number; smoke: number; glow: number; mag: number },
): string {
  const out: string[] = [];
  out.push(stockButt(x, -138, 81));
  // Slim tapered barrel, front blade on a ramp, rear leaf further back.
  out.push(metal(x, taper(0, MUZZLE_Y + 4, 6.5, -246, 15), 'blued', 82, true, 5));
  out.push(muzzleGlow(x, 0, MUZZLE_Y, s.glow));
  out.push(
    metal(
      x,
      [
        [-8, MUZZLE_Y + 6],
        [8, MUZZLE_Y + 6],
        [9, MUZZLE_Y + 26],
        [-9, MUZZLE_Y + 26],
      ],
      'blued',
      83,
      false,
    ),
  );
  out.push(
    el('path', {
      d: `M-1.6 ${MUZZLE_Y - 4}L1.6 ${MUZZLE_Y - 4}L1.8 ${MUZZLE_Y + 8}L-1.8 ${MUZZLE_Y + 8}Z`,
      fill: x.c('bluedShadow'),
    }),
  );
  out.push(
    metal(
      x,
      [
        [-13, -330],
        [13, -330],
        [12, -318],
        [-12, -318],
      ],
      'blued',
      84,
      false,
    ),
  );
  out.push(el('path', { d: 'M-2.6 -331L2.6 -331L2 -324L-2 -324Z', fill: x.c('bluedShadow') }));
  // Round receiver (a tube with a lit top line) and the bolt sliding in it.
  const rec: Pt[] = [
    [-22, -252],
    [22, -252],
    [24, -140],
    [-24, -140],
  ];
  out.push(metal(x, rec, 'blued', 85, true, 9));
  // Ejection port on the right: dark while closed, the bolt's bright body showing while open.
  const dy = s.bolt * 46;
  out.push(
    inked(
      polyD([
        [6, -236],
        [20, -236],
        [21, -196],
        [7, -196],
      ]),
      s.bolt > 0.3 ? x.c('steelHi') : x.c('bluedShadow'),
      x.ink,
      x.inner,
    ),
  );
  // Bolt handle: a shank out to the right with a round knob; lifted and drawn back toward the
  // player while the bolt works.
  const lift = Math.min(1, s.bolt * 2);
  const kx = 52 - lift * 18;
  const ky = -168 + dy - lift * 26;
  out.push(
    el('path', {
      d: `M22 ${r2(-176 + dy)}L${r2(kx)} ${r2(ky)}`,
      stroke: x.c('steel'),
      'stroke-width': 6,
      'stroke-linecap': 'round',
    }),
  );
  out.push(
    el('path', {
      d: `M22 ${r2(-176 + dy)}L${r2(kx)} ${r2(ky)}`,
      stroke: x.c('steelHi'),
      'stroke-width': 1.6,
      'stroke-linecap': 'round',
      opacity: 0.7,
    }),
  );
  out.push(inked(ellipseD(kx, ky, 8.5, 8), x.c('steel'), x.c('steelShadow'), x.inner));
  out.push(el('path', { d: ellipseD(kx - 2.5, ky - 2.5, 3, 2.6), fill: '#FFFFFF', opacity: 0.35 }));
  // The bolt's rear (shroud) behind the receiver, drawn back with the bolt.
  out.push(
    metal(
      x,
      [
        [-15, -146 + dy],
        [15, -146 + dy],
        [14, -128 + dy],
        [-14, -128 + dy],
      ],
      'steel',
      86,
      false,
    ),
  );
  // Five-round box magazine under the receiver (it drops out for the reload).
  const my = s.mag * 70;
  out.push(
    g(
      { opacity: 1 - s.mag * 0.6 },
      metal(
        x,
        [
          [-14, -222 + my],
          [10, -222 + my],
          [9, -176 + my],
          [-13, -176 + my],
        ],
        'blued',
        87,
        false,
        5,
      ),
    ),
  );
  // An empty .22 case flicks out of the port, small and bright.
  if (s.eject > 0) {
    const cx = 30 + s.eject * 70;
    const cy = -214 - s.eject * 60;
    const c = place(
      [
        [-2.4, -7],
        [2.4, -7],
        [2.4, 7],
        [-2.4, 7],
      ],
      cx,
      cy,
      40 + s.eject * 300,
      1,
      1,
    );
    out.push(inked(polyD(c), x.c('brass'), x.c('brassShadow'), x.inner * 0.6));
  }
  out.push(
    smoke(
      x,
      -4 - s.smoke * 8,
      MUZZLE_Y - 16 - s.smoke * 26,
      0.45 + s.smoke * 0.5,
      s.smoke > 0 ? 0.8 - s.smoke * 0.55 : 0,
      9,
    ),
  );
  return out.join('');
}

/** v1.4 (D-038) Die Langloop: a heavy bolt-action with a long variable scope on top. */
function langloop(
  x: Ctx,
  s: { bolt: number; eject: number; smoke: number; glow: number; load: number },
): string {
  const out: string[] = [];
  out.push(stockButt(x, -132, 91));
  // Heavy tapered barrel with a slotted muzzle brake.
  out.push(metal(x, taper(0, MUZZLE_Y + 22, 9, -246, 18), 'blued', 92, true, 6));
  out.push(muzzleGlow(x, 0, MUZZLE_Y, s.glow));
  out.push(
    metal(
      x,
      [
        [-11, MUZZLE_Y - 2],
        [11, MUZZLE_Y - 2],
        [11, MUZZLE_Y + 26],
        [-11, MUZZLE_Y + 26],
      ],
      'blued',
      93,
      false,
      4,
    ),
  );
  for (const dy of [6, 14]) {
    out.push(
      el('path', {
        d: `M-11 ${MUZZLE_Y + dy}L11 ${MUZZLE_Y + dy}L11 ${MUZZLE_Y + dy + 3}L-11 ${MUZZLE_Y + dy + 3}Z`,
        fill: x.c('bluedShadow'),
      }),
    );
  }
  // Receiver (a long tube) and the bolt.
  out.push(
    metal(
      x,
      [
        [-24, -262],
        [24, -262],
        [26, -136],
        [-26, -136],
      ],
      'blued',
      94,
      true,
      9,
    ),
  );
  const dy = s.bolt * 54;
  out.push(
    inked(
      polyD([
        [7, -246],
        [22, -246],
        [23, -198],
        [8, -198],
      ]),
      s.bolt > 0.3 ? x.c('steelHi') : x.c('bluedShadow'),
      x.ink,
      x.inner,
    ),
  );
  // Rounds pushed down into the open action while it reloads (three, one by one).
  if (s.load > 0) {
    const shown = Math.min(3, Math.ceil(s.load * 3));
    for (let k = 0; k < shown; k++) {
      const c = place(
        [
          [-3.2, -12],
          [3.2, -12],
          [3.2, 12],
          [-3.2, 12],
        ],
        14,
        -236 + k * 14,
        90,
        1,
        1,
      );
      out.push(inked(polyD(c), x.c('brass'), x.c('brassShadow'), x.inner * 0.6));
    }
  }
  // Bolt handle: a long shank down and out to the right with a big round knob.
  const lift = Math.min(1, s.bolt * 2);
  const kx = 60 - lift * 20;
  const ky = -160 + dy - lift * 30;
  for (const [colour, w, a] of [
    [x.c('steel'), 7, 1],
    [x.c('steelHi'), 1.8, 0.7],
  ] as const) {
    out.push(
      el('path', {
        d: `M24 ${r2(-172 + dy)}L${r2(kx)} ${r2(ky)}`,
        stroke: colour,
        'stroke-width': w,
        'stroke-linecap': 'round',
        opacity: a,
      }),
    );
  }
  out.push(inked(ellipseD(kx, ky, 10.5, 10), x.c('steel'), x.c('steelShadow'), x.inner));
  out.push(el('path', { d: ellipseD(kx - 3, ky - 3, 3.6, 3), fill: '#FFFFFF', opacity: 0.35 }));
  out.push(
    metal(
      x,
      [
        [-16, -142 + dy],
        [16, -142 + dy],
        [15, -122 + dy],
        [-15, -122 + dy],
      ],
      'steel',
      95,
      false,
    ),
  );
  // The scope on top: rings, the main tube, turrets, the wide objective bell and the eyepiece.
  for (const ry of [-250, -168]) {
    out.push(
      metal(
        x,
        [
          [-20, ry - 8],
          [20, ry - 8],
          [20, ry + 8],
          [-20, ry + 8],
        ],
        'blued',
        96 + ry,
        false,
      ),
    );
  }
  out.push(metal(x, taper(0, -300, 16, -140, 16), 'blued', 97, true, 7));
  out.push(metal(x, taper(0, -346, 27, -296, 17), 'blued', 98, true, 8));
  out.push(el('path', { d: ellipseD(0, -346, 24, 6), fill: x.c('bluedShadow'), opacity: 0.9 }));
  out.push(el('path', { d: ellipseD(-6, -347, 8, 2.2), fill: '#9FC3D8', opacity: 0.55 }));
  out.push(metal(x, taper(0, -150, 18, -118, 21), 'blued', 99, true, 6));
  // Elevation turret on top (a ribbed cap) and the windage turret on the right.
  out.push(
    metal(
      x,
      [
        [-9, -232],
        [9, -232],
        [9, -212],
        [-9, -212],
      ],
      'steel',
      100,
      false,
      3,
    ),
  );
  out.push(
    metal(
      x,
      [
        [16, -226],
        [30, -226],
        [30, -210],
        [16, -210],
      ],
      'steel',
      101,
      false,
      3,
    ),
  );
  // A long empty case flicks out of the port.
  if (s.eject > 0) {
    const c = place(
      [
        [-3.2, -12],
        [3.2, -12],
        [3.2, 12],
        [-3.2, 12],
      ],
      34 + s.eject * 80,
      -222 - s.eject * 66,
      40 + s.eject * 300,
      1,
      1,
    );
    out.push(inked(polyD(c), x.c('brass'), x.c('brassShadow'), x.inner * 0.6));
  }
  out.push(
    smoke(
      x,
      -4 - s.smoke * 10,
      MUZZLE_Y - 18 - s.smoke * 32,
      0.6 + s.smoke * 0.6,
      s.smoke > 0 ? 0.85 - s.smoke * 0.55 : 0,
      19,
    ),
  );
  return out.join('');
}

function kettie(
  x: Ctx,
  s: { pouchY: number; pouchS: number; stone: boolean; wobble: number },
): string {
  const out: string[] = [];
  const tipL: Pt = [-96, KETTIE_TIP_Y];
  const tipR: Pt = [96, KETTIE_TIP_Y];
  // Handle and fork: forked stick with bark, drawn as thick inked strokes.
  const forkD = `M0 6L0 -200M0 -200Q-40 -260 ${tipL[0]} ${tipL[1]}M0 -200Q40 -260 ${tipR[0]} ${tipR[1]}`;
  const stroke = (d: string, c: string, w: number, extra: Record<string, string | number> = {}) =>
    el('path', {
      d,
      fill: 'none',
      stroke: c,
      'stroke-width': w,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      ...extra,
    });
  out.push(stroke(forkD, mixHex(x.c('woodShadow'), '#000000', 0.35), 30 + 2.4));
  out.push(stroke(forkD, x.c('wood'), 30));
  out.push(stroke('M8 6L8 -196M8 -204Q42 -258 102 -398', x.c('woodShadow'), 10));
  out.push(stroke('M-8 0L-8 -190M-8 -206Q-36 -250 -86 -388', x.c('woodHi'), 5));
  // Bark rings and nicks, then D-035 bark texture: broken lines along the grain on both sides
  // of each limb, a knot, and a worn, polished patch where the hand holds it.
  out.push(
    stroke('M-14 -60l28 4M-14 -120l28 -3M-60 -300l14 12M58 -296l-12 14', x.c('woodGrain'), 1.6),
  );
  for (const [dx, dash, col, op] of [
    [-9, '12 7 4 9', 'woodGrain', 0.7],
    [6, '9 10 15 6', 'woodGrain', 0.6],
    [-3, '5 14 8 11', 'woodHi', 0.6],
  ] as const)
    out.push(
      g(
        { transform: `translate(${dx} 0)` },
        stroke(forkD, x.c(col), 1.4, { 'stroke-dasharray': dash, opacity: op }),
      ),
    );
  out.push(
    el('path', { d: ellipseD(4, -132, 6, 9), fill: x.c('woodShadow') }),
    el('path', { d: ellipseD(3, -133, 2.5, 4), fill: x.c('woodGrain') }),
    el('path', { d: ellipseD(-3, -40, 9, 34), fill: x.c('woodHi'), opacity: 0.25 }),
  );
  // Rubber bands from the fork tips to the pouch (wobble = a slight S when snapping forward).
  const pouch: Pt = [0, s.pouchY];
  const band = (tip: Pt): string => {
    const mid: Pt = [
      (tip[0] + pouch[0]) / 2 + s.wobble * 14,
      (tip[1] + pouch[1]) / 2 - s.wobble * 10,
    ];
    return `M${r2(tip[0])} ${r2(tip[1])}Q${r2(mid[0])} ${r2(mid[1])} ${r2(pouch[0] + Math.sign(tip[0]) * 16 * s.pouchS)} ${r2(pouch[1])}`;
  };
  for (const tip of [tipL, tipR]) {
    out.push(stroke(band(tip), mixHex(x.c('rubberShadow'), '#000000', 0.3), 9 + 2));
    out.push(stroke(band(tip), x.c('rubber'), 9));
    // Surgical tubing: a glossy highlight along the band, darker underside.
    out.push(
      g({ transform: 'translate(-2 0)' }, stroke(band(tip), '#F2A0A0', 2, { opacity: 0.7 })),
      g(
        { transform: 'translate(3 0)' },
        stroke(band(tip), x.c('rubberShadow'), 2.4, { opacity: 0.8 }),
      ),
    );
  }
  // Leather pouch (and the stone in it).
  const pd = smoothD(
    place(
      [
        [-24, -8],
        [0, -14],
        [24, -8],
        [26, 8],
        [0, 14],
        [-26, 8],
      ],
      pouch[0],
      pouch[1],
      0,
      s.pouchS,
      s.pouchS,
    ),
  );
  out.push(
    shaded(
      x,
      pd,
      x.c('leather'),
      x.c('leatherShadow'),
      x.c('leatherHi'),
      polyD([
        [0, pouch[1] - 30],
        [60, pouch[1] - 30],
        [60, pouch[1] + 30],
        [0, pouch[1] + 30],
      ]),
      polyD([
        [-20, pouch[1] - 12],
        [-8, pouch[1] - 12],
        [-8, pouch[1] - 6],
        [-20, pouch[1] - 6],
      ]),
    ),
  );
  if (s.stone)
    out.push(
      inked(
        ellipseD(0, pouch[1] - 6 * s.pouchS, 13 * s.pouchS, 10 * s.pouchS),
        x.c('stone'),
        x.ink,
        x.inner,
      ),
      el('path', {
        d: ellipseD(-4 * s.pouchS, pouch[1] - 10 * s.pouchS, 4 * s.pouchS, 3 * s.pouchS),
        fill: x.c('stoneHi'),
      }),
    );
  // Fork-tip binding knots.
  for (const tip of [tipL, tipR])
    out.push(inked(ellipseD(tip[0], tip[1] + 6, 12, 7), x.c('leatherShadow'), x.ink, x.inner));
  return out.join('');
}

function pomp(x: Ctx, s: { pump: number; eject: number; smoke: number; glow: number }): string {
  const out: string[] = [];
  out.push(stockButt(x, -150, 61));
  // Magazine tube peeking out under the barrel.
  out.push(metal(x, taper(0, -470, 14, -250, 31), 'blued', 62, false));
  // Barrel with a vent rib.
  out.push(metal(x, taper(0, MUZZLE_Y, 11, -240, 27), 'blued', 63, true, 8));
  // A fine vent rib along the top: a narrow lit strip with small posts.
  out.push(
    el('path', {
      d: polyD(taper(0, MUZZLE_Y - 2, 1.6, -240, 3)),
      fill: x.c('bluedHi'),
      opacity: 0.85,
    }),
  );
  out.push(
    el('path', {
      d: Array.from({ length: 14 }, (_, i) => {
        const y = MUZZLE_Y + 12 + i * 14;
        const w = 1.6 + (i / 14) * 1.4;
        return `M${r2(-w)} ${r2(y)}L${r2(w)} ${r2(y)}`;
      }).join(''),
      stroke: x.c('bluedShadow'),
      'stroke-width': 0.8,
    }),
  );
  out.push(inked(ellipseD(0, MUZZLE_Y - 3, 4.5, 4.5), x.c('brassHi'), x.ink, x.inner));
  out.push(muzzleGlow(x, 0, MUZZLE_Y, s.glow));
  // Receiver with the ejection port on the right.
  out.push(
    metal(
      x,
      [
        [-44, -244],
        [44, -244],
        [42, -146],
        [-42, -146],
      ],
      'blued',
      64,
      true,
      14,
    ),
  );
  out.push(
    inked(
      polyD([
        [24, -230],
        [38, -230],
        [37, -186],
        [23, -186],
      ]),
      s.pump > 0.4 ? x.c('shellRed') : x.ink,
      x.ink,
      x.inner,
    ),
  );
  // Ribbed pump fore-end slides back toward the player.
  const dy = s.pump * 68;
  // D-035: a slim grooved slide under the barrel and magazine tube (not a fat drum).
  const fore: Pt[] = [
    [-19, -414 + dy],
    [19, -414 + dy],
    [24, -282 + dy],
    [-24, -282 + dy],
  ];
  const barrelD = polyD(taper(0, MUZZLE_Y, 11, -240, 27));
  out.push(wood(x, fore, 65, false, 0.5));
  out.push(contactShadow(x, barrelD, smoothD(fore, true, 0.5), 3, 5, 0.4));
  out.push(
    el('path', {
      d: Array.from({ length: 16 }, (_, i) => {
        const y = -404 + dy + i * 7.6;
        const w = 19 + (i / 16) * 5;
        return `M${r2(-w + 3)} ${r2(y)}Q0 ${r2(y + 1.5)} ${r2(w - 3)} ${r2(y)}`;
      }).join(''),
      stroke: x.c('woodGrain'),
      'stroke-width': 1,
      'stroke-linecap': 'round',
      opacity: 0.6,
    }),
  );
  if (s.eject > 0) out.push(shell(x, 50 + s.eject * 80, -210 - s.eject * 70, 60 + s.eject * 240));
  out.push(
    smoke(
      x,
      -10 - s.smoke * 12,
      MUZZLE_Y - 22 - s.smoke * 34,
      0.7 + s.smoke * 0.8,
      s.smoke > 0 ? 1 - s.smoke * 0.55 : 0,
      7,
    ),
  );
  return out.join('');
}

function voorlaaier(
  x: Ctx,
  s: {
    hammer: number;
    smoke: number;
    glow: number;
    lower: number;
    rod: number;
    rodOut: boolean;
    cap: boolean;
  },
): string {
  // Lowered for reloading: the whole gun shrinks toward the grip, leaving room for the ramrod.
  const k = 1 - 0.16 * s.lower;
  const inner: string[] = [];
  const muzzle = MUZZLE_Y;
  inner.push(stockButt(x, -176, 81));
  // Full stock running under the barrel almost to the muzzle.
  inner.push(
    wood(
      x,
      [
        [-26, -386],
        [26, -386],
        [40, -200],
        [-40, -200],
      ],
      82,
      false,
      0.3,
    ),
  );
  // Ramrod in its thimbles on the left (absent while it's out).
  if (!s.rodOut) {
    inner.push(
      inked(
        polyD([
          [-36, -382],
          [-31, -382],
          [-36, -214],
          [-42, -214],
        ]),
        x.c('lightWood'),
        x.ink,
        x.inner,
      ),
    );
    inner.push(
      inked(
        polyD([
          [-37, -392],
          [-30, -392],
          [-31, -380],
          [-36, -380],
        ]),
        x.c('brass'),
        x.ink,
        x.inner,
      ),
    );
  }
  // Octagonal browned barrel: facets as flat stripes.
  const bar = taper(0, muzzle, 8, -204, 22);
  inner.push(metal(x, bar, 'steel', 83, true, 7));
  inner.push(
    el('path', {
      d: polyD(taper(0, muzzle + 2, 3.5, -206, 7)),
      fill: x.c('steelHi'),
      opacity: 0.7,
    }),
  );
  inner.push(
    el('path', {
      d: `M-7 ${muzzle + 2}L-14 -206M7 ${muzzle + 2}L14 -206`,
      stroke: x.c('steelShadow'),
      'stroke-width': 1.5,
    }),
  );
  // Brass nose cap, barrel bands and blade sight.
  for (const [y, w] of [
    [-388, 30],
    [-330, 34],
    [-262, 38],
  ] as const)
    inner.push(
      metal(
        x,
        [
          [-w, y - 7],
          [w, y - 7],
          [w + 1, y + 7],
          [-w - 1, y + 7],
        ],
        'brass',
        84 + y,
        false,
      ),
    );
  inner.push(
    inked(
      polyD([
        [-3, muzzle - 10],
        [3, muzzle - 10],
        [4, muzzle + 6],
        [-4, muzzle + 6],
      ]),
      x.c('brassHi'),
      x.ink,
      x.inner,
    ),
  );
  inner.push(muzzleGlow(x, 0, muzzle, s.glow));
  // Side lock, nipple and hammer on the right.
  inner.push(
    metal(
      x,
      [
        [30, -214],
        [64, -204],
        [62, -160],
        [28, -168],
      ],
      'steel',
      85,
    ),
  );
  inner.push(
    inked(ellipseD(44, -224, 6, 6), s.cap ? x.c('brass') : x.c('steelShadow'), x.ink, x.inner),
  );
  const hammer = place(
    [
      [-6, 0],
      [6, 0],
      [10, -30],
      [2, -44],
      [-6, -38],
    ],
    56,
    -188,
    -20 + s.hammer * 48,
  );
  inner.push(metal(x, hammer, 'steel', 86, false));
  // Brass patch box on the butt.
  inner.push(
    inked(
      smoothD([
        [-26, -70],
        [6, -74],
        [10, -36],
        [-24, -32],
      ]),
      x.c('brass'),
      x.ink,
      x.inner,
    ),
  );
  if (s.glow > 0) inner.push(muzzleGlow(x, 44, -226, s.glow));
  // The ramrod out of its thimbles: held above (and pushed into) the muzzle.
  if (s.rodOut) {
    const rodTop = muzzle - 30 - s.rod * 120;
    const rodBot = muzzle - 4;
    inner.push(
      inked(
        polyD([
          [-4, rodTop],
          [4, rodTop],
          [3, rodBot],
          [-3, rodBot],
        ]),
        x.c('lightWood'),
        x.ink,
        x.inner,
      ),
    );
    inner.push(
      inked(
        polyD([
          [-6, rodTop - 10],
          [6, rodTop - 10],
          [4, rodTop + 2],
          [-4, rodTop + 2],
        ]),
        x.c('brass'),
        x.ink,
        x.inner,
      ),
    );
  }
  const out = [g({ transform: `scale(${r2(k)})` }, ...inner)];
  // Black-powder smoke (the game adds its own puffs: these stay small and local).
  out.push(
    smoke(
      x,
      -18 - s.smoke * 20,
      muzzle * k - 30 - s.smoke * 30,
      0.9 + s.smoke * 1.2,
      s.smoke > 0 ? 1 - s.smoke * 0.5 : 0,
      8,
    ),
  );
  out.push(
    smoke(
      x,
      50 + s.smoke * 30,
      -236 - s.smoke * 40,
      0.5 + s.smoke * 0.8,
      s.smoke > 0 ? 1 - s.smoke * 0.6 : 0,
      9,
    ),
  );
  return out.join('');
}

function mielieMasjien(x: Ctx, s: { crank: number; kernels: number }): string {
  const out: string[] = [];
  // Pistol-style wooden grip.
  out.push(
    wood(
      x,
      [
        [-30, -126],
        [30, -126],
        [40, 4],
        [-40, 4],
      ],
      101,
      false,
      0.3,
    ),
  );
  // Hopper of mealie cobs on the left (behind the crate).
  const hopper: Pt[] = [
    [-128, -340],
    [-62, -340],
    [-54, -262],
    [-92, -252],
  ];
  for (let k = 0; k < 3; k++) {
    const cx = -112 + k * 20;
    const cob = smoothD(
      place(
        [
          [-9, -26],
          [9, -26],
          [12, 0],
          [8, 22],
          [-8, 22],
          [-12, 0],
        ],
        cx,
        -352 + (k % 2) * 8 + Math.sin(s.crank * Math.PI * 2 + k) * 4,
        -12 + k * 12,
      ),
    );
    out.push(inked(cob, x.c('cob'), x.ink, x.inner));
    out.push(
      el('path', {
        d: `M${r2(cx - 6)} -360l12 0M${r2(cx - 7)} -350l14 0M${r2(cx - 6)} -340l12 0`,
        stroke: x.c('cobShadow'),
        'stroke-width': 2,
      }),
    );
  }
  out.push(metal(x, hopper, 'steel', 102));
  // Wooden crate body with planks and nails.
  const crate: Pt[] = [
    [-66, -268],
    [66, -268],
    [74, -120],
    [-74, -120],
  ];
  out.push(wood(x, crate, 103, true, 0.15));
  out.push(
    el('path', {
      d: 'M-70 -220L70 -220M-72 -170L72 -170',
      stroke: x.c('lightWoodShadow'),
      'stroke-width': x.inner,
    }),
  );
  out.push(
    el('path', {
      d: ['M-60 -258', 'M58 -258', 'M-64 -132', 'M62 -132']
        .map((m) => `${m}m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0`)
        .join(''),
      fill: x.ink,
    }),
  );
  // Galvanised pipe barrel with duct-tape bands and a flared muzzle.
  out.push(metal(x, taper(0, MUZZLE_Y + 10, 16, -268, 26), 'steel', 104, true, 8));
  for (const y of [-360, -310])
    out.push(
      inked(
        polyD([
          [-22 - (y + 400) * 0.02, y - 8],
          [22 + (y + 400) * 0.02, y - 8],
          [23 + (y + 400) * 0.02, y + 8],
          [-23 - (y + 400) * 0.02, y + 8],
        ]),
        x.c('duct'),
        x.ink,
        x.inner,
      ),
    );
  out.push(
    metal(
      x,
      [
        [-28, MUZZLE_Y - 8],
        [28, MUZZLE_Y - 8],
        [17, MUZZLE_Y + 14],
        [-17, MUZZLE_Y + 14],
      ],
      'steel',
      105,
      false,
    ),
  );
  // Crank on the right: axle, arm turning with the frame, wooden knob.
  const axle: Pt = [80, -196];
  const a = s.crank * Math.PI * 2;
  const knob: Pt = [axle[0] + Math.cos(a) * 34, axle[1] + Math.sin(a) * 34];
  out.push(
    el('path', {
      d: `M${axle[0]} ${axle[1]}L${r2(knob[0])} ${r2(knob[1])}`,
      stroke: x.c('steelShadow'),
      'stroke-width': 10 + x.L,
      'stroke-linecap': 'round',
    }),
  );
  out.push(
    el('path', {
      d: `M${axle[0]} ${axle[1]}L${r2(knob[0])} ${r2(knob[1])}`,
      stroke: x.c('steelHi'),
      'stroke-width': 10,
      'stroke-linecap': 'round',
    }),
  );
  out.push(inked(ellipseD(axle[0], axle[1], 10, 10), x.c('steel'), x.ink, x.inner));
  out.push(inked(ellipseD(knob[0], knob[1], 11, 13), x.c('wood'), x.ink, x.inner));
  // Kernels spitting out of the muzzle.
  if (s.kernels > 0) {
    const rnd = prng(Math.round(s.crank * 100) + 7);
    for (let k = 0; k < 7; k++) {
      const kx = (rnd() - 0.5) * 50;
      const ky = MUZZLE_Y - 20 - rnd() * 50 * s.kernels;
      out.push(inked(ellipseD(kx, ky, 5, 6.5), x.c('cob'), x.ink, x.inner * 0.7));
    }
  }
  return out.join('');
}

// --- frames ------------------------------------------------------------------------------------

const D0: DubbelState = { lever: 0, open: 0, shells: 'hidden', eject: 0, smoke: 0, glow: 0 };

type Frame = (x: Ctx) => string;

function clipFrames(id: GunId, clip: Exclude<GunClip, 'flash'>, n: number): Frame[] {
  const t = (k: number) => (n <= 1 ? 0 : k / (n - 1));
  switch (id) {
    case 'dubbelloop': {
      if (clip === 'idle') return [(x) => dubbelloop(x, D0)];
      if (clip === 'fire')
        return Array.from(
          { length: n },
          (_, k) => (x: Ctx) =>
            dubbelloop(x, { ...D0, glow: k === 0 ? 1 : 0, smoke: k === 0 ? 0 : t(k) }),
        );
      const R: DubbelState[] = [
        { ...D0, lever: 0.6 },
        { ...D0, lever: 1, open: 0.4, shells: 'spent' },
        { ...D0, lever: 1, open: 0.85, shells: 'none', eject: 0.4 },
        { ...D0, lever: 1, open: 1, shells: 'none', eject: 1 },
        { ...D0, lever: 1, open: 1, shells: 'fresh' },
        { ...D0, lever: 1, open: 0.9, shells: 'fresh' },
        { ...D0, lever: 1, open: 0.4, shells: 'fresh' },
        { ...D0, lever: 0.1 },
      ];
      return R.slice(0, n).map((s) => (x: Ctx) => dubbelloop(x, s));
    }
    case 'windbuks':
      if (clip === 'idle') return [(x) => windbuks(x, 0)];
      return Array.from(
        { length: n },
        (_, k) => (x: Ctx) => windbuks(x, k === n - 1 ? 0 : (k + 1) / n),
      );
    case 'kettie': {
      const ready = { pouchY: -150, pouchS: 1.35, stone: true, wobble: 0 };
      if (clip === 'idle') return [(x) => kettie(x, ready)];
      const F = [
        { pouchY: -300, pouchS: 1.05, stone: false, wobble: 0 },
        { pouchY: -404, pouchS: 0.8, stone: false, wobble: 0.5 },
        { pouchY: -428, pouchS: 0.75, stone: false, wobble: -0.8 },
        { pouchY: -250, pouchS: 1.15, stone: true, wobble: 0.3 },
      ];
      return F.slice(0, n).map((s) => (x: Ctx) => kettie(x, s));
    }
    case 'pomp': {
      const P0 = { pump: 0, eject: 0, smoke: 0, glow: 0 };
      if (clip === 'idle') return [(x) => pomp(x, P0)];
      if (clip === 'fire') {
        const F = [
          { ...P0, glow: 1 },
          { ...P0, smoke: 0.3, pump: 0.6 },
          { ...P0, smoke: 0.6, pump: 1, eject: 0.6 },
          { ...P0, smoke: 0.9, pump: 0.3, eject: 1 },
        ];
        return F.slice(0, n).map((s) => (x: Ctx) => pomp(x, s));
      }
      const R = [0, 0.5, 1, 0.5, 0].map((p, k) => ({
        ...P0,
        pump: p,
        eject: k === 2 ? 0.5 : k === 3 ? 1 : 0,
      }));
      return R.slice(0, n).map((s) => (x: Ctx) => pomp(x, s));
    }
    case 'voorlaaier': {
      const V0 = { hammer: 0, smoke: 0, glow: 0, lower: 0, rod: 0, rodOut: false, cap: true };
      if (clip === 'idle') return [(x) => voorlaaier(x, V0)];
      if (clip === 'fire') {
        const F = [
          { ...V0, hammer: 1, glow: 1, cap: false },
          { ...V0, hammer: 1, smoke: 0.3, cap: false },
          { ...V0, hammer: 1, smoke: 0.65, cap: false },
          { ...V0, hammer: 1, smoke: 1, cap: false },
        ];
        return F.slice(0, n).map((s) => (x: Ctx) => voorlaaier(x, s));
      }
      const R = [
        { ...V0, hammer: 1, cap: false, lower: 1 },
        { ...V0, hammer: 1, cap: false, lower: 1, rodOut: true, rod: 1 },
        { ...V0, hammer: 1, cap: false, lower: 1, rodOut: true, rod: 0.4 },
        { ...V0, hammer: 1, cap: false, lower: 1, rodOut: true, rod: 0 },
        { ...V0, hammer: 1, cap: false, lower: 1, rodOut: true, rod: 0.7 },
        { ...V0, hammer: 1, cap: false, lower: 1, rodOut: true, rod: 0 },
        { ...V0, hammer: 0.5, cap: true, lower: 1 },
        { ...V0, hammer: 0, cap: true, lower: 0.4 },
      ];
      return R.slice(0, n).map((s) => (x: Ctx) => voorlaaier(x, s));
    }
    case 'twee_twee': {
      const T0 = { bolt: 0, eject: 0, smoke: 0, glow: 0, mag: 0 };
      if (clip === 'idle') return [(x) => tweeTwee(x, T0)];
      if (clip === 'fire') {
        // The shot, then the bolt worked (lift, back with the case flicking out, home).
        const F = [
          { ...T0, glow: 1 },
          { ...T0, smoke: 0.4, bolt: 0.5 },
          { ...T0, smoke: 0.7, bolt: 1, eject: 0.6 },
          { ...T0, smoke: 1, bolt: 0.3, eject: 1 },
        ];
        return F.slice(0, n).map((st) => (x: Ctx) => tweeTwee(x, st));
      }
      // Reload: bolt open, the magazine drops and a fresh one goes in, bolt home.
      const R = [
        { ...T0, bolt: 1 },
        { ...T0, bolt: 1, mag: 1 },
        { ...T0, bolt: 1, mag: 0.5 },
        { ...T0, bolt: 1 },
        { ...T0, bolt: 0.3 },
      ];
      return R.slice(0, n).map((st) => (x: Ctx) => tweeTwee(x, st));
    }
    case 'langloop': {
      const L0 = { bolt: 0, eject: 0, smoke: 0, glow: 0, load: 0 };
      if (clip === 'idle') return [(x) => langloop(x, L0)];
      if (clip === 'fire') {
        const F = [
          { ...L0, glow: 1 },
          { ...L0, smoke: 0.4 },
          { ...L0, smoke: 0.6, bolt: 0.6 },
          { ...L0, smoke: 0.8, bolt: 1, eject: 0.6 },
          { ...L0, smoke: 1, bolt: 0.3, eject: 1 },
        ];
        return F.slice(0, n).map((st) => (x: Ctx) => langloop(x, st));
      }
      // Reload: bolt open, three rounds pressed into the magazine, bolt home.
      const R = [
        { ...L0, bolt: 1 },
        { ...L0, bolt: 1, load: 0.34 },
        { ...L0, bolt: 1, load: 0.67 },
        { ...L0, bolt: 1, load: 1 },
        { ...L0, bolt: 0.3 },
      ];
      return R.slice(0, n).map((st) => (x: Ctx) => langloop(x, st));
    }
    case 'mielie_masjien':
      if (clip === 'idle') return [(x) => mielieMasjien(x, { crank: 0, kernels: 0 })];
      return Array.from(
        { length: n },
        (_, k) => (x: Ctx) => mielieMasjien(x, { crank: k / n, kernels: k % 2 === 0 ? 1 : 0.5 }),
      );
  }
}

/** Muzzle flash frames (200 × 200, centred on the muzzle): small and local, never full-screen. */
function flashFrames(id: GunId, n: number): Frame[] {
  const burst = (
    x: Ctx,
    cx: number,
    cy: number,
    r: number,
    spikes: number,
    seed: number,
    a = 1,
  ): string => {
    const rnd = prng(seed);
    const ring = (rr: number, sharp: number): string => {
      const pts: Pt[] = [];
      for (let k = 0; k < spikes * 2; k++) {
        const ang = (k / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
        const len = k % 2 === 0 ? rr * (0.8 + rnd() * 0.4) : rr * sharp;
        // Flashes are longer along the barrel (up).
        pts.push([
          cx + Math.cos(ang) * len * 0.75,
          cy + Math.sin(ang) * len * (Math.sin(ang) < 0 ? 1.25 : 0.6),
        ]);
      }
      return polyD(pts);
    };
    return g(
      { opacity: a },
      inked(ring(r, 0.45), x.c('flashOuter'), x.ink, x.inner),
      el('path', { d: ring(r * 0.66, 0.5), fill: x.c('flashMid') }),
      el('path', { d: ellipseD(cx, cy, r * 0.26, r * 0.22), fill: x.c('flashCore') }),
    );
  };
  const f = (k: number) => 1 - k / Math.max(1, n);
  switch (id) {
    case 'dubbelloop':
      return Array.from(
        { length: n },
        (_, k) => (x: Ctx) =>
          burst(x, -14, 10, 62 * (k === 0 ? 0.8 : 1) * (1 - k * 0.2), 7, 11 + k, f(k) + 0.2) +
          burst(x, 14, 10, 58 * (k === 0 ? 0.8 : 1) * (1 - k * 0.2), 7, 21 + k, f(k) + 0.2),
      );
    case 'pomp':
      return Array.from(
        { length: n },
        (_, k) => (x: Ctx) => burst(x, 0, 10, 78 * (1 - k * 0.2), 8, 31 + k, f(k) + 0.2),
      );
    case 'voorlaaier':
      return Array.from(
        { length: n },
        (_, k) => (x: Ctx) => burst(x, 0, 14, 88 * (1 - k * 0.15), 9, 41 + k, f(k) + 0.25),
      );
    case 'langloop':
      // A full-bore rifle through a muzzle brake: a bigger flash, thrown to the sides.
      return Array.from(
        { length: n },
        (_, k) => (x: Ctx) =>
          burst(x, 0, 6, 48 * (1 - k * 0.25), 6, 61 + k, f(k) + 0.15) +
          burst(x, -22, 16, 22 * (1 - k * 0.3), 5, 71 + k, f(k)) +
          burst(x, 22, 16, 22 * (1 - k * 0.3), 5, 81 + k, f(k)),
      );
    case 'twee_twee':
      // A rimfire: a small, quick flash.
      return Array.from(
        { length: n },
        (_, k) => (x: Ctx) => burst(x, 0, 8, 34 * (1 - k * 0.3), 6, 51 + k, f(k) + 0.1),
      );
    case 'windbuks':
      return Array.from(
        { length: n },
        (_, k) => (x: Ctx) =>
          g(
            { opacity: 1 - k * 0.4 },
            el('path', {
              d: ellipseD(0, 0, 20 + k * 14, 9 + k * 6),
              fill: 'none',
              stroke: x.c('smokeShadow'),
              'stroke-width': x.inner * 1.6,
            }),
            el('path', {
              d: ellipseD(0, 0, 20 + k * 14, 9 + k * 6),
              fill: 'none',
              stroke: x.c('smoke'),
              'stroke-width': x.inner,
            }),
            el('path', {
              d: 'M-4 -6l4 -22l4 22z',
              fill: x.c('smoke'),
              stroke: x.c('smokeShadow'),
              'stroke-width': x.inner * 0.6,
            }),
          ),
      );
    case 'kettie':
      // A snap: two short speed arcs where the pouch passes the fork.
      return Array.from(
        { length: n },
        (_, k) => (x: Ctx) =>
          g(
            { opacity: 1 - k * 0.45 },
            el('path', {
              d: `M-40 ${10 - k * 10}q40 -30 80 0M-28 ${30 - k * 10}q28 -20 56 0`,
              fill: 'none',
              stroke: x.c('smokeShadow'),
              'stroke-width': x.inner * 2.2,
              'stroke-linecap': 'round',
            }),
            el('path', {
              d: `M-40 ${10 - k * 10}q40 -30 80 0M-28 ${30 - k * 10}q28 -20 56 0`,
              fill: 'none',
              stroke: x.c('smoke'),
              'stroke-width': x.inner,
              'stroke-linecap': 'round',
            }),
          ),
      );
    case 'mielie_masjien':
      return Array.from({ length: n }, (_, k) => (x: Ctx) => {
        const rnd = prng(61 + k);
        const kernels: string[] = [];
        for (let i = 0; i < 9; i++) {
          const a = -Math.PI / 2 + (rnd() - 0.5) * 1.6;
          const d = 20 + rnd() * 60 + k * 20;
          kernels.push(
            inked(
              ellipseD(Math.cos(a) * d, Math.sin(a) * d + 20, 6, 7.5),
              x.c('cob'),
              x.ink,
              x.inner * 0.7,
            ),
          );
        }
        return g({ opacity: 1 - k * 0.35 }, smoke(x, 0, 10, 1.1 + k * 0.5, 1, 71 + k), ...kernels);
      });
  }
}

export function gunClipNames(cfg: ArtConfig, id: GunId): GunClip[] {
  const c = cfg.guns.clips[id];
  return ['idle', 'fire', ...(c.reload === undefined ? [] : (['reload'] as const)), 'flash'];
}

export function gunFrameCount(cfg: ArtConfig, id: GunId, clip: GunClip): number {
  const c = cfg.guns.clips[id];
  if (clip === 'idle') return 1;
  if (clip === 'reload') return c.reload ?? 0;
  return c[clip];
}

/** One gun frame as an SVG document at masterScale × the @1x box. */
export function gunFrameSvg(cfg: ArtConfig, id: GunId, clip: GunClip, frame: number): string {
  const x: Ctx = {
    cfg,
    c: (name) => gunColour(cfg, name),
    // D-035: thinner, softer outlines (semi-realistic); the ink leans toward cool blued steel.
    ink: mixHex(cfg.ink, gunColour(cfg, 'bluedShadow'), 0.3),
    L: cfg.guns.lineNear * cfg.guns.outline,
    inner: cfg.guns.lineNear * cfg.guns.outline * cfg.birds.innerLine,
    next: 0,
  };
  const n = gunFrameCount(cfg, id, clip);
  const frames = clip === 'flash' ? flashFrames(id, n) : clipFrames(id, clip, n);
  const draw = frames[frame];
  if (draw === undefined) throw new Error(`${id} ${clip} has no frame ${frame}`);
  const box = clip === 'flash' ? GUN_FLASH_BOX : GUN_BOX;
  const vb: [number, number, number, number] =
    clip === 'flash'
      ? [-box.width / 2, -box.height / 2, box.width, box.height]
      : [-GUN_BOX.originX, -GUN_BOX.originY, GUN_BOX.width, GUN_BOX.height];
  const w = cfg.guns.wobble;
  const filter = clip === 'flash' ? '' : wobbleFilter('wob', w.frequency, w.scale, 3);
  return svgDoc(
    box.width * cfg.masterScale,
    box.height * cfg.masterScale,
    vb,
    filter,
    g(
      filter === '' ? {} : { filter: 'url(#wob)' },
      clip === 'flash'
        ? draw(x)
        : g(
            {
              transform: `translate(${poseFor(cfg, id).shift} 0) rotate(${poseFor(cfg, id).angle})`,
            },
            widenX(draw(x), poseFor(cfg, id).widen),
          ),
    ),
  );
}

/**
 * Scales every x coordinate in the markup's path data by `k` (about x = 0, the barrel line), so the
 * gun gets more mass without fattening its outlines (resvg has no non-scaling strokes). Handles
 * the commands the gun drawing uses: M L H V C S Q T A Z, absolute and relative.
 */
export function widenX(markup: string, k: number): string {
  if (k === 1) return markup;
  return markup
    .replace(/ d="([^"]*)"/g, (_, d: string) => ` d="${widenPath(d, k)}"`)
    .replace(/ (x1|x2)="(-?[\d.]+)"/g, (_, a: string, v: string) => ` ${a}="${r2(Number(v) * k)}"`);
}

const ARITY: Readonly<Record<string, number>> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};

function widenPath(d: string, k: number): string {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  let out = '';
  let cmd = '';
  let args: number[] = [];
  const flush = (): void => {
    const lc = cmd.toLowerCase();
    const n = ARITY[lc] ?? 0;
    if (n === 0) return;
    for (let i = 0; i < args.length; i++) {
      const j = i % n;
      const isX = lc === 'h' || (lc === 'a' ? j === 0 || j === 5 : lc !== 'v' && j % 2 === 0);
      const v = args[i] ?? 0;
      out += `${i === 0 ? '' : ' '}${r2(isX ? v * k : v)}`;
    }
  };
  for (const t of tokens) {
    if (/[a-zA-Z]/.test(t)) {
      flush();
      out += t;
      cmd = t;
      args = [];
    } else {
      args.push(Number(t));
    }
  }
  flush();
  return out;
}
