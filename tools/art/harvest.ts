// v1.8c (D-063, art bible §5.4) Die Oes: the Harvest sheet's interim art at the v1.6/v1.7 bar
// (D-035 semi-realistic, review round 1): the warthogs drawn from a posed skeleton like the baboons
// (tools/art/baboons.ts) — the big flat head with its warts and two curved upper tusks, the long
// mane of bristles along the neck and back, the thin tail held straight up with its tuft when it
// trots or runs, short legs with knees; grey-brown skin with a lit back, a shaded belly, sparse
// bristles and dried mud on the legs; digging KNEELING on its front knees with the snout in the
// soil, the warthog's typical feeding pose; a roll onto its back when bagged, no blood. Piglets:
// small and round, the same snout, faint stripes. The three farm workers as semi-realistic people
// (respectful and cheerful): shaded faces with features, overalls with seams, pockets and folds,
// sleeves rolled up, hands with a thumb, boots with soles; different builds and ages — a woman with
// a headscarf under a wide straw hat and a hammer, an older man with a grey beard and a cap
// twisting wire with pliers, a young man in a bucket hat setting a post. No ink: edges a shade
// darker than the part, layered gradients, light from the upper left, a soft contact shadow.
// Plus the fence's gap panel (its posts and wires match the mid layer's fence) and the "OES" sign.
// Frames face right with the feet at the origin; sizes from src/game/view/harvest/harvestSheet.ts.
// Pure: frame → SVG.
import {
  FENCE_GAP_W,
  FENCE_POST_H,
  HARVEST_SHEET_H,
  HARVEST_SHEET_W,
  harvestFrames,
  PIGLET_H,
  WARTHOG_H,
  WORKER_H,
  type HarvestFrame,
} from '../../src/game/view/harvest/harvestSheet';
import type { Rgba } from '../assets/image';
import { add, clipOf, limb as limbOutline, mul, nrm, sub, unit, type V } from './farFauna';
import { renderSvg } from './raster';
import { nextId, post, shade, tone, wire, type Pen, type Tone } from './scenery';
import { el, ellipseD, g, polyD, prng, r2, smoothD, svgDoc, type Attrs } from './svg';

type P = readonly [number, number];

const edge = (c: string): string => shade(c, -0.42);

/** A filled part with its edge a shade darker (no ink), line width in the part's units. */
function part(d: string, fill: string, w: number, extra: Attrs = {}): string {
  return el('path', {
    d,
    fill,
    stroke: edge(fill),
    'stroke-width': r2(w),
    'stroke-linejoin': 'round',
    ...extra,
  });
}

/** A vertical gradient (lit top → shaded bottom) over everything inside a clip. */
function washV(
  defs: string[],
  clip: { id: string },
  box: { x0: number; y0: number; x1: number; y1: number },
  stops: readonly (readonly [number, string, number])[],
): string {
  const id = nextId();
  defs.push(
    el(
      'linearGradient',
      { id, gradientUnits: 'userSpaceOnUse', x1: 0, y1: r2(box.y0), x2: 0, y2: r2(box.y1) },
      ...stops.map(([o, c, a]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a })),
    ),
  );
  return g(
    { 'clip-path': `url(#${clip.id})` },
    el('rect', {
      x: r2(box.x0),
      y: r2(box.y0),
      width: r2(box.x1 - box.x0),
      height: r2(box.y1 - box.y0),
      fill: `url(#${id})`,
    }),
  );
}

/** A horizontal light (lit left, shade right) over a clip: the upper-left light on a round form. */
function washH(
  defs: string[],
  clip: { id: string },
  box: { x0: number; y0: number; x1: number; y1: number },
  lit: string,
  dark: string,
): string {
  const id = nextId();
  defs.push(
    el(
      'linearGradient',
      { id, gradientUnits: 'userSpaceOnUse', x1: r2(box.x0), y1: 0, x2: r2(box.x1), y2: 0 },
      el('stop', { offset: 0, 'stop-color': lit, 'stop-opacity': 0.45 }),
      el('stop', { offset: 0.45, 'stop-color': lit, 'stop-opacity': 0 }),
      el('stop', { offset: 0.7, 'stop-color': dark, 'stop-opacity': 0 }),
      el('stop', { offset: 1, 'stop-color': dark, 'stop-opacity': 0.45 }),
    ),
  );
  return g(
    { 'clip-path': `url(#${clip.id})` },
    el('rect', {
      x: r2(box.x0),
      y: r2(box.y0),
      width: r2(box.x1 - box.x0),
      height: r2(box.y1 - box.y0),
      fill: `url(#${id})`,
    }),
  );
}

/** The box round some points (with a pad). */
function boxOf(pts: readonly P[], pad: number): { x0: number; y0: number; x1: number; y1: number } {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    x0: Math.min(...xs) - pad,
    y0: Math.min(...ys) - pad,
    x1: Math.max(...xs) + pad,
    y1: Math.max(...ys) + pad,
  };
}

/** A soft contact shadow under the feet (units). */
function shadow(x0: number, x1: number, h: number): string {
  const id = nextId();
  return (
    el(
      'radialGradient',
      { id },
      el('stop', { offset: 0, 'stop-color': '#2A1E14', 'stop-opacity': 0.42 }),
      el('stop', { offset: 1, 'stop-color': '#2A1E14', 'stop-opacity': 0 }),
    ) + el('path', { d: ellipseD((x0 + x1) / 2, 0, (x1 - x0) / 2, h), fill: `url(#${id})` })
  );
}

/** A tapering limb outline through joints with widths. */
const limbD = (joints: readonly P[], widths: readonly number[]): string =>
  limbOutline(
    joints.map((p, i) => ({
      p: [p[0], p[1]] as V,
      w: widths[Math.min(i, widths.length - 1)] ?? 0.05,
    })),
    0.8,
  );

// ---------------------------------------------------------------------------------------------
// Warthogs and piglets: drawn in units of the animal's height (1 = WARTHOG_H or PIGLET_H, feet to
// the top of the back), facing right.

interface Hide {
  readonly skin: string;
  readonly lit: string;
  readonly dark: string;
  readonly belly: string;
  readonly mane: string;
  readonly snout: string;
  readonly hoof: string;
  readonly mud: string;
  readonly tusk: string;
  readonly whisker: string;
}
const ADULT: Hide = {
  skin: '#7C7268',
  lit: '#A79D90',
  dark: '#4A423C',
  belly: '#665C54',
  mane: '#2E2722',
  snout: '#4F4540',
  hoof: '#2A2420',
  mud: '#6E5A44',
  tusk: '#EEE4CC',
  whisker: '#D8D0C0',
};
const PIGLET: Hide = {
  skin: '#9A8068',
  lit: '#C2AC90',
  dark: '#634F40',
  belly: '#86705C',
  mane: '#58463A',
  snout: '#6E5A4E',
  hoof: '#3A2E26',
  mud: '#7E6650',
  tusk: '#EEE4CC',
  whisker: '#E2D8C6',
};

interface HogPose {
  /** The torso's rump and shoulder ends and its depth. */
  readonly rear: V;
  readonly front: V;
  readonly thick: number;
  /** The nape and the snout disc's centre: the head lies between. */
  readonly nape: V;
  readonly snout: V;
  /** Far hind, far fore, near hind, near fore: joints from the body down to the hoof. */
  readonly legs: readonly [readonly P[], readonly P[], readonly P[], readonly P[]];
  readonly tail: readonly P[];
  /** Kneeling on the front knees (digging): soil at the snout. */
  readonly dig?: boolean;
  /** Eye shut (lying still). */
  readonly shut?: boolean;
}

/** A hind leg from the hip: hip → stifle → hock → hoof (the hoof at `foot`). */
function hind(hip: V, foot: V, k = 1): P[] {
  return [
    hip,
    [hip[0] + 0.07 * k, hip[1] + 0.17 * k],
    [foot[0] - 0.06 * k, foot[1] - 0.15 * k],
    foot,
  ];
}
/** A foreleg from the shoulder: shoulder → elbow → knee (carpus) → hoof. */
function fore(sh: V, foot: V, k = 1): P[] {
  return [
    sh,
    [sh[0] - 0.03 * k, sh[1] + 0.16 * k],
    [foot[0] + 0.015 * k, foot[1] - 0.13 * k],
    foot,
  ];
}

/** A gait frame: `phase` 0..1 round the stride (diagonal pairs move together). */
function gaitPose(phase: number, run: boolean, young: boolean): HogPose {
  const a = phase * Math.PI * 2;
  const stride = run ? 0.24 : 0.13;
  const lift = run ? 0.12 : 0.07;
  const bob = run ? -0.04 * Math.abs(Math.cos(a)) : -0.012 * Math.abs(Math.sin(a * 2));
  const L = young ? 0.72 : 1;
  const foot = (x: number, ph: number): V => [
    x + stride * Math.sin(ph),
    -Math.max(0, lift * Math.cos(ph)),
  ];
  const rear: V = [-0.5 * L, (young ? -0.6 : -0.6) + bob];
  const front: V = [0.3 * L, (young ? -0.62 : -0.62) + bob];
  const hipX = -0.44 * L;
  const shX = 0.24 * L;
  const k = young ? 1.05 : 1;
  const hipY = -0.5 + bob;
  const shY = -0.5 + bob;
  const tailSway = 0.03 * Math.sin(a);
  return {
    rear,
    front,
    thick: young ? 0.6 : 0.52,
    nape: [front[0] + 0.07, front[1] - 0.08],
    snout: run
      ? [front[0] + (young ? 0.36 : 0.52), front[1] + 0.16]
      : [front[0] + (young ? 0.34 : 0.48), front[1] + 0.26],
    legs: [
      hind([hipX - 0.02, hipY], foot(hipX - 0.06, a + Math.PI), k),
      fore([shX - 0.02, shY], foot(shX, a), k),
      hind([hipX + 0.03, hipY], foot(hipX - 0.02, a), k),
      fore([shX + 0.03, shY], foot(shX + 0.04, a + Math.PI), k),
    ],
    // The tail straight up like an aerial, the tuft at the top.
    tail: [
      [rear[0] - 0.05, rear[1] - 0.14],
      [rear[0] - 0.07 + tailSway * 0.4, rear[1] - 0.32],
      [rear[0] - 0.08 + tailSway, rear[1] - (young ? 0.42 : 0.5)],
    ],
  };
}

/** Kneeling on the front knees, the snout in the soil (the warthog's feeding pose). */
function digPose(shift: number): HogPose {
  const rear: V = [-0.48, -0.6];
  const front: V = [0.28, -0.42];
  return {
    rear,
    front,
    thick: 0.52,
    nape: [0.36, -0.46],
    snout: [0.7 + shift, -0.05],
    legs: [
      hind([-0.44, -0.53], [-0.5, 0]),
      // Kneeling: shoulder → elbow → the knee (carpus) on the ground → the hoof tucked back.
      [
        [0.2, -0.36],
        [0.14, -0.16],
        [0.3, -0.035],
        [0.17, -0.02],
      ],
      hind([-0.39, -0.53], [-0.4, 0]),
      [
        [0.26, -0.34],
        [0.22, -0.15],
        [0.38, -0.035],
        [0.25, -0.02],
      ],
    ],
    // The tail down and swishing.
    tail: [
      [rear[0] - 0.05, rear[1] - 0.1],
      [rear[0] - 0.13, rear[1] + 0.02],
      [rear[0] - 0.14 - shift * 0.6, rear[1] + 0.18],
    ],
    dig: true,
  };
}

/** Lying still on its side, the legs stretched out (no blood). */
function downPose(): HogPose {
  return {
    rear: [-0.5, -0.24],
    front: [0.3, -0.26],
    thick: 0.42,
    nape: [0.4, -0.3],
    snout: [0.92, -0.1],
    legs: [
      [
        [-0.42, -0.16],
        [-0.28, -0.12],
        [-0.12, -0.1],
        [0.0, -0.07],
      ],
      [
        [0.22, -0.18],
        [0.36, -0.14],
        [0.52, -0.1],
        [0.62, -0.06],
      ],
      [
        [-0.38, -0.12],
        [-0.22, -0.07],
        [-0.04, -0.05],
        [0.08, -0.03],
      ],
      [
        [0.27, -0.14],
        [0.42, -0.09],
        [0.58, -0.05],
        [0.7, -0.03],
      ],
    ],
    tail: [
      [-0.55, -0.24],
      [-0.7, -0.2],
      [-0.82, -0.12],
    ],
    shut: true,
  };
}

/** The torso: a barrel, the back slightly arched, the belly round, the rump rounded. */
function hogTorsoD(p: HogPose): string {
  const ax = unit(sub(p.front, p.rear));
  const n = nrm(ax);
  const t = p.thick / 2;
  const len = Math.hypot(p.front[0] - p.rear[0], p.front[1] - p.rear[1]);
  const at = (k: number, w: number): V => add(add(p.rear, mul(ax, k)), mul(n, -w));
  return smoothD(
    [
      add(p.rear, mul(ax, -t * 0.85)),
      at(len * 0.04, t * 0.92),
      at(len * 0.45, t * 1.0),
      at(len * 0.92, t * 1.06),
      add(p.front, mul(ax, t * 0.5)),
      at(len * 0.95, -t * 0.88),
      at(len * 0.5, -t * 1.0),
      at(len * 0.05, -t * 0.86),
    ],
    true,
    0.9,
  );
}

/** The head's outline from nape to snout: the big flat wedge of a warthog's face. */
function hogHead(p: HogPose, young: boolean): { d: string; at: (u: number, v: number) => V } {
  const d = unit(sub(p.snout, p.nape));
  const n = nrm(d);
  const L = Math.hypot(p.snout[0] - p.nape[0], p.snout[1] - p.nape[1]);
  const at = (u: number, v: number): V => add(add(p.nape, mul(d, u * L)), mul(n, v));
  const s = young ? 1.05 : 1.15;
  const outline = smoothD(
    [
      at(-0.12, -0.14 * s),
      at(0.22, -0.17 * s),
      at(0.62, -0.1 * s),
      at(0.94, -0.07 * s),
      at(1.04, -0.02 * s),
      at(1.03, 0.06 * s),
      at(0.86, 0.085 * s),
      at(0.55, 0.14 * s),
      at(0.25, 0.18 * s),
      at(-0.04, 0.15 * s),
    ],
    true,
    0.85,
  );
  return { d: outline, at };
}

export function drawHog(
  p: HogPose,
  hide: Hide,
  young: boolean,
  seed: number,
  w: number,
  ground = true,
): string {
  const rnd = prng(seed);
  const defs: string[] = [];
  const out: string[] = [];
  if (ground) out.push(p.shut === true ? shadow(-0.85, 1.0, 0.028) : shadow(-0.62, 0.8, 0.04));
  const far = shade(hide.skin, -0.2);
  const leg = (j: readonly P[], colour: string, fore: boolean): string[] => {
    const wd = fore ? [0.17, 0.1, 0.07, 0.06] : [0.22, 0.13, 0.075, 0.062];
    const shape = limbD(j, wd);
    const clip = clipOf([shape]);
    defs.push(clip.def);
    const box = boxOf(j, 0.1);
    const hoof = j[j.length - 1] ?? [0, 0];
    const knee = j[j.length - 2] ?? hoof;
    const dir = unit(sub(hoof, knee));
    const toe = add(hoof, mul(dir, 0.035));
    return [
      part(shape, colour, w),
      // Dried mud on the lower leg, dark toward the hoof.
      washV(defs, clip, box, [
        [0, hide.lit, 0],
        [0.55, hide.mud, 0],
        [0.8, hide.mud, 0.55],
        [1, hide.hoof, 0.6],
      ]),
      part(
        polyD([
          [hoof[0] - 0.035, hoof[1] - 0.005],
          [toe[0] + 0.02, toe[1] - 0.012],
          [toe[0] + 0.025, hoof[1] + 0.004],
          [hoof[0] - 0.03, hoof[1] + 0.004],
        ]),
        hide.hoof,
        w,
      ),
    ];
  };
  // Far legs, the tail, the torso, near legs, the head.
  out.push(...leg(p.legs[0], far, false), ...leg(p.legs[1], far, true));
  const tail = p.tail;
  out.push(part(limbD(tail, [0.03, 0.022, 0.016]), hide.dark, w * 0.7));
  const tip = tail[tail.length - 1] ?? [0, 0];
  const tdir = unit(sub(tip, tail[tail.length - 2] ?? tip));
  // The tuft: dark hairs fanning off the tip.
  const tuft: string[] = [];
  for (let i = 0; i < 7; i++) {
    const a = Math.atan2(tdir[1], tdir[0]) + (i - 3) * 0.16;
    const l = 0.07 + rnd() * 0.04;
    tuft.push(
      `M${r2(tip[0] - tdir[0] * 0.03)} ${r2(tip[1] - tdir[1] * 0.03)}l${r2(Math.cos(a) * l)} ${r2(Math.sin(a) * l)}`,
    );
  }
  out.push(
    el('path', {
      d: tuft.join(''),
      stroke: hide.mane,
      'stroke-width': 0.022,
      'stroke-linecap': 'round',
      fill: 'none',
    }),
  );
  const torso = hogTorsoD(p);
  const tclip = clipOf([torso]);
  defs.push(tclip.def);
  out.push(part(torso, hide.skin, w));
  const tb = boxOf([p.rear, p.front], p.thick * 0.6);
  out.push(
    washV(defs, tclip, tb, [
      [0, hide.lit, 0.8],
      [0.38, hide.skin, 0],
      [0.72, hide.belly, 0.55],
      [1, hide.dark, 0.85],
    ]),
    washH(defs, tclip, tb, hide.lit, hide.dark),
  );
  // Piglets: faint pale stripes along the body.
  if (young) {
    const ax = unit(sub(p.front, p.rear));
    const n = nrm(ax);
    const s: string[] = [];
    for (const off of [-0.12, -0.04, 0.04]) {
      const a = add(add(p.rear, mul(ax, 0.02)), mul(n, off));
      const b = add(add(p.front, mul(ax, -0.02)), mul(n, off));
      s.push(`M${r2(a[0])} ${r2(a[1])}L${r2(b[0])} ${r2(b[1])}`);
    }
    out.push(
      el('path', {
        d: s.join(''),
        stroke: shade(hide.skin, 0.4),
        'stroke-width': 0.035,
        opacity: 0.45,
        fill: 'none',
        'stroke-linecap': 'round',
        'clip-path': `url(#${tclip.id})`,
      }),
    );
  }
  // Skin texture: sparse short bristles and creases, lit on the back, dark below.
  const tex: string[] = [];
  const texDark: string[] = [];
  for (let i = 0; i < (young ? 40 : 90); i++) {
    const x = tb.x0 + rnd() * (tb.x1 - tb.x0);
    const y = tb.y0 + rnd() * (tb.y1 - tb.y0);
    const t = (y - tb.y0) / (tb.y1 - tb.y0);
    const l = 0.018 + rnd() * 0.02;
    const seg = `M${r2(x)} ${r2(y)}l${r2(-l)} ${r2(l * 0.5)}`;
    (t < 0.42 ? tex : texDark).push(seg);
  }
  out.push(
    el('path', {
      d: tex.join(''),
      stroke: shade(hide.lit, 0.15),
      'stroke-width': 0.008,
      opacity: 0.6,
      fill: 'none',
      'clip-path': `url(#${tclip.id})`,
    }),
    el('path', {
      d: texDark.join(''),
      stroke: shade(hide.dark, -0.2),
      'stroke-width': 0.008,
      opacity: 0.55,
      fill: 'none',
      'clip-path': `url(#${tclip.id})`,
    }),
  );
  // The mane: long dark bristles from the nape along the spine to the middle of the back.
  {
    const ax = unit(sub(p.front, p.rear));
    const n = nrm(ax);
    const t = p.thick / 2;
    const len = Math.hypot(p.front[0] - p.rear[0], p.front[1] - p.rear[1]);
    const strands: string[] = [];
    const count = young ? 14 : 46;
    for (let i = 0; i < count; i++) {
      const k = 0.35 + (i / count) * 0.8;
      const along = add(p.rear, mul(ax, len * Math.min(1.08, k)));
      const base = add(along, mul(n, -t * 0.98));
      // Longest at the nape, shorter toward the back.
      const l =
        (young ? 0.04 : 0.07) +
        (young ? 0.03 : 0.11) * Math.min(1, (k - 0.35) / 0.7) +
        rnd() * 0.03;
      const back = mul(ax, -l * 0.75);
      const up = mul(n, -l * 0.7);
      const tipM = add(add(base, back), up);
      strands.push(
        `M${r2(base[0])} ${r2(base[1])}Q${r2(base[0] - ax[0] * l * 0.2 + n[0] * -l * 0.6)} ${r2(base[1] - ax[1] * l * 0.2 + n[1] * -l * 0.6)} ${r2(tipM[0])} ${r2(tipM[1])}`,
      );
    }
    out.push(
      el('path', {
        d: strands.join(''),
        stroke: hide.mane,
        'stroke-width': young ? 0.012 : 0.014,
        'stroke-linecap': 'round',
        fill: 'none',
        opacity: 0.92,
      }),
    );
  }
  out.push(...leg(p.legs[2], hide.skin, false), ...leg(p.legs[3], hide.skin, true));
  // The head: the big flat wedge with the snout disc, warts, tusks, the eye high up, the ear.
  const head = hogHead(p, young);
  const hclip = clipOf([head.d]);
  defs.push(hclip.def);
  // The ear behind the head.
  const earBase = head.at(-0.02, -0.12);
  const earTip = head.at(-0.16, -0.25);
  out.push(
    part(
      smoothD([earBase, add(earTip, [0.01, 0.02]), earTip, head.at(0.12, -0.15)], true, 0.6),
      shade(hide.skin, -0.12),
      w,
    ),
  );
  out.push(part(head.d, hide.skin, w));
  // The mane runs on up the neck to the crown: long bristles lying back.
  {
    const crown: string[] = [];
    for (let i = 0; i < (young ? 5 : 14); i++) {
      const u = -0.12 + i * (young ? 0.05 : 0.022);
      const a = head.at(u, -0.14);
      const l = (young ? 0.05 : 0.1) + rnd() * 0.04;
      crown.push(
        `M${r2(a[0])} ${r2(a[1])}q${r2(-l * 0.5)} ${r2(-l * 0.7)} ${r2(-l * 1.1)} ${r2(-l * 0.5)}`,
      );
    }
    out.push(
      el('path', {
        d: crown.join(''),
        stroke: hide.mane,
        'stroke-width': young ? 0.012 : 0.015,
        'stroke-linecap': 'round',
        fill: 'none',
      }),
    );
  }
  const hb = boxOf([p.nape, p.snout], 0.2);
  out.push(
    washV(defs, hclip, hb, [
      [0, hide.lit, 0.7],
      [0.45, hide.skin, 0],
      [1, hide.dark, 0.75],
    ]),
  );
  // Pale whiskers along the jaw.
  const wh: string[] = [];
  for (let i = 0; i < (young ? 4 : 9); i++) {
    const a = head.at(0.18 + i * 0.05, 0.13 - i * 0.004);
    wh.push(`M${r2(a[0])} ${r2(a[1])}l${r2(-0.03 - rnd() * 0.02)} ${r2(0.04 + rnd() * 0.03)}`);
  }
  out.push(
    el('path', {
      d: wh.join(''),
      stroke: hide.whisker,
      'stroke-width': 0.01,
      'stroke-linecap': 'round',
      fill: 'none',
      opacity: 0.85,
    }),
  );
  // Warts (adults): a pair of bumps below the eye and on the side of the snout.
  if (!young)
    for (const [u, v, r] of [
      [0.42, 0.03, 0.04],
      [0.7, 0.045, 0.034],
    ] as const) {
      const c = head.at(u, v);
      out.push(
        part(ellipseD(c[0], c[1], r, r * 0.8), shade(hide.skin, -0.05), w),
        el('path', {
          d: ellipseD(c[0] - r * 0.25, c[1] - r * 0.3, r * 0.45, r * 0.3),
          fill: hide.lit,
          opacity: 0.55,
        }),
      );
    }
  // The snout disc at the tip.
  const sd = head.at(1.02, 0.02);
  const ang = (Math.atan2(p.snout[1] - p.nape[1], p.snout[0] - p.nape[0]) * 180) / Math.PI;
  out.push(
    g(
      { transform: `rotate(${r2(ang)} ${r2(sd[0])} ${r2(sd[1])})` },
      part(ellipseD(sd[0], sd[1], 0.028, young ? 0.05 : 0.065), hide.snout, w),
      el('path', { d: ellipseD(sd[0] + 0.006, sd[1] - 0.018, 0.008, 0.012), fill: '#1E1916' }),
      el('path', { d: ellipseD(sd[0] + 0.006, sd[1] + 0.018, 0.008, 0.012), fill: '#1E1916' }),
    ),
  );
  // The tusks: two upper tusks curving up and back out of the lip (adults); small in piglets.
  if (!young) {
    for (const [bu, bv, s] of [
      [0.86, 0.07, 1],
      [0.9, 0.06, 0.8],
    ] as const) {
      const b = head.at(bu, bv);
      const c1 = head.at(bu + 0.2 * s, bv - 0.12 * s);
      const tipT = head.at(bu - 0.02 * s, bv - 0.3 * s);
      const d = `M${r2(b[0])} ${r2(b[1])}Q${r2(c1[0])} ${r2(c1[1])} ${r2(tipT[0])} ${r2(tipT[1])}`;
      out.push(
        el('path', {
          d,
          stroke: edge(hide.tusk),
          'stroke-width': 0.034 * s,
          fill: 'none',
          'stroke-linecap': 'round',
        }),
        el('path', {
          d,
          stroke: hide.tusk,
          'stroke-width': 0.022 * s,
          fill: 'none',
          'stroke-linecap': 'round',
        }),
      );
    }
  }
  // The eye, high on the head, with a heavy brow.
  const eye = head.at(0.3, -0.08);
  if (p.shut === true)
    out.push(
      el('path', {
        d: `M${r2(eye[0] - 0.02)} ${r2(eye[1])}q0.02 0.012 0.04 0`,
        stroke: '#1E1916',
        'stroke-width': 0.01,
        fill: 'none',
      }),
    );
  else
    out.push(
      el('path', { d: ellipseD(eye[0], eye[1], 0.016, 0.014), fill: '#1E1916' }),
      el('path', {
        d: ellipseD(eye[0] - 0.004, eye[1] - 0.005, 0.005, 0.004),
        fill: '#F3EAD8',
        opacity: 0.8,
      }),
      el('path', {
        d: `M${r2(eye[0] - 0.03)} ${r2(eye[1] - 0.022)}q0.03 -0.016 0.06 -0.002`,
        stroke: shade(hide.dark, -0.2),
        'stroke-width': 0.012,
        fill: 'none',
        'stroke-linecap': 'round',
      }),
    );
  // Dug-up soil at the snout.
  if (p.dig === true)
    for (let i = 0; i < 9; i++)
      out.push(
        part(
          ellipseD(sd[0] + 0.02 + rnd() * 0.18, -0.01 - rnd() * 0.07, 0.016 + rnd() * 0.014, 0.012),
          i % 3 === 0 ? '#5E4028' : '#7A5434',
          w * 0.6,
        ),
      );
  return g({}, el('defs', {}, ...defs), ...out);
}

function hogFrame(frame: HarvestFrame, seed: number): string {
  const young = frame.startsWith('pg_');
  const hide = young ? PIGLET : ADULT;
  const k = young ? PIGLET_H : WARTHOG_H;
  const w = 0.009;
  const pose = (): HogPose | 'tumble' => {
    switch (frame) {
      case 'wh_trot_a':
      case 'pg_trot_a':
        return gaitPose(0, false, young);
      case 'wh_trot_b':
      case 'pg_trot_b':
        return gaitPose(0.25, false, young);
      case 'wh_trot_c':
        return gaitPose(0.5, false, young);
      case 'wh_trot_d':
        return gaitPose(0.75, false, young);
      case 'wh_dig_a':
        return digPose(0);
      case 'wh_dig_b':
        return digPose(0.03);
      case 'wh_run_a':
      case 'pg_run':
        return gaitPose(0.12, true, young);
      case 'wh_run_b':
        return gaitPose(0.62, true, young);
      case 'wh_tumble':
        return 'tumble';
      default:
        return downPose();
    }
  };
  const p = pose();
  const art =
    p === 'tumble'
      ? g(
          {},
          shadow(-0.6, 0.7, 0.045),
          // Rolled onto its back, the legs in the air (no blood).
          g(
            { transform: 'translate(0.08 -0.02) rotate(165 0 -0.5)' },
            drawHog(gaitPose(0.3, false, false), hide, false, seed, w, false),
          ),
        )
      : drawHog(p, hide, young, seed, w);
  return g({ transform: `scale(${k})` }, art);
}

// ---------------------------------------------------------------------------------------------
// The farm workers: drawn in units of a worker's height (1 = WORKER_H, feet to the hat's top),
// three-quarter view facing right.

interface Look {
  readonly skin: string;
  readonly skinLit: string;
  readonly overall: string;
  readonly shirt: string;
  readonly boots: string;
  readonly hat: 'straw' | 'cap' | 'bucket';
  readonly hatColour: string;
  readonly hair: string;
  readonly scarf?: string;
  readonly beard?: string;
  readonly tool: 'hammer' | 'pliers' | 'post';
  /** Shoulder and hip half-widths, torso depth (build), and the figure's size. */
  readonly build: number;
  readonly size: number;
}
const LOOKS: readonly Look[] = [
  // A woman with a red headscarf under a wide straw hat, blue overalls; the hammer.
  {
    skin: '#7E4E33',
    skinLit: '#A06A48',
    overall: '#3E6697',
    shirt: '#E8DCC0',
    boots: '#3A2A20',
    hat: 'straw',
    hatColour: '#D6B76C',
    hair: '#1E1612',
    scarf: '#B8433A',
    tool: 'hammer',
    build: 0.92,
    size: 0.95,
  },
  // An older man with a grey beard and a rust cap, green overalls, stockier; the pliers.
  {
    skin: '#5E3A24',
    skinLit: '#80553A',
    overall: '#4C7444',
    shirt: '#D8DCE0',
    boots: '#2E2620',
    hat: 'cap',
    hatColour: '#A9502E',
    hair: '#C8C2B8',
    beard: '#CFC9BF',
    tool: 'pliers',
    build: 1.12,
    size: 0.97,
  },
  // A young man in an olive bucket hat, khaki overalls over a blue shirt, tall and lean; the post.
  {
    skin: '#94623F',
    skinLit: '#B88358',
    overall: '#9C8656',
    shirt: '#5D88AE',
    boots: '#40302A',
    hat: 'bucket',
    hatColour: '#5B6838',
    hair: '#1A1410',
    tool: 'post',
    build: 0.98,
    size: 1,
  },
];

interface Body {
  /** Hip, shoulder (the torso), head centre; far and near legs (hip → knee → ankle), far and
   *  near arms (shoulder → elbow → wrist). */
  readonly hip: V;
  readonly shoulder: V;
  readonly head: V;
  readonly legs: readonly [readonly P[], readonly P[]];
  readonly arms: readonly [readonly P[], readonly P[]];
  /** Head tilt (deg, + = looking down). */
  readonly tilt?: number;
  /** Ducking: eyes squeezed shut, a grimace-grin. */
  readonly duck?: boolean;
}

const HIP = -0.5;
const SHO = -0.79;
const HEAD = -0.885;

function standBody(o: {
  lean?: number;
  far: readonly P[];
  near: readonly P[];
  legs?: readonly [readonly P[], readonly P[]];
  tilt?: number;
}): Body {
  const lean = o.lean ?? 0;
  return {
    hip: [0, HIP],
    shoulder: [lean, SHO],
    head: [lean + 0.02, HEAD],
    legs: o.legs ?? [
      [
        [-0.02, HIP],
        [-0.03, -0.26],
        [-0.04, -0.035],
      ],
      [
        [0.03, HIP],
        [0.045, -0.26],
        [0.05, -0.035],
      ],
    ],
    arms: [o.far, o.near],
    tilt: o.tilt ?? 0,
  };
}

function runBody(phase: 0 | 1): Body {
  const a = phase === 0 ? 1 : -1;
  const lean = 0.06;
  return {
    hip: [0, HIP + 0.01],
    shoulder: [lean, SHO + 0.01],
    head: [lean + 0.035, HEAD + 0.015],
    legs: [
      [
        [-0.01, HIP + 0.01],
        [-0.08 * a + 0.05, -0.27],
        [-0.15 * a, -0.035 - (a > 0 ? 0.07 : 0)],
      ],
      [
        [0.03, HIP + 0.01],
        [0.1 * a + 0.06, -0.28],
        [0.13 * a, -0.035 - (a < 0 ? 0.07 : 0)],
      ],
    ],
    arms: [
      [
        [lean - 0.02, SHO + 0.03],
        [lean + 0.08 * a, -0.62],
        [lean + 0.16 * a, -0.55],
      ],
      [
        [lean + 0.03, SHO + 0.03],
        [lean - 0.06 * a, -0.62],
        [lean - 0.01 * a + 0.04, -0.53],
      ],
    ],
    tilt: 4,
  };
}

/** Crouched with the hands over the head (a comic flinch). */
function duckBody(): Body {
  return {
    hip: [-0.04, -0.3],
    shoulder: [0.09, -0.5],
    head: [0.14, -0.565],
    legs: [
      [
        [-0.06, -0.3],
        [0.1, -0.2],
        [-0.03, -0.035],
      ],
      [
        [-0.01, -0.3],
        [0.17, -0.18],
        [0.08, -0.035],
      ],
    ],
    arms: [
      [
        [0.06, -0.49],
        [-0.03, -0.6],
        [0.08, -0.66],
      ],
      [
        [0.12, -0.49],
        [0.24, -0.58],
        [0.17, -0.67],
      ],
    ],
    tilt: 24,
    duck: true,
  };
}

/** A hand at the wrist, pointing along `dir` (a mitten shape with the thumb). */
function hand(look: Look, wrist: P, dir: V, w: number): string {
  const d = unit(dir);
  const n = nrm(d);
  const at = (u: number, v: number): V => add(add([wrist[0], wrist[1]], mul(d, u)), mul(n, v));
  return g(
    {},
    part(
      smoothD(
        [at(-0.005, -0.017), at(0.035, -0.02), at(0.055, -0.006), at(0.05, 0.014), at(0.01, 0.02)],
        true,
        0.8,
      ),
      look.skin,
      w,
    ),
    // The thumb.
    part(
      smoothD(
        [at(0.012, -0.016), at(0.034, -0.03), at(0.04, -0.022), at(0.024, -0.008)],
        true,
        0.8,
      ),
      look.skinLit,
      w * 0.8,
    ),
  );
}

function toolArt(kind: Look['tool'], wrist: P, angle: number, w: number): string {
  const t = `translate(${r2(wrist[0])} ${r2(wrist[1])}) rotate(${r2(angle)})`;
  if (kind === 'hammer')
    return g(
      { transform: t },
      part(
        polyD([
          [-0.009, 0.03],
          [0.009, 0.03],
          [0.008, -0.17],
          [-0.008, -0.17],
        ]),
        '#9A6B3E',
        w,
      ),
      el('path', { d: 'M-0.003 0.02L-0.003 -0.16', stroke: '#C08A56', 'stroke-width': 0.004 }),
      part(
        polyD([
          [-0.04, -0.165],
          [0.034, -0.165],
          [0.044, -0.2],
          [-0.03, -0.205],
        ]),
        '#6E747A',
        w,
      ),
      el('path', { d: 'M-0.034 -0.172L0.03 -0.172', stroke: '#B0B6BC', 'stroke-width': 0.005 }),
    );
  if (kind === 'pliers')
    return g(
      { transform: t },
      part(
        polyD([
          [-0.012, 0.035],
          [-0.002, 0.035],
          [0.004, -0.06],
          [-0.006, -0.07],
        ]),
        '#C24A3A',
        w,
      ),
      part(
        polyD([
          [0.004, 0.035],
          [0.014, 0.035],
          [0.008, -0.07],
          [0, -0.06],
        ]),
        '#A83E30',
        w,
      ),
      part(
        polyD([
          [-0.008, -0.065],
          [0.008, -0.065],
          [0.004, -0.11],
          [-0.004, -0.11],
        ]),
        '#7D8288',
        w,
      ),
    );
  return g(
    { transform: t },
    part(
      polyD([
        [-0.018, 0.12],
        [0.018, 0.12],
        [0.016, -0.4],
        [0, -0.415],
        [-0.016, -0.4],
      ]),
      '#B08A58',
      w,
    ),
    el('path', { d: 'M-0.006 0.1L-0.006 -0.39', stroke: '#CFA874', 'stroke-width': 0.006 }),
    el('path', { d: 'M0.008 0.08L0.009 -0.3', stroke: '#8A6A42', 'stroke-width': 0.004 }),
  );
}

/** The head in three-quarter view: skull and jaw, the ear, the nose, the eye and brow, a smile. */
function headArt(look: Look, b: Body, defs: string[], w: number): string[] {
  const [cx, cy] = b.head;
  const out: string[] = [];
  const tilt = b.tilt ?? 0;
  const parts: string[] = [];
  // The neck.
  parts.push(
    part(
      limbD(
        [
          [b.shoulder[0] + 0.005, b.shoulder[1] + 0.01],
          [cx - 0.008, cy + 0.04],
        ],
        [0.05, 0.042],
      ),
      look.skin,
      w,
    ),
  );
  if (look.scarf !== undefined)
    // The headscarf's knot and tail at the back of the head.
    parts.push(
      part(
        smoothD(
          [
            [cx - 0.06, cy - 0.01],
            [cx - 0.085, cy + 0.03],
            [cx - 0.07, cy + 0.07],
            [cx - 0.045, cy + 0.03],
          ],
          true,
        ),
        shade(look.scarf, -0.1),
        w,
      ),
    );
  const skull = smoothD(
    [
      [cx - 0.05, cy - 0.04],
      [cx, cy - 0.058],
      [cx + 0.043, cy - 0.035],
      [cx + 0.05, cy - 0.005],
      // The nose.
      [cx + 0.062, cy + 0.008],
      [cx + 0.05, cy + 0.02],
      [cx + 0.046, cy + 0.04],
      // The chin and jaw.
      [cx + 0.03, cy + 0.058],
      [cx - 0.005, cy + 0.055],
      [cx - 0.042, cy + 0.03],
    ],
    true,
    0.8,
  );
  const clip = clipOf([skull]);
  defs.push(clip.def);
  parts.push(part(skull, look.skin, w));
  const hb = { x0: cx - 0.07, y0: cy - 0.07, x1: cx + 0.07, y1: cy + 0.07 };
  parts.push(washH(defs, clip, hb, look.skinLit, shade(look.skin, -0.35)));
  if (look.scarf !== undefined)
    // The scarf over the crown and the back of the head.
    parts.push(
      part(
        smoothD(
          [
            [cx - 0.055, cy + 0.02],
            [cx - 0.05, cy - 0.05],
            [cx + 0.0, cy - 0.065],
            [cx + 0.035, cy - 0.04],
            [cx + 0.008, cy - 0.032],
            [cx - 0.02, cy - 0.005],
          ],
          true,
        ),
        look.scarf,
        w,
      ),
      el('path', {
        d: `M${r2(cx - 0.04)} ${r2(cy - 0.035)}q0.02 -0.012 0.05 -0.018`,
        stroke: shade(look.scarf, -0.3),
        'stroke-width': 0.004,
        fill: 'none',
      }),
    );
  else
    // Short hair at the back of the head.
    parts.push(
      part(
        smoothD(
          [
            [cx - 0.052, cy + 0.015],
            [cx - 0.05, cy - 0.04],
            [cx - 0.005, cy - 0.058],
            [cx + 0.02, cy - 0.045],
            [cx - 0.015, cy - 0.03],
            [cx - 0.03, cy + 0.0],
          ],
          true,
        ),
        look.hair,
        w,
      ),
    );
  // The ear.
  parts.push(part(ellipseD(cx - 0.012, cy + 0.004, 0.011, 0.016), shade(look.skin, -0.08), w));
  if (look.beard !== undefined) {
    parts.push(
      part(
        smoothD(
          [
            [cx - 0.012, cy + 0.02],
            [cx + 0.045, cy + 0.03],
            [cx + 0.04, cy + 0.068],
            [cx + 0.01, cy + 0.075],
            [cx - 0.02, cy + 0.045],
          ],
          true,
        ),
        look.beard,
        w,
      ),
    );
    // A moustache over the smile.
    parts.push(
      el('path', {
        d: `M${r2(cx + 0.026)} ${r2(cy + 0.026)}q0.014 -0.006 0.027 0.002`,
        stroke: look.beard,
        'stroke-width': 0.008,
        'stroke-linecap': 'round',
        fill: 'none',
      }),
    );
  }
  // The face: brow, eye (open with a highlight; squeezed shut when ducking), nose shade, a smile.
  const ink = '#24160F';
  if (b.duck === true)
    parts.push(
      el('path', {
        d: `M${r2(cx + 0.018)} ${r2(cy - 0.012)}l0.016 0.006l-0.016 0.006`,
        stroke: ink,
        'stroke-width': 0.006,
        fill: 'none',
        'stroke-linecap': 'round',
      }),
      el('path', {
        d: `M${r2(cx + 0.02)} ${r2(cy + 0.034)}q0.012 0.008 0.026 -0.002`,
        stroke: ink,
        'stroke-width': 0.006,
        fill: '#F3EEE4',
        'stroke-linejoin': 'round',
      }),
    );
  else
    parts.push(
      el('path', { d: ellipseD(cx + 0.028, cy - 0.008, 0.009, 0.006), fill: '#F3EEE4' }),
      el('path', { d: ellipseD(cx + 0.031, cy - 0.008, 0.005, 0.0055), fill: '#2A1A12' }),
      el('path', { d: ellipseD(cx + 0.029, cy - 0.01, 0.0018, 0.0018), fill: '#FFFFFF' }),
      el('path', {
        d: `M${r2(cx + 0.016)} ${r2(cy - 0.022)}q0.014 -0.008 0.03 -0.002`,
        stroke: shade(look.hair === '#C8C2B8' ? '#9A948C' : look.hair, 0),
        'stroke-width': 0.006,
        fill: 'none',
        'stroke-linecap': 'round',
      }),
      // The smile and the cheek's lift.
      el('path', {
        d: `M${r2(cx + 0.024)} ${r2(cy + 0.03)}q0.014 0.012 0.028 -0.002`,
        stroke: ink,
        'stroke-width': 0.005,
        fill: 'none',
        'stroke-linecap': 'round',
      }),
      el('path', {
        d: ellipseD(cx + 0.03, cy + 0.016, 0.01, 0.006),
        fill: look.skinLit,
        opacity: 0.5,
      }),
    );
  // The nose's shade.
  parts.push(
    el('path', {
      d: `M${r2(cx + 0.05)} ${r2(cy + 0.0)}q0.01 0.012 -0.002 0.02`,
      stroke: shade(look.skin, -0.35),
      'stroke-width': 0.005,
      fill: 'none',
    }),
  );
  parts.push(...hatArt(look, b.head, w));
  out.push(g({ transform: `rotate(${r2(tilt)} ${r2(cx - 0.01)} ${r2(cy + 0.04)})` }, ...parts));
  return out;
}

function hatArt(look: Look, head: V, w: number): string[] {
  const [x, y] = head;
  // The hat's top is at 1 unit above the feet when standing.
  const top = y - 0.115;
  const c = look.hatColour;
  if (look.hat === 'straw') {
    const weave: string[] = [];
    for (let i = 0; i < 6; i++)
      weave.push(`M${r2(x - 0.05 + i * 0.02)} ${r2(y - 0.052)}l0.004 ${r2(top - y + 0.06)}`);
    return [
      part(ellipseD(x + 0.005, y - 0.05, 0.115, 0.022), c, w),
      el('path', {
        d: ellipseD(x + 0.005, y - 0.045, 0.1, 0.012),
        fill: shade(c, -0.3),
        opacity: 0.35,
      }),
      part(
        smoothD(
          [
            [x - 0.055, y - 0.05],
            [x - 0.048, top + 0.01],
            [x + 0.0, top],
            [x + 0.05, top + 0.01],
            [x + 0.058, y - 0.05],
          ],
          false,
          0.8,
        ) + 'Z',
        c,
        w,
      ),
      el('path', {
        d: weave.join(''),
        stroke: shade(c, -0.18),
        'stroke-width': 0.003,
        opacity: 0.6,
      }),
      el('path', {
        d: `M${r2(x - 0.056)} ${r2(y - 0.064)}h0.114`,
        stroke: '#7A3A2E',
        'stroke-width': 0.012,
      }),
      el('path', {
        d: `M${r2(x - 0.04)} ${r2(top + 0.012)}q0.03 -0.01 0.06 0`,
        stroke: shade(c, 0.35),
        'stroke-width': 0.006,
        fill: 'none',
      }),
    ];
  }
  if (look.hat === 'cap')
    return [
      part(
        smoothD(
          [
            [x - 0.056, y - 0.022],
            [x - 0.05, top + 0.04],
            [x + 0.0, top + 0.03],
            [x + 0.05, top + 0.045],
            [x + 0.054, y - 0.022],
          ],
          false,
          0.8,
        ) + 'Z',
        c,
        w,
      ),
      el('path', {
        d: `M${r2(x - 0.002)} ${r2(top + 0.03)}L${r2(x + 0.004)} ${r2(y - 0.024)}`,
        stroke: shade(c, -0.25),
        'stroke-width': 0.004,
      }),
      part(
        polyD([
          [x + 0.04, y - 0.026],
          [x + 0.11, y - 0.016],
          [x + 0.1, y - 0.006],
          [x + 0.036, y - 0.012],
        ]),
        shade(c, -0.18),
        w,
      ),
      el('path', {
        d: `M${r2(x - 0.04)} ${r2(top + 0.045)}q0.03 -0.012 0.06 -0.004`,
        stroke: shade(c, 0.3),
        'stroke-width': 0.006,
        fill: 'none',
      }),
    ];
  return [
    part(
      smoothD(
        [
          [x - 0.062, y - 0.018],
          [x - 0.048, top + 0.03],
          [x + 0.0, top + 0.02],
          [x + 0.05, top + 0.032],
          [x + 0.064, y - 0.018],
        ],
        false,
        0.8,
      ) + 'Z',
      c,
      w,
    ),
    part(
      smoothD(
        [
          [x - 0.085, y - 0.004],
          [x - 0.06, y - 0.03],
          [x + 0.065, y - 0.03],
          [x + 0.09, y - 0.002],
          [x + 0.0, y - 0.012],
        ],
        true,
        0.8,
      ),
      shade(c, -0.12),
      w,
    ),
    el('path', {
      d: `M${r2(x - 0.055)} ${r2(y - 0.028)}q0.06 -0.012 0.118 0`,
      stroke: shade(c, -0.32),
      'stroke-width': 0.004,
      fill: 'none',
      'stroke-dasharray': '0.008 0.006',
    }),
    el('path', {
      d: `M${r2(x - 0.035)} ${r2(top + 0.035)}q0.03 -0.01 0.055 -0.002`,
      stroke: shade(c, 0.3),
      'stroke-width': 0.006,
      fill: 'none',
    }),
  ];
}

function worker(look: Look, b: Body, toolAt: { hand: 0 | 1; angle: number } | null): string {
  const w = 0.0045;
  const defs: string[] = [];
  const out: string[] = [shadow(-0.12, 0.16, 0.022)];
  const [farLeg, nearLeg] = b.legs;
  const [farArm, nearArm] = b.arms;
  const k = look.build;
  const boot = (pts: readonly P[], far: boolean): string => {
    const f = pts[pts.length - 1] ?? [0, 0];
    const c = far ? shade(look.boots, -0.15) : look.boots;
    return g(
      {},
      part(
        smoothD(
          [
            [f[0] - 0.03, f[1] - 0.012],
            [f[0] + 0.012, f[1] - 0.03],
            [f[0] + 0.052, f[1] + 0.012],
            [f[0] + 0.056, f[1] + 0.03],
            [f[0] - 0.032, f[1] + 0.032],
          ],
          true,
          0.6,
        ),
        c,
        w,
      ),
      el('path', {
        d: `M${r2(f[0] - 0.034)} ${r2(f[1] + 0.03)}h0.092`,
        stroke: '#1A1410',
        'stroke-width': 0.009,
      }),
      el('path', {
        d: `M${r2(f[0] - 0.005)} ${r2(f[1] - 0.012)}l0.02 0.012`,
        stroke: shade(c, 0.35),
        'stroke-width': 0.004,
      }),
    );
  };
  /** An overall's trouser leg with its knee fold and its seam. */
  const trouser = (pts: readonly P[], far: boolean): string[] => {
    const c = far ? shade(look.overall, -0.22) : look.overall;
    const d = limbD(pts, [0.085 * k, 0.07 * k, 0.06 * k]);
    const clip = clipOf([d]);
    defs.push(clip.def);
    const knee = pts[1] ?? [0, 0];
    return [
      part(d, c, w),
      washH(defs, clip, boxOf(pts, 0.06), shade(c, 0.35), shade(c, -0.4)),
      el('path', {
        d: `M${r2(knee[0] - 0.02)} ${r2(knee[1] - 0.01)}q0.02 0.012 0.042 0`,
        stroke: shade(c, -0.35),
        'stroke-width': 0.005,
        fill: 'none',
      }),
      el('path', {
        d: `M${r2(knee[0] - 0.026)} ${r2(knee[1] + 0.03)}q0.02 0.01 0.04 -0.004`,
        stroke: shade(c, -0.3),
        'stroke-width': 0.004,
        fill: 'none',
      }),
    ];
  };
  /** A rolled sleeve over the upper arm, the bare forearm, the hand. */
  const arm = (pts: readonly P[], far: boolean): string[] => {
    const shirt = far ? shade(look.shirt, -0.22) : look.shirt;
    const skin = far ? shade(look.skin, -0.18) : look.skin;
    const Z: P = [0, 0];
    const s: P = pts[0] ?? Z;
    const e: P = pts[1] ?? Z;
    const wr: P = pts[2] ?? Z;
    const cuff: V = [e[0] + (wr[0] - e[0]) * 0.15, e[1] + (wr[1] - e[1]) * 0.15];
    return [
      part(limbD([e, wr], [0.042 * k, 0.034 * k]), skin, w),
      part(limbD([s, e, cuff], [0.06 * k, 0.05 * k, 0.052 * k]), shirt, w),
      el('path', {
        d: `M${r2(cuff[0] - 0.02)} ${r2(cuff[1])}l0.04 0`,
        stroke: shade(shirt, -0.3),
        'stroke-width': 0.006,
        transform: `rotate(${r2((Math.atan2(wr[1] - e[1], wr[0] - e[0]) * 180) / Math.PI + 90)} ${r2(cuff[0])} ${r2(cuff[1])})`,
      }),
      hand(look, wr, sub([wr[0], wr[1]], [e[0], e[1]]), w),
    ];
  };
  // Far side first.
  out.push(...trouser(farLeg, true), boot(farLeg, true));
  if (toolAt?.hand === 0)
    out.push(toolArt(look.tool, farArm[farArm.length - 1] ?? [0, 0], toolAt.angle, w));
  out.push(...arm(farArm, true));
  // The torso: the shirt, then the overall's bib, straps, pocket and stitched seams.
  const [sx, sy] = b.shoulder;
  const [hx, hy] = b.hip;
  const sw = 0.075 * k;
  const torso = smoothD(
    [
      [sx - sw, sy - 0.01],
      [sx + sw * 0.9, sy - 0.005],
      [sx + sw * 1.05, (sy + hy) / 2],
      [hx + sw * 1.02, hy + 0.03],
      [hx - sw * 0.98, hy + 0.03],
      [sx - sw * 1.08, (sy + hy) / 2],
    ],
    true,
    0.85,
  );
  const tclip = clipOf([torso]);
  defs.push(tclip.def);
  out.push(part(torso, look.shirt, w));
  const bib = polyD([
    [sx - sw * 0.62, sy + 0.05],
    [sx + sw * 0.62, sy + 0.05],
    [hx + sw * 1.02, hy + 0.04],
    [hx - sw * 0.98, hy + 0.04],
  ]);
  out.push(g({ 'clip-path': `url(#${tclip.id})` }, part(bib, look.overall, w)));
  const tb = { x0: sx - sw * 1.2, y0: sy - 0.02, x1: sx + sw * 1.2, y1: hy + 0.05 };
  out.push(washH(defs, tclip, tb, shade(look.shirt, 0.3), shade(look.overall, -0.5)));
  out.push(
    // The straps and their buckles.
    el('path', {
      d: `M${r2(sx - sw * 0.6)} ${r2(sy + 0.05)}L${r2(sx - sw * 0.72)} ${r2(sy - 0.004)}M${r2(sx + sw * 0.6)} ${r2(sy + 0.05)}L${r2(sx + sw * 0.5)} ${r2(sy - 0.004)}`,
      stroke: shade(look.overall, -0.2),
      'stroke-width': 0.014,
    }),
    el('path', { d: ellipseD(sx - sw * 0.6, sy + 0.05, 0.008, 0.007), fill: '#C9B98A' }),
    el('path', { d: ellipseD(sx + sw * 0.6, sy + 0.05, 0.008, 0.007), fill: '#C9B98A' }),
    // The bib pocket with its stitching, and a fold at the waist.
    part(
      polyD([
        [sx - 0.025, sy + 0.08],
        [sx + 0.03, sy + 0.08],
        [sx + 0.028, sy + 0.13],
        [sx - 0.023, sy + 0.13],
      ]),
      shade(look.overall, -0.08),
      w,
    ),
    el('path', {
      d: `M${r2(sx - 0.02)} ${r2(sy + 0.088)}h0.045`,
      stroke: '#E6C88A',
      'stroke-width': 0.0035,
      'stroke-dasharray': '0.006 0.004',
      fill: 'none',
    }),
    el('path', {
      d: `M${r2(hx - sw * 0.8)} ${r2(hy - 0.02)}q${r2(sw * 0.8)} 0.02 ${r2(sw * 1.6)} 0`,
      stroke: shade(look.overall, -0.32),
      'stroke-width': 0.005,
      fill: 'none',
    }),
    el('path', {
      d: `M${r2(hx + 0.002)} ${r2(hy - 0.08)}L${r2(hx + 0.004)} ${r2(hy + 0.04)}`,
      stroke: '#E6C88A',
      'stroke-width': 0.003,
      'stroke-dasharray': '0.006 0.004',
      opacity: 0.8,
    }),
  );
  out.push(...trouser(nearLeg, false), boot(nearLeg, false));
  out.push(...headArt(look, b, defs, w));
  if (toolAt?.hand === 1)
    out.push(toolArt(look.tool, nearArm[nearArm.length - 1] ?? [0, 0], toolAt.angle, w));
  out.push(...arm(nearArm, false));
  return g({}, el('defs', {}, ...defs), ...out);
}

function workerFrame(n: 0 | 1 | 2, kind: 'run_a' | 'run_b' | 'work_a' | 'work_b' | 'duck'): string {
  const look = LOOKS[n] ?? LOOKS[0];
  if (look === undefined) return '';
  const art = (): string => {
    if (kind === 'duck') return worker(look, duckBody(), null);
    if (kind === 'run_a' || kind === 'run_b') {
      const b = runBody(kind === 'run_a' ? 0 : 1);
      return worker(look, b, { hand: 1, angle: look.tool === 'post' ? -70 : 30 });
    }
    const up = kind === 'work_a';
    if (look.tool === 'hammer') {
      // Hammering a post in front of her: the hammer up, then down on the post's top.
      const post = g(
        {},
        part(
          polyD([
            [0.19, 0.005],
            [0.225, 0.005],
            [0.222, -0.4],
            [0.207, -0.41],
            [0.193, -0.4],
          ]),
          '#B08A58',
          0.0045,
        ),
        el('path', { d: 'M0.2 -0.02L0.2 -0.39', stroke: '#CFA874', 'stroke-width': 0.006 }),
      );
      return (
        post +
        worker(
          look,
          standBody({
            lean: 0.025,
            far: [
              [-0.02, SHO + 0.03],
              [0.07, -0.66],
              [0.17, -0.42],
            ],
            near: up
              ? [
                  [0.03, SHO + 0.03],
                  [0.1, -0.86],
                  [0.17, -0.92],
                ]
              : [
                  [0.03, SHO + 0.03],
                  [0.11, -0.68],
                  [0.18, -0.6],
                ],
            tilt: 10,
          }),
          { hand: 1, angle: up ? -40 : 60 },
        )
      );
    }
    if (look.tool === 'pliers') {
      // Twisting a strand of wire tight at chest height.
      const twist = up ? 0 : 0.012;
      const wire = el('path', {
        d: `M0.12 ${r2(-0.6 - twist)}q0.08 0.01 0.2 0.0`,
        stroke: '#7A7A76',
        'stroke-width': 0.006,
        fill: 'none',
      });
      return (
        wire +
        worker(
          look,
          standBody({
            lean: 0.02,
            far: [
              [-0.02, SHO + 0.03],
              [0.06, -0.66],
              [0.13, -0.6 + twist],
            ],
            near: [
              [0.03, SHO + 0.03],
              [0.09, -0.65],
              [0.15, -0.6 - twist],
            ],
            tilt: 8,
          }),
          { hand: 1, angle: up ? 70 : 110 },
        )
      );
    }
    // Holding a post upright and pressing it into its hole (the post stands on the ground).
    const dy = up ? 0 : 0.015;
    const post = g(
      {},
      part(
        polyD([
          [0.152, 0.006],
          [0.19, 0.006],
          [0.188, -0.78 + dy],
          [0.171, -0.79 + dy],
          [0.154, -0.78 + dy],
        ]),
        '#B08A58',
        0.0045,
      ),
      el('path', {
        d: `M0.162 -0.02L0.162 ${r2(-0.77 + dy)}`,
        stroke: '#CFA874',
        'stroke-width': 0.006,
      }),
    );
    return (
      post +
      worker(
        look,
        standBody({
          lean: up ? 0.02 : 0.035,
          far: [
            [-0.02, SHO + 0.03],
            [0.07, -0.68 + dy],
            [0.15, -0.66 + dy],
          ],
          near: [
            [0.03, SHO + 0.03],
            [0.09, -0.6 + dy],
            [0.155, -0.52 + dy],
          ],
          tilt: 4,
        }),
        null,
      )
    );
  };
  return g({ transform: `scale(${r2(WORKER_H * look.size)})` }, art());
}

// ---------------------------------------------------------------------------------------------
// The fence's gap panel (mid layer px 1:1) and the sign. Its posts and wires are the mid layer's
// fence (tools/art/biomes/oes.ts: posts FENCE_POST_H tall every ~110 px, three wires at 26, 44
// and 62 px): the layer's posts stand at the gap's edges (±170); the panel adds the two posts
// between them and strings the wires from edge to edge.

const PEN: Pen = { ink: '#2A1E16', w: 2 };
const OLD = tone('#8B5A2B', 0.3, 0.22);
const FRESH = tone('#B08A58', 0.3, 0.22);
const WIRE_PEN: Pen = { ink: shade('#9AA3A8', -0.3), w: 1 };
const STRANDS = [-26, -44, -62];
const HALF = FENCE_GAP_W / 2;
const INNER = [-HALF / 3, HALF / 3];

/** A post standing at x (its foot on the ground line), optionally knocked over by `angle`. */
function gapPost(x: number, angle: number, t: Tone): string {
  const art = post(0, 2, FENCE_POST_H, 7, t, PEN);
  return g({ transform: `translate(${r2(x)} 0) rotate(${r2(angle)})` }, art);
}

/** A snapped wire end curling from (x, y) toward `dir`. */
function curl(x: number, y: number, dir: 1 | -1, len: number): string {
  const d = dir;
  return el('path', {
    d: `M${r2(x)} ${r2(y)}q${r2(d * len * 0.5)} ${r2(3)} ${r2(d * len)} ${r2(10)}q${r2(d * 8)} ${r2(8)} ${r2(0)} ${r2(11)}q${r2(-d * 6)} ${r2(-3)} ${r2(-d * 2)} ${r2(-8)}`,
    stroke: WIRE_PEN.ink,
    'stroke-width': 1.4,
    fill: 'none',
  });
}

function gapFrame(stage: 0 | 1 | 2 | 3 | 4): string {
  const out: string[] = [];
  if (stage === 0) {
    // The two posts between the gap's edges knocked over, the wire snapped: the gap is open.
    out.push(
      el('path', { d: ellipseD(0, -1, 120, 4), fill: '#2A1A10', opacity: 0.16 }),
      gapPost(INNER[0] ?? 0, -62, OLD),
      gapPost(INNER[1] ?? 0, 70, OLD),
    );
    for (const y of STRANDS) {
      out.push(curl(-HALF + 2, y, 1, 22 + (-y % 7)));
      out.push(curl(HALF - 2, y + 4, -1, 18 + (-y % 5)));
    }
    return g({}, ...out);
  }
  // New posts up first (stage 1), then one, two and three strands strung edge to edge.
  out.push(gapPost(INNER[0] ?? 0, 0, FRESH), gapPost(INNER[1] ?? 0, 0, FRESH));
  const strands = stage - 1;
  for (let i = 0; i < strands; i++) {
    const y = STRANDS[i] ?? 0;
    out.push(
      wire(
        [
          [-HALF, y],
          [INNER[0] ?? 0, y],
          [INNER[1] ?? 0, y],
          [HALF, y],
        ],
        3,
        WIRE_PEN,
        1.4,
      ),
    );
  }
  // The rest of the wire still coiled on the ground (not yet strung).
  if (stage < 4)
    out.push(
      el('path', {
        d: ellipseD(HALF - 60, -6, 18, 5),
        stroke: WIRE_PEN.ink,
        'stroke-width': 1.6,
        fill: 'none',
      }),
      el('path', {
        d: ellipseD(HALF - 58, -7, 13, 4),
        stroke: WIRE_PEN.ink,
        'stroke-width': 1.6,
        fill: 'none',
      }),
    );
  return g({}, ...out);
}

/** The hand-painted sign, hanging from a wire: origin at its top hanging point. */
function signFrame(): string {
  const out: string[] = [];
  const wood = '#9C7448';
  out.push(
    el('path', {
      d: 'M0 0L-22 12M0 0L22 12',
      stroke: WIRE_PEN.ink,
      'stroke-width': 1.4,
      fill: 'none',
    }),
    el('path', {
      d: polyD([
        [-30, 10],
        [30, 12],
        [29, 40],
        [-29, 38],
      ]),
      fill: wood,
      stroke: shade(wood, -0.45),
      'stroke-width': 1.5,
    }),
    el('path', { d: 'M-27 24L27 26', stroke: shade(wood, -0.25), 'stroke-width': 1.2 }),
    el('path', { d: 'M-26 14L26 16', stroke: shade(wood, 0.25), 'stroke-width': 1 }),
  );
  const paint = {
    stroke: '#F3ECDD',
    'stroke-width': 3.8,
    fill: 'none',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  };
  // O, E, S as painted strokes (no font in the rasteriser).
  out.push(
    el('path', { d: ellipseD(-16, 25, 7, 8.5), ...paint }),
    el('path', { d: 'M7 17L-2 17L-2 33L7 34M-2 25L4 25', ...paint }),
    el('path', { d: 'M24 18Q14 15 14 21Q14 25 19 26Q24 27 24 31Q22 35 13 33', ...paint }),
  );
  return g({}, ...out);
}

/** A frame's drawing, the feet at the origin. */
export function drawFrame(frame: HarvestFrame, seed: number): string {
  if (frame.startsWith('wh_') || frame.startsWith('pg_')) return hogFrame(frame, seed);
  if (frame.startsWith('wk')) {
    const n = Number(frame[2]) as 0 | 1 | 2;
    const kind = frame.slice(4) as 'run_a' | 'run_b' | 'work_a' | 'work_b' | 'duck';
    return workerFrame(n, kind);
  }
  if (frame === 'sign_oes') return signFrame();
  return gapFrame(Number(frame.slice(4)) as 0 | 1 | 2 | 3 | 4);
}

/** A frame's seed (stable whatever the packing order). */
export function frameSeed(name: string): number {
  let h = 173;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 9973;
  return h;
}

/** The sheet at `k` texture px per design px (2: the delivered master). */
export function renderHarvestSheet(k: number): Rgba {
  const cells = harvestFrames().map((f) => {
    const id = nextId();
    return g(
      {},
      el('clipPath', { id }, el('rect', { x: f.x, y: f.y, width: f.w, height: f.h })),
      g(
        { 'clip-path': `url(#${id})` },
        g(
          { transform: `translate(${r2(f.x + f.ox)} ${r2(f.y + f.oy)})` },
          drawFrame(f.name, frameSeed(f.name)),
        ),
      ),
    );
  });
  return renderSvg(
    svgDoc(
      HARVEST_SHEET_W * k,
      HARVEST_SHEET_H * k,
      [0, 0, HARVEST_SHEET_W, HARVEST_SHEET_H],
      '',
      g({}, ...cells),
    ),
  );
}
