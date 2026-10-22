// The six interim first-person guns (D-029, art bible §6, content/weapons.json). Barrels point up
// the screen in the placeholder's 420 × 520 box; units are box px at @1x with the grip (screen
// anchor) at (0, 0) = box (210, 520). Ink outlines at the near weight, flat fills with one shadow
// and one highlight, wood grain, metal shine, wear and scratches. No text, brands or logos.
import type { GunClip } from '../../src/game/assets/assetIndex';
import { GUN_BOX, GUN_FLASH_BOX } from '../assets/targets';
import { gunColour, type ArtConfig, type GunId } from './config';
import {
  ellipseD,
  el,
  g,
  inked,
  place,
  polyD,
  prng,
  r2,
  smoothD,
  svgDoc,
  wobbleFilter,
} from './svg';

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

/** A shape with one shadow (right edge, light from the top left), one highlight and an outline. */
function shaded(
  x: Ctx,
  d: string,
  fill: string,
  shadow: string,
  hi: string,
  shadowD: string,
  hiD: string,
  extra = '',
): string {
  const id = uid(x, 'c');
  return [
    el('clipPath', { id }, el('path', { d })),
    el('path', { d, fill }),
    el('path', { d: shadowD, fill: shadow, 'clip-path': `url(#${id})` }),
    el('path', { d: hiD, fill: hi, 'clip-path': `url(#${id})` }),
    extra === '' ? '' : g({ 'clip-path': `url(#${id})` }, extra),
    el('path', { d, fill: 'none', stroke: x.ink, 'stroke-width': x.L, 'stroke-linejoin': 'round' }),
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
  const rnd = prng(seed);
  const lines: string[] = [];
  for (let k = 0; k < n; k++) {
    const fx = x0 + ((k + 0.5) / n) * (x1 - x0) + (rnd() - 0.5) * 8;
    const pts: Pt[] = [];
    for (let s = 0; s <= 8; s++) {
      const t = s / 8;
      pts.push([fx + Math.sin(t * 6 + k) * 4 + (t - 0.5) * (rnd() - 0.5) * 10, y0 + t * (y1 - y0)]);
    }
    lines.push(smoothD(pts, false));
    // An occasional knot.
    if (rnd() < 0.25) {
      const ky = y0 + rnd() * (y1 - y0);
      lines.push(ellipseD(fx, ky, 4, 9));
    }
  }
  return el('path', {
    d: lines.join(''),
    fill: 'none',
    stroke: x.c('woodGrain'),
    'stroke-width': x.inner * 0.6,
    'stroke-linecap': 'round',
    opacity: 0.55,
  });
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
    const len = 6 + rnd() * 12;
    const a = -0.6 + rnd() * 1.2;
    d += `M${r2(sx)} ${r2(sy)}l${r2(Math.sin(a) * len)} ${r2(-Math.cos(a) * len * 0.4)}`;
  }
  return el('path', {
    d,
    fill: 'none',
    stroke: x.c('scratch'),
    'stroke-width': 1.4,
    'stroke-linecap': 'round',
    opacity: 0.8,
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
      wear ? scratches(x, x0, y0, x1, y1, seed) : '',
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
  return shaded(
    x,
    d,
    x.c(light ? 'lightWood' : 'wood'),
    x.c(light ? 'lightWoodShadow' : 'woodShadow'),
    x.c(light ? 'lightWoodHi' : 'woodHi'),
    shadowD,
    hiD,
    grain(x, x0, y0, x1, y1, seed, Math.max(4, Math.round(w / 22))),
  );
}

/** Diamond checkering on a grip (thin crossing lines), clipped to a quad. */
function checkering(x: Ctx, pts: readonly Pt[]): string {
  const id = uid(x, 'k');
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let d = '';
  for (let k = x0 - (y1 - y0); k < x1 + (y1 - y0); k += 9) {
    d += `M${r2(k)} ${r2(y0)}L${r2(k + (y1 - y0) * 0.6)} ${r2(y1)}M${r2(k)} ${r2(y1)}L${r2(k + (y1 - y0) * 0.6)} ${r2(y0)}`;
  }
  return [
    el('clipPath', { id }, el('path', { d: polyD(pts) })),
    el('path', {
      d,
      stroke: x.c('woodShadow'),
      'stroke-width': 1.3,
      fill: 'none',
      'clip-path': `url(#${id})`,
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
    el('path', { d, fill: 'none', stroke: x.ink, 'stroke-width': x.inner * 1.6 }),
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
  const pts: Pt[] = [
    [-36, top],
    [36, top],
    [44, top + 62],
    [104, 4],
    [-74, 4],
    [-38, top + 62],
  ];
  const side = smoothD(comb, true, 0.35);
  const wrist: Pt[] = [
    [-32, top + 4],
    [32, top + 4],
    [36, top + 56],
    [-34, top + 56],
  ];
  return (
    inked(side, x.c(light ? 'lightWoodShadow' : 'woodShadow'), x.ink, x.L) +
    wood(x, pts, seed, light, 0.35) +
    checkering(x, wrist) +
    triggerGuard(x, top)
  );
}

/** Steel trigger guard and trigger(s) peeking out on the right of the wrist (3/4 view). */
function triggerGuard(x: Ctx, top: number): string {
  const loop = smoothD(
    [
      [30, top + 6],
      [58, top + 2],
      [74, top + 22],
      [70, top + 52],
      [46, top + 62],
      [32, top + 52],
    ],
    true,
    0.8,
  );
  const hole = smoothD(
    [
      [40, top + 14],
      [58, top + 12],
      [64, top + 28],
      [60, top + 46],
      [46, top + 50],
      [40, top + 40],
    ],
    true,
    0.8,
  );
  const trig = (dx: number) =>
    inked(
      `M${r2(46 + dx)} ${r2(top + 14)}Q${r2(56 + dx)} ${r2(top + 26)} ${r2(50 + dx)} ${r2(top + 40)}L${r2(46 + dx)} ${r2(top + 38)}Q${r2(50 + dx)} ${r2(top + 26)} ${r2(42 + dx)} ${r2(top + 16)}Z`,
      x.c('steelHi'),
      x.ink,
      x.inner,
    );
  return [
    el('path', {
      d: loop + hole,
      fill: x.c('steel'),
      'fill-rule': 'evenodd',
      stroke: x.ink,
      'stroke-width': x.L * 0.8,
      'stroke-linejoin': 'round',
    }),
    el('path', { d: hole, fill: x.c('woodShadow') }),
    trig(0),
    trig(8),
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
      d: 'M-38 -222q10 -10 20 0t20 0M-4 -200q10 -10 20 0t20 0M-34 -184q8 -8 16 0',
      fill: 'none',
      stroke: x.c('steelShadow'),
      'stroke-width': 1.6,
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
  const fore: Pt[] = [
    [-50, hinge + (-392 - hinge) * k],
    [50, hinge + (-392 - hinge) * k],
    [56, hinge - 22 * k],
    [-56, hinge - 22 * k],
  ];
  out.push(wood(x, fore, 21, false, 0.4));
  // Barrels with a rib between them.
  for (const side of [-1, 1] as const)
    out.push(metal(x, bar(side), 'blued', 30 + side, true, side === 1 ? 7 : 0));
  out.push(inked(polyD(taper(0, top - 2, 2.6, hinge, 4)), x.c('bluedHi'), x.ink, x.inner));
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
          stroke: x.ink,
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
  out.push(stroke(forkD, x.ink, 30 + x.L * 2));
  out.push(stroke(forkD, x.c('wood'), 30));
  out.push(stroke('M8 6L8 -196M8 -204Q42 -258 102 -398', x.c('woodShadow'), 10));
  out.push(stroke('M-8 0L-8 -190M-8 -206Q-36 -250 -86 -388', x.c('woodHi'), 5));
  // Bark rings and nicks.
  out.push(
    stroke('M-14 -60l28 4M-14 -120l28 -3M-60 -300l14 12M58 -296l-12 14', x.c('woodGrain'), 2.2),
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
    out.push(stroke(band(tip), x.ink, 9 + x.inner * 2));
    out.push(stroke(band(tip), x.c('rubber'), 9));
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
  out.push(inked(polyD(taper(0, MUZZLE_Y - 2, 3.5, -240, 6)), x.c('bluedHi'), x.ink, x.inner));
  out.push(
    el('path', {
      d: Array.from({ length: 9 }, (_, i) => {
        const y = MUZZLE_Y + 14 + i * 21;
        const w = 3.5 + (i / 9) * 2.5;
        return `M${r2(-w)} ${r2(y)}L${r2(w)} ${r2(y)}`;
      }).join(''),
      stroke: x.ink,
      'stroke-width': 1.6,
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
  const fore: Pt[] = [
    [-40, -386 + dy],
    [40, -386 + dy],
    [46, -284 + dy],
    [-46, -284 + dy],
  ];
  out.push(wood(x, fore, 65, false, 0.3));
  out.push(
    el('path', {
      d: Array.from({ length: 6 }, (_, i) => {
        const y = -374 + dy + i * 16;
        const w = 40 + (i / 6) * 6;
        return `M${r2(-w + 4)} ${r2(y)}L${r2(w - 4)} ${r2(y)}`;
      }).join(''),
      stroke: x.ink,
      'stroke-width': x.inner,
      'stroke-linecap': 'round',
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
    el('path', { d: 'M-70 -220L70 -220M-72 -170L72 -170', stroke: x.ink, 'stroke-width': x.inner }),
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
      stroke: x.ink,
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
    case 'windbuks':
      return Array.from(
        { length: n },
        (_, k) => (x: Ctx) =>
          g(
            { opacity: 1 - k * 0.4 },
            el('path', {
              d: ellipseD(0, 0, 20 + k * 14, 9 + k * 6),
              fill: 'none',
              stroke: x.ink,
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
              stroke: x.ink,
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
              stroke: x.ink,
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
    ink: cfg.ink,
    L: cfg.guns.lineNear,
    inner: cfg.guns.lineNear * cfg.birds.innerLine,
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
  return markup.replace(/ d="([^"]*)"/g, (_, d: string) => ` d="${widenPath(d, k)}"`);
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
