// The interim tarentaal (D-029, art bible §3.1): one drawing, posed per frame, with variants as
// palettes and attachments. Pure: pose + look + palette → SVG markup in bird units (the 620 × 400
// bird box, facing right, sim position at (0, 0); docs/06 §3).
import type { ArtConfig, BirdPalette, BirdPart } from './config';
import { ellipseD, el, g, inked, place, polyD, prng, r2, smoothD } from './svg';

export type Pt = readonly [number, number];

/** Body and head sizes from content/birds.json hitboxes (so the art lines up with them). */
export interface BirdShape {
  readonly body: { readonly rx: number; readonly ry: number; readonly oy: number };
  readonly head: { readonly x: number; readonly y: number; readonly r: number };
}

/** How a plane draws: ink weight and dot field in bird units (bible §1 rule 4). */
export interface Look {
  readonly line: number;
  readonly inner: number;
  readonly dotR: number;
  readonly dotSpacing: number;
}

export type Eyes =
  | 'calm'
  | 'wide'
  | 'swirl'
  | 'closed'
  | 'half'
  | 'front'
  | 'frontBlink'
  | 'frontLeft'
  | 'frontRight';

export type Wing =
  | { readonly kind: 'folded'; readonly lift: number }
  /** Flight wing: angle from straight up (deg, negative = swept back) and foreshortening. */
  | { readonly kind: 'flight'; readonly angle: number; readonly len: number };

export interface Leg {
  /** Hip x in body units (hips sit on the belly), foot in bird-box units. */
  readonly hip: number;
  readonly foot: Pt;
}
export type Legs =
  | { readonly kind: 'stand'; readonly legs: readonly [Leg, Leg] }
  | { readonly kind: 'blur'; readonly phase: number }
  | { readonly kind: 'tucked' }
  | { readonly kind: 'dangle' };

export interface Fx {
  /** Feather burst: count and radius (bird units). */
  readonly feathers?: { readonly n: number; readonly r: number; readonly drop: number };
  /** Puff cloud size (0–1) and opacity: the whole cloud, or only its back half (behind the bird). */
  readonly puff?: { readonly size: number; readonly alpha: number };
  readonly backPuff?: { readonly size: number; readonly alpha: number };
  readonly stars?: { readonly n: number; readonly spin: number; readonly alpha: number };
  /** One loose feather drifting off (clumsy flap). */
  readonly shed?: number;
}

export interface Pose {
  readonly x: number;
  readonly y: number;
  /** Body tilt in degrees around the body centre (positive = nose down). */
  readonly rot: number;
  readonly sx: number;
  readonly sy: number;
  /** Squash pivot y (body units): the belly on the ground, the centre in the air. */
  readonly pivotY: number;
  readonly head: { readonly dx: number; readonly dy: number; readonly rot: number };
  readonly neckBend: number;
  readonly eyes: Eyes;
  readonly wing: Wing;
  readonly legs: Legs;
  readonly tail: number;
  readonly beak: number;
  /** Whole-bird spin and scale (tumble) around the body centre. */
  readonly spin: number;
  readonly scale: number;
  /** 0 hides the bird (inside the poof cloud). */
  readonly alpha: number;
  readonly fx: Fx;
}

export const REST: Pose = {
  x: 0,
  y: 0,
  rot: 0,
  sx: 1,
  sy: 1,
  pivotY: 0,
  head: { dx: 0, dy: 0, rot: 0 },
  neckBend: 8,
  eyes: 'calm',
  wing: { kind: 'folded', lift: 0 },
  legs: {
    kind: 'stand',
    legs: [
      { hip: -24, foot: [-26, 150] },
      { hip: 22, foot: [26, 150] },
    ],
  },
  tail: 0,
  beak: 0,
  spin: 0,
  scale: 1,
  alpha: 1,
  fx: {},
};

/** A 2D affine transform as [a, b, c, d, e, f] (SVG matrix order). */
type M = readonly [number, number, number, number, number, number];
const mul = (p: M, q: M): M => [
  p[0] * q[0] + p[2] * q[1],
  p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3],
  p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4],
  p[1] * q[4] + p[3] * q[5] + p[5],
];
const T = (x: number, y: number): M => [1, 0, 0, 1, x, y];
const S = (sx: number, sy: number): M => [sx, 0, 0, sy, 0, 0];
const R = (deg: number): M => {
  const a = (deg * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
};
const about = (x: number, y: number, m: M): M => mul(T(x, y), mul(m, T(-x, -y)));
const apply = (m: M, [x, y]: Pt): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const matrix = (m: M): string => `matrix(${m.map(r2).join(' ')})`;

export interface DrawInput {
  readonly pose: Pose;
  readonly look: Look;
  readonly pal: BirdPalette;
  readonly parts: readonly BirdPart[];
  /** Variant dot size multiplier (kuifkop: finer dots). */
  readonly dotScale: number;
  readonly shape: BirdShape;
  readonly cfg: ArtConfig;
  /** Varies sparkle and dot jitter per creature/frame (deterministic). */
  readonly seed: number;
  /** Unique id prefix for clip paths inside one SVG. */
  readonly id: string;
}

/** The whole bird for one frame, as SVG markup in bird units. */
export function drawBird(i: DrawInput): string {
  const { pose: p, shape } = i;
  const cy = shape.body.oy;
  const bodyM = mul(T(p.x, p.y), about(0, cy, mul(R(p.rot), about(0, p.pivotY, S(p.sx, p.sy)))));
  const out: string[] = [];
  const bodyT = matrix(bodyM);
  const flight = p.wing.kind === 'flight' ? p.wing : null;
  // Far wing (behind everything).
  if (flight !== null)
    out.push(g({ transform: bodyT }, flightWing(i, flight.angle + 12, flight.len * 0.88, true)));
  out.push(legs(i, bodyM));
  out.push(g({ transform: bodyT }, tail(i), body(i), foldedWing(i), bandolier(i)));
  const head = headPose(i);
  out.push(neck(i, bodyM, head));
  out.push(drawHead(i, head));
  if (flight !== null)
    out.push(g({ transform: bodyT }, flightWing(i, flight.angle, flight.len, false)));
  let bird = g(p.alpha < 1 ? { opacity: p.alpha } : {}, ...out);
  if (p.alpha <= 0) bird = '';
  const whole = about(0, cy, mul(R(p.spin), S(p.scale, p.scale)));
  const fxBack = puff(i, true);
  const fxFront = [puff(i, false), feathers(i), shed(i), stars(i), sparkle(i)].join('');
  return g({ transform: matrix(whole) }, fxBack, bird, fxFront);
}

// --- body ------------------------------------------------------------------------------------

function bodyOutline(s: BirdShape): Pt[] {
  const { rx, ry, oy } = s.body;
  const pts: Pt[] = [];
  const n = 18;
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    let x = Math.cos(t) * rx;
    let y = Math.sin(t) * ry;
    // Bowling ball with a hunched back: the upper back rises, the breast stays round.
    if (y < 0 && x < rx * 0.3) y *= 1 + 0.08 * Math.max(0, 1 - Math.abs(x + rx * 0.2) / rx);
    // A slightly flatter belly.
    if (y > ry * 0.7) y = ry * 0.7 + (y - ry * 0.7) * 0.75;
    x *= 1.02;
    pts.push([x, oy + y]);
  }
  return pts;
}

function dotField(
  i: DrawInput,
  clipId: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  scale = 1,
): string {
  const spacing = i.look.dotSpacing * scale * i.dotScale;
  const r = i.look.dotR * scale * i.dotScale;
  const rnd = prng(i.seed ^ Math.round(x0 * 7 + y0 * 13));
  const dots: string[] = [];
  const rowH = spacing * 0.866;
  let row = 0;
  for (let y = y0; y <= y1; y += rowH, row++) {
    for (let x = x0 + (row % 2) * spacing * 0.5; x <= x1; x += spacing) {
      const jx = (rnd() - 0.5) * spacing * 0.25;
      const jy = (rnd() - 0.5) * spacing * 0.25;
      const rr = r * (0.85 + rnd() * 0.3);
      dots.push(
        `M${r2(x + jx - rr)} ${r2(y + jy)}a${r2(rr)} ${r2(rr)} 0 1 0 ${r2(rr * 2)} 0a${r2(rr)} ${r2(rr)} 0 1 0 ${r2(-rr * 2)} 0Z`,
      );
    }
  }
  return el('path', { d: dots.join(''), fill: i.pal.dots, 'clip-path': `url(#${clipId})` });
}

function body(i: DrawInput): string {
  const s = i.shape;
  const d = smoothD(bodyOutline(s));
  const cid = `${i.id}-body`;
  const { rx, ry, oy } = s.body;
  return [
    el('clipPath', { id: cid }, el('path', { d })),
    inked(d, i.pal.plumage, i.cfg.ink, 0),
    // One shadow (belly crescent) and one highlight (upper back), clipped to the body.
    el('path', {
      d: ellipseD(rx * 0.12, oy + ry * 0.78, rx * 1.15, ry * 0.55),
      fill: i.pal.shadow,
      'clip-path': `url(#${cid})`,
    }),
    el('path', {
      d: ellipseD(-rx * 0.2, oy - ry * 0.55, rx * 0.55, ry * 0.26),
      fill: i.pal.highlight,
      'clip-path': `url(#${cid})`,
    }),
    dotField(i, cid, -rx * 1.1, oy - ry * 1.2, rx * 1.1, oy + ry * 1.1),
    el('path', {
      d,
      fill: 'none',
      stroke: i.cfg.ink,
      'stroke-width': i.look.line,
      'stroke-linejoin': 'round',
    }),
  ].join('');
}

function tail(i: DrawInput): string {
  const { rx, oy } = i.shape.body;
  const base: Pt = [-rx * 0.82, oy - 4];
  const pts = place(
    [
      [4, -22],
      [-30, -18],
      [-50, 8],
      [-52, 44],
      [-30, 62],
      [0, 40],
    ],
    base[0],
    base[1],
    i.pose.tail,
  );
  const d = smoothD(pts);
  const cid = `${i.id}-tail`;
  return [
    el('clipPath', { id: cid }, el('path', { d })),
    inked(d, i.pal.shadow, i.cfg.ink, 0),
    dotField(i, cid, base[0] - 80, base[1] - 40, base[0] + 10, base[1] + 70, 0.85),
    el('path', {
      d,
      fill: 'none',
      stroke: i.cfg.ink,
      'stroke-width': i.look.line,
      'stroke-linejoin': 'round',
    }),
  ].join('');
}

function foldedWing(i: DrawInput): string {
  if (i.pose.wing.kind !== 'folded') return '';
  const { rx, ry, oy } = i.shape.body;
  const lift = i.pose.wing.lift;
  const pivot: Pt = [rx * 0.38, oy - ry * 0.32];
  const pts = place(
    [
      [0, -10],
      [-40, -22],
      [-100, -14],
      [-148, 14],
      [-170, 36],
      [-120, 44],
      [-60, 40],
      [-10, 22],
    ],
    pivot[0],
    pivot[1],
    -lift * 28,
    rx / 110,
    ry / 85,
  );
  const d = smoothD(pts);
  const cid = `${i.id}-fwing`;
  // Feather edges: a few inner lines toward the tip.
  const lines = [0.45, 0.62, 0.78].map((t) => {
    const a = place(
      [
        [-170 * t, 36 * t + 6],
        [-170 * t + 26, 14],
      ],
      pivot[0],
      pivot[1],
      -lift * 28,
      rx / 110,
      ry / 85,
    );
    return `M${r2(a[0]?.[0] ?? 0)} ${r2(a[0]?.[1] ?? 0)}L${r2(a[1]?.[0] ?? 0)} ${r2(a[1]?.[1] ?? 0)}`;
  });
  return [
    el('clipPath', { id: cid }, el('path', { d })),
    inked(d, i.pal.plumage, i.cfg.ink, 0),
    el('path', {
      d: ellipseD(pivot[0] - 90 * (rx / 110), pivot[1] + 40, 110, 22),
      fill: i.pal.shadow,
      'clip-path': `url(#${cid})`,
    }),
    dotField(i, cid, pivot[0] - 190, pivot[1] - 50, pivot[0] + 20, pivot[1] + 70, 0.9),
    el('path', {
      d: lines.join(''),
      fill: 'none',
      stroke: i.cfg.ink,
      'stroke-width': i.look.inner,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d,
      fill: 'none',
      stroke: i.cfg.ink,
      'stroke-width': i.look.line,
      'stroke-linejoin': 'round',
    }),
  ].join('');
}

/** A broad, rounded guineafowl wing with fingered primaries, pointing "up" before rotation. */
const WING: Pt[] = [
  [-14, 6],
  [14, -8],
  [24, -60],
  [22, -118],
  [14, -160],
  [2, -176],
  [-12, -168],
  [-22, -180],
  [-38, -166],
  [-50, -174],
  [-62, -152],
  [-74, -156],
  [-82, -128],
  [-90, -122],
  [-88, -86],
  [-70, -40],
  [-44, -6],
];

function flightWing(i: DrawInput, angle: number, len: number, far: boolean): string {
  const { rx, ry, oy } = i.shape.body;
  const shoulder: Pt = [rx * 0.22, oy - ry * 0.45];
  const k = rx / 110;
  const pts = place(WING, shoulder[0], shoulder[1], angle, k * (far ? 0.95 : 1), len * k);
  const d = smoothD(pts);
  const cid = `${i.id}-wing${far ? 'f' : 'n'}`;
  const fill = far ? i.pal.shadow : i.pal.plumage;
  // Primary feather separations: from the finger notches toward the wing's middle.
  const notches = [6, 8, 10, 12].map((n) => {
    const tip = WING[n] ?? [0, 0];
    const a = place(
      [tip, [tip[0] * 0.75, tip[1] * 0.55]],
      shoulder[0],
      shoulder[1],
      angle,
      k,
      len * k,
    );
    return `M${r2(a[0]?.[0] ?? 0)} ${r2(a[0]?.[1] ?? 0)}L${r2(a[1]?.[0] ?? 0)} ${r2(a[1]?.[1] ?? 0)}`;
  });
  // Coverts: a shadow band near the leading edge.
  const covert = smoothD(
    place(
      [
        [-10, 4],
        [16, -10],
        [20, -60],
        [-20, -70],
        [-60, -36],
        [-40, -4],
      ],
      shoulder[0],
      shoulder[1],
      angle,
      k,
      len * k,
    ),
  );
  return [
    el('clipPath', { id: cid }, el('path', { d })),
    inked(d, fill, i.cfg.ink, 0),
    far ? '' : el('path', { d: covert, fill: i.pal.highlight, 'clip-path': `url(#${cid})` }),
    dotField(
      i,
      cid,
      shoulder[0] - 230,
      shoulder[1] - 230,
      shoulder[0] + 230,
      shoulder[1] + 230,
      far ? 1 : 0.9,
    ),
    el('path', {
      d: notches.join(''),
      fill: 'none',
      stroke: i.cfg.ink,
      'stroke-width': i.look.inner,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d,
      fill: 'none',
      stroke: i.cfg.ink,
      'stroke-width': i.look.line,
      'stroke-linejoin': 'round',
    }),
  ].join('');
}

function bandolier(i: DrawInput): string {
  if (!i.parts.includes('bandolier')) return '';
  const P = i.cfg.birds.parts;
  const { rx, ry, oy } = i.shape.body;
  const a: Pt = [rx * 0.62, oy - ry * 0.78];
  const b: Pt = [-rx * 0.55, oy + ry * 0.85];
  const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const w = 26;
  const strap = polyD(
    place(
      [
        [0, -w / 2],
        [len, -w / 2],
        [len, w / 2],
        [0, w / 2],
      ],
      a[0],
      a[1],
      ang,
    ),
  );
  const cobs: string[] = [];
  for (let k = 0; k < 5; k++) {
    const t = 0.16 + k * 0.17;
    const c: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const cob = smoothD(
      place(
        [
          [-8, -20],
          [8, -20],
          [11, 0],
          [7, 18],
          [0, 22],
          [-7, 18],
          [-11, 0],
        ],
        c[0],
        c[1],
        ang + 90 - 12,
      ),
    );
    const husk = smoothD(
      place(
        [
          [-9, 16],
          [0, 34],
          [9, 16],
          [0, 22],
        ],
        c[0],
        c[1],
        ang + 90 - 12,
      ),
    );
    const rows = place(
      [
        [-6, -10],
        [6, -10],
        [-7, 0],
        [7, 0],
        [-6, 10],
        [6, 10],
      ],
      c[0],
      c[1],
      ang + 90 - 12,
    ).reduce<string[]>((acc, pt, n, all) => {
      if (n % 2 === 0)
        acc.push(
          `M${r2(pt[0])} ${r2(pt[1])}L${r2(all[n + 1]?.[0] ?? 0)} ${r2(all[n + 1]?.[1] ?? 0)}`,
        );
      return acc;
    }, []);
    cobs.push(
      inked(husk, P.husk, i.cfg.ink, i.look.inner),
      inked(cob, P.cob, i.cfg.ink, i.look.inner),
      el('path', {
        d: rows.join(''),
        stroke: P.cobShadow,
        'stroke-width': i.look.inner,
        fill: 'none',
        'stroke-linecap': 'round',
      }),
    );
  }
  return [inked(strap, P.bandolier, i.cfg.ink, i.look.line * 0.8), ...cobs].join('');
}

// --- legs ------------------------------------------------------------------------------------

function legStroke(i: DrawInput, d: string, opacity = 1, toes = ''): string {
  const w = 15;
  const t = 6;
  const line = (path: string, colour: string, width: number): string =>
    el('path', {
      d: path,
      fill: 'none',
      stroke: colour,
      'stroke-width': width,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
  return g(
    opacity < 1 ? { opacity } : {},
    line(d, i.cfg.ink, w + i.look.line * 1.6),
    toes === '' ? '' : line(toes, i.cfg.ink, t + i.look.line * 1.4),
    line(d, i.pal.legs, w),
    toes === '' ? '' : line(toes, i.pal.legs, t),
  );
}

function foot(f: Pt, dir = 1): string {
  const [x, y] = f;
  return `M${r2(x)} ${r2(y)}L${r2(x + 20 * dir)} ${r2(y + 2)}M${r2(x)} ${r2(y)}L${r2(x + 14 * dir)} ${r2(y - 8)}M${r2(x)} ${r2(y)}L${r2(x - 10 * dir)} ${r2(y + 1)}`;
}

function legs(i: DrawInput, bodyM: M): string {
  const l = i.pose.legs;
  const { ry, oy } = i.shape.body;
  const hipY = oy + ry * 0.86;
  if (l.kind === 'stand') {
    return l.legs
      .map((leg) => {
        const hip = apply(bodyM, [leg.hip, hipY]);
        return legStroke(
          i,
          `M${r2(hip[0])} ${r2(hip[1])}L${r2(leg.foot[0])} ${r2(leg.foot[1])}` + foot(leg.foot),
        );
      })
      .join('');
  }
  if (l.kind === 'tucked' || l.kind === 'dangle') {
    return [-16, 14]
      .map((hx, n) => {
        const hip = apply(bodyM, [hx, hipY - 6]);
        const f: Pt =
          l.kind === 'tucked'
            ? apply(bodyM, [hx - 92, hipY - 4 + n * 8])
            : apply(bodyM, [hx - 22, hipY + 58]);
        return legStroke(
          i,
          `M${r2(hip[0])} ${r2(hip[1])}L${r2(f[0])} ${r2(f[1])}` +
            foot(f, l.kind === 'tucked' ? -0.6 : 0.8),
        );
      })
      .join('');
  }
  // Running: legs blur into a wheel of ghost legs plus speed arcs (bible §3.4 "legs blur").
  const out: string[] = [];
  const hip = apply(bodyM, [0, hipY]);
  for (let k = 0; k < 5; k++) {
    const a = l.phase * 360 + k * 72;
    const rad = (a * Math.PI) / 180;
    const f: Pt = [hip[0] + Math.sin(rad) * 40, Math.min(150, hip[1] + 52 + Math.cos(rad) * 12)];
    out.push(
      legStroke(
        i,
        `M${r2(hip[0])} ${r2(hip[1])}L${r2(f[0])} ${r2(f[1])}` + foot(f),
        k < 2 ? 1 : 0.35,
      ),
    );
  }
  const ay = Math.min(hip[1] + 58, 136);
  const arc = `M${r2(hip[0] - 54)} ${r2(ay)}Q${r2(hip[0])} ${r2(ay + 24)} ${r2(hip[0] + 54)} ${r2(ay)}`;
  out.push(
    el('path', {
      d: arc,
      fill: 'none',
      stroke: i.cfg.ink,
      'stroke-width': i.look.inner,
      'stroke-linecap': 'round',
      opacity: 0.6,
    }),
  );
  return out.join('');
}

// --- neck and head ---------------------------------------------------------------------------

interface HeadAt {
  readonly x: number;
  readonly y: number;
  readonly rot: number;
  readonly r: number;
}

function headPose(i: DrawInput): HeadAt {
  const p = i.pose;
  const h = i.shape.head;
  // The head follows the body's translation, not its squash: it stays near its hitbox.
  return { x: h.x + p.x + p.head.dx, y: h.y + p.y + p.head.dy, rot: p.head.rot, r: h.r * 0.9 };
}

function neck(i: DrawInput, bodyM: M, h: HeadAt): string {
  const { rx, ry, oy } = i.shape.body;
  const base = apply(bodyM, [rx * 0.55, oy - ry * 0.55]);
  const top: Pt = apply(about(h.x, h.y, R(h.rot)), [h.x - h.r * 0.35, h.y + h.r * 0.55]);
  const mid: Pt = [(base[0] + top[0]) / 2, (base[1] + top[1]) / 2];
  const dx = top[0] - base[0];
  const dy = top[1] - base[1];
  const n = Math.hypot(dx, dy) || 1;
  const c: Pt = [mid[0] + (dy / n) * i.pose.neckBend, mid[1] - (dx / n) * i.pose.neckBend];
  const q = (t: number): Pt => [
    (1 - t) ** 2 * base[0] + 2 * (1 - t) * t * c[0] + t * t * top[0],
    (1 - t) ** 2 * base[1] + 2 * (1 - t) * t * c[1] + t * t * top[1],
  ];
  // Upper neck is bare blue skin, lower neck feathered: split the curve at t = 0.5.
  const s = q(0.5);
  const c2: Pt = [(c[0] + top[0]) / 2, (c[1] + top[1]) / 2];
  const full = `M${r2(base[0])} ${r2(base[1])}Q${r2(c[0])} ${r2(c[1])} ${r2(top[0])} ${r2(top[1])}`;
  const upper = `M${r2(s[0])} ${r2(s[1])}Q${r2(c2[0])} ${r2(c2[1])} ${r2(top[0])} ${r2(top[1])}`;
  const w = h.r * 0.95;
  const stroke = (d: string, colour: string, width: number): string =>
    el('path', {
      d,
      fill: 'none',
      stroke: colour,
      'stroke-width': width,
      'stroke-linecap': 'round',
    });
  return [
    stroke(full, i.cfg.ink, w + i.look.line * 2),
    stroke(full, i.pal.plumage, w),
    stroke(upper, i.pal.face, w * 0.8),
  ].join('');
}

function eye(i: DrawInput, cx: number, cy: number, r: number, mode: Eyes, look: Pt): string {
  const ink = i.cfg.ink;
  const white = i.cfg.birds.eyeWhite;
  const out: string[] = [];
  const big = mode === 'wide' ? 1.15 : 1;
  const ex = r * 0.42 * big;
  const ey = r * 0.5 * big;
  if (mode === 'closed' || mode === 'frontBlink') {
    out.push(
      el('path', {
        d: `M${r2(cx - ex)} ${r2(cy)}Q${r2(cx)} ${r2(cy + ey * 0.7)} ${r2(cx + ex)} ${r2(cy)}`,
        fill: 'none',
        stroke: ink,
        'stroke-width': i.look.line * 0.9,
        'stroke-linecap': 'round',
      }),
    );
    return out.join('');
  }
  out.push(inked(ellipseD(cx, cy, ex, ey), white, ink, i.look.line * 0.8));
  if (i.parts.includes('eyeRing'))
    out.push(
      el('path', {
        d: ellipseD(cx, cy, ex + i.look.line * 0.6, ey + i.look.line * 0.6),
        fill: 'none',
        stroke: i.cfg.birds.parts.eyeRing,
        'stroke-width': i.look.line * 0.9,
      }),
    );
  if (mode === 'swirl') {
    let d = `M${r2(cx)} ${r2(cy)}`;
    for (let k = 1; k <= 22; k++) {
      const a = k * 0.62;
      const rr = (k / 22) * ex * 0.85;
      d += `L${r2(cx + Math.cos(a) * rr)} ${r2(cy + Math.sin(a) * rr * (ey / ex))}`;
    }
    out.push(
      el('path', {
        d,
        fill: 'none',
        stroke: ink,
        'stroke-width': i.look.inner,
        'stroke-linecap': 'round',
      }),
    );
    return out.join('');
  }
  const pr = mode === 'wide' ? r * 0.085 : r * 0.12;
  out.push(
    el('path', {
      d: ellipseD(cx + look[0] * ex * 0.45, cy + look[1] * ey * 0.4, pr, pr),
      fill: ink,
    }),
  );
  out.push(
    el('path', {
      d: ellipseD(
        cx + look[0] * ex * 0.45 + pr * 0.4,
        cy + look[1] * ey * 0.4 - pr * 0.4,
        pr * 0.35,
        pr * 0.35,
      ),
      fill: white,
    }),
  );
  if (mode === 'calm' || mode === 'half') {
    // Dignified heavy lid (calm) or half-closed blink.
    const lid = mode === 'half' ? 0.15 : -0.45;
    const ly = cy + ey * lid;
    out.push(
      inked(
        `M${r2(cx - ex - 1)} ${r2(ly)}A${r2(ex)} ${r2(ey)} 0 0 1 ${r2(cx + ex + 1)} ${r2(ly)}Z`,
        i.pal.face,
        ink,
        i.look.inner,
      ),
    );
  }
  return out.join('');
}

function casque(i: DrawInput, r: number, front: boolean): string {
  const ink = i.cfg.ink;
  if (i.parts.includes('crest')) return crest(i, r);
  const chipped = i.parts.includes('chippedCasque');
  const pts: Pt[] = front
    ? [
        [-0.32 * r, -0.6 * r],
        [-0.3 * r, -1.3 * r],
        [-0.12 * r, -1.95 * r],
        [0.12 * r, -1.9 * r],
        [0.3 * r, -1.25 * r],
        [0.32 * r, -0.6 * r],
      ]
    : [
        [-0.55 * r, -0.5 * r],
        [-0.72 * r, -1.0 * r],
        [-1.02 * r, -1.42 * r],
        ...(chipped
          ? ([
              [-1.3 * r, -1.58 * r],
              [-1.12 * r, -1.68 * r],
              [-1.2 * r, -1.82 * r],
            ] as Pt[])
          : ([
              [-1.38 * r, -1.66 * r],
              [-1.3 * r, -1.84 * r],
            ] as Pt[])),
        [-0.92 * r, -1.72 * r],
        [-0.4 * r, -1.4 * r],
        [-0.02 * r, -1.0 * r],
        [0.3 * r, -0.66 * r],
      ];
  const d = smoothD(pts, true, chipped ? 0.6 : 1);
  const hi = front
    ? smoothD([
        [0.02 * r, -0.7 * r],
        [0.06 * r, -1.4 * r],
        [0.16 * r, -1.35 * r],
        [0.2 * r, -0.7 * r],
      ])
    : smoothD([
        [-0.08 * r, -0.75 * r],
        [-0.34 * r, -1.4 * r],
        [-0.24 * r, -1.45 * r],
        [0.12 * r, -0.85 * r],
      ]);
  return [
    inked(d, i.pal.casque, ink, i.look.line),
    el('path', { d: hi, fill: i.pal.casqueHi }),
  ].join('');
}

function crest(i: DrawInput, r: number): string {
  const P = i.cfg.birds.parts;
  const curls: Pt[] = [
    [-0.55, -0.85],
    [-0.2, -1.1],
    [0.18, -1.05],
    [0.5, -0.8],
    [-0.4, -1.45],
    [0.02, -1.55],
    [0.38, -1.35],
  ];
  const blobs = curls.map(([x, y]) => ellipseD(x * r, y * r, r * 0.34, r * 0.32)).join('');
  const spirals = curls
    .map(([x, y]) => {
      let d = '';
      for (let k = 0; k <= 10; k++) {
        const a = k * 0.75;
        const rr = (k / 10) * r * 0.2;
        d += `${k === 0 ? 'M' : 'L'}${r2(x * r + Math.cos(a) * rr)} ${r2(y * r + Math.sin(a) * rr)}`;
      }
      return d;
    })
    .join('');
  const crown = i.parts.includes('crown') ? bottleCap(i, r) : '';
  return [
    el('path', { d: blobs, fill: 'none', stroke: i.cfg.ink, 'stroke-width': i.look.line * 2 }),
    el('path', { d: blobs, fill: P.crest }),
    el('path', {
      d: spirals,
      fill: 'none',
      stroke: i.pal.highlight,
      'stroke-width': i.look.inner,
      'stroke-linecap': 'round',
    }),
    crown,
  ].join('');
}

/** A crimped bottle cap wedged in the crest (no text, no logo). */
function bottleCap(i: DrawInput, r: number): string {
  const P = i.cfg.birds.parts;
  const cx = 0.05 * r;
  const cy = -1.75 * r;
  const teeth: Pt[] = [];
  for (let k = 0; k < 21; k++) {
    const a = (k / 21) * Math.PI * 2;
    const rr = k % 2 === 0 ? r * 0.62 : r * 0.52;
    teeth.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.42]);
  }
  return g(
    { transform: `rotate(-14 ${r2(cx)} ${r2(cy)})` },
    inked(polyD(teeth), P.crownCap, i.cfg.ink, i.look.line * 0.8),
    el('path', { d: ellipseD(cx, cy - r * 0.04, r * 0.4, r * 0.15), fill: P.crownCapShadow }),
    el('path', { d: ellipseD(cx, cy - r * 0.06, r * 0.26, r * 0.09), fill: P.crownRed }),
  );
}

function drawHead(i: DrawInput, h: HeadAt): string {
  const front = i.pose.eyes.startsWith('front');
  return g(
    { transform: `translate(${r2(h.x)} ${r2(h.y)}) rotate(${r2(h.rot)})` },
    front ? frontHead(i, h.r) : sideHead(i, h.r),
  );
}

function wattle(i: DrawInput, x: number, y: number, r: number, dark: boolean): string {
  const d = smoothD([
    [x - r * 0.12, y],
    [x + r * 0.14, y],
    [x + r * 0.2, y + r * 0.45],
    [x + r * 0.04, y + r * 0.72],
    [x - r * 0.14, y + r * 0.5],
  ]);
  return inked(d, dark ? i.pal.wattleShadow : i.pal.wattle, i.cfg.ink, i.look.inner * 1.3);
}

function sideHead(i: DrawInput, r: number): string {
  const ink = i.cfg.ink;
  const L = i.look.line;
  const p = i.pose;
  const out: string[] = [];
  out.push(casque(i, r, false));
  // Wattles behind the jaw (far one darker).
  out.push(wattle(i, r * 0.25, r * 0.55, r, true));
  // Head.
  out.push(inked(ellipseD(0, 0, r, r * 0.95), i.pal.face, ink, L));
  out.push(
    el('path', {
      d: `M${r2(-r * 0.55)} ${r2(-r * 0.55)}A${r2(r * 0.8)} ${r2(r * 0.8)} 0 0 1 ${r2(r * 0.6)} ${r2(-r * 0.5)}A${r2(r * 0.95)} ${r2(r * 0.7)} 0 0 0 ${r2(-r * 0.55)} ${r2(-r * 0.55)}Z`,
      fill: i.pal.faceHi,
    }),
  );
  // Beak (open = lower jaw drops).
  const open = p.beak * r * 0.35;
  out.push(
    inked(
      polyD([
        [r * 0.8, r * 0.05],
        [r * 1.5, r * 0.28 + open * 0.5],
        [r * 0.82, r * 0.42 + open],
      ]),
      i.pal.beak,
      ink,
      L * 0.8,
    ),
  );
  out.push(
    inked(
      smoothD([
        [r * 0.78, -r * 0.28],
        [r * 1.25, -r * 0.05],
        [r * 1.62, r * 0.25],
        [r * 1.2, r * 0.22],
        [r * 0.8, r * 0.12],
      ]),
      i.pal.beak,
      ink,
      L * 0.8,
    ),
  );
  out.push(wattle(i, r * 0.6, r * 0.5, r, false));
  if (i.parts.includes('toothpick'))
    out.push(
      el('path', {
        d: `M${r2(r * 1.1)} ${r2(r * 0.32)}L${r2(r * 1.95)} ${r2(r * 0.62)}`,
        stroke: ink,
        'stroke-width': L * 1.1 + 3,
        'stroke-linecap': 'round',
      }),
      el('path', {
        d: `M${r2(r * 1.1)} ${r2(r * 0.32)}L${r2(r * 1.95)} ${r2(r * 0.62)}`,
        stroke: i.cfg.birds.parts.toothpick,
        'stroke-width': 3,
        'stroke-linecap': 'round',
      }),
    );
  // Eye (or patch).
  if (i.parts.includes('eyePatch')) {
    out.push(
      el('path', {
        d: `M${r2(-r * 0.95)} ${r2(-r * 0.55)}L${r2(r * 0.9)} ${r2(r * 0.05)}`,
        stroke: i.cfg.birds.parts.eyePatch,
        'stroke-width': L * 0.9,
        'stroke-linecap': 'round',
      }),
      inked(
        ellipseD(r * 0.28, -r * 0.12, r * 0.4, r * 0.36),
        i.cfg.birds.parts.eyePatch,
        ink,
        L * 0.6,
      ),
    );
  } else {
    const look: Pt = p.eyes === 'wide' ? [0.2, -0.1] : [0.55, 0];
    out.push(eye(i, r * 0.28, -r * 0.15, r, p.eyes, look));
  }
  if (i.parts.includes('scowl'))
    out.push(
      inked(
        polyD([
          [-r * 0.25, -r * 0.78],
          [r * 0.75, -r * 0.42],
          [r * 0.7, -r * 0.24],
          [-r * 0.22, -r * 0.55],
        ]),
        ink,
        ink,
        0,
      ),
    );
  return out.join('');
}

function frontHead(i: DrawInput, r: number): string {
  const ink = i.cfg.ink;
  const L = i.look.line;
  const p = i.pose;
  const out: string[] = [];
  out.push(casque(i, r, true));
  out.push(wattle(i, -r * 0.62, r * 0.42, r, true));
  out.push(wattle(i, r * 0.5, r * 0.42, r, true));
  out.push(inked(ellipseD(0, 0, r * 1.05, r), i.pal.face, ink, L));
  out.push(el('path', { d: ellipseD(-r * 0.1, -r * 0.55, r * 0.6, r * 0.22), fill: i.pal.faceHi }));
  const look: Pt =
    p.eyes === 'frontLeft' ? [-0.7, 0] : p.eyes === 'frontRight' ? [0.7, 0] : [0, 0.15];
  const mode: Eyes = p.eyes === 'frontBlink' ? 'closed' : 'wide';
  if (i.parts.includes('eyePatch')) {
    out.push(
      inked(
        ellipseD(-r * 0.4, -r * 0.1, r * 0.36, r * 0.34),
        i.cfg.birds.parts.eyePatch,
        ink,
        L * 0.6,
      ),
    );
    out.push(eye(i, r * 0.4, -r * 0.1, r * 0.9, mode, look));
  } else {
    out.push(eye(i, -r * 0.4, -r * 0.1, r * 0.9, mode, look));
    out.push(eye(i, r * 0.4, -r * 0.1, r * 0.9, mode, look));
  }
  // Beak pointing at the viewer.
  out.push(
    inked(
      smoothD([
        [-r * 0.2, r * 0.3],
        [r * 0.2, r * 0.3],
        [r * 0.06, r * 0.8],
        [-r * 0.06, r * 0.8],
      ]),
      i.pal.beak,
      ink,
      L * 0.8,
    ),
  );
  if (i.parts.includes('scowl'))
    out.push(
      inked(
        polyD([
          [-r * 0.8, -r * 0.62],
          [-r * 0.1, -r * 0.36],
          [-r * 0.12, -r * 0.2],
          [-r * 0.78, -r * 0.45],
        ]),
        ink,
        ink,
        0,
      ),
      inked(
        polyD([
          [r * 0.8, -r * 0.62],
          [r * 0.1, -r * 0.36],
          [r * 0.12, -r * 0.2],
          [r * 0.78, -r * 0.45],
        ]),
        ink,
        ink,
        0,
      ),
    );
  if (i.parts.includes('toothpick'))
    out.push(
      el('path', {
        d: `M${r2(r * 0.1)} ${r2(r * 0.6)}L${r2(r * 0.7)} ${r2(r * 0.95)}`,
        stroke: i.cfg.birds.parts.toothpick,
        'stroke-width': 4,
        'stroke-linecap': 'round',
      }),
    );
  return out.join('');
}

// --- effects ---------------------------------------------------------------------------------

function puff(i: DrawInput, back: boolean): string {
  const f = back ? (i.pose.fx.backPuff ?? i.pose.fx.puff) : i.pose.fx.puff;
  if (f === undefined) return '';
  const rnd = prng(31 + (back ? 0 : 7));
  const cy = i.shape.body.oy;
  const circles: string[] = [
    ellipseD(0, cy, (back ? 110 : 75) * f.size, (back ? 85 : 60) * f.size),
  ];
  const n = back ? 9 : 6;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd() * 0.4;
    const d = (back ? 95 : 60) * f.size;
    const rr = (back ? 70 : 52) * f.size * (0.8 + rnd() * 0.4);
    circles.push(ellipseD(Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, rr, rr * 0.9));
  }
  const d = circles.join('');
  const P = i.cfg.birds;
  return g(
    { opacity: f.alpha },
    el('path', { d, fill: 'none', stroke: i.cfg.ink, 'stroke-width': i.look.line * 2 }),
    el('path', { d, fill: back ? P.puffShadow : P.puff }),
  );
}

function featherShape(i: DrawInput, x: number, y: number, rot: number, s: number): string {
  const pts = place(
    [
      [0, -14],
      [6, -4],
      [5, 10],
      [0, 16],
      [-5, 10],
      [-6, -4],
    ],
    x,
    y,
    rot,
    s,
    s,
  );
  const spine = place(
    [
      [0, -12],
      [0, 18],
    ],
    x,
    y,
    rot,
    s,
    s,
  );
  return [
    inked(smoothD(pts), i.pal.plumage, i.cfg.ink, i.look.inner),
    el('path', {
      d: ellipseD(
        (pts[2]?.[0] ?? x) * 0.5 + x * 0.5,
        (pts[2]?.[1] ?? y) * 0.5 + y * 0.5,
        2.2 * s,
        2.2 * s,
      ),
      fill: i.pal.dots,
    }),
    el('path', {
      d: `M${r2(spine[0]?.[0] ?? 0)} ${r2(spine[0]?.[1] ?? 0)}L${r2(spine[1]?.[0] ?? 0)} ${r2(spine[1]?.[1] ?? 0)}`,
      stroke: i.cfg.ink,
      'stroke-width': i.look.inner * 0.7,
    }),
  ].join('');
}

function feathers(i: DrawInput): string {
  const f = i.pose.fx.feathers;
  if (f === undefined) return '';
  const rnd = prng(97);
  const cy = i.shape.body.oy;
  const out: string[] = [];
  for (let k = 0; k < f.n; k++) {
    const a = (k / f.n) * Math.PI * 2 + rnd() * 0.5;
    const d = f.r * (0.7 + rnd() * 0.3);
    out.push(
      featherShape(
        i,
        Math.cos(a) * d,
        cy + Math.sin(a) * d * 0.62 + f.drop,
        (a * 180) / Math.PI + rnd() * 80,
        1.6 + rnd() * 0.6,
      ),
    );
  }
  return out.join('');
}

function shed(i: DrawInput): string {
  const t = i.pose.fx.shed;
  if (t === undefined) return '';
  return featherShape(i, -130 - t * 40, 40 + t * 70, 30 + t * 90, 1.7);
}

function star(cx: number, cy: number, r: number): string {
  const pts: Pt[] = [];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = k % 2 === 0 ? r : r * 0.45;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return polyD(pts);
}

function stars(i: DrawInput): string {
  const s = i.pose.fx.stars;
  if (s === undefined) return '';
  const h = i.shape.head;
  const out: string[] = [];
  for (let k = 0; k < s.n; k++) {
    const a = s.spin + (k / s.n) * Math.PI * 2;
    out.push(
      inked(
        star(h.x - 20 + Math.cos(a) * 70, h.y - 40 + Math.sin(a) * 22, 14),
        i.cfg.birds.star,
        i.cfg.ink,
        i.look.inner * 1.2,
      ),
    );
  }
  return g({ opacity: s.alpha }, ...out);
}

function sparkle(i: DrawInput): string {
  if (!i.parts.includes('sparkle')) return '';
  const rnd = prng(i.seed * 7 + 3);
  const out: string[] = [];
  const { rx, ry, oy } = i.shape.body;
  for (let k = 0; k < 3; k++) {
    const x = (rnd() - 0.5) * rx * 1.6;
    const y = oy + (rnd() - 0.5) * ry * 1.4;
    const r = 8 + rnd() * 8;
    out.push(
      inked(
        `M${r2(x)} ${r2(y - r)}Q${r2(x)} ${r2(y)} ${r2(x + r)} ${r2(y)}Q${r2(x)} ${r2(y)} ${r2(x)} ${r2(y + r)}Q${r2(x)} ${r2(y)} ${r2(x - r)} ${r2(y)}Q${r2(x)} ${r2(y)} ${r2(x)} ${r2(y - r)}Z`,
        i.cfg.birds.parts.sparkle,
        i.cfg.ink,
        i.look.inner * 0.8,
      ),
    );
  }
  return out.join('');
}
