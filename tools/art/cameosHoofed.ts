// v1.13 (D-075, art bible §5.7) the hoofed veld cameos on the mid plane, at the D-035 bar: the
// Bushveld warthog sow and her piglets (Die Oes's posed rig, tools/art/harvest.ts, at mid size:
// trotting with the tail straight up and its tuft, kneeling on the front knees to graze, bolting
// with the ears back), the Kalahari springbok (walking, grazing, alert, pronking: the stiff legs
// bunched under an arched back, the head low and the white dorsal fan raised, then landing on
// reaching forelegs) and the Namibië gemsbok (walking, grazing, alert, cantering). The antelope
// share one jointed rig (the far herds' skeleton, tools/art/farFauna.ts, with articulated legs so
// the gaits can bend): elbow, knee and fetlock in front, stifle, hock and fetlock behind, a barrel
// that pitches and arches, a neck with a crest and throat, a head with ears, eye and horns.
// No ink: every edge a shade darker than its part at full width (lesson 43), a readable eye with a
// glint, light from the upper left (a lit back and rump, a shaded belly and far legs). Animals are
// never shown hurt. Frames face right with the feet on the origin; frames are drawn at half
// resolution on the sheet, so shapes stay bold. Pure: frame → SVG.
import type { CameoFrame } from '../../src/game/cameos/cameoSheet';
import type { CameoArt } from './cameos';
import {
  add,
  clipOf,
  lerp,
  limb,
  mul,
  nrm,
  rot,
  solid,
  sub,
  unit,
  vGrad,
  wash,
  type V,
} from './farFauna';
import {
  ADULT,
  digPose,
  drawHog,
  gaitPose,
  hogHead,
  PIGLET,
  type Hide,
  type HogPose,
} from './harvest';
import { mix, nextId, shade } from './scenery';
import { el, ellipseD, g, r2, smoothD } from './svg';

const PREFIXES = ['hog_', 'pig_', 'sb_', 'gb_'];

export function isHoofedFrame(name: CameoFrame): boolean {
  return PREFIXES.some((p) => name.startsWith(p));
}

/** Edge width in design px (≈ 1 sheet px at the half-resolution sheet; 2 in HD). */
const EDGE_PX = 2.2;

let seq = 0;
/** Gives every id in a frame's SVG a prefix unique across the sheet (cmh<n>_). */
function scoped(art: CameoArt): CameoArt {
  seq++;
  const p = `cmh${seq}_`;
  const fix = (s: string): string =>
    s.replace(/\bid="([^"]+)"/g, `id="${p}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${p}$1)`);
  return { defs: fix(art.defs), body: fix(art.body) };
}

// ---------------------------------------------------------------------------------------------
// Warthogs: Die Oes's rig at the mid plane's size, with the eye and mane drawn bolder (the rig's
// own are sized for the Harvest's near plane).

/** v1.13 review round 2: the Bushveld family's own hides — darker and warmer than the Harvest's
 *  grey (bushveld warthogs are dark and often red-brown with the mud they wallow in). In the
 *  Harvest's grey, against the Bushveld's granite, the rig's light bristle specks and coat strokes
 *  read as the rock's lichen and outline showing through the body; on a mud-brown coat they read
 *  as hair, and the hog stands clearly in front of the rock. */
const BUSH_ADULT: Hide = {
  ...ADULT,
  skin: '#64513F',
  lit: '#917A63',
  dark: '#211913',
  belly: '#4A3C32',
  mane: '#1E1712',
  snout: '#3C3029',
  mud: '#5E4630',
};
const BUSH_PIGLET: Hide = {
  ...PIGLET,
  skin: '#6E5644',
  lit: '#937A62',
  dark: '#2E231B',
  belly: '#5E4A3A',
  mane: '#33281F',
  snout: '#4A3A30',
  mud: '#6A503A',
};

/** Design px per hog unit (1 = feet to the top of the back), and the shift that centres it. */
const HOG = { k: 57, dx: -4, w: EDGE_PX / 57 };
const PIG = { k: 27, dx: -3, w: EDGE_PX / 27 };

function hogArt(p: HogPose, hide: Hide, young: boolean, seed: number): CameoArt {
  const f = young ? PIG : HOG;
  const head = hogHead(p, young);
  const eye = head.at(0.3, -0.08);
  const er = 2.3 / f.k;
  // The eye: dark, with a glint and a heavy brow above (readable at phone size).
  const eyeArt =
    el('path', {
      d: ellipseD(eye[0], eye[1], er * 1.25, er),
      fill: shade(hide.skin, -0.55),
    }) +
    el('path', { d: ellipseD(eye[0] + er * 0.1, eye[1], er * 0.85, er * 0.8), fill: '#1A1210' }) +
    el('path', {
      d: ellipseD(eye[0] - er * 0.25, eye[1] - er * 0.3, er * 0.34, er * 0.3),
      fill: '#F4ECDC',
    }) +
    el('path', {
      d: `M${r2(eye[0] - er * 1.6)} ${r2(eye[1] - er * 1.05)}q${r2(er * 1.5)} ${r2(-er * 0.9)} ${r2(er * 3)} ${r2(-er * 0.1)}`,
      stroke: shade(hide.dark, -0.25),
      'stroke-width': r2(er * 0.7),
      'stroke-linecap': 'round',
      fill: 'none',
    });
  // A bolder crest of mane along the neck and the front of the back (the rig's fine bristles go
  // to hairlines at the half-size sheet).
  const ax = unit(sub(p.front, p.rear));
  const n = nrm(ax);
  const t = p.thick / 2;
  const len = Math.hypot(p.front[0] - p.rear[0], p.front[1] - p.rear[1]);
  const along = (k: number, off: number): V => add(add(p.rear, mul(ax, len * k)), mul(n, -off));
  const crown = head.at(0.02, -0.15);
  const maneLen = young ? 0.05 : 0.09;
  const mane = young
    ? ''
    : el('path', {
        d: smoothD(
          [
            along(0.42, t * 0.9),
            along(0.62, t * 1.0 + maneLen * 0.45),
            along(0.9, t * 1.04 + maneLen * 0.85),
            add(crown, [-0.02, -maneLen * 0.9]),
            add(crown, [0.03, -maneLen * 0.2]),
            crown,
            along(1.0, t * 0.92),
            along(0.7, t * 0.92),
          ],
          true,
          0.8,
        ),
        fill: hide.mane,
        stroke: shade(hide.mane, -0.3),
        'stroke-width': r2(f.w * 0.6),
        'stroke-linejoin': 'round',
      });
  const body = g(
    { transform: `translate(${f.dx} -1) scale(${f.k})` },
    drawHog(p, hide, young, seed, f.w, false),
    mane,
    eyeArt,
  );
  return { defs: '', body };
}

function hogFrame(name: CameoFrame): CameoArt {
  switch (name) {
    case 'hog_trot_a':
      return hogArt(gaitPose(0, false, false), BUSH_ADULT, false, 11);
    case 'hog_trot_b':
      return hogArt(gaitPose(0.5, false, false), BUSH_ADULT, false, 11);
    case 'hog_feed':
      return hogArt(digPose(0), BUSH_ADULT, false, 11);
    case 'hog_run_a':
      return hogArt(gaitPose(0.12, true, false), BUSH_ADULT, false, 11);
    case 'hog_run_b':
      return hogArt(gaitPose(0.62, true, false), BUSH_ADULT, false, 11);
    case 'pig_trot_a':
      return hogArt(gaitPose(0, false, true), BUSH_PIGLET, true, 23);
    case 'pig_trot_b':
      return hogArt(gaitPose(0.5, false, true), BUSH_PIGLET, true, 23);
    case 'pig_feed':
      return hogArt(digPose(0), BUSH_PIGLET, true, 23);
    default:
      return hogArt(gaitPose(0.12, true, true), BUSH_PIGLET, true, 23);
  }
}

// ---------------------------------------------------------------------------------------------
// Springbok and gemsbok: one jointed rig in units of the shoulder height (S = 1), facing right,
// feet on y = 0 (y down).

interface Build {
  /** Body length, chest front to buttock; croup and buttock heights. */
  readonly L: number;
  readonly croup: number;
  readonly buttock: number;
  /** Underline at the girth and the tucked flank; the point of the shoulder. */
  readonly belly: number;
  readonly flank: number;
  readonly chest: number;
  readonly withersAt: number;
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
  readonly crest: number;
  readonly headLen: number;
  readonly jaw: number;
  readonly tail: number;
  readonly ear: number;
  readonly horn: number;
}

interface Coat {
  readonly coat: string;
  readonly lit: string;
  readonly dark: string;
  readonly belly: string;
  readonly mark: string;
  readonly hoof: string;
  readonly horn: string;
  readonly inner: string;
}

type Species = 'springbok' | 'gemsbok';

const BUILD: Readonly<Record<Species, Build>> = {
  springbok: {
    L: 1.05,
    croup: 1.03,
    buttock: 0.83,
    belly: 0.56,
    flank: 0.63,
    chest: 0.73,
    withersAt: 0.28,
    sag: 0.03,
    forearmW: 0.1,
    cannonW: 0.052,
    thighW: 0.25,
    kneeH: 0.31,
    hockH: 0.4,
    fetlockH: 0.07,
    neckLen: 0.46,
    neckBase: 0.3,
    neckTop: 0.17,
    crest: 0.02,
    headLen: 0.37,
    jaw: 0.16,
    tail: 0.26,
    ear: 0.24,
    horn: 0.34,
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
    forearmW: 0.115,
    cannonW: 0.058,
    thighW: 0.27,
    kneeH: 0.31,
    hockH: 0.38,
    fetlockH: 0.075,
    neckLen: 0.56,
    neckBase: 0.4,
    neckTop: 0.22,
    crest: 0.035,
    headLen: 0.44,
    jaw: 0.19,
    tail: 0.62,
    ear: 0.17,
    horn: 0.86,
  },
};

const COAT: Readonly<Record<Species, Coat>> = {
  // Cinnamon-fawn back, a broad dark red-brown flank band, white belly, rump and face.
  springbok: {
    coat: '#C98D55',
    lit: '#E2AE78',
    dark: '#9A6638',
    belly: '#F6F1E7',
    mark: '#5E2C16',
    hoof: '#2A201C',
    horn: '#3A2C22',
    inner: '#EEDCCB',
  },
  // Grey-fawn, black flank stripe, mask, blaze and tail, white belly, face and lower legs.
  gemsbok: {
    coat: '#B4A48E',
    lit: '#D2C4AE',
    dark: '#857762',
    belly: '#F2EDE3',
    mark: '#211C19',
    hoof: '#24201C',
    horn: '#2C2622',
    inner: '#E6DCCF',
  },
};

/** Leg angles in degrees at [top, elbow/stifle, knee/hock, fetlock]; + swings the lower part
 *  forward (toward the muzzle). */
type Leg4 = readonly [number, number, number, number];

interface BokPose {
  /** Body pitch (degrees, + nose up) and the back's arch (S). */
  readonly pitch: number;
  readonly arch: number;
  /** Near fore, far fore, near hind, far hind. */
  readonly legs: readonly [Leg4, Leg4, Leg4, Leg4];
  /** Legs whose hoof stands on the ground (none: the lowest hoof is put on the ground). */
  readonly planted: readonly [boolean, boolean, boolean, boolean];
  /** Neck angle above the horizontal; head angle below the neck's line. */
  readonly neck: number;
  readonly head: number;
  /** 0: ears back along the neck, 1: up and forward (alert). */
  readonly ears: number;
  /** Tail lift (degrees from hanging, back and up). */
  readonly tail: number;
  /** The springbok's dorsal fan: 0 folded, 1 fully raised. */
  readonly fan: number;
  /** Head down to the ground (solves the neck angle). */
  readonly graze?: boolean;
}

const dirOf = (deg: number): V => [
  Math.cos((deg * Math.PI) / 180),
  -Math.sin((deg * Math.PI) / 180),
];

interface Joint {
  p: V;
  w: number;
}

/** A leg's standing skeleton (x relative to the body): joints to the coronet, then the sole. */
function legBones(b: Build, x: number, front: boolean): { joints: Joint[]; sole: V } {
  const fw = b.forearmW;
  const cw = b.cannonW;
  if (front)
    return {
      joints: [
        { p: [x - 0.01, -(b.belly + 0.17)], w: fw * 1.9 },
        { p: [x, -b.belly], w: fw * 1.35 },
        { p: [x + 0.005, -(b.kneeH + (b.belly - b.kneeH) * 0.45)], w: fw },
        { p: [x + 0.008, -b.kneeH], w: cw * 1.45 },
        { p: [x + 0.008, -(b.kneeH * 0.5 + b.fetlockH * 0.5)], w: cw },
        { p: [x + 0.01, -b.fetlockH], w: cw * 1.3 },
        { p: [x + 0.028, -0.034], w: cw * 1.05 },
      ],
      sole: [x + 0.045, 0],
    };
  return {
    joints: [
      { p: [x + 0.02, -(b.croup - 0.15)], w: b.thighW },
      { p: [x + 0.07, -(b.flank - 0.04)], w: b.thighW * 0.85 },
      { p: [x - 0.03, -(b.hockH + 0.13)], w: b.thighW * 0.42 },
      { p: [x - 0.06, -b.hockH], w: cw * 1.55 },
      { p: [x - 0.05, -(b.hockH * 0.5 + b.fetlockH * 0.5)], w: cw },
      { p: [x - 0.045, -b.fetlockH], w: cw * 1.3 },
      { p: [x - 0.025, -0.034], w: cw * 1.05 },
    ],
    sole: [x - 0.008, 0],
  };
}

const ARTIC = [0, 1, 3, 5] as const;

/** Bends a leg: each articulation turns everything below it (+ = forward). */
function bend(bones: { joints: Joint[]; sole: V }, top: V, a: Leg4): { joints: Joint[]; sole: V } {
  const d = sub(top, bones.joints[0]?.p ?? top);
  let pts: V[] = [...bones.joints.map((j) => add(j.p, d)), add(bones.sole, d)];
  ARTIC.forEach((ji, k) => {
    const c = pts[ji] ?? top;
    const ang = a[k] ?? 0;
    pts = pts.map((p, i) => (i > ji ? rot(p, c, -ang) : p));
  });
  const sole = pts[pts.length - 1] ?? top;
  return { joints: bones.joints.map((j, i) => ({ p: pts[i] ?? top, w: j.w })), sole };
}

/** Stretches a leg (about its top) so its sole is on the ground. */
function plant(l: { joints: Joint[]; sole: V }): { joints: Joint[]; sole: V } {
  const top = l.joints[0]?.p ?? l.sole;
  const k = (0 - top[1]) / (l.sole[1] - top[1]);
  const f = (p: V): V => [p[0], top[1] + (p[1] - top[1]) * k];
  return { joints: l.joints.map((j) => ({ p: f(j.p), w: j.w })), sole: f(l.sole) };
}

interface BokGeo {
  readonly bodyPts: V[];
  readonly legs: { joints: Joint[]; sole: V }[];
  readonly at: (u: number, v: number) => V;
  readonly hdir: V;
  readonly poll: V;
  readonly neckD: string;
  readonly crestPts: V[];
  readonly throatPts: V[];
  readonly tailRoot: V;
  readonly X: (s: number) => number;
  /** Body-attached point (standing coords → posed). */
  readonly T: (p: V) => V;
}

function skeleton(b: Build, q: BokPose, dy: number): BokGeo {
  const L = b.L;
  const X = (s: number): number => s * L;
  const c0: V = [X(0), -0.78];
  const T = (p: V): V => add(rot(p, c0, -q.pitch), [0, dy]);
  // The arch: the loins rise, the flank tucks up (pronking).
  const bump = (x: number): number => Math.max(0, 1 - ((x - X(-0.08)) / (L * 0.42)) ** 2);
  const top = (x: number, y: number): V => T([x, y - q.arch * bump(x)]);
  const low = (x: number, y: number): V => T([x, y - q.arch * 0.7 * bump(x)]);
  const wx = X(b.withersAt);
  const bodyPts: V[] = [
    top(wx, -1),
    top(X(0.05), -(1 + b.croup) / 2 + b.sag),
    top(X(-0.2), -b.croup + b.sag * 0.3),
    top(X(-0.36), -b.croup),
    top(X(-0.455), -(b.croup - 0.035)),
    T([X(-0.495), -(b.croup + b.buttock) / 2]),
    T([X(-0.505), -b.buttock]),
    T([X(-0.48), -(b.buttock - 0.12)]),
    T([X(-0.44), -(b.buttock - 0.19)]),
    low(X(-0.36), -(b.flank - 0.02)),
    low(X(-0.22), -b.flank),
    low(X(0.0), -b.belly + 0.01),
    low(X(0.26), -(b.belly - 0.02)),
    T([X(0.4), -(b.belly + 0.03)]),
    T([X(0.5), -b.chest]),
    T([X(0.47), -(b.chest + 0.12)]),
    T([X(0.36), -0.95]),
  ];
  const fx = X(0.33);
  const hx = -X(0.3);
  const spread = 0.05 * L;
  const mk = (x: number, front: boolean, a: Leg4): { joints: Joint[]; sole: V } => {
    const bones = legBones(b, x, front);
    return bend(bones, T(bones.joints[0]?.p ?? [x, -0.7]), a);
  };
  let legs = [
    mk(fx, true, q.legs[0]),
    mk(fx - spread, true, q.legs[1]),
    mk(hx, false, q.legs[2]),
    mk(hx + spread, false, q.legs[3]),
  ];
  legs = legs.map((l, i) => (q.planted[i] === true ? plant(l) : l));
  // Neck and head.
  const root = T([X(0.34), -0.8]);
  const withersPt = T([wx + 0.02 * L, -0.99]);
  const chestPt = T([X(0.49), -(b.chest + 0.08)]);
  const NL = b.neckLen;
  const HL = b.headLen;
  const headAt = (neckDeg: number): { poll: V; dir: V; hdir: V; muzzle: V } => {
    const dir = dirOf(neckDeg);
    const poll = add(root, mul(dir, NL));
    const hdir = dirOf(neckDeg - q.head);
    return { poll, dir, hdir, muzzle: add(poll, mul(hdir, HL)) };
  };
  let neckDeg = q.neck;
  if (q.graze === true) {
    // The muzzle to the grass: bisect the neck angle.
    let lo = -85;
    let hi = 10;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (headAt(m).muzzle[1] > -0.03) lo = m;
      else hi = m;
    }
    neckDeg = (lo + hi) / 2;
  }
  const { poll, dir, hdir } = headAt(neckDeg);
  const hn = nrm(hdir);
  const at = (u: number, v: number): V => add(poll, add(mul(hdir, u * HL), mul(hn, v * b.jaw)));
  const n = nrm(dir);
  const wTop = b.neckTop;
  const crestMid = add(lerp(withersPt, at(-0.05, -0.55), 0.5), mul(n, -(b.crest + wTop * 0.2)));
  const crestPts: V[] = [withersPt, crestMid, at(-0.02, -0.6)];
  const throatMid = add(lerp(at(0.12, 0.85), chestPt, 0.5), mul(n, wTop * 0.15));
  const throatPts: V[] = [at(0.2, 0.9), throatMid, chestPt];
  const neckD = smoothD(
    [
      T([X(0.18), -0.86]),
      ...crestPts,
      at(0.1, 0),
      ...throatPts,
      T([X(0.4), -(b.chest - 0.02)]),
      T([X(0.26), -0.7]),
    ],
    true,
    0.8,
  );
  return {
    bodyPts,
    legs,
    at,
    hdir,
    poll,
    neckD,
    crestPts,
    throatPts,
    tailRoot: T([X(-0.47), -(b.croup - 0.06)]),
    X,
    T,
  };
}

/** The posed skeleton with its planted hooves on the ground (or the lowest hoof, if none). */
function posed(b: Build, q: BokPose): BokGeo {
  const first = skeleton(b, q, 0);
  const planted = first.legs.filter((_, i) => q.planted[i] === true);
  const dy =
    planted.length > 0
      ? -planted.reduce((s, l) => s + l.sole[1], 0) / planted.length
      : -Math.max(...first.legs.map((l) => l.sole[1] + 0.012));
  return skeleton(b, q, dy);
}

/** A hoof at the end of a leg: from the coronet to the sole, flat on the ground when planted. */
function hoofD(l: { joints: Joint[]; sole: V }): string {
  const c = l.joints[l.joints.length - 1];
  if (c === undefined) return '';
  const w = c.w * 1.15;
  const d = unit(sub(l.sole, c.p));
  const nn = nrm(d);
  const onGround = Math.abs(l.sole[1]) < 0.004;
  const front = sub(c.p, mul(nn, w * 0.5));
  const back = add(c.p, mul(nn, w * 0.5));
  const toe: V = onGround ? [l.sole[0] + w * 0.62, 0] : sub(l.sole, mul(nn, w * 0.62));
  const heel: V = onGround ? [l.sole[0] - w * 0.4, 0] : add(l.sole, mul(nn, w * 0.4));
  return smoothD([back, front, toe, heel], true, 0.25);
}

/** The near hind and near fore legs, in drawing order. */
function nearLegsOf(geo: BokGeo): { joints: Joint[]; sole: V }[] {
  return [geo.legs[2], geo.legs[0]].filter(
    (l): l is { joints: Joint[]; sole: V } => l !== undefined,
  );
}

function bokFrame(sp: Species, q: BokPose, S: number, dx: number): CameoArt {
  const b = BUILD[sp];
  const C = COAT[sp];
  const geo = posed(b, q);
  const { at, X } = geo;
  const w = EDGE_PX / S;
  const edge = shade(mix(C.coat, C.mark, 0.25), -0.45);
  const farEdge = shade(edge, -0.15);
  const defs: string[] = [];
  const out: string[] = [];
  const limbD = (l: { joints: Joint[] }): string => limb(l.joints, 0.85);
  const box = { x0: -1.6, y0: -2.4, x1: 1.8, y1: 0.3 };
  const yTop = Math.min(...geo.bodyPts.map((p) => p[1]));
  // The light: one vertical gradient over the whole animal (lit back, shaded belly), shared by
  // the body and the near legs so they match where they meet.
  const light = vGrad(yTop - 0.05, -b.belly + 0.08, [
    [0, C.lit, 0.75],
    [0.4, C.lit, 0.0],
    [0.75, C.dark, 0.2],
    [1, C.dark, 0.6],
  ]);
  const legShade = vGrad(-b.belly, 0, [
    [0, C.dark, 0.1],
    [0.6, C.dark, 0.25],
    [1, C.dark, 0.5],
  ]);
  // Light from the upper left: the rump lit, the chest a little in shade.
  const side = nextId();
  defs.push(
    light.def,
    legShade.def,
    el(
      'linearGradient',
      { id: side, gradientUnits: 'userSpaceOnUse', x1: X(-0.6), y1: 0, x2: X(0.9), y2: 0 },
      el('stop', { offset: 0, 'stop-color': C.lit, 'stop-opacity': 0.35 }),
      el('stop', { offset: 0.45, 'stop-color': C.lit, 'stop-opacity': 0 }),
      el('stop', { offset: 0.75, 'stop-color': C.dark, 'stop-opacity': 0 }),
      el('stop', { offset: 1, 'stop-color': C.dark, 'stop-opacity': 0.3 }),
    ),
  );
  const radial = (c: V, rx: number, ry: number, col: string, a: number): string => {
    const id = nextId();
    defs.push(
      el(
        'radialGradient',
        { id },
        el('stop', { offset: 0, 'stop-color': col, 'stop-opacity': r2(a) }),
        el('stop', { offset: 1, 'stop-color': col, 'stop-opacity': 0 }),
      ),
    );
    return el('path', { d: ellipseD(c[0], c[1], rx, ry), fill: `url(#${id})` });
  };

  // --- far side: ear, horn, legs ---
  const ear = (near: boolean): string => {
    const base = sp === 'gemsbok' ? at(-0.04, near ? -0.3 : -0.5) : at(0.02, near ? -0.5 : -0.64);
    const back = mul(geo.hdir, -1);
    const lean = (sp === 'gemsbok' ? 1.0 : 0.9) - q.ears * 0.55;
    const d = unit(add(mul(back, lean), mul([0, -1], 1 - lean + 0.1)));
    const l = b.ear;
    const wd = l * (sp === 'springbok' ? 0.36 : 0.42);
    const tip = add(base, mul(d, l));
    const nn = nrm(d);
    const D = smoothD(
      [
        add(base, mul(nn, wd * 0.5)),
        add(lerp(base, tip, 0.55), mul(nn, wd * 0.6)),
        tip,
        add(lerp(base, tip, 0.55), mul(nn, -wd * 0.55)),
        add(base, mul(nn, -wd * 0.45)),
      ],
      true,
      0.9,
    );
    const fill = near ? C.coat : mix(C.coat, C.dark, 0.5);
    const parts = [
      el('path', {
        d: D,
        fill,
        stroke: near ? edge : farEdge,
        'stroke-width': r2(w),
        'stroke-linejoin': 'round',
      }),
    ];
    if (near) {
      parts.push(
        el('path', {
          d: smoothD(
            [
              add(lerp(base, tip, 0.18), mul(nn, wd * 0.18)),
              add(lerp(base, tip, 0.6), mul(nn, wd * 0.26)),
              lerp(base, tip, 0.86),
              add(lerp(base, tip, 0.5), mul(nn, -wd * 0.16)),
            ],
            true,
          ),
          fill: C.inner,
        }),
      );
      if (sp === 'gemsbok')
        parts.push(
          el('path', {
            d: smoothD(
              [
                add(lerp(base, tip, 0.74), mul(nn, wd * 0.42)),
                tip,
                add(lerp(base, tip, 0.74), mul(nn, -wd * 0.4)),
              ],
              true,
            ),
            fill: C.mark,
          }),
        );
    }
    return g({}, ...parts);
  };
  const horn = (near: boolean): string => {
    const c = near ? C.horn : shade(C.horn, -0.2);
    const hd = geo.hdir;
    const hl = b.horn;
    let pts: V[];
    let w0: number;
    if (sp === 'springbok') {
      // Lyre: up from the brow, back, the tips hooking forward.
      const base = at(near ? 0.06 : 0.0, near ? -0.66 : -0.74);
      const up = unit(add(mul(hd, -0.45), [0, -1]));
      pts = [
        base,
        add(base, mul(up, hl * 0.45)),
        add(add(base, mul(up, hl * 0.82)), mul(hd, -hl * 0.22)),
        add(add(base, mul(up, hl * 1.0)), mul(hd, hl * 0.1)),
      ];
      w0 = 0.055;
    } else {
      // Rapiers: long and straight, swept back in line with the face.
      const base = at(near ? 0.08 : 0.0, near ? -0.62 : -0.72);
      const back = unit(rot(add(mul(hd, -1), [0, -0.3]), [0, 0], near ? 0 : -5));
      pts = [base, add(base, mul(back, hl * 0.5)), add(base, mul(back, hl))];
      w0 = 0.06;
    }
    const joints = pts.map((p, i) => ({ p, w: w0 - ((w0 - 0.012) * i) / (pts.length - 1) }));
    const D = limb(joints, 0.85);
    // Rings on the lower part.
    let rings = '';
    const p0 = pts[0] ?? at(0, 0);
    const p1 = pts[1] ?? p0;
    const p2 = pts[2] ?? p1;
    const ringN = sp === 'springbok' ? 5 : 7;
    for (let i = 1; i <= ringN; i++) {
      const t = i / (ringN + 1);
      const p = sp === 'springbok' ? lerp(p0, lerp(p1, p2, 0.5), t) : lerp(p0, p1, t * 1.1);
      const dd = unit(sub(p1, p0));
      const nn = nrm(dd);
      const wd = (w0 - (w0 - 0.012) * t * 0.6) * 0.5;
      const a = add(p, mul(nn, wd));
      const z = sub(p, mul(nn, wd));
      rings += `M${r2(a[0])} ${r2(a[1])}L${r2(z[0] + dd[0] * 0.01)} ${r2(z[1] + dd[1] * 0.01)}`;
    }
    return g(
      {},
      el('path', {
        d: D,
        fill: c,
        stroke: shade(c, -0.4),
        'stroke-width': r2(w * 0.8),
        'stroke-linejoin': 'round',
      }),
      el('path', {
        d: rings,
        stroke: shade(c, 0.35),
        'stroke-width': r2(w * 0.45),
        fill: 'none',
        opacity: 0.55,
      }),
      // A lit edge along the front of the horn.
      el('path', {
        d: smoothD(
          joints.slice(0, -1).map((j, i) => {
            const nx = nrm(unit(sub(pts[i + 1] ?? j.p, j.p)));
            return add(j.p, mul(nx, j.w * 0.22));
          }),
          false,
        ),
        stroke: shade(c, 0.6),
        'stroke-width': r2(w * 0.45),
        fill: 'none',
        opacity: 0.6,
      }),
    );
  };
  out.push(ear(false), horn(false));
  const farLegs = [geo.legs[1], geo.legs[3]].filter(
    (l): l is { joints: Joint[]; sole: V } => l !== undefined,
  );
  const nearLegs = nearLegsOf(geo);
  const farC = mix(C.coat, C.dark, 0.5);
  const farLower = sp === 'gemsbok' ? mix(C.belly, C.dark, 0.35) : mix(C.coat, C.belly, 0.2);
  for (const l of farLegs) {
    const D = limbD(l);
    const clip = clipOf([D]);
    defs.push(clip.def);
    out.push(
      solid([D], farC, farEdge, w),
      sp === 'gemsbok'
        ? g(
            { 'clip-path': `url(#${clip.id})` },
            el('path', {
              d: limb(
                l.joints.slice(3).map((j) => ({ p: j.p, w: j.w * 1.8 })),
                0.85,
              ),
              fill: farLower,
            }),
          )
        : '',
      wash(clip.id, `url(#${legShade.id})`, box),
      el('path', {
        d: hoofD(l),
        fill: shade(C.hoof, -0.1),
        stroke: farEdge,
        'stroke-width': r2(w),
      }),
    );
  }

  // --- the body, neck and head: one silhouette with one edge ---
  const bodyD = smoothD(geo.bodyPts, true, 0.9);
  const headPts: V[] = [
    at(-0.08, -0.55),
    at(0.12, -0.72),
    at(0.45, -0.6),
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
  const nearDs = nearLegsOf(geo).map((l) => limbD(l));
  const union = clipOf([bodyD, geo.neckD, headD, ...nearDs]);
  const barrel = clipOf([bodyD]);
  const neckClip = clipOf([geo.neckD]);
  const headClip = clipOf([headD]);
  defs.push(union.def, barrel.def, neckClip.def, headClip.def);

  // The tail behind the rump (gemsbok: a long black switch; springbok: short, white, a dark tuft).
  const tail = (): string => {
    const r = geo.tailRoot;
    const Lt = b.tail;
    const d = unit(rot([0, 1], [0, 0], q.tail));
    const end = add(r, mul(d, Lt));
    const mid = add(lerp(r, end, 0.45), [-Lt * 0.06, 0]);
    const thin = sp === 'gemsbok' ? 0.026 : 0.022;
    const stem = limb(
      [
        { p: r, w: thin * 1.6 },
        { p: mid, w: thin * 1.15 },
        { p: end, w: thin * 0.85 },
      ],
      0.8,
    );
    const t0 = lerp(r, end, sp === 'gemsbok' ? 0.4 : 0.62);
    const nn = nrm(d);
    const tuftD = smoothD(
      [
        add(t0, mul(nn, thin * 0.5)),
        add(lerp(t0, end, 0.6), mul(nn, thin * 1.3)),
        add(end, add(mul(d, thin * 1.6), mul(nn, thin * 0.6))),
        add(end, add(mul(d, thin * 1.3), mul(nn, -thin * 0.7))),
        add(lerp(t0, end, 0.6), mul(nn, -thin * 1.1)),
        add(t0, mul(nn, -thin * 0.5)),
      ],
      true,
      0.9,
    );
    const stemC = sp === 'gemsbok' ? C.mark : mix(C.coat, C.belly, 0.45);
    return g(
      {},
      el('path', {
        d: stem,
        fill: stemC,
        stroke: sp === 'gemsbok' ? shade(C.mark, -0.3) : edge,
        'stroke-width': r2(w * 0.9),
      }),
      el('path', {
        d: tuftD,
        fill: sp === 'gemsbok' ? shade(C.mark, -0.2) : C.mark,
        stroke: shade(C.mark, -0.3),
        'stroke-width': r2(w * 0.7),
      }),
    );
  };

  out.push(solid([bodyD, ...nearDs, geo.neckD, headD], C.coat, edge, w));

  // Coat marks, clipped to their parts.
  const P = (x: number, y: number): V => geo.T([X(x), y]);
  const bodyMarks: string[] = [];
  const headMarks: string[] = [];
  const neckMarks: string[] = [];
  if (sp === 'springbok') {
    const belly = smoothD(
      [
        P(0.46, -(b.belly + 0.06)),
        P(0.05, -(b.belly + 0.05)),
        P(-0.32, -(b.flank + 0.02)),
        P(-0.3, -(b.flank - 0.25)),
        P(0.38, -(b.belly - 0.25)),
      ],
      true,
    );
    // The broad dark band from the elbow to the flank.
    const band = smoothD(
      [
        P(0.46, -(b.belly + 0.16)),
        P(0.05, -(b.belly + 0.17)),
        P(-0.26, -(b.flank + 0.15)),
        P(-0.4, -(b.flank + 0.08)),
        P(-0.32, -(b.flank + 0.0)),
        P(0.05, -(b.belly + 0.035)),
        P(0.46, -(b.belly + 0.05)),
      ],
      true,
      0.9,
    );
    const rump = smoothD(
      [
        P(-0.41, -(b.croup - 0.08)),
        P(-0.5, -(b.buttock + 0.04)),
        P(-0.49, -(b.buttock - 0.12)),
        P(-0.4, -(b.buttock - 0.1)),
        P(-0.37, -(b.buttock + 0.05)),
      ],
      true,
      0.9,
    );
    bodyMarks.push(
      el('path', { d: belly + rump, fill: C.belly }),
      el('path', { d: band, fill: C.mark }),
      // The band's soft upper edge into the cinnamon.
      el('path', {
        d: smoothD(
          [P(0.44, -(b.belly + 0.17)), P(0.05, -(b.belly + 0.18)), P(-0.26, -(b.flank + 0.16))],
          false,
        ),
        stroke: mix(C.coat, C.mark, 0.5),
        'stroke-width': r2(0.03),
        fill: 'none',
        opacity: 0.7,
      }),
    );
    // A narrow white throat.
    neckMarks.push(
      el('path', {
        d: limb([
          { p: geo.throatPts[0] ?? at(0.2, 0.9), w: 0.06 },
          { p: geo.throatPts[2] ?? at(0.2, 0.9), w: 0.07 },
        ]),
        fill: C.belly,
        opacity: 0.9,
      }),
    );
    // The white face; a fawn crown; the dark stripe from the eye to the mouth corner.
    headMarks.push(
      el('path', {
        d: smoothD(
          [
            at(0.28, -0.75),
            at(0.75, -0.52),
            at(1.05, -0.15),
            at(1.02, 0.35),
            at(0.5, 0.75),
            at(0.1, 0.95),
            at(0.08, 0.1),
          ],
          true,
        ),
        fill: C.belly,
      }),
      el('path', {
        d: smoothD(
          [at(0.3, -0.8), at(0.7, -0.6), at(0.95, -0.38), at(0.6, -0.44), at(0.3, -0.5)],
          true,
        ),
        fill: mix(C.coat, C.belly, 0.25),
      }),
      el('path', {
        d: limb([
          { p: at(0.2, -0.22), w: 0.065 },
          { p: at(0.55, 0.08), w: 0.055 },
          { p: at(0.88, 0.3), w: 0.03 },
        ]),
        fill: C.mark,
      }),
    );
  } else {
    // Gemsbok: the black stripe along the lower flank, the white belly under it, a dark line
    // down the spine to the black rump patch, the black blaze down the throat; the white face
    // with its black mask.
    const belly = smoothD(
      [
        P(0.4, -(b.belly + 0.05)),
        P(0.05, -(b.belly + 0.04)),
        P(-0.24, -(b.flank + 0.02)),
        P(-0.32, -(b.flank - 0.25)),
        P(0.3, -(b.belly - 0.25)),
      ],
      true,
    );
    const stripe = smoothD(
      [
        P(0.44, -(b.belly + 0.11)),
        P(0.05, -(b.belly + 0.1)),
        P(-0.24, -(b.flank + 0.08)),
        P(-0.36, -(b.flank + 0.13)),
        P(-0.26, -(b.flank + 0.02)),
        P(0.05, -(b.belly + 0.035)),
        P(0.44, -(b.belly + 0.05)),
      ],
      true,
      0.9,
    );
    const rumpPatch = smoothD(
      [
        P(-0.18, -(b.croup + 0.05)),
        P(-0.5, -(b.croup + 0.02)),
        P(-0.53, -(b.buttock - 0.02)),
        P(-0.42, -(b.buttock + 0.04)),
        P(-0.3, -(b.croup - 0.1)),
      ],
      true,
      0.9,
    );
    bodyMarks.push(
      el('path', { d: belly, fill: C.belly }),
      el('path', { d: stripe + rumpPatch, fill: C.mark }),
      el('path', {
        d: smoothD(
          [P(0.27, -1.01), P(0.0, -(1 + b.croup) / 2 - 0.01), P(-0.25, -(b.croup + 0.02))],
          false,
        ),
        stroke: C.mark,
        'stroke-width': r2(0.035),
        fill: 'none',
        'stroke-linecap': 'round',
      }),
    );
    const tTop = geo.throatPts[0] ?? at(0.2, 0.9);
    const tBot = geo.throatPts[2] ?? tTop;
    neckMarks.push(
      el('path', {
        d: limb([
          { p: tTop, w: 0.1 },
          { p: lerp(tTop, tBot, 0.5), w: 0.08 },
          { p: tBot, w: 0.05 },
        ]),
        fill: C.mark,
      }),
    );
    headMarks.push(
      el('path', {
        d: smoothD(
          [
            at(-0.1, -0.75),
            at(0.6, -0.65),
            at(1.05, -0.2),
            at(1.02, 0.3),
            at(0.5, 0.75),
            at(0.0, 0.95),
          ],
          true,
        ),
        fill: C.belly,
      }),
      // The mask: a band down the nose, a stripe through the eye to the jaw, the dark muzzle.
      el('path', {
        d:
          smoothD(
            [
              at(0.1, -0.74),
              at(0.55, -0.64),
              at(0.92, -0.36),
              at(0.88, -0.16),
              at(0.5, -0.38),
              at(0.12, -0.5),
            ],
            true,
          ) +
          smoothD(
            [at(0.12, -0.42), at(0.34, -0.36), at(0.48, 0.45), at(0.36, 0.85), at(0.18, 0.4)],
            true,
          ) +
          smoothD([at(0.84, -0.02), at(1.03, 0.05), at(0.97, 0.34), at(0.8, 0.34)], true),
        fill: C.mark,
      }),
    );
  }
  const yb = -b.belly;
  out.push(
    g({ 'clip-path': `url(#${barrel.id})` }, ...bodyMarks),
    g({ 'clip-path': `url(#${neckClip.id})` }, ...neckMarks),
    g(
      { 'clip-path': `url(#${union.id})` },
      wash(union.id, `url(#${light.id})`, box),
      wash(union.id, `url(#${side})`, box),
      radial(P(-0.3, -(b.croup - 0.2)), 0.24, 0.2, C.lit, 0.35),
      radial(P(0.3, -0.84), 0.18, 0.15, C.lit, 0.25),
      radial(P(0.38, yb - 0.04), 0.12, 0.07, C.dark, 0.35),
    ),
    // The face over the body's light (its own: lit brow, shaded jaw).
    g(
      { 'clip-path': `url(#${headClip.id})` },
      ...headMarks,
      radial(at(0.3, -0.5), 0.2, 0.12, '#FFFFFF', 0.25),
      radial(at(0.45, 0.7), 0.25, 0.1, C.dark, 0.3),
    ),
    // The edge redrawn where the neck meets the head (the jaw line), the throat and crest.
    el('path', {
      d: smoothD([at(0.02, 0.9), at(0.22, 0.95), at(0.5, 0.62)], false),
      fill: 'none',
      stroke: edge,
      'stroke-width': r2(w * 0.8),
      opacity: 0.7,
    }),
  );

  // The springbok's dorsal fan: long white hairs raised along the rear half of the back.
  if (sp === 'springbok' && q.fan > 0) {
    const base: V[] = [];
    const tips: V[] = [];
    const nTip = 9;
    for (let i = 0; i <= nTip; i++) {
      const t = i / nTip;
      const x = 0.08 - t * 0.48;
      const y = -(1 + b.croup) / 2 + b.sag - (x < -0.2 ? (b.croup - 1) * 0.5 : 0);
      const bpt = geo.T([
        X(x),
        y - q.arch * Math.max(0, 1 - ((X(x) - X(-0.08)) / (b.L * 0.42)) ** 2),
      ]);
      const hgt = q.fan * (0.07 + 0.17 * Math.sin(Math.PI * Math.min(1, t * 1.05)));
      base.push(add(bpt, [0, 0.025]));
      tips.push(add(bpt, [-hgt * 0.35, -hgt]));
    }
    const fanD = smoothD([...base, ...tips.reverse()], true, 0.7);
    const hairs = base
      .map((p, i) => {
        const t = tips[tips.length - 1 - i] ?? p;
        return `M${r2(p[0])} ${r2(p[1])}L${r2(lerp(p, t, 0.9)[0])} ${r2(lerp(p, t, 0.9)[1])}`;
      })
      .join('');
    out.push(
      el('path', {
        d: fanD,
        fill: '#FBF8F2',
        stroke: shade(C.belly, -0.38),
        'stroke-width': r2(w * 0.8),
        'stroke-linejoin': 'round',
      }),
      el('path', {
        d: hairs,
        stroke: shade(C.belly, -0.2),
        'stroke-width': r2(w * 0.4),
        fill: 'none',
        opacity: 0.8,
      }),
    );
  }

  out.push(tail());

  // --- near legs: in front of the body, fading into it at the shoulder and thigh ---
  nearLegs.forEach((l, i) => {
    const D = limbD(l);
    const clip = clipOf([D]);
    const mask = nextId();
    const mg = nextId();
    const top = l.joints[0]?.p ?? [0, 0];
    const join = l.joints[1]?.p ?? top;
    const hindLeg = i === 0;
    const y0 = join[1] - (hindLeg ? 0.07 : 0.1);
    const y1 = join[1] + (hindLeg ? 0.03 : -0.015);
    defs.push(
      clip.def,
      el(
        'linearGradient',
        { id: mg, gradientUnits: 'userSpaceOnUse', x1: 0, y1: r2(y0), x2: 0, y2: r2(y1) },
        el('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0 }),
        el('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 1 }),
      ),
      el(
        'mask',
        {
          id: mask,
          maskUnits: 'userSpaceOnUse',
          x: box.x0,
          y: box.y0,
          width: box.x1 - box.x0,
          height: box.y1 - box.y0,
        },
        el('rect', {
          x: box.x0,
          y: box.y0,
          width: box.x1 - box.x0,
          height: box.y1 - box.y0,
          fill: `url(#${mg})`,
        }),
      ),
    );
    const marks: string[] = [];
    const j = l.joints;
    if (sp === 'gemsbok') {
      // Black upper leg, white lower leg with a dark band below the knee or hock.
      const k = j[3];
      const k2 = j[4];
      if (k !== undefined && k2 !== undefined) {
        marks.push(
          el('path', {
            d: limb(
              j.slice(3).map((x) => ({ p: x.p, w: x.w * 1.8 })),
              0.85,
            ),
            fill: C.belly,
          }),
          el('path', {
            d: limb(
              [
                { p: lerp(k.p, k2.p, 0.15), w: k.w * 1.9 },
                { p: lerp(k.p, k2.p, 0.6), w: k2.w * 1.9 },
              ],
              0.85,
            ),
            fill: C.mark,
          }),
          hindLeg
            ? ''
            : el('path', {
                d: limb(
                  j.slice(1, 4).map((x, n) => ({ p: x.p, w: x.w * (1.5 - n * 0.3) })),
                  0.9,
                ),
                fill: C.mark,
              }),
        );
      }
    } else {
      // Springbok: paler inner lower legs (a light line down the back of the cannon).
      const k = j[3];
      const f = j[5];
      if (k !== undefined && f !== undefined)
        marks.push(
          el('path', {
            d: limb(
              [
                { p: add(k.p, [hindLeg ? -0.012 : 0.012, 0]), w: k.w * 0.5 },
                { p: add(f.p, [hindLeg ? -0.01 : 0.01, 0]), w: f.w * 0.45 },
              ],
              0.85,
            ),
            fill: mix(C.coat, C.belly, 0.55),
            opacity: 0.8,
          }),
        );
    }
    out.push(
      g(
        { mask: `url(#${mask})` },
        solid([D], C.coat, edge, w),
        g({ 'clip-path': `url(#${clip.id})` }, ...marks),
        wash(clip.id, `url(#${light.id})`, box),
        wash(clip.id, `url(#${legShade.id})`, box),
      ),
      el('path', {
        d: hoofD(l),
        fill: C.hoof,
        stroke: shade(C.hoof, -0.3),
        'stroke-width': r2(w),
        'stroke-linejoin': 'round',
      }),
    );
  });

  // --- near ear, horn, the face ---
  out.push(ear(true), horn(true));
  const eye = at(0.27, -0.26);
  const er = 2.2 / S;
  const ang = (Math.atan2(geo.hdir[1], geo.hdir[0]) * 180) / Math.PI;
  out.push(
    g(
      { transform: `rotate(${r2(ang)} ${r2(eye[0])} ${r2(eye[1])})` },
      // A pale rim so the eye reads on the dark stripe or mask.
      el('path', {
        d: ellipseD(eye[0], eye[1], er * 1.55, er * 1.2),
        fill: sp === 'gemsbok' ? '#5A4A3E' : '#3A2418',
      }),
      el('path', { d: ellipseD(eye[0], eye[1], er * 1.2, er * 0.9), fill: '#120D0B' }),
      el('path', {
        d: ellipseD(eye[0] - er * 0.35, eye[1] - er * 0.3, er * 0.38, er * 0.34),
        fill: '#F6F0E4',
      }),
    ),
    // Nostril and the mouth line.
    el('path', {
      d: ellipseD(at(0.93, -0.05)[0], at(0.93, -0.05)[1], 0.018, 0.012),
      fill: '#1A1412',
      opacity: 0.85,
    }),
    el('path', {
      d: smoothD([at(0.98, 0.22), at(0.88, 0.26), at(0.8, 0.24)], false),
      stroke: shade(C.mark, -0.2),
      'stroke-width': r2(w * 0.6),
      fill: 'none',
      opacity: 0.7,
    }),
  );
  return {
    defs: defs.join(''),
    body: g({ transform: `translate(${r2(dx)} ${r2(-EDGE_PX * 0.5)}) scale(${r2(S)})` }, ...out),
  };
}

const STAND: Leg4 = [0, 0, 0, 0];

/** The springbok's frames (S: design px per shoulder height; dx centres it in its box). */
const SB = { S: 60, dx: -12 };
const SB_POSES: Readonly<Record<string, BokPose>> = {
  sb_walk_a: {
    pitch: 0,
    arch: 0,
    legs: [
      [16, 0, 0, 0],
      [-12, 18, -55, 10],
      [-15, 0, 0, 0],
      [12, 0, 10, 0],
    ],
    planted: [true, false, true, true],
    neck: 32,
    head: 65,
    ears: 0.35,
    tail: 8,
    fan: 0,
  },
  sb_walk_b: {
    pitch: 0,
    arch: 0,
    legs: [
      [-12, 18, -55, 10],
      [16, 0, 0, 0],
      [12, 0, 10, 0],
      [-15, 0, 0, 0],
    ],
    planted: [false, true, true, true],
    neck: 30,
    head: 65,
    ears: 0.35,
    tail: 4,
    fan: 0,
  },
  sb_graze: {
    pitch: -6,
    arch: 0,
    legs: [
      [4, 0, 0, 0],
      [-4, 0, 0, 0],
      [-6, 0, 0, 0],
      [5, 0, 0, 0],
    ],
    planted: [true, true, true, true],
    neck: -40,
    head: 4,
    ears: 0.3,
    tail: 4,
    fan: 0,
    graze: true,
  },
  sb_alert: {
    pitch: 2,
    arch: 0,
    legs: [STAND, [-3, 0, 0, 0], [-2, 0, 0, 0], [4, 0, 0, 0]],
    planted: [true, true, true, true],
    neck: 60,
    head: 85,
    ears: 1,
    tail: 15,
    fan: 0,
  },
  // Stotting: the four legs stiff and bunched straight down, the back arched, the head low and
  // the white fan raised (the game lifts this frame off the ground).
  sb_pronk_a: {
    pitch: -4,
    arch: 0.07,
    legs: [
      [-12, 0, 0, 4],
      [-16, 0, 0, 4],
      [20, -6, 0, -4],
      [24, -6, 0, -4],
    ],
    planted: [true, true, true, true],
    neck: 4,
    head: 60,
    ears: 0.5,
    tail: 35,
    fan: 1,
  },
  // Landing: the forelegs reaching for the ground, the hind legs trailing.
  sb_pronk_b: {
    pitch: -6,
    arch: 0.02,
    legs: [
      [26, 0, -4, -6],
      [18, 0, -6, -8],
      [-28, -6, 20, 10],
      [-20, -6, 24, 12],
    ],
    planted: [false, false, false, false],
    neck: 30,
    head: 70,
    ears: 0.4,
    tail: 30,
    fan: 0.5,
  },
};

const GB = { S: 78, dx: -18 };
const GB_POSES: Readonly<Record<string, BokPose>> = {
  gb_walk_a: {
    pitch: 0,
    arch: 0,
    legs: [
      [15, 0, 0, 0],
      [-12, 18, -55, 10],
      [-14, 0, 0, 0],
      [12, 0, 10, 0],
    ],
    planted: [true, false, true, true],
    neck: 34,
    head: 66,
    ears: 0.3,
    tail: 4,
    fan: 0,
  },
  gb_walk_b: {
    pitch: 0,
    arch: 0,
    legs: [
      [-12, 18, -55, 10],
      [15, 0, 0, 0],
      [12, 0, 10, 0],
      [-14, 0, 0, 0],
    ],
    planted: [false, true, true, true],
    neck: 32,
    head: 66,
    ears: 0.3,
    tail: 2,
    fan: 0,
  },
  gb_graze: {
    pitch: -6,
    arch: 0,
    legs: [
      [4, 0, 0, 0],
      [-4, 0, 0, 0],
      [-6, 0, 0, 0],
      [5, 0, 0, 0],
    ],
    planted: [true, true, true, true],
    neck: -40,
    head: 4,
    ears: 0.3,
    tail: 3,
    fan: 0,
    graze: true,
  },
  gb_alert: {
    pitch: 2,
    arch: 0,
    legs: [STAND, [-3, 0, 0, 0], [-2, 0, 0, 0], [4, 0, 0, 0]],
    planted: [true, true, true, true],
    neck: 56,
    head: 84,
    ears: 1,
    tail: 10,
    fan: 0,
  },
  // Cantering: gathered (a fore planted, the hinds swung under the body)…
  gb_run_a: {
    pitch: 3,
    arch: 0.02,
    legs: [
      [-6, 0, 0, 0],
      [22, 30, -95, 20],
      [24, 6, -10, 0],
      [34, 20, -40, 10],
    ],
    planted: [true, false, true, false],
    neck: 30,
    head: 62,
    ears: 0.1,
    tail: 22,
    fan: 0,
  },
  // …then stretched out (the fores reaching, the hinds pushing off behind).
  gb_run_b: {
    pitch: -2,
    arch: -0.01,
    legs: [
      [34, 10, -8, -4],
      [16, 0, 0, 0],
      [-24, -4, 16, 8],
      [-14, 0, 30, 20],
    ],
    planted: [false, true, false, false],
    neck: 28,
    head: 62,
    ears: 0.1,
    tail: 28,
    fan: 0,
  },
};

export function hoofedFrameArt(name: CameoFrame): CameoArt {
  if (name.startsWith('hog_') || name.startsWith('pig_')) return scoped(hogFrame(name));
  const sb = SB_POSES[name];
  if (sb !== undefined) return scoped(bokFrame('springbok', sb, SB.S, SB.dx));
  const gb = GB_POSES[name];
  if (gb !== undefined) return scoped(bokFrame('gemsbok', gb, GB.S, GB.dx));
  throw new Error(`not a hoofed cameo frame: ${name}`);
}
