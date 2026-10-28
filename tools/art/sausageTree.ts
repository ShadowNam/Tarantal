// 1.9.4 (D-057, art bible §4.2d) The Okavango sausage tree (Kigelia africana), redrawn after the
// product owner's note (26 Oct: the sausages "still all look very stick figure like"): a short
// smooth grey-brown trunk with bark texture that forks into a few thick limbs (one silhouette, no
// hard joins, as the baobab), a broad spreading crown built of layered leaf clumps (dark under,
// lit upper left, leaflets breaking the edges, gaps where limbs show), a few maroon flower
// cords, and the fruit: heavy, slightly curved grey-brown sausages in a few sizes on long rope
// stalks, hanging at staggered heights (sprites: v1.7c swing and drop, the pivot at the stalk
// top). Drawing coords = prop px (foot at (0, 260)).
import type { BaobabLimb } from '../../src/game/view/tree/baobabShape';
import { limbAt, limbDir, limbWidth } from '../../src/game/view/tree/baobabShape';
import { branch, gradient, limbOutline } from './baobab';
import { blurFilter, clamp, zigzag } from './camelthorn';
import { kigelia } from './fruitLook';
import { fruit } from './fruitSink';
import { mix, nextId, shade, type Pt, type Rnd } from './scenery';
import type { Paint } from './species';
import { el, ellipseD, g, polyD, r2, smoothD } from './svg';

const FOOT = 260;

/** Trunk to the fork, then three main limbs spreading wide (a bare one carries the perch). */
const LIMBS: readonly BaobabLimb[] = [
  { p0: [-8, 70], c1: [-40, 10], c2: [-100, -40], p1: [-170, -110], w0: 34, w1: 10 },
  { p0: [-4, 64], c1: [-14, -10], c2: [-40, -90], p1: [-60, -190], w0: 32, w1: 9 },
  { p0: [6, 64], c1: [24, -10], c2: [70, -80], p1: [120, -170], w0: 34, w1: 10 },
  { p0: [10, 70], c1: [50, 20], c2: [120, -30], p1: [190, -90], w0: 30, w1: 9 },
];

/** Leaf clumps: centre, radii, and tier (0 back … 2 front). */
interface Clump {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
  readonly tier: number;
}

// Review T5: uneven sizes and spacing (gaps where the limbs show), never a cloud-pruned ring.
const CLUMPS: readonly Clump[] = [
  { x: -158, y: -196, rx: 62, ry: 42, tier: 0 },
  { x: -46, y: -256, rx: 90, ry: 50, tier: 0 },
  { x: 82, y: -236, rx: 72, ry: 46, tier: 0 },
  { x: 176, y: -168, rx: 50, ry: 38, tier: 0 },
  { x: -186, y: -128, rx: 46, ry: 30, tier: 1 },
  { x: -92, y: -184, rx: 66, ry: 40, tier: 1 },
  { x: 58, y: -182, rx: 60, ry: 40, tier: 1 },
  { x: 160, y: -116, rx: 54, ry: 32, tier: 1 },
  { x: -128, y: -104, rx: 50, ry: 30, tier: 2 },
  { x: -18, y: -124, rx: 52, ry: 32, tier: 2 },
  { x: 102, y: -104, rx: 50, ry: 30, tier: 2 },
];

export interface SausageTreeOpts {
  /** The content perch (a bare branch tip). */
  readonly perch: Pt;
  /** Sausages that swing and drop (sprites). */
  readonly fruits: number;
}

export function sausageTreeNear(rnd: Rnd, p: Paint, o: SausageTreeOpts): string {
  const bark = p.tint('#80746A');
  const barkLit = p.tint('#A89C8E');
  const ink = mix(p.pen.ink, shade(bark, -0.5), 0.35);
  const parts: string[] = [];

  const blur = blurFilter(5);
  parts.push(
    blur.def,
    g(
      { filter: `url(#${blur.id})` },
      el('path', { d: ellipseD(20, FOOT + 2, 190, 14), fill: '#22301C', opacity: 0.3 }),
    ),
  );

  // --- the crown's back tier first (behind the limbs) ----------------------------------------
  const leafLight = p.tint('#9CC06A');
  const leafMid = p.tint('#5C8A3C');
  const leafDark = p.tint('#36582A');
  const leafDeep = p.tint('#243E1E');
  const clump = (c: Clump): string => clumpSvg(rnd, c, { leafLight, leafMid, leafDark, leafDeep });
  for (const c of CLUMPS.filter((x) => x.tier === 0)) parts.push(clump(c));

  // --- trunk, limbs and branches: one silhouette --------------------------------------------
  const tl: Pt[] = [];
  const tr: Pt[] = [];
  for (let i = 0; i <= 24; i++) {
    const y = FOOT - ((FOOT - 50) * i) / 24;
    const s = (FOOT - y) / (FOOT - 50);
    // Flared foot, a slim waist, swelling a little into the fork.
    const half = 30 + 14 * Math.pow(1 - s, 3) - 4 * Math.sin(s * Math.PI) + 6 * s * s;
    const wob = Math.sin(y * 0.05) * 1.5;
    tl.push([-half + wob - s * 4, y]);
    tr.push([half + wob - s * 2, y]);
  }
  const trunkD = polyD([...tl, [-6, 30], ...[...tr].reverse()]);
  const limbs = LIMBS.map((l) => limbOutline(l));
  const branches: { d: string; pts: Pt[]; w: number[] }[] = [];
  const tips: Pt[] = [];
  LIMBS.forEach((l, i) => {
    tips.push(limbAt(l, 1));
    for (let b = 0; b < 3; b++) {
      const t = 0.45 + b * 0.18 + rnd() * 0.05;
      const s = limbAt(l, t);
      const d = limbDir(l, t);
      const side = (b + i) % 2 === 0 ? 1 : -1;
      const ang = Math.atan2(d[1], d[0]) + side * (0.55 + rnd() * 0.4);
      const len = 40 + rnd() * 45;
      const end: Pt = [
        clamp(s[0] + Math.cos(ang) * len, -225, 225),
        Math.min(s[1] + Math.sin(ang) * len - 12, s[1] - 8),
      ];
      const w0 = limbWidth(l, t) * 0.55;
      branches.push(branch(rnd, s, end, w0, Math.max(2.5, w0 * 0.3)));
      tips.push(end);
    }
  });
  // The bare perch branch (content).
  const pl = LIMBS[0] as BaobabLimb;
  const ps = limbAt(pl, 0.42);
  branches.push(branch(rnd, ps, o.perch, limbWidth(pl, 0.42) * 0.6, 4));
  const pieces = [trunkD, ...limbs.map((x) => x.d), ...branches.map((b) => b.d)];
  parts.push(
    g(
      { fill: ink, stroke: ink, 'stroke-width': 4, 'stroke-linejoin': 'round' },
      ...pieces.map((d) => el('path', { d })),
    ),
  );
  const base = gradient('linear', { x1: -60, y1: 0, x2: 60, y2: 0 }, [
    [0, shade(barkLit, 0.12)],
    [0.35, barkLit],
    [0.6, bark],
    [1, shade(bark, -0.3)],
  ]);
  parts.push(base.def, g({ fill: base.url }, ...pieces.map((d) => el('path', { d }))));
  const clipId = nextId();
  parts.push(el('clipPath', { id: clipId }, ...pieces.map((d) => el('path', { d }))));
  const inner: string[] = [];
  // Limb undersides in shade, lit upper edges.
  for (const l of LIMBS) {
    const dark: Pt[] = [];
    const darkIn: Pt[] = [];
    const lit: Pt[] = [];
    const litIn: Pt[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const c = limbAt(l, t);
      const d = limbDir(l, t);
      const h = limbWidth(l, t) / 2;
      let nx = -d[1];
      let ny = d[0];
      if (nx * -0.6 + ny * -0.8 < 0) {
        nx = -nx;
        ny = -ny;
      }
      lit.push([c[0] + nx * h * 1.1, c[1] + ny * h * 1.1]);
      litIn.push([c[0] + nx * h * 0.4, c[1] + ny * h * 0.4]);
      dark.push([c[0] - nx * h * 1.1, c[1] - ny * h * 1.1]);
      darkIn.push([c[0], c[1]]);
    }
    inner.push(
      el('path', {
        d: polyD([...dark, ...[...darkIn].reverse()]),
        fill: shade(bark, -0.4),
        opacity: 0.5,
      }),
      el('path', {
        d: polyD([...lit, ...[...litIn].reverse()]),
        fill: shade(barkLit, 0.25),
        opacity: 0.5,
      }),
    );
  }
  // Bark: smooth, with pale flaking patches and faint horizontal rings on the trunk.
  const rings: string[] = [];
  for (let k = 0; k < 40; k++) {
    const y = 60 + rnd() * 196;
    const x = (rnd() - 0.5) * 50;
    const l = 6 + rnd() * 12;
    rings.push(`M${r2(x - l / 2)} ${r2(y)}q${r2(l / 2)} ${r2(2 + rnd() * 1.5)} ${r2(l)} 0`);
  }
  const flakes: string[] = [];
  for (let k = 0; k < 16; k++) {
    const y = 70 + rnd() * 180;
    const x = (rnd() - 0.6) * 40;
    const pts: Pt[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = 2.5 + rnd() * 3;
      pts.push([x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r]);
    }
    flakes.push(polyD(pts));
  }
  const soft = blurFilter(8);
  inner.push(
    soft.def,
    g(
      { filter: `url(#${soft.id})` },
      el('path', { d: ellipseD(20, 160, 14, 110), fill: shade(bark, -0.45), opacity: 0.55 }),
      // The crown's shade over the fork.
      el('path', { d: ellipseD(0, 50, 60, 30), fill: shade(bark, -0.5), opacity: 0.5 }),
    ),
    el('path', { d: flakes.join(''), fill: shade(barkLit, 0.28), opacity: 0.45 }),
    el('path', {
      d: rings.join(''),
      fill: 'none',
      stroke: shade(bark, -0.35),
      'stroke-width': 1.1,
      opacity: 0.6,
      'stroke-linecap': 'round',
    }),
  );
  parts.push(g({ 'clip-path': `url(#${clipId})` }, ...inner));
  // Twigs into the foliage.
  const twigs: string[] = [];
  for (const t of tips)
    for (let k = 0; k < 3; k++) {
      const ang = -Math.PI / 2 + (rnd() - 0.5) * 2.4;
      const len = 12 + rnd() * 18;
      twigs.push(
        polyD(
          zigzag(rnd, t, [t[0] + Math.cos(ang) * len, t[1] + Math.sin(ang) * len], 1, 0.2),
          false,
        ),
      );
    }
  parts.push(
    el('path', {
      d: twigs.join(''),
      fill: 'none',
      stroke: shade(bark, -0.25),
      'stroke-width': 1.3,
      'stroke-linecap': 'round',
    }),
  );

  // --- the crown's middle and front tiers --------------------------------------------------
  for (const c of CLUMPS.filter((x) => x.tier === 1)) parts.push(clump(c));
  // Maroon flowers on long hanging cords, in the gaps of the crown's underside.
  for (const [x, y, len] of [
    [-150, -100, 56],
    [170, -96, 44],
  ] as const) {
    const cord = `M${x} ${y}q${r2((rnd() - 0.5) * 6)} ${len / 2} ${r2((rnd() - 0.5) * 4)} ${len}`;
    parts.push(
      el('path', { d: cord, fill: 'none', stroke: p.tint('#4A3A2C'), 'stroke-width': 1 }),
      ...[0.55, 0.75, 1].map((f, i) =>
        g(
          {},
          el('path', {
            d: `M${r2(x + (i - 1) * 3 - 1.4)} ${r2(y + len * f - 3)}L${r2(x + (i - 1) * 3 + 1.4)} ${r2(y + len * f - 3)}L${r2(x + (i - 1) * 3 + 3.2)} ${r2(y + len * f + 3)}Q${r2(x + (i - 1) * 3)} ${r2(y + len * f + 4.6)} ${r2(x + (i - 1) * 3 - 3.2)} ${r2(y + len * f + 3)}Z`,
            fill: p.tint('#5A1426'),
            stroke: ink,
            'stroke-width': 0.6,
          }),
          el('path', {
            d: ellipseD(x + (i - 1) * 3 - 1, y + len * f + 1, 1.2, 1.6),
            fill: p.tint('#A03A50'),
            opacity: 0.8,
          }),
        ),
      ),
    );
  }
  for (const c of CLUMPS.filter((x) => x.tier === 2)) parts.push(clump(c));

  // --- the sausages: a few sizes, staggered, from limb undersides and the crown's lower edge
  const colours = { fill: p.tint('#8A7A62'), lit: p.tint('#B6A888'), dark: p.tint('#584A3A') };
  const hangs: Pt[] = [];
  for (const c of CLUMPS.filter((x) => x.tier >= 1))
    for (let k = 0; k < 2; k++)
      hangs.push([c.x + (rnd() - 0.5) * c.rx * 1.2, c.y + c.ry * (0.55 + rnd() * 0.25)]);
  // Pick spread-out points (never a neat row): sort by x and take every so often.
  const order = hangs
    .map((h, i) => ({ h, k: lifeOrder(i, rnd) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.h);
  const chosen: Pt[] = [];
  for (const h of order) {
    if (chosen.length >= o.fruits) break;
    if (chosen.some((c) => Math.abs(c[0] - h[0]) < 26)) continue;
    chosen.push(h);
  }
  // Four sizes (review T4): the largest at least as long as main's (73 px ± 25 %), some much
  // longer; heavy (12–15.5 px wide).
  const sizes = [0.85, 1.15, 1.5, 2];
  chosen.forEach((top, i) => {
    // Every size twice (never all short), in a scattered order.
    const size = sizes[(i * 3) % sizes.length] ?? 1;
    const stalkLen = 34 + rnd() * 70;
    const sway = (rnd() - 0.5) * stalkLen * 0.14;
    const attach: Pt = [top[0] + sway, top[1] + stalkLen];
    const len = 50 * size * (0.92 + rnd() * 0.16);
    const w = clamp(10 + size * 2.8, 12, 15.5);
    const tilt = (rnd() - 0.5) * 0.3;
    const drawn = kigelia({ top, attach, sway, len, w, tilt, c: colours, ink });
    parts.push(
      fruit({
        species: 'sausage',
        motion: 'hang',
        x: top[0],
        y: top[1],
        ground: FOOT,
        reach: stalkLen + len + w * 2 + 6,
        svg: g({}, drawn.stalk ?? '', drawn.body),
        hi: () => drawn,
        trunk: { x: 0, half: 36 },
      }),
    );
  });
  return g({}, ...parts);
}

/** A seeded sort key (keeps the pick stable for a seed but never in x order). */
function lifeOrder(i: number, rnd: Rnd): number {
  return rnd() + i * 0.0001;
}

/** One leaf clump: a dark base, a lit body, and leaflets that break its edge. */
function clumpSvg(
  rnd: Rnd,
  c: Clump,
  col: { leafLight: string; leafMid: string; leafDark: string; leafDeep: string },
): string {
  const tierDark = [0.22, 0.1, 0][c.tier] ?? 0;
  const pts: Pt[] = [];
  // An uneven edge: lobes and two or three deep notches (review T5).
  const notches = new Set([Math.floor(rnd() * 26), Math.floor(rnd() * 26), Math.floor(rnd() * 26)]);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const r = (0.78 + rnd() * 0.34) * (notches.has(i) ? 0.62 : 1);
    // Flatter underside: clumps hang, their lower edge straighter.
    const ry = Math.sin(a) > 0 ? c.ry * 0.8 : c.ry;
    pts.push([c.x + Math.cos(a) * c.rx * r, c.y + Math.sin(a) * ry * r]);
  }
  const body = smoothD(pts, true, 0.6);
  const grad = gradient(
    'radial',
    { cx: c.x - c.rx * 0.35, cy: c.y - c.ry * 0.5, r: Math.max(c.rx, c.ry) * 1.25 },
    [
      [0, shade(col.leafMid, 0.12 - tierDark)],
      [0.55, shade(col.leafMid, -tierDark)],
      [1, shade(col.leafDark, -tierDark)],
    ],
  );
  // Leaflets: oblong, in drooping fans; colour by where they sit (lit top left, dark below).
  const buckets: Record<'light' | 'mid' | 'dark' | 'deep', string[]> = {
    light: [],
    mid: [],
    dark: [],
    deep: [],
  };
  const n = Math.round((c.rx * c.ry) / 6);
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd()) * 1.12;
    const x = c.x + Math.cos(a) * c.rx * rr;
    const y = c.y + Math.sin(a) * c.ry * rr * (Math.sin(a) > 0 ? 0.8 : 1);
    const lit = ((c.x - x) / c.rx) * 0.6 + ((c.y - y) / c.ry) * 0.8 + (rnd() - 0.5) * 0.6;
    const key = lit > 0.55 ? 'light' : lit > -0.1 ? 'mid' : lit > -0.7 ? 'dark' : 'deep';
    const ang = Math.PI / 2 + ((x - c.x) / c.rx) * 0.7 + (rnd() - 0.5) * 1.2;
    const l = 3 + rnd() * 2.6;
    const w = 1.5 + rnd() * 1;
    const cx = Math.cos(ang);
    const sy = Math.sin(ang);
    // A leaflet: a pointed oval along `ang`.
    buckets[key].push(
      `M${r2(x - cx * l)} ${r2(y - sy * l)}Q${r2(x - sy * w)} ${r2(y + cx * w)} ${r2(x + cx * l)} ${r2(y + sy * l)}Q${r2(x + sy * w)} ${r2(y - cx * w)} ${r2(x - cx * l)} ${r2(y - sy * l)}Z`,
    );
  }
  let inner = '';
  for (let k = 0; k < 4; k++) {
    const a = rnd() * Math.PI;
    inner += ellipseD(
      c.x + Math.cos(a) * c.rx * 0.45,
      c.y + c.ry * (0.05 + rnd() * 0.35),
      c.rx * (0.18 + rnd() * 0.14),
      c.ry * (0.16 + rnd() * 0.12),
    );
  }
  const tone = (k: string): string => shade(k, -tierDark);
  return g(
    {},
    grad.def,
    el('path', { d: body, fill: shade(col.leafDeep, -tierDark), transform: 'translate(3 5)' }),
    el('path', { d: body, fill: grad.url }),
    // Darker inner clumps: shade between the leaf masses, low in the clump.
    el('path', { d: inner, fill: shade(col.leafDeep, -tierDark), opacity: 0.7 }),
    el('path', { d: buckets.deep.join(''), fill: tone(col.leafDeep) }),
    el('path', { d: buckets.dark.join(''), fill: tone(col.leafDark) }),
    el('path', { d: buckets.mid.join(''), fill: tone(col.leafMid) }),
    el('path', { d: buckets.light.join(''), fill: tone(col.leafLight) }),
  );
}
