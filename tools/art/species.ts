// v1.6 veld art pass (D-042): the biomes' tree species, each drawn with the plant kit
// (flora.ts) in its real colours, hazed per plane by `p.tint`. The foot of every tree is at
// (x, foot) and `h` is its height. `detail` picks how much is drawn: far trees are a few clumps
// and plain limbs, mid and near ones carry leaf dabs, bark texture, fruit, pods and flowers.
//
// Species (art bible §4.2, decision log "Biome-accurate flora/fauna"):
//   Karoo     sweet thorn (Vachellia karroo): white paired thorns, yellow pompoms, sickle pods
//   Bushveld  baobab (Adansonia digitata): bare in winter, velvety pods on long stalks
//             mopane (Colophospermum mopane): butterfly leaves, olive and copper in winter
//             marula (Sclerocarya birrea): grey flaky bark, thin winter crown, yellow fruit down
//   Okavango  jackalberry (Diospyros mespiliformis): dense dark crown, small fruit
//             sausage tree (Kigelia africana): hanging sausage fruit, maroon flowers
//             ilala palm (Hyphaene petersiana): fan leaves, clusters of brown fruit
//   Kalahari  shepherd's tree (Boscia albitrunca): pale trunk, dense grey-green dome
import {
  blurFilter,
  clamp,
  limbSilhouette,
  ringNoise,
  soften,
  taper,
  zigzag,
  type Limb,
} from './camelthorn';
import {
  clumpMasses,
  fallenFruit,
  growTree,
  hangingFruit,
  hangingPods,
  leafMass,
  plantLook,
  pompoms,
  roundFruit,
  smoothLimb,
  thorns,
  treeSvg,
  type Detail,
  type PlantLook,
  type TreeParts,
} from './flora';
import { mix, nextId, shade, type Pen, type Pt, type Rnd } from './scenery';
import { el, ellipseD, g, polyD, r2 } from './svg';

/** What a species needs from the layer it stands on. */
export interface Paint {
  readonly tint: (hex: string) => string;
  readonly pen: Pen;
}

const look = (p: Paint, leaf: string, bark: string, sun?: string): PlantLook =>
  plantLook({
    leaf: p.tint(leaf),
    bark: p.tint(bark),
    ink: p.pen.ink,
    ...(sun === undefined ? {} : { sun: p.tint(sun) }),
  });

/** Dab length and density for a tree of height h (≈ the camelthorn's at its size). */
function dabsFor(h: number): { dab: number; density: number } {
  const dab = clamp(h / 105, 0.9, 3.4);
  return { dab, density: 0.8 / dab };
}

const clumpsFor = (detail: Detail, near: number): number =>
  detail === 'far' ? Math.max(6, Math.round(near * 0.35)) : detail === 'mid' ? near : near;

// --- Karoo ---------------------------------------------------------------------------------

/** Sweet thorn (soetdoring): a rounded, irregular feathery crown on a forked dark trunk. */
export function sweetThorn(
  rnd: Rnd,
  x: number,
  foot: number,
  h: number,
  p: Paint,
  detail: Detail,
): string {
  const lk = look(p, '#66793F', '#4E3A2E', '#E8E0A0');
  const t = growTree(
    rnd,
    {
      x,
      foot,
      h,
      w: h * (0.5 + rnd() * 0.12),
      depth: 0.52,
      crown: 'irregular',
      trunkW: Math.max(1.5, h * 0.07),
      fork: 0.28 + rnd() * 0.08,
      limbs: 3 + Math.floor(rnd() * 2),
      lean: (rnd() - 0.5) * h * 0.08,
      leaf: 'feather',
      ...dabsFor(h),
      clumps: clumpsFor(detail, 30),
      bark: 'furrowed',
      detail,
    },
    lk,
  );
  const flowers = p.tint('#F6D23E');
  if (detail === 'far')
    return treeSvg(t, '', pompoms(rnd, t, Math.round(h / 9), Math.max(0.7, h * 0.012), flowers));
  return treeSvg(
    t,
    h > 110 ? thorns(rnd, t, p.tint('#F2EEE2'), h * 0.022) : '',
    pompoms(rnd, t, Math.round(h / 7), Math.max(0.8, h * 0.0085), flowers) +
      hangingPods(rnd, t, Math.round(h / 22), h * 0.08, p.tint('#A0703E')),
  );
}

// --- Bushveld ------------------------------------------------------------------------------

/** Mopane in winter: a narrow, upright crown of butterfly leaves, olive turning copper. */
export function mopane(
  rnd: Rnd,
  x: number,
  foot: number,
  h: number,
  p: Paint,
  detail: Detail,
  copper = 0.45,
): string {
  const lk = look(p, mix('#7E8240', '#B0763C', copper * 0.4), '#4F4842', '#E6D8A0');
  const cu = look(p, '#B5743A', '#4F4842', '#F0C890');
  const { dab, density } = dabsFor(h);
  const t = growTree(
    rnd,
    {
      x,
      foot,
      h,
      w: h * (0.34 + rnd() * 0.1),
      depth: 0.6,
      crown: rnd() < 0.5 ? 'vase' : 'irregular',
      trunkW: Math.max(1.4, h * 0.06),
      fork: 0.3,
      limbs: 3,
      lean: (rnd() - 0.5) * h * 0.06,
      leaf: 'butterfly',
      dab: dab * 1.2,
      density: density * 0.85,
      clumps: clumpsFor(detail, 40),
      bark: 'furrowed',
      detail,
    },
    lk,
  );
  // A share of the clumps turned copper: drawn over the front in the copper look.
  const turned = t.clumps.filter((c) => c.depth >= 0.42 && rnd() < copper);
  const over =
    detail === 'far'
      ? clumpMasses(turned, cu, rnd)
      : leafMass(rnd, turned, cu, density * 0.9, dab * 1.2, 'butterfly');
  return treeSvg(t, '', over);
}

/** Marula in winter: grey flaky bark, a spreading half-bare crown, yellow fruit on the ground. */
export function marula(
  rnd: Rnd,
  x: number,
  foot: number,
  h: number,
  p: Paint,
  detail: Detail,
): string {
  const lk = look(p, '#6E8648', '#8A817A', '#E2E0B0');
  const t = growTree(
    rnd,
    {
      x,
      foot,
      h,
      w: h * (0.58 + rnd() * 0.1),
      depth: 0.48,
      crown: 'spread',
      trunkW: Math.max(1.6, h * 0.085),
      fork: 0.36,
      limbs: 4,
      lean: (rnd() - 0.5) * h * 0.06,
      leaf: 'leafy',
      ...dabsFor(h),
      clumps: clumpsFor(detail, 26),
      bark: 'flaky',
      bare: 0.4,
      detail,
    },
    lk,
  );
  if (detail === 'far') return treeSvg(t);
  return treeSvg(
    t,
    '',
    fallenFruit(
      rnd,
      x,
      foot,
      h * 0.4,
      Math.round(h / 10),
      Math.max(1, h * 0.014),
      p.tint('#E6C23A'),
    ),
  );
}

// --- Okavango ------------------------------------------------------------------------------

/** Jackalberry: a tall, dense, dark evergreen crown on a rough dark trunk; small fruit. */
export function jackalberry(
  rnd: Rnd,
  x: number,
  foot: number,
  h: number,
  p: Paint,
  detail: Detail,
): string {
  const lk = look(p, '#3E6A34', '#3C3530', '#C8D890');
  const t = growTree(
    rnd,
    {
      x,
      foot,
      h,
      w: h * (0.36 + rnd() * 0.08),
      depth: 0.72,
      crown: 'oval',
      trunkW: Math.max(1.6, h * 0.07),
      fork: 0.24,
      limbs: 4,
      lean: (rnd() - 0.5) * h * 0.05,
      leaf: 'leafy',
      ...dabsFor(h),
      clumps: clumpsFor(detail, 40),
      bark: 'furrowed',
      detail,
    },
    lk,
  );
  if (detail !== 'near') return treeSvg(t);
  const fruit: string[] = [];
  const front = t.clumps.filter((c) => c.depth > 0.5);
  for (let k = 0; k < Math.round(h / 14) && front.length > 0; k++) {
    const c = front[Math.floor(rnd() * front.length)];
    if (c === undefined) continue;
    fruit.push(
      roundFruit(
        c.x + (rnd() - 0.5) * c.rx,
        c.y + c.ry * (0.2 + rnd() * 0.5),
        Math.max(0.8, h * 0.008),
        p.tint('#D9A43A'),
      ),
    );
  }
  return treeSvg(t, '', g({}, ...fruit));
}

/** Sausage tree: a broad round crown, smooth grey-brown bark, sausage fruit on long stalks. */
export function sausageTree(
  rnd: Rnd,
  x: number,
  foot: number,
  h: number,
  p: Paint,
  detail: Detail,
  fruits?: number,
): TreeParts & { svg: string } {
  const lk = look(p, '#4F7A38', '#7A6E62', '#D8E0A0');
  const t = growTree(
    rnd,
    {
      x,
      foot,
      h,
      w: h * 0.62,
      depth: 0.5,
      crown: 'round',
      trunkW: Math.max(1.8, h * 0.1),
      fork: 0.38,
      limbs: 4,
      leaf: 'leafy',
      ...dabsFor(h),
      clumps: clumpsFor(detail, 38),
      bark: 'smooth',
      detail,
    },
    lk,
  );
  const n = fruits ?? Math.round(h / 20);
  const fruit = hangingFruit(
    rnd,
    t,
    n,
    [h * 0.06, h * 0.2],
    h * 0.13,
    Math.max(1.4, h * 0.028),
    { fill: p.tint('#8C7A60'), lit: p.tint('#B8A888'), dark: p.tint('#5E5040') },
    p.pen.ink,
  );
  const flowers =
    detail === 'far'
      ? ''
      : pompoms(rnd, t, Math.round(h / 22), Math.max(0.8, h * 0.008), p.tint('#5E1A2A'));
  return { ...t, svg: treeSvg(t, '', flowers + fruit) };
}

// --- Kalahari ------------------------------------------------------------------------------

/** Shepherd's tree (witgat): a pale smooth trunk and a dense grey-green dome, browsed flat below. */
export function shepherdsTree(
  rnd: Rnd,
  x: number,
  foot: number,
  h: number,
  p: Paint,
  detail: Detail,
): string {
  const lk = look(p, '#7C8C5E', '#D6CFC0', '#ECEAC8');
  const t = growTree(
    rnd,
    {
      x,
      foot,
      h,
      w: h * (0.5 + rnd() * 0.1),
      depth: 0.62,
      crown: 'round',
      trunkW: Math.max(1.6, h * 0.085),
      fork: 0.26,
      limbs: 4,
      lean: (rnd() - 0.5) * h * 0.05,
      leaf: 'leafy',
      dab: dabsFor(h).dab * 0.8,
      density: dabsFor(h).density * 1.2,
      clumps: clumpsFor(detail, 60),
      bark: 'smooth',
      detail,
    },
    lk,
  );
  return treeSvg(t);
}

// --- the baobab ----------------------------------------------------------------------------

export interface BaobabOpts {
  /** Extra limbs that must end at these points (content perches), from the trunk top. */
  readonly reach?: readonly Pt[];
  /** Pods hanging at these points (centre of the pod): a stalk up to the nearest limb. */
  readonly pods?: readonly { x: number; y: number; rx: number; ry: number }[];
  /** Random pods besides those. */
  readonly extraPods?: number;
  /** Trunk girth × (default 1). */
  readonly girth?: number;
}

/**
 * The baobab in winter: a massive smooth grey trunk (lit left, shade right, long vertical folds
 * and soft wrinkles), a few thick limbs splaying up like roots into crooked branches and twigs,
 * no leaves, velvety grey-green pods hanging on long stalks.
 */
export function baobab(
  rnd: Rnd,
  x: number,
  foot: number,
  h: number,
  p: Paint,
  detail: Detail,
  o: BaobabOpts = {},
): string {
  const bark = p.tint('#948579');
  const lk = plantLook({ leaf: p.tint('#7A8048'), bark, ink: p.pen.ink });
  const trunkH = h * 0.58;
  const top = foot - trunkH;
  const wBase = h * 0.25 * (o.girth ?? 1);
  const wTop = h * 0.2 * (o.girth ?? 1);
  const n = ringNoise(rnd, 2, 6, 1);
  // Trunk outline: bulging, wider at the foot, a flared root base.
  const left: Pt[] = [];
  const right: Pt[] = [];
  const steps = detail === 'far' ? 6 : 14;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const y = foot - trunkH * f;
    const neck = f > 0.82 ? (f - 0.82) / 0.18 : 0;
    const half =
      (wBase + (wTop - wBase) * Math.pow(f, 0.9)) * (1 - neck * neck * 0.45) +
      (f < 0.12 ? (0.12 - f) * h * 0.5 : 0);
    left.push([x - half * (1 + n(f * 4) * 0.05), y]);
    right.push([x + half * (1 + n(f * 4 + 2) * 0.05), y]);
  }
  // A rounded shoulder over the neck, where the limbs leave the trunk.
  const sideL = left.slice(0, -2);
  const sideR = right.slice(0, -2);
  const outline = polyD([
    ...left,
    [x - wTop * 0.3, top - h * 0.035],
    [x + wTop * 0.3, top - h * 0.04],
    ...right.reverse(),
  ]);
  // Limbs: thick, short, splaying up and out, then crooked branches and twigs.
  const limbs: Limb[] = [];
  const tips: Pt[] = [];
  const wantTips: Pt[] = [...(o.reach ?? [])];
  const nMain = detail === 'far' ? 4 : 6;
  for (let k = 0; k < nMain; k++) {
    const f = k / (nMain - 1) - 0.5;
    wantTips.push([
      x + f * h * 0.95 + (rnd() - 0.5) * h * 0.08,
      foot - h * (0.86 + (0.5 - Math.abs(f)) * 0.22 + rnd() * 0.06),
    ]);
  }
  for (const tip of wantTips) {
    const sx = clamp(tip[0], x - wTop * 0.8, x + wTop * 0.8);
    const start: Pt = [sx * 0.6 + x * 0.4, top + h * 0.06];
    const midP: Pt = [start[0] + (tip[0] - start[0]) * 0.45, start[1] + (tip[1] - start[1]) * 0.55];
    const pts = soften([start, ...zigzag(rnd, midP, tip, detail === 'far' ? 0 : 1, 0.1)]);
    const w0 = h * (0.09 + rnd() * 0.025);
    limbs.push({ pts, w: taper(pts, w0, Math.max(1, w0 * 0.2)) });
    tips.push(tip);
    // Two or three crooked branches (one far away) off each limb's outer half.
    for (let b = 0; b < (detail === 'far' ? 1 : 2 + Math.floor(rnd() * 2)); b++) {
      const i = Math.floor(pts.length * (0.5 + rnd() * 0.4));
      const q = pts[i] as Pt;
      const ang = -Math.PI / 2 + (rnd() - 0.5) * 2.2;
      const len = h * (0.08 + rnd() * 0.1);
      const end: Pt = [q[0] + Math.cos(ang) * len * 1.3, q[1] + Math.sin(ang) * len];
      const bp = zigzag(rnd, q, end, 1, 0.2);
      const bw = Math.max(1, w0 * 0.35);
      limbs.push({ pts: bp, w: taper(bp, bw, bw * 0.25) });
      tips.push(end);
    }
  }
  const twigs: string[] = [];
  if (detail !== 'far')
    for (const t of tips)
      for (let k = 0; k < 4; k++) {
        const ang = -Math.PI / 2 + (rnd() - 0.5) * 2.6;
        const len = h * (0.03 + rnd() * 0.05);
        twigs.push(
          polyD(
            zigzag(rnd, t, [t[0] + Math.cos(ang) * len * 1.3, t[1] + Math.sin(ang) * len], 1, 0.25),
            false,
          ),
        );
      }
  const parts: string[] = [];
  const blur = blurFilter(Math.max(0.8, h * 0.012));
  parts.push(
    blur.def,
    g(
      { filter: `url(#${blur.id})` },
      el('path', {
        d: ellipseD(x + h * 0.06, foot + 1, h * 0.42, Math.max(2, h * 0.04)),
        fill: '#2A1A14',
        opacity: 0.3,
      }),
    ),
  );
  parts.push(
    el('path', {
      d: twigs.join(''),
      fill: 'none',
      stroke: shade(bark, -0.2),
      'stroke-width': clamp(h * 0.004, 0.5, 1.4),
      'stroke-linecap': 'round',
    }),
    limbSilhouette(limbs, lk),
    ...[...limbs]
      .sort((a, b) => (b.w[0] ?? 0) - (a.w[0] ?? 0))
      .map((l) => smoothLimb(rnd, l, lk, 'smooth')),
  );
  // The trunk over the limb bases.
  const id = nextId();
  const ink = mix(p.pen.ink, bark, 0.3);
  parts.push(
    el('path', { d: outline, fill: bark }),
    // Ink down the sides only: the limbs grow out of the trunk's top without a seam.
    el('path', {
      d: polyD(sideL, false) + polyD(sideR, false),
      fill: 'none',
      stroke: ink,
      'stroke-width': clamp(h * 0.008, 0.6, 3),
      'stroke-linecap': 'round',
    }),
    el('clipPath', { id }, el('path', { d: outline })),
  );
  const inner: string[] = [
    // Shade side (right), core shadow, lit side (left).
    el('path', {
      d: ellipseD(x + wBase * 0.75, foot - trunkH * 0.5, wBase * 0.7, trunkH * 0.75),
      fill: shade(bark, -0.3),
      opacity: 0.85,
    }),
    el('path', {
      d: ellipseD(x + wBase * 1.05, foot - trunkH * 0.5, wBase * 0.35, trunkH * 0.75),
      fill: shade(bark, -0.45),
      opacity: 0.7,
    }),
    el('path', {
      d: ellipseD(x - wBase * 0.6, foot - trunkH * 0.55, wBase * 0.35, trunkH * 0.6),
      fill: shade(bark, 0.26),
      opacity: 0.85,
    }),
  ];
  if (detail !== 'far') {
    // Long vertical folds and soft horizontal wrinkles; a few old scars.
    const folds: string[] = [];
    for (let k = 0; k < 5; k++) {
      const fx = x + (k / 4 - 0.5) * wBase * 1.5 + (rnd() - 0.5) * wBase * 0.25;
      folds.push(
        `M${r2(fx)} ${r2(foot + 2)}C${r2(fx + (rnd() - 0.5) * wBase * 0.2)} ${r2(foot - trunkH * 0.4)} ${r2(fx * 0.9 + x * 0.1)} ${r2(foot - trunkH * 0.7)} ${r2(x + (fx - x) * 0.7)} ${r2(top - 4)}`,
      );
    }
    const wrinkles: string[] = [];
    for (let k = 0; k < Math.round(h / 8); k++) {
      const wy = foot - rnd() * trunkH;
      const wx = x + (rnd() - 0.5) * wBase * 1.6;
      const wl = wBase * (0.08 + rnd() * 0.15);
      wrinkles.push(`M${r2(wx - wl)} ${r2(wy)}q${r2(wl)} ${r2(wl * 0.25)} ${r2(wl * 2)} 0`);
    }
    inner.push(
      el('path', {
        d: folds.join(''),
        fill: 'none',
        stroke: shade(bark, -0.3),
        'stroke-width': clamp(h * 0.005, 0.6, 2),
        opacity: 0.55,
      }),
      el('path', {
        d: folds.join(''),
        fill: 'none',
        stroke: shade(bark, 0.3),
        'stroke-width': clamp(h * 0.0025, 0.4, 1),
        opacity: 0.6,
        transform: `translate(${r2(-h * 0.006)} 0)`,
      }),
      el('path', {
        d: wrinkles.join(''),
        fill: 'none',
        stroke: shade(bark, -0.25),
        'stroke-width': clamp(h * 0.003, 0.4, 1.2),
        opacity: 0.75,
      }),
    );
  }
  parts.push(g({ 'clip-path': `url(#${id})` }, ...inner));
  // Pods: velvety grey-green ovals on long thin stalks.
  const podC = p.tint('#9C9A7C');
  const pod = (px: number, py: number, rx: number, ry: number): string => {
    // Stalk up to the nearest branch point above.
    let best: Pt = [px, py - ry * 3];
    let dist = Infinity;
    for (const l of limbs)
      for (const q of l.pts)
        if (q[1] < py - ry && Math.abs(q[0] - px) < h * 0.12) {
          const d = Math.hypot(q[0] - px, q[1] - py);
          if (d < dist) {
            dist = d;
            best = q;
          }
        }
    return g(
      {},
      el('path', {
        d: `M${r2(best[0])} ${r2(best[1])}Q${r2((best[0] + px) / 2 + 2)} ${r2((best[1] + py) / 2)} ${r2(px)} ${r2(py - ry)}`,
        fill: 'none',
        stroke: shade(podC, -0.45),
        'stroke-width': clamp(rx * 0.12, 0.6, 2.5),
      }),
      el('path', {
        d: ellipseD(px, py, rx, ry),
        fill: podC,
        stroke: ink,
        'stroke-width': clamp(rx * 0.12, 0.6, 2.5),
      }),
      el('path', {
        d: ellipseD(px + rx * 0.3, py + ry * 0.2, rx * 0.6, ry * 0.75),
        fill: shade(podC, -0.25),
        opacity: 0.8,
      }),
      el('path', {
        d: ellipseD(px - rx * 0.35, py - ry * 0.35, rx * 0.35, ry * 0.4),
        fill: shade(podC, 0.35),
        opacity: 0.85,
      }),
    );
  };
  for (const q of o.pods ?? []) parts.push(pod(q.x, q.y, q.rx, q.ry));
  if (detail !== 'far')
    for (let k = 0; k < (o.extraPods ?? 4); k++) {
      const t = tips[Math.floor(rnd() * tips.length)];
      if (t === undefined) continue;
      const r = Math.max(1.2, h * 0.022);
      parts.push(pod(t[0] + (rnd() - 0.5) * 6, t[1] + h * (0.08 + rnd() * 0.08), r, r * 1.5));
    }
  return g({}, ...parts);
}

// --- the ilala palm ------------------------------------------------------------------------

/**
 * Ilala palm: one or two slender ringed trunks (sometimes branching), each crowned by a round
 * head of stiff, folded fan leaves (lit upper left, old leaves hanging brown below), with
 * clusters of glossy brown fruit hanging under the head.
 */
export function ilalaPalm(
  rnd: Rnd,
  x: number,
  foot: number,
  h: number,
  p: Paint,
  detail: Detail,
): string {
  const trunk = p.tint('#7A6656');
  const frond = p.tint('#6E9A48');
  const ink = mix(p.pen.ink, frond, 0.35);
  const parts: string[] = [];
  const blur = blurFilter(Math.max(0.6, h * 0.01));
  parts.push(
    blur.def,
    g(
      { filter: `url(#${blur.id})` },
      el('path', {
        d: ellipseD(x + h * 0.05, foot + 1, h * 0.22, Math.max(1.5, h * 0.03)),
        fill: '#2A1A14',
        opacity: 0.28,
      }),
    ),
  );
  const stems = h > 60 && rnd() < 0.5 ? 2 : 1;
  for (let s = 0; s < stems; s++) {
    const hh = h * (s === 0 ? 1 : 0.72);
    const lean = (rnd() - 0.5) * hh * 0.3 + (s === 1 ? hh * 0.18 : 0);
    const tx = x + lean;
    const ty = foot - hh;
    const tw = Math.max(1.2, hh * 0.035);
    const d = `M${r2(x)} ${r2(foot)}Q${r2(x + lean * 0.1)} ${r2(foot - hh * 0.55)} ${r2(tx)} ${r2(ty)}`;
    parts.push(
      el('path', {
        d,
        fill: 'none',
        stroke: ink,
        'stroke-width': tw + clamp(tw * 0.3, 0.6, 2),
        'stroke-linecap': 'round',
      }),
      el('path', { d, fill: 'none', stroke: trunk, 'stroke-width': tw, 'stroke-linecap': 'round' }),
    );
    if (detail !== 'far') {
      // Leaf-base rings and a lit edge.
      const rings: string[] = [];
      for (let k = 1; k < 14; k++) {
        const f = k / 14;
        const rx = x + lean * f * f * 0.9 + lean * 0.1 * f;
        const ry = foot - hh * f;
        rings.push(`M${r2(rx - tw * 0.45)} ${r2(ry)}l${r2(tw * 0.9)} ${r2(tw * 0.15)}`);
      }
      parts.push(
        el('path', {
          d: rings.join(''),
          fill: 'none',
          stroke: shade(trunk, -0.35),
          'stroke-width': Math.max(0.5, tw * 0.18),
        }),
        el('path', {
          d,
          fill: 'none',
          stroke: shade(trunk, 0.3),
          'stroke-width': Math.max(0.4, tw * 0.25),
          transform: `translate(${r2(-tw * 0.25)} 0)`,
        }),
      );
    }
    // The head: fan leaves radiating round (tx, ty); dead brown leaves hang below.
    const R = hh * 0.24;
    const leaves: { a: number; r: number; dead: boolean }[] = [];
    const nl = detail === 'far' ? 10 : 20;
    for (let k = 0; k < nl; k++) {
      const a = Math.PI * (0.7 + (k / (nl - 1)) * 1.6) + (rnd() - 0.5) * 0.2;
      leaves.push({ a, r: R * (0.8 + rnd() * 0.35), dead: false });
    }
    for (let k = 0; k < (detail === 'far' ? 2 : 4); k++)
      leaves.push({ a: Math.PI * (0.25 + rnd() * 0.5), r: R * (0.6 + rnd() * 0.2), dead: true });
    // Back leaves (upper) first, the hanging ones last.
    leaves.sort((a, b) => Math.sin(a.a) - Math.sin(b.a));
    for (const lf of leaves) {
      const mx = tx + Math.cos(lf.a) * lf.r * 0.35;
      const my = ty + Math.sin(lf.a) * lf.r * 0.3;
      // A fan: a wedge opening from the stalk's end, ribbed.
      const spread = 0.7;
      const fanPts: Pt[] = [[mx, my]];
      const segs = detail === 'far' ? 3 : 7;
      for (let i = 0; i <= segs; i++) {
        const aa = lf.a - spread / 2 + (spread * i) / segs;
        const rr = lf.r * (i % 2 === 0 ? 1 : 0.86);
        fanPts.push([mx + Math.cos(aa) * rr * 0.75, my + Math.sin(aa) * rr * 0.62]);
      }
      const lit = Math.cos(lf.a) < 0 && Math.sin(lf.a) < 0;
      const fill = lf.dead
        ? p.tint('#9A7A4E')
        : lit
          ? shade(frond, 0.12)
          : Math.sin(lf.a) > -0.3
            ? shade(frond, -0.22)
            : frond;
      parts.push(
        el('path', {
          d: `M${r2(tx)} ${r2(ty)}L${r2(mx)} ${r2(my)}`,
          fill: 'none',
          stroke: shade(fill, -0.3),
          'stroke-width': Math.max(0.5, tw * 0.25),
        }),
        el('path', {
          d: polyD(fanPts),
          fill,
          stroke: ink,
          'stroke-width': clamp(R * 0.025, 0.4, 1.4),
          'stroke-linejoin': 'round',
        }),
      );
      if (detail !== 'far') {
        const ribs: string[] = [];
        for (let i = 1; i < fanPts.length - 1; i += 1) {
          const q = fanPts[i] as Pt;
          ribs.push(`M${r2(mx)} ${r2(my)}L${r2(q[0])} ${r2(q[1])}`);
        }
        parts.push(
          el('path', {
            d: ribs.join(''),
            fill: 'none',
            stroke: shade(fill, lit ? 0.3 : -0.25),
            'stroke-width': clamp(R * 0.015, 0.4, 1),
            opacity: 0.8,
          }),
        );
      }
    }
    if (detail !== 'far') {
      // Fruit clusters hanging under the head on a bent stalk.
      for (let c = 0; c < 1 + Math.floor(rnd() * 2); c++) {
        const cx = tx + (rnd() - 0.5) * R * 0.6;
        const cy = ty + R * (0.35 + rnd() * 0.15);
        parts.push(
          el('path', {
            d: `M${r2(tx)} ${r2(ty + 2)}Q${r2(cx)} ${r2(ty)} ${r2(cx)} ${r2(cy)}`,
            fill: 'none',
            stroke: p.tint('#6A4A2A'),
            'stroke-width': Math.max(0.5, tw * 0.25),
          }),
        );
        for (let k = 0; k < 7; k++)
          parts.push(
            roundFruit(
              cx + (rnd() - 0.5) * R * 0.22,
              cy + rnd() * R * 0.3,
              Math.max(0.8, R * 0.06),
              p.tint('#7A4A2A'),
            ),
          );
      }
    }
  }
  return g({}, ...parts);
}
