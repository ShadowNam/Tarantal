// v1.12 (D-069, art bible §5.6) interim art for Brakkie, Oupa's Jack Russell: one small sheet
// (layout in src/game/brakkie/brakkieSheet.ts), drawn at `k`× (1 = the Standard pack, 2 = its HD
// twin; every frame is authored at half size and shown ×2). Inked Bosveld Comic in daylight: lit
// from the upper left, ink outlines, form from gradients. A smooth-coated terrier, mostly white
// with a tan head (a white blaze down the muzzle), tan button ears folded forward, a tan saddle
// patch at the base of his tail, a black nose, bright dark eyes, a short tail carried high.
// Poses: trot (2), run (2), sit, the title's wag (sit ↔ wag), lie, sniff, bark, dig, the startled yelp
// (ears back, tail tucked, eyes wide — never hurt), and the guineafowl he carries (limp and whole,
// no blood).
// Coordinates: design px round each frame's origin (his feet), facing right, y down.
import {
  BRAKKIE_SHEET_H,
  BRAKKIE_SHEET_W,
  brakkieFrames,
  sheetRect,
  type BrakkieFrame,
} from '../../src/game/brakkie/brakkieSheet';
import type { Rgba } from '../assets/image';
import { renderSvg } from './raster';
import { el, ellipseD, g, polyD, r2, smoothD, svgDoc } from './svg';

type P = readonly [number, number];

const C = {
  ink: '#1C130F',
  white: '#F7F3EA',
  whiteMid: '#DED6C8',
  whiteShade: '#A99E8E',
  tanLit: '#E2A35C',
  tan: '#B87332',
  tanShade: '#6E4220',
  nose: '#1A1414',
  eye: '#2A1A10',
  tongue: '#E07A80',
  mouth: '#5A2020',
  pad: '#3A2A26',
  // The guineafowl: slate with white spots, a blue face, a red wattle, the horny casque.
  fowl: '#4A4E5C',
  fowlShade: '#2A2C36',
  fowlSpot: '#EDEFF4',
  fowlFace: '#5A8ED0',
  fowlWattle: '#D24C3C',
  casque: '#C89A5A',
} as const;

const INK = 3.2;
let seq = 0;
const uid = (p: string): string => `bk${p}${seq++}`;

interface Grad {
  readonly def: string;
  readonly url: string;
}
function linear(stops: readonly [number, string][], x1 = 0, y1 = 0, x2 = 0, y2 = 1): Grad {
  const id = uid('lg');
  return {
    def: el(
      'linearGradient',
      { id, x1, y1, x2, y2 },
      ...stops.map(([o, c]) => el('stop', { offset: o, 'stop-color': c })),
    ),
    url: `url(#${id})`,
  };
}

/** Lit from the upper left: lit at the top-left, shade at the bottom-right. */
const coat = (lit: string, mid: string, shade: string): Grad =>
  linear(
    [
      [0, lit],
      [0.55, mid],
      [1, shade],
    ],
    0.2,
    0,
    0.6,
    1,
  );

interface Paints {
  readonly white: Grad;
  readonly whiteFar: Grad;
  readonly tan: Grad;
  readonly fowl: Grad;
}

function paints(): Paints {
  return {
    white: coat(C.white, C.whiteMid, C.whiteShade),
    whiteFar: coat(C.whiteMid, C.whiteShade, '#7E7466'),
    tan: coat(C.tanLit, C.tan, C.tanShade),
    fowl: coat('#6A6E7E', C.fowl, C.fowlShade),
  };
}

const inkPath = (d: string, fill: string, w = INK): string =>
  el('path', {
    d,
    fill,
    stroke: C.ink,
    'stroke-width': w,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
  });
const line = (d: string, colour: string, w: number): string =>
  el('path', {
    d,
    fill: 'none',
    stroke: colour,
    'stroke-width': w,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });

/** A tapered limb from a (width wa) to b (width wb), round at both ends. */
function limbD(a: P, b: P, wa: number, wb: number): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const ra = wa / 2;
  const rb = wb / 2;
  const p1: P = [a[0] + nx * ra, a[1] + ny * ra];
  const p2: P = [b[0] + nx * rb, b[1] + ny * rb];
  const p3: P = [b[0] - nx * rb, b[1] - ny * rb];
  const p4: P = [a[0] - nx * ra, a[1] - ny * ra];
  return (
    `M${r2(p1[0])} ${r2(p1[1])}L${r2(p2[0])} ${r2(p2[1])}` +
    `A${r2(rb)} ${r2(rb)} 0 0 0 ${r2(p3[0])} ${r2(p3[1])}` +
    `L${r2(p4[0])} ${r2(p4[1])}A${r2(ra)} ${r2(ra)} 0 0 0 ${r2(p1[0])} ${r2(p1[1])}Z`
  );
}

/** A leg: hip → knee → paw (the paw a small flat oval at the foot). */
interface Leg {
  readonly hip: P;
  readonly knee: P;
  readonly paw: P;
}

function leg(l: Leg, fill: string, front: boolean): string {
  const upper = front ? 20 : 26;
  return (
    inkPath(limbD(l.hip, l.knee, upper, 14), fill) +
    inkPath(limbD(l.knee, l.paw, 14, 12), fill) +
    inkPath(ellipseD(l.paw[0] + 4, l.paw[1] - 3, 10, 6), fill)
  );
}

/** The whole pose of one frame (design px from his feet, facing right). */
interface Pose {
  /** Torso centre, half lengths and tilt (degrees, + = rump up). */
  readonly body: {
    readonly x: number;
    readonly y: number;
    readonly rx: number;
    readonly ry: number;
    readonly rot: number;
  };
  /** The head's skull centre and tilt (degrees, + = nose down). */
  readonly head: { readonly x: number; readonly y: number; readonly rot: number };
  readonly mouth: 'shut' | 'bark' | 'pant' | 'yelp';
  readonly ears: 'up' | 'back';
  /** Legs: near front, far front, near back, far back. */
  readonly legs: readonly [Leg, Leg, Leg, Leg];
  /** The tail from its base: the tip, and a mid point for its curve. */
  readonly tail: { readonly base: P; readonly mid: P; readonly tip: P };
}

function tailArt(p: Paints, t: Pose['tail']): string {
  const d = `M${r2(t.base[0])} ${r2(t.base[1])}Q${r2(t.mid[0])} ${r2(t.mid[1])} ${r2(t.tip[0])} ${r2(t.tip[1])}`;
  return (
    line(d, C.ink, 15) +
    line(d, p.white.url, 9.5) +
    el('circle', { cx: t.tip[0], cy: t.tip[1], r: 4.4, fill: C.tan })
  );
}

function torso(p: Paints, b: Pose['body']): string {
  const id = uid('tc');
  const body = ellipseD(0, 0, b.rx, b.ry);
  // The chest drops a little in front: a second, rounder shape under the shoulders.
  const chest = ellipseD(b.rx * 0.48, b.ry * 0.22, b.rx * 0.5, b.ry * 0.92);
  return g(
    { transform: `translate(${r2(b.x)} ${r2(b.y)}) rotate(${r2(-b.rot)})` },
    el('clipPath', { id }, el('path', { d: body }), el('path', { d: chest })),
    inkPath(body, p.white.url, INK * 2),
    inkPath(chest, p.white.url, INK * 2),
    el('path', { d: body, fill: p.white.url }),
    el('path', { d: chest, fill: p.white.url }),
    // The tan saddle at the base of his tail, and a small patch on his back.
    g(
      { 'clip-path': `url(#${id})` },
      el('path', {
        d: ellipseD(-b.rx * 0.72, -b.ry * 0.5, b.rx * 0.42, b.ry * 0.62),
        fill: p.tan.url,
      }),
      el('path', {
        d: ellipseD(-b.rx * 0.05, -b.ry * 0.95, b.rx * 0.26, b.ry * 0.36),
        fill: p.tan.url,
      }),
      // Belly shade.
      el('path', {
        d: ellipseD(0, b.ry * 0.9, b.rx * 0.9, b.ry * 0.38),
        fill: C.whiteShade,
        opacity: 0.55,
      }),
    ),
  );
}

function headArt(p: Paints, h: Pose['head'], mouth: Pose['mouth'], ears: Pose['ears']): string {
  const skull = ellipseD(0, 0, 25, 22);
  const muzzleOpen = mouth !== 'shut';
  const muzzle = smoothD([
    [10, -14],
    [34, -10],
    [44, -4],
    [44, 6],
    [30, 10],
    [12, 12],
  ]);
  const jaw = muzzleOpen
    ? smoothD([
        [12, 8],
        [32, 12],
        [40, mouth === 'yelp' ? 26 : 22],
        [26, 26],
        [10, 18],
      ])
    : '';
  const earUp: P[] = [
    [-8, -18],
    [4, -30],
    [16, -22],
    [12, -8],
  ];
  const earBack: P[] = [
    [-6, -14],
    [-26, -22],
    [-20, -8],
    [-6, -6],
  ];
  const ear = ears === 'up' ? earUp : earBack;
  const blazeId = uid('bl');
  return g(
    { transform: `translate(${r2(h.x)} ${r2(h.y)}) rotate(${r2(h.rot)})` },
    // Far ear (just its tip behind the skull).
    ears === 'up'
      ? inkPath(
          polyD([
            [-14, -14],
            [-6, -28],
            [4, -20],
          ]),
          C.tanShade,
        )
      : inkPath(
          polyD([
            [-4, -16],
            [-22, -26],
            [-16, -12],
          ]),
          C.tanShade,
        ),
    jaw === '' ? '' : inkPath(jaw, p.tan.url),
    jaw === ''
      ? ''
      : el('path', {
          d: smoothD([
            [16, 12],
            [32, 14],
            [36, mouth === 'yelp' ? 22 : 19],
            [22, 20],
          ]),
          fill: C.mouth,
        }),
    jaw === '' || mouth === 'yelp' ? '' : el('path', { d: ellipseD(28, 20, 7, 4), fill: C.tongue }),
    inkPath(skull, p.tan.url, INK * 1.1),
    inkPath(muzzle, p.tan.url, INK * 1.1),
    // The white blaze: up the muzzle to between the eyes.
    el('clipPath', { id: blazeId }, el('path', { d: muzzle }), el('path', { d: skull })),
    g(
      { 'clip-path': `url(#${blazeId})` },
      el('path', {
        d: smoothD([
          [4, -24],
          [12, -22],
          [30, -6],
          [46, 2],
          [44, 14],
          [16, 14],
          [4, 0],
        ]),
        fill: C.white,
      }),
    ),
    el('path', { d: ellipseD(43, -4, 6, 5), fill: C.nose, stroke: C.ink, 'stroke-width': 1.5 }),
    el('circle', { cx: 41.5, cy: -6, r: 1.6, fill: '#8A8A90' }),
    // Eye: wide when he yelps.
    el('path', {
      d: ellipseD(14, -8, mouth === 'yelp' ? 5.2 : 4.4, mouth === 'yelp' ? 5.6 : 4.4),
      fill: C.eye,
    }),
    el('circle', { cx: 15.6, cy: -9.6, r: 1.5, fill: '#FFFFFF' }),
    // Brow.
    line(`M7 ${mouth === 'yelp' ? -16 : -14}Q14 -17 20 -13`, C.ink, 2),
    // Near ear: a button ear folded forward (laid back when startled).
    inkPath(smoothD(ear), p.tan.url, INK),
    line(ears === 'up' ? 'M2 -24Q10 -22 13 -12' : 'M-10 -16Q-18 -16 -18 -10', C.tanShade, 2),
    // A whisker dot or two.
    el('circle', { cx: 34, cy: 2, r: 1, fill: C.tanShade }),
    el('circle', { cx: 37, cy: 4, r: 1, fill: C.tanShade }),
  );
}

/** The neck joining head and shoulders (drawn under the head). */
function neck(p: Paints, pose: Pose): string {
  const b = pose.body;
  const rad = (-b.rot * Math.PI) / 180;
  const sx = b.x + Math.cos(rad) * b.rx * 0.7;
  const sy = b.y + Math.sin(rad) * b.rx * 0.7 - b.ry * 0.3;
  return inkPath(limbD([sx, sy], [pose.head.x - 6, pose.head.y + 4], 40, 30), p.white.url);
}

function dogArt(p: Paints, pose: Pose): string {
  const [nf, ff, nb, fb] = pose.legs;
  return g(
    {},
    // Far legs first, in the shade.
    leg(fb, p.whiteFar.url, false),
    leg(ff, p.whiteFar.url, true),
    tailArt(p, pose.tail),
    torso(p, pose.body),
    neck(p, pose),
    leg(nb, p.white.url, false),
    leg(nf, p.white.url, true),
    headArt(p, pose.head, pose.mouth, pose.ears),
  );
}

// --- the poses -----------------------------------------------------------------------------------

const L = (hip: P, knee: P, paw: P): Leg => ({ hip, knee, paw });

const STAND_BODY = { x: -4, y: -78, rx: 70, ry: 32, rot: 0 } as const;

function pose(name: BrakkieFrame): Pose {
  switch (name) {
    case 'trot_a':
      return {
        body: STAND_BODY,
        head: { x: 78, y: -114, rot: 0 },
        mouth: 'shut',
        ears: 'up',
        legs: [
          L([44, -66], [58, -34], [70, -4]),
          L([38, -66], [34, -34], [26, -2]),
          L([-50, -66], [-58, -32], [-42, -2]),
          L([-44, -66], [-34, -34], [-60, -4]),
        ],
        tail: { base: [-70, -96], mid: [-80, -122], tip: [-74, -142] },
      };
    case 'trot_b':
      return {
        body: { ...STAND_BODY, y: -80 },
        head: { x: 78, y: -116, rot: -2 },
        mouth: 'shut',
        ears: 'up',
        legs: [
          L([44, -68], [40, -34], [30, -2]),
          L([38, -68], [56, -36], [68, -4]),
          L([-50, -68], [-36, -34], [-58, -4]),
          L([-44, -68], [-56, -34], [-42, -2]),
        ],
        tail: { base: [-70, -98], mid: [-84, -122], tip: [-80, -144] },
      };
    case 'run_a':
      // Stretched out: front legs reaching, back legs pushing.
      return {
        body: { x: -2, y: -78, rx: 74, ry: 28, rot: -4 },
        head: { x: 84, y: -104, rot: 6 },
        mouth: 'pant',
        ears: 'back',
        legs: [
          L([46, -68], [80, -48], [104, -26]),
          L([40, -66], [70, -44], [96, -34]),
          L([-52, -66], [-84, -46], [-110, -30]),
          L([-46, -66], [-76, -40], [-104, -20]),
        ],
        tail: { base: [-72, -86], mid: [-96, -96], tip: [-112, -104] },
      };
    case 'run_b':
      // Gathered: legs under him, back arched.
      return {
        body: { x: 0, y: -72, rx: 66, ry: 31, rot: 6 },
        head: { x: 80, y: -94, rot: 10 },
        mouth: 'pant',
        ears: 'back',
        legs: [
          L([42, -58], [26, -32], [2, -6]),
          L([36, -58], [18, -30], [-6, -10]),
          L([-46, -62], [-20, -36], [6, -4]),
          L([-40, -62], [-14, -32], [14, -8]),
        ],
        tail: { base: [-64, -86], mid: [-86, -104], tip: [-98, -120] },
      };
    case 'sit':
    case 'wag_a': {
      const tip: P = name === 'sit' ? [-62, -18] : [-74, -52];
      const mid: P = name === 'sit' ? [-64, -4] : [-74, -28];
      return {
        body: { x: -6, y: -62, rx: 50, ry: 30, rot: 52 },
        head: { x: 24, y: -132, rot: -4 },
        mouth: name === 'sit' ? 'shut' : 'pant',
        ears: 'up',
        legs: [
          L([18, -84], [22, -44], [26, -4]),
          L([10, -84], [12, -44], [14, -2]),
          L([-30, -40], [-6, -26], [-4, -2]),
          L([-24, -40], [-2, -24], [6, -4]),
        ],
        tail: { base: [-46, -20], mid, tip },
      };
    }
    case 'lie':
      // Lying in the shade: front legs out, chin up.
      return {
        body: { x: -12, y: -28, rx: 72, ry: 24, rot: 0 },
        head: { x: 66, y: -48, rot: 4 },
        mouth: 'shut',
        ears: 'up',
        legs: [
          L([40, -18], [66, -10], [92, -4]),
          L([34, -20], [58, -12], [84, -8]),
          L([-56, -18], [-34, -8], [-10, -4]),
          L([-50, -20], [-30, -12], [-6, -8]),
        ],
        tail: { base: [-80, -30], mid: [-100, -20], tip: [-108, -8] },
      };
    case 'sniff':
      return {
        body: { x: -6, y: -74, rx: 70, ry: 31, rot: -6 },
        head: { x: 72, y: -52, rot: 34 },
        mouth: 'shut',
        ears: 'up',
        legs: [
          L([42, -64], [50, -32], [56, -2]),
          L([36, -64], [38, -32], [36, -2]),
          L([-50, -68], [-58, -34], [-44, -2]),
          L([-44, -68], [-36, -34], [-58, -4]),
        ],
        tail: { base: [-70, -94], mid: [-76, -120], tip: [-66, -134] },
      };
    case 'bark':
      return {
        body: { x: -4, y: -80, rx: 70, ry: 32, rot: 6 },
        head: { x: 78, y: -130, rot: -16 },
        mouth: 'bark',
        ears: 'up',
        legs: [
          L([44, -72], [54, -38], [60, -2]),
          L([38, -72], [40, -38], [40, -2]),
          L([-50, -64], [-58, -32], [-46, -2]),
          L([-44, -64], [-38, -32], [-62, -4]),
        ],
        tail: { base: [-70, -98], mid: [-78, -128], tip: [-70, -152] },
      };
    case 'dig':
      // Front paws scrabbling in the grass, rump and tail up.
      return {
        body: { x: -6, y: -70, rx: 68, ry: 30, rot: -22 },
        head: { x: 64, y: -40, rot: 40 },
        mouth: 'shut',
        ears: 'up',
        legs: [
          L([36, -46], [60, -26], [78, -6]),
          L([30, -44], [44, -18], [54, -2]),
          L([-56, -84], [-62, -46], [-50, -2]),
          L([-50, -84], [-44, -44], [-66, -4]),
        ],
        tail: { base: [-72, -106], mid: [-80, -126], tip: [-72, -140] },
      };
    case 'yelp':
      // Startled: crouched back, ears flat, tail tucked, mouth open, eyes wide.
      return {
        body: { x: -12, y: -64, rx: 64, ry: 32, rot: -8 },
        head: { x: 64, y: -112, rot: -24 },
        mouth: 'yelp',
        ears: 'back',
        legs: [
          L([34, -56], [48, -30], [58, -2]),
          L([28, -56], [36, -28], [44, -2]),
          L([-52, -52], [-70, -28], [-48, -2]),
          L([-46, -52], [-60, -26], [-64, -4]),
        ],
        tail: { base: [-70, -60], mid: [-78, -40], tip: [-62, -26] },
      };
    case 'bird':
      throw new Error('the bird is not a dog pose');
  }
}

/** The guineafowl he carries, hanging limp from the origin (his mouth): whole, no blood. */
function bird(p: Paints): string {
  const spots: string[] = [];
  // The white pearl spots in staggered rows over the slate body.
  for (let row = 0; row < 4; row++)
    for (let i = 0; i < 6; i++) {
      const x = 16 + i * 10 + (row % 2) * 5;
      const y = 12 + row * 8;
      spots.push(el('circle', { cx: x, cy: y, r: 1.9, fill: C.fowlSpot }));
    }
  const body = smoothD([
    [8, 6],
    [36, 6],
    [64, 16],
    [72, 32],
    [56, 42],
    [24, 40],
    [10, 26],
  ]);
  const id = uid('fw');
  return g(
    {},
    // Legs dangling.
    line('M60 38L66 52M52 40L54 54', C.ink, 3),
    inkPath(body, p.fowl.url),
    el('clipPath', { id }, el('path', { d: body })),
    g({ 'clip-path': `url(#${id})` }, ...spots),
    // The neck in his mouth, the head hanging: blue face, red wattle, the casque.
    inkPath(limbD([12, 10], [2, 22], 9, 7), C.fowlFace, 2),
    inkPath(ellipseD(0, 26, 7, 6), C.fowlFace, 2),
    el('path', { d: ellipseD(2, 33, 3, 4), fill: C.fowlWattle }),
    el('path', {
      d: polyD([
        [-3, 21],
        [0, 13],
        [4, 21],
      ]),
      fill: C.casque,
      stroke: C.ink,
      'stroke-width': 1.2,
    }),
  );
}

export function frameArtForFit(name: BrakkieFrame): string {
  return frameArt(paints(), name);
}

function frameArt(p: Paints, name: BrakkieFrame): string {
  if (name === 'bird') return bird(p);
  // The stretched gallop is drawn with its lowest paw on the ground (lesson 18: nothing floats).
  const dy = name === 'run_a' ? 12 : 0;
  return dy === 0
    ? dogArt(p, pose(name))
    : g({ transform: `translate(0 ${dy})` }, dogArt(p, pose(name)));
}

/** The whole sheet as SVG (sheet px viewBox, rendered at `k`×). */
export function brakkieSheetSvg(k = 1): string {
  seq = 0;
  const p = paints();
  const parts: string[] = [];
  for (const f of brakkieFrames()) {
    const id = uid('cell');
    const c = sheetRect(f);
    parts.push(
      g(
        {},
        el('clipPath', { id }, el('rect', { x: c.x, y: c.y, width: c.w, height: c.h })),
        g(
          { 'clip-path': `url(#${id})` },
          g(
            {
              transform: `translate(${r2(f.x + f.ox * f.res)} ${r2(f.y + f.oy * f.res)}) scale(${f.res})`,
            },
            frameArt(p, f.name),
          ),
        ),
      ),
    );
  }
  const defs = [p.white, p.whiteFar, p.tan, p.fowl].map((x) => x.def).join('');
  return svgDoc(
    BRAKKIE_SHEET_W * k,
    BRAKKIE_SHEET_H * k,
    [0, 0, BRAKKIE_SHEET_W, BRAKKIE_SHEET_H],
    defs,
    parts.join(''),
  );
}

export function renderBrakkieSheet(k = 1): Rgba {
  return renderSvg(brakkieSheetSvg(k));
}

/** One frame alone at `k`× its drawn size (previews, the art tests). */
export function brakkieFrameSvg(name: BrakkieFrame, k = 1): string {
  seq = 0;
  const p = paints();
  const f = brakkieFrames().find((x) => x.name === name);
  if (f === undefined) throw new Error(`no frame ${name}`);
  const defs = [p.white, p.whiteFar, p.tan, p.fowl].map((x) => x.def).join('');
  return svgDoc(
    f.w * k,
    f.h * k,
    [0, 0, f.w, f.h],
    defs,
    g({ transform: `translate(${r2(f.ox)} ${r2(f.oy)})` }, frameArt(p, name)),
  );
}
