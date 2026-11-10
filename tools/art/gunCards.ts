// v1.19 (D-084, the owner on 8 Nov: "in the gun shed the guns still look very very primitive, get
// the graphics up"): a painted side view of every gun for its Gun Shed card, muzzle to the right,
// in one sheet (src/game/ui/shedGunSheet.ts). Each picture is drawn in its cell's 380 × 140 design
// px and rendered at SHED_GUN_MASTER×: rounded metal (blued steel, engraved silver, brass) with a
// highlight along the top, wood with grain and figure, checkering, screws, a soft shadow under the
// gun. A warm-black ink line keeps every gun readable at phone card size. No brands or logos.
import {
  SHED_GUN_CELL,
  SHED_GUN_COLS,
  SHED_GUN_MASTER,
  SHED_GUN_ORDER,
  SHED_GUN_SHEET_H,
  SHED_GUN_SHEET_W,
  type ShedGunId,
} from '../../src/game/ui/shedGunSheet';
import type { Rgba } from '../assets/image';
import { renderSvg } from './raster';
import { el, ellipseD, g, polyD, prng, r2, smoothD, svgDoc } from './svg';

type Pt = readonly [number, number];

const INK = '#1B1410';
const LINE = 1.3;

/** Material ramps: [edge shadow, highlight, body, shadow, deep]. Light from the top. */
const MAT = {
  blued: ['#1E2126', '#8F98A2', '#3A3F47', '#23262B', '#111215'],
  steel: ['#3C4146', '#C9CFD4', '#7D858C', '#4E555B', '#2A2E32'],
  silver: ['#6E767D', '#F1F3F4', '#C3C9CE', '#8C949A', '#5A6167'],
  brass: ['#7E5F1A', '#FBE6A0', '#D2AA45', '#9C7A24', '#6A4F12'],
  wood: ['#4A2D14', '#C08A50', '#8E5C2C', '#663E1C', '#3E2410'],
  walnut: ['#3A2210', '#A8703E', '#734522', '#52301A', '#2E1A0C'],
  lightWood: ['#7A5228', '#E2BC86', '#C0915A', '#93683A', '#6A4722'],
  rubber: ['#140F0D', '#4A403B', '#2A2421', '#1A1513', '#0E0B0A'],
  green: ['#1F3F1E', '#7FBF6A', '#3F7D3A', '#2C5C29', '#1A3518'],
  leather: ['#3E2410', '#B07A48', '#7A4E2A', '#55341A', '#36200E'],
  bark: ['#3A2A1A', '#A88A62', '#6E5638', '#4E3C26', '#2C2014'],
} as const;
type Mat = keyof typeof MAT;
const GRAIN = '#2A1608';

class Art {
  private n = 0;
  readonly defs: string[] = [];
  readonly id = (p: string): string => `${p}${this.n++}`;

  /** A rounded-surface gradient across the part's height (or width with `across = 'x'`). */
  grad(mat: Mat, across: 'y' | 'x' = 'y'): string {
    const id = this.id('m');
    const [edge, hi, body, sh, deep] = MAT[mat];
    const stop = (o: number, c: string): string => el('stop', { offset: o, 'stop-color': c });
    this.defs.push(
      el(
        'linearGradient',
        { id, x1: 0, y1: 0, x2: across === 'x' ? 1 : 0, y2: across === 'y' ? 1 : 0 },
        stop(0, edge),
        stop(0.18, hi),
        stop(0.42, body),
        stop(0.78, sh),
        stop(1, deep),
      ),
    );
    return `url(#${id})`;
  }

  clip(d: string): string {
    const id = this.id('c');
    this.defs.push(el('clipPath', { id }, el('path', { d })));
    return `url(#${id})`;
  }

  blur(sd: number): string {
    const id = this.id('b');
    this.defs.push(
      el(
        'filter',
        { id, x: '-30%', y: '-60%', width: '160%', height: '220%' },
        el('feGaussianBlur', { stdDeviation: sd }),
      ),
    );
    return `url(#${id})`;
  }
}

/** A shaded part with its ink line. */
function part(a: Art, d: string, mat: Mat, across: 'y' | 'x' = 'y', line = LINE): string {
  return el('path', {
    d,
    fill: a.grad(mat, across),
    stroke: INK,
    'stroke-width': line,
    'stroke-linejoin': 'round',
  });
}

/** A thin light line along an edge (the top of a barrel, a sharp corner). */
function shine(d: string, opacity = 0.55, w = 1.1, colour = '#FFFFFF'): string {
  return el('path', {
    d,
    fill: 'none',
    stroke: colour,
    'stroke-width': w,
    'stroke-linecap': 'round',
    opacity,
  });
}

function stroke(d: string, colour: string, w: number, opacity = 1): string {
  return el('path', {
    d,
    fill: 'none',
    stroke: colour,
    'stroke-width': w,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    opacity,
  });
}

/**
 * Wood: the shaded fill, grain running along the part (wavy lines that bunch near the edges),
 * a few dark figure streaks, then the ink line on top. `box` bounds the grain lines.
 */
function wood(
  a: Art,
  d: string,
  box: readonly [number, number, number, number],
  seed: number,
  mat: Mat = 'wood',
): string {
  const rnd = prng(seed);
  const [x0, y0, x1, y1] = box;
  const lines: string[] = [];
  const rows = Math.max(5, Math.round((y1 - y0) / 3.2));
  for (let k = 0; k < rows; k++) {
    const y = y0 + ((k + rnd() * 0.6) / rows) * (y1 - y0);
    const amp = 0.8 + rnd() * 2.2;
    const wl = 30 + rnd() * 50;
    const ph = rnd() * wl;
    const pts: Pt[] = [];
    for (let x = x0 - 4; x <= x1 + 4; x += 6) {
      pts.push([x, y + amp * Math.sin(((x + ph) / wl) * Math.PI * 2)]);
    }
    lines.push(stroke(smoothD(pts, false), GRAIN, 0.5 + rnd() * 0.5, 0.18 + rnd() * 0.22));
  }
  // Figure: a few long dark streaks and one or two knots of curl.
  for (let k = 0; k < 3; k++) {
    const y = y0 + rnd() * (y1 - y0);
    const xa = x0 + rnd() * (x1 - x0) * 0.6;
    const len = (x1 - x0) * (0.2 + rnd() * 0.3);
    lines.push(
      stroke(
        `M${r2(xa)} ${r2(y)}q${r2(len / 2)} ${r2(-2 - rnd() * 3)} ${r2(len)} ${r2(rnd() * 2)}`,
        GRAIN,
        1.4,
        0.18,
      ),
    );
  }
  const cx = x0 + (0.25 + rnd() * 0.5) * (x1 - x0);
  const cy = y0 + (0.3 + rnd() * 0.4) * (y1 - y0);
  lines.push(stroke(ellipseD(cx, cy, 5 + rnd() * 3, 1.6 + rnd()), GRAIN, 0.7, 0.3));
  lines.push(stroke(ellipseD(cx, cy, 9 + rnd() * 3, 3 + rnd()), GRAIN, 0.6, 0.18));
  return [
    el('path', { d, fill: a.grad(mat) }),
    g({ 'clip-path': a.clip(d) }, ...lines),
    el('path', {
      d,
      fill: 'none',
      stroke: INK,
      'stroke-width': LINE,
      'stroke-linejoin': 'round',
    }),
  ].join('');
}

/** Diamond checkering (a grip): crossing fine lines clipped to `d`. */
function checkering(a: Art, d: string, box: readonly [number, number, number, number]): string {
  const [x0, y0, x1, y1] = box;
  const out: string[] = [];
  for (let x = x0 - (y1 - y0); x < x1; x += 3) {
    out.push(`M${r2(x)} ${r2(y1)}L${r2(x + (y1 - y0))} ${r2(y0)}`);
    out.push(`M${r2(x)} ${r2(y0)}L${r2(x + (y1 - y0))} ${r2(y1)}`);
  }
  return g(
    { 'clip-path': a.clip(d) },
    stroke(out.join(''), GRAIN, 0.6, 0.55),
    el('path', { d, fill: 'none', stroke: GRAIN, 'stroke-width': 0.8, opacity: 0.6 }),
  );
}

/** A slotted screw head. */
function screw(cx: number, cy: number, r: number, rot = 30): string {
  const a = (rot * Math.PI) / 180;
  const dx = Math.cos(a) * r * 0.8;
  const dy = Math.sin(a) * r * 0.8;
  return [
    el('path', {
      d: ellipseD(cx, cy, r, r),
      fill: '#AEB5BA',
      stroke: INK,
      'stroke-width': 0.7,
    }),
    stroke(`M${r2(cx - dx)} ${r2(cy - dy)}L${r2(cx + dx)} ${r2(cy + dy)}`, '#3A3F44', 0.8),
  ].join('');
}

/** Engraved scrolls on a side plate: little spirals and leaf curls clipped to the plate. */
function engraving(a: Art, d: string, cx: number, cy: number, w: number, h: number): string {
  const rnd = prng(Math.round(cx * 7 + cy));
  const out: string[] = [];
  for (let k = 0; k < 5; k++) {
    const x = cx - w / 2 + rnd() * w;
    const y = cy - h / 2 + rnd() * h;
    const r = 2 + rnd() * 3;
    out.push(
      `M${r2(x)} ${r2(y)}a${r2(r)} ${r2(r)} 0 1 1 ${r2(r * 0.9)} ${r2(r * 0.6)}a${r2(r * 0.6)} ${r2(r * 0.6)} 0 1 1 ${r2(-r * 0.5)} ${r2(-r * 0.8)}`,
    );
    out.push(
      `M${r2(x + r)} ${r2(y)}q${r2(4 + rnd() * 4)} ${r2(-3 - rnd() * 2)} ${r2(8 + rnd() * 6)} ${r2(rnd() * 3)}`,
    );
  }
  return g({ 'clip-path': a.clip(d) }, stroke(out.join(''), '#5E666D', 0.6, 0.8));
}

/** A soft shadow under the gun, as if it lay on the card. */
function cardShadow(a: Art, x0: number, x1: number, y: number): string {
  return el('path', {
    d: ellipseD((x0 + x1) / 2, y, (x1 - x0) / 2, 5),
    fill: '#000000',
    opacity: 0.28,
    filter: a.blur(3),
  });
}

/** A cylinder (barrel, tube) from x0 to x1, top y, height h, with a top shine. */
function tube(a: Art, x0: number, x1: number, y: number, h: number, mat: Mat): string {
  const d = polyD([
    [x0, y],
    [x1, y],
    [x1, y + h],
    [x0, y + h],
  ]);
  return part(a, d, mat) + shine(`M${r2(x0 + 2)} ${r2(y + h * 0.22)}H${r2(x1 - 2)}`, 0.45, 0.9);
}

/** A trigger guard loop (a stroked bow) with the trigger inside. */
function guard(x0: number, x1: number, y: number, depth: number, mat: 'blued' | 'brass'): string {
  const c = mat === 'brass' ? '#C9A13B' : '#2F3338';
  const hi = mat === 'brass' ? '#F0D27A' : '#7C838C';
  const loop = `M${r2(x0)} ${r2(y)}Q${r2(x0 + 2)} ${r2(y + depth)} ${r2((x0 + x1) / 2)} ${r2(y + depth)}Q${r2(x1 - 1)} ${r2(y + depth)} ${r2(x1)} ${r2(y)}`;
  const tx = x0 + (x1 - x0) * 0.42;
  const trig = `M${r2(tx)} ${r2(y)}Q${r2(tx + 1)} ${r2(y + depth * 0.55)} ${r2(tx - 3)} ${r2(y + depth * 0.75)}`;
  return [
    stroke(loop, INK, 4.4),
    stroke(loop, c, 2.6),
    stroke(loop, hi, 0.8, 0.7),
    stroke(trig, INK, 3.6),
    stroke(trig, c, 2),
  ].join('');
}

/** A bead or blade front sight. */
function bead(x: number, y: number, colour = '#E9D9A6'): string {
  return el('path', {
    d: ellipseD(x, y, 1.6, 1.6),
    fill: colour,
    stroke: INK,
    'stroke-width': 0.6,
  });
}

// --- the guns ---------------------------------------------------------------------------------

/** The Dubbelloop: a side-by-side boxlock with exposed hammers and an engraved silver action,
 *  splinter fore-end, two triggers, a checkered walnut stock. */
function dubbelloop(a: Art): string {
  const stock = smoothD(
    [
      [152, 47],
      [128, 54],
      [96, 51],
      [40, 46],
      [15, 43],
      [12, 66],
      [14, 93],
      [44, 85],
      [92, 76],
      [124, 74],
      [152, 74],
    ],
    true,
    0.6,
  );
  const action = 'M148 45L190 45L192 58L188 70Q172 79 150 75Z';
  const fore = 'M196 57L262 57Q268 61 262 67L198 68Z';
  return [
    cardShadow(a, 16, 362, 104),
    // The far barrel peeks over the near one, then the near barrel and the rib.
    tube(a, 186, 364, 42, 7, 'blued'),
    tube(a, 186, 366, 47, 11, 'blued'),
    stroke('M190 42H364', '#9AA3AB', 0.8, 0.8),
    bead(363.5, 41),
    // Muzzle ring.
    part(a, 'M358 46.5L366 46.5L366 58L358 58Z', 'steel'),
    wood(a, fore, [196, 57, 266, 68], 11, 'walnut'),
    stroke('M206 66L256 66', '#000000', 0.6, 0.35),
    wood(a, stock, [12, 43, 152, 93], 12, 'walnut'),
    checkering(a, 'M118 56L146 52L148 72L120 73Z', [118, 52, 148, 73]),
    // Butt plate (horn).
    part(a, 'M10 43L16 43L18 93L12 95Z', 'rubber', 'x'),
    part(a, action, 'silver'),
    engraving(a, action, 168, 60, 34, 24),
    stroke('M152 61Q168 58 186 61', '#7C848A', 0.7, 0.8),
    screw(184, 60, 2.6, 20),
    screw(158, 67, 2, 70),
    // Top lever.
    part(a, 'M138 42L156 41L156 45L140 46Z', 'blued'),
    // Two hammers: the far one darker, behind.
    part(a, 'M160 46L162 36Q162 30 168 30L170 33Q165 33 165 37L166 46Z', 'blued'),
    part(a, 'M153 47L155 34Q155 27 162 27L164 30Q158 31 158 35L160 47Z', 'steel'),
    shine('M155 44L156 35Q157 30 161 29', 0.6, 0.7),
    // Two triggers and the guard.
    guard(150, 184, 75, 15, 'blued'),
    stroke('M170 75Q171 82 167 86', INK, 3.4),
    stroke('M170 75Q171 82 167 86', '#2F3338', 1.8),
  ].join('');
}

/** The Windbuks: a slim break-barrel air rifle: beech stock, a blued compression tube, the
 *  barrel's pivot and a muzzle shroud with a hooded front sight. */
function windbuks(a: Art): string {
  const stock = smoothD(
    [
      [128, 52],
      [104, 58],
      [70, 52],
      [34, 47],
      [16, 46],
      [14, 70],
      [16, 90],
      [50, 82],
      [96, 74],
      [118, 72],
      [150, 70],
      [220, 64],
      [226, 58],
      [140, 56],
    ],
    true,
    0.6,
  );
  return [
    cardShadow(a, 18, 362, 100),
    wood(a, stock, [14, 46, 226, 90], 21, 'lightWood'),
    // Cheekpiece swell.
    stroke('M40 56Q60 52 84 58Q62 64 40 62', '#7A5228', 0.8, 0.5),
    checkering(a, 'M106 62L130 58L132 70L108 72Z', [106, 58, 132, 72]),
    part(a, 'M11 46L17 46L19 90L13 92Z', 'rubber', 'x'),
    // Compression tube with its end cap, then the breech block and barrel.
    part(a, 'M126 40L232 40L232 56L126 56Q118 48 126 40Z', 'blued'),
    shine('M128 44H230', 0.5, 1),
    stroke('M140 40V56M146 40V56', '#111215', 0.6, 0.6),
    part(a, 'M232 39L246 39L246 59L234 59Z', 'blued'),
    screw(239, 55, 2.4, 50),
    // Rear sight on the block.
    part(a, 'M236 34L244 34L244 39L236 39Z', 'steel'),
    tube(a, 246, 352, 44, 7, 'blued'),
    part(a, 'M340 42L366 42L366 53L340 53Z', 'blued'),
    part(a, 'M356 36L364 36L366 42L354 42Z', 'blued'),
    stroke('M359 38V42', '#E9D9A6', 0.9),
    // Cocking linkage slot under the fore-end.
    stroke('M196 63L232 60', '#2A1608', 1.2, 0.8),
    guard(110, 140, 72, 13, 'blued'),
  ].join('');
}

/** The Kettie: a forked branch with bark and knots, red rubber bands bound at the tips with
 *  twine, a leather pouch with a stone in it. */
function kettie(a: Art): string {
  const fork = smoothD(
    [
      [182, 132],
      [180, 96],
      [176, 76],
      [158, 52],
      [150, 22],
      [160, 18],
      [168, 46],
      [186, 66],
      [204, 46],
      [214, 16],
      [225, 20],
      [218, 54],
      [198, 78],
      [196, 98],
      [198, 132],
    ],
    true,
    0.7,
  );
  const band = (d: string): string =>
    stroke(d, INK, 5.2) + stroke(d, '#C8302A', 3.6) + stroke(d, '#F07A5A', 1, 0.7);
  // v1.19 (D-084, CI): laid on its side, fork to the right and drawn 1.5× — upright it filled
  // only a sliver of the wide card. The shadow and the spare stones lie under it, unturned.
  return g(
    {},
    cardShadow(a, 116, 290, 128),
    el('path', { d: ellipseD(318, 118, 9, 6), fill: '#9A9187', stroke: INK, 'stroke-width': 1 }),
    el('path', { d: ellipseD(336, 123, 7, 4.5), fill: '#B1A89D', stroke: INK, 'stroke-width': 1 }),
    shine('M313 115Q318 112 323 115', 0.5, 0.9),
    g(
      { transform: 'translate(200 66) rotate(90) scale(1.5) translate(-188 -75)' },
      // The far band behind the fork.
      band('M219 26Q214 62 194 90'),
      wood(a, fork, [150, 16, 226, 132], 31, 'bark'),
      // Bark knots and a worn grip.
      stroke(ellipseD(188, 114, 3, 5), '#2C2014', 0.9, 0.7),
      stroke(ellipseD(166, 44, 2, 3.5), '#2C2014', 0.8, 0.7),
      el('path', { d: 'M180 104L198 104L198 128L182 128Z', fill: '#E2BC86', opacity: 0.2 }),
      // Twine bindings at the tips.
      stroke('M151 26L161 24M152 30L163 28', '#E8D9B0', 1.4),
      stroke('M214 22L225 25M213 26L224 29', '#E8D9B0', 1.4),
      // The near band hangs in front to the pouch, a stone in it.
      band('M156 28Q160 66 182 90'),
      part(a, 'M176 84Q188 78 200 86Q197 100 188 100Q178 98 176 84Z', 'leather'),
      el('path', {
        d: ellipseD(188, 90, 5.5, 4.5),
        fill: '#9A9187',
        stroke: INK,
        'stroke-width': 0.8,
      }),
      shine('M185 88Q188 86 191 88', 0.6, 0.7),
    ),
  );
}

/** The Pomp: a pump-action shotgun: walnut stock with a pistol grip, a blued receiver with its
 *  ejection port, a ribbed barrel, the tube magazine and the grooved fore-end slide. */
function pomp(a: Art): string {
  const stock = smoothD(
    [
      [142, 46],
      [110, 50],
      [60, 48],
      [18, 46],
      [16, 70],
      [18, 94],
      [60, 84],
      [104, 76],
      [118, 80],
      [128, 94],
      [142, 92],
      [142, 72],
    ],
    true,
    0.55,
  );
  const fore = 'M214 52L284 52Q290 61 284 70L214 70Q208 61 214 52Z';
  return [
    cardShadow(a, 18, 362, 104),
    wood(a, stock, [16, 46, 142, 94], 41, 'walnut'),
    checkering(a, 'M110 60L136 56L140 86L124 88Z', [110, 56, 140, 88]),
    part(a, 'M10 45L18 45L20 95L12 97Z', 'rubber', 'x'),
    // Magazine tube under the barrel, then the barrel with its vent rib.
    tube(a, 200, 332, 56, 8, 'blued'),
    part(a, 'M330 55L338 55L338 65L330 65Z', 'steel'),
    tube(a, 200, 366, 44, 9, 'blued'),
    part(a, 'M200 40L364 40L364 44L200 44Z', 'blued', 'y', 0.9),
    stroke(
      Array.from({ length: 16 }, (_, k) => `M${206 + k * 10} 40.5V43.5`).join(''),
      '#0E0F11',
      1.4,
      0.9,
    ),
    bead(363, 39),
    // Receiver with the ejection port and a pin.
    part(a, 'M140 42L202 42L202 70L192 74L140 74Z', 'blued'),
    shine('M142 46H200', 0.45, 1),
    el('path', {
      d: 'M160 49L190 49L190 57L160 57Z',
      fill: '#121316',
      stroke: '#6F777F',
      'stroke-width': 0.7,
    }),
    shine('M162 56H188', 0.35, 0.7),
    screw(148, 66, 1.8, 0),
    screw(194, 66, 1.8, 0),
    // Action bars to the fore-end slide.
    stroke('M202 66H216', '#5A6168', 1.6),
    wood(a, fore, [208, 52, 290, 70], 42, 'walnut'),
    stroke(
      Array.from({ length: 7 }, (_, k) => `M${222 + k * 9} 54V68`).join(''),
      '#1E1208',
      1.4,
      0.75,
    ),
    guard(150, 178, 74, 13, 'blued'),
  ].join('');
}

/** A small scope or the big one: bells, tube, turret, rings, a glint on the front glass. */
function scope(
  a: Art,
  o: {
    x0: number;
    x1: number;
    y: number;
    r: number;
    bellR: number;
    rings: readonly number[];
    ringFoot: number;
  },
): string {
  const { x0, x1, y, r, bellR, rings, ringFoot } = o;
  const eye =
    'M' +
    `${r2(x0)} ${r2(y - r * 1.25)}L${r2(x0 + 22)} ${r2(y - r)}L${r2(x0 + 22)} ${r2(y + r)}L${r2(x0)} ${r2(y + r * 1.25)}Z`;
  const obj = `M${r2(x1 - 30)} ${r2(y - r)}L${r2(x1 - 4)} ${r2(y - bellR)}L${r2(x1)} ${r2(y - bellR)}L${r2(x1)} ${r2(y + bellR)}L${r2(x1 - 4)} ${r2(y + bellR)}L${r2(x1 - 30)} ${r2(y + r)}Z`;
  const mid = (x0 + x1) / 2;
  return [
    ...rings.map((x) =>
      part(a, `M${x - 5} ${y}L${x + 5} ${y}L${x + 6} ${ringFoot}L${x - 6} ${ringFoot}Z`, 'blued'),
    ),
    part(
      a,
      `M${x0 + 20} ${y - r}L${x1 - 28} ${y - r}L${x1 - 28} ${y + r}L${x0 + 20} ${y + r}Z`,
      'blued',
    ),
    part(a, eye, 'blued'),
    part(a, obj, 'blued'),
    // Turrets: elevation on top, windage on the side.
    part(
      a,
      `M${mid - 5} ${y - r - 7}L${mid + 5} ${y - r - 7}L${mid + 5} ${y - r}L${mid - 5} ${y - r}Z`,
      'steel',
    ),
    el('path', {
      d: ellipseD(mid, y, r * 0.7, r * 0.7),
      fill: '#3A3F47',
      stroke: INK,
      'stroke-width': 0.7,
    }),
    shine(`M${x0 + 2} ${y - r * 0.7}H${x1 - 2}`, 0.5, 1),
    // The front glass: a blue lens edge with a white glint.
    el('path', {
      d: ellipseD(x1 + 0.5, y, 1.8, bellR - 1),
      fill: '#5FA3C9',
      stroke: INK,
      'stroke-width': 0.6,
    }),
    el('path', {
      d: ellipseD(x1 + 0.8, y - bellR * 0.45, 0.9, bellR * 0.22),
      fill: '#FFFFFF',
      opacity: 0.95,
    }),
    el('path', {
      d: ellipseD(x1 + 4, y - bellR * 0.45, 3, 3),
      fill: '#FFFFFF',
      opacity: 0.35,
      filter: a.blur(1.2),
    }),
  ].join('');
}

/** A bolt handle: the root at the receiver, sweeping down and back to a round knob. */
function boltHandle(x: number, y: number, knob: number, len: number): string {
  const d = `M${x} ${y}Q${x + 2} ${y + len * 0.6} ${x - len * 0.35} ${y + len}`;
  return [
    stroke(d, INK, 4.4),
    stroke(d, '#B8BFC5', 2.6),
    el('path', {
      d: ellipseD(x - len * 0.35, y + len, knob, knob),
      fill: '#C9CFD4',
      stroke: INK,
      'stroke-width': 1,
    }),
    el('path', {
      d: ellipseD(x - len * 0.35 - knob * 0.3, y + len - knob * 0.35, knob * 0.35, knob * 0.3),
      fill: '#FFFFFF',
      opacity: 0.8,
    }),
  ].join('');
}

/** The Twee-Twee: a bolt-action .22 sporter with a small scope and a detachable magazine. */
function tweeTwee(a: Art): string {
  const stock = smoothD(
    [
      [146, 48],
      [116, 52],
      [86, 46],
      [40, 44],
      [16, 46],
      [14, 70],
      [16, 92],
      [56, 82],
      [104, 74],
      [118, 80],
      [126, 92],
      [140, 90],
      [150, 68],
      [262, 62],
      [272, 56],
      [150, 54],
    ],
    true,
    0.55,
  );
  return [
    cardShadow(a, 16, 360, 102),
    tube(a, 204, 364, 47, 6, 'blued'),
    part(a, 'M358 46L364 46L364 53L358 53Z', 'steel'),
    wood(a, stock, [14, 44, 272, 92], 51, 'wood'),
    // Monte Carlo comb line and a schnabel tip.
    stroke('M30 52Q62 46 100 50', '#4A2D14', 0.8, 0.45),
    part(a, 'M262 55L276 55L274 63L262 63Z', 'walnut'),
    checkering(a, 'M112 62L136 58L140 84L124 86Z', [112, 58, 140, 86]),
    part(a, 'M10 46L16 46L18 92L12 94Z', 'rubber', 'x'),
    // Round receiver and magazine.
    part(a, 'M142 44L206 44L206 56L142 56Q136 50 142 44Z', 'blued'),
    shine('M144 47H204', 0.5, 0.9),
    part(a, 'M158 60L174 60L174 74L158 74Z', 'blued'),
    shine('M160 62V72', 0.35, 0.8),
    boltHandle(190, 52, 3.4, 14),
    scope(a, { x0: 126, x1: 236, y: 31, r: 4, bellR: 7, rings: [152, 194], ringFoot: 44 }),
    guard(146, 170, 66, 12, 'blued'),
  ].join('');
}

/** The Langloop: a heavy bolt-action rifle with a big variable scope, a muzzle brake, a sling
 *  swivel and a folding bipod standing on its legs. */
function langloop(a: Art): string {
  const stock = smoothD(
    [
      [148, 48],
      [118, 54],
      [90, 44],
      [40, 42],
      [14, 44],
      [12, 72],
      [14, 98],
      [60, 86],
      [104, 78],
      [118, 84],
      [124, 98],
      [140, 96],
      [150, 72],
      [256, 68],
      [262, 58],
      [150, 58],
    ],
    true,
    0.55,
  );
  return [
    cardShadow(a, 14, 368, 112),
    // Bipod legs: the far one first (darker), then the near one, with rubber feet.
    stroke('M246 72L230 118', INK, 4.6),
    stroke('M246 72L230 118', '#23262B', 2.8),
    tube(a, 210, 352, 45, 10, 'blued'),
    // Muzzle brake with ports.
    part(a, 'M348 42L368 42L368 58L348 58Z', 'steel'),
    el('path', {
      d: 'M353 46L357 46L357 54L353 54ZM360 46L364 46L364 54L360 54Z',
      fill: '#16181B',
    }),
    wood(a, stock, [12, 42, 262, 98], 61, 'walnut'),
    // Raised cheek comb.
    part(a, 'M44 40L96 40L98 46L42 46Z', 'walnut'),
    checkering(a, 'M112 64L138 60L142 88L126 92Z', [112, 60, 142, 92]),
    part(a, 'M8 43L14 43L16 98L10 100Z', 'rubber', 'x'),
    part(a, 'M142 44L212 44L212 58L142 58Q136 51 142 44Z', 'blued'),
    shine('M144 47H210', 0.5, 1),
    part(a, 'M160 62L178 62L178 74L160 74Z', 'blued'),
    boltHandle(198, 54, 4.6, 16),
    scope(a, { x0: 104, x1: 276, y: 27, r: 5.5, bellR: 12, rings: [150, 220], ringFoot: 44 }),
    // Near bipod leg and its hinge block.
    part(a, 'M238 66L254 66L254 74L238 74Z', 'blued'),
    stroke('M248 72L266 118', INK, 5),
    stroke('M248 72L266 118', '#3A3F47', 3.2),
    stroke('M249 74L263 110', '#8F98A2', 0.8, 0.7),
    el('path', {
      d: ellipseD(266, 119, 4.5, 2.5),
      fill: '#1A1513',
      stroke: INK,
      'stroke-width': 0.8,
    }),
    el('path', {
      d: ellipseD(230, 119, 4, 2.2),
      fill: '#1A1513',
      stroke: INK,
      'stroke-width': 0.8,
    }),
    guard(148, 174, 72, 13, 'blued'),
  ].join('');
}

/** The Voorlaaier: a long muzzle-loader: full-length stock, octagonal barrel, the ramrod in brass
 *  pipes under it, a percussion lock with a big hammer, a brass patchbox, buttplate and guard. */
function voorlaaier(a: Art): string {
  const stock = smoothD(
    [
      [124, 50],
      [106, 56],
      [70, 52],
      [12, 46],
      [9, 72],
      [11, 99],
      [56, 86],
      [100, 74],
      [130, 70],
      [170, 64],
      [330, 58],
      [332, 50],
      [160, 52],
    ],
    true,
    0.55,
  );
  return [
    cardShadow(a, 10, 372, 106),
    // Octagonal barrel: three facets.
    el('path', {
      d: 'M150 43L372 43L372 46L150 46Z',
      fill: '#8F98A2',
      stroke: INK,
      'stroke-width': 0.8,
    }),
    el('path', { d: 'M150 46L372 46L372 50L150 50Z', fill: '#3A3F47' }),
    el('path', { d: 'M150 50L372 50L372 53L150 53Z', fill: '#1E2126' }),
    el('path', {
      d: 'M150 43L372 43L372 53L150 53Z',
      fill: 'none',
      stroke: INK,
      'stroke-width': 1.1,
    }),
    stroke('M150 46H372M150 50H372', '#111215', 0.5, 0.7),
    // Front blade and rear notch.
    part(a, 'M364 39L368 39L369 43L363 43Z', 'brass'),
    part(a, 'M174 39L182 39L182 43L174 43Z', 'blued'),
    wood(a, stock, [9, 46, 332, 99], 71, 'wood'),
    // The ramrod under the barrel with a brass tip, held by three pipes.
    tube(a, 172, 362, 58.5, 3.2, 'walnut'),
    part(a, 'M360 57.5L368 57.5L368 62.5L360 62.5Z', 'brass'),
    ...[232, 286, 336].map((x) => part(a, `M${x} 56L${x + 7} 56L${x + 7} 64L${x} 64Z`, 'brass')),
    // Nose cap, barrel keys, buttplate and patchbox.
    part(a, 'M326 50L334 50L334 59L328 59Z', 'brass'),
    ...[250, 302].map((x) => part(a, `M${x} 53L${x + 4} 53L${x + 4} 56L${x} 56Z`, 'brass')),
    part(a, 'M6 45L12 45L14 99L8 101Z', 'brass', 'x'),
    part(a, 'M30 58Q50 52 74 58Q50 66 30 58Z', 'brass'),
    stroke('M38 58Q50 55 66 58', '#7E5F1A', 0.7, 0.8),
    // Lock plate, the big hammer and the nipple.
    part(a, 'M116 52L170 52Q172 60 166 66L120 66Q112 60 116 52Z', 'steel'),
    engraving(a, 'M116 52L170 52Q172 60 166 66L120 66Q112 60 116 52Z', 142, 59, 44, 12),
    part(a, 'M150 44L156 44L156 52L150 52Z', 'steel'),
    part(a, 'M126 60L132 42Q134 32 144 34L150 40L146 42Q140 38 138 42L134 60Z', 'steel'),
    shine('M131 56L134 43Q136 36 143 36', 0.6, 0.7),
    screw(124, 62, 2, 40),
    guard(108, 160, 70, 16, 'brass'),
  ].join('');
}

/** The Mielie Masjien: a hand-cranked mealie gun: a farm-green body with yellow pinstripes and
 *  rivets, a tin hopper of cobs on top, four short barrels in brass bands, the crank on the side,
 *  a wooden stock, kernels flying from the muzzles. */
function mielieMasjien(a: Art): string {
  const cob = (x: number, rot: number, seed: number): string => {
    const rnd = prng(seed);
    const body = smoothD(
      [
        [-6, 8],
        [-7, -10],
        [-4, -24],
        [0, -28],
        [4, -24],
        [7, -10],
        [6, 8],
      ],
      true,
      0.8,
    );
    const kernels: string[] = [];
    for (let row = 0; row < 7; row++)
      for (let col = 0; col < 3; col++) {
        const kx = -4 + col * 4 + (row % 2) * 1.5 + (rnd() - 0.5) * 0.4;
        const ky = -22 + row * 4;
        kernels.push(
          el('path', {
            d: ellipseD(kx, ky, 1.6, 1.5),
            fill: row % 3 === 0 ? '#F2C94C' : '#E8B83A',
            stroke: '#9C7A24',
            'stroke-width': 0.4,
          }),
        );
      }
    return g(
      { transform: `translate(${x} 31) rotate(${rot})` },
      part(a, body, 'brass'),
      ...kernels,
      // Husk leaves.
      el('path', {
        d: 'M-6 8Q-14 -6 -10 -16Q-6 -4 -2 6Z',
        fill: '#7DAE4E',
        stroke: INK,
        'stroke-width': 0.8,
      }),
      el('path', {
        d: 'M6 8Q14 -4 11 -14Q7 -3 2 6Z',
        fill: '#5E8E3A',
        stroke: INK,
        'stroke-width': 0.8,
      }),
    );
  };
  const stock = smoothD(
    [
      [112, 52],
      [70, 54],
      [16, 52],
      [14, 74],
      [16, 92],
      [70, 80],
      [112, 78],
    ],
    true,
    0.6,
  );
  const body = 'M110 44L232 44L232 86L110 86Z';
  const kernel = (x: number, y: number, rot: number): string =>
    g(
      { transform: `translate(${x} ${y}) rotate(${rot})` },
      el('path', {
        d: 'M-3 -2Q0 -4 3 -2L2 3Q0 4 -2 3Z',
        fill: '#F2C94C',
        stroke: INK,
        'stroke-width': 0.6,
      }),
    );
  return [
    cardShadow(a, 14, 360, 116),
    wood(a, stock, [14, 52, 112, 92], 81, 'lightWood'),
    part(a, 'M10 51L16 51L18 92L12 94Z', 'rubber', 'x'),
    // Pistol grip under the body.
    wood(a, 'M120 84L142 84L146 112L126 114Z', [120, 84, 146, 114], 82, 'wood'),
    // Hopper: a tin funnel with cobs in it (behind its front lip).
    cob(150, -14, 83),
    cob(168, 4, 84),
    cob(186, 16, 85),
    part(a, 'M132 16L206 16L194 46L144 46Z', 'steel'),
    shine('M136 19H202', 0.6, 1),
    stroke('M140 26H198M143 34H195', '#3C4146', 0.6, 0.6),
    // Body: farm green, a yellow pinstripe, rivets.
    part(a, body, 'green'),
    el('path', {
      d: 'M116 50L226 50L226 80L116 80Z',
      fill: 'none',
      stroke: '#E8C23A',
      'stroke-width': 1.2,
    }),
    ...[116, 226].flatMap((x) => [46.5, 83.5].map((y) => screw(x, y, 1.5, 0))),
    // Four barrels in brass bands (three seen, the fourth behind).
    tube(a, 232, 346, 47, 9, 'blued'),
    tube(a, 232, 346, 57, 9, 'blued'),
    tube(a, 232, 346, 67, 9, 'blued'),
    part(a, 'M238 45L246 45L246 78L238 78Z', 'brass'),
    part(a, 'M330 45L338 45L338 78L330 78Z', 'brass'),
    ...[51.5, 61.5, 71.5].map((y) =>
      el('path', {
        d: ellipseD(347, y, 1.6, 3.4),
        fill: '#0E0F11',
        stroke: INK,
        'stroke-width': 0.5,
      }),
    ),
    // The crank: hub, arm, wooden handle.
    stroke('M178 66L206 100', INK, 5),
    stroke('M178 66L206 100', '#7D858C', 3),
    el('path', {
      d: ellipseD(178, 66, 7, 7),
      fill: a.grad('steel'),
      stroke: INK,
      'stroke-width': 1,
    }),
    screw(178, 66, 2.4, 10),
    part(a, 'M201 96L211 96L213 118L203 118Z', 'wood', 'x'),
    // Kernels flying out.
    kernel(356, 50, 20),
    kernel(366, 58, -30),
    kernel(360, 70, 60),
    kernel(372, 46, 10),
  ].join('');
}

const DRAW: Readonly<Record<ShedGunId, (a: Art) => string>> = {
  dubbelloop,
  windbuks,
  kettie,
  pomp,
  twee_twee: tweeTwee,
  langloop,
  voorlaaier,
  mielie_masjien: mielieMasjien,
};

/** One gun's side view as an SVG at `master` px per design px (its cell only). */
export function gunCardSvg(id: ShedGunId, master = SHED_GUN_MASTER): string {
  const a = new Art();
  const body = DRAW[id](a);
  return svgDoc(
    SHED_GUN_CELL.w * master,
    SHED_GUN_CELL.h * master,
    [0, 0, SHED_GUN_CELL.w, SHED_GUN_CELL.h],
    a.defs.join(''),
    body,
  );
}

/** The whole sheet (every gun in its cell) at `master` px per design px. */
export function gunCardSheetSvg(master = SHED_GUN_MASTER): string {
  const a = new Art();
  const cells = SHED_GUN_ORDER.map((id, i) =>
    g(
      {
        transform: `translate(${(i % SHED_GUN_COLS) * SHED_GUN_CELL.w} ${Math.floor(i / SHED_GUN_COLS) * SHED_GUN_CELL.h})`,
      },
      DRAW[id](a),
    ),
  );
  return svgDoc(
    SHED_GUN_SHEET_W * master,
    SHED_GUN_SHEET_H * master,
    [0, 0, SHED_GUN_SHEET_W, SHED_GUN_SHEET_H],
    a.defs.join(''),
    cells.join(''),
  );
}

export function renderGunCardSheet(master = SHED_GUN_MASTER): Rgba {
  return renderSvg(gunCardSheetSvg(master));
}

export function renderGunCard(id: ShedGunId, master = SHED_GUN_MASTER): Rgba {
  return renderSvg(gunCardSvg(id, master));
}
