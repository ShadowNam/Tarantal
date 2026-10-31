// D-065: interim art for the New Year countdown — one small sheet (layout in
// src/game/feesdae/newyearAssets.ts) drawn at 2× as the source in the D-035 semi-realistic style
// of the Halloween and Christmas sheets: form from gradients and layered tones, a warm-dark edge,
// small highlights. The pack ships it at 1× (Standard in HD).
// - Party hats in three sizes: a striped paper cone (gold, red, blue) with a white zigzag trim
//   and a gold pompom, bolder and simpler the smaller; on the witch hats' anchors.
// - Oupa (Christmas's figure, D-064) in a party hat, a striped party blower in his waving hand;
//   his head alone in the party hat for the bark bubble and the tally slate.
// - The fireworks' spark (a soft white dot the game tints gold, red, green or white) and a star.
// - Two curled paper streamers and a little burst for the tally frame.
// Coordinates: design px; each frame is drawn round its origin (newyearAssets.ts).
import {
  NY_MASTER,
  NY_SHEET_H,
  NY_SHEET_W,
  nyFrames,
  type NyFrame,
} from '../../src/game/feesdae/newyearAssets';
import { OUPA_DRAWN } from '../../src/game/feesdae/christmasKeys';
import {
  BURST_CELL,
  BURST_T,
  burstCore,
  burstSparks,
  twinkleDots,
  type BurstLook,
} from '../../src/game/feesdae/fireworkMath';
import { loadFeel } from '../testContent';
import type { Rgba } from '../assets/image';
import { oupa, oupaHead } from './christmas';
import { renderSvg } from './raster';
import { el, ellipseD, g, polyD, prng, r2, smoothD, svgDoc } from './svg';

type P = readonly [number, number];

const C = {
  ink: '#2A1A14',
  white: '#FFFDF6',
  gold: '#E6B23A',
  goldLit: '#FFE48A',
  goldShade: '#A07018',
  red: '#D6262E',
  redLit: '#FF6A62',
  redShade: '#8A1218',
  blue: '#2E6AC8',
  blueLit: '#6EA4F0',
  blueShade: '#173A7A',
  green: '#2E9A50',
  greenLit: '#72D08A',
  greenShade: '#155A2C',
} as const;

let seq = 0;
const uid = (p: string): string => `ny${p}${seq++}`;
const path = (d: string, fill: string, extra: Record<string, string | number> = {}): string =>
  el('path', { d, fill, ...extra });
const edge = (d: string, fill: string, w: number, ink: string = C.ink): string =>
  el('path', {
    d,
    fill,
    stroke: ink,
    'stroke-width': w,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
  });
const stroke = (d: string, colour: string, w: number, op = 1): string =>
  el('path', {
    d,
    fill: 'none',
    stroke: colour,
    'stroke-width': w,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    opacity: op,
  });
function linear(stops: readonly [number, string][], x2 = 0, y2 = 1): { def: string; url: string } {
  const id = uid('lg');
  return {
    def: el(
      'linearGradient',
      { id, x1: 0, y1: 0, x2, y2 },
      ...stops.map(([o, c]) => el('stop', { offset: o, 'stop-color': c })),
    ),
    url: `url(#${id})`,
  };
}
function radial(
  stops: readonly [number, string, number][],
  cx = 0.4,
  cy = 0.35,
): { def: string; url: string } {
  const id = uid('rg');
  return {
    def: el(
      'radialGradient',
      { id, cx, cy, r: 0.6 },
      ...stops.map(([o, c, a]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a })),
    ),
    url: `url(#${id})`,
  };
}
const defs = (...d: { def: string }[]): string => el('defs', {}, ...d.map((x) => x.def));

// --- party hats -------------------------------------------------------------------------------

const HAT = { l: { k: 1, w: 2.2 }, m: { k: 0.54, w: 2 }, s: { k: 0.3, w: 1.5 } } as const;

/**
 * A party hat on the witch hats' anchor: the cone's base centre at (0, 0), its tip leaning back a
 * little. Diagonal stripes (gold, red, blue) shaded round the cone, a white zigzag trim at the base,
 * a gold pompom on the tip. The small one is two-tone with a dot.
 */
function partyHat(size: 'l' | 'm' | 's'): string {
  const { k, w } = HAT[size];
  const hw = 26 * k;
  const h = (size === 's' ? 86 : 92) * k;
  const tip: P = [6 * k, -h];
  const cone = polyD([[-hw, 0], tip, [hw, 0]]);
  const clip = uid('clip');
  const shade = linear(
    [
      [0, '#000000'],
      [0.35, '#000000'],
      [1, '#000000'],
    ],
    1,
    0,
  );
  const light = radial(
    [
      [0, '#FFFFFF', 0.5],
      [1, '#FFFFFF', 0],
    ],
    0.3,
    0.4,
  );
  const colours = [C.gold, C.red, C.blue];
  const bands =
    size === 's'
      ? [
          path(cone, C.red),
          path(
            polyD([
              [-hw, 0],
              [-hw * 0.2, -h * 0.55],
              [hw, 0],
            ]),
            C.gold,
          ),
        ]
      : Array.from({ length: 7 }, (_, i) => {
          // Slanting bands across the cone, each a parallelogram.
          const y0 = -h * (i / 6) + 10 * k;
          const y1 = y0 - h / 6;
          return path(
            polyD([
              [-hw * 1.4, y0 + 14 * k],
              [hw * 1.4, y0 - 6 * k],
              [hw * 1.4, y1 - 6 * k],
              [-hw * 1.4, y1 + 14 * k],
            ]),
            colours[i % 3] ?? C.gold,
          );
        });
  const zig: P[] = [];
  const teeth = size === 'l' ? 8 : 5;
  for (let i = 0; i <= teeth; i++) {
    const x = -hw + (2 * hw * i) / teeth;
    zig.push([x, 0], [x + hw / teeth, -7 * k]);
  }
  const pompom = radial([
    [0, C.goldLit, 1],
    [0.7, C.gold, 1],
    [1, C.goldShade, 1],
  ]);
  return g(
    {},
    defs(shade, light, pompom),
    el('clipPath', { id: clip }, path(cone, '#000')),
    g({ 'clip-path': `url(#${clip})` }, ...bands, path(cone, light.url)),
    // Shade on the far side of the cone.
    path(polyD([[hw * 0.25, 0], tip, [hw, 0]]), '#000000', { opacity: 0.22 }),
    edge(cone, 'none', w),
    size === 's'
      ? ''
      : edge(polyD([...zig.slice(0, -1), [hw, 0], [hw, 3 * k], [-hw, 3 * k]]), C.white, w * 0.6),
    edge(ellipseD(tip[0], tip[1], 9 * k + 1, 9 * k + 1), pompom.url, w * 0.7, C.goldShade),
    size === 'l' ? stroke(`M${-hw * 0.5} -8L${tip[0] - 4} ${tip[1] + 18}`, '#FFFFFF', 2, 0.35) : '',
  );
}

// --- Oupa ---------------------------------------------------------------------------------------

/** Oupa's party hat, a little to one side on his head (his face's coordinates). */
const oupaHat = (): string =>
  g({ transform: 'translate(4 -30) rotate(10) scale(0.82)' }, partyHat('l'));

/** A party blower in his waving hand, blown out: a striped paper tongue curling at its end. */
function blower(): string {
  const paper = linear(
    [
      [0, C.redLit],
      [1, C.redShade],
    ],
    1,
    0,
  );
  const tongue = smoothD(
    [
      [86, -356],
      [96, -372],
      [106, -386],
      [112, -398],
      [118, -400],
      [122, -394],
      [116, -390],
    ],
    false,
  );
  return g(
    {},
    defs(paper),
    stroke(tongue, C.ink, 9),
    stroke(tongue, C.red, 6),
    stroke(tongue, C.goldLit, 2, 0.9),
    // The mouthpiece and a little gold tassel at the hand.
    edge(
      polyD([
        [80, -350],
        [90, -360],
        [94, -356],
        [84, -346],
      ]),
      C.gold,
      1.4,
    ),
    stroke('M88 -352L80 -338M90 -352L86 -336', C.gold, 1.6),
  );
}

// --- fireworks, stars, streamers ----------------------------------------------------------------

/** The fireworks' spark: a soft round white dot (the game tints it), its core solid. */
function spark(): string {
  const glow = radial(
    [
      [0, '#FFFFFF', 1],
      [0.35, '#FFFFFF', 1],
      [1, '#FFFFFF', 0],
    ],
    0.5,
    0.5,
  );
  return g({}, defs(glow), path(ellipseD(0, 0, 7.5, 7.5), glow.url));
}

/** A spark's streak (the game tints it): a bright round head at (0, 0) and a tail tapering and
 *  fading behind it to the left; the game turns it along its ray and stretches it with speed. */
function streak(): string {
  const id = uid('sm');
  const mask = el(
    'linearGradient',
    { id, x1: 0, y1: 0, x2: 1, y2: 0 },
    el('stop', { offset: 0, 'stop-color': '#FFFFFF', 'stop-opacity': 0 }),
    el('stop', { offset: 0.75, 'stop-color': '#FFFFFF', 'stop-opacity': 0.7 }),
    el('stop', { offset: 1, 'stop-color': '#FFFFFF', 'stop-opacity': 1 }),
  );
  const glow = radial(
    [
      [0, '#FFFFFF', 1],
      [0.45, '#FFFFFF', 1],
      [1, '#FFFFFF', 0],
    ],
    0.5,
    0.5,
  );
  return g(
    {},
    defs(glow),
    el('defs', {}, mask),
    path(
      polyD([
        [-32, -0.6],
        [0, -2.6],
        [0, 2.6],
        [-32, 0.6],
      ]),
      `url(#${id})`,
    ),
    path(ellipseD(0, 0, 4.4, 4.4), glow.url),
  );
}

/** A star: a small soft dot with a faint four-point twinkle. */
function star(): string {
  const glow = radial(
    [
      [0, '#FFFFFF', 1],
      [0.4, '#F4F0FF', 0.9],
      [1, '#F4F0FF', 0],
    ],
    0.5,
    0.5,
  );
  return g(
    {},
    defs(glow),
    path(ellipseD(0, 0, 4, 4), glow.url),
    stroke('M-5.5 0L5.5 0M0 -5.5L0 5.5', '#FFFFFF', 0.8, 0.6),
  );
}

/** A curled paper streamer hanging from (0, 0)-ish along the slate's top edge, with confetti. */
function streamer(colours: readonly [string, string, string], seed: number): string {
  const rnd = prng(seed);
  const [lit, mid, shade] = colours;
  const curve = smoothD(
    [
      [-120, 4],
      [-86, 30],
      [-60, 6],
      [-30, 34],
      [0, 8],
      [30, 36],
      [60, 8],
      [90, 32],
      [120, 6],
    ],
    false,
  );
  const dots = Array.from({ length: 10 }, () => {
    const x = -110 + rnd() * 220;
    const y = 30 + rnd() * 30;
    const c = [C.gold, C.red, C.blue, C.green][Math.floor(rnd() * 4)] ?? C.gold;
    return edge(
      polyD([
        [x - 3, y - 2],
        [x + 3, y - 3],
        [x + 3, y + 2],
        [x - 3, y + 3],
      ]),
      c,
      0.8,
    );
  });
  return g(
    {},
    stroke(curve, C.ink, 11),
    stroke(curve, shade, 9),
    stroke(curve, mid, 6),
    stroke(curve, lit, 2, 0.9),
    ...dots,
  );
}

/** A small firework burst for the tally frame: rays in four colours with bright tips. */
function burst(seed: number): string {
  const rnd = prng(seed);
  const cols = [C.goldLit, C.redLit, C.greenLit, '#FFFFFF'];
  const rays: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rnd() * 0.1;
    const r0 = 10;
    const r1 = 36 + rnd() * 14;
    const c = cols[i % 4] ?? '#FFFFFF';
    const x0 = Math.cos(a) * r0;
    const y0 = Math.sin(a) * r0;
    const x1 = Math.cos(a) * r1;
    const y1 = Math.sin(a) * r1;
    rays.push(stroke(`M${r2(x0)} ${r2(y0)}L${r2(x1)} ${r2(y1)}`, c, 2.6, 0.9));
    rays.push(path(ellipseD(x1, y1, 3, 3), c));
  }
  const core = radial(
    [
      [0, '#FFFFFF', 1],
      [1, C.goldLit, 0],
    ],
    0.5,
    0.5,
  );
  return g({}, defs(core), ...rays, path(ellipseD(0, 0, 12, 12), core.url));
}

// --- the baked firework burst (D-065 perf) -------------------------------------------------------

const FW: BurstLook = loadFeel().feesdae.looks.newyear.fireworks;

/** One frame of the burst (fireworkMath.ts, the reviewed spark math), drawn at half size round
 *  the cell's centre: `c` the coloured sparks in white (the game tints them per burst), `w` the
 *  white sparks and the core (untinted). Alphas are relative to the whole burst's fade (the game
 *  sets that as the image's alpha). */
function fireworkFrame(kind: 'c' | 'w', i: number): string {
  const t = BURST_T[i] ?? 0;
  const tail = uid('ft');
  const glow = radial(
    [
      [0, '#FFFFFF', 1],
      [0.45, '#FFFFFF', 1],
      [1, '#FFFFFF', 0],
    ],
    0.5,
    0.5,
  );
  const coreGlow = radial(
    [
      [0, '#FFF4D8', 1],
      [0.35, '#FFF4D8', 1],
      [1, '#FFF4D8', 0],
    ],
    0.5,
    0.5,
  );
  const sparks = burstSparks(FW, t, i)
    .filter((sp) => sp.white === (kind === 'w'))
    .map((sp) =>
      g(
        {
          transform: `translate(${r2(sp.x)} ${r2(sp.y)}) rotate(${r2((sp.rot * 180) / Math.PI)}) scale(${r2(sp.len)} ${r2(sp.thick)})`,
          opacity: sp.alpha,
        },
        path(
          polyD([
            [-32, -0.6],
            [0, -2.6],
            [0, 2.6],
            [-32, 0.6],
          ]),
          `url(#${tail})`,
        ),
        path(ellipseD(0, 0, 4.4, 4.4), glow.url),
      ),
    );
  const core = kind === 'w' ? burstCore(FW, t) : null;
  return g(
    { transform: `scale(${BURST_CELL.scale})` },
    defs(glow, coreGlow),
    el(
      'defs',
      {},
      el(
        'linearGradient',
        { id: tail, x1: 0, y1: 0, x2: 1, y2: 0 },
        el('stop', { offset: 0, 'stop-color': '#FFFFFF', 'stop-opacity': 0 }),
        el('stop', { offset: 0.75, 'stop-color': '#FFFFFF', 'stop-opacity': 0.7 }),
        el('stop', { offset: 1, 'stop-color': '#FFFFFF', 'stop-opacity': 1 }),
      ),
    ),
    ...sparks,
    core === null
      ? ''
      : path(ellipseD(0, 0, 8 * core.scale, 8 * core.scale), coreGlow.url, {
          opacity: core.alpha,
        }),
  );
}

/** Reduce flashes: the dim dots a burst twinkles as (white: the game tints them). */
function twinkleFrame(): string {
  const glow = radial(
    [
      [0, '#FFFFFF', 1],
      [0.35, '#FFFFFF', 1],
      [1, '#FFFFFF', 0],
    ],
    0.5,
    0.5,
  );
  return g(
    { transform: `scale(${BURST_CELL.scale})` },
    defs(glow),
    ...twinkleDots(FW).map((d) =>
      path(ellipseD(d.x, d.y, 7.5 * 0.35, 7.5 * 0.35), glow.url, { opacity: d.alpha }),
    ),
  );
}

function frameArt(name: NyFrame): string {
  const fw = /^fw_([cw])_(\d+)$/.exec(name);
  if (fw !== null) return fireworkFrame(fw[1] === 'w' ? 'w' : 'c', Number(fw[2]));
  switch (name) {
    case 'hat_l':
      return partyHat('l');
    case 'hat_m':
      return partyHat('m');
    case 'hat_s':
      return partyHat('s');
    case 'oupa':
      return g(
        { transform: `scale(${OUPA_DRAWN})` },
        oupa(() => oupaHead(oupaHat), blower),
      );
    case 'oupa_head':
      return g({ transform: `scale(${OUPA_DRAWN})` }, oupaHead(oupaHat));
    case 'spark':
      return spark();
    case 'streak':
      return streak();
    case 'star':
      return star();
    case 'streamer_a':
      return streamer([C.goldLit, C.gold, C.goldShade], 3112);
    case 'streamer_b':
      return streamer([C.blueLit, C.blue, C.blueShade], 3113);
    case 'burst':
      return burst(2027);
    case 'fw_twinkle':
      return twinkleFrame();
    default:
      return '';
  }
}

/** The whole sheet as SVG (design px viewBox, rendered at NY_MASTER×). */
export function newYearSheetSvg(): string {
  seq = 0;
  const parts: string[] = [];
  for (const f of nyFrames()) {
    const id = uid('cell');
    parts.push(
      g(
        {},
        el('clipPath', { id }, el('rect', { x: f.x, y: f.y, width: f.w, height: f.h })),
        g(
          { 'clip-path': `url(#${id})` },
          g({ transform: `translate(${r2(f.x + f.ox)} ${r2(f.y + f.oy)})` }, frameArt(f.name)),
        ),
      ),
    );
  }
  return svgDoc(
    NY_SHEET_W * NY_MASTER,
    NY_SHEET_H * NY_MASTER,
    [0, 0, NY_SHEET_W, NY_SHEET_H],
    '',
    parts.join(''),
  );
}

export function renderNewYearSheet(): Rgba {
  return renderSvg(newYearSheetSvg());
}
