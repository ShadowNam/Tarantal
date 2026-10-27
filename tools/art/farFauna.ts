// D-054 (product owner 26 Oct: "the zebras, giraffes and elephants look very cartoony … they
// still look too much like stick figures"): the far animals redrawn from their anatomy at the
// heights real proportions give them beside a guineafowl on their plane (D-049). One builder for
// the hoofed animals (a jointed skeleton per leg: elbow, knee, fetlock, pastern and hoof in front;
// stifle, hock, fetlock and hoof behind; a barrel with withers, back, croup and tucked flank; a
// neck with a crest and throat; a head with forehead, nasal bridge, muzzle and jaw), with each
// species' proportions and coat, plus the elephant and the ostrich. Light from above (a lit back,
// a shaded belly and far legs, a soft contact shadow), thin outlines in a darker shade of the coat
// (no cartoon ink), the layer's haze on every colour.
//
// Each animal comes in parts so FaunaView can move them a little on sim time: `tail` (behind),
// `body` (legs, barrel, shadow), `head` (neck and head, about a pivot at the neck's root inside the
// body) and the elephant's `ear` (folds about its front edge). Units: design px at the animal's
// on-screen size, facing right, feet on y = 0.
import type {
  FaunaPart,
  FaunaPose,
  FaunaSpecies,
  FaunaVariant,
} from '../../src/game/view/faunaHerds';
import { mix, nextId, shade, type Pt } from './scenery';
import { el, ellipseD, g, prng, r2, smoothD } from './svg';

export interface LookSpec {
  readonly species: FaunaSpecies;
  readonly pose: FaunaPose;
  readonly variant: FaunaVariant;
  /** Height in design px (shoulder; giraffe and ostrich: the top of the head). */
  readonly h: number;
}

export interface LookOpts {
  /** Aerial haze for the plane (colour → hazed colour). */
  readonly tint?: (hex: string) => string;
  /** Dust or mud on legs and belly (elephants: the Bushveld's red dust, the delta's mud). */
  readonly dust?: string;
  /** Standing in shallow water (lechwe): legs below the surface hidden, a soft reflection. */
  readonly wading?: boolean;
}

export interface DrawnLook {
  /** SVG of each part (absent parts are not drawn for this species). */
  readonly parts: Partial<Record<FaunaPart, string>>;
  /** Each part's pivot (feet-relative; body: the feet's centre). */
  readonly pivots: Partial<Record<FaunaPart, Pt>>;
  /** A box (design px, feet-relative) that holds every part, for rendering. */
  readonly box: {
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
  };
}

type V = [number, number];

const add = (a: Pt, b: Pt): V => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Pt, b: Pt): V => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Pt, k: number): V => [a[0] * k, a[1] * k];
const lerp = (a: Pt, b: Pt, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const len = (a: Pt): number => Math.hypot(a[0], a[1]);
const unit = (a: Pt): V => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
/** Rotates p about c by `deg`, clockwise on screen (y down). */
function rot(p: Pt, c: Pt, deg: number): V {
  const a = (deg * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  return [c[0] + dx * ca - dy * sa, c[1] + dx * sa + dy * ca];
}
/** The direction `deg` above the horizontal, pointing forward (+x). */
const dirOf = (deg: number): V => [
  Math.cos((deg * Math.PI) / 180),
  -Math.sin((deg * Math.PI) / 180),
];
/** Clockwise normal on screen: for a head pointing forward it points down (the throat side). */
const nrm = (d: Pt): V => [-d[1], d[0]];

/** A limb or neck outline from a skeleton: joints with widths, as a smooth closed shape. */
function limb(joints: readonly { p: Pt; w: number }[], tension = 0.85): string {
  const left: V[] = [];
  const right: V[] = [];
  for (let i = 0; i < joints.length; i++) {
    const j = joints[i];
    if (j === undefined) continue;
    const prev = joints[Math.max(0, i - 1)]?.p ?? j.p;
    const next = joints[Math.min(joints.length - 1, i + 1)]?.p ?? j.p;
    const n = nrm(unit(sub(next, prev)));
    left.push(add(j.p, mul(n, j.w / 2)));
    right.push(sub(j.p, mul(n, j.w / 2)));
  }
  return smoothD([...left, ...right.reverse()], true, tension);
}

// --- colours -----------------------------------------------------------------------------------

interface Coat {
  readonly coat: string;
  readonly lit: string;
  readonly dark: string;
  readonly belly: string;
  readonly mark: string;
  readonly hoof: string;
}

const BASE: Readonly<Record<FaunaSpecies, Coat>> = {
  // Plains zebra: off-white with near-black stripes (shadow stripes in between).
  zebra: {
    coat: '#ECE6D8',
    lit: '#FAF6EC',
    dark: '#9E978A',
    belly: '#E2DCCD',
    mark: '#1C1918',
    hoof: '#2A2622',
  },
  // Blue wildebeest: dark slate grey, darker brindle bands, black mane, beard and face.
  wildebeest: {
    coat: '#6F6D6C',
    lit: '#8C8986',
    dark: '#474443',
    belly: '#57534F',
    mark: '#262322',
    hoof: '#1E1B1A',
  },
  // Gemsbok: grey-fawn, black flank stripe and mask, white belly and face.
  gemsbok: {
    coat: '#B3A38E',
    lit: '#CBBDA8',
    dark: '#857762',
    belly: '#F1ECE2',
    mark: '#211C19',
    hoof: '#2A2420',
  },
  // Springbok: cinnamon back, dark red-brown flank band, white belly, rump and face.
  springbok: {
    coat: '#C98D55',
    lit: '#DDA772',
    dark: '#9A6638',
    belly: '#F5F0E6',
    mark: '#6A3A22',
    hoof: '#2E2420',
  },
  // Red lechwe: chestnut, white belly and throat, black fronts to the forelegs.
  lechwe: {
    coat: '#C0753B',
    lit: '#D8925A',
    dark: '#8E5226',
    belly: '#F2E9DA',
    mark: '#2A201C',
    hoof: '#2A201C',
  },
  // Giraffe: a cream net between liver-brown patches (the patch colour is per variant).
  giraffe: {
    coat: '#E8DCBE',
    lit: '#F6EEDA',
    dark: '#B3A07C',
    belly: '#EFE6CF',
    mark: '#6E3E20',
    hoof: '#2E2620',
  },
  elephant: {
    coat: '#8E8984',
    lit: '#ABA6A0',
    dark: '#625D58',
    belly: '#6F6A65',
    mark: '#4F4A46',
    hoof: '#BDB4A6',
  },
  // Ostrich cock: black plumage, white plumes; bare skin pink-grey.
  ostrich: {
    coat: '#24201F',
    lit: '#47403D',
    dark: '#121010',
    belly: '#2E2928',
    mark: '#F3EFE7',
    hoof: '#B09088',
  },
};

/** The coat of a look (cows, hens and young ones differ). */
function coatOf(species: FaunaSpecies, variant: FaunaVariant): Coat {
  const b = BASE[species];
  if (species === 'ostrich' && variant !== 'm')
    // Hens and young: grey-brown, greyish-white plumes.
    return {
      ...b,
      coat: variant === 'y' ? '#8C7E6C' : '#7B6E60',
      lit: variant === 'y' ? '#A69882' : '#97897A',
      dark: '#544A40',
      belly: '#6E6255',
      mark: '#D9D2C4',
    };
  if (species === 'giraffe')
    return {
      ...b,
      mark: variant === 'm' ? '#5A2E16' : variant === 'f' ? '#8E5228' : '#A5683A',
    };
  if (species === 'wildebeest' && variant === 'y')
    // Calves are tawny before they turn grey.
    return {
      ...b,
      coat: '#A68662',
      lit: '#BEA07C',
      dark: '#7A6046',
      belly: '#94785A',
      mark: '#4A3626',
    };
  if (species === 'zebra' && variant === 'y')
    // Foals' stripes are brown and fluffy.
    return { ...b, mark: '#4A3528', coat: '#E8DECB' };
  if (species === 'gemsbok' && variant === 'y')
    return { ...b, coat: '#C2A47E', lit: '#D4BA96', dark: '#937A58', mark: '#5A4532' };
  if (species === 'springbok' && variant === 'y')
    return { ...b, coat: '#D4A276', lit: '#E4BA90', mark: '#93603E' };
  return b;
}

// --- the hoofed animals ------------------------------------------------------------------------

/** Proportions in shoulder heights (S = 1). */
interface Build {
  /** Body length, chest front to buttock. */
  readonly L: number;
  /** Croup height (rump top) and buttock point height. */
  readonly croup: number;
  readonly buttock: number;
  /** Underline: at the girth and at the tucked flank; the point of the shoulder. */
  readonly belly: number;
  readonly flank: number;
  readonly chest: number;
  /** Withers forward of the body's middle (share of L). */
  readonly withersAt: number;
  /** A sag in the back (S). */
  readonly sag: number;
  readonly forearmW: number;
  readonly cannonW: number;
  readonly thighW: number;
  readonly kneeH: number;
  readonly hockH: number;
  readonly fetlockH: number;
  readonly neckLen: number;
  readonly neckBase: number;
  readonly neckTop: number;
  /** How far the crest arches out (S). */
  readonly crest: number;
  readonly headLen: number;
  readonly jaw: number;
  /** Neck angle above the horizontal per pose (graze: the head is lowered to the ground). */
  readonly neckDeg: Readonly<Record<'alert' | 'walk' | 'graze', number>>;
  /** Head angle below the neck's line per pose. */
  readonly headBend: Readonly<Record<'alert' | 'walk' | 'graze', number>>;
  readonly tail: number;
  readonly ear: number;
}

const BUILDS: Readonly<Record<Exclude<FaunaSpecies, 'elephant' | 'ostrich'>, Build>> = {
  zebra: {
    L: 1.12,
    croup: 0.99,
    buttock: 0.8,
    belly: 0.53,
    flank: 0.6,
    chest: 0.72,
    withersAt: 0.27,
    sag: 0.035,
    forearmW: 0.11,
    cannonW: 0.055,
    thighW: 0.26,
    kneeH: 0.3,
    hockH: 0.38,
    fetlockH: 0.075,
    neckLen: 0.55,
    neckBase: 0.36,
    neckTop: 0.2,
    crest: 0.05,
    headLen: 0.45,
    jaw: 0.2,
    neckDeg: { alert: 50, walk: 30, graze: -50 },
    headBend: { alert: 98, walk: 80, graze: 30 },
    tail: 0.62,
    ear: 0.16,
  },
  wildebeest: {
    L: 1.05,
    croup: 0.84,
    buttock: 0.68,
    belly: 0.5,
    flank: 0.55,
    chest: 0.7,
    withersAt: 0.3,
    sag: 0.02,
    forearmW: 0.11,
    cannonW: 0.05,
    thighW: 0.24,
    kneeH: 0.3,
    hockH: 0.36,
    fetlockH: 0.07,
    neckLen: 0.45,
    neckBase: 0.42,
    neckTop: 0.24,
    crest: 0.04,
    headLen: 0.56,
    jaw: 0.2,
    neckDeg: { alert: 30, walk: 14, graze: -50 },
    headBend: { alert: 80, walk: 70, graze: 25 },
    tail: 0.7,
    ear: 0.11,
  },
  gemsbok: {
    L: 1.12,
    croup: 0.98,
    buttock: 0.79,
    belly: 0.52,
    flank: 0.58,
    chest: 0.72,
    withersAt: 0.27,
    sag: 0.02,
    forearmW: 0.1,
    cannonW: 0.05,
    thighW: 0.25,
    kneeH: 0.31,
    hockH: 0.38,
    fetlockH: 0.07,
    neckLen: 0.5,
    neckBase: 0.36,
    neckTop: 0.2,
    crest: 0.03,
    headLen: 0.44,
    jaw: 0.19,
    neckDeg: { alert: 46, walk: 26, graze: -50 },
    headBend: { alert: 75, walk: 62, graze: 30 },
    tail: 0.65,
    ear: 0.15,
  },
  springbok: {
    L: 1.05,
    croup: 1.02,
    buttock: 0.82,
    belly: 0.55,
    flank: 0.62,
    chest: 0.73,
    withersAt: 0.28,
    sag: 0.03,
    forearmW: 0.085,
    cannonW: 0.04,
    thighW: 0.22,
    kneeH: 0.31,
    hockH: 0.39,
    fetlockH: 0.065,
    neckLen: 0.5,
    neckBase: 0.28,
    neckTop: 0.15,
    crest: 0.02,
    headLen: 0.36,
    jaw: 0.15,
    neckDeg: { alert: 58, walk: 32, graze: -50 },
    headBend: { alert: 85, walk: 65, graze: 30 },
    tail: 0.24,
    ear: 0.2,
  },
  lechwe: {
    L: 1.1,
    croup: 1.07,
    buttock: 0.86,
    belly: 0.52,
    flank: 0.6,
    chest: 0.7,
    withersAt: 0.25,
    sag: 0.03,
    forearmW: 0.095,
    cannonW: 0.045,
    thighW: 0.26,
    kneeH: 0.3,
    hockH: 0.4,
    fetlockH: 0.07,
    neckLen: 0.5,
    neckBase: 0.3,
    neckTop: 0.16,
    crest: 0.02,
    headLen: 0.38,
    jaw: 0.16,
    neckDeg: { alert: 52, walk: 30, graze: -50 },
    headBend: { alert: 82, walk: 64, graze: 30 },
    tail: 0.26,
    ear: 0.17,
  },
  // In shoulder heights too (the shoulder is 0.6 of the height to the head top).
  giraffe: {
    L: 0.78,
    croup: 0.78,
    buttock: 0.66,
    belly: 0.6,
    flank: 0.63,
    chest: 0.8,
    withersAt: 0.28,
    sag: 0.0,
    forearmW: 0.06,
    cannonW: 0.034,
    thighW: 0.17,
    kneeH: 0.3,
    hockH: 0.38,
    fetlockH: 0.05,
    neckLen: 0.92,
    neckBase: 0.3,
    neckTop: 0.1,
    crest: 0.0,
    headLen: 0.3,
    jaw: 0.1,
    neckDeg: { alert: 62, walk: 46, graze: 52 },
    headBend: { alert: 75, walk: 60, graze: 40 },
    tail: 0.48,
    ear: 0.08,
  },
};

/** A young one: longer legs, a shorter body, a bigger head, a thinner neck. */
function youngBuild(b: Build): Build {
  return {
    ...b,
    L: b.L * 0.9,
    belly: b.belly + 0.06,
    flank: b.flank + 0.06,
    chest: b.chest + 0.03,
    headLen: b.headLen * 1.12,
    jaw: b.jaw * 1.12,
    neckBase: b.neckBase * 0.92,
    cannonW: b.cannonW * 1.08,
    tail: b.tail * 0.75,
    ear: b.ear * 1.15,
  };
}

/** One leg's skeleton (S units, feet-relative x), standing. */
interface LegBones {
  readonly joints: { p: V; w: number }[];
  readonly top: V;
  /** Index of the joint the lower leg bends at (knee or hock). */
  readonly bend: number;
}

/** Context a species' markings draw with. */
interface Geo {
  readonly S: number;
  readonly b: Build;
  readonly x: (share: number) => number;
  readonly bodyD: string;
  readonly legs: { readonly near: LegBones[]; readonly far: LegBones[] };
  readonly neck: {
    readonly root: V;
    readonly poll: V;
    readonly dir: V;
    readonly fillD: string;
    readonly crestPts: V[];
    readonly throatPts: V[];
  };
  readonly head: { readonly at: (u: number, v: number) => V; readonly dir: V; readonly D: string };
  readonly tailRoot: V;
}

interface Pen {
  readonly w: number;
  readonly c: (hex: string) => string;
}

/** Outer outline + fill of a union of shapes: the strokes first (half shows), fills on top. */
function solid(shapes: readonly string[], fill: string, edge: string, w: number): string {
  return (
    el('path', {
      d: shapes.join(''),
      fill: edge,
      stroke: edge,
      'stroke-width': r2(w * 2),
      'stroke-linejoin': 'round',
    }) + el('path', { d: shapes.join(''), fill })
  );
}

/** A vertical light gradient (lit top, shaded bottom) as an id + defs. */
function vGrad(
  y0: number,
  y1: number,
  stops: readonly (readonly [number, string, number])[],
): {
  id: string;
  def: string;
} {
  const id = nextId();
  return {
    id,
    def: el(
      'linearGradient',
      { id, gradientUnits: 'userSpaceOnUse', x1: 0, y1: r2(y0), x2: 0, y2: r2(y1) },
      ...stops.map(([o, c, a]) =>
        el('stop', { offset: r2(o), 'stop-color': c, 'stop-opacity': r2(a) }),
      ),
    ),
  };
}

function radial(cx: number, cy: number, rx: number, ry: number, c: string, a: number): string {
  const id = nextId();
  return (
    el(
      'radialGradient',
      { id },
      el('stop', { offset: 0, 'stop-color': c, 'stop-opacity': r2(a) }),
      el('stop', { offset: 1, 'stop-color': c, 'stop-opacity': 0 }),
    ) + el('path', { d: ellipseD(cx, cy, rx, ry), fill: `url(#${id})` })
  );
}

/** A soft contact shadow under the feet. */
function contactShadow(x0: number, x1: number, h: number): string {
  return radial((x0 + x1) / 2, 0, (x1 - x0) / 2, Math.max(1.2, h), '#2A1E14', 0.42);
}

/** Bisection for an angle so f(angle) hits a target (f increasing or decreasing). */
function solve(f: (a: number) => number, target: number, lo: number, hi: number): number {
  let a = lo;
  let b = hi;
  const fa = f(a) - target;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    const fm = f(m) - target;
    if (fm === 0) return m;
    if (Math.sign(fm) === Math.sign(fa)) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

/** Leg swing per pose: [nearFront, farFront, nearHind, farHind] degrees forward, and lifted. */
const SWING: Readonly<
  Record<'alert' | 'walk' | 'graze' | 'drink', readonly (readonly [number, number])[]>
> = {
  alert: [
    [3, 0],
    [-3, 0],
    [-2, 0],
    [4, 0],
  ],
  graze: [
    [10, 0],
    [-4, 0],
    [-6, 0],
    [5, 0],
  ],
  walk: [
    [17, 0],
    [-14, 48],
    [-15, 0],
    [13, 22],
  ],
  drink: [
    [24, 0],
    [-18, 0],
    [-4, 0],
    [4, 0],
  ],
};

/**
 * Swings a standing leg by `fwd` degrees about its top; `flex` bends the lower leg back (a
 * lifted foot). A planted leg is stretched to reach the ground again.
 */
function swingLeg(l: LegBones, fwd: number, flex: number, front: boolean): LegBones {
  const top = l.top;
  let pts = l.joints.map((j) => ({ p: rot(j.p, top, -fwd), w: j.w }));
  if (flex !== 0) {
    const pivot = pts[l.bend]?.p ?? top;
    // A front knee folds back (the cannon swings back); a hind hock lifts the foot back too.
    pts = pts.map((j, i) =>
      i > l.bend ? { p: rot(j.p, pivot, front ? flex : flex * 0.6), w: j.w } : j,
    );
  }
  const foot = pts[pts.length - 1]?.p ?? top;
  if (flex === 0 && foot[1] !== top[1]) {
    const k = (0 - top[1]) / (foot[1] - top[1]);
    pts = pts.map((j) => ({ p: [j.p[0], top[1] + (j.p[1] - top[1]) * k] as V, w: j.w }));
  }
  return { ...l, joints: pts };
}

function legsOf(b: Build, xOff: number, young: boolean): { near: LegBones[]; far: LegBones[] } {
  const L = b.L;
  const fx = L * 0.33 + xOff;
  const hx = -L * 0.3 + xOff;
  const fw = b.forearmW;
  const cw = b.cannonW;
  const front = (dx: number): LegBones => {
    const x = fx + dx;
    const joints: { p: V; w: number }[] = [
      { p: [x - 0.01, -(b.belly + 0.14)], w: fw * 1.8 },
      { p: [x, -b.belly], w: fw * 1.3 },
      { p: [x + 0.005, -(b.kneeH + (b.belly - b.kneeH) * 0.45)], w: fw },
      { p: [x + 0.008, -b.kneeH], w: cw * 1.5 },
      { p: [x + 0.008, -(b.kneeH * 0.5 + b.fetlockH * 0.5)], w: cw },
      { p: [x + 0.01, -b.fetlockH], w: cw * 1.25 },
      { p: [x + 0.03, -0.022], w: cw * 0.95 },
      { p: [x + 0.04, 0], w: cw * 1.25 },
    ];
    return { joints, top: joints[0]?.p ?? [x, 0], bend: 3 };
  };
  const hind = (dx: number): LegBones => {
    const x = hx + dx;
    const joints: { p: V; w: number }[] = [
      { p: [x + 0.02, -(b.croup - 0.16)], w: b.thighW },
      { p: [x + 0.07, -(b.flank - 0.04)], w: b.thighW * 0.85 },
      { p: [x - 0.03, -(b.hockH + 0.13)], w: b.thighW * 0.42 },
      { p: [x - 0.06, -b.hockH], w: cw * 1.55 },
      { p: [x - 0.05, -(b.hockH * 0.5 + b.fetlockH * 0.5)], w: cw },
      { p: [x - 0.045, -b.fetlockH], w: cw * 1.25 },
      { p: [x - 0.025, -0.022], w: cw * 0.95 },
      { p: [x - 0.015, 0], w: cw * 1.25 },
    ];
    return { joints, top: joints[0]?.p ?? [x, 0], bend: 3 };
  };
  const spread = young ? 0.03 : 0.045;
  return {
    near: [front(0), hind(0)],
    far: [front(-spread * L), hind(spread * L)],
  };
}

/** The hoofed animals: zebra, wildebeest, gemsbok, springbok, lechwe and giraffe. */
function hoofed(look: LookSpec, o: LookOpts): DrawnLook {
  const sp = look.species as Exclude<FaunaSpecies, 'elephant' | 'ostrich'>;
  const young = look.variant === 'y';
  const b0 = BUILDS[sp];
  const b = young ? youngBuild(b0) : b0;
  // S: shoulder height in px (the giraffe's h is to the head top: its shoulder is 0.6 of that).
  const S = sp === 'giraffe' ? look.h * 0.6 : look.h;
  const tint = o.tint ?? ((c: string) => c);
  const coat = coatOf(sp, look.variant);
  const C = {
    coat: tint(coat.coat),
    lit: tint(coat.lit),
    dark: tint(coat.dark),
    belly: tint(coat.belly),
    mark: tint(coat.mark),
    hoof: tint(coat.hoof),
  };
  const edge = tint(shade(mix(coat.coat, coat.mark, 0.35), -0.45));
  const pen: Pen = { w: Math.max(0.45, S * 0.0075), c: tint };
  const pose = look.pose === 'drink' && sp !== 'giraffe' ? 'graze' : look.pose;
  const L = b.L;
  // Feet centre on x = 0.
  const xOff = -L * 0.02;
  const X = (share: number): number => share * L + xOff;
  const P = (x: number, y: number): V => [x * S, y * S];
  // Body: withers, back, croup, buttock, thigh, flank, belly, girth, elbow, chest.
  const wx = X(b.withersAt);
  const drop = look.pose === 'drink' ? 0.1 : 0;
  const fore = (p: V): V => {
    // Drinking: the chest drops as the front legs splay.
    const t = Math.min(1, Math.max(0, (p[0] / S - X(-0.1)) / (L * 0.6)));
    return [p[0], p[1] + drop * S * t];
  };
  const bodyPts: V[] = [
    P(wx, -1),
    P(X(0.05), -(1 + b.croup) / 2 + b.sag),
    P(X(-0.2), -b.croup + b.sag * 0.3),
    P(X(-0.36), -b.croup),
    P(X(-0.47), -(b.croup - 0.05)),
    P(X(-0.5), -b.buttock),
    P(X(-0.46), -(b.buttock - 0.17)),
    P(X(-0.36), -(b.flank - 0.02)),
    P(X(-0.22), -b.flank),
    P(X(0.0), -b.belly + 0.01),
    P(X(0.26), -(b.belly - 0.02)),
    P(X(0.4), -(b.belly + 0.03)),
    P(X(0.5), -b.chest),
    P(X(0.47), -(b.chest + 0.12)),
    P(X(0.36), -0.95),
  ].map(fore);
  const bodyD = smoothD(bodyPts, true, 0.9);
  // Legs.
  const bones = legsOf(b, xOff, young);
  const sw = SWING[look.pose];
  const swung = (l: LegBones | undefined, k: number, front: boolean): LegBones | undefined => {
    const s = sw[k];
    return l === undefined || s === undefined ? l : swingLeg(l, s[0], s[1], front);
  };
  const legs = {
    near: [swung(bones.near[0], 0, true), swung(bones.near[1], 2, false)].filter(
      (l): l is LegBones => l !== undefined,
    ),
    far: [swung(bones.far[0], 1, true), swung(bones.far[1], 3, false)].filter(
      (l): l is LegBones => l !== undefined,
    ),
  };
  const scaleLeg = (l: LegBones): { p: V; w: number }[] =>
    l.joints.map((j) => ({ p: fore(P(j.p[0], j.p[1])), w: j.w * S }));
  // Lowered forequarters: front leg tops follow the chest down (feet stay put).
  const legD = (l: LegBones): string => limb(scaleLeg(l));
  // Neck and head.
  const root: V = fore(P(X(0.34), -0.8));
  const withersPt: V = fore(P(wx + 0.02 * L, -0.99));
  const chestPt: V = fore(P(X(0.49), -(b.chest + 0.08)));
  const NL = b.neckLen * S;
  const HL = b.headLen * S;
  const headAt = (neckDeg: number): { poll: V; dir: V; hdir: V; muzzle: V } => {
    const dir = dirOf(neckDeg);
    const poll = add(root, mul(dir, NL));
    const hdir = dirOf(neckDeg - b.headBend[pose === 'drink' ? 'graze' : pose]);
    return { poll, dir, hdir, muzzle: add(poll, mul(hdir, HL)) };
  };
  let neckDeg: number = b.neckDeg[pose === 'drink' ? 'graze' : pose];
  if (look.pose === 'drink' || (pose === 'graze' && sp !== 'giraffe'))
    // Head down: the muzzle reaches the ground (the water's edge when drinking).
    neckDeg = solve((a) => headAt(a).muzzle[1], -0.015 * S, -85, 10);
  const { poll, dir, hdir } = headAt(neckDeg);
  const hn = nrm(hdir);
  const at = (u: number, v: number): V => add(poll, add(mul(hdir, u * HL), mul(hn, v * b.jaw * S)));
  const n = nrm(dir);
  // The neck: crest from the withers to behind the poll, throat from the jaw to the chest.
  const wTop = b.neckTop * S;
  const crestMid = add(lerp(withersPt, at(-0.05, -0.55), 0.5), mul(n, -(b.crest * S + wTop * 0.2)));
  const crestPts: V[] = [withersPt, crestMid, at(-0.02, -0.6)];
  const throatMid = add(lerp(at(0.12, 0.85), chestPt, 0.5), mul(n, wTop * 0.15));
  const throatPts: V[] = [at(0.2, 0.9), throatMid, chestPt];
  const neckFill: V[] = [
    fore(P(X(0.18), -0.86)),
    ...crestPts,
    at(0.1, 0),
    ...throatPts,
    fore(P(X(0.4), -(b.chest - 0.02))),
    fore(P(X(0.26), -0.7)),
  ];
  const neckD = smoothD(neckFill, true, 0.8);
  // Head outline in (u along the head, v across: − forehead, + jaw).
  const headPts: V[] = [
    at(-0.08, -0.55),
    at(0.12, -0.72),
    at(0.45, -0.58),
    at(0.82, -0.42),
    at(0.98, -0.2),
    at(1.0, 0.08),
    at(0.93, 0.3),
    at(0.78, 0.36),
    at(0.5, 0.62),
    at(0.22, 0.95),
    at(0.02, 0.9),
    at(-0.1, 0.25),
  ];
  const headD = smoothD(headPts, true, 0.85);
  const tailRoot = fore(P(X(-0.47), -(b.croup - 0.06)));
  const geo: Geo = {
    S,
    b,
    x: X,
    bodyD,
    legs,
    neck: { root, poll, dir, fillD: neckD, crestPts, throatPts },
    head: { at, dir: hdir, D: headD },
    tailRoot,
  };

  // --- body part ---
  const defs: string[] = [];
  const bodyShapes = [bodyD, ...legs.near.map(legD)];
  const clipId = nextId();
  const light = vGrad(-1.02 * S, -b.belly * S, [
    [0, C.lit, 0.55],
    [0.35, C.lit, 0],
    [0.72, C.dark, 0.12],
    [1, C.dark, 0.55],
  ]);
  const legShade = vGrad(-b.belly * S, 0, [
    [0, C.dark, 0.4],
    [0.4, C.dark, 0.1],
    [1, C.dark, 0.25],
  ]);
  defs.push(light.def, legShade.def);
  const farC = mix(C.coat, C.dark, 0.55);
  const farLegs = legs.far.map(legD);
  const hooves = (ls: LegBones[], c: string): string =>
    ls
      .map((l) => {
        const j = scaleLeg(l);
        const f = j[j.length - 1];
        const pst = j[j.length - 2];
        if (f === undefined || pst === undefined) return '';
        const d = unit(sub(f.p, pst.p));
        const w = f.w;
        return el('path', {
          d: smoothD(
            [
              add(pst.p, mul(nrm(d), w * 0.42)),
              add(f.p, add(mul(nrm(d), w * 0.55), mul(d, w * 0.15))),
              add(f.p, add(mul(nrm(d), -w * 0.6), mul(d, w * 0.15))),
              add(pst.p, mul(nrm(d), -w * 0.42)),
            ],
            true,
            0.5,
          ),
          fill: c,
        });
      })
      .join('');
  const marks = markings(sp, look, geo, C, pen);
  const xs = [...bodyPts.map((p) => p[0])];
  const shadow = contactShadow(Math.min(...xs) * 0.95, Math.max(...xs) * 0.95, S * 0.05);
  const water = o.wading === true ? wade(S, X, C, tint) : null;
  const body = g(
    {},
    el('defs', {}, ...defs, el('clipPath', { id: clipId }, el('path', { d: bodyShapes.join('') }))),
    water?.under ?? shadow,
    // Far legs: darker, with their own edge.
    solid(farLegs, farC, edge, pen.w),
    el('path', { d: farLegs.join(''), fill: `url(#${legShade.id})` }),
    hooves(legs.far, shade(C.hoof, -0.1)),
    solid(bodyShapes, C.coat, edge, pen.w),
    g(
      { 'clip-path': `url(#${clipId})` },
      marks.body,
      el('path', { d: bodyShapes.join(''), fill: `url(#${light.id})` }),
      el('path', { d: legs.near.map(legD).join(''), fill: `url(#${legShade.id})` }),
      // Rounded masses: a lit haunch and shoulder, the elbow's shadow.
      radial(X(-0.3) * S, -(b.croup - 0.2) * S, 0.24 * S, 0.2 * S, C.lit, 0.3),
      radial(X(0.3) * S, -0.82 * S, 0.18 * S, 0.16 * S, C.lit, 0.22),
      radial(X(0.36) * S, -(b.belly + 0.03) * S, 0.1 * S, 0.06 * S, C.dark, 0.35),
      marks.bodyTop,
    ),
    // Muscle lines: the elbow and the stifle crease.
    el('path', {
      d: smoothD(
        [P(X(0.3), -(b.belly + 0.16)), P(X(0.27), -(b.belly + 0.04)), P(X(0.3), -(b.belly - 0.04))],
        false,
      ),
      fill: 'none',
      stroke: edge,
      'stroke-width': r2(pen.w * 0.7),
      'stroke-opacity': 0.45,
    }),
    el('path', {
      d: smoothD(
        [
          P(X(-0.18), -(b.flank + 0.1)),
          P(X(-0.24), -(b.flank - 0.02)),
          P(X(-0.3), -(b.flank - 0.12)),
        ],
        false,
      ),
      fill: 'none',
      stroke: edge,
      'stroke-width': r2(pen.w * 0.7),
      'stroke-opacity': 0.4,
    }),
    hooves(legs.near, C.hoof),
    water?.over ?? '',
  );

  // --- head part (neck + head) ---
  const hClip = nextId();
  const nLight = vGrad(Math.min(poll[1], withersPt[1]) - 0.1 * S, root[1] + 0.2 * S, [
    [0, C.lit, 0.35],
    [0.6, C.lit, 0],
    [1, C.dark, 0.3],
  ]);
  const earBack = ear(sp, look, geo, C, pen, edge, 'far');
  const earFront = ear(sp, look, geo, C, pen, edge, 'near');
  const head = g(
    {},
    el('defs', {}, nLight.def, el('clipPath', { id: hClip }, el('path', { d: neckD + headD }))),
    marks.behindHead,
    earBack,
    el('path', { d: neckD + headD, fill: C.coat }),
    g(
      { 'clip-path': `url(#${hClip})` },
      marks.neck,
      el('path', { d: neckD, fill: `url(#${nLight.id})` }),
      marks.head,
    ),
    // Outline along the crest and the throat only (the neck's root sits inside the body).
    el('path', {
      d: smoothD(crestPts, false) + smoothD(throatPts, false) + headD,
      fill: 'none',
      stroke: edge,
      'stroke-width': r2(pen.w),
      'stroke-linejoin': 'round',
    }),
    marks.headTop,
    earFront,
    // Eye (a dark almond with a glint) and nostril.
    el('path', {
      d: ellipseD(
        at(0.24, -0.28)[0],
        at(0.24, -0.28)[1],
        Math.max(0.5, S * 0.016),
        Math.max(0.4, S * 0.012),
      ),
      fill: tint('#120E0C'),
    }),
    el('path', {
      d: ellipseD(
        at(0.235, -0.31)[0],
        at(0.235, -0.31)[1],
        Math.max(0.2, S * 0.005),
        Math.max(0.2, S * 0.005),
      ),
      fill: tint('#F4EEE0'),
      opacity: 0.8,
    }),
    el('path', {
      d: ellipseD(
        at(0.94, -0.08)[0],
        at(0.94, -0.08)[1],
        Math.max(0.3, S * 0.01),
        Math.max(0.25, S * 0.007),
      ),
      fill: tint('#1A1412'),
      opacity: 0.8,
    }),
  );

  // --- tail ---
  const tail = tailOf(sp, geo, C, pen, edge);
  const box = {
    x0: Math.min(-0.75 * L * S, poll[0] - 0.5 * S, at(1, 0)[0] - 0.4 * S) - 0.3 * S,
    x1: Math.max(0.7 * L * S, at(1.1, 0)[0], poll[0]) + 0.5 * S,
    y0: Math.min(-1.2 * S, poll[1] - 1.0 * S, at(0, -1)[1] - 0.6 * S),
    y1: 0.25 * S,
  };
  return {
    parts: { tail, body, head },
    pivots: { body: [0, 0], head: root, tail: tailRoot },
    box,
  };
}

/** Shallow water round a wading animal: a sheen and ripples (under), the surface line (over). */
function wade(
  S: number,
  X: (s: number) => number,
  C: { coat: string; dark: string },
  tint: (hex: string) => string,
): { under: string; over: string } {
  const w = 0.75 * S;
  const cx = X(0) * S;
  const surface = -0.13 * S;
  const water = tint('#7E97A0');
  return {
    under: radial(cx, surface * 0.4, w * 1.2, 0.09 * S, tint('#2E3C40'), 0.3),
    over:
      // The water hides the lower legs: a band of water colour, its top edge lit.
      el('path', {
        d: smoothD(
          [
            [cx - w * 1.1, surface + 0.01 * S],
            [cx - w * 0.4, surface - 0.012 * S],
            [cx + w * 0.4, surface - 0.012 * S],
            [cx + w * 1.1, surface + 0.01 * S],
            [cx + w * 0.9, 0.05 * S],
            [cx - w * 0.9, 0.05 * S],
          ],
          true,
          0.8,
        ),
        fill: water,
        opacity: 0.92,
      }) +
      // A soft, broken reflection of the legs and belly.
      el('path', {
        d: `M${r2(cx - w * 0.5)} ${r2(surface + 0.025 * S)}h${r2(w * 0.95)}M${r2(cx - w * 0.3)} ${r2(surface + 0.05 * S)}h${r2(w * 0.55)}`,
        stroke: mix(C.coat, water, 0.55),
        'stroke-width': r2(0.018 * S),
        opacity: 0.7,
      }) +
      el('path', {
        d: smoothD(
          [
            [cx - w * 1.05, surface + 0.006 * S],
            [cx, surface - 0.012 * S],
            [cx + w * 1.05, surface + 0.006 * S],
          ],
          false,
        ),
        fill: 'none',
        stroke: tint('#D8E6EA'),
        'stroke-width': r2(Math.max(0.4, 0.008 * S)),
        opacity: 0.85,
      }),
  };
}

/** The tail (its root at the croup, hanging; a tuft or a horse tail per species). */
function tailOf(
  sp: Exclude<FaunaSpecies, 'elephant' | 'ostrich'>,
  q: Geo,
  C: { coat: string; mark: string; belly: string; dark: string },
  pen: Pen,
  edge: string,
): string {
  const S = q.S;
  const r = q.tailRoot;
  const Lt = q.b.tail * S;
  const end: V = [r[0] - Lt * 0.18, r[1] + Lt];
  const mid: V = [r[0] - Lt * 0.2, r[1] + Lt * 0.45];
  const thin = Math.max(0.5, S * 0.022);
  const stem = el('path', {
    d: limb(
      [
        { p: r, w: thin * 1.6 },
        { p: mid, w: thin * 1.1 },
        { p: end, w: thin * 0.8 },
      ],
      0.8,
    ),
    fill: sp === 'springbok' || sp === 'lechwe' ? C.coat : sp === 'zebra' ? C.coat : C.mark,
    stroke: edge,
    'stroke-width': r2(pen.w * 0.8),
  });
  const tuftLen =
    sp === 'zebra'
      ? 0.42
      : sp === 'giraffe'
        ? 0.35
        : sp === 'springbok'
          ? 0.45
          : sp === 'lechwe'
            ? 0.4
            : 0.85;
  const t0 = lerp(r, end, 1 - tuftLen);
  const tuft = el('path', {
    d: smoothD(
      [
        add(t0, [-thin * 0.4, 0]),
        add(lerp(t0, end, 0.6), [-thin * 2.2, 0]),
        add(end, [-thin * 1.2, thin * 1.8]),
        add(end, [thin * 0.8, thin * 1.4]),
        add(lerp(t0, end, 0.6), [thin * 1.6, 0]),
        add(t0, [thin * 0.4, 0]),
      ],
      true,
      0.9,
    ),
    fill: sp === 'giraffe' ? shade(C.mark, -0.6) : C.mark,
  });
  const stripes =
    sp === 'zebra'
      ? el('path', {
          d: [0.12, 0.26, 0.4, 0.52]
            .map((t) => {
              const p = lerp(r, end, t);
              return `M${r2(p[0] - thin)} ${r2(p[1])}l${r2(thin * 2)} ${r2(thin * 0.4)}`;
            })
            .join(''),
          stroke: C.mark,
          'stroke-width': r2(thin * 0.7),
        })
      : '';
  return g({}, stem, stripes, tuft);
}

/** An ear: a leaf from the poll, up and back (more upright when alert). */
function ear(
  sp: Exclude<FaunaSpecies, 'elephant' | 'ostrich'>,
  look: LookSpec,
  q: Geo,
  C: { coat: string; mark: string; belly: string; dark: string },
  pen: Pen,
  edge: string,
  side: 'near' | 'far',
): string {
  const S = q.S;
  const base = q.head.at(0.02, side === 'near' ? -0.5 : -0.62);
  // Ears point away from the muzzle and up.
  const back = mul(q.head.dir, -1);
  const giraffeOut = sp === 'giraffe' ? 0.7 : 0;
  const lean = look.pose === 'alert' ? 0.55 : 0.85;
  const d = unit(add(mul(back, lean - giraffeOut * 0.3), mul([0, -1], 1 - lean + giraffeOut)));
  const l = q.b.ear * S;
  const w = l * (sp === 'springbok' || sp === 'gemsbok' ? 0.4 : 0.48);
  const tip = add(base, mul(d, l));
  const nn = nrm(d);
  const D = smoothD(
    [
      add(base, mul(nn, w * 0.5)),
      add(lerp(base, tip, 0.55), mul(nn, w * 0.6)),
      tip,
      add(lerp(base, tip, 0.55), mul(nn, -w * 0.55)),
      add(base, mul(nn, -w * 0.45)),
    ],
    true,
    0.9,
  );
  const fill = side === 'far' ? mix(C.coat, C.dark, 0.4) : C.coat;
  const inner =
    side === 'near'
      ? el('path', {
          d: smoothD(
            [
              add(lerp(base, tip, 0.15), mul(nn, w * 0.2)),
              add(lerp(base, tip, 0.6), mul(nn, w * 0.25)),
              lerp(base, tip, 0.88),
              add(lerp(base, tip, 0.5), mul(nn, -w * 0.15)),
            ],
            true,
          ),
          fill: sp === 'wildebeest' ? C.dark : mix(C.belly, '#E8D8CC', 0.4),
          opacity: 0.85,
        })
      : '';
  const tipMark =
    sp === 'zebra' || sp === 'lechwe' || sp === 'gemsbok'
      ? el('path', {
          d: smoothD(
            [
              add(lerp(base, tip, 0.72), mul(nn, w * 0.4)),
              tip,
              add(lerp(base, tip, 0.72), mul(nn, -w * 0.4)),
            ],
            true,
          ),
          fill: C.mark,
          opacity: 0.85,
        })
      : '';
  return g(
    {},
    el('path', { d: D, fill, stroke: edge, 'stroke-width': r2(pen.w * 0.8) }),
    inner,
    tipMark,
  );
}

/** Bands across a limb (zebra legs): short strokes perpendicular to the leg, every `step`. */
function legBands(
  joints: readonly { p: V; w: number }[],
  from: number,
  step: number,
  w: number,
): string {
  let d = '';
  for (let i = 0; i < joints.length - 1; i++) {
    const a = joints[i];
    const c = joints[i + 1];
    if (a === undefined || c === undefined) continue;
    const seg = len(sub(c.p, a.p));
    const dirv = unit(sub(c.p, a.p));
    const nn = nrm(dirv);
    for (let s = 0; s < seg; s += step) {
      const t = s / seg;
      const p = lerp(a.p, c.p, t);
      if (-p[1] > from) continue;
      const wd = a.w + (c.w - a.w) * t;
      const q0 = add(p, mul(nn, wd * 0.7));
      const q1 = sub(p, mul(nn, wd * 0.7));
      d += `M${r2(q0[0])} ${r2(q0[1])}L${r2(q1[0] + dirv[0] * w * 0.3)} ${r2(q1[1] + dirv[1] * w * 0.3)}`;
    }
  }
  return d;
}

interface Marks {
  readonly body: string;
  readonly bodyTop: string;
  readonly neck: string;
  readonly head: string;
  readonly headTop: string;
  readonly behindHead: string;
}

const NO_MARKS: Marks = { body: '', bodyTop: '', neck: '', head: '', headTop: '', behindHead: '' };

/** Each species' coat pattern, mane, horns and face. */
function markings(
  sp: Exclude<FaunaSpecies, 'elephant' | 'ostrich'>,
  look: LookSpec,
  q: Geo,
  C: { coat: string; lit: string; dark: string; belly: string; mark: string },
  pen: Pen,
): Marks {
  const S = q.S;
  const b = q.b;
  const P = (x: number, y: number): V => [x * S, y * S];
  const at = q.head.at;
  const legJoints = (l: LegBones): { p: V; w: number }[] =>
    l.joints.map((j) => ({ p: [j.p[0] * S, j.p[1] * S], w: j.w * S }));
  const rnd = prng(Math.round(S * 1000) + look.pose.length * 17 + look.variant.charCodeAt(0));
  const horn = (pts: readonly V[], w0: number, w1: number, c: string, rings = 0): string => {
    const joints = pts.map((p, i) => ({
      p,
      w: w0 + ((w1 - w0) * i) / Math.max(1, pts.length - 1),
    }));
    let d = '';
    if (rings > 0)
      d = legBands(
        joints,
        1e9,
        len(sub(pts[pts.length - 1] ?? [0, 0], pts[0] ?? [0, 0])) / rings,
        w0 * 0.3,
      );
    return (
      el('path', { d: limb(joints, 0.9), fill: c }) +
      (d === ''
        ? ''
        : el('path', {
            d,
            stroke: shade(c, 0.25),
            'stroke-width': r2(Math.max(0.3, w0 * 0.22)),
            opacity: 0.6,
          }))
    );
  };
  switch (sp) {
    case 'zebra': {
      // Plains zebra: broad vertical bands on the barrel that run down and taper to the belly's
      // midline, bands that sweep back and turn horizontal over the haunch, horizontal rings on the
      // legs; faint brown shadow stripes between the black ones on the haunch.
      const stripe: string[] = [];
      const shadowS: string[] = [];
      const n = 9;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const x0 = q.x(0.36 - t * 0.56);
        const slant = 0.06 + t * 0.12;
        const w = (0.055 - t * 0.012) * (1 + (rnd() - 0.5) * 0.25);
        const top: V = P(x0 + slant * 0.4, -1.05);
        const mid: V = P(x0 + (rnd() - 0.5) * 0.02, -(1 + b.belly) / 2);
        const bot: V = P(x0 - slant * 0.35, -(b.belly - 0.02));
        stripe.push(
          limb(
            [
              { p: top, w: w * S * 1.1 },
              { p: mid, w: w * S },
              { p: bot, w: w * S * 0.35 },
            ],
            0.9,
          ),
        );
      }
      // Haunch: arcs round the hip, wide and nearly horizontal at the back.
      const hip: V = P(q.x(-0.26), -(b.flank - 0.04));
      for (let k = 0; k < 5; k++) {
        const rr = (0.13 + k * 0.085) * S;
        const pts: V[] = [];
        for (let a = -100; a <= 10; a += 22) {
          const rad = (a * Math.PI) / 180;
          pts.push([hip[0] - Math.cos(rad) * rr * 1.25, hip[1] + Math.sin(rad) * rr]);
        }
        stripe.push(
          limb(
            pts.map((p, i) => ({
              p,
              w: S * (0.045 + 0.012 * Math.sin((i / pts.length) * Math.PI)),
            })),
            0.9,
          ),
        );
        const rs = rr + 0.042 * S;
        const sh: V[] = [];
        for (let a = -95; a <= 5; a += 25) {
          const rad = (a * Math.PI) / 180;
          sh.push([hip[0] - Math.cos(rad) * rs * 1.25, hip[1] + Math.sin(rad) * rs]);
        }
        shadowS.push(
          limb(
            sh.map((p) => ({ p, w: S * 0.016 })),
            0.9,
          ),
        );
      }
      const legsD = q.legs.near
        .map((l) => legBands(legJoints(l), (b.belly + 0.05) * S, S * 0.055, S * 0.03))
        .join('');
      // Neck: bands across the neck, carried up into the mane; the face finely striped.
      const neckBands: string[] = [];
      for (let i = 0; i < 8; i++) {
        const t = -0.2 + i * 0.15;
        const c = lerp(q.neck.root, q.neck.poll, t);
        const nn = nrm(q.neck.dir);
        neckBands.push(
          limb(
            [
              { p: add(c, mul(nn, -0.5 * S)), w: 0.06 * S },
              { p: add(c, mul(nn, 0.0)), w: 0.055 * S },
              { p: add(c, mul(nn, 0.45 * S)), w: 0.025 * S },
            ],
            0.9,
          ),
        );
      }
      const face: string[] = [];
      for (let i = 0; i < 6; i++) {
        const u = 0.05 + i * 0.13;
        face.push(
          `M${r2(at(u, -0.75)[0])} ${r2(at(u, -0.75)[1])}L${r2(at(u + 0.06, 0.4)[0])} ${r2(at(u + 0.06, 0.4)[1])}`,
        );
      }
      // Mane: a stiff crest, striped through.
      const crest = q.neck.crestPts;
      const maneW = 0.1 * S;
      const maneOut = crest.map((p, i) =>
        add(p, mul(nrm(q.neck.dir), -maneW * (i === 0 ? 0.3 : 1))),
      );
      const maneD = smoothD([...crest, ...[...maneOut].reverse()], true, 0.9);
      const maneBands = legBands(
        crest.map((p, i) => ({
          p: add(p, mul(nrm(q.neck.dir), -maneW * 0.5)),
          w: maneW * (i === 0 ? 0.6 : 1.2),
        })),
        1e9,
        0.06 * S,
        0.02 * S,
      );
      return {
        ...NO_MARKS,
        body:
          el('path', { d: shadowS.join(''), fill: mix(C.coat, '#7A6650', 0.55), opacity: 0.6 }) +
          el('path', { d: stripe.join(''), fill: C.mark }) +
          el('path', { d: legsD, stroke: C.mark, 'stroke-width': r2(S * 0.028), fill: 'none' }),
        neck: el('path', { d: neckBands.join(''), fill: C.mark }),
        head:
          el('path', { d: face.join(''), stroke: C.mark, 'stroke-width': r2(S * 0.022) }) +
          el('path', {
            d: smoothD([at(0.72, -0.4), at(1.02, -0.2), at(1.0, 0.2), at(0.78, 0.38)], true),
            fill: shade(C.mark, 0.12),
          }),
        behindHead:
          el('path', {
            d: maneD,
            fill: C.coat,
            stroke: mix(C.mark, C.coat, 0.3),
            'stroke-width': r2(pen.w * 0.7),
          }) + el('path', { d: maneBands, stroke: C.mark, 'stroke-width': r2(S * 0.03) }),
      };
    }
    case 'wildebeest': {
      // Darker bands on the neck and shoulder (brindles), a black mane down the neck, a long
      // black beard from the throat, a black face; horns out from a boss, then up and in.
      const brindle: string[] = [];
      for (let i = 0; i < 9; i++) {
        const x0 = q.x(0.36 - i * 0.075);
        brindle.push(
          limb(
            [
              { p: P(x0 + 0.03, -1.0), w: S * 0.022 },
              { p: P(x0, -(1 + b.belly) / 2), w: S * 0.02 },
              { p: P(x0 - 0.02, -(b.belly + 0.04)), w: S * 0.01 },
            ],
            0.9,
          ),
        );
      }
      const nn = nrm(q.neck.dir);
      const neckBr: string[] = [];
      for (let i = 0; i < 5; i++) {
        const c = lerp(q.neck.root, q.neck.poll, 0.15 + i * 0.16);
        neckBr.push(
          limb(
            [
              { p: add(c, mul(nn, -0.35 * S)), w: 0.025 * S },
              { p: add(c, mul(nn, 0.3 * S)), w: 0.015 * S },
            ],
            0.9,
          ),
        );
      }
      const crest = q.neck.crestPts;
      const maneOut = crest.map((p, i) => add(p, mul(nn, -0.09 * S * (i === 0 ? 0.3 : 1))));
      const mane = smoothD([...crest, ...[...maneOut].reverse()], true, 0.9);
      const beardTop = q.neck.throatPts[0] ?? at(0.2, 0.9);
      const beardEnd = q.neck.throatPts[1] ?? beardTop;
      const down: V = [0, 0.22 * S];
      const beard = smoothD(
        [
          beardTop,
          add(beardTop, add(down, [-0.02 * S, 0])),
          add(lerp(beardTop, beardEnd, 0.7), add(down, [0, 0.03 * S])),
          add(lerp(beardTop, beardEnd, 0.9), [0, 0.04 * S]),
          lerp(beardTop, beardEnd, 0.8),
        ],
        true,
        0.9,
      );
      const boss = at(0.0, -0.65);
      const young = look.variant === 'y';
      const hornL = (young ? 0.1 : 0.26) * S;
      const hornPts: V[] = young
        ? [boss, add(boss, [0.02 * S, -hornL])]
        : [
            boss,
            add(boss, [0.1 * S, 0.0]),
            add(boss, [0.16 * S, -0.07 * S]),
            add(boss, [0.12 * S, -hornL * 0.62]),
          ];
      return {
        ...NO_MARKS,
        body: el('path', { d: brindle.join(''), fill: C.mark, opacity: 0.55 }),
        neck:
          el('path', { d: neckBr.join(''), fill: C.mark, opacity: 0.5 }) +
          el('path', { d: mane, fill: C.mark }),
        head: el('path', {
          d: smoothD(
            [
              at(-0.05, -0.6),
              at(0.5, -0.62),
              at(1.02, -0.15),
              at(0.95, 0.3),
              at(0.5, 0.25),
              at(0.1, 0.2),
            ],
            true,
          ),
          fill: C.mark,
          opacity: 0.9,
        }),
        behindHead: el('path', { d: beard, fill: C.mark }),
        headTop: horn(hornPts, 0.055 * S, 0.02 * S, shade(C.mark, 0.15)),
      };
    }
    case 'gemsbok': {
      // A black stripe from the throat down the flank to the haunch, black upper legs with white
      // socks, a black patch on the rump; the white face with a black mask; long straight horns.
      const stripe = smoothD(
        [
          P(q.x(0.42), -(b.belly + 0.08)),
          P(q.x(0.1), -(b.belly + 0.04)),
          P(q.x(-0.25), -(b.flank + 0.03)),
          P(q.x(-0.42), -(b.flank + 0.12)),
          P(q.x(-0.4), -(b.flank + 0.03)),
          P(q.x(-0.25), -(b.flank - 0.05)),
          P(q.x(0.1), -(b.belly - 0.05)),
          P(q.x(0.42), -(b.belly - 0.02)),
        ],
        true,
        0.9,
      );
      const belly = smoothD(
        [
          P(q.x(0.38), -(b.belly - 0.02)),
          P(q.x(0.05), -(b.belly - 0.05)),
          P(q.x(-0.25), -(b.flank - 0.05)),
          P(q.x(-0.3), -(b.flank - 0.2)),
          P(q.x(0.3), -(b.belly - 0.2)),
        ],
        true,
      );
      const legsBlack = q.legs.near
        .map((l) => {
          const j = legJoints(l).slice(0, 4);
          return limb(j.map((x) => ({ p: x.p, w: x.w * 1.05 })));
        })
        .join('');
      const socks = q.legs.near
        .map((l) => {
          const j = legJoints(l);
          const k = j[3];
          const k2 = j[4];
          return k === undefined || k2 === undefined
            ? ''
            : limb([
                { p: k.p, w: k.w * 1.1 },
                { p: lerp(k.p, k2.p, 1.3), w: k2.w * 1.2 },
              ]);
        })
        .join('');
      const rump = smoothD(
        [
          P(q.x(-0.3), -b.croup),
          P(q.x(-0.45), -(b.croup - 0.06)),
          P(q.x(-0.48), -(b.buttock + 0.04)),
          P(q.x(-0.38), -(b.croup - 0.1)),
        ],
        true,
      );
      const young = look.variant === 'y';
      const hornBase = at(0.04, -0.62);
      const hd = q.head.dir;
      // Straight horns: in line with the face, swept back over the neck.
      const back = unit(add(mul(hd, -1), [0, -0.35]));
      const hl = (young ? 0.2 : 0.9) * S;
      const hornPts: V[] = [
        hornBase,
        add(hornBase, mul(back, hl * 0.5)),
        add(hornBase, mul(unit(add(back, [0.05, 0.05])), hl)),
      ];
      const throat = q.neck.throatPts;
      const tTop = throat[0] ?? at(0.2, 0.9);
      const tBot = throat[2] ?? tTop;
      return {
        ...NO_MARKS,
        body:
          el('path', { d: belly, fill: C.belly }) +
          el('path', { d: stripe + rump, fill: C.mark }) +
          el('path', { d: legsBlack, fill: C.mark, opacity: 0.9 }) +
          el('path', { d: socks, fill: C.belly }),
        neck: el('path', {
          d: limb([
            { p: tTop, w: 0.06 * S },
            { p: lerp(tTop, tBot, 0.5), w: 0.05 * S },
            { p: tBot, w: 0.03 * S },
          ]),
          fill: C.mark,
        }),
        head:
          el('path', {
            d: smoothD(
              [
                at(-0.1, -0.7),
                at(0.6, -0.6),
                at(1.02, -0.2),
                at(1.0, 0.25),
                at(0.5, 0.7),
                at(0.0, 0.9),
              ],
              true,
            ),
            fill: C.belly,
          }) +
          // The mask: a band down the nose, a stripe through the eye to the cheek and jaw.
          el('path', {
            d:
              smoothD(
                [
                  at(0.1, -0.72),
                  at(0.55, -0.62),
                  at(0.92, -0.35),
                  at(0.88, -0.18),
                  at(0.5, -0.4),
                  at(0.12, -0.5),
                ],
                true,
              ) +
              smoothD(
                [at(0.18, -0.4), at(0.32, -0.3), at(0.45, 0.4), at(0.38, 0.75), at(0.25, 0.3)],
                true,
              ),
            fill: C.mark,
          }) +
          el('path', {
            d: smoothD([at(0.85, -0.05), at(1.02, 0.05), at(0.96, 0.32), at(0.82, 0.32)], true),
            fill: C.mark,
          }),
        behindHead: horn(hornPts, 0.04 * S, 0.012 * S, shade(C.mark, 0.08), young ? 0 : 6),
      };
    }
    case 'springbok': {
      // The dark flank band between the cinnamon back and the white belly; a white rump, white
      // face with a dark stripe from the eye to the mouth; lyre horns (thin on ewes).
      const band = smoothD(
        [
          P(q.x(0.4), -(b.belly + 0.1)),
          P(q.x(0.05), -(b.belly + 0.1)),
          P(q.x(-0.3), -(b.flank + 0.08)),
          P(q.x(-0.32), -(b.flank - 0.02)),
          P(q.x(0.05), -(b.belly + 0.0)),
          P(q.x(0.42), -(b.belly + 0.02)),
        ],
        true,
        0.9,
      );
      const belly = smoothD(
        [
          P(q.x(0.42), -(b.belly + 0.02)),
          P(q.x(0.05), -b.belly),
          P(q.x(-0.32), -(b.flank - 0.02)),
          P(q.x(-0.3), -(b.flank - 0.2)),
          P(q.x(0.35), -(b.belly - 0.2)),
        ],
        true,
      );
      const rump = smoothD(
        [
          P(q.x(-0.38), -(b.croup - 0.04)),
          P(q.x(-0.5), -(b.croup - 0.08)),
          P(q.x(-0.5), -(b.buttock - 0.1)),
          P(q.x(-0.4), -(b.flank - 0.0)),
          P(q.x(-0.36), -(b.croup - 0.15)),
        ],
        true,
      );
      const young = look.variant === 'y';
      const ewe = look.variant === 'f';
      const base = at(0.04, -0.62);
      const hl = (young ? 0.08 : ewe ? 0.24 : 0.36) * S;
      const back = unit(add(mul(q.head.dir, -0.6), [0, -1]));
      const hornPts: V[] = young
        ? [base, add(base, mul(back, hl))]
        : [
            base,
            add(base, mul(back, hl * 0.45)),
            add(add(base, mul(back, hl * 0.85)), mul(q.head.dir, -hl * 0.25)),
            add(add(base, mul(back, hl)), mul(q.head.dir, hl * 0.12)),
          ];
      return {
        ...NO_MARKS,
        body:
          el('path', { d: belly + rump, fill: C.belly }) + el('path', { d: band, fill: C.mark }),
        head:
          el('path', {
            d: smoothD(
              [
                at(0.3, -0.7),
                at(0.75, -0.5),
                at(1.02, -0.15),
                at(1.0, 0.3),
                at(0.5, 0.7),
                at(0.15, 0.85),
                at(0.1, 0.0),
              ],
              true,
            ),
            fill: C.belly,
          }) +
          el('path', {
            d: limb([
              { p: at(0.22, -0.2), w: 0.04 * S },
              { p: at(0.6, 0.05), w: 0.035 * S },
              { p: at(0.9, 0.2), w: 0.02 * S },
            ]),
            fill: C.mark,
          }) +
          el('path', {
            d: smoothD(
              [at(0.25, -0.72), at(0.7, -0.55), at(0.95, -0.35), at(0.6, -0.45), at(0.25, -0.5)],
              true,
            ),
            fill: C.coat,
            opacity: 0.7,
          }),
        neck: el('path', {
          d: limb([
            { p: q.neck.throatPts[0] ?? at(0.2, 0.9), w: 0.08 * S },
            { p: q.neck.throatPts[2] ?? at(0.2, 0.9), w: 0.1 * S },
          ]),
          fill: C.belly,
          opacity: 0.85,
        }),
        behindHead: horn(
          hornPts,
          (ewe ? 0.025 : 0.04) * S,
          0.012 * S,
          tint2(C.mark),
          young ? 0 : 5,
        ),
      };
    }
    case 'lechwe': {
      // White belly and throat, black fronts on the forelegs; rams' long lyre horns, ridged.
      const belly = smoothD(
        [
          P(q.x(0.42), -(b.belly + 0.04)),
          P(q.x(0.05), -(b.belly + 0.03)),
          P(q.x(-0.3), -(b.flank + 0.02)),
          P(q.x(-0.3), -(b.flank - 0.2)),
          P(q.x(0.35), -(b.belly - 0.2)),
        ],
        true,
      );
      const fronts = q.legs.near
        .slice(0, 1)
        .map((l) => {
          const j = legJoints(l).slice(1, 7);
          return limb(j.map((x) => ({ p: add(x.p, [x.w * 0.22, 0]), w: x.w * 0.55 })));
        })
        .join('');
      const ram = look.variant === 'm';
      const base = at(0.04, -0.62);
      const hl = 0.62 * S;
      const back = unit(add(mul(q.head.dir, -1), [0, -0.6]));
      const up: V = [0, -1];
      const hornPts: V[] = [
        base,
        add(base, mul(back, hl * 0.35)),
        add(add(base, mul(back, hl * 0.7)), mul(up, hl * 0.1)),
        add(add(base, mul(back, hl * 0.8)), mul(up, hl * 0.45)),
      ];
      return {
        ...NO_MARKS,
        body: el('path', { d: belly, fill: C.belly }) + el('path', { d: fronts, fill: C.mark }),
        neck: el('path', {
          d: limb([
            { p: q.neck.throatPts[0] ?? at(0.2, 0.9), w: 0.08 * S },
            { p: q.neck.throatPts[1] ?? at(0.2, 0.9), w: 0.07 * S },
          ]),
          fill: C.belly,
          opacity: 0.8,
        }),
        head: el('path', {
          d: smoothD([at(0.6, -0.5), at(1.0, -0.2), at(1.0, 0.25), at(0.8, 0.35)], true),
          fill: shade(C.coat, -0.2),
          opacity: 0.6,
        }),
        behindHead: ram ? horn(hornPts, 0.04 * S, 0.012 * S, shade(C.mark, 0.1), 7) : '',
      };
    }
    case 'giraffe': {
      // Irregular liver-brown patches with pale lines between (a jittered Voronoi net), smaller
      // on the neck and legs and fading out below the knees; darker on bulls.
      const net = (
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        cell: number,
        gap: number,
      ): string => voronoiPatches(rnd, x0, y0, x1, y1, cell, gap);
      const bodyPatches = net(
        q.x(-0.6) * S,
        -1.1 * S,
        q.x(0.6) * S,
        -(b.belly - 0.25) * S,
        0.13 * S,
        0.022 * S,
      );
      // Legs: smaller patches down to the knees.
      const legPatches = net(
        q.x(-0.6) * S,
        -(b.belly + 0.05) * S,
        q.x(0.6) * S,
        -b.kneeH * S,
        0.07 * S,
        0.016 * S,
      );
      // The neck in its own frame: patches along it.
      const neckLen = len(sub(q.neck.poll, q.neck.root));
      const ang = (Math.atan2(q.neck.dir[1], q.neck.dir[0]) * 180) / Math.PI;
      const neckPatches = voronoiPatches(
        rnd,
        -0.1 * S,
        -0.35 * S,
        neckLen + 0.1 * S,
        0.35 * S,
        0.1 * S,
        0.018 * S,
      );
      const ossi = (u: number, v: number): string => {
        const baseO = at(u, v);
        const tip = add(baseO, add(mul(q.head.dir, -0.04 * S), [0, -0.1 * S]));
        const tuft = look.variant === 'm' ? shade(C.coat, -0.35) : C.mark;
        return (
          el('path', {
            d: limb([
              { p: baseO, w: 0.03 * S },
              { p: tip, w: 0.022 * S },
            ]),
            fill: shade(C.coat, -0.15),
          }) + el('path', { d: ellipseD(tip[0], tip[1], 0.018 * S, 0.016 * S), fill: tuft })
        );
      };
      const mane = smoothD(
        [
          ...q.neck.crestPts,
          ...[...q.neck.crestPts].reverse().map((p) => add(p, mul(nrm(q.neck.dir), -0.03 * S))),
        ],
        true,
        0.9,
      );
      return {
        ...NO_MARKS,
        body:
          el('path', { d: bodyPatches, fill: C.mark }) +
          el('path', { d: legPatches, fill: C.mark, opacity: 0.85 }),
        neck: g(
          {
            transform: `translate(${r2(q.neck.root[0])} ${r2(q.neck.root[1])}) rotate(${r2(ang)})`,
          },
          el('path', { d: neckPatches, fill: C.mark }),
        ),
        head: el('path', {
          d: smoothD([at(0.1, -0.5), at(0.45, -0.45), at(0.4, 0.2), at(0.1, 0.4)], true),
          fill: C.mark,
          opacity: 0.55,
        }),
        behindHead: el('path', { d: mane, fill: shade(C.mark, 0.15), opacity: 0.9 }),
        headTop: ossi(0.0, -0.75) + ossi(0.1, -0.85),
      };
    }
  }
}

const tint2 = (c: string): string => shade(c, -0.1);

/** Irregular patches: a jittered grid's Voronoi cells, shrunk by `gap`, edges a little uneven. */
function voronoiPatches(
  rnd: () => number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cell: number,
  gap: number,
): string {
  const cols = Math.ceil((x1 - x0) / cell) + 2;
  const rows = Math.ceil((y1 - y0) / cell) + 2;
  const seeds: V[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      seeds.push([
        x0 + (c - 0.5 + (r % 2) * 0.5 + (rnd() - 0.5) * 0.7) * cell,
        y0 + (r - 0.5 + (rnd() - 0.5) * 0.7) * cell * 0.92,
      ]);
  let d = '';
  for (const s of seeds) {
    if (s[0] < x0 - cell || s[0] > x1 + cell || s[1] < y0 - cell || s[1] > y1 + cell) continue;
    let poly: V[] = [
      [s[0] - cell * 1.5, s[1] - cell * 1.5],
      [s[0] + cell * 1.5, s[1] - cell * 1.5],
      [s[0] + cell * 1.5, s[1] + cell * 1.5],
      [s[0] - cell * 1.5, s[1] + cell * 1.5],
    ];
    for (const t of seeds) {
      if (t === s) continue;
      const dd = len(sub(t, s));
      if (dd > cell * 2.4 || dd === 0) continue;
      // Keep the side of the bisector nearer s, minus half the gap.
      const nrmv = unit(sub(t, s));
      const mid = add(s, mul(nrmv, dd / 2 - gap / 2));
      poly = clipHalf(poly, mid, nrmv);
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    // Uneven edges: a jittered point between corners.
    const out: V[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const c = poly[(i + 1) % poly.length];
      if (a === undefined || c === undefined) continue;
      out.push(a);
      const m = lerp(a, c, 0.5);
      const toS = unit(sub(s, m));
      out.push(add(m, mul(toS, (rnd() - 0.3) * gap * 0.9)));
    }
    d += smoothD(out, true, 0.45);
  }
  return d;
}

/** Sutherland–Hodgman: the part of a polygon with (p − m) · n ≤ 0. */
function clipHalf(poly: readonly V[], m: Pt, n: Pt): V[] {
  const out: V[] = [];
  const side = (p: Pt): number => (p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const c = poly[(i + 1) % poly.length];
    if (a === undefined || c === undefined) continue;
    const sa = side(a);
    const sc = side(c);
    if (sa <= 0) out.push(a);
    if (sa <= 0 !== sc <= 0) out.push(lerp(a, c, sa / (sa - sc)));
  }
  return out;
}

// --- the elephant ------------------------------------------------------------------------------

/**
 * The African elephant: a high domed head with a trunk hanging to near the ground, tusks curving
 * forward and up, the big ear (the African's shape, its lower lobe pointed) over the neck; a
 * sloping back with the highest point at the shoulder, a sagging belly, pillar legs with baggy
 * skin and round feet; wrinkled grey skin with folds on legs, trunk and ear, dust on the lower
 * body. S = shoulder height.
 */
function elephant(look: LookSpec, o: LookOpts): DrawnLook {
  const young = look.variant === 'y';
  const cow = look.variant === 'f';
  const S = look.h;
  const tint = o.tint ?? ((c: string) => c);
  const base = BASE.elephant;
  const dust = o.dust ?? '#9A8A78';
  const C = {
    coat: tint(base.coat),
    lit: tint(base.lit),
    dark: tint(base.dark),
    mark: tint(base.mark),
    dust: tint(dust),
    ivory: tint('#EDE4CF'),
    nail: tint('#C8BEAC'),
  };
  const edge = tint(shade(base.coat, -0.5));
  const w = Math.max(0.5, S * 0.006);
  const P = (x: number, y: number): V => [x * S, y * S];
  const L = young ? 1.05 : 1.2;
  const bellyH = young ? 0.5 : 0.44;
  const xo = -0.04;
  const X = (s: number): number => s * L + xo;
  const rnd = prng(Math.round(S * 977) + look.pose.length);
  const bodyPts: V[] = [
    P(X(0.3), -1.0),
    P(X(0.08), -0.96),
    P(X(-0.18), -0.9),
    P(X(-0.38), -0.8),
    P(X(-0.49), -0.66),
    P(X(-0.5), -0.55),
    P(X(-0.44), -(bellyH + 0.04)),
    P(X(-0.2), -(bellyH - 0.03)),
    P(X(0.1), -(bellyH - 0.05)),
    P(X(0.34), -(bellyH + 0.0)),
    P(X(0.47), -0.62),
    P(X(0.5), -0.82),
    P(X(0.44), -0.96),
  ];
  const bodyD = smoothD(bodyPts, true, 0.9);
  // Pillar legs, columnar, a little wider at the foot; the walking pair lifted.
  const sw = SWING[look.pose === 'drink' ? 'graze' : look.pose];
  const leg = (
    xTop: number,
    front: boolean,
    k: number,
  ): { d: string; foot: V; j: { p: V; w: number }[] } => {
    const lw = (front ? 0.2 : 0.22) * (young ? 1.05 : 1);
    const top = P(xTop, -(bellyH + 0.22));
    let joints: { p: V; w: number }[] = [
      { p: top, w: lw * 1.25 * S },
      { p: P(xTop + (front ? 0.0 : 0.02), -(bellyH - 0.02)), w: lw * 1.05 * S },
      { p: P(xTop + (front ? 0.01 : -0.01), -0.26), w: lw * 0.9 * S },
      { p: P(xTop + (front ? 0.0 : -0.01), -0.1), w: lw * 0.92 * S },
      { p: P(xTop + 0.005, -0.015), w: lw * 1.05 * S },
    ];
    const s = sw[k] ?? [0, 0];
    joints = joints.map((j) => ({ p: rot(j.p, top, -s[0] * 0.55), w: j.w }));
    if (s[1] !== 0) {
      const pv = joints[2]?.p ?? top;
      joints = joints.map((j, i) =>
        i > 2 ? { p: rot(j.p, pv, front ? s[1] * 0.5 : s[1] * 0.4), w: j.w } : j,
      );
    } else {
      const f = joints[joints.length - 1]?.p ?? top;
      const kk = (0 - top[1]) / (f[1] - top[1] || 1);
      joints = joints.map((j) => ({
        p: [j.p[0], top[1] + (j.p[1] - top[1]) * kk * (1 - 0.015 / 1)] as V,
        w: j.w,
      }));
    }
    return { d: limb(joints, 0.75), foot: joints[joints.length - 1]?.p ?? top, j: joints };
  };
  const nearF = leg(X(0.33), true, 0);
  const farF = leg(X(0.24), true, 1);
  const nearH = leg(X(-0.32), false, 2);
  const farH = leg(X(-0.24), false, 3);
  const feet = (ls: { foot: V; j: { p: V; w: number }[] }[], c: string): string =>
    ls
      .map((l) => {
        const fw = (l.j[l.j.length - 1]?.w ?? 10) * 0.55;
        return (
          el('path', {
            d: ellipseD(l.foot[0], l.foot[1] - fw * 0.12, fw * 1.0, fw * 0.22),
            fill: c,
            opacity: 0.6,
          }) +
          [-0.5, 0, 0.5]
            .map((k) =>
              el('path', {
                d: ellipseD(
                  l.foot[0] + k * fw * 0.8 + fw * 0.2,
                  l.foot[1] - fw * 0.12,
                  fw * 0.16,
                  fw * 0.11,
                ),
                fill: C.nail,
                opacity: 0.85,
              }),
            )
            .join('')
        );
      })
      .join('');
  // Wrinkles: horizontal folds across the legs, curved; some vertical folds on the flank.
  const folds = (j: { p: V; w: number }[], n: number): string => {
    let d = '';
    for (let i = 0; i < n; i++) {
      const t = 0.25 + (i / n) * 0.72;
      const seg = t * (j.length - 1);
      const i0 = Math.floor(seg);
      const a = j[i0];
      const c = j[Math.min(j.length - 1, i0 + 1)];
      if (a === undefined || c === undefined) continue;
      const p = lerp(a.p, c.p, seg - i0);
      const ww = (a.w + (c.w - a.w) * (seg - i0)) * 0.42 * (0.7 + rnd() * 0.3);
      const sag = ww * 0.25 * (rnd() < 0.5 ? 1 : -1);
      d += `M${r2(p[0] - ww)} ${r2(p[1])}Q${r2(p[0])} ${r2(p[1] + sag)} ${r2(p[0] + ww)} ${r2(p[1] - sag * 0.3)}`;
    }
    return d;
  };
  const flank = Array.from({ length: 9 }, (_, i) => {
    const x = X(0.25 - i * 0.075 + (rnd() - 0.5) * 0.02);
    const y0 = -0.85 + rnd() * 0.08;
    return `M${r2(x * S)} ${r2(y0 * S)}q${r2((rnd() - 0.5) * 0.03 * S)} ${r2(0.15 * S)} ${r2(-0.01 * S)} ${r2((0.28 + rnd() * 0.08) * S)}`;
  }).join('');
  const clip = nextId();
  const light = vGrad(-1.0 * S, 0, [
    [0, C.lit, 0.5],
    [0.25, C.lit, 0.0],
    [0.55, C.dark, 0.18],
    [0.75, C.dust, 0.35],
    [1, C.dust, 0.6],
  ]);
  const farGrad = vGrad(-(bellyH + 0.2) * S, 0, [
    [0, C.dark, 0.5],
    [1, C.dust, 0.4],
  ]);
  const nearShapes = [bodyD, nearF.d, nearH.d];
  const xs = bodyPts.map((p) => p[0]);
  const body = g(
    {},
    el(
      'defs',
      {},
      light.def,
      farGrad.def,
      el('clipPath', { id: clip }, el('path', { d: nearShapes.join('') })),
    ),
    contactShadow(Math.min(...xs) * 1.05, Math.max(...xs) * 1.1, S * 0.045),
    solid([farF.d, farH.d], mix(C.coat, C.dark, 0.55), edge, w),
    el('path', { d: farF.d + farH.d, fill: `url(#${farGrad.id})` }),
    feet([farF, farH], shade(C.dark, -0.1)),
    solid(nearShapes, C.coat, edge, w),
    g(
      { 'clip-path': `url(#${clip})` },
      el('path', { d: nearShapes.join(''), fill: `url(#${light.id})` }),
      radial(X(-0.25) * S, -0.72 * S, 0.3 * S, 0.22 * S, C.lit, 0.25),
      radial(X(0.25) * S, -0.75 * S, 0.22 * S, 0.2 * S, C.lit, 0.2),
      el('path', {
        d: folds(nearF.j, 9) + folds(nearH.j, 9) + flank,
        fill: 'none',
        stroke: shade(C.dark, -0.2),
        'stroke-width': r2(w * 0.8),
        'stroke-opacity': 0.55,
        'stroke-linecap': 'round',
      }),
    ),
    feet([nearF, nearH], C.dark),
  );
  // Head: domed, the trunk hanging; tusks; the eye.
  const pose = look.pose === 'drink' ? 'graze' : look.pose;
  const hx = X(0.52);
  const top = -0.97 - (young ? 0.05 : 0);
  const headPts: V[] = [
    P(X(0.36), -0.98),
    P(hx - 0.02, top),
    P(hx + 0.12, top + 0.01),
    P(hx + 0.22, -0.9),
    P(hx + 0.24, -0.72),
    P(hx + 0.2, -0.6),
    P(hx + 0.08, -0.56),
    P(X(0.42), -0.6),
  ];
  // Trunk: from under the eyes, hanging; grazing: curled to the ground; alert: lifted a little.
  const tr0: V = P(hx + 0.2, -0.66);
  const trunkPath: V[] =
    pose === 'graze'
      ? [tr0, P(hx + 0.27, -0.45), P(hx + 0.27, -0.2), P(hx + 0.3, -0.04), P(hx + 0.36, -0.03)]
      : pose === 'alert'
        ? [tr0, P(hx + 0.28, -0.5), P(hx + 0.27, -0.3), P(hx + 0.32, -0.2), P(hx + 0.38, -0.24)]
        : [tr0, P(hx + 0.26, -0.48), P(hx + 0.24, -0.26), P(hx + 0.24, -0.12), P(hx + 0.27, -0.08)];
  const tw0 = (young ? 0.13 : 0.12) * S;
  const trunk = limb(
    trunkPath.map((p, i) => ({ p, w: tw0 * (1 - i * 0.16) })),
    0.85,
  );
  const ringsD = legBands(
    trunkPath.map((p, i) => ({ p, w: tw0 * (1 - i * 0.16) * 0.8 })),
    1e9,
    0.035 * S,
    w,
  );
  const tuskL = young ? 0.0 : cow ? 0.16 : 0.3;
  const tuskBase: V = P(hx + 0.18, -0.6);
  const tusk =
    tuskL > 0
      ? el('path', {
          d: limb(
            [
              { p: tuskBase, w: 0.045 * S },
              { p: add(tuskBase, P(tuskL * 0.35, tuskL * 0.45)), w: 0.038 * S },
              { p: add(tuskBase, P(tuskL * 0.85, tuskL * 0.42)), w: 0.022 * S },
              { p: add(tuskBase, P(tuskL * 1.05, tuskL * 0.15)), w: 0.008 * S },
            ],
            0.9,
          ),
          fill: C.ivory,
          stroke: tint('#A89A80'),
          'stroke-width': r2(w * 0.6),
        })
      : '';
  const headD = smoothD(headPts, true, 0.9);
  const hClip = nextId();
  const hLight = vGrad(top * S, -0.0 * S, [
    [0, C.lit, 0.5],
    [0.3, C.lit, 0],
    [1, C.dust, 0.5],
  ]);
  const eye = P(hx + 0.12, -0.84);
  const head = g(
    {},
    el('defs', {}, hLight.def, el('clipPath', { id: hClip }, el('path', { d: headD + trunk }))),
    solid([headD, trunk], C.coat, edge, w),
    g(
      { 'clip-path': `url(#${hClip})` },
      el('path', { d: headD + trunk, fill: `url(#${hLight.id})` }),
      el('path', {
        d: ringsD,
        stroke: shade(C.dark, -0.2),
        'stroke-width': r2(w * 0.8),
        'stroke-opacity': 0.55,
        fill: 'none',
      }),
      radial(hx * S + 0.05 * S, (top + 0.08) * S, 0.12 * S, 0.08 * S, C.lit, 0.35),
    ),
    tusk,
    el('path', { d: ellipseD(eye[0], eye[1], 0.018 * S, 0.012 * S), fill: tint('#1C1714') }),
    el('path', {
      d: `M${r2(eye[0] - 0.03 * S)} ${r2(eye[1] - 0.025 * S)}q${r2(0.03 * S)} ${r2(-0.012 * S)} ${r2(0.06 * S)} 0`,
      stroke: edge,
      'stroke-width': r2(w * 0.7),
      fill: 'none',
      opacity: 0.6,
    }),
  );
  // The ear: hinged along its front edge behind the eye; the lower lobe pointed.
  const ex = hx - 0.04;
  const eS = young ? 0.85 : 1;
  const earPts: V[] = [
    P(ex, -0.98),
    P(ex - 0.12 * eS, -1.03),
    P(ex - 0.26 * eS, -0.98),
    P(ex - 0.31 * eS, -0.84),
    P(ex - 0.27 * eS, -0.66),
    P(ex - 0.18 * eS, -0.58),
    P(ex - 0.08 * eS, -0.5),
    P(ex - 0.02, -0.6),
    P(ex + 0.01, -0.78),
  ];
  const earD = smoothD(earPts, true, 0.9);
  const veins = Array.from({ length: 5 }, (_, i) => {
    const a = P(ex - 0.03, -0.9 + i * 0.06);
    const b2 = P(ex - (0.16 + rnd() * 0.08) * eS, -0.95 + i * 0.08);
    return `M${r2(a[0])} ${r2(a[1])}Q${r2((a[0] + b2[0]) / 2)} ${r2(a[1] - 0.03 * S)} ${r2(b2[0])} ${r2(b2[1])}`;
  }).join('');
  const eGrad = vGrad(-1.03 * S, -0.5 * S, [
    [0, C.lit, 0.35],
    [1, C.dark, 0.35],
  ]);
  // The ear's top sits a little under the shoulder line (as the head does).
  const earPart = g(
    { transform: `translate(0 ${r2(0.05 * S)})` },
    el('defs', {}, eGrad.def),
    solid([earD], mix(C.coat, C.dark, 0.15), edge, w),
    el('path', { d: earD, fill: `url(#${eGrad.id})` }),
    el('path', {
      d: veins,
      stroke: shade(C.dark, -0.15),
      'stroke-width': r2(w * 0.7),
      'stroke-opacity': 0.5,
      fill: 'none',
    }),
    // A fold along the top edge.
    el('path', {
      d: smoothD([P(ex - 0.03, -0.97), P(ex - 0.14 * eS, -1.0), P(ex - 0.26 * eS, -0.95)], false),
      stroke: C.lit,
      'stroke-width': r2(w * 1.2),
      opacity: 0.5,
      fill: 'none',
    }),
  );
  // Tail: thin, a black hair tuft.
  const tRoot: V = P(X(-0.49), -0.68);
  const tEnd: V = P(X(-0.53), -0.3);
  const tail = g(
    {},
    el('path', {
      d: limb(
        [
          { p: tRoot, w: 0.035 * S },
          { p: lerp(tRoot, tEnd, 0.5), w: 0.022 * S },
          { p: tEnd, w: 0.014 * S },
        ],
        0.8,
      ),
      fill: C.coat,
      stroke: edge,
      'stroke-width': r2(w * 0.8),
    }),
    el('path', {
      d: smoothD(
        [
          add(tEnd, [-0.012 * S, -0.02 * S]),
          add(tEnd, [0.012 * S, -0.02 * S]),
          add(tEnd, [0.008 * S, 0.06 * S]),
          add(tEnd, [-0.01 * S, 0.06 * S]),
        ],
        true,
      ),
      fill: tint('#1E1A18'),
    }),
  );
  return {
    parts: { tail, body, head, ear: earPart },
    pivots: { body: [0, 0], head: P(X(0.38), -0.8), tail: tRoot, ear: P(ex, -0.73) },
    box: { x0: X(-0.7) * S, x1: (hx + 0.6) * S, y0: -1.35 * S, y1: 0.2 * S },
  };
}

// --- the ostrich -------------------------------------------------------------------------------

/**
 * The ostrich: a heavy body of loose plumes (cocks black with white wing and tail plumes, hens
 * and young grey-brown), bare thick thighs, long legs with a big two-toed foot, a long bare neck
 * and a small flat-billed head with a big eye. H = the top of the head in the alert pose.
 */
function ostrich(look: LookSpec, o: LookOpts): DrawnLook {
  const H = look.h;
  const tint = o.tint ?? ((c: string) => c);
  const c0 = coatOf('ostrich', look.variant);
  const cock = look.variant === 'm';
  const C = {
    coat: tint(c0.coat),
    lit: tint(c0.lit),
    dark: tint(c0.dark),
    plume: tint(c0.mark),
    skin: tint(cock ? '#C79A90' : '#B4A49A'),
    shin: tint(cock ? '#C47A70' : '#A8988C'),
  };
  const edge = tint(shade(c0.coat, -0.4));
  const w = Math.max(0.45, H * 0.004);
  const P = (x: number, y: number): V => [x * H, y * H];
  const cy = -0.56;
  const rx = 0.25;
  const ry = 0.14;
  const rnd = prng(Math.round(H * 31) + look.pose.length * 7 + look.variant.charCodeAt(0));
  // Body: an egg tilted a little (tail end higher), its edge loose with plumes.
  const bodyPts: V[] = [];
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    const jag = k > 9 && k < 17 ? 1 + (rnd() - 0.5) * 0.08 : 1;
    const x = Math.cos(a) * rx * jag;
    const y = Math.sin(a) * ry * jag * (Math.cos(a) < 0 ? 1.05 : 0.95) - Math.cos(a) * 0.03;
    bodyPts.push(P(x, cy + y));
  }
  const bodyD = smoothD(bodyPts, true, 0.9);
  // Legs: thigh (bare) from the body to the knee, the shank to the ankle, the foot.
  const sw = SWING[look.pose === 'drink' ? 'graze' : look.pose];
  const leg = (dx: number, k: number): { d: string; foot: V } => {
    const top = P(dx, cy + 0.04);
    let j: { p: V; w: number }[] = [
      { p: top, w: 0.1 * H },
      { p: P(dx + 0.03, -0.36), w: 0.055 * H },
      { p: P(dx - 0.02, -0.2), w: 0.03 * H },
      { p: P(dx - 0.01, -0.035), w: 0.028 * H },
      { p: P(dx + 0.01, -0.005), w: 0.032 * H },
    ];
    const s = sw[k] ?? [0, 0];
    j = j.map((x) => ({ p: rot(x.p, top, -s[0] * 0.9), w: x.w }));
    if (s[1] !== 0) {
      const pv = j[1]?.p ?? top;
      j = j.map((x, i) => (i > 1 ? { p: rot(x.p, pv, s[1] * 0.8), w: x.w } : x));
    } else {
      const f = j[j.length - 1]?.p ?? top;
      const kk = (0 - top[1]) / (f[1] - top[1] || 1);
      j = j.map((x) => ({ p: [x.p[0], top[1] + (x.p[1] - top[1]) * kk] as V, w: x.w }));
    }
    const foot = j[j.length - 1]?.p ?? top;
    return {
      d:
        limb(j, 0.8) +
        limb([
          { p: add(foot, [-0.015 * H, -0.004 * H]), w: 0.026 * H },
          { p: add(foot, [0.055 * H, -0.002 * H]), w: 0.016 * H },
        ]),
      foot,
    };
  };
  const far = leg(-0.04, 1);
  const near = leg(0.04, 0);
  // Plumes: wing (white on cocks, grey on hens) over the side, the tail plume at the back.
  const wing = smoothD(
    [
      P(0.12, cy - 0.06),
      P(-0.05, cy - 0.1),
      P(-0.24, cy - 0.04),
      P(-0.3, cy + 0.06),
      P(-0.2, cy + 0.12),
      P(0.0, cy + 0.1),
      P(0.1, cy + 0.04),
    ],
    true,
    0.9,
  );
  const tailP = smoothD(
    [
      P(-0.2, cy - 0.06),
      P(-0.32, cy - 0.12),
      P(-0.38, cy - 0.04),
      P(-0.34, cy + 0.06),
      P(-0.24, cy + 0.04),
    ],
    true,
    0.9,
  );
  const plumeLines = Array.from({ length: 9 }, (_, i) => {
    const a = P(0.05 - i * 0.04, cy - 0.04 + (i % 3) * 0.02);
    return `M${r2(a[0])} ${r2(a[1])}q${r2(-0.05 * H)} ${r2(0.03 * H)} ${r2(-0.09 * H)} ${r2(0.08 * H)}`;
  }).join('');
  const clip = nextId();
  const light = vGrad((cy - ry) * H, (cy + ry) * H, [
    [0, C.lit, 0.55],
    [0.5, C.lit, 0],
    [1, C.dark, 0.5],
  ]);
  const body = g(
    {},
    el('defs', {}, light.def, el('clipPath', { id: clip }, el('path', { d: bodyD }))),
    contactShadow(-0.2 * H, 0.2 * H, H * 0.02),
    el('path', { d: far.d, fill: shade(C.skin, -0.25), stroke: edge, 'stroke-width': r2(w) }),
    el('path', {
      d: tailP,
      fill: cock ? C.plume : mix(C.plume, C.coat, 0.3),
      stroke: edge,
      'stroke-width': r2(w * 0.7),
    }),
    solid([bodyD], C.coat, edge, w),
    g({ 'clip-path': `url(#${clip})` }, el('path', { d: bodyD, fill: `url(#${light.id})` })),
    el('path', { d: wing, fill: cock ? C.plume : mix(C.plume, C.coat, 0.45), opacity: 0.95 }),
    el('path', {
      d: plumeLines,
      stroke: cock ? tint('#C8C2B8') : C.dark,
      'stroke-width': r2(w * 0.8),
      fill: 'none',
      opacity: 0.7,
    }),
    el('path', { d: near.d, fill: C.skin, stroke: edge, 'stroke-width': r2(w) }),
    // Red-pink shins on a cock (the front of the shank).
    cock
      ? el('path', {
          d: `M${r2(near.foot[0])} ${r2(near.foot[1] - 0.03 * H)}L${r2(near.foot[0] + 0.005 * H)} ${r2(-0.17 * H)}`,
          stroke: C.shin,
          'stroke-width': r2(0.012 * H),
        })
      : '',
  );
  // Neck and head: from the front of the body; graze pecks the ground, alert stands tall.
  const pose = look.pose === 'drink' ? 'graze' : look.pose;
  const root: V = P(0.17, cy - 0.06);
  const headP: V =
    pose === 'alert' ? P(0.2, -0.98) : pose === 'walk' ? P(0.3, -0.9) : P(0.36, -0.06);
  const mid: V = pose === 'graze' ? P(0.34, cy - 0.04) : lerp(root, headP, 0.5);
  const midBend: V = pose === 'graze' ? mid : add(mid, P(0.035, 0));
  const neckD = limb(
    [
      { p: P(0.13, cy - 0.02), w: 0.08 * H },
      { p: root, w: 0.055 * H },
      { p: midBend, w: 0.035 * H },
      { p: headP, w: 0.03 * H },
    ],
    0.8,
  );
  const hd = unit(pose === 'graze' ? [0.2, 1] : [1, 0.12]);
  const hn = nrm(hd);
  const hp = (u: number, v: number): V => add(headP, add(mul(hd, u * H), mul(hn, v * H)));
  const headD = smoothD(
    [
      hp(-0.03, -0.02),
      hp(0.02, -0.035),
      hp(0.05, -0.02),
      hp(0.095, 0.0),
      hp(0.05, 0.02),
      hp(0.0, 0.03),
      hp(-0.03, 0.02),
    ],
    true,
    0.8,
  );
  const head = g(
    {},
    // A collar of plumes where the bare neck meets the body.
    el('path', {
      d: ellipseD(P(0.15, cy - 0.04)[0], P(0.15, cy - 0.04)[1], 0.05 * H, 0.04 * H),
      fill: C.coat,
    }),
    el('path', { d: neckD + headD, fill: C.skin, stroke: edge, 'stroke-width': r2(w) }),
    el('path', {
      d: limb([
        { p: root, w: 0.02 * H },
        { p: midBend, w: 0.014 * H },
      ]),
      fill: C.lit,
      opacity: 0.25,
    }),
    el('path', {
      d: ellipseD(hp(0.012, -0.006)[0], hp(0.012, -0.006)[1], 0.011 * H, 0.009 * H),
      fill: tint('#18120F'),
    }),
    el('path', {
      d: `M${r2(hp(0.04, 0.006)[0])} ${r2(hp(0.04, 0.006)[1])}L${r2(hp(0.09, 0.004)[0])} ${r2(hp(0.09, 0.004)[1])}`,
      stroke: edge,
      'stroke-width': r2(w * 0.8),
    }),
    // Bristly plumes on the crown.
    el('path', {
      d: ellipseD(hp(-0.005, -0.025)[0], hp(-0.005, -0.025)[1], 0.018 * H, 0.008 * H),
      fill: C.dark,
      opacity: 0.6,
    }),
  );
  return {
    parts: { body, head },
    pivots: { body: [0, 0], head: root },
    box: { x0: -0.5 * H, x1: 0.55 * H, y0: -1.1 * H, y1: 0.06 * H },
  };
}

/** Draws one look: its parts, pivots and a box holding them (D-054). */
export function drawLook(look: LookSpec, o: LookOpts = {}): DrawnLook {
  if (look.species === 'elephant') return elephant(look, o);
  if (look.species === 'ostrich') return ostrich(look, o);
  return hoofed(look, o);
}
