// v1.8c (D-063, art bible §5.4) Die Oes: the Harvest sheet's interim art at the v1.6/v1.7 bar
// (D-035): warthogs (grey-brown, a sparse dark mane, tusks and warts, the thin tail held up like
// an aerial when it trots; digging on its knees with the snout in the soil; a comic roll onto its
// back when bagged, no blood), piglets (lighter, faint stripes, tails up), the three farm workers
// (respectful and cheerful: simple overalls and boots, three different people — a woman with a
// headscarf under a wide straw hat and a hammer, an older man with a grey beard and a cap twisting
// wire, a young man in a bucket hat carrying a post), the fence's gap panel (broken open, three
// repair stages, whole) and the hand-painted "OES" sign. Warm-black ink outlines, flat fills with
// one shadow and one highlight, a soft contact shadow; light from the upper left. Frames face right
// with the feet at the origin; sizes from src/game/view/harvest/harvestSheet.ts. Pure: frame → SVG.
import {
  FENCE_GAP_W,
  HARVEST_SHEET_H,
  HARVEST_SHEET_W,
  harvestFrames,
  PIGLET_H,
  WARTHOG_H,
  WORKER_H,
  type HarvestFrame,
} from '../../src/game/view/harvest/harvestSheet';
import type { Rgba } from '../assets/image';
import { renderSvg } from './raster';
import { nextId, shade } from './scenery';
import { el, ellipseD, g, inked, polyD, prng, r2, smoothD, svgDoc, type Attrs } from './svg';

type P = readonly [number, number];

const INK = '#2A1E16';
/** Ink width at 1× (design px): the 2× master draws it 2 texels wide per px. */
const LINE = 2.2;

/** A thick limb: an ink stroke under a colour stroke along the points. */
function limb(pts: readonly P[], width: number, colour: string, line = LINE): string {
  const d = smoothD(pts, false, 0.6);
  const base: Attrs = { d, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  return (
    el('path', { ...base, stroke: INK, 'stroke-width': width + line * 2 }) +
    el('path', { ...base, stroke: colour, 'stroke-width': width })
  );
}

const part = (d: string, fill: string, extra: Attrs = {}): string =>
  inked(d, fill, INK, LINE, extra);

/** A soft contact shadow under the feet. */
function shadow(x0: number, x1: number, h = 5): string {
  return el('path', {
    d: ellipseD((x0 + x1) / 2, -1, (x1 - x0) / 2, h),
    fill: '#2A1A10',
    opacity: 0.22,
  });
}

// ---------------------------------------------------------------------------------------------
// Warthogs and piglets: drawn in units of an adult's height (1 = WARTHOG_H), facing right.

interface Hog {
  readonly coat: string;
  readonly dark: string;
  readonly belly: string;
  readonly snout: string;
  readonly mane: string;
  readonly young: boolean;
}
const ADULT: Hog = {
  coat: '#7D7268',
  dark: '#544A43',
  belly: '#958A7E',
  snout: '#6E5D55',
  mane: '#3A302A',
  young: false,
};
const PIGLET: Hog = {
  coat: '#A0846A',
  dark: '#77604C',
  belly: '#B89D82',
  snout: '#8E6E5C',
  mane: '#6A5240',
  young: true,
};

type HogPose = 'trot' | 'dig' | 'run';

/** A hog standing on its feet at the origin: `phase` sets the legs' gait (0..1). */
function hogStanding(h: Hog, pose: HogPose, phase: number, seed: number): string {
  const rnd = prng(seed);
  const run = pose === 'run';
  const dig = pose === 'dig';
  const bob = run ? -4 * Math.abs(Math.cos(phase * Math.PI * 2)) : 0;
  // Body: a barrel, its front lower when digging (kneeling on the front legs).
  const tilt = dig ? 12 : run ? -3 : 0;
  const bx = -10;
  const by = -108 + bob;
  const out: string[] = [shadow(-125, 150, 5)];
  const s = Math.sin(phase * Math.PI * 2);
  const stride = run ? 34 : 20;
  const lift = run ? 16 : 9;
  // Legs: far pair first (darker), then the near pair.
  const leg = (hipX: number, hipY: number, ph: number, front: boolean, far: boolean): string => {
    const colour = far ? h.dark : h.coat;
    const sw = Math.sin(ph);
    if (dig && front) {
      // Kneeling: the forearm on the ground, the knee down.
      return limb(
        [
          [hipX, hipY],
          [hipX + 6, -14],
          [hipX + 34, -11],
        ],
        13,
        colour,
      );
    }
    const footX = hipX + stride * sw;
    const footY = -Math.max(0, lift * Math.cos(ph));
    const knee: P = [hipX + (footX - hipX) * 0.5 + (front ? 4 : -6), hipY + (footY - hipY) * 0.55];
    return (
      limb([[hipX, hipY], knee, [footX, footY - 4]], front ? 12 : 13, colour) +
      part(ellipseD(footX + 2, footY - 3, 6.5, 4), '#2E2620')
    );
  };
  const p = phase * Math.PI * 2;
  out.push(leg(68, by + 35, p + Math.PI, true, true), leg(-70, by + 30, p, false, true));
  // Tail: up straight like an aerial (trot, run), a little tuft; lower and swishing when digging.
  const tailBase: P = [bx - 112, by - 18];
  const tailTip: P = dig ? [bx - 150, by - 38] : [bx - 120 + 6 * s, by - 112];
  out.push(
    limb(
      [tailBase, [(tailBase[0] + tailTip[0]) / 2 - 2, (tailBase[1] + tailTip[1]) / 2], tailTip],
      4,
      h.dark,
      1.6,
    ),
  );
  out.push(part(ellipseD(tailTip[0], tailTip[1] - 4, 5, 9), h.mane));
  // Body.
  const body = smoothD(
    [
      [bx - 118, by - 6],
      [bx - 95, by - 52],
      [bx - 20, by - 62 + tilt * 0.3],
      [bx + 60, by - 56 + tilt],
      [bx + 98, by - 20 + tilt],
      [bx + 86, by + 34 + tilt],
      [bx + 10, by + 50],
      [bx - 80, by + 46],
      [bx - 116, by + 24],
    ],
    true,
  );
  out.push(part(body, h.coat));
  // Belly shade and a lit back.
  out.push(
    el('path', {
      d: smoothD(
        [
          [bx - 96, by + 28],
          [bx - 10, by + 42],
          [bx + 80, by + 26 + tilt],
          [bx + 40, by + 46],
          [bx - 60, by + 46],
        ],
        true,
      ),
      fill: h.dark,
      opacity: 0.45,
    }),
    el('path', {
      d: smoothD(
        [
          [bx - 90, by - 40],
          [bx - 20, by - 54 + tilt * 0.3],
          [bx + 50, by - 46 + tilt],
          [bx - 10, by - 38],
        ],
        true,
      ),
      fill: shade(h.coat, 0.25),
      opacity: 0.7,
    }),
  );
  // Piglets: faint stripes along the body.
  if (h.young)
    for (let i = 0; i < 4; i++)
      out.push(
        el('path', {
          d: `M${r2(bx - 80 + i * 40)} ${r2(by - 44)}q${r2(14)} ${r2(30)} ${r2(4)} ${r2(70)}`,
          stroke: shade(h.coat, 0.32),
          'stroke-width': 5,
          fill: 'none',
          opacity: 0.6,
        }),
      );
  // Near legs.
  out.push(leg(84, by + 34 + tilt, p, true, false), leg(-56, by + 32, p + Math.PI, false, false));
  // Head: a long flat face sloping down to the snout disc (to the ground when digging).
  const hx = bx + 96;
  const hy = by - 22 + tilt;
  const snout: P = dig ? [hx + 82, -22] : run ? [hx + 96, hy + 48] : [hx + 88, hy + 62];
  const headD = smoothD(
    [
      [hx - 26, hy - 34],
      [hx + 14, hy - 40],
      [hx + 44, (hy - 30 + snout[1] - 14) / 2 - 10],
      [snout[0] + 2, snout[1] - 16],
      [snout[0] + 6, snout[1] + 6],
      [snout[0] - 26, snout[1] + 14],
      [hx + 18, hy + 46],
      [hx - 24, hy + 34],
    ],
    true,
  );
  out.push(part(headD, h.coat));
  // Warts (adults) and the snout disc.
  if (!h.young) {
    const wx = (hx + snout[0]) / 2;
    const wy = (hy + snout[1]) / 2;
    out.push(
      part(ellipseD(wx + 4, wy - 14, 7, 5), h.belly),
      part(ellipseD(hx + 34, hy + 26, 6, 5), h.belly),
    );
  }
  out.push(part(ellipseD(snout[0] + 2, snout[1] - 4, 8, 11), h.snout));
  out.push(el('path', { d: ellipseD(snout[0] + 3, snout[1] - 6, 2, 3), fill: INK }));
  // Tusks curving up out of the snout's sides (adults only).
  if (!h.young)
    out.push(
      el('path', {
        d: `M${r2(snout[0] - 14)} ${r2(snout[1] - 2)}q${r2(-4)} ${r2(-22)} ${r2(-20)} ${r2(-26)}`,
        stroke: INK,
        'stroke-width': 7.5,
        fill: 'none',
        'stroke-linecap': 'round',
      }),
      el('path', {
        d: `M${r2(snout[0] - 14)} ${r2(snout[1] - 2)}q${r2(-4)} ${r2(-22)} ${r2(-20)} ${r2(-26)}`,
        stroke: '#F1E8D2',
        'stroke-width': 4,
        fill: 'none',
        'stroke-linecap': 'round',
      }),
    );
  // Eye and ear.
  const eye: P = [hx + 22, hy - 8 + (dig ? 6 : 0)];
  out.push(el('path', { d: ellipseD(eye[0], eye[1], 3.2, 3.2), fill: INK }));
  out.push(
    part(
      polyD([
        [hx - 16, hy - 30],
        [hx - 34, hy - 54],
        [hx - 2, hy - 38],
      ]),
      h.dark,
    ),
  );
  // The mane: dark strokes along the spine, from the head back to mid-back.
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const mx = hx - 10 - t * 100;
    const my = by - 56 - (1 - t) * 6 + (dig ? (1 - t) * tilt * 0.6 : 0);
    const len = 14 + rnd() * 10;
    out.push(
      el('path', {
        d: `M${r2(mx)} ${r2(my + 4)}l${r2(-6 - rnd() * 4)} ${r2(-len)}`,
        stroke: h.mane,
        'stroke-width': h.young ? 3 : 4,
        'stroke-linecap': 'round',
      }),
    );
  }
  // Dug-up soil at the snout.
  if (dig)
    for (let i = 0; i < 5; i++)
      out.push(
        part(ellipseD(snout[0] + 18 + rnd() * 30, -4 - rnd() * 18, 5 + rnd() * 4, 4), '#7A5434'),
      );
  return g({}, ...out);
}

/** The bagged tumble: rolled over, legs in the air (no blood). Origin at the ground below. */
function hogTumble(h: Hog, seed: number): string {
  return g(
    {},
    shadow(-110, 130, 6),
    g({ transform: 'translate(0 -30) rotate(160 0 -100)' }, hogStanding(h, 'trot', 0.25, seed)),
  );
}

/** Lying still on its side (legs out, the eye shut). */
function hogDown(h: Hog, seed: number): string {
  const rnd = prng(seed);
  const out: string[] = [shadow(-140, 150, 6)];
  for (const [x, a] of [
    [-70, -10],
    [-40, 5],
    [60, -6],
    [90, 8],
  ] as const)
    out.push(
      limb(
        [
          [x, -30],
          [x + 18, -16 + a * 0.4],
          [x + 34, -8],
        ],
        11,
        h.dark,
      ),
    );
  out.push(
    part(
      smoothD(
        [
          [-130, -24],
          [-90, -74],
          [10, -82],
          [100, -64],
          [130, -30],
          [100, -6],
          [0, -2],
          [-100, -4],
        ],
        true,
      ),
      h.coat,
    ),
  );
  out.push(
    part(
      smoothD(
        [
          [104, -62],
          [170, -50],
          [196, -28],
          [186, -12],
          [120, -12],
        ],
        true,
      ),
      h.coat,
    ),
    part(ellipseD(194, -22, 7, 10), h.snout),
    el('path', {
      d: 'M140 -44q8 -4 14 0',
      stroke: INK,
      'stroke-width': 2.5,
      fill: 'none',
      'stroke-linecap': 'round',
    }),
  );
  for (let i = 0; i < 7; i++)
    out.push(
      el('path', {
        d: `M${r2(90 - i * 14)} ${r2(-78 + i)}l${r2(-4)} ${r2(-12 - rnd() * 6)}`,
        stroke: h.mane,
        'stroke-width': 4,
        'stroke-linecap': 'round',
      }),
    );
  return g({}, ...out);
}

function hogFrame(frame: HarvestFrame, seed: number): string {
  const young = frame.startsWith('pg_');
  const h = young ? PIGLET : ADULT;
  const k = (young ? PIGLET_H : WARTHOG_H) / 200;
  const body = (): string => {
    switch (frame) {
      case 'wh_trot_a':
      case 'pg_trot_a':
        return hogStanding(h, 'trot', 0, seed);
      case 'wh_trot_b':
      case 'pg_trot_b':
        return hogStanding(h, 'trot', 0.25, seed);
      case 'wh_trot_c':
        return hogStanding(h, 'trot', 0.5, seed);
      case 'wh_trot_d':
        return hogStanding(h, 'trot', 0.75, seed);
      case 'wh_dig_a':
        return hogStanding(h, 'dig', 0, seed);
      case 'wh_dig_b':
        return g({ transform: 'translate(3 0)' }, hogStanding(h, 'dig', 0.1, seed + 7));
      case 'wh_run_a':
      case 'pg_run':
        return hogStanding(h, 'run', 0.1, seed);
      case 'wh_run_b':
        return hogStanding(h, 'run', 0.6, seed);
      case 'wh_tumble':
        return hogTumble(h, seed);
      default:
        return hogDown(h, seed);
    }
  };
  return g({ transform: `scale(${r2(k)})` }, body());
}

// ---------------------------------------------------------------------------------------------
// The farm workers: drawn at WORKER_H (feet to hat top), facing right.

interface Look {
  readonly skin: string;
  readonly overall: string;
  readonly shirt: string;
  readonly boots: string;
  readonly hat: 'straw' | 'cap' | 'bucket';
  readonly hatColour: string;
  readonly scarf?: string;
  readonly beard?: string;
  readonly tool: 'hammer' | 'pliers' | 'post';
}
const LOOKS: readonly Look[] = [
  {
    skin: '#8A573A',
    overall: '#3F6A9C',
    shirt: '#E7D7B4',
    boots: '#3A2A20',
    hat: 'straw',
    hatColour: '#D9BC72',
    scarf: '#C2463A',
    tool: 'hammer',
  },
  {
    skin: '#6A4128',
    overall: '#4F7A46',
    shirt: '#D9DCE2',
    boots: '#2E2620',
    hat: 'cap',
    hatColour: '#B5542E',
    beard: '#C9C4BC',
    tool: 'pliers',
  },
  {
    skin: '#A06F4C',
    overall: '#A08A5A',
    shirt: '#5E8CB0',
    boots: '#40302A',
    hat: 'bucket',
    hatColour: '#5D6A3C',
    tool: 'post',
  },
];

interface Body {
  /** Hip, shoulder (torso), head centre; far and near legs (hip → knee → foot), far and near
   *  arms (shoulder → elbow → hand). */
  readonly hip: P;
  readonly shoulder: P;
  readonly head: P;
  readonly legs: readonly [readonly P[], readonly P[]];
  readonly arms: readonly [readonly P[], readonly P[]];
  /** Hands over the head (ducking): the face looks down. */
  readonly duck?: boolean;
}

const H = WORKER_H;
function standBody(o: {
  lean?: number;
  armsFar: readonly P[];
  armsNear: readonly P[];
  legs?: readonly [readonly P[], readonly P[]];
}): Body {
  const lean = o.lean ?? 0;
  return {
    hip: [0, -0.46 * H],
    shoulder: [lean, -0.73 * H],
    head: [lean + 3, -0.83 * H],
    legs: o.legs ?? [
      [
        [-4, -0.46 * H],
        [-6, -0.23 * H],
        [-8, -6],
      ],
      [
        [6, -0.46 * H],
        [8, -0.23 * H],
        [10, -6],
      ],
    ],
    arms: [o.armsFar, o.armsNear],
  };
}

function runBody(phase: 0 | 1): Body {
  const a = phase === 0 ? 1 : -1;
  const lean = 10;
  return {
    hip: [0, -0.45 * H],
    shoulder: [lean, -0.72 * H],
    head: [lean + 6, -0.82 * H],
    legs: [
      [
        [-2, -0.45 * H],
        [-14 * a + 8, -0.25 * H],
        [-26 * a, -6 - (a > 0 ? 10 : 0)],
      ],
      [
        [4, -0.45 * H],
        [18 * a + 10, -0.26 * H],
        [24 * a, -6 - (a < 0 ? 10 : 0)],
      ],
    ],
    arms: [
      [
        [lean - 4, -0.7 * H],
        [lean + 16 * a, -0.6 * H],
        [lean + 26 * a, -0.52 * H],
      ],
      [
        [lean + 4, -0.7 * H],
        [lean - 12 * a, -0.6 * H],
        [lean - 4 * a, -0.5 * H],
      ],
    ],
  };
}

function duckBody(): Body {
  return {
    hip: [-8, -0.3 * H],
    shoulder: [14, -0.48 * H],
    head: [24, -0.53 * H],
    legs: [
      [
        [-12, -0.3 * H],
        [18, -0.2 * H],
        [-6, -6],
      ],
      [
        [-4, -0.3 * H],
        [30, -0.17 * H],
        [14, -6],
      ],
    ],
    arms: [
      [
        [10, -0.47 * H],
        [-4, -0.6 * H],
        [18, -0.65 * H],
      ],
      [
        [18, -0.47 * H],
        [44, -0.56 * H],
        [30, -0.64 * H],
      ],
    ],
    duck: true,
  };
}

function tool(kind: Look['tool'], hand: P, angle: number): string {
  if (kind === 'hammer')
    return g(
      { transform: `translate(${r2(hand[0])} ${r2(hand[1])}) rotate(${r2(angle)})` },
      part(
        polyD([
          [-3, 0],
          [3, 0],
          [3, -46],
          [-3, -46],
        ]),
        '#9A6B3E',
      ),
      part(
        polyD([
          [-12, -46],
          [12, -46],
          [12, -58],
          [-12, -58],
        ]),
        '#7D8288',
      ),
    );
  if (kind === 'pliers')
    return g(
      { transform: `translate(${r2(hand[0])} ${r2(hand[1])}) rotate(${r2(angle)})` },
      part(
        polyD([
          [-2, 4],
          [2, 4],
          [4, -22],
          [0, -26],
          [-4, -22],
        ]),
        '#C24A3A',
      ),
      part(
        polyD([
          [-3, -22],
          [3, -22],
          [2, -36],
          [-2, -36],
        ]),
        '#7D8288',
      ),
      // A coil of wire on the arm.
      el('path', {
        d: ellipseD(-6, 10, 12, 8),
        stroke: '#8C8C88',
        'stroke-width': 2.5,
        fill: 'none',
      }),
    );
  return g(
    { transform: `translate(${r2(hand[0])} ${r2(hand[1])}) rotate(${r2(angle)})` },
    part(
      polyD([
        [-6, 26],
        [6, 26],
        [6, -110],
        [-6, -110],
      ]),
      '#B8935F',
    ),
  );
}

function hat(look: Look, head: P): string {
  const [x, y] = head;
  // The hat's top: WORKER_H above the feet when standing (it follows the head when ducking).
  const top = y - 0.17 * WORKER_H;
  if (look.hat === 'straw')
    return g(
      {},
      part(ellipseD(x, y - 16, 38, 8), look.hatColour),
      part(
        smoothD([
          [x - 18, y - 16],
          [x - 14, top + 4],
          [x + 14, top + 2],
          [x + 18, y - 16],
        ]),
        look.hatColour,
      ),
      el('path', {
        d: `M${r2(x - 17)} ${r2(y - 22)}h${r2(34)}`,
        stroke: '#7A3A2E',
        'stroke-width': 4,
      }),
    );
  if (look.hat === 'cap')
    return g(
      {},
      part(
        smoothD([
          [x - 20, y - 8],
          [x - 16, top + 22],
          [x + 14, top + 22],
          [x + 20, y - 8],
        ]),
        look.hatColour,
      ),
      part(
        polyD([
          [x + 14, y - 10],
          [x + 40, y - 6],
          [x + 36, y - 2],
          [x + 12, y - 4],
        ]),
        shade(look.hatColour, -0.2),
      ),
    );
  return g(
    {},
    part(
      smoothD([
        [x - 26, y - 6],
        [x - 18, top + 14],
        [x + 18, top + 14],
        [x + 26, y - 6],
      ]),
      look.hatColour,
    ),
    part(ellipseD(x, y - 6, 30, 6), shade(look.hatColour, -0.15)),
  );
}

function worker(look: Look, b: Body, toolAt: { hand: 0 | 1; angle: number } | null): string {
  const out: string[] = [shadow(-30, 40, 5)];
  const [farLeg, nearLeg] = b.legs;
  const [farArm, nearArm] = b.arms;
  const boot = (pts: readonly P[]): string => {
    const f = pts[pts.length - 1] ?? [0, 0];
    return part(
      smoothD([
        [f[0] - 8, f[1] - 8],
        [f[0] + 14, f[1] - 8],
        [f[0] + 16, f[1] + 4],
        [f[0] - 9, f[1] + 4],
      ]),
      look.boots,
    );
  };
  const shirtArm = (pts: readonly P[], far: boolean): string => {
    const hand = pts[pts.length - 1] ?? [0, 0];
    return (
      limb(pts, 14, far ? shade(look.shirt, -0.2) : look.shirt) +
      part(ellipseD(hand[0], hand[1], 6.5, 6.5), look.skin)
    );
  };
  // Far side first.
  out.push(limb(farLeg, 20, shade(look.overall, -0.22)), boot(farLeg));
  if (toolAt?.hand === 0) {
    const hand = farArm[farArm.length - 1] ?? [0, 0];
    out.push(tool(look.tool, hand, toolAt.angle));
  }
  out.push(shirtArm(farArm, true));
  // Torso: the shirt, then the overall's bib and straps.
  const [sx, sy] = b.shoulder;
  const [hx, hy] = b.hip;
  out.push(
    part(
      smoothD([
        [sx - 20, sy - 4],
        [sx + 20, sy - 2],
        [hx + 20, hy + 6],
        [hx - 20, hy + 6],
      ]),
      look.shirt,
    ),
    part(
      polyD([
        [sx - 13, sy + 12],
        [sx + 13, sy + 12],
        [hx + 20, hy + 8],
        [hx - 20, hy + 8],
      ]),
      look.overall,
    ),
    el('path', {
      d: `M${r2(sx - 13)} ${r2(sy + 12)}L${r2(sx - 14)} ${r2(sy - 2)}M${r2(sx + 13)} ${r2(sy + 12)}L${r2(sx + 12)} ${r2(sy - 2)}`,
      stroke: shade(look.overall, -0.25),
      'stroke-width': 4,
    }),
    // A pocket on the bib.
    el('path', {
      d: polyD([
        [sx - 6, sy + 22],
        [sx + 8, sy + 22],
        [sx + 8, sy + 34],
        [sx - 6, sy + 34],
      ]),
      fill: shade(look.overall, -0.15),
    }),
  );
  out.push(limb(nearLeg, 20, look.overall), boot(nearLeg));
  // Neck and head.
  const [cx, cy] = b.head;
  out.push(
    limb(
      [
        [sx + 2, sy],
        [cx, cy + 10],
      ],
      10,
      look.skin,
    ),
  );
  if (look.scarf !== undefined) out.push(part(ellipseD(cx - 12, cy + 2, 12, 15), look.scarf));
  out.push(part(ellipseD(cx, cy, 16, 19), look.skin));
  if (look.beard !== undefined)
    out.push(
      part(
        smoothD([
          [cx + 2, cy + 11],
          [cx + 15, cy + 9],
          [cx + 11, cy + 22],
          [cx + 3, cy + 21],
        ]),
        look.beard,
      ),
    );
  // A cheerful face (looking down and squinting when ducking).
  if (b.duck === true)
    out.push(
      el('path', {
        d: `M${r2(cx + 4)} ${r2(cy - 2)}l6 2l-6 2`,
        stroke: INK,
        'stroke-width': 2,
        fill: 'none',
      }),
      el('path', {
        d: `M${r2(cx + 4)} ${r2(cy + 9)}q5 -3 9 0`,
        stroke: INK,
        'stroke-width': 2,
        fill: 'none',
      }),
    );
  else
    out.push(
      el('path', { d: ellipseD(cx + 8, cy - 3, 2.2, 2.6), fill: INK }),
      el('path', {
        d: `M${r2(cx + 4)} ${r2(cy + 8)}q5 4 10 -1`,
        stroke: INK,
        'stroke-width': 2,
        fill: 'none',
      }),
    );
  out.push(hat(look, b.head));
  if (toolAt?.hand === 1) {
    const hand = nearArm[nearArm.length - 1] ?? [0, 0];
    out.push(tool(look.tool, hand, toolAt.angle));
  }
  out.push(shirtArm(nearArm, false));
  return g({}, ...out);
}

function workerFrame(n: 0 | 1 | 2, kind: 'run_a' | 'run_b' | 'work_a' | 'work_b' | 'duck'): string {
  const look = LOOKS[n] ?? LOOKS[0];
  if (look === undefined) return '';
  if (kind === 'duck') return worker(look, duckBody(), null);
  if (kind === 'run_a' || kind === 'run_b') {
    const b = runBody(kind === 'run_a' ? 0 : 1);
    return worker(look, b, { hand: 1, angle: look.tool === 'post' ? -60 : 20 });
  }
  const up = kind === 'work_a';
  if (look.tool === 'hammer') {
    // Hammering a post in front of her: the hammer up, then down.
    const near: P[] = up
      ? [
          [4, -0.7 * H],
          [26, -0.82 * H],
          [40, -0.88 * H],
        ]
      : [
          [4, -0.7 * H],
          [30, -0.62 * H],
          [50, -0.56 * H],
        ];
    return worker(
      look,
      standBody({
        lean: 6,
        armsFar: [
          [-4, -0.7 * H],
          [18, -0.6 * H],
          [36, -0.5 * H],
        ],
        armsNear: near,
      }),
      { hand: 1, angle: up ? -30 : 70 },
    );
  }
  if (look.tool === 'pliers') {
    const twist = up ? 0 : 6;
    return worker(
      look,
      standBody({
        lean: 4,
        armsFar: [
          [-2, -0.7 * H],
          [22, -0.62 * H],
          [40, -0.6 * H + twist],
        ],
        armsNear: [
          [6, -0.7 * H],
          [28, -0.6 * H],
          [44, -0.6 * H - twist],
        ],
      }),
      { hand: 1, angle: up ? 70 : 100 },
    );
  }
  // Holding a post upright to set it.
  return worker(
    look,
    standBody({
      lean: up ? 4 : 8,
      armsFar: [
        [-2, -0.7 * H],
        [20, -0.64 * H],
        [34, -0.62 * H],
      ],
      armsNear: [
        [6, -0.7 * H],
        [24, -0.56 * H],
        [36, -0.5 * H],
      ],
    }),
    { hand: 1, angle: up ? 0 : 6 },
  );
}

// ---------------------------------------------------------------------------------------------
// The fence's gap panel (mid layer px 1:1) and the sign.

const POST_H = 140;
const STRANDS = [-30, -55, -80, -105, -128];
const HALF = FENCE_GAP_W / 2;

function post(x: number, angle: number, fresh: boolean): string {
  const c = fresh ? '#B8935F' : '#86643F';
  return g(
    { transform: `translate(${r2(x)} 0) rotate(${r2(angle)})` },
    part(
      polyD([
        [-6, 2],
        [6, 2],
        [5, -POST_H],
        [0, -POST_H - 4],
        [-5, -POST_H],
      ]),
      c,
    ),
    el('path', { d: `M-2 -8L-2 ${-POST_H + 6}`, stroke: shade(c, 0.25), 'stroke-width': 2 }),
  );
}

function wire(x0: number, x1: number, y: number, sag = 3): string {
  return el('path', {
    d: `M${r2(x0)} ${r2(y)}Q${r2((x0 + x1) / 2)} ${r2(y + sag)} ${r2(x1)} ${r2(y)}`,
    stroke: '#6E6E6A',
    'stroke-width': 1.8,
    fill: 'none',
  });
}

/** A snapped wire end curling from (x, y) toward `dir`. */
function curl(x: number, y: number, dir: 1 | -1, len: number): string {
  const d = dir;
  return el('path', {
    d: `M${r2(x)} ${r2(y)}q${r2(d * len * 0.5)} ${r2(4)} ${r2(d * len)} ${r2(14)}q${r2(d * 10)} ${r2(10)} ${r2(0)} ${r2(14)}q${r2(-d * 8)} ${r2(-4)} ${r2(-d * 2)} ${r2(-10)}`,
    stroke: '#6E6E6A',
    'stroke-width': 1.8,
    fill: 'none',
  });
}

function gapFrame(stage: 0 | 1 | 2 | 3 | 4): string {
  const out: string[] = [];
  const x0 = -HALF + 10;
  const x1 = HALF - 10;
  if (stage === 0) {
    // Two posts knocked over and the wire snapped: the gap is open.
    out.push(
      post(x0, -28, false),
      post(x1, 38, false),
      el('path', { d: ellipseD(x1 + 40, -2, 40, 4), fill: '#2A1A10', opacity: 0.2 }),
    );
    for (const y of STRANDS.slice(1, 5)) {
      out.push(curl(-HALF + 4, y + 10, 1, 30 + (y % 7)));
      out.push(curl(HALF - 4, y + 16, -1, 26 + (-y % 5)));
    }
    return g({}, ...out);
  }
  // New posts at both ends and one in the middle, then the strands go up.
  const strands = stage === 4 ? STRANDS.length : stage;
  out.push(post(x0, 0, true), post(0, 0, true), post(x1, 0, true));
  for (let i = 0; i < strands; i++) {
    const y = STRANDS[i] ?? 0;
    out.push(wire(-HALF + 2, 0, y), wire(0, HALF - 2, y));
  }
  // The rest of the wire still coiled on the ground (not yet strung).
  if (stage < 4)
    out.push(
      el('path', {
        d: ellipseD(x1 - 50, -8, 22, 7),
        stroke: '#6E6E6A',
        'stroke-width': 2,
        fill: 'none',
      }),
      el('path', {
        d: ellipseD(x1 - 48, -9, 17, 5),
        stroke: '#6E6E6A',
        'stroke-width': 2,
        fill: 'none',
      }),
    );
  return g({}, ...out);
}

/** The hand-painted sign, hanging from a wire: origin at its top hanging point. */
function signFrame(): string {
  const out: string[] = [];
  out.push(
    el('path', {
      d: 'M0 0L-24 14M0 0L24 14',
      stroke: '#6E6E6A',
      'stroke-width': 1.8,
      fill: 'none',
    }),
    part(
      polyD([
        [-34, 12],
        [34, 14],
        [32, 48],
        [-33, 46],
      ]),
      '#9C7448',
    ),
    el('path', { d: 'M-30 28L30 30', stroke: shade('#9C7448', -0.2), 'stroke-width': 1.5 }),
  );
  const paint = {
    stroke: '#F3ECDD',
    'stroke-width': 4.5,
    fill: 'none',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  };
  // O, E, S as painted strokes (no font in the rasteriser).
  out.push(
    el('path', { d: ellipseD(-18, 30, 8, 10), ...paint }),
    el('path', { d: 'M8 21L-2 21L-2 39L8 40M-2 30L5 30', ...paint }),
    el('path', { d: 'M27 22Q16 18 16 25Q16 30 22 31Q28 32 27 37Q25 42 15 39', ...paint }),
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
