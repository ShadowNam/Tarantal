// v1.6 (D-042, product owner 24 Oct): the distant animals of the far and Ver planes, redrawn as
// animals rather than rough shapes. One quadruped rig (a body with the species' back slope,
// jointed legs, a neck and head set by the pose) with species proportions and markings, plus the
// ostrich. Each has three poses: grazing (head down), walking (legs in stride) and head up
// (alert). Light from the upper left: a lit back, a shaded belly and far legs, a soft ground
// shadow. No ink: far art is edged in a darker shade of its own colour (D-035), so it stays crisp
// and small at its plane's size.
//
// Sizes: `h` is the animal's height at the shoulder (giraffe: at the head) in design px. Drawn
// facing right; `facing` −1 mirrors it. Coordinates: the feet stand on y = foot.
import { mix, nextId, shade, type Pt } from './scenery';
import { el, ellipseD, g, polyD, r2 } from './svg';

export type AnimalKind =
  'giraffe' | 'springbok' | 'gemsbok' | 'elephant' | 'zebra' | 'wildebeest' | 'lechwe' | 'ostrich';
/** v1.6: 'drink' (the giraffe's splay-legged drink; others treat it as grazing). */
export type Pose = 'graze' | 'walk' | 'alert' | 'drink';

/** Proportions in body units (1 = the body's length). */
interface Build {
  /** Leg length (ground to the body's underside). */
  readonly leg: number;
  /** Body depth (back to belly). */
  readonly depth: number;
  /** Extra height of the withers over the rump. */
  readonly withers: number;
  readonly neck: number;
  readonly neckW: number;
  readonly head: number;
  readonly headW: number;
  readonly legW: number;
  /** Neck angle (deg above the horizontal) per pose. */
  readonly neckUp: Readonly<Record<Exclude<Pose, 'drink'>, number>>;
  readonly tail: number;
}

const BUILDS: Readonly<Record<Exclude<AnimalKind, 'ostrich'>, Build>> = {
  giraffe: {
    leg: 1.05,
    depth: 0.5,
    withers: 0.42,
    neck: 1.25,
    neckW: 0.16,
    head: 0.3,
    headW: 0.13,
    legW: 0.07,
    neckUp: { graze: 38, walk: 58, alert: 74 },
    tail: 0.55,
  },
  springbok: {
    leg: 0.7,
    depth: 0.42,
    withers: 0.02,
    neck: 0.42,
    neckW: 0.14,
    head: 0.3,
    headW: 0.12,
    legW: 0.055,
    neckUp: { graze: -32, walk: 30, alert: 62 },
    tail: 0.18,
  },
  gemsbok: {
    leg: 0.68,
    depth: 0.5,
    withers: 0.06,
    neck: 0.45,
    neckW: 0.2,
    head: 0.32,
    headW: 0.13,
    legW: 0.07,
    neckUp: { graze: -30, walk: 25, alert: 55 },
    tail: 0.45,
  },
  elephant: {
    leg: 0.62,
    depth: 0.78,
    withers: 0.08,
    neck: 0.22,
    neckW: 0.55,
    head: 0.36,
    headW: 0.42,
    legW: 0.2,
    neckUp: { graze: -10, walk: 5, alert: 25 },
    tail: 0.45,
  },
  zebra: {
    leg: 0.62,
    depth: 0.52,
    withers: 0.04,
    neck: 0.48,
    neckW: 0.22,
    head: 0.38,
    headW: 0.14,
    legW: 0.075,
    neckUp: { graze: -34, walk: 28, alert: 52 },
    tail: 0.45,
  },
  wildebeest: {
    leg: 0.66,
    depth: 0.55,
    withers: 0.16,
    neck: 0.42,
    neckW: 0.26,
    head: 0.4,
    headW: 0.15,
    legW: 0.065,
    neckUp: { graze: -36, walk: 18, alert: 40 },
    tail: 0.5,
  },
  lechwe: {
    leg: 0.62,
    depth: 0.46,
    withers: -0.06,
    neck: 0.45,
    neckW: 0.15,
    head: 0.3,
    headW: 0.12,
    legW: 0.06,
    neckUp: { graze: -32, walk: 30, alert: 60 },
    tail: 0.2,
  },
};

interface Colours {
  readonly coat: string;
  readonly lit: string;
  readonly shade: string;
  readonly belly: string;
  readonly mark: string;
}

const COATS: Readonly<Record<AnimalKind, Colours>> = {
  giraffe: { coat: '#9C5C2E', lit: '#E6DAC2', shade: '#7A5A3E', belly: '#EAD9B4', mark: '#6A3A1C' },
  springbok: {
    coat: '#C68E58',
    lit: '#DDAA74',
    shade: '#94643C',
    belly: '#F4EEE2',
    mark: '#5A3A28',
  },
  gemsbok: { coat: '#B0A290', lit: '#CFC2B0', shade: '#7E7264', belly: '#F2EEE6', mark: '#26201C' },
  elephant: {
    coat: '#8E8984',
    lit: '#ACA7A0',
    shade: '#66615C',
    belly: '#77726C',
    mark: '#E8E2D2',
  },
  zebra: { coat: '#EEEAE0', lit: '#FAF8F2', shade: '#B8B2A8', belly: '#E2DED4', mark: '#24201E' },
  wildebeest: {
    coat: '#6E6A68',
    lit: '#8E8884',
    shade: '#4A4644',
    belly: '#5A5654',
    mark: '#2A2624',
  },
  lechwe: { coat: '#C47A3E', lit: '#DA9A5E', shade: '#8E5228', belly: '#F2E8D8', mark: '#2E2420' },
  ostrich: { coat: '#2A2626', lit: '#4A4444', shade: '#161414', belly: '#2A2626', mark: '#F2EEE6' },
};

export interface AnimalOpts {
  readonly kind: AnimalKind;
  readonly pose: Pose;
  readonly x: number;
  readonly foot: number;
  /** Height in design px (shoulder; giraffe and ostrich: the top of the head). */
  readonly h: number;
  readonly facing?: 1 | -1;
  /** Aerial haze for the plane (colour → hazed colour). */
  readonly tint?: (hex: string) => string;
  /** Stride phase for walkers (0 … 1), so a herd doesn't march in step. */
  readonly phase?: number;
}

/** A small deterministic stream from an animal's placement (its coat pattern). */
function seeded(o: AnimalOpts): () => number {
  let s = Math.round(o.x * 7 + o.foot * 13 + o.h * 101) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Tapered stroke between two points as a quad (w0 at a, w1 at b). */
function quad(a: Pt, b: Pt, w0: number, w1: number): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return polyD([
    [a[0] + (nx * w0) / 2, a[1] + (ny * w0) / 2],
    [b[0] + (nx * w1) / 2, b[1] + (ny * w1) / 2],
    [b[0] - (nx * w1) / 2, b[1] - (ny * w1) / 2],
    [a[0] - (nx * w0) / 2, a[1] - (ny * w0) / 2],
  ]);
}

/** A jointed leg from hip/shoulder `top` to the hoof at (fx, 0); knee bent forward or back. */
function legD(top: Pt, fx: number, w: number, bend: number, thigh = 1): string {
  const knee: Pt = [(top[0] + fx) / 2 + bend, top[1] * 0.5];
  // The upper leg swells into the body (haunch or shoulder); the cannon is thin.
  return (
    quad(top, knee, w * thigh, Math.max(w * 0.8, w * thigh * 0.45)) +
    quad(knee, [fx, 0], w * 0.75, w * 0.5)
  );
}

/** One animal, drawn facing right round (0, 0) and placed at (x, foot). */
export function farAnimal(o: AnimalOpts): string {
  const tint = o.tint ?? ((c: string) => c);
  const c = COATS[o.kind];
  const col = {
    coat: tint(c.coat),
    lit: tint(c.lit),
    shade: tint(c.shade),
    belly: tint(c.belly),
    mark: tint(c.mark),
  };
  const body =
    o.kind === 'ostrich'
      ? ostrich(o, col)
      : o.kind === 'giraffe'
        ? giraffeArt(o, col, seeded(o))
        : quadruped(o.pose === 'drink' ? { ...o, pose: 'graze' } : o, col);
  const s = o.h;
  const wide = o.kind === 'giraffe' ? 0.3 : o.kind === 'ostrich' ? 0.35 : 0.75;
  const shadow = el('path', {
    d: ellipseD(s * 0.02, 0.4, s * wide, Math.max(0.6, s * 0.07 * (wide / 0.75))),
    fill: '#2A1E16',
    opacity: 0.28,
  });
  return g(
    {
      transform: `translate(${r2(o.x)} ${r2(o.foot)})${o.facing === -1 ? ' scale(-1 1)' : ''}`,
    },
    shadow,
    body,
  );
}

function quadruped(o: AnimalOpts, col: Colours): string {
  const kind = o.kind as Exclude<AnimalKind, 'ostrich'>;
  const b = BUILDS[kind];
  // Scale: h is the shoulder height (giraffe: to the head top in the alert pose).
  const shoulderUnits = b.leg + b.depth + b.withers / 2;
  const u = kind === 'giraffe' ? o.h / (shoulderUnits + b.neck * 0.85 + 0.1) : o.h / shoulderUnits;
  const L = u; // body length in px
  const rx = L / 2;
  const ry = (b.depth * u) / 2;
  const cy = -(b.leg * u + ry + (b.withers * u) / 4);
  const tilt = Math.atan2(b.withers * u, L) * -1; // front higher → negative (up) slope
  const rot = (p: Pt): Pt => {
    const ca = Math.cos(tilt);
    const sa = Math.sin(tilt);
    return [p[0] * ca - p[1] * sa, cy + p[0] * sa + p[1] * ca];
  };
  const bodyPts: Pt[] = [];
  for (let k = 0; k < 20; k++) {
    const t = (k / 20) * Math.PI * 2;
    // A slightly egg-shaped barrel: deeper at the chest.
    const deep = 1 + 0.12 * Math.cos(t);
    bodyPts.push(rot([Math.cos(t) * rx, Math.sin(t) * ry * deep]));
  }
  const shoulder = rot([rx * 0.72, -ry * 0.45]);
  const rump = rot([-rx * 0.82, -ry * 0.3]);
  const ang = (b.neckUp[o.pose === 'drink' ? 'graze' : o.pose] * Math.PI) / 180;
  const neckY = shoulder[1] - Math.sin(ang) * b.neck * u;
  // Grazing heads reach the ground.
  const neckEnd: Pt = [
    shoulder[0] + Math.cos(ang) * b.neck * u,
    o.pose === 'graze' && kind !== 'giraffe' && kind !== 'elephant'
      ? Math.min(neckY, -b.head * u * 0.35)
      : neckY,
  ];
  const headAng = ang - (o.pose === 'graze' ? 0.75 : 1.15);
  const headTip: Pt = [
    neckEnd[0] + Math.cos(headAng) * b.head * u,
    neckEnd[1] - Math.sin(headAng) * b.head * u,
  ];
  // Legs: shoulder/hip tops on the belly line; walking legs scissor.
  const legW = Math.max(0.7, b.legW * u);
  const stride = o.pose === 'walk' ? 0.22 * u : 0.04 * u;
  const ph = (o.phase ?? 0) * Math.PI * 2;
  const tops = {
    frontNear: rot([rx * 0.55, ry * 0.35]),
    frontFar: rot([rx * 0.42, ry * 0.35]),
    hindNear: rot([-rx * 0.58, ry * 0.25]),
    hindFar: rot([-rx * 0.45, ry * 0.25]),
  };
  const swing = (k: number): number => Math.sin(ph + k * Math.PI) * stride;
  const big = kind === 'elephant' ? 1.1 : 3.4;
  const farLegs =
    legD(tops.frontFar, tops.frontFar[0] + swing(1), legW * 0.9, legW * 0.4, big * 0.8) +
    legD(tops.hindFar, tops.hindFar[0] + swing(0), legW * 0.9, -legW * 0.6, big);
  const nearLegs =
    legD(tops.frontNear, tops.frontNear[0] + swing(0), legW, legW * 0.4, big * 0.8) +
    legD(tops.hindNear, tops.hindNear[0] + swing(1), legW, -legW * 0.6, big);
  const neckD = quad(
    [shoulder[0] - b.neckW * u * 0.2, shoulder[1] + b.neckW * u * 0.3],
    neckEnd,
    b.neckW * u * (kind === 'giraffe' ? 1.4 : 1.6),
    b.neckW * u * 0.7,
  );
  const hw = (b.headW * u) / 2;
  const hl = (b.head * u) / 2;
  const hc: Pt = [(neckEnd[0] + headTip[0]) / 2, (neckEnd[1] + headTip[1]) / 2];
  const hRot = (-headAng * 180) / Math.PI;
  const headD = el('path', {
    d: ellipseD(0, 0, hl, hw),
    transform: `translate(${r2(hc[0])} ${r2(hc[1])}) rotate(${r2(hRot)})`,
  });
  const tailTop = rump;
  const tailD = quad(
    tailTop,
    [tailTop[0] - b.tail * u * 0.25, tailTop[1] + b.tail * u],
    Math.max(0.5, u * 0.03),
    Math.max(0.5, u * 0.05),
  );
  const edge = shade(col.shade, -0.25);
  const ew = Math.max(0.4, u * 0.012);
  const parts: string[] = [
    // Far legs, darker.
    el('path', { d: farLegs, fill: col.shade, stroke: edge, 'stroke-width': ew }),
    el('path', { d: tailD, fill: col.shade }),
    el('path', { d: polyD(bodyPts), fill: col.coat, stroke: edge, 'stroke-width': ew }),
    // Belly shade, lit back.
    el('path', {
      d: polyD(bodyPts.map((p) => [p[0], Math.max(p[1], cy + ry * 0.15)])),
      fill: col.shade,
      opacity: 0.45,
    }),
    el('path', {
      d: polyD(bodyPts.map((p) => [p[0] * 0.88, Math.min(p[1], cy - ry * 0.35)])),
      fill: col.lit,
      opacity: 0.85,
    }),
    el('path', { d: nearLegs, fill: col.coat, stroke: edge, 'stroke-width': ew }),
    el('path', { d: neckD, fill: col.coat, stroke: edge, 'stroke-width': ew }),
    g({ fill: col.coat, stroke: edge, 'stroke-width': ew }, headD),
  ];
  parts.push(
    markings(kind, o, col, u, {
      cy,
      rx,
      ry,
      rot,
      shoulder,
      neckEnd,
      headTip,
      hc,
      hRot,
      hl,
      hw,
      tops,
      legW,
    }),
  );
  return g({}, ...parts);
}

interface Geo {
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly rot: (p: Pt) => Pt;
  readonly shoulder: Pt;
  readonly neckEnd: Pt;
  readonly headTip: Pt;
  readonly hc: Pt;
  readonly hRot: number;
  readonly hl: number;
  readonly hw: number;
  readonly tops: Readonly<Record<'frontNear' | 'frontFar' | 'hindNear' | 'hindFar', Pt>>;
  readonly legW: number;
}

/** Species marks: horns, ears, patches, stripes, masks, manes. */
function markings(
  kind: Exclude<AnimalKind, 'ostrich'>,
  o: AnimalOpts,
  col: Colours,
  u: number,
  q: Geo,
): string {
  const out: string[] = [];
  const at = (x: number, y: number): Pt => {
    const a = (q.hRot * Math.PI) / 180;
    return [
      q.hc[0] + x * Math.cos(a) - y * Math.sin(a),
      q.hc[1] + x * Math.sin(a) + y * Math.cos(a),
    ];
  };
  const pole = at(-q.hl * 0.7, -q.hw * 0.6);
  const ear = (len: number, c: string): string =>
    el('path', {
      d: quad(pole, [pole[0] - len * 0.6, pole[1] - len * 0.6], Math.max(0.5, len * 0.45), 0.3),
      fill: c,
    });
  const horn = (dx: number, dy: number, w: number, c: string, curve = 0): string => {
    const tip: Pt = [pole[0] + dx, pole[1] + dy];
    const mid: Pt = [pole[0] + dx * 0.5 + curve, pole[1] + dy * 0.5 - Math.abs(curve) * 0.5];
    return el('path', {
      d: `M${r2(pole[0])} ${r2(pole[1])}Q${r2(mid[0])} ${r2(mid[1])} ${r2(tip[0])} ${r2(tip[1])}`,
      fill: 'none',
      stroke: c,
      'stroke-width': Math.max(0.5, w),
      'stroke-linecap': 'round',
    });
  };
  const muzzle = at(q.hl * 0.8, q.hw * 0.1);
  switch (kind) {
    case 'giraffe': {
      // Patches: a loose grid of dark polygons over body and neck, pale lines between.
      const spots: string[] = [];
      const r = Math.max(0.7, u * 0.06);
      for (let i = -3; i <= 3; i++)
        for (let j = -1; j <= 1; j++) {
          const p = q.rot([i * q.rx * 0.27 + (j % 2) * q.rx * 0.13, j * q.ry * 0.55]);
          spots.push(ellipseD(p[0], p[1], r * 1.2, r));
        }
      for (let k = 0; k < 6; k++) {
        const f = (k + 0.5) / 6;
        const p: Pt = [
          q.shoulder[0] + (q.neckEnd[0] - q.shoulder[0]) * f,
          q.shoulder[1] + (q.neckEnd[1] - q.shoulder[1]) * f,
        ];
        spots.push(ellipseD(p[0], p[1], r * 0.85, r * 0.8));
      }
      out.push(el('path', { d: spots.join(''), fill: col.mark, opacity: 0.85 }));
      // Ossicones and ears; a dark mane line down the neck.
      out.push(horn(-u * 0.02, -u * 0.12, u * 0.03, shade(col.mark, -0.2)));
      out.push(ear(u * 0.07, col.coat));
      out.push(
        el('path', {
          d: `M${r2(q.shoulder[0] - u * 0.03)} ${r2(q.shoulder[1] - u * 0.05)}L${r2(q.neckEnd[0] - u * 0.03)} ${r2(q.neckEnd[1])}`,
          stroke: col.mark,
          'stroke-width': Math.max(0.5, u * 0.025),
          opacity: 0.8,
        }),
      );
      break;
    }
    case 'springbok': {
      // The dark flank band between the cinnamon back and the white belly; white face; lyre horns.
      const band: Pt[] = [];
      for (let i = 0; i <= 10; i++)
        band.push(q.rot([-q.rx * 0.85 + (i / 10) * q.rx * 1.6, q.ry * 0.1]));
      out.push(
        el('path', {
          d: polyD([...band, ...[...band].reverse().map((p): Pt => [p[0], p[1] + q.ry * 0.25])]),
          fill: col.mark,
        }),
        el('path', {
          d: polyD([
            ...band.map((p): Pt => [p[0], p[1] + q.ry * 0.25]),
            q.rot([q.rx * 0.7, q.ry * 0.95]),
            q.rot([-q.rx * 0.8, q.ry * 0.9]),
          ]),
          fill: col.belly,
        }),
        el('path', {
          d: ellipseD(muzzle[0], muzzle[1], q.hl * 0.55, q.hw * 0.75),
          fill: col.belly,
        }),
        horn(-u * 0.04, -u * 0.2, u * 0.025, col.mark, u * 0.05),
        ear(u * 0.1, col.coat),
      );
      break;
    }
    case 'gemsbok': {
      // Black flank stripe and leg bands, white belly, black-and-white face, long straight horns.
      const stripe: Pt[] = [];
      for (let i = 0; i <= 10; i++)
        stripe.push(q.rot([-q.rx * 0.8 + (i / 10) * q.rx * 1.55, q.ry * 0.3]));
      out.push(
        el('path', {
          d: polyD([...stripe, ...[...stripe].reverse().map((p): Pt => [p[0], p[1] + q.ry * 0.2])]),
          fill: col.mark,
        }),
        el('path', {
          d: ellipseD(q.hc[0], q.hc[1], q.hl * 0.9, q.hw * 0.7),
          fill: col.mark,
          transform: `rotate(${r2(q.hRot)} ${r2(q.hc[0])} ${r2(q.hc[1])})`,
        }),
        el('path', { d: ellipseD(muzzle[0], muzzle[1], q.hl * 0.35, q.hw * 0.6), fill: col.belly }),
        horn(-u * 0.38, -u * 0.32, u * 0.022, shade(col.mark, 0.1)),
      );
      for (const t of [q.tops.frontNear, q.tops.hindNear])
        out.push(
          el('path', {
            d: ellipseD(t[0], t[1] + q.legW * 0.8, q.legW * 0.6, q.legW * 0.9),
            fill: col.mark,
          }),
        );
      break;
    }
    case 'elephant': {
      // A big ear fan over the head, a hanging trunk, a pale tusk.
      const earC: Pt = at(-q.hl * 0.55, q.hw * 0.1);
      const root = at(q.hl * 0.6, q.hw * 0.3);
      const trunkEnd: Pt = [root[0] + u * 0.08, -u * 0.04 - (o.pose === 'alert' ? u * 0.25 : 0)];
      const tm: Pt = [root[0] + u * 0.12, (root[1] + trunkEnd[1]) / 2];
      const trunkD = `M${r2(root[0])} ${r2(root[1])}Q${r2(tm[0])} ${r2(tm[1])} ${r2(trunkEnd[0])} ${r2(trunkEnd[1])}`;
      out.push(
        el('path', {
          d: trunkD,
          fill: 'none',
          stroke: shade(col.shade, -0.25),
          'stroke-width': Math.max(1, u * 0.12),
          'stroke-linecap': 'round',
        }),
        el('path', {
          d: trunkD,
          fill: 'none',
          stroke: col.coat,
          'stroke-width': Math.max(0.7, u * 0.095),
          'stroke-linecap': 'round',
        }),
        el('path', {
          d: ellipseD(earC[0], earC[1], u * 0.17, u * 0.22),
          fill: col.shade,
          stroke: shade(col.shade, -0.25),
          'stroke-width': Math.max(0.4, u * 0.012),
        }),
        el('path', {
          d: ellipseD(earC[0] - u * 0.04, earC[1] - u * 0.06, u * 0.08, u * 0.1),
          fill: col.coat,
          opacity: 0.7,
        }),
        el('path', {
          d: `M${r2(q.headTip[0] - u * 0.02)} ${r2(q.headTip[1] + u * 0.06)}q${r2(u * 0.12)} ${r2(u * 0.06)} ${r2(u * 0.16)} ${r2(-u * 0.04)}`,
          fill: 'none',
          stroke: col.mark,
          'stroke-width': Math.max(0.5, u * 0.035),
          'stroke-linecap': 'round',
        }),
      );
      break;
    }
    case 'zebra': {
      // Stripes across body, neck and legs, an upright mane, dark muzzle.
      const d: string[] = [];
      const n = Math.max(4, Math.min(11, Math.round(u / 3)));
      for (let i = 0; i < n; i++) {
        const f = -0.85 + (1.7 * i) / (n - 1);
        const a = q.rot([q.rx * f, -q.ry * 0.95]);
        const b = q.rot([q.rx * (f - 0.08), q.ry * 0.7]);
        d.push(`M${r2(a[0])} ${r2(a[1])}L${r2(b[0])} ${r2(b[1])}`);
      }
      for (let i = 1; i < 4; i++) {
        const f = i / 4;
        const p: Pt = [
          q.shoulder[0] + (q.neckEnd[0] - q.shoulder[0]) * f,
          q.shoulder[1] + (q.neckEnd[1] - q.shoulder[1]) * f,
        ];
        d.push(
          `M${r2(p[0] - u * 0.08)} ${r2(p[1] - u * 0.04)}L${r2(p[0] + u * 0.08)} ${r2(p[1] + u * 0.05)}`,
        );
      }
      out.push(
        el('path', {
          d: d.join(''),
          stroke: col.mark,
          'stroke-width': Math.max(0.5, u * 0.035),
          fill: 'none',
        }),
        el('path', {
          d: `M${r2(q.shoulder[0] - u * 0.04)} ${r2(q.shoulder[1] - u * 0.08)}L${r2(q.neckEnd[0] - u * 0.04)} ${r2(q.neckEnd[1] - u * 0.06)}`,
          stroke: col.mark,
          'stroke-width': Math.max(0.6, u * 0.06),
        }),
        el('path', { d: ellipseD(muzzle[0], muzzle[1], q.hl * 0.3, q.hw * 0.7), fill: col.mark }),
        ear(u * 0.1, col.coat),
      );
      break;
    }
    case 'wildebeest': {
      // A dark mane and beard, faint brindle bars, cow-like horns curving out and up.
      const d: string[] = [];
      for (let i = 0; i < 5; i++) {
        const f = -0.2 + i * 0.22;
        const a = q.rot([q.rx * f, -q.ry * 0.8]);
        const b = q.rot([q.rx * (f - 0.05), q.ry * 0.1]);
        d.push(`M${r2(a[0])} ${r2(a[1])}L${r2(b[0])} ${r2(b[1])}`);
      }
      out.push(
        el('path', {
          d: d.join(''),
          stroke: col.mark,
          'stroke-width': Math.max(0.4, u * 0.025),
          opacity: 0.6,
        }),
        el('path', {
          d: `M${r2(q.shoulder[0] - u * 0.06)} ${r2(q.shoulder[1] - u * 0.06)}L${r2(q.neckEnd[0])} ${r2(q.neckEnd[1] - u * 0.04)}`,
          stroke: col.mark,
          'stroke-width': Math.max(0.6, u * 0.07),
        }),
        el('path', {
          d: quad(
            [q.neckEnd[0] + u * 0.02, q.neckEnd[1] + u * 0.08],
            [q.hc[0], q.hc[1] + q.hw * 2.2],
            Math.max(0.6, u * 0.07),
            0.4,
          ),
          fill: col.mark,
        }),
        horn(u * 0.06, -u * 0.12, u * 0.03, shade(col.mark, 0.25), -u * 0.06),
      );
      break;
    }
    case 'lechwe': {
      // Black fronts to the forelegs, a white belly, long lyre horns swept back.
      out.push(
        el('path', {
          d: legD(q.tops.frontNear, q.tops.frontNear[0], q.legW * 0.5, q.legW * 0.4),
          fill: col.mark,
        }),
        el('path', {
          d: ellipseD(
            q.rot([0, q.ry * 0.7])[0],
            q.rot([0, q.ry * 0.7])[1],
            q.rx * 0.7,
            q.ry * 0.25,
          ),
          fill: col.belly,
        }),
        horn(-u * 0.15, -u * 0.24, u * 0.025, col.mark, -u * 0.06),
        ear(u * 0.08, col.coat),
      );
      break;
    }
  }
  return g({}, ...out);
}

/** The ostrich: a round black body with white wing plumes and tail, long bare neck and legs. */
function ostrich(o: AnimalOpts, col: Colours): string {
  const s = o.h; // top of the head
  const legH = s * 0.45;
  const bodyRx = s * 0.22;
  const bodyRy = s * 0.15;
  const cy = -(legH + bodyRy * 0.6);
  const skin = o.tint === undefined ? '#C8A8A0' : o.tint('#C8A8A0');
  const neckBase: Pt = [bodyRx * 0.7, cy - bodyRy * 0.4];
  const up = o.pose === 'alert' ? 1 : o.pose === 'walk' ? 0.8 : -0.2;
  const headP: Pt =
    up > 0
      ? [neckBase[0] + s * 0.12 * (1 - up * 0.5), cy - s * 0.5 * up]
      : [neckBase[0] + s * 0.25, -s * 0.05];
  const stride = o.pose === 'walk' ? s * 0.12 : s * 0.02;
  const ph = (o.phase ?? 0) * Math.PI * 2;
  const lw = Math.max(0.6, s * 0.035);
  const leg = (dx: number, k: number, c: string): string =>
    el('path', {
      d: legD([dx, cy + bodyRy * 0.5], dx + Math.sin(ph + k * Math.PI) * stride, lw, -lw * 1.5),
      fill: c,
    });
  return g(
    {},
    leg(-bodyRx * 0.1, 1, shade(skin, -0.25)),
    // Tail plumes (white), body, wing plumes.
    el('path', {
      d: ellipseD(-bodyRx * 1.0, cy - bodyRy * 0.1, bodyRx * 0.35, bodyRy * 0.5),
      fill: col.mark,
    }),
    el('path', {
      d: ellipseD(0, cy, bodyRx, bodyRy),
      fill: col.coat,
      stroke: col.shade,
      'stroke-width': Math.max(0.4, s * 0.01),
    }),
    el('path', {
      d: ellipseD(-bodyRx * 0.15, cy - bodyRy * 0.45, bodyRx * 0.7, bodyRy * 0.35),
      fill: col.lit,
    }),
    el('path', {
      d: ellipseD(-bodyRx * 0.45, cy + bodyRy * 0.25, bodyRx * 0.45, bodyRy * 0.35),
      fill: mix(col.mark, col.coat, 0.15),
    }),
    leg(bodyRx * 0.15, 0, skin),
    el('path', {
      d: `M${r2(neckBase[0])} ${r2(neckBase[1])}Q${r2(headP[0] + s * 0.02)} ${r2((neckBase[1] + headP[1]) / 2)} ${r2(headP[0])} ${r2(headP[1])}`,
      fill: 'none',
      stroke: skin,
      'stroke-width': Math.max(0.6, s * 0.045),
      'stroke-linecap': 'round',
    }),
    el('path', { d: ellipseD(headP[0] + s * 0.02, headP[1], s * 0.045, s * 0.03), fill: skin }),
    el('path', {
      d: `M${r2(headP[0] + s * 0.05)} ${r2(headP[1])}l${r2(s * 0.04)} ${r2(s * 0.01)}`,
      stroke: shade(skin, -0.3),
      'stroke-width': Math.max(0.4, s * 0.015),
    }),
  );
}

/**
 * A small herd: `n` animals of one kind spread over `spread` px, mixed poses and facings,
 * smaller toward the back row (dy < 0). Deterministic for a given rnd.
 */
export function herd(
  rnd: () => number,
  kind: AnimalKind,
  x: number,
  foot: number,
  h: number,
  n: number,
  spread: number,
  tint?: (hex: string) => string,
): string {
  const poses: Pose[] = ['graze', 'walk', 'alert', 'graze'];
  const items: { y: number; svg: string }[] = [];
  for (let k = 0; k < n; k++) {
    const dy = (rnd() - 0.5) * h * 0.25;
    const k2 = 1 + dy / (h * 2.5);
    items.push({
      y: foot + dy,
      svg: farAnimal({
        kind,
        pose: poses[Math.floor(rnd() * poses.length)] ?? 'graze',
        x: x + (rnd() - 0.5) * spread,
        foot: foot + dy,
        h: h * k2 * (0.9 + rnd() * 0.15),
        facing: rnd() < 0.6 ? 1 : -1,
        phase: rnd(),
        ...(tint === undefined ? {} : { tint }),
      }),
    });
  }
  items.sort((a, b) => a.y - b.y);
  return g({}, ...items.map((i) => i.svg));
}

// --- the giraffe (v1.6 D-042 review: "detail needs to become more realistic") ----------------

/** Lowers the forequarters (drinking: the front legs splay and the chest drops). */
function lowered(p: Pt, drop: number): Pt {
  const f = Math.min(1, Math.max(0, (p[0] + 0.25) / 0.42));
  return [p[0], p[1] + drop * f];
}

/**
 * A giraffe drawn from its own anatomy, in units of its height (ossicone tips in the head-up
 * pose = 1), facing right, feet on y = 0: high withers and a back sloping down to the rump, a
 * deep chest, a neck about as long as the front legs, long thin legs with knobbly knees, pale
 * lower legs and dark hooves, a tufted tail, a short dark mane, a tapered head with two tufted
 * ossicones and ears out to the side; a cream net between irregular chestnut patches (smaller on
 * the legs), a lit back and a shaded belly. Poses: graze = browsing (neck forward, head up to
 * the leaves), walk (a pace: legs of one side together), alert (head up), drink (front legs
 * splayed, the head down to the ground).
 */
function giraffeArt(o: AnimalOpts, col: Colours, rnd: () => number): string {
  const H = o.h;
  const drink = o.pose === 'drink';
  const drop = drink ? 0.14 : 0;
  const P = (x: number, y: number): Pt => {
    const q = lowered([x, y], drop);
    return [q[0] * H, q[1] * H];
  };
  const net = col.belly;
  const patch = col.coat;
  const patchEdge = col.mark;
  const lower = col.lit;
  const ink = shade(col.shade, -0.35);
  const ew = Math.max(0.35, H * 0.004);
  // Body: withers high, the back sloping to a rounded rump, a deep chest.
  const body = polyD([
    P(0.1, -0.64),
    P(0.02, -0.62),
    P(-0.1, -0.575),
    P(-0.2, -0.54),
    P(-0.245, -0.5),
    P(-0.25, -0.45),
    P(-0.23, -0.41),
    P(-0.17, -0.385),
    P(-0.02, -0.39),
    P(0.09, -0.4),
    P(0.15, -0.425),
    P(0.175, -0.47),
    P(0.18, -0.53),
    P(0.165, -0.58),
  ]);
  // Neck: from the shoulders, its length about the front legs'.
  const ang =
    ((drink ? -58 : o.pose === 'graze' ? 38 : o.pose === 'walk' ? 52 : 70) * Math.PI) / 180;
  const base = P(0.12, -0.6);
  const L = (drink ? 0.4 : 0.37) * H;
  const end: Pt = [base[0] + Math.cos(ang) * L, base[1] - Math.sin(ang) * L];
  const nx = -Math.sin(ang);
  const ny = -Math.cos(ang);
  const wB = 0.15 * H;
  const wT = 0.045 * H;
  // The back edge runs from the withers, the front edge from the chest.
  const neck = polyD([
    [base[0] - nx * wB * 0.6 - Math.cos(ang) * wB * 0.4, base[1] - ny * wB * 0.6],
    [end[0] - nx * wT * 0.5, end[1] - ny * wT * 0.5],
    [end[0] + nx * wT * 0.5, end[1] + ny * wT * 0.5],
    [base[0] + nx * wB * 0.55 + Math.cos(ang) * wB * 0.5, base[1] + ny * wB * 0.7],
  ]);
  // Head: pointing forward-down from the poll (down to the water when drinking).
  const hAng = drink ? -1.45 : ang - (o.pose === 'alert' ? 1.25 : 1.0);
  const hl = 0.11 * H;
  const hd: Pt = [Math.cos(hAng), -Math.sin(hAng)];
  const hn: Pt = [-hd[1], hd[0]];
  const muzzle: Pt = [end[0] + hd[0] * hl, end[1] + hd[1] * hl];
  const head = polyD([
    [end[0] + hn[0] * 0.03 * H - hd[0] * 0.015 * H, end[1] + hn[1] * 0.03 * H - hd[1] * 0.015 * H],
    [muzzle[0] + hn[0] * 0.016 * H, muzzle[1] + hn[1] * 0.016 * H],
    [muzzle[0] + hd[0] * 0.008 * H, muzzle[1] + hd[1] * 0.008 * H],
    [muzzle[0] - hn[0] * 0.018 * H, muzzle[1] - hn[1] * 0.018 * H],
    [end[0] - hn[0] * 0.032 * H, end[1] - hn[1] * 0.032 * H],
  ]);
  // The poll (top of the head) for the ossicones and ears: the side away from the jaw.
  const up = hn[1] < 0 ? hn : ([-hn[0], -hn[1]] as Pt);
  const poll: Pt = [end[0] + up[0] * 0.025 * H, end[1] + up[1] * 0.025 * H];
  // Legs: front pair under the chest, hind pair under the rump; knees knobbly.
  const ph = (o.phase ?? 0) * Math.PI * 2;
  const stride = o.pose === 'walk' ? 0.08 : 0.015;
  const spread = drink ? 0.15 : 0;
  const legs: { top: Pt; foot: number; far: boolean; front: boolean }[] = [
    { top: P(-0.165, -0.42), foot: -0.17 + Math.sin(ph) * stride, far: true, front: false },
    { top: P(0.07, -0.43), foot: 0.08 + Math.sin(ph) * stride - spread, far: true, front: true },
    { top: P(-0.205, -0.42), foot: -0.2 - Math.sin(ph) * stride, far: false, front: false },
    { top: P(0.115, -0.43), foot: 0.12 - Math.sin(ph) * stride + spread, far: false, front: true },
  ];
  const legParts: string[] = [];
  const patches: string[] = [];
  const lowerParts: string[] = [];
  for (const l of legs) {
    const fx = l.foot * H;
    const kneeY = (l.front ? -0.22 : -0.24) * H * (drink && l.front ? 0.8 : 1);
    const knee: Pt = [l.top[0] + (fx - l.top[0]) * 0.55 + (l.front ? 0.01 : -0.02) * H, kneeY];
    const wU = (l.front ? 0.04 : 0.055) * H;
    const upper = polyD([
      [l.top[0] - wU / 2, l.top[1]],
      [knee[0] - 0.012 * H, knee[1]],
      [knee[0] + 0.012 * H, knee[1]],
      [l.top[0] + wU / 2, l.top[1]],
    ]);
    const shin = polyD([
      [knee[0] - 0.011 * H, knee[1]],
      [fx - 0.008 * H, -0.012 * H],
      [fx + 0.008 * H, -0.012 * H],
      [knee[0] + 0.011 * H, knee[1]],
    ]);
    const c = l.far ? shade(patch, -0.15) : patch;
    const lowC = l.far ? shade(lower, -0.2) : lower;
    legParts.push(
      el('path', {
        d: upper,
        fill: l.far ? shade(net, -0.18) : net,
        stroke: ink,
        'stroke-width': ew,
      }),
      el('path', { d: shin, fill: lowC, stroke: ink, 'stroke-width': ew }),
      el('path', {
        d: ellipseD(knee[0], knee[1], 0.016 * H, 0.014 * H),
        fill: lowC,
        stroke: ink,
        'stroke-width': ew,
      }),
      el('path', { d: ellipseD(fx, -0.008 * H, 0.012 * H, 0.009 * H), fill: '#2A2420' }),
    );
    // Small patches on the upper leg.
    for (let k = 0; k < 3; k++) {
      const f = 0.2 + k * 0.28;
      const px = l.top[0] + (knee[0] - l.top[0]) * f;
      const py = l.top[1] + (knee[1] - l.top[1]) * f;
      patches.push(ellipseD(px, py, wU * 0.3, 0.012 * H));
    }
    lowerParts.push(c);
  }
  const farLegs = legParts.slice(0, 8);
  const nearLegs = legParts.slice(8);
  // Coat: chestnut patches on a jittered grid, clipped to the body and neck, cream between.
  const coatId = nextId();
  const cell = 0.058 * H;
  const bodyPatches: string[] = [];
  for (let gy = -1.05 * H; gy < -0.36 * H; gy += cell)
    for (let gx = -0.28 * H; gx < 0.36 * H; gx += cell) {
      const cx = gx + (rnd() - 0.5) * cell * 0.35;
      const cy = gy + (rnd() - 0.5) * cell * 0.35;
      const r = cell * (0.47 + rnd() * 0.06);
      const pts: Pt[] = [];
      const sides = 5 + Math.floor(rnd() * 3);
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2 + rnd() * 0.4;
        const rr = r * (0.8 + rnd() * 0.3);
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
      bodyPatches.push(polyD(pts));
    }
  const tail = `M${r2(P(-0.235, -0.5)[0])} ${r2(P(-0.235, -0.5)[1])}Q${r2(-0.27 * H)} ${r2(-0.38 * H)} ${r2(-0.26 * H)} ${r2(-0.27 * H)}`;
  const mane = `M${r2(base[0] - nx * wB * 0.6 - Math.cos(ang) * wB * 0.4)} ${r2(base[1] - ny * wB * 0.6)}L${r2(end[0] - nx * wT * 0.5)} ${r2(end[1] - ny * wT * 0.5)}`;
  const ossi = (dx: number): string => {
    const b: Pt = [poll[0] + hd[0] * dx * H, poll[1] + hd[1] * dx * H];
    const t: Pt = [
      b[0] + up[0] * 0.045 * H - hd[0] * 0.01 * H,
      b[1] + up[1] * 0.045 * H - hd[1] * 0.01 * H,
    ];
    return `M${r2(b[0])} ${r2(b[1])}L${r2(t[0])} ${r2(t[1])}`;
  };
  const ossiTips = (dx: number): Pt => {
    const b: Pt = [poll[0] + hd[0] * dx * H, poll[1] + hd[1] * dx * H];
    return [
      b[0] + up[0] * 0.045 * H - hd[0] * 0.01 * H,
      b[1] + up[1] * 0.045 * H - hd[1] * 0.01 * H,
    ];
  };
  const t1 = ossiTips(0.0);
  const t2 = ossiTips(0.018);
  const earBase: Pt = [poll[0] - hd[0] * 0.01 * H, poll[1] - hd[1] * 0.01 * H];
  const ear = polyD([
    earBase,
    [
      earBase[0] - hd[0] * 0.04 * H + up[0] * 0.012 * H,
      earBase[1] - hd[1] * 0.04 * H + up[1] * 0.012 * H,
    ],
    [
      earBase[0] - hd[0] * 0.035 * H - up[0] * 0.006 * H,
      earBase[1] - hd[1] * 0.035 * H - up[1] * 0.006 * H,
    ],
  ]);
  return g(
    {},
    ...farLegs,
    el('path', { d: tail, fill: 'none', stroke: ink, 'stroke-width': Math.max(0.5, 0.01 * H) }),
    el('path', { d: ellipseD(-0.26 * H, -0.26 * H, 0.012 * H, 0.03 * H), fill: '#2A2018' }),
    el('path', {
      d: body + neck,
      fill: net,
      stroke: ink,
      'stroke-width': ew,
      'stroke-linejoin': 'round',
    }),
    el('clipPath', { id: coatId }, el('path', { d: body + neck })),
    g(
      { 'clip-path': `url(#${coatId})` },
      el('path', {
        d: bodyPatches.join(''),
        fill: patch,
        stroke: patchEdge,
        'stroke-width': Math.max(0.25, H * 0.002),
      }),
      // Lit back and neck front, shaded belly.
      el('path', {
        d: ellipseD(-0.04 * H, -0.62 * H, 0.22 * H, 0.06 * H),
        fill: '#FFF4DC',
        opacity: 0.22,
      }),
      el('path', {
        d: ellipseD(0, -0.39 * H + drop * H * 0.5, 0.26 * H, 0.06 * H),
        fill: '#2A1A10',
        opacity: 0.3,
      }),
    ),
    el('path', { d: patches.join(''), fill: patch }),
    ...nearLegs,
    el('path', {
      d: mane,
      fill: 'none',
      stroke: shade(patch, 0.1),
      'stroke-width': Math.max(0.5, 0.009 * H),
      'stroke-linecap': 'round',
      'stroke-dasharray': `${r2(0.012 * H)} ${r2(0.006 * H)}`,
    }),
    el('path', { d: ear, fill: net, stroke: ink, 'stroke-width': ew }),
    el('path', {
      d: head,
      fill: shade(net, -0.05),
      stroke: ink,
      'stroke-width': ew,
      'stroke-linejoin': 'round',
    }),
    el('path', {
      d: ellipseD(end[0] + hd[0] * hl * 0.45, end[1] + hd[1] * hl * 0.45, 0.022 * H, 0.016 * H),
      fill: patch,
      opacity: 0.8,
    }),
    el('path', {
      d: ellipseD(
        end[0] + hd[0] * hl * 0.3 + up[0] * 0.012 * H,
        end[1] + hd[1] * hl * 0.3 + up[1] * 0.012 * H,
        0.006 * H,
        0.006 * H,
      ),
      fill: '#1A1410',
    }),
    el('path', {
      d: ossi(0) + ossi(0.018),
      fill: 'none',
      stroke: shade(net, -0.25),
      'stroke-width': Math.max(0.5, 0.009 * H),
      'stroke-linecap': 'round',
    }),
    el('path', {
      d:
        ellipseD(t1[0], t1[1], 0.007 * H, 0.007 * H) + ellipseD(t2[0], t2[1], 0.007 * H, 0.007 * H),
      fill: '#2A2018',
    }),
  );
}
