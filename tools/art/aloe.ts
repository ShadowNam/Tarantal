// D-051 (Karoo polish, product owner 26 Oct: "These aloes … need to become HD"): the bitter aloe
// (Aloe ferox) at the camelthorn's detail level (D-039), drawn for 2× textures. Shared by the
// Karoo and Bushveld aloe clumps and the aloe in the granite koppie's crack (rocks.ts).
//
// One plant: a short stem wrapped in a skirt of dry, papery old leaves; a rosette of thick, fleshy
// grey-green to blue-green leaves that curve up and out (upper faces lighter, undersides darker,
// lit from the upper left, darker toward the heart of the rosette), with small reddish-brown
// teeth along the edges and a few on the faces; and a candelabra of 3–6 upright racemes packed
// with small tubular flowers: dark red buds at the top, orange, then open yellow-orange flowers
// lower down, on grey-green stalks. Thin, tinted outlines (soft ink), no heavy black line.
// Coordinates: design px, the plant's foot at (x, y). Pure: same input, same SVG.
import { mix, nextId, shade, type Pt, type Rnd } from './scenery';
import { el, g, r2, smoothD } from './svg';

/** The colours of one aloe look (already hazed for the plane it sits on). */
export interface AloeLook {
  /** Upper (lit) leaf face, its bloom highlight and the underside. */
  readonly face: string;
  readonly bloom: string;
  readonly under: string;
  /** The teeth along the edges (reddish brown). */
  readonly tooth: string;
  /** Soft outline ink. */
  readonly ink: string;
  /** Dry skirt leaves: dark, mid, light (papery grey-brown). */
  readonly dry: readonly [string, string, string];
  /** Flower ramp, top to bottom: bud, red, orange, open (yellow-orange), anthers. */
  readonly flower: readonly [string, string, string, string, string];
  /** Flower stalks (grey-green). */
  readonly stalk: string;
}

/** A look from a biome palette: `leaf` its aloe green, `flower`/`bud` its aloe flower colours. */
export function aloeLook(
  tint: (hex: string) => string,
  leaf: string,
  flower: string,
  bud: string,
): AloeLook {
  // Bitter aloe leaves are a dusty grey-green to blue-green: the palette green toward blue-grey.
  const face = mix(leaf, tint('#86A6A2'), 0.45);
  return {
    face,
    bloom: mix(face, tint('#D8E6E0'), 0.45),
    under: shade(mix(leaf, tint('#4E6F66'), 0.5), -0.12),
    tooth: tint('#8E3B23'),
    ink: shade(mix(leaf, tint('#24342E'), 0.6), -0.2),
    dry: [tint('#6E5B47'), tint('#9A8468'), tint('#C2AE8E')],
    flower: [
      shade(mix(flower, '#9A1C18', 0.6), -0.08),
      mix(flower, '#C9301E', 0.4),
      mix(flower, '#EC6E2A', 0.6),
      mix(bud, '#F4B242', 0.6),
      tint('#F7DE7A'),
    ],
    stalk: tint('#7E8C74'),
  };
}

export interface AloePlant {
  /** Foot of the stem. */
  readonly x: number;
  readonly y: number;
  /** Leaf length of the rosette's longest leaves (design px). */
  readonly s: number;
  /** Stem height (design px; 0 = a young plant with its rosette on the ground). */
  readonly stem: number;
  /** Racemes on the candelabra (0 = not flowering). */
  readonly racemes: number;
  /** Height of the flowers' tops above the rosette's heart (design px). */
  readonly bloomH: number;
  /** Rosette turn (−1 … 1): shifts which leaves face the viewer, so plants don't repeat. */
  readonly turn: number;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
/** Unit vector at `deg` from straight up, clockwise (0 = up, 90 = right). */
const dir = (deg: number): Pt => [Math.sin(rad(deg)), -Math.cos(rad(deg))];

/** One fleshy leaf: centreline from `base` at `deg`, arching `bend` degrees further out. */
function leaf(
  base: Pt,
  deg: number,
  len: number,
  w: number,
  bend: number,
  face: number,
  look: AloeLook,
  lit: number,
  rnd: Rnd,
  teeth = true,
): string {
  const side = deg === 0 ? -1 : Math.sign(deg);
  const p1 = add(base, dir(deg), len * 0.55);
  const p2 = add(p1, dir(deg + bend * side), len * 0.5);
  const n = 14;
  const up: Pt[] = [];
  const lo: Pt[] = [];
  const mid: Pt[] = [];
  const centre: Pt[] = [];
  const normals: Pt[] = [];
  const tangents: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const c: Pt = [
      (1 - t) * (1 - t) * base[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
      (1 - t) * (1 - t) * base[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
    ];
    const tx = 2 * (1 - t) * (p1[0] - base[0]) + 2 * t * (p2[0] - p1[0]);
    const ty = 2 * (1 - t) * (p1[1] - base[1]) + 2 * t * (p2[1] - p1[1]);
    const tl = Math.hypot(tx, ty) || 1;
    const tan: Pt = [tx / tl, ty / tl];
    // The upper face's side: the normal that points up (for an upright leaf, the lit left).
    const nUp: Pt = side < 0 ? [-tan[1], tan[0]] : [tan[1], -tan[0]];
    const half = (w / 2) * Math.pow(1 - t, 1.05) * (0.72 + 0.28 * Math.min(1, t * 5));
    up.push(add(c, nUp, half));
    lo.push(add(c, nUp, -half));
    mid.push(add(c, nUp, half * (1 - 2 * face)));
    centre.push(c);
    normals.push(nUp);
    tangents.push(tan);
  }
  const outline = smoothD([...up, ...lo.slice(0, -1).reverse()], true, 0.6);
  const faceD = smoothD([...up, ...mid.slice(1, -1).reverse()], true, 0.6);
  // Darker toward the heart of the rosette (soft shadow between the leaves), lighter at the tip.
  const gid = nextId();
  const fid = nextId();
  const tip = p2;
  const grad = (id: string, colour: string, k: number): string =>
    el(
      'linearGradient',
      {
        id,
        gradientUnits: 'userSpaceOnUse',
        x1: r2(base[0]),
        y1: r2(base[1]),
        x2: r2(tip[0]),
        y2: r2(tip[1]),
      },
      el('stop', { offset: 0, 'stop-color': shade(colour, -0.42 + k) }),
      el('stop', { offset: 0.38, 'stop-color': shade(colour, k) }),
      el('stop', { offset: 1, 'stop-color': shade(colour, 0.08 + k) }),
    );
  const parts: string[] = [
    el('defs', {}, grad(gid, look.under, lit * 0.5), grad(fid, look.face, lit)),
    el('path', { d: outline, fill: `url(#${gid})` }),
  ];
  if (face > 0.02) {
    parts.push(el('path', { d: faceD, fill: `url(#${fid})` }));
    // The channel down the face and a glaucous bloom streak near the upper edge.
    const crease: Pt[] = [];
    const sheen: Pt[] = [];
    for (let i = 2; i <= n - 2; i++) {
      const u = up[i] ?? [0, 0];
      const m = mid[i] ?? [0, 0];
      crease.push([m[0] + (u[0] - m[0]) * 0.22, m[1] + (u[1] - m[1]) * 0.22]);
      if (i < n - 3) sheen.push([m[0] + (u[0] - m[0]) * 0.72, m[1] + (u[1] - m[1]) * 0.72]);
    }
    parts.push(
      el('path', {
        d: smoothD(crease, false, 0.6),
        fill: 'none',
        stroke: shade(look.face, -0.22),
        'stroke-width': r2(Math.max(0.5, w * 0.05)),
        'stroke-opacity': 0.55,
        'stroke-linecap': 'round',
      }),
      el('path', {
        d: smoothD(sheen, false, 0.6),
        fill: 'none',
        stroke: look.bloom,
        'stroke-width': r2(Math.max(0.6, w * 0.12)),
        'stroke-opacity': r2(0.35 + Math.max(0, lit) * 1.5),
        'stroke-linecap': 'round',
      }),
    );
  }
  parts.push(
    el('path', {
      d: outline,
      fill: 'none',
      stroke: look.ink,
      'stroke-width': r2(Math.max(0.55, w * 0.045)),
      'stroke-opacity': 0.8,
      'stroke-linejoin': 'round',
    }),
  );
  if (teeth) {
    // Teeth along both edges, pointing out and toward the tip; a few spines on the face.
    const ts = Math.max(0.9, w * 0.085);
    const tri: string[] = [];
    const count = Math.max(4, Math.round(len / (w * 0.42)));
    for (let k = 1; k < count; k++) {
      const t = 0.08 + (k / count) * 0.84;
      const i = Math.min(n, Math.round(t * n));
      const tan = tangents[i] ?? [0, -1];
      const nu = normals[i] ?? [1, 0];
      const sz = ts * (1 - t * 0.55);
      for (const [edge, sgn] of [
        [up, 1],
        [lo, -1],
      ] as const) {
        const e = edge[i] ?? [0, 0];
        const a = add(e, tan, -sz * 0.55);
        const b = add(add(e, nu, sgn * sz), tan, sz * 0.55);
        const c = add(e, tan, sz * 0.55);
        tri.push(`M${r2(a[0])} ${r2(a[1])}L${r2(b[0])} ${r2(b[1])}L${r2(c[0])} ${r2(c[1])}Z`);
      }
    }
    for (let k = 0; k < 3; k++) {
      if (rnd() < 0.35) continue;
      const i = Math.round((0.25 + k * 0.2) * n);
      const c = centre[i] ?? [0, 0];
      const nu = normals[i] ?? [1, 0];
      const p = add(c, nu, (w / 2) * (face - 0.5) * 0.6 * (1 - i / n));
      const sz = ts * 0.7;
      tri.push(
        `M${r2(p[0] - sz * 0.4)} ${r2(p[1])}L${r2(p[0])} ${r2(p[1] - sz)}L${r2(p[0] + sz * 0.4)} ${r2(p[1])}Z`,
      );
    }
    parts.push(el('path', { d: tri.join(''), fill: look.tooth }));
  }
  return g({}, ...parts);
}

/** A dry, papery old leaf hanging from `top`, `deg` from straight down. */
function dryLeaf(top: Pt, deg: number, len: number, w: number, tone: string, look: AloeLook) {
  const d = dir(180 + deg);
  const curl = dir(180 + deg * 1.8);
  const a = add(top, d, len * 0.5);
  const b = add(a, curl, len * 0.5);
  const nrm: Pt = [-d[1], d[0]];
  const pts: Pt[] = [
    add(top, nrm, w / 2),
    add(a, nrm, w * 0.42),
    add(b, nrm, w * 0.08),
    add(b, nrm, -w * 0.08),
    add(a, nrm, -w * 0.38),
    add(top, nrm, -w / 2),
  ];
  const vein = `M${r2(top[0])} ${r2(top[1])}Q${r2(a[0])} ${r2(a[1])} ${r2(b[0])} ${r2(b[1])}`;
  return g(
    {},
    el('path', {
      d: smoothD(pts, true, 0.55),
      fill: tone,
      stroke: shade(look.dry[0], -0.25),
      'stroke-width': r2(Math.max(0.5, w * 0.07)),
      'stroke-linejoin': 'round',
    }),
    el('path', {
      d: vein,
      fill: 'none',
      stroke: look.dry[2],
      'stroke-width': r2(Math.max(0.4, w * 0.1)),
      'stroke-opacity': 0.6,
    }),
  );
}

/** One raceme: a dense candle of small tubular flowers from its foot (x, y), `h` tall. */
function raceme(rnd: Rnd, x: number, y: number, h: number, lean: number, look: AloeLook): string {
  const r = h * 0.11;
  const rows = Math.max(8, Math.round(h / 5.2));
  const back: string[] = [];
  const front: string[] = [];
  const [bud, red, orange, open, anther] = look.flower;
  const colourAt = (t: number): string =>
    t > 0.72
      ? mix(red, bud, (t - 0.72) / 0.28)
      : t > 0.38
        ? mix(orange, red, (t - 0.38) / 0.34)
        : mix(open, orange, t / 0.38);
  const stamens: string[] = [];
  for (let k = 0; k < rows; k++) {
    const t = k / (rows - 1);
    const ax = x + lean * h * t;
    const ay = y - h * t;
    // A cylinder that tapers to a cone of buds at the top.
    const rad0 = r * (t < 0.66 ? 1 : 1 - ((t - 0.66) / 0.34) * 0.78);
    const count = 6;
    for (let j = 0; j < count; j++) {
      const phi = ((j + (k % 2) * 0.5) / count) * Math.PI * 2 + rnd() * 0.3;
      const depth = Math.cos(phi);
      const sx = Math.sin(phi);
      // Open flowers hang down and out; buds point up along the stalk.
      const droop = t < 0.4 ? 0.9 : t < 0.72 ? 0.35 : -0.6;
      const len = rad0 * (t > 0.72 ? 0.9 : 1.25);
      const wTube = Math.max(0.9, r * (t > 0.72 ? 0.34 : 0.3));
      const p0: Pt = [ax + sx * rad0 * 0.25, ay];
      const p1: Pt = [ax + sx * (rad0 * 0.25 + len), ay + droop * len * 0.7];
      const lit = depth < 0 ? -0.25 : sx < 0 ? 0.1 : -0.05;
      const col = shade(colourAt(t + (rnd() - 0.5) * 0.06), lit);
      const nx = -(p1[1] - p0[1]);
      const ny = p1[0] - p0[0];
      const nl = Math.hypot(nx, ny) || 1;
      const ox = (nx / nl) * wTube * 0.5;
      const oy = (ny / nl) * wTube * 0.5;
      const d = `M${r2(p0[0] + ox)} ${r2(p0[1] + oy)}L${r2(p1[0] + ox * 1.15)} ${r2(p1[1] + oy * 1.15)}Q${r2(p1[0] + (p1[0] - p0[0]) * 0.18)} ${r2(p1[1] + (p1[1] - p0[1]) * 0.18)} ${r2(p1[0] - ox * 1.15)} ${r2(p1[1] - oy * 1.15)}L${r2(p0[0] - ox)} ${r2(p0[1] - oy)}Z`;
      const tube = el('path', {
        d,
        fill: col,
        stroke: shade(col, -0.35),
        'stroke-width': r2(Math.max(0.3, wTube * 0.14)),
      });
      (depth < 0 ? back : front).push(tube);
      if (t < 0.32 && depth >= 0)
        stamens.push(
          `M${r2(p1[0])} ${r2(p1[1])}l${r2((p1[0] - p0[0]) * 0.35)} ${r2(len * 0.35)}`,
        );
    }
  }
  const axis = el('path', {
    d: `M${r2(x)} ${r2(y + h * 0.06)}L${r2(x + lean * h)} ${r2(y - h * 0.98)}`,
    fill: 'none',
    stroke: shade(look.stalk, -0.1),
    'stroke-width': r2(Math.max(0.8, r * 0.28)),
  });
  return g(
    {},
    axis,
    ...back,
    ...front,
    el('path', {
      d: stamens.join(''),
      fill: 'none',
      stroke: anther,
      'stroke-width': r2(Math.max(0.35, r * 0.07)),
      'stroke-linecap': 'round',
    }),
  );
}

/** The candelabra: a stalk from the rosette's heart, forking into `n` upright racemes. */
function candelabra(rnd: Rnd, x: number, y: number, n: number, h: number, look: AloeLook) {
  const parts: string[] = [];
  const stalkW = Math.max(1.4, h * 0.035);
  const forkY = y - h * 0.34;
  const spread = h * (0.16 + n * 0.055);
  const pen = (w: number, col: string) => ({
    fill: 'none',
    stroke: col,
    'stroke-width': r2(w),
    'stroke-linecap': 'round',
  });
  const stalkD = `M${r2(x)} ${r2(y)}Q${r2(x + 1)} ${r2((y + forkY) / 2)} ${r2(x)} ${r2(forkY)}`;
  parts.push(
    el('path', { d: stalkD, ...pen(stalkW + 1.2, shade(look.stalk, -0.35)) }),
    el('path', { d: stalkD, ...pen(stalkW, look.stalk) }),
  );
  const racemes: string[] = [];
  for (let b = 0; b < n; b++) {
    const f = n === 1 ? 0 : b / (n - 1) - 0.5;
    const bx = x + f * spread + (rnd() - 0.5) * h * 0.04;
    const rise = h * (0.08 + rnd() * 0.06) + (1 - Math.abs(f) * 2) * h * 0.06;
    const by = forkY - rise;
    const branch = `M${r2(x)} ${r2(forkY + 2)}Q${r2(bx)} ${r2(forkY + 1)} ${r2(bx)} ${r2(by)}`;
    parts.push(
      el('path', { d: branch, ...pen(stalkW * 0.82 + 1, shade(look.stalk, -0.35)) }),
      el('path', { d: branch, ...pen(stalkW * 0.82, look.stalk) }),
      // Bracts' scars up the bare stalk.
      el('path', {
        d: `M${r2(bx - stalkW * 0.4)} ${r2(by + rise * 0.4)}l${r2(stalkW * 0.8)} -1`,
        ...pen(0.6, shade(look.stalk, -0.3)),
      }),
    );
    const rh = (by - (y - h)) * (0.86 + rnd() * 0.14);
    racemes.push(raceme(rnd, bx, by, rh, f * 0.06, look));
  }
  return g({}, ...parts, ...racemes);
}

/** One bitter aloe: stem and skirt, rosette, candelabra. */
export function aloeFerox(rnd: Rnd, p: AloePlant, look: AloeLook): string {
  const { x, y, s, stem, racemes, bloomH, turn } = p;
  const heart: Pt = [x, y - stem - s * 0.05];
  const parts: string[] = [];
  // Stem, then the skirt of dry old leaves hanging round it (back ones darker).
  if (stem > 0) {
    const sw = s * 0.16;
    parts.push(
      el('path', {
        d: `M${r2(x - sw)} ${r2(y + 2)}L${r2(x - sw * 0.85)} ${r2(heart[1])}L${r2(x + sw * 0.85)} ${r2(heart[1])}L${r2(x + sw)} ${r2(y + 2)}Z`,
        fill: look.dry[0],
      }),
    );
    const rows = Math.max(1, Math.round(stem / (s * 0.22)));
    for (let row = 0; row < rows; row++) {
      const ty = heart[1] + s * 0.1 + (row / rows) * stem * 0.85;
      const k = 9;
      for (let j = 0; j < k; j++) {
        const f = j / (k - 1) - 0.5;
        const tone = look.dry[(j + row) % 3] ?? look.dry[1];
        parts.push(
          dryLeaf(
            [x + f * s * 0.42, ty],
            f * 40 + (rnd() - 0.5) * 14,
            Math.min(s * (0.42 + rnd() * 0.16), y - ty + s * 0.12),
            s * 0.1,
            row === rows - 1 ? tone : shade(tone, -0.08 * (rows - row)),
            look,
          ),
        );
      }
    }
  }
  const w = s * 0.22;
  const tw = turn * 9;
  const L = (deg: number, len: number, bend: number, face: number, dy = 0, wk = 1): string => {
    const a = deg + tw + (rnd() - 0.5) * 7;
    // Light from the upper left: leaves on the left are lit, those on the right in shade.
    const lit = -Math.sin(rad(a)) * 0.1 - (Math.abs(a) > 90 ? 0.06 : 0);
    return leaf(
      [heart[0] + Math.sin(rad(a)) * s * 0.05, heart[1] + dy],
      a,
      s * len * (0.92 + rnd() * 0.16),
      w * wk,
      bend,
      face,
      look,
      lit,
      rnd,
    );
  };
  // Lowest leaves first: old, decurved, half dry (the skirt's newest members).
  for (const a of [-128, 124]) parts.push(L(a, 0.78, 22, 0.15, s * 0.1, 0.9));
  for (const a of [-104, 100]) parts.push(L(a, 0.92, 26, 0.3, s * 0.06));
  // The heart: ascending inner leaves (their upper faces toward us, in the rosette's shade).
  for (const a of [-40, -20, 0, 18, 38]) parts.push(L(a, 0.78, 10, 0.85, -s * 0.02, 0.86));
  if (racemes > 0) parts.push(candelabra(rnd, heart[0], heart[1] - s * 0.2, racemes, bloomH, look));
  // Spreading leaves, tips arching out and down.
  for (const a of [-80, -62, 60, 78]) parts.push(L(a, 1, 24, 0.55));
  // Front leaves toward the viewer: shorter (foreshortened), wider, upper faces lit.
  for (const a of [-46, -18, 14, 44]) parts.push(L(a, 0.6, 16, 0.9, s * 0.1, 1.15));
  return g({}, ...parts);
}
