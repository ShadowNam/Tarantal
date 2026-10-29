// v1.7e (D-061, art bible §5.2) The secrets' tell animals, interim art: one small, unique,
// biome-accurate creature per secret, four frames each (rest, act_a, act_b, flee), facing right
// with the feet at the origin, lit from the upper left, soft dark-tone outlines (no black ink).
// Sizes come from the frame boxes (src/game/view/tell/tellSheet.ts). Drawn at 2×.
// Pure: (species, pose) → SVG.
import {
  TELL_SHEET_H,
  TELL_SHEET_W,
  tellFrames,
  type TellPose,
  type TellSpecies,
} from '../../src/game/view/tell/tellSheet';
import type { Rgba } from '../assets/image';
import { renderSvg } from './raster';
import { nextId, shade } from './scenery';
import { el, ellipseD, g, r2, svgDoc } from './svg';

type Attrs = Record<string, string | number>;

const fill = (d: string, c: string, extra: Attrs = {}): string =>
  el('path', { d, fill: c, ...extra });
/** A filled shape with a thin outline in its own darker tone. */
const shape = (d: string, c: string, w = 0.6, extra: Attrs = {}): string =>
  el('path', {
    d,
    fill: c,
    stroke: shade(c, -0.5),
    'stroke-width': w,
    'stroke-linejoin': 'round',
    ...extra,
  });
const line = (d: string, c: string, w: number, extra: Attrs = {}): string =>
  el('path', {
    d,
    fill: 'none',
    stroke: c,
    'stroke-width': w,
    'stroke-linecap': 'round',
    ...extra,
  });
/** An ellipse rotated by `deg` about its centre. */
const ell = (cx: number, cy: number, rx: number, ry: number, deg: number): string =>
  rot(ellipseD(cx, cy, rx, ry), cx, cy, deg);
/** Wraps a path's svg in a rotation (as a group attribute). */
function rot(d: string, cx: number, cy: number, deg: number): string {
  return deg === 0 ? d : `${d}|${r2(deg)} ${r2(cx)} ${r2(cy)}`;
}
/** A path element from a possibly rotated `d` (see rot). */
function p(d: string, attrs: Attrs): string {
  const [path, r] = d.split('|');
  return el('path', {
    d: path ?? '',
    ...attrs,
    ...(r === undefined ? {} : { transform: `rotate(${r})` }),
  });
}
const sh = (d: string, c: string, w = 0.6, extra: Attrs = {}): string =>
  p(d, {
    fill: c,
    stroke: shade(c, -0.5),
    'stroke-width': w,
    'stroke-linejoin': 'round',
    ...extra,
  });
const fl = (d: string, c: string, extra: Attrs = {}): string => p(d, { fill: c, ...extra });

// --- perching birds -----------------------------------------------------------------------

interface BirdLook {
  /** Height feet → crown (prop px). */
  readonly H: number;
  /** Body tilt from upright (deg; 15 upright … 70 horizontal). */
  readonly lean: number;
  readonly back: string;
  readonly belly: string;
  readonly head: string;
  readonly wing: string;
  readonly tail: string;
  readonly beak: string;
  readonly beakLen: number;
  readonly legs: string;
  readonly legLen?: number;
  readonly tailLen: number;
  readonly tailShape: 'fork' | 'square' | 'long' | 'wedge';
  /** Extra marks over the head/body (eye masks, bibs), in the bird's own coordinates. */
  readonly marks?: (pose: TellPose) => string;
  /** What act_a and act_b do. */
  readonly acts: readonly [
    'tail' | 'wings' | 'bob' | 'caw' | 'peck' | 'look' | 'step',
    'tail' | 'wings' | 'bob' | 'caw' | 'peck' | 'look' | 'step',
  ];
  /** Flight colours of the open wing (a roller's blues). */
  readonly flight?: string;
  readonly toes?: number;
}

function bird(b: BirdLook, pose: TellPose): string {
  const H = b.H;
  const act = pose === 'act_a' ? b.acts[0] : pose === 'act_b' ? b.acts[1] : null;
  if (pose === 'flee') return birdFlying(b);
  const leg = (b.legLen ?? 0.14) * H;
  const lean = b.lean + (act === 'peck' ? 30 : act === 'bob' ? 12 : 0);
  const bodyY = -leg - H * 0.26;
  const bodyRx = H * 0.17;
  const bodyRy = H * 0.3;
  const a = (lean * Math.PI) / 180;
  // Head at the top of the tilted body.
  const hx = Math.sin(a) * bodyRy * 1.05 + H * 0.05 + (act === 'peck' ? H * 0.06 : 0);
  const hy =
    bodyY -
    Math.cos(a) * bodyRy * 1.05 +
    (act === 'peck' ? H * 0.12 : act === 'bob' ? H * 0.05 : 0);
  const hr = H * 0.13;
  const look = act === 'look' ? -1 : 1;
  const tailUp = act === 'tail' ? -38 : 0;
  // Tail from the rump, pointing down and back.
  const tx = -Math.sin(a) * bodyRy * 0.85;
  const ty = bodyY + Math.cos(a) * bodyRy * 0.85;
  const tAng = 180 + lean - 15 + tailUp;
  const tl = b.tailLen * H;
  const tailPts = (): string => {
    const r = (tAng * Math.PI) / 180;
    const px = Math.cos(r) * H * 0.07;
    const py = Math.sin(r) * H * 0.07;
    const ex2 = tx + Math.sin(r) * tl;
    const ey2 = ty - Math.cos(r) * tl;
    // Review R9: a deep fork (the drongo's key mark).
    const fork = b.tailShape === 'fork' ? 0.42 : b.tailShape === 'wedge' ? -0.15 : 0;
    const wide = b.tailShape === 'square' || b.tailShape === 'fork' ? 1.5 : 1;
    const nx = Math.cos(r);
    const ny = Math.sin(r);
    const tipL = [ex2 - nx * H * 0.07 * wide, ey2 - ny * H * 0.07 * wide];
    const tipR = [ex2 + nx * H * 0.07 * wide, ey2 + ny * H * 0.07 * wide];
    const notch = [ex2 - Math.sin(r) * tl * fork, ey2 + Math.cos(r) * tl * fork];
    return `M${r2(tx - px)} ${r2(ty - py)}L${r2(tipL[0] ?? 0)} ${r2(tipL[1] ?? 0)}L${r2(notch[0] ?? 0)} ${r2(notch[1] ?? 0)}L${r2(tipR[0] ?? 0)} ${r2(tipR[1] ?? 0)}L${r2(tx + px)} ${r2(ty + py)}Z`;
  };
  const parts: string[] = [];
  // Legs and toes on the perch.
  const stride = act === 'step' ? leg * 0.45 : 0;
  parts.push(
    line(
      `M${r2(-1.2 - stride)} 0L${r2(-0.6)} ${r2(-leg - 1)}M${r2(1.4 + stride)} ${r2(stride > 0 ? -leg * 0.15 : 0)}L${r2(1.2)} ${r2(-leg - 1)}`,
      b.legs,
      Math.max(0.7, H * 0.03),
    ),
  );
  const toes = b.toes ?? 0;
  if (toes > 0)
    // The jacana's long splayed toes (its key mark, review R9).
    parts.push(
      line(
        `M${r2(-toes / 2)} 0.6L${r2(toes / 2)} -0.4M0 0L${r2(-toes * 0.3)} 1.6M0 0L${r2(toes * 0.35)} 1.4`,
        b.legs,
        1.1,
      ),
    );
  parts.push(shape(tailPts(), b.tail, 0.5));
  // Body: back colour, a belly front, the wing over it.
  parts.push(sh(ell(0, bodyY, bodyRx, bodyRy, lean), b.back, 0.6));
  parts.push(
    fl(
      ell(Math.cos(a) * bodyRx * 0.35, bodyY + H * 0.02, bodyRx * 0.72, bodyRy * 0.86, lean),
      b.belly,
    ),
  );
  if (act === 'wings') {
    // Wings half open (landing / stretching): the flight colour shows.
    const wc = b.flight ?? b.wing;
    parts.push(sh(ell(-bodyRx * 0.9, bodyY - H * 0.12, H * 0.08, H * 0.3, -30), wc, 0.5));
    parts.push(
      sh(ell(bodyRx * 0.4, bodyY - H * 0.18, H * 0.08, H * 0.3, 25), shade(wc, -0.15), 0.5),
    );
  } else
    parts.push(
      sh(ell(-bodyRx * 0.3, bodyY + H * 0.02, bodyRx * 0.7, bodyRy * 0.8, lean + 6), b.wing, 0.5),
    );
  // Head, beak (open for a caw), eye.
  const bx = hx + hr * 0.8 * look;
  const by = hy + hr * 0.1 + (act === 'caw' ? -hr * 0.2 : 0);
  const bl = b.beakLen * H;
  const up = act === 'caw' ? -0.35 : 0.05;
  parts.push(sh(ellipseD(hx, hy, hr, hr * 0.92), b.head, 0.6));
  if (act === 'caw')
    parts.push(
      shape(
        `M${r2(bx)} ${r2(by - hr * 0.25)}L${r2(bx + bl * look)} ${r2(by - hr * 0.25 + bl * up)}L${r2(bx)} ${r2(by)}Z`,
        b.beak,
        0.4,
      ),
      shape(
        `M${r2(bx)} ${r2(by + hr * 0.05)}L${r2(bx + bl * 0.9 * look)} ${r2(by + bl * 0.15)}L${r2(bx)} ${r2(by + hr * 0.3)}Z`,
        b.beak,
        0.4,
      ),
    );
  else
    parts.push(
      shape(
        `M${r2(bx)} ${r2(by - hr * 0.28)}L${r2(bx + bl * look)} ${r2(by + bl * up)}L${r2(bx)} ${r2(by + hr * 0.28)}Z`,
        b.beak,
        0.4,
      ),
    );
  parts.push(
    fill(ellipseD(hx + hr * 0.38 * look, hy - hr * 0.15, hr * 0.22, hr * 0.22), '#120E0C'),
    fill(ellipseD(hx + hr * 0.32 * look, hy - hr * 0.24, hr * 0.07, hr * 0.07), '#FFFFFF', {
      opacity: 0.9,
    }),
  );
  if (b.marks !== undefined)
    parts.push(g({ transform: `translate(${r2(hx)} ${r2(hy)}) scale(${look} 1)` }, b.marks(pose)));
  // Light from the upper left.
  parts.push(
    fill(ell(-bodyRx * 0.3, bodyY - bodyRy * 0.4, bodyRx * 0.5, bodyRy * 0.3, lean), '#FFFFFF', {
      opacity: 0.12,
    }),
  );
  return g({}, ...parts);
}

/** The bird leaving: body level, wings up (flying off to the left behind the prop). */
function birdFlying(b: BirdLook): string {
  const H = b.H;
  const y = -H * 0.55;
  const wc = b.flight ?? b.wing;
  return g(
    {},
    shape(
      `M${r2(-H * 0.2)} ${r2(y)}L${r2(-H * 0.55)} ${r2(y - H * 0.08)}L${r2(-H * 0.52)} ${r2(y + H * 0.08)}Z`,
      b.tail,
      0.5,
    ),
    sh(ell(-H * 0.02, y - H * 0.18, H * 0.1, H * 0.3, -25), wc, 0.5),
    sh(ell(0, y, H * 0.28, H * 0.12, 0), b.back, 0.6),
    fl(ell(H * 0.02, y + H * 0.05, H * 0.22, H * 0.07, 0), b.belly),
    sh(ell(H * 0.06, y - H * 0.16, H * 0.09, H * 0.26, 30), shade(wc, -0.12), 0.5),
    sh(ellipseD(H * 0.3, y - H * 0.04, H * 0.11, H * 0.1), b.head, 0.5),
    shape(
      `M${r2(H * 0.4)} ${r2(y - H * 0.06)}L${r2(H * 0.4 + b.beakLen * H)} ${r2(y - H * 0.02)}L${r2(H * 0.4)} ${r2(y + H * 0.01)}Z`,
      b.beak,
      0.4,
    ),
    fill(ellipseD(H * 0.33, y - H * 0.06, H * 0.025, H * 0.025), '#120E0C'),
  );
}

// --- the birds ----------------------------------------------------------------------------

const DRONGO: BirdLook = {
  H: 36,
  lean: 12,
  back: '#1C1C22',
  belly: '#26262E',
  head: '#1E1E26',
  wing: '#2A2A34',
  tail: '#18181E',
  beak: '#141418',
  beakLen: 0.16,
  legs: '#1A1A1A',
  tailLen: 0.66,
  tailShape: 'fork',
  acts: ['tail', 'look'],
  marks: () => fill(ellipseD(0.4, -1.1, 1.3, 1.3), '#B8302A', { opacity: 0.9 }),
};
const ROLLER: BirdLook = {
  H: 40,
  lean: 14,
  back: '#A08A58',
  belly: '#4CC4D4',
  head: '#6EB49A',
  wing: '#2A86DA',
  tail: '#2E5E9A',
  beak: '#1E1E22',
  beakLen: 0.2,
  legs: '#4A4A3E',
  tailLen: 0.5,
  tailShape: 'square',
  acts: ['wings', 'look'],
  flight: '#2C6FCF',
  marks: () =>
    g(
      {},
      // The lilac breast and throat, a dark eye stripe.
      fill(ellipseD(1.5, 5.5, 5.4, 4.4), '#C084DC', { opacity: 1 }),
      line('M-2.8 -0.6L3.6 -0.6', '#2A2A2A', 0.9, { opacity: 0.7 }),
      fill(ellipseD(-1.2, -3.2, 3.4, 1.8), '#D8E0C0', { opacity: 0.5 }),
    ),
};
const KESTREL: BirdLook = {
  H: 40,
  lean: 10,
  back: '#C0582A',
  belly: '#D8844E',
  head: '#76808E',
  wing: '#B4542A',
  tail: '#7E828C',
  beak: '#3A3634',
  beakLen: 0.12,
  legs: '#D8A830',
  tailLen: 0.55,
  tailShape: 'square',
  acts: ['bob', 'tail'],
  marks: () =>
    g(
      {},
      fill(ellipseD(0.8, 0.2, 1.6, 1.6), '#E8C040', { opacity: 0.9 }),
      line('M1.2 1.8L0.6 4.6', '#2A2624', 0.8, { opacity: 0.7 }),
    ),
};
const WAGTAIL: BirdLook = {
  H: 22,
  lean: 62,
  back: '#6E6A62',
  belly: '#E8E2D6',
  head: '#6A665E',
  wing: '#5E5A54',
  tail: '#3E3A36',
  beak: '#1E1C1A',
  beakLen: 0.2,
  legs: '#2A2622',
  legLen: 0.2,
  tailLen: 0.65,
  tailShape: 'long',
  acts: ['tail', 'bob'],
  marks: () => line('M-2 2.6Q0.6 4.2 3 2.6', '#2E2A26', 0.9),
};
const FISCAL: BirdLook = {
  H: 32,
  lean: 10,
  back: '#1E1C1C',
  belly: '#F2EEE6',
  head: '#1C1A1A',
  wing: '#1E1C1C',
  tail: '#141212',
  beak: '#141414',
  beakLen: 0.15,
  legs: '#1A1A1A',
  tailLen: 0.62,
  tailShape: 'wedge',
  acts: ['tail', 'look'],
  marks: () => fill(ellipseD(-3, 9, 1.4, 4), '#F2EEE6', { opacity: 0.95 }),
};
const CROW: BirdLook = {
  H: 56,
  lean: 16,
  back: '#16161A',
  belly: '#F2F0EC',
  head: '#141418',
  wing: '#1E1E24',
  tail: '#121216',
  beak: '#141416',
  beakLen: 0.2,
  legs: '#141414',
  tailLen: 0.42,
  tailShape: 'square',
  acts: ['caw', 'wings'],
};
const KINGFISHER: BirdLook = {
  H: 26,
  lean: 14,
  back: '#1E7CDA',
  belly: '#E8783A',
  head: '#2A8EE6',
  wing: '#1666C8',
  tail: '#1458B0',
  beak: '#D8341E',
  beakLen: 0.24,
  legs: '#D8341E',
  tailLen: 0.3,
  tailShape: 'square',
  acts: ['bob', 'look'],
  marks: () =>
    g(
      {},
      fill(ellipseD(0, -2.2, 2.8, 1.6), '#5EC8A8', { opacity: 0.9 }),
      fill(ellipseD(1.6, 2.2, 1.6, 1.1), '#F4F0E4', { opacity: 0.95 }),
    ),
};
const OXPECKER: BirdLook = {
  H: 22,
  lean: 55,
  back: '#7A6248',
  belly: '#C8AE84',
  head: '#7A6248',
  wing: '#6A543E',
  tail: '#5E4A36',
  beak: '#D8301E',
  beakLen: 0.24,
  legs: '#3E3228',
  legLen: 0.16,
  tailLen: 0.5,
  tailShape: 'wedge',
  acts: ['peck', 'look'],
  marks: () => fill(ellipseD(1.1, -0.8, 1.4, 1.4), '#E8C430', { opacity: 0.95 }),
};
const JACANA: BirdLook = {
  H: 72,
  lean: 30,
  back: '#A23C1A',
  belly: '#8E3218',
  head: '#F2EEE6',
  wing: '#B0441E',
  tail: '#6E2E1A',
  beak: '#4A7EC8',
  beakLen: 0.13,
  legs: '#5E6A6E',
  legLen: 0.42,
  tailLen: 0.22,
  tailShape: 'square',
  acts: ['step', 'wings'],
  toes: 36,
  marks: () =>
    g(
      {},
      // The black nape and the white face, the blue frontal shield.
      fill(ellipseD(-4, -1, 5, 6.5), '#141414', { opacity: 0.95 }),
      fill(ellipseD(6.4, -6.6, 2.4, 3.2), '#4A7EC8'),
      fill(ellipseD(2, 7, 5, 4), '#E8C060', { opacity: 0.85 }),
    ),
};

// --- reptiles -----------------------------------------------------------------------------

interface LizardLook {
  /** Snout to tail tip (prop px). */
  readonly L: number;
  readonly body: string;
  readonly belly: string;
  readonly head: string;
  readonly tail: string;
  readonly stripes?: string;
  readonly speckle?: string;
}

function lizard(z: LizardLook, pose: TellPose): string {
  const L = z.L;
  const up = pose === 'act_a';
  const bob = pose === 'act_b';
  const run = pose === 'flee';
  // Body from hips (−0.12L) to shoulders (0.16L); head ahead; the tail trails behind.
  const lift = up ? L * 0.12 : bob ? L * 0.02 : 0;
  const hipY = -L * 0.05;
  const shY = -L * 0.06 - lift;
  const headY = shY - (up ? L * 0.05 : bob ? -L * 0.02 : 0);
  const parts: string[] = [];
  const curve = run ? L * 0.08 : 0;
  // Tail.
  parts.push(
    shape(
      `M${r2(-L * 0.12)} ${r2(hipY - L * 0.035)}Q${r2(-L * 0.3)} ${r2(hipY + curve - L * 0.02)} ${r2(-L * 0.52)} ${r2(hipY - L * 0.005 - curve)}Q${r2(-L * 0.3)} ${r2(hipY + curve + L * 0.02)} ${r2(-L * 0.12)} ${r2(hipY + L * 0.03)}Z`,
      z.tail,
      0.5,
    ),
  );
  // Legs (front ones straight under the shoulders in a push-up).
  const legW = Math.max(0.9, L * 0.025);
  const fl0 = up
    ? `M${r2(L * 0.14)} ${r2(shY)}L${r2(L * 0.16)} 0`
    : `M${r2(L * 0.13)} ${r2(shY + L * 0.02)}L${r2(L * 0.2)} 0`;
  const hl0 = `M${r2(-L * 0.1)} ${r2(hipY + L * 0.02)}L${r2(run ? -L * 0.2 : -L * 0.16)} 0`;
  parts.push(line(`${fl0}${hl0}`, shade(z.body, -0.3), legW));
  // Body.
  parts.push(
    shape(
      `M${r2(-L * 0.13)} ${r2(hipY)}Q${r2(0)} ${r2(Math.min(hipY, shY) - L * 0.07)} ${r2(L * 0.17)} ${r2(shY)}Q${r2(L * 0.02)} ${r2(Math.max(hipY, shY) + L * 0.06)} ${r2(-L * 0.13)} ${r2(hipY)}Z`,
      z.body,
      0.6,
    ),
  );
  if (z.stripes !== undefined)
    parts.push(
      line(
        `M${r2(-L * 0.4)} ${r2(hipY - L * 0.005)}Q${r2(0)} ${r2(Math.min(hipY, shY) - L * 0.035)} ${r2(L * 0.15)} ${r2(shY - L * 0.01)}`,
        z.stripes,
        Math.max(0.6, L * 0.012),
        { opacity: 0.85 },
      ),
    );
  if (z.speckle !== undefined)
    for (let k = 0; k < 6; k++)
      parts.push(
        fill(
          ellipseD(
            -L * 0.08 + k * L * 0.04,
            hipY + (shY - hipY) * (k / 6) - L * 0.02,
            L * 0.008,
            L * 0.008,
          ),
          z.speckle,
        ),
      );
  // Head: a blunt wedge.
  const hx = L * 0.22;
  parts.push(
    shape(
      `M${r2(L * 0.14)} ${r2(headY - L * 0.035)}Q${r2(hx + L * 0.06)} ${r2(headY - L * 0.04)} ${r2(hx + L * 0.1)} ${r2(headY + L * 0.005)}Q${r2(hx + L * 0.04)} ${r2(headY + L * 0.04)} ${r2(L * 0.14)} ${r2(headY + L * 0.035)}Z`,
      z.head,
      0.5,
    ),
    fill(ellipseD(hx + L * 0.03, headY - L * 0.008, L * 0.011, L * 0.011), '#120E0C'),
  );
  if (bob)
    parts.push(
      line(
        `M${r2(hx + L * 0.1)} ${r2(headY + L * 0.005)}l${r2(L * 0.05)} ${r2(L * 0.01)}`,
        '#C83A4A',
        0.6,
      ),
    );
  return g({}, ...parts);
}

const AGAMA: LizardLook = {
  L: 50,
  body: '#7A6E5E',
  belly: '#C8B898',
  // Review R9: the breeding male's bright blue head and an orange-tinged tail.
  head: '#2C7CF2',
  tail: '#D88A3C',
  stripes: '#E8B850',
  speckle: '#D8CDB4',
};
// Review R9: near-black body, bright cream stripes and a coppery tail, so it reads on grey granite.
const SKINK: LizardLook = {
  L: 40,
  body: '#2E2620',
  belly: '#C8B898',
  head: '#3A2E24',
  tail: '#A8643A',
  stripes: '#FFF2C8',
};

function chameleon(pose: TellPose): string {
  const body = pose === 'act_b' ? '#5E7A3A' : '#8AAE4A';
  const step = pose === 'act_a' ? 3 : 0;
  const flat = pose === 'flee';
  const sy = flat ? 0.6 : 1;
  const parts: string[] = [
    // The coiled tail.
    line('M-12 -10Q-20 -8 -19 -2Q-18 3 -14 1Q-12 -1 -14.5 -2.5', shade(body, -0.25), 2.4),
    // Legs gripping the branch (feet at y 0).
    line(`M-8 -8L-10 0M${r2(8 + step)} -8L${r2(10 + step)} 0`, shade(body, -0.3), 1.6),
    sh(
      `M-13 ${r2(-9 * sy)}Q-6 ${r2(-22 * sy)} 6 ${r2(-19 * sy)}Q14 ${r2(-15 * sy)} 15 ${r2(-9 * sy)}Q4 ${r2(-3 * sy)} -13 ${r2(-9 * sy)}Z`,
      body,
      0.6,
    ),
    // The flap-necked casque and head.
    sh(
      `M${r2(12 + step * 0.3)} ${r2(-15 * sy)}L${r2(22 + step)} ${r2(-12 * sy)}L${r2(13 + step * 0.3)} ${r2(-8 * sy)}Z`,
      shade(body, 0.05),
      0.5,
    ),
    // The pale side stripe and turret eye (swivelled back in act_a).
    line(`M-10 ${r2(-10 * sy)}Q2 ${r2(-13 * sy)} 12 ${r2(-11 * sy)}`, '#E8E6B0', 1, {
      opacity: 0.85,
    }),
    sh(ellipseD(17 + step * 0.6, -12.5 * sy, 2.2, 2.2), shade(body, 0.15), 0.4),
    fill(
      ellipseD(17 + step * 0.6 + (pose === 'act_a' ? -0.8 : 0.8), -12.5 * sy, 0.8, 0.8),
      '#120E0C',
    ),
  ];
  return g({}, ...parts);
}

function stripedMouse(pose: TellPose): string {
  const fur = '#A8865E';
  const sit = pose === 'act_a';
  const run = pose === 'flee';
  const parts: string[] = [];
  // The long thin tail.
  parts.push(line(run ? 'M-16 -8Q-30 -14 -36 -6' : 'M-16 -6Q-28 -2 -36 -6', '#B08A70', 1.4));
  if (sit) {
    parts.push(
      sh(ellipseD(-4, -13, 12, 12), fur, 0.7),
      // Four dark stripes down the back.
      line('M-12 -22Q-10 -12 -10 -3M-8 -24Q-5 -13 -5 -2M-3 -25Q0 -14 0 -2', '#3E2E22', 1.6, {
        opacity: 0.8,
      }),
      sh(ellipseD(6, -26, 7, 6.2), fur, 0.6),
      sh(ellipseD(3, -32, 2.6, 3), '#C89A86', 0.4),
      fill(ellipseD(9, -27, 1.4, 1.4), '#120E0C'),
      fill(ellipseD(12.6, -24.6, 1, 0.9), '#3A2420'),
      // Forepaws holding a seed.
      fill(ellipseD(8, -17, 2.2, 1.6), '#D8C090'),
    );
  } else {
    const dy = run ? -1 : 0;
    parts.push(
      line(run ? 'M-8 -4L-14 0M10 -4L16 0' : 'M-8 -4L-8 0M10 -4L11 0', '#7A5E44', 1.6),
      sh(
        `M-17 ${-6 + dy}Q-12 ${-19 + dy} 4 ${-17 + dy}Q14 ${-15 + dy} 16 ${-8 + dy}Q2 ${-1 + dy} -17 ${-6 + dy}Z`,
        fur,
        0.7,
      ),
      line(
        `M-14 ${-10 + dy}Q-2 ${-17 + dy} 12 ${-13 + dy}M-14 ${-7 + dy}Q-2 ${-13.5 + dy} 13 ${-10 + dy}`,
        '#3E2E22',
        1.5,
        { opacity: 0.8 },
      ),
      sh(ellipseD(18, -11 + dy, 7, 5.6), fur, 0.6),
      sh(ellipseD(14, -16 + dy, 2.6, 3), '#C89A86', 0.4),
      fill(ellipseD(20, -12.5 + dy, 1.4, 1.4), '#120E0C'),
      fill(ellipseD(25, -10 + dy, 1, 0.9), '#3A2420'),
    );
    if (pose === 'act_b') parts.push(line('M24 -10l6 -2M24 -9.4l6 1', '#5E4A3A', 0.4));
  }
  return g({}, ...parts);
}

function drawTell(species: TellSpecies, pose: TellPose): string {
  switch (species) {
    case 'fork_tailed_drongo':
      return bird(DRONGO, pose);
    case 'rock_agama':
      return lizard(AGAMA, pose);
    case 'striped_skink':
      return lizard(SKINK, pose);
    case 'lilac_breasted_roller':
      return bird(ROLLER, pose);
    case 'flap_necked_chameleon':
      return chameleon(pose);
    case 'rock_kestrel':
      return bird(KESTREL, pose);
    case 'cape_wagtail':
      return bird(WAGTAIL, pose);
    case 'fiscal_shrike':
      return bird(FISCAL, pose);
    case 'striped_mouse':
      return stripedMouse(pose);
    case 'pied_crow':
      return bird(CROW, pose);
    case 'malachite_kingfisher':
      return bird(KINGFISHER, pose);
    case 'red_billed_oxpecker':
      return bird(OXPECKER, pose);
    case 'african_jacana':
      // The lily-trotter on its own floating leaf (not in flight).
      return pose === 'flee'
        ? bird(JACANA, pose)
        : g(
            {},
            shape(ellipseD(0, 1.5, 26, 5), '#4E8A3E', 0.6),
            fill(ellipseD(-4, 0.6, 16, 2.4), '#6EA654', { opacity: 0.8 }),
            bird(JACANA, pose),
          );
  }
}

/** The sheet at `k` texture px per prop px. */
export function renderTellSheet(k: number): Rgba {
  const cells = tellFrames().map((f) => {
    const id = nextId();
    return g(
      {},
      el('clipPath', { id }, el('rect', { x: f.x, y: f.y, width: f.w, height: f.h })),
      g(
        { 'clip-path': `url(#${id})` },
        g(
          { transform: `translate(${r2(f.x + f.ox)} ${r2(f.y + f.oy)})` },
          drawTell(f.species, f.pose),
        ),
      ),
    );
  });
  return renderSvg(
    svgDoc(
      TELL_SHEET_W * k,
      TELL_SHEET_H * k,
      [0, 0, TELL_SHEET_W, TELL_SHEET_H],
      '',
      g({}, ...cells),
    ),
  );
}
