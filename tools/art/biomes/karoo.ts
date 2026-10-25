// Karoo autumn (bible §4.2, the home biome, in the first download): golden veld under a pale
// autumn sky, flat-topped dolerite mesas and koppies in hazy lilac, karoo bossies, a dirt farm
// track, a wire fence, the windpomp + corrugated reservoir, a rusty fictional bakkie, a potjie on
// a fire, a fence-post bell and aloes. Light from the upper left. D-031.
import { verVeld } from './common';
import { plantLook, seedTuft, veldShrub, type ShrubKind } from '../flora';
import { sweetThorn } from '../species';
import { herd } from '../fauna';
import type { BiomeArtPlan, LayerCtx, PaintCtx, PropCtx } from '../landscape';
import {
  edgePts,
  flat,
  groundD,
  hatch,
  line,
  mix,
  nextId,
  post,
  shade,
  stone,
  tone,
  tuft,
  wire,
  yAt,
  type Pen,
  type Pt,
  type Rnd,
  type Tone,
} from '../scenery';
import { el, ellipseD, g, inked, place, polyD, r2, smoothD } from '../svg';
import { contactShadow, fillD, softPen, tree } from '../realism';
import { mountainRow, paintRow, rockColours } from '../mountains';
import { cirrus, skyGradient, softCumulus, softDefs, type CloudColours } from '../skies';
import {
  grassField,
  pick,
  shrub,
  shrubShape,
  stalk,
  tuftOf,
  type TuftKind,
  type Weighted,
} from '../vegetation';

// --- shared bits ---------------------------------------------------------------------------

/** A vertical linear gradient (defs inline in the body). */
export function vGradient(id: string, stops: readonly (readonly [number, string])[]): string {
  return el(
    'defs',
    {},
    el(
      'linearGradient',
      { id, x1: 0, y1: 0, x2: 0, y2: 1 },
      ...stops.map(([o, c]) => el('stop', { offset: o, 'stop-color': c })),
    ),
  );
}

/** Ground band with an inked top edge; returns the svg and the edge points. */
export function groundBand(
  ctx: LayerCtx,
  y: number,
  amp: number,
  step: number,
  fill: string,
): { svg: string; edge: Pt[]; clip: string } {
  const edge = edgePts(ctx.rnd, -40, ctx.width + 40, y, amp, step);
  const top = smoothD(edge, false, 0.8);
  const d = `${top}L${r2(ctx.width + 200)} ${r2(ctx.bottom + 40)}L-80 ${r2(ctx.bottom + 40)}Z`;
  const clip = nextId();
  return {
    svg: g({}, el('clipPath', { id: clip }, el('path', { d })), flat(d, fill)),
    edge,
    clip,
  };
}

/** A leaf for aloes: thick, pointed, arching; rotated `deg` from straight up about (x, y). */
export function aloeLeaf(
  x: number,
  y: number,
  deg: number,
  len: number,
  w: number,
  fill: string,
  dark: string,
  light: string,
  pen: Pen,
  droop = 0.25,
): string {
  const pts: Pt[] = [
    [-w / 2, 0],
    [-w * 0.5, -len * 0.35],
    [-w * 0.3, -len * 0.7],
    [len * droop * 0.3, -len],
    [w * 0.3, -len * 0.68],
    [w * 0.5, -len * 0.32],
    [w / 2, 0],
  ];
  const leaf = place(pts, x, y, deg);
  const half = place(
    [
      [0, 0],
      [w * 0.05, -len * 0.5],
      [len * droop * 0.3, -len],
      [w * 0.3, -len * 0.68],
      [w * 0.5, -len * 0.32],
      [w / 2, 0],
    ],
    x,
    y,
    deg,
  );
  const shine = place(
    [
      [-w * 0.3, -len * 0.15],
      [-w * 0.32, -len * 0.45],
      [-w * 0.18, -len * 0.62],
      [-w * 0.14, -len * 0.4],
    ],
    x,
    y,
    deg,
  );
  const teeth: Pt[] = [];
  for (const f of [0.3, 0.5, 0.7])
    teeth.push(...place([[w * 0.5 * (1 - f * 0.6), -len * f]], x, y, deg));
  return g(
    {},
    flat(smoothD(leaf, true, 0.7), fill),
    flat(smoothD(half, true, 0.7), dark),
    flat(smoothD(shine, true, 0.8), light),
    el('path', {
      d: smoothD(leaf, true, 0.7),
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': pen.w,
      'stroke-linejoin': 'round',
    }),
    ...teeth.map(([tx, ty]) =>
      el('path', {
        d: `M${r2(tx)} ${r2(ty)}l${r2(pen.w * 0.9)} ${r2(-pen.w * 0.5)}`,
        stroke: pen.ink,
        'stroke-width': pen.w * 0.6,
        'stroke-linecap': 'round',
      }),
    ),
  );
}

/** A candelabra aloe flower: stem and 1–3 branches, each ending in a conical raceme. */
export function aloeFlowers(
  rnd: Rnd,
  x: number,
  y: number,
  h: number,
  branches: number,
  flower: string,
  bud: string,
  stem: string,
  pen: Pen,
): string {
  const parts: string[] = [];
  const fork = y - h * 0.45;
  parts.push(
    inked(
      `M${r2(x - 4)} ${r2(y)}L${r2(x - 3)} ${r2(fork)}L${r2(x + 3)} ${r2(fork)}L${r2(x + 4)} ${r2(y)}Z`,
      stem,
      pen.ink,
      pen.w * 0.7,
    ),
  );
  for (let b = 0; b < branches; b++) {
    const f = branches === 1 ? 0 : b / (branches - 1) - 0.5;
    const bx = x + f * h * 0.5;
    const by = fork - h * (0.15 + rnd() * 0.08) - (1 - Math.abs(f)) * h * 0.08;
    parts.push(
      line(
        `M${r2(x)} ${r2(fork)}Q${r2(bx)} ${r2(fork)} ${r2(bx)} ${r2(by)}`,
        { ink: pen.ink, w: pen.w * 1.4 },
        pen.w * 1.4,
      ),
    );
    parts.push(
      line(
        `M${r2(x)} ${r2(fork)}Q${r2(bx)} ${r2(fork)} ${r2(bx)} ${r2(by)}`,
        { ink: stem, w: pen.w * 0.7 },
        pen.w * 0.7,
      ),
    );
    const rh = h * (0.42 + rnd() * 0.1);
    const rw = h * 0.06;
    parts.push(
      inked(
        smoothD(
          [
            [bx - rw, by],
            [bx - rw * 0.8, by - rh * 0.55],
            [bx, by - rh],
            [bx + rw * 0.8, by - rh * 0.55],
            [bx + rw, by],
          ],
          true,
          0.6,
        ),
        flower,
        pen.ink,
        pen.w * 0.8,
      ),
    );
    // Buds (yellow tips) on the top third, tube ticks below.
    parts.push(
      flat(
        smoothD(
          [
            [bx - rw * 0.55, by - rh * 0.62],
            [bx, by - rh * 0.98],
            [bx + rw * 0.55, by - rh * 0.62],
          ],
          true,
          0.6,
        ),
        bud,
      ),
    );
    // Hanging flower tubes: short darker ticks down the candle (no ink bars).
    for (let k = 1; k < 9; k++) {
      const ty = by - (rh * k) / 11;
      const tw = rw * (1 - k / 13);
      parts.push(
        line(
          `M${r2(bx - tw * 0.7)} ${r2(ty - 3)}l${r2(-tw * 0.25)} 6M${r2(bx + tw * 0.7)} ${r2(ty - 3)}l${r2(tw * 0.25)} 6M${r2(bx)} ${r2(ty - 4)}l0 6`,
          { ink: shade(flower, -0.3), w: 2.5 },
          2.5,
        ),
      );
    }
  }
  return g({}, ...parts);
}

/** A rosette of aloe leaves at (x, y), size s. */
export function aloeRosette(ctx: PaintCtx, x: number, y: number, s: number, pen: Pen): string {
  const t = tone(ctx.c('aloe'), 0.25, 0.3);
  const back = tone(ctx.c('aloeDark'), 0.2, 0.25);
  const parts: string[] = [];
  for (const a of [-82, -58, -32, -8, 16, 40, 64, 86])
    parts.push(
      aloeLeaf(
        x,
        y,
        a + (ctx.rnd() - 0.5) * 8,
        s * (0.9 + ctx.rnd() * 0.2),
        s * 0.24,
        back.fill,
        back.dark,
        back.light,
        pen,
        0.5,
      ),
    );
  for (const a of [-62, -30, 2, 32, 62])
    parts.push(
      aloeLeaf(
        x,
        y + s * 0.06,
        a + (ctx.rnd() - 0.5) * 8,
        s * (0.72 + ctx.rnd() * 0.15),
        s * 0.26,
        t.fill,
        t.dark,
        t.light,
        pen,
        0.35,
      ),
    );
  for (const a of [-20, 18])
    parts.push(aloeLeaf(x, y + s * 0.1, a, s * 0.5, s * 0.22, t.fill, t.dark, t.light, pen, 0.2));
  return g({}, ...parts);
}

// --- layers --------------------------------------------------------------------------------

function sky(ctx: LayerCtx): string {
  return softSky(ctx, {
    stops: [
      [0, ctx.raw('skyTop')],
      [0.3, ctx.raw('skyMid')],
      [0.52, ctx.raw('skyBottom')],
      [1, ctx.raw('horizon')],
    ],
    cloud: {
      lit: ctx.raw('cloud'),
      body: mix(ctx.raw('cloud'), ctx.raw('skyBottom'), 0.35),
      base: ctx.raw('cloudShadow'),
    },
  });
}

/**
 * A soft sky shared by the biomes: smooth gradient, two or three high thin streaks kept faint,
 * and soft flat-bottomed cumulus banked low over the horizon (below the flyer band, 80–420).
 */
export function softSky(
  ctx: LayerCtx,
  o: {
    stops: readonly (readonly [number, string])[];
    cloud: CloudColours;
    /** Base line of the cumulus banks and their height range. */
    base?: number;
    size?: readonly [number, number];
    streaks?: number;
  },
): string {
  const parts: string[] = [softDefs(), skyGradient(ctx.width, 1080, o.stops)];
  const streak = mix(o.cloud.lit, o.stops[1]?.[1] ?? o.cloud.lit, 0.25);
  const n = o.streaks ?? 4;
  for (let k = 0; k < n; k++) {
    const x = ((k + ctx.rnd() * 0.6) / n) * ctx.width;
    parts.push(cirrus(ctx.rnd, x, 120 + ctx.rnd() * 230, 220 + ctx.rnd() * 300, streak, 0.45));
  }
  const base = o.base ?? 560;
  const [h0, h1] = o.size ?? [60, 110];
  for (let x = -100 + ctx.rnd() * 120; x < ctx.width;) {
    const w = 200 + ctx.rnd() * 260;
    const h = h0 + ctx.rnd() * (h1 - h0);
    parts.push(softCumulus(ctx.rnd, x, base + ctx.rnd() * 30, w, h, o.cloud));
    x += w * (0.7 + ctx.rnd() * 0.9);
  }
  // A few small fair-weather clouds just under the flyer band.
  for (let x = 300 + ctx.rnd() * 300; x < ctx.width; x += 900 + ctx.rnd() * 700)
    parts.push(
      softCumulus(
        ctx.rnd,
        x,
        470 + ctx.rnd() * 30,
        110 + ctx.rnd() * 80,
        34 + ctx.rnd() * 16,
        o.cloud,
      ),
    );
  return g({}, ...parts);
}

/** Weighted grass tones from a biome palette's straw / bleached / grey-green colours. */
export function grassTones(ctx: PaintCtx, darkK = 0.24): Weighted<Tone>[] {
  return [
    { v: tone(ctx.c('straw'), darkK, 0.25), w: 5 },
    { v: tone(ctx.c('bleached'), darkK * 0.9, 0.18), w: 3 },
    { v: tone(ctx.c('greyGreen'), darkK, 0.22), w: 1.2 },
  ];
}

/** Weighted shrub tones: grey-green and olive, some autumn brown. */
export function shrubTones(ctx: PaintCtx): Weighted<Tone>[] {
  return [
    { v: tone(ctx.c('bossieGrey'), 0.26, 0.24), w: 4 },
    { v: tone(ctx.c('bossie'), 0.26, 0.24), w: 3 },
    { v: tone(ctx.c('autumn'), 0.26, 0.22), w: 1.5 },
  ];
}

/** A shrub with a mixed second colour, size s, shape from the PRNG. */
export function bush(ctx: PaintCtx, x: number, y: number, s: number, pen: Pen): string {
  const tones = shrubTones(ctx);
  return shrub(
    ctx.rnd,
    x,
    y,
    s,
    pick(ctx.rnd, tones),
    pick(ctx.rnd, tones),
    ctx.c('twig'),
    pen,
    shrubShape(ctx.rnd),
  );
}

/**
 * v1.6 (D-042): a Karoo bush (renosterbos, fine and grey-green, or ganna, olive and twiggy) as
 * layered mounds; tiny on the far veld, textured on mid and near.
 */
export function karooBush(ctx: PaintCtx, x: number, y: number, s: number, pen: Pen): string {
  const kind: ShrubKind = ctx.rnd() < 0.6 ? 'renoster' : 'ganna';
  const leaf =
    kind === 'renoster' ? mix(ctx.c('bossieGrey'), ctx.c('bossie'), 0.5) : ctx.c('bossie');
  const look = plantLook({
    leaf: ctx.rnd() < 0.15 ? mix(leaf, ctx.c('autumn'), 0.45) : leaf,
    bark: ctx.c('twig'),
    ink: pen.ink,
    sun: ctx.c('bleached'),
  });
  return veldShrub(ctx.rnd, x, y, s, kind, look, pen);
}

/** v1.6: a golden veld tuft with seed heads (straw blades, pale tips, cream heads). */
export function veldTuft(ctx: PaintCtx, x: number, y: number, h: number, pen: Pen): string {
  return seedTuft(
    ctx.rnd,
    x,
    y,
    h,
    {
      base: shade(ctx.c('straw'), -0.22),
      blade: ctx.c('straw'),
      tip: ctx.c('bleached'),
      seed: ctx.c('seed'),
    },
    pen,
    1 + Math.floor(ctx.rnd() * 3),
  );
}

function farRidge(ctx: LayerCtx): string {
  // D-035: no longer a row of flat tops. A hazy back range (a dark massif with ravines, jagged
  // strata ridges, a mesa or two), then nearer dolerite mesas, pointed koppies with scree, a
  // granite inselberg and boulder heaps: varied heights and gaps, lit from the left.
  const horizon = ctx.raw('horizon');
  const rock = rockColours(ctx.raw);
  const back = mountainRow(
    ctx.rnd,
    [
      { kind: 'massif', w: 2 },
      { kind: 'strata', w: 2 },
      { kind: 'mesa', w: 1.2 },
    ],
    {
      x0: -160,
      x1: ctx.width,
      base: 612,
      width: [420, 760],
      height: [80, 175],
      overlap: [0.15, 0.4],
      haze: 0.5,
    },
  );
  const front = mountainRow(
    ctx.rnd,
    [
      { kind: 'mesa', w: 1.4 },
      { kind: 'koppie', w: 2 },
      { kind: 'inselberg', w: 0.8 },
      { kind: 'strata', w: 1 },
      { kind: 'boulders', w: 1 },
    ],
    {
      x0: -80,
      x1: ctx.width,
      base: 650,
      width: [260, 560],
      height: [115, 245],
      overlap: [-0.25, 0.15],
      haze: 0.2,
    },
  );
  const backPen: Pen = { ink: mix(ctx.pen.ink, horizon, 0.35), w: 1.4 };
  return g(
    {},
    ...paintRow(ctx.rnd, back, rock, backPen, horizon),
    ...paintRow(ctx.rnd, front, rock, ctx.pen, horizon),
  );
}

/**
 * D-035: the farmstead on the far veld, standing on the ground line (`ground` gives the line's y
 * at any x): a whitewashed farmhouse with a corrugated red roof, a stoep, chimney, windows and a
 * door; a beaten-earth yard with a low wall, a path down to the track, a tank on its stand, and
 * bluegums and a pepper tree beside it, each on its own base with a contact shadow.
 */
function farmhouse(ctx: LayerCtx, x: number, ground: (x: number) => number): string {
  const pen = softPen(ctx.pen, ctx.c('wall'), 0.7);
  const base = ground(x) + 2;
  const wall = ctx.c('wall');
  const wallLit = shade(wall, 0.25);
  const wallShade = shade(wall, -0.22);
  const roof = ctx.c('roof');
  const leaves = tone(ctx.c('tree'), 0.3, 0.22);
  const gum = tone(shade(ctx.c('tree'), -0.12), 0.3, 0.2);
  const trunk = ctx.c('trunk');
  const soil = mix(ctx.c('soil'), ctx.c('veldLight'), 0.55);
  const parts: string[] = [];
  // Bluegums behind the house (taller, darker), then the yard on the ground.
  for (const [dx, w, h] of [
    [-78, 32, 84],
    [-58, 28, 72],
    [70, 34, 86],
  ] as const) {
    const tx = x + dx;
    parts.push(tree(ctx.rnd, 'bluegum', tx, ground(tx) + 2, w, h, gum, trunk, ctx.pen));
  }
  parts.push(fillD(ellipseD(x - 4, base + 5, 86, 7), soil, 0.75));
  // The path from the door down to the track (widens toward the viewer).
  parts.push(
    fillD(
      `M${r2(x - 12)} ${r2(base + 1)}C${r2(x - 16)} ${r2(base + 18)} ${r2(x - 40)} ${r2(base + 30)} ${r2(
        x - 64,
      )} ${r2(base + 58)}L${r2(x - 44)} ${r2(base + 58)}C${r2(x - 26)} ${r2(base + 30)} ${r2(
        x - 6,
      )} ${r2(base + 18)} ${r2(x - 4)} ${r2(base + 1)}Z`,
      shade(soil, 0.12),
      0.9,
    ),
  );
  parts.push(contactShadow(x + 6, base + 1, 46, 3.5, 0.32));
  // Tank on a stand (behind-right), corrugated.
  const kx = x + 44;
  parts.push(
    g(
      {},
      el('path', {
        d: `M${r2(kx - 7)} ${r2(base)}L${r2(kx - 6)} ${r2(base - 14)}M${r2(kx + 7)} ${r2(base)}L${r2(
          kx + 6,
        )} ${r2(base - 14)}M${r2(kx - 6.5)} ${r2(base - 7)}L${r2(kx + 6.5)} ${r2(base - 7)}`,
        fill: 'none',
        stroke: shade(ctx.c('metal'), -0.3),
        'stroke-width': 1.2,
      }),
      el('rect', {
        x: kx - 9,
        y: base - 27,
        width: 18,
        height: 13,
        rx: 2,
        fill: ctx.c('metal'),
        stroke: pen.ink,
        'stroke-width': pen.w,
      }),
      el('path', {
        d: [0, 1, 2, 3].map((k) => `M${r2(kx - 9)} ${r2(base - 24 + k * 3)}h18`).join(''),
        stroke: shade(ctx.c('metal'), -0.25),
        'stroke-width': 0.7,
      }),
      fillD(
        polyD([
          [kx + 3, base - 27],
          [kx + 9, base - 27],
          [kx + 9, base - 14],
          [kx + 3, base - 14],
        ]),
        shade(ctx.c('metal'), -0.25),
        0.6,
      ),
    ),
  );
  // The house: front wall (lit), gable end (shade), stoep.
  const L = x - 36;
  const R = x + 26;
  const E = x + 38; // end wall edge (the gable seen at an angle)
  const H = 22;
  parts.push(
    el('path', {
      d: polyD([
        [L, base],
        [L, base - H],
        [R, base - H],
        [R, base],
      ]),
      fill: wallLit,
      stroke: pen.ink,
      'stroke-width': pen.w,
      'stroke-linejoin': 'round',
    }),
    el('path', {
      d: polyD([
        [R, base],
        [R, base - H],
        [(R + E) / 2, base - H - 10],
        [E, base - H + 2],
        [E, base - 1],
      ]),
      fill: wallShade,
      stroke: pen.ink,
      'stroke-width': pen.w,
      'stroke-linejoin': 'round',
    }),
    // A damp/dust line along the foot of the walls.
    fillD(
      polyD([
        [L, base],
        [L, base - 2.5],
        [E, base - 3],
        [E, base - 1],
      ]),
      shade(wall, -0.3),
      0.5,
    ),
  );
  // Windows (frames, panes catching the sky) and the door.
  for (const wx of [L + 8, L + 36]) {
    parts.push(
      el('rect', {
        x: wx,
        y: base - 16,
        width: 8,
        height: 8,
        fill: '#5E7F94',
        stroke: shade(wall, -0.5),
        'stroke-width': 0.9,
      }),
      fillD(
        polyD([
          [wx + 0.8, base - 15.2],
          [wx + 4, base - 15.2],
          [wx + 0.8, base - 11],
        ]),
        '#BFD7E3',
        0.8,
      ),
      el('path', {
        d: `M${r2(wx + 4)} ${r2(base - 16)}v8M${r2(wx)} ${r2(base - 12)}h8`,
        stroke: shade(wall, -0.4),
        'stroke-width': 0.6,
      }),
    );
  }
  parts.push(
    el('rect', {
      x: L + 22,
      y: base - 13,
      width: 7,
      height: 13,
      fill: shade(ctx.c('trunk'), -0.1),
      stroke: shade(wall, -0.5),
      'stroke-width': 0.9,
    }),
  );
  // Main roof (corrugated: thin ridges), its shaded far slope, the ridge cap and a chimney.
  const roofD = polyD([
    [L - 5, base - H + 1],
    [L + 4, base - H - 12],
    [(R + E) / 2, base - H - 12],
    [R + 3, base - H + 1],
  ]);
  const roofId = nextId();
  const ridges: string[] = [];
  for (let rx = L - 4; rx < R + 4; rx += 2.6)
    ridges.push(`M${r2(rx)} ${r2(base - H + 1)}L${r2(rx + 4)} ${r2(base - H - 12)}`);
  parts.push(
    el('rect', {
      x: L + 10,
      y: base - H - 19,
      width: 5,
      height: 9,
      fill: wallShade,
      stroke: pen.ink,
      'stroke-width': pen.w * 0.9,
    }),
    el('path', {
      d: roofD,
      fill: roof,
      stroke: pen.ink,
      'stroke-width': pen.w,
      'stroke-linejoin': 'round',
    }),
    el('clipPath', { id: roofId }, el('path', { d: roofD })),
    g(
      { 'clip-path': `url(#${roofId})` },
      el('path', { d: ridges.join(''), stroke: shade(roof, -0.25), 'stroke-width': 0.7 }),
      fillD(
        polyD([
          [L - 6, base - H - 13],
          [R + 6, base - H - 13],
          [R + 6, base - H - 9],
          [L - 6, base - H - 9],
        ]),
        shade(roof, 0.3),
        0.6,
      ),
      // Rust streaks.
      fillD(
        polyD([
          [L + 14, base - H - 12],
          [L + 17, base - H - 12],
          [L + 15, base - H + 1],
          [L + 12, base - H + 1],
        ]),
        shade(roof, -0.3),
        0.5,
      ),
    ),
  );
  // The stoep: a lean-to roof on thin posts along the front, with its shadow on the wall.
  parts.push(
    fillD(
      polyD([
        [L, base - 11],
        [R, base - 11],
        [R, base - 6],
        [L, base - 6],
      ]),
      shade(wall, -0.35),
      0.45,
    ),
    el('path', {
      d: polyD([
        [L - 3, base - 10],
        [L + 1, base - 14.5],
        [R - 1, base - 14.5],
        [R + 3, base - 10],
      ]),
      fill: shade(roof, -0.12),
      stroke: pen.ink,
      'stroke-width': pen.w * 0.9,
      'stroke-linejoin': 'round',
    }),
    el('path', {
      d: [L, L + 20, L + 40, R]
        .map((px) => `M${r2(px + 0.5)} ${r2(base - 10)}V${r2(base)}`)
        .join(''),
      stroke: shade(wall, -0.45),
      'stroke-width': 1,
    }),
  );
  // A low whitewashed yard wall in front, broken by the gate where the path leaves.
  const wallY = base + 8;
  for (const [a, b] of [
    [x - 82, x - 24],
    [x - 2, x + 62],
  ] as const) {
    parts.push(
      el('path', {
        d: polyD([
          [a, wallY],
          [a, wallY - 4],
          [b, wallY - 4],
          [b, wallY],
        ]),
        fill: shade(wall, -0.04),
        stroke: pen.ink,
        'stroke-width': pen.w * 0.8,
      }),
      fillD(
        polyD([
          [a, wallY],
          [a, wallY - 1.2],
          [b, wallY - 1.2],
          [b, wallY],
        ]),
        shade(wall, -0.25),
        0.6,
      ),
    );
  }
  // A pepper tree beside the yard, in front.
  const px = x - 104;
  parts.push(tree(ctx.rnd, 'pepper', px, ground(px) + 4, 44, 46, leaves, trunk, ctx.pen));
  return g({}, ...parts);
}

function farWindpomp(ctx: LayerCtx, x: number, base: number): string {
  const pen: Pen = { ink: ctx.pen.ink, w: 1.5 };
  const top = base - 46;
  return g(
    {},
    line(
      `M${r2(x - 7)} ${r2(base)}L${r2(x - 1.5)} ${r2(top)}M${r2(x + 7)} ${r2(base)}L${r2(x + 1.5)} ${r2(top)}M${r2(x - 5)} ${r2(base - 14)}L${r2(x + 5)} ${r2(base - 14)}M${r2(x - 3.5)} ${r2(base - 28)}L${r2(x + 3.5)} ${r2(base - 28)}`,
      pen,
    ),
    el('circle', {
      cx: x,
      cy: top - 2,
      r: 8,
      fill: mix(ctx.c('metal'), ctx.raw('horizon'), 0.2),
      stroke: pen.ink,
      'stroke-width': 1.5,
    }),
    line(`M${r2(x)} ${r2(top - 2)}l-14 1`, pen),
  );
}

function farVeld(ctx: LayerCtx): string {
  const band = groundBand(ctx, 573, 3, 110, ctx.c('veldLight'));
  const parts: string[] = [band.svg];
  const inside: string[] = [];
  // Bands: paler at the horizon, a touch richer toward the viewer.
  inside.push(
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 640, 6, 150, ctx.bottom + 40),
      mix(ctx.c('veldLight'), ctx.c('veld'), 0.45),
    ),
  );
  inside.push(
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 700, 8, 170, ctx.bottom + 40),
      mix(ctx.c('veldLight'), ctx.c('veld'), 0.75),
    ),
  );
  // Streaks of soil and distant bossie dots (no ink at this distance).
  for (let k = 0; k < ctx.width / 160; k++) {
    const x = ctx.rnd() * ctx.width;
    const y = 590 + ctx.rnd() * 160;
    inside.push(
      flat(
        ellipseD(x, y, 30 + ctx.rnd() * 70, 2 + ctx.rnd() * 3),
        mix(ctx.c('soil'), ctx.c('veldLight'), 0.55),
      ),
    );
  }
  // Distant bossies: small, paler twiggy shrubs, thinly inked (aerial perspective).
  const far: { y: number; svg: string }[] = [];
  for (let x = ctx.rnd() * 40; x < ctx.width; x += 14 + ctx.rnd() * 46) {
    const y = 584 + Math.pow(ctx.rnd(), 1.3) * 170;
    const s = 3 + ((y - 580) / 170) * 7 + ctx.rnd() * 2;
    far.push({ y, svg: karooBush(ctx, x, y, s, { ink: ctx.pen.ink, w: 1.2 }) });
  }
  far.sort((a, b) => a.y - b.y);
  inside.push(...far.map((i) => i.svg));
  parts.push(g({ 'clip-path': `url(#${band.clip})` }, ...inside));
  parts.push(line(smoothD(band.edge, false, 0.8), ctx.pen));
  // A farmstead with bluegums, a far windpomp and a stand of trees, on the horizon line.
  const fx = ctx.u(0.62);
  parts.push(farmhouse(ctx, fx, (x) => yAt(band.edge, x)));
  const wx = ctx.u(0.36);
  parts.push(farWindpomp(ctx, wx, yAt(band.edge, wx) + 3));
  // v1.6: stands of sweet thorn along a dry riverbed line, as far trees (a few clumps each).
  for (const u of [0.08, 0.14, 0.88]) {
    const x = ctx.u(u);
    for (let k = 0; k < 3; k++) {
      const tx = x + k * 30 + ctx.rnd() * 12;
      parts.push(sweetThorn(ctx.rnd, tx, yAt(band.edge, tx) + 3, 40 + ctx.rnd() * 18, ctx, 'far'));
    }
  }
  // v1.6 (D-042): herds on the far veld (fauna rig, three poses, hazed for the plane).
  {
    const x = ctx.u(0.5);
    parts.push(herd(ctx.rnd, 'springbok', x, yAt(band.edge, x) + 16, 12, 8, 170, ctx.tint));
  }
  {
    const x = ctx.u(0.56);
    parts.push(herd(ctx.rnd, 'springbok', x, yAt(band.edge, x) + 22, 12, 4, 90, ctx.tint));
  }
  {
    const x = ctx.u(0.3);
    parts.push(herd(ctx.rnd, 'ostrich', x, yAt(band.edge, x) + 14, 24, 3, 70, ctx.tint));
  }
  return g({}, ...parts);
}

/** The farm track (mid layer): a pale two-rut dirt road receding from the bottom to the horizon. */
function track(
  ctx: LayerCtx,
  x0: number,
  yTop: number,
): { svg: string; xAt: (y: number) => number } {
  const yBot = ctx.bottom + 20;
  const xAt = (y: number): number => {
    const f = (yBot - y) / (yBot - yTop); // 0 bottom … 1 top
    return x0 - 340 * Math.pow(1 - f, 1.3) + Math.sin(f * Math.PI) * 40;
  };
  const halfAt = (y: number): number => {
    const f = (yBot - y) / (yBot - yTop);
    return 5 + 110 * Math.pow(1 - f, 1.8);
  };
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let y = yBot; y >= yTop; y -= 12) {
    left.push([xAt(y) - halfAt(y), y]);
    right.push([xAt(y) + halfAt(y), y]);
  }
  const road = smoothD([...left, ...right.reverse()], true, 0.6);
  const strip: Pt[] = [];
  const strip2: Pt[] = [];
  for (let y = yBot; y >= yTop + 20; y -= 12) {
    strip.push([xAt(y) - halfAt(y) * 0.22, y]);
    strip2.push([xAt(y) + halfAt(y) * 0.22, y]);
  }
  const mid = smoothD([...strip, ...strip2.reverse()], true, 0.6);
  const ruts: string[] = [];
  for (const side of [-0.62, 0.62]) {
    const pts: Pt[] = [];
    for (let y = yBot; y >= yTop + 6; y -= 12) pts.push([xAt(y) + halfAt(y) * side, y]);
    ruts.push(line(smoothD(pts, false, 0.6), { ink: shade(ctx.c('track'), -0.25), w: 2.5 }));
  }
  return {
    svg: g(
      {},
      flat(road, ctx.c('track')),
      flat(mid, mix(ctx.c('track'), ctx.c('veld'), 0.55)),
      ...ruts,
      line(smoothD(left, false, 0.6), ctx.pen, ctx.pen.w * 0.6),
      line(smoothD(right, false, 0.6), ctx.pen, ctx.pen.w * 0.6),
    ),
    xAt,
  };
}

function mid(ctx: LayerCtx): string {
  const band = groundBand(ctx, 658, 5, 150, ctx.c('veldLight'));
  const inside: string[] = [];
  inside.push(
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 690, 8, 170, ctx.bottom + 40),
      mix(ctx.c('veldLight'), ctx.c('veld'), 0.55),
    ),
  );
  inside.push(
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 730, 10, 190, ctx.bottom + 40), ctx.c('veld')),
  );
  inside.push(
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 835, 14, 210, ctx.bottom + 40),
      mix(ctx.c('veld'), ctx.c('veldDark'), 0.4),
    ),
  );
  // Red-soil patches, low and flat.
  for (let k = 0; k < ctx.width / 200; k++) {
    const x = ctx.rnd() * ctx.width;
    const y = 700 + ctx.rnd() * 200;
    const s = 0.5 + (y - 690) / 220;
    inside.push(
      flat(
        smoothD(
          edgePts(ctx.rnd, x - 90 * s, x + 90 * s, y, 4 * s, 30 * s).concat([
            [x + 60 * s, y + 9 * s],
            [x - 60 * s, y + 10 * s],
          ]),
          true,
          0.7,
        ),
        mix(ctx.c('soil'), ctx.c('veld'), 0.5),
      ),
    );
  }
  inside.push(
    hatch(
      ctx.rnd,
      0,
      ctx.width,
      690,
      760,
      Math.round(ctx.width / 12),
      7,
      shade(ctx.c('veld'), -0.12),
      1.5,
    ),
  );
  inside.push(
    hatch(
      ctx.rnd,
      0,
      ctx.width,
      760,
      910,
      Math.round(ctx.width / 9),
      12,
      shade(ctx.c('veld'), -0.2),
      2,
    ),
  );
  const road = track(ctx, ctx.u(0.47), 672);
  inside.push(road.svg);
  // Bossies and stones, smaller toward the horizon, never on the track; irregular spacing.
  const items: { y: number; svg: string }[] = [];
  const offTrack = (x: number, y: number) => Math.abs(x - road.xAt(y)) < 60 + (y - 660) * 0.35;
  for (let x = 20 + ctx.rnd() * 40; x < ctx.width;) {
    const y = 676 + Math.pow(ctx.rnd(), 0.9) * 230;
    const s = 9 + ((y - 660) / 250) * 30;
    if (!offTrack(x, y)) {
      const pen: Pen = { ink: ctx.pen.ink, w: s < 16 ? 2.5 : ctx.pen.w };
      if (ctx.rnd() < 0.1)
        items.push({
          y,
          svg: stone(ctx.rnd, x, y, s * 0.6, tone(ctx.c('stone'), 0.25, 0.25), pen),
        });
      else items.push({ y, svg: karooBush(ctx, x, y, s * (0.9 + ctx.rnd() * 0.7), pen) });
    }
    x += ctx.rnd() < 0.15 ? 140 + ctx.rnd() * 160 : 18 + ctx.rnd() * 70;
  }
  items.push(
    ...grassField(ctx.rnd, {
      x0: 0,
      x1: ctx.width,
      y0: 690,
      y1: 905,
      h: [10, 18],
      grow: 1.6,
      gap: 80,
      grass: grassTones(ctx),
      pen: { ink: ctx.pen.ink, w: 2.5 },
      twigs: { p: 0.2, colour: ctx.c('twig') },
      avoid: (x, y) => offTrack(x, y),
    }),
  );
  items.sort((a, b) => a.y - b.y);
  inside.push(...items.map((i) => i.svg));
  const parts = [band.svg, g({ 'clip-path': `url(#${band.clip})` }, ...inside)];
  parts.push(line(smoothD(band.edge, false, 0.8), ctx.pen));
  // Wire fence along the horizon (posts every ~120 px; the fence-bell prop has its own post).
  const bellX = ctx.u(0.6);
  const posts: Pt[] = [];
  const wood = tone(ctx.c('wood'), 0.25, 0.2);
  const fence: string[] = [];
  for (let x = -30; x < ctx.width + 60; x += 118) {
    const base = yAt(band.edge, x) + 12;
    posts.push([x, base]);
    if (Math.abs(x - bellX) < 50) continue;
    fence.push(post(x, base, 44, 7, wood, { ink: ctx.pen.ink, w: 2.5 }));
  }
  const wirePen: Pen = { ink: shade(ctx.pen.ink, 0.15), w: 1.5 };
  parts.push(...fence);
  parts.push(
    wire(
      posts.map(([x, y]) => [x, y - 30]),
      2.5,
      wirePen,
      1.5,
    ),
  );
  parts.push(
    wire(
      posts.map(([x, y]) => [x, y - 16]),
      2.5,
      wirePen,
      1.5,
    ),
  );
  // v1.6 (D-042): two sweet thorns in front of the fence, with pompoms, pods and thorns.
  for (const [u, h] of [
    [0.4, 250],
    [0.9, 200],
  ] as const) {
    const x = ctx.u(u);
    parts.push(sweetThorn(ctx.rnd, x, yAt(band.edge, x) + 46, h, ctx, 'mid'));
  }
  return g({}, ...parts);
}

function near(ctx: LayerCtx): string {
  const band = groundBand(ctx, 848, 9, 120, mix(ctx.c('veld'), ctx.c('veldDark'), 0.45));
  const inside: string[] = [];
  inside.push(
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 884, 10, 200, ctx.bottom + 40), ctx.c('veldDark')),
  );
  inside.push(
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 1000, 14, 230, ctx.bottom + 40),
      shade(ctx.c('veldDark'), -0.08),
    ),
  );
  for (let k = 0; k < ctx.width / 260; k++) {
    const x = ctx.rnd() * ctx.width;
    const y = 900 + ctx.rnd() * 170;
    inside.push(
      flat(
        smoothD(
          edgePts(ctx.rnd, x - 120, x + 120, y, 5, 40).concat([
            [x + 80, y + 12],
            [x - 90, y + 14],
          ]),
          true,
          0.7,
        ),
        mix(ctx.c('soil'), ctx.c('veldDark'), 0.35),
      ),
    );
  }
  inside.push(
    hatch(
      ctx.rnd,
      0,
      ctx.width,
      880,
      1080,
      Math.round(ctx.width / 7),
      18,
      shade(ctx.c('veldDark'), -0.22),
      2.5,
    ),
  );
  // Grass in irregular clusters (a calmer band where the pop-ups rise), stones, twigs, stalks,
  // and a few bossies.
  const pen: Pen = { ink: ctx.pen.ink, w: 5 };
  const items = grassField(ctx.rnd, {
    x0: 0,
    x1: ctx.width,
    y0: 856,
    y1: 1078,
    h: [28, 50],
    grow: 1.3,
    gap: 95,
    grass: grassTones(ctx),
    pen: { ink: ctx.pen.ink, w: 4 },
    stones: { p: 0.22, tone: tone(ctx.c('stone'), 0.25, 0.25) },
    twigs: { p: 0.3, colour: ctx.c('twig') },
    stalks: { p: 0.25, colour: ctx.c('bleached'), head: ctx.c('seed') },
    avoid: (_x, y) => y > 905 && y < 965 && ctx.rnd() < 0.6,
  });
  for (let x = 200 + ctx.rnd() * 300; x < ctx.width; x += 450 + ctx.rnd() * 800) {
    const y = 960 + ctx.rnd() * 60;
    items.push({ y, svg: karooBush(ctx, x, y, 24 + ctx.rnd() * 18, pen) });
  }
  // Golden tufts with seed heads among the grass.
  for (let x = 60 + ctx.rnd() * 200; x < ctx.width; x += 140 + ctx.rnd() * 320) {
    const y = 880 + ctx.rnd() * 190;
    if (y > 905 && y < 965) continue;
    items.push({
      y,
      svg: veldTuft(ctx, x, y, 34 + ((y - 860) / 220) * 26, { ink: ctx.pen.ink, w: 3 }),
    });
  }
  items.sort((a, b) => a.y - b.y);
  inside.push(...items.map((i) => i.svg));
  return g(
    {},
    band.svg,
    g({ 'clip-path': `url(#${band.clip})` }, ...inside),
    line(smoothD(band.edge, false, 0.8), ctx.pen),
  );
}

function foreground(ctx: LayerCtx): string {
  const parts: string[] = [];
  const pen = ctx.pen;
  const grass = grassTones(ctx, 0.3);
  const avoid = [ctx.u(0.05), ctx.u(0.93)];
  const kinds: Weighted<TuftKind>[] = [
    { v: 'fan', w: 3 },
    { v: 'seeding', w: 2.5 },
    { v: 'wispy', w: 2 },
    { v: 'upright', w: 2 },
    { v: 'windswept', w: 1.5 },
  ];
  for (let x = 160 + ctx.rnd() * 200; x < ctx.width; x += 500 + ctx.rnd() * 800) {
    if (avoid.some((a) => Math.abs(a - x) < 320)) continue;
    const kind = ctx.rnd();
    if (kind < 0.2) {
      // An old leaning fence post with a curl of slack wire.
      const base = 1090;
      parts.push(
        g(
          { transform: `rotate(${r2(-7 + ctx.rnd() * 4)} ${r2(x)} ${base})` },
          post(x, base, 170, 22, tone(ctx.c('wood'), 0.3, 0.2), pen),
        ),
      );
      parts.push(
        line(`M${r2(x + 8)} ${r2(base - 120)}c40 -6 70 10 60 30s-40 10 -30 -8 50 -14 90 4`, {
          ink: pen.ink,
          w: 2.5,
        }),
      );
    } else if (kind < 0.38) {
      parts.push(
        stone(ctx.rnd, x, 1082, 50 + ctx.rnd() * 26, tone(ctx.c('stone'), 0.28, 0.25), pen),
      );
    }
    // A clump of mixed tufts: varied heights, a few tall seed heads.
    const n = 2 + Math.floor(ctx.rnd() * 5);
    for (let k = 0; k < n; k++) {
      const tx = x + (ctx.rnd() - 0.5) * 220;
      const h = 70 + Math.pow(ctx.rnd(), 1.5) * 140;
      parts.push(
        tuftOf(
          pick(ctx.rnd, kinds),
          ctx.rnd,
          tx,
          1088 + ctx.rnd() * 8,
          h,
          pick(ctx.rnd, grass),
          pen,
          ctx.c('seed'),
        ),
      );
    }
    if (ctx.rnd() < 0.5)
      parts.push(
        stalk(
          ctx.rnd,
          x + (ctx.rnd() - 0.5) * 160,
          1090,
          180 + ctx.rnd() * 60,
          ctx.c('bleached'),
          ctx.c('seed'),
          { ink: pen.ink, w: 3 },
        ),
      );
  }
  return g({}, ...parts);
}

// --- props ---------------------------------------------------------------------------------

export function groundShadow(x: number, y: number, rx: number, ry: number): string {
  return flat(ellipseD(x, y, rx, ry), '#5A3418', { opacity: 0.28 });
}

function windpomp(ctx: PropCtx): string {
  const pen = ctx.pen;
  const steel = tone(ctx.c('metal'), 0.3, 0.25);
  const { h, oy } = ctx.box;
  const base = oy + h / 2; // tower foot (310)
  const top = oy - h / 2 + 10; // platform (−60)
  const legs = (dx: number, w: number, col: string) =>
    line(
      `M${r2(-45 + dx)} ${r2(base)}L${r2(-8 + dx)} ${r2(top)}M${r2(45 + dx)} ${r2(base)}L${r2(8 + dx)} ${r2(top)}`,
      { ink: col, w },
      w,
    );
  const braces: string[] = [];
  const levels = 6;
  for (let k = 0; k < levels; k++) {
    const y0 = base - ((base - top) * k) / levels;
    const y1 = base - ((base - top) * (k + 1)) / levels;
    const hw0 = 45 - (37 * k) / levels;
    const hw1 = 45 - (37 * (k + 1)) / levels;
    braces.push(
      `M${r2(-hw0)} ${r2(y0)}L${r2(hw1)} ${r2(y1)}M${r2(hw0)} ${r2(y0)}L${r2(-hw1)} ${r2(y1)}M${r2(-hw1)} ${r2(y1)}L${r2(hw1)} ${r2(y1)}`,
    );
  }
  return g(
    {},
    groundShadow(10, base + 2, 66, 9),
    // Back legs (3/4 view), then bracing, front legs, pump rod and the pipe to the reservoir.
    legs(14, 4, shade(steel.fill, -0.35)),
    line(braces.join(''), { ink: pen.ink, w: 2.2 }, 2.2),
    line(braces.join(''), { ink: steel.light, w: 0.9 }, 0.9),
    legs(0, 7, pen.ink),
    legs(0, 3.5, steel.fill),
    line(`M0 ${r2(top)}L0 ${r2(base - 18)}`, { ink: pen.ink, w: 3 }, 3),
    inked(
      polyD([
        [-12, base],
        [-12, base - 22],
        [12, base - 22],
        [12, base],
      ]),
      steel.dark,
      pen.ink,
      3,
    ),
    inked(
      polyD([
        [10, base - 12],
        [74, base - 12],
        [74, base - 4],
        [10, base - 4],
      ]),
      steel.fill,
      pen.ink,
      2.5,
    ),
    // Platform and head (the rotor itself is the secret's own sprite, secret/rotor).
    inked(
      polyD([
        [-22, top + 4],
        [22, top + 4],
        [18, top - 2],
        [-18, top - 2],
      ]),
      ctx.c('wood'),
      pen.ink,
      3,
    ),
    // Tail boom and vane (fictional plain vane: no lettering). The kwêvoël perches on the boom:
    // its content perch (−150, −92) puts its feet at y ≈ −31 at mid scale, so the boom dips to meet it.
    inked(
      polyD([
        [0, top - 14],
        [-168, top + 27],
        [-168, top + 32],
        [0, top - 6],
      ]),
      steel.dark,
      pen.ink,
      3,
    ),
    inked(
      smoothD(
        [
          [-205, top + 28],
          [-140, top + 28],
          [-146, top + 74],
          [-200, top + 82],
          [-212, top + 54],
        ],
        true,
        0.4,
      ),
      steel.fill,
      pen.ink,
      3.5,
    ),
    flat(
      polyD([
        [-176, top + 32],
        [-146, top + 32],
        [-150, top + 70],
        [-176, top + 52],
      ]),
      steel.dark,
    ),
    line(`M${-196} ${top + 38}l42 0`, { ink: steel.light, w: 2.5 }, 2.5),
    inked(ellipseD(0, top - 10, 16, 14), ctx.c('rust'), pen.ink, 3),
  );
}

function reservoir(ctx: PropCtx): string {
  const pen = ctx.pen;
  const metal = tone(ctx.c('metal'), 0.28, 0.3);
  const rx = 165;
  const rimY = -28;
  const botY = 40;
  const ry = 24;
  const wall = `M${-rx} ${rimY}L${-rx} ${botY}A${rx} ${ry} 0 0 0 ${rx} ${botY}L${rx} ${rimY}Z`;
  const id = nextId();
  const ribs: string[] = [];
  for (let x = -rx + 10; x < rx; x += 13) {
    const lit = x < -40;
    ribs.push(
      flat(`M${r2(x)} ${rimY}l5 0l0 ${botY - rimY + ry}l-5 0Z`, lit ? metal.light : metal.dark, {
        opacity: lit ? 0.75 : 0.5,
      }),
    );
  }
  return g(
    {},
    groundShadow(14, botY + 14, 186, 24),
    el('clipPath', { id }, el('path', { d: wall })),
    flat(wall, metal.fill),
    g(
      { 'clip-path': `url(#${id})` },
      ...ribs,
      flat(
        `M${rx * 0.25} ${rimY}L${rx} ${rimY}L${rx} ${botY + ry}L${rx * 0.2} ${botY + ry}Z`,
        metal.dark,
        { opacity: 0.85 },
      ),
      flat(ellipseD(-60, 22, 30, 8), ctx.c('rust'), { opacity: 0.7 }),
      flat(ellipseD(90, 30, 22, 6), ctx.c('rust'), { opacity: 0.8 }),
      flat(`M${-120} ${rimY + 4}l6 0l3 60l-5 0Z`, ctx.c('rust'), { opacity: 0.6 }),
    ),
    el('path', {
      d: wall,
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': pen.w,
      'stroke-linejoin': 'round',
    }),
    // Rim with the water inside, lit from the sky.
    inked(ellipseD(0, rimY, rx, ry), shade(metal.fill, 0.15), pen.ink, pen.w),
    flat(ellipseD(0, rimY + 3, rx - 10, ry - 6), '#5F95A6'),
    flat(ellipseD(-40, rimY + 1, 60, 6), '#9CCBD8'),
    line(
      `M${-rx + 20} ${rimY + 5}A${rx - 20} ${ry - 8} 0 0 1 ${rx - 20} ${rimY + 5}`,
      { ink: shade('#5F95A6', -0.35), w: 2 },
      2,
    ),
    // Inlet pipe from the windpomp and a little ladder.
    inked(
      `M-202 ${botY - 10}L-176 ${botY - 10}L-176 ${rimY - 6}L-150 ${rimY - 6}L-150 ${rimY + 1}L-170 ${rimY + 1}L-170 ${botY - 3}L-202 ${botY - 3}Z`,
      metal.dark,
      pen.ink,
      2.5,
    ),
    line(
      `M118 ${rimY + 10}L124 ${botY + 18}M140 ${rimY + 8}L146 ${botY + 16}M120 ${rimY + 26}l22 -2M121 ${rimY + 44}l22 -2M123 ${rimY + 62}l22 -2`,
      { ink: pen.ink, w: 3 },
      3,
    ),
  );
}

/**
 * D-035: the farm bakkie, semi-realistic. An old single-cab pickup facing right, with no badge or
 * brand: faded red paint over primer and rust, a swage line and panel gaps, a door with a chrome
 * handle and keyhole, a mirror on its arm, a windscreen and side glass reflecting the sky, a
 * slatted grille, a round headlight, amber indicators, red tail lights, chrome bumpers, a roll bar
 * and tie-down hooks on the load bin, treaded tyres on steel rims, dust and mud low down, two
 * dents. The spare wheel in the bin is the secret (content part at (−180, −40), 32 × 36).
 */
function bakkie(ctx: PropCtx): string {
  const ink = shade(ctx.c('rust'), -0.7);
  const pen: Pen = { ink, w: Math.max(1.4, ctx.pen.w * 0.5) };
  const paintBase = mix('#A6533A', ctx.c('rust'), 0.25);
  const paintTop = shade(paintBase, 0.22);
  const paintLow = shade(paintBase, -0.28);
  const rust = ctx.c('rust');
  const mud = '#7A5A3C';
  const dust = '#C9A878';
  const chrome = ['#F4F6F7', '#A9B1B6', '#5E666C'] as const;
  const tyre = '#24201E';
  const wheelR = 40;
  const wheelY = 58;
  const frontX = 140;
  const rearX = -128;
  const archR = 50;
  const bodyD =
    `M-208 -46L-22 -46L-14 -54L-2 -97Q1 -102 8 -102L90 -102Q97 -102 101 -96L127 -50L194 -42` +
    `Q211 -38 214 -25L216 38Q216 46 209 46L${r2(frontX + archR)} 46` +
    `A${archR} ${archR} 0 0 0 ${r2(frontX - archR)} 46L${r2(rearX + archR)} 46` +
    `A${archR} ${archR} 0 0 0 ${r2(rearX - archR)} 46L-203 46Q-208 46 -208 40Z`;
  const id = nextId();
  const gPaint = nextId();
  const gGlass = nextId();
  const gChrome = nextId();
  const gTyre = nextId();
  const parts: string[] = [];
  const stroke = (d: string, col: string, w: number, op = 1): string =>
    el('path', {
      d,
      fill: 'none',
      stroke: col,
      'stroke-width': w,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      ...(op < 1 ? { 'stroke-opacity': op } : {}),
    });
  const fill = (d: string, col: string, op = 1): string =>
    el('path', { d, fill: col, ...(op < 1 ? { 'fill-opacity': op } : {}) });
  parts.push(
    el(
      'linearGradient',
      { id: gPaint, x1: 0, y1: -102, x2: 0, y2: 46, gradientUnits: 'userSpaceOnUse' },
      el('stop', { offset: 0, 'stop-color': paintTop }),
      el('stop', { offset: 0.45, 'stop-color': paintBase }),
      el('stop', { offset: 1, 'stop-color': paintLow }),
    ),
    el(
      'linearGradient',
      { id: gGlass, x1: 0, y1: -96, x2: 30, y2: -50, gradientUnits: 'userSpaceOnUse' },
      el('stop', { offset: 0, 'stop-color': '#DCEBF2' }),
      el('stop', { offset: 0.5, 'stop-color': '#8FB4C8' }),
      el('stop', { offset: 1, 'stop-color': '#4A6170' }),
    ),
    el(
      'linearGradient',
      { id: gChrome, x1: 0, y1: 0, x2: 0, y2: 1 },
      el('stop', { offset: 0, 'stop-color': chrome[0] }),
      el('stop', { offset: 0.45, 'stop-color': chrome[1] }),
      el('stop', { offset: 0.55, 'stop-color': chrome[2] }),
      el('stop', { offset: 1, 'stop-color': chrome[1] }),
    ),
    el(
      'radialGradient',
      { id: gTyre },
      el('stop', { offset: 0.55, 'stop-color': '#3A3431' }),
      el('stop', { offset: 0.85, 'stop-color': tyre }),
      el('stop', { offset: 1, 'stop-color': '#141110' }),
    ),
  );
  // Contact shadow, and the dark wheel wells behind the wheels.
  parts.push(contactShadow(8, wheelY + wheelR - 4, 236, 10, 0.34));
  for (const cx of [rearX, frontX])
    parts.push(fill(ellipseD(cx, 46, archR + 1, archR + 1), '#1E1A18'));
  // The body: paint gradient, then everything on the paint inside its clip.
  parts.push(el('clipPath', { id }, el('path', { d: bodyD })), fill(bodyD, `url(#${gPaint})`));
  const onPaint: string[] = [];
  // Sky sheen along the shoulder, the swage line, the dark rocker panel.
  onPaint.push(
    fill(
      polyD([
        [-210, -45],
        [-20, -45],
        [-20, -38],
        [-210, -38],
      ]),
      shade(paintTop, 0.35),
      0.55,
    ),
    fill(
      polyD([
        [128, -48],
        [196, -40],
        [198, -34],
        [128, -42],
      ]),
      shade(paintTop, 0.35),
      0.5,
    ),
    stroke('M-206 -12L212 -10', shade(paintTop, 0.3), 2.2, 0.8),
    stroke('M-206 -9L212 -7', shade(paintLow, -0.25), 1.6, 0.8),
    fill(
      polyD([
        [-210, 30],
        [220, 30],
        [220, 50],
        [-210, 50],
      ]),
      shade(paintLow, -0.3),
      0.7,
    ),
  );
  // Panel gaps: tailgate, bin/cab seam, door, bonnet line, fender seam.
  onPaint.push(
    stroke('M-196 -44L-196 40', ink, 1.3, 0.8),
    stroke('M-18 -44L-18 44', ink, 1.6, 0.85),
    stroke('M-8 -52L-6 34Q-6 42 2 42L104 42Q112 42 114 34L120 -44', ink, 1.5, 0.85),
    stroke('M127 -48Q160 -46 200 -40', ink, 1.1, 0.6),
    stroke('M190 -40L190 30', ink, 1.1, 0.6),
  );
  // Rust: around the arches and along the bin's foot (dark edges, lighter flecks).
  const rustBlob = (x: number, y: number, rx: number, ry: number): string[] => {
    const pts: Pt[] = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const rr = 0.7 + ctx.rnd() * 0.5;
      pts.push([x + Math.cos(a) * rx * rr, y + Math.sin(a) * ry * rr]);
    }
    const d = smoothD(pts, true, 1);
    return [
      fill(d, shade(rust, -0.25), 0.85),
      fill(ellipseD(x - rx * 0.2, y - ry * 0.2, rx * 0.5, ry * 0.4), shade(rust, 0.15), 0.6),
      stroke(d, shade(rust, -0.5), 0.8, 0.6),
    ];
  };
  onPaint.push(
    ...rustBlob(rearX - 56, 32, 16, 9),
    ...rustBlob(rearX + 58, 30, 12, 7),
    ...rustBlob(frontX - 58, 34, 10, 6),
    ...rustBlob(-150, -36, 9, 4),
    ...rustBlob(170, 26, 9, 5),
  );
  // Two dents: a soft dark crescent under a lit edge.
  for (const [dx, dy, r] of [
    [-70, -24, 16],
    [62, 8, 12],
  ] as const)
    onPaint.push(
      fill(ellipseD(dx + 2, dy + 2, r, r * 0.55), shade(paintBase, -0.35), 0.45),
      stroke(
        `M${r2(dx - r)} ${r2(dy - 1)}Q${r2(dx)} ${r2(dy - r * 0.7)} ${r2(dx + r)} ${r2(dy - 1)}`,
        shade(paintTop, 0.4),
        1.4,
        0.7,
      ),
    );
  // Dust over the lower third and mud thrown up behind the wheels.
  const dustD = polyD([
    [-212, 6],
    [222, 10],
    [222, 50],
    [-212, 50],
  ]);
  onPaint.push(fill(dustD, dust, 0.28));
  for (const cx of [rearX, frontX])
    for (let k = 0; k < 16; k++) {
      const ang = Math.PI * (0.9 + ctx.rnd() * 0.5);
      const rr = archR + 2 + ctx.rnd() * 22;
      const mx = cx + Math.cos(ang) * rr;
      const my = 46 + Math.sin(ang) * rr * 0.6;
      onPaint.push(fill(ellipseD(mx, my, 2 + ctx.rnd() * 4, 1.2 + ctx.rnd() * 2.2), mud, 0.65));
    }
  // Fuel filler on the bin side.
  onPaint.push(
    fill(ellipseD(-48, -24, 7, 7), shade(paintLow, -0.2)),
    stroke(ellipseD(-48, -24, 7, 7), ink, 1, 0.7),
    fill(ellipseD(-50, -26, 2.5, 2.5), shade(paintTop, 0.4), 0.7),
  );
  parts.push(g({ 'clip-path': `url(#${id})` }, ...onPaint));
  parts.push(stroke(bodyD, ink, pen.w));
  // Side glass with the sky in it, a headrest behind, the rubber frame.
  const glassD = polyD([
    [4, -94],
    [90, -94],
    [114, -54],
    [4, -54],
  ]);
  const glassId = nextId();
  parts.push(
    fill(glassD, `url(#${gGlass})`),
    el('clipPath', { id: glassId }, el('path', { d: glassD })),
    g(
      { 'clip-path': `url(#${glassId})` },
      fill(ellipseD(20, -66, 10, 14), '#2E3A42', 0.55),
      fill(
        polyD([
          [30, -96],
          [44, -96],
          [22, -50],
          [8, -50],
        ]),
        '#FFFFFF',
        0.45,
      ),
      fill(
        polyD([
          [52, -96],
          [58, -96],
          [36, -50],
          [30, -50],
        ]),
        '#FFFFFF',
        0.3,
      ),
      fill(
        polyD([
          [4, -60],
          [120, -64],
          [120, -50],
          [4, -50],
        ]),
        '#C9A878',
        0.25,
      ),
    ),
    stroke(glassD, '#1E1A18', 2.4),
    // Windscreen edge seen past the A-pillar.
    stroke('M101 -96L127 -50', '#2A2522', 3),
    stroke('M104 -94L125 -56', '#DCEBF2', 1, 0.7),
  );
  // Mirror on its arm, the door handle and keyhole.
  parts.push(
    stroke('M114 -58L126 -64', '#2A2522', 2.4),
    el('rect', {
      x: 122,
      y: -78,
      width: 14,
      height: 17,
      rx: 3,
      fill: '#2A2522',
      stroke: ink,
      'stroke-width': 1,
    }),
    fill(
      polyD([
        [124, -76],
        [128, -76],
        [125, -64],
        [124, -64],
      ]),
      chrome[1],
      0.8,
    ),
    el('rect', {
      x: 2,
      y: -40,
      width: 20,
      height: 5,
      rx: 2.5,
      fill: `url(#${gChrome})`,
      stroke: ink,
      'stroke-width': 0.8,
    }),
    fill(ellipseD(28, -37.5, 1.6, 1.6), '#2A2522'),
  );
  // Roll bar behind the cab, tie-down hooks along the bin rail, tailgate latch, tail light.
  parts.push(
    stroke('M-30 -46L-30 -86Q-30 -91 -35 -91L-42 -91M-33 -84L-92 -46', '#2A2522', 5),
    stroke('M-31.5 -48L-31.5 -84M-36 -82L-90 -48', chrome[0], 1.2, 0.5),
    ...[-170, -130, -90, -50].map((hx) => stroke(`M${hx} -46q0 6 5 6`, chrome[1], 2)),
    el('rect', {
      x: -200,
      y: -6,
      width: 4,
      height: 8,
      fill: chrome[1],
      stroke: ink,
      'stroke-width': 0.6,
    }),
    el('rect', {
      x: -210,
      y: -42,
      width: 7,
      height: 26,
      rx: 1.5,
      fill: '#B5241E',
      stroke: ink,
      'stroke-width': 1,
    }),
    fill(
      polyD([
        [-209, -40],
        [-206, -40],
        [-206, -20],
        [-209, -20],
      ]),
      '#F07A6A',
      0.7,
    ),
    el('rect', {
      x: -210,
      y: -14,
      width: 7,
      height: 6,
      fill: '#E9A23B',
      stroke: ink,
      'stroke-width': 0.8,
    }),
  );
  // The nose: slatted grille, round headlight in a chrome ring, amber indicator.
  parts.push(
    el('rect', { x: 205, y: -24, width: 10, height: 34, rx: 1, fill: '#2A2522' }),
    ...[0, 1, 2, 3, 4, 5].map((k) => stroke(`M206 ${-20 + k * 5.5}h8`, chrome[1], 1.6)),
    fill(ellipseD(202, -22, 9, 9), `url(#${gChrome})`),
    fill(ellipseD(202, -22, 6.5, 6.5), '#F4EBC4'),
    fill(ellipseD(200, -24.5, 2.6, 2.2), '#FFFFFF', 0.95),
    stroke(ellipseD(202, -22, 9, 9), ink, 1),
    el('rect', {
      x: 196,
      y: -10,
      width: 10,
      height: 6,
      rx: 1.5,
      fill: '#F2A33A',
      stroke: ink,
      'stroke-width': 0.8,
    }),
    fill(
      polyD([
        [197, -9],
        [201, -9],
        [201, -7],
        [197, -7],
      ]),
      '#FFE0A0',
      0.8,
    ),
  );
  // Chrome bumpers (pitted at the ends), front and rear.
  const bumper = (x: number, w: number): string[] => [
    el('rect', {
      x,
      y: 20,
      width: w,
      height: 13,
      rx: 3,
      fill: `url(#${gChrome})`,
      stroke: ink,
      'stroke-width': 1.2,
    }),
    fill(ellipseD(x + w * 0.2, 31, 4, 1.5), '#6E5A48', 0.6),
    fill(ellipseD(x + w * 0.8, 23, 3, 1.2), '#6E5A48', 0.5),
  ];
  parts.push(...bumper(184, 40), ...bumper(-218, 26));
  // The spare wheel (the secret, content part at (−180, −40), 32 × 36): bolted to a bracket on
  // the outside of the bin by the tailgate, leaning back a little, in front of the bin side so
  // nearly all of its hit ellipse shows the wheel (review of #49: inside the bin, 58 % of it was
  // hidden and the plain panel triggered the secret).
  const spareTread = Array.from({ length: 14 }, (_, n) => {
    const a = (n / 14) * Math.PI * 2;
    return `M${r2(-180 + Math.cos(a) * 29)} ${r2(-40 + Math.sin(a) * 33)}L${r2(-180 + Math.cos(a) * 32)} ${r2(-40 + Math.sin(a) * 36)}`;
  }).join('');
  parts.push(
    contactShadow(-174, -2, 30, 4, 0.3),
    g(
      { transform: 'rotate(-6 -180 -40)' },
      el('rect', { x: -186, y: -50, width: 12, height: 22, rx: 2, fill: '#3A3431' }),
      fill(ellipseD(-180, -40, 32, 36), `url(#${gTyre})`),
      stroke(spareTread, '#4A4340', 2.2),
      stroke(ellipseD(-180, -40, 32, 36), shade('#24201E', -0.2), pen.w),
      fill(ellipseD(-180, -40, 15, 17), '#C9CDD0'),
      fill(ellipseD(-178, -38, 13, 15), '#9AA1A6', 0.5),
      fill(ellipseD(-180, -40, 6, 7), '#8A9196'),
      stroke(ellipseD(-180, -40, 15, 17), '#5E666C', 1.2),
      fill(ellipseD(-186, -48, 4, 5), '#FFFFFF', 0.7),
      fill(ellipseD(-180, -40, 2.2, 2.2), '#3A3431'),
      fill(ellipseD(-180, -20, 26, 8), dust, 0.3),
    ),
  );
  // The road wheels: treaded tyre, steel rim with holes, hub with nuts, dust on the rubber.
  const wheel = (cx: number): string => {
    const tread: string[] = [];
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      tread.push(
        `M${r2(cx + c * (wheelR - 5))} ${r2(wheelY + sn * (wheelR - 5))}L${r2(cx + c * wheelR)} ${r2(wheelY + sn * wheelR)}`,
      );
    }
    const holes: string[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      holes.push(ellipseD(cx + Math.cos(a) * 13, wheelY + Math.sin(a) * 13, 3, 3));
    }
    const nuts: string[] = [];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      nuts.push(ellipseD(cx + Math.cos(a) * 6, wheelY + Math.sin(a) * 6, 1.3, 1.3));
    }
    return g(
      {},
      fill(ellipseD(cx, wheelY, wheelR, wheelR), `url(#${gTyre})`),
      stroke(tread.join(''), '#4A4340', 3),
      stroke(ellipseD(cx, wheelY, wheelR, wheelR), ink, pen.w),
      fill(ellipseD(cx, wheelY + 26, wheelR * 0.8, 10), dust, 0.35),
      fill(ellipseD(cx, wheelY, 21, 21), '#D7DBDD'),
      fill(ellipseD(cx + 4, wheelY + 4, 19, 19), '#9AA1A6', 0.6),
      fill(holes.join(''), '#3A3431'),
      fill(ellipseD(cx, wheelY, 9, 9), '#B9BFC3'),
      fill(nuts.join(''), '#5E666C'),
      stroke(ellipseD(cx, wheelY, 21, 21), '#4A5257', 1.4),
      fill(ellipseD(cx - 7, wheelY - 9, 5, 3), '#FFFFFF', 0.7),
    );
  };
  parts.push(wheel(rearX), wheel(frontX));
  // Mud flap behind the rear wheel.
  parts.push(el('rect', { x: rearX + archR - 4, y: 44, width: 5, height: 30, fill: '#1E1A18' }));
  return g({}, ...parts);
}

function potjie(ctx: PropCtx): string {
  const pen: Pen = { ink: ctx.pen.ink, w: 5 };
  const iron = tone('#3A3533', 0.3, 0.45);
  const id = nextId();
  const belly = ellipseD(0, 8, 62, 50);
  const parts: string[] = [];
  // Ash ring stones, crossed logs, flames, then the pot on its three legs.
  for (const [x, y, r] of [
    [-78, 98, 14],
    [-46, 106, 12],
    [44, 106, 13],
    [80, 97, 14],
  ] as const)
    parts.push(stone(ctx.rnd, x, y, r, tone(ctx.c('stone'), 0.25, 0.25), pen));
  parts.push(
    inked(
      polyD([
        [-60, 92],
        [58, 78],
        [62, 90],
        [-56, 104],
      ]),
      ctx.c('trunk'),
      pen.ink,
      4,
    ),
  );
  parts.push(
    inked(
      polyD([
        [-54, 76],
        [62, 96],
        [56, 106],
        [-60, 88],
      ]),
      shade(ctx.c('trunk'), -0.15),
      pen.ink,
      4,
    ),
  );
  const flame = (x: number, h: number, w: number, col: string) =>
    inked(
      smoothD(
        [
          [x - w, 90],
          [x - w * 0.8, 90 - h * 0.5],
          [x - w * 0.1, 90 - h],
          [x + w * 0.2, 90 - h * 0.6],
          [x + w * 0.5, 90 - h * 0.85],
          [x + w, 90],
        ],
        true,
        0.7,
      ),
      col,
      pen.ink,
      3.5,
    );
  parts.push(
    flame(-26, 46, 18, ctx.c('aloeFlower')),
    flame(22, 50, 18, ctx.c('aloeFlower')),
    flame(0, 40, 16, ctx.c('aloeBud')),
  );
  for (const x of [-38, 0, 38])
    parts.push(
      inked(
        polyD([
          [x - 6, 48],
          [x - 4, 76],
          [x + 4, 76],
          [x + 6, 48],
        ]),
        iron.fill,
        pen.ink,
        4,
      ),
    );
  parts.push(
    el('clipPath', { id }, el('path', { d: belly })),
    flat(belly, iron.fill),
    g(
      { 'clip-path': `url(#${id})` },
      flat(ellipseD(26, 28, 56, 42), iron.dark),
      flat(ellipseD(-30, -8, 14, 22), iron.light),
      flat(ellipseD(-6, 46, 50, 14), shade(ctx.c('aloeFlower'), -0.1), { opacity: 0.35 }),
    ),
    el('path', { d: belly, fill: 'none', stroke: pen.ink, 'stroke-width': pen.w }),
    // Wire handles, the rim and the domed lid with its knob (lid = the secret part, y −57 … −23).
    line('M-60 -14c-14 0 -16 18 -4 22M60 -14c14 0 16 18 4 22', pen, 3.5),
    inked(ellipseD(0, -30, 56, 11), iron.dark, pen.ink, pen.w),
    inked(
      smoothD(
        [
          [-52, -32],
          [-40, -48],
          [0, -54],
          [40, -48],
          [52, -32],
        ],
        true,
        0.6,
      ),
      shade(iron.fill, 0.12),
      pen.ink,
      pen.w,
    ),
    flat(ellipseD(-18, -44, 16, 4), iron.light),
    inked(ellipseD(0, -56, 10, 6), iron.dark, pen.ink, 4),
    // Steam.
    line('M-10 -66c-14 -14 12 -22 0 -38s8 -16 4 -18', { ink: '#F4F1E8', w: 7 }, 7, {
      opacity: '0.8',
    }),
    line('M16 -70c-10 -12 10 -18 2 -32', { ink: '#F4F1E8', w: 5 }, 5, { opacity: '0.7' }),
  );
  return g({}, ...parts);
}

function fenceBell(ctx: PropCtx): string {
  const pen = ctx.pen;
  const wood = tone(ctx.c('wood'), 0.28, 0.22);
  const brass = tone('#D8A73A', 0.3, 0.4);
  const id = nextId();
  const bell = smoothD(
    [
      [-30, 6],
      [-22, -16],
      [-18, -38],
      [0, -48],
      [18, -38],
      [22, -16],
      [30, 6],
    ],
    true,
    0.5,
  );
  return g(
    {},
    groundShadow(8, 62, 40, 6),
    // No wires of its own: the mid layer's fence passes behind the post.
    post(0, 62, 158, 20, wood, pen),
    line('M-6 -70l12 0M-6 30l12 0', { ink: wood.dark, w: 2 }, 2),
    // Iron bracket and the brass bell (secret part: ellipse 30 × 28 at (0, −20)).
    inked(
      polyD([
        [-4, -64],
        [24, -64],
        [24, -56],
        [4, -56],
      ]),
      '#55504A',
      pen.ink,
      3,
    ),
    line('M14 -56L14 -48', pen, 3),
    g(
      { transform: 'translate(14 4)' },
      el('clipPath', { id }, el('path', { d: bell })),
      flat(bell, brass.fill),
      g(
        { 'clip-path': `url(#${id})` },
        flat(ellipseD(14, -8, 18, 30), brass.dark),
        flat(ellipseD(-10, -24, 5, 14), brass.light),
      ),
      el('path', {
        d: bell,
        fill: 'none',
        stroke: pen.ink,
        'stroke-width': pen.w,
        'stroke-linejoin': 'round',
      }),
      inked(ellipseD(0, 6, 30, 6), brass.dark, pen.ink, 3),
      inked(ellipseD(2, 12, 6, 6), '#55504A', pen.ink, 2.5),
      line('M2 18c-4 10 4 18 -2 30', { ink: '#C9B48A', w: 3 }, 3),
    ),
  );
}

function aloes(rosettes: readonly (readonly [number, number, number])[]) {
  return (ctx: PropCtx): string => {
    const pen = ctx.pen;
    const parts: string[] = [];
    // Earth mound, flowers behind, rosettes back to front.
    parts.push(
      inked(
        smoothD(
          [
            [-150, 130],
            [-130, 96],
            [-60, 82],
            [40, 84],
            [130, 96],
            [150, 130],
          ],
          true,
          0.7,
        ),
        ctx.c('veldDark'),
        pen.ink,
        pen.w,
      ),
    );
    for (const [x, y, s] of rosettes) {
      const n = s > 90 ? 3 : s > 70 ? 2 : 1;
      parts.push(
        aloeFlowers(
          ctx.rnd,
          x,
          y - s * 0.3,
          Math.min(s * 1.75, (y - s * 0.3 + 170) / 1.3),
          n,
          ctx.c('aloeFlower'),
          ctx.c('aloeBud'),
          shade(ctx.c('aloe'), -0.2),
          pen,
        ),
      );
    }
    for (const [x, y, s] of [...rosettes].sort((a, b) => a[1] - b[1]))
      parts.push(aloeRosette(ctx, x, y, s, pen));
    parts.push(tuft(ctx.rnd, -120, 126, 60, tone(ctx.c('veld'), 0.22, 0.25), pen));
    parts.push(tuft(ctx.rnd, 118, 128, 54, tone(ctx.c('veldLight'), 0.22, 0.2), pen));
    return g({}, ...parts);
  };
}

export const KAROO_PLAN: BiomeArtPlan = {
  biome: 'karoo-autumn',
  layers: {
    sky: { top: 0, height: 1080, encode: 'png', draw: sky },
    // v1.6 (D-042): 128-colour palettes keep the home biome inside the 3 MB first download.
    far_ridge: { top: 380, height: 280, colours: 128, draw: farRidge },
    // v1.3: the Ver plane's strip (shown only on maps that open it).
    ver_veld: {
      top: 536,
      height: 52,
      draw: verVeld({ ground: 'veld', light: 'veldLight', scrub: 'bossie' }),
    },
    far_veld: { top: 464, height: 232, colours: 128, draw: farVeld },
    // v1.6: taller, for the sweet thorns' crowns.
    mid: { top: 430, height: 480, colours: 128, draw: mid },
    near: { top: 820, height: 260, colours: 128, draw: near },
    foreground: { top: 880, height: 200, fadeTop: 28, colours: 128, draw: foreground },
  },
  props: {
    'karoo/windpomp': { draw: windpomp, frame: { w: 310, h: 560, ox: 225, oy: 210 } },
    'karoo/reservoir': { draw: reservoir },
    'karoo/bakkie': { draw: bakkie },
    'karoo/potjie': { draw: potjie },
    'karoo/fence_bell': { draw: fenceBell },
    'karoo/aloe_a': {
      draw: aloes([
        [-40, 40, 112],
        [70, 66, 82],
        [-112, 92, 56],
      ]),
    },
    'karoo/aloe_b': {
      draw: aloes([
        [30, 44, 118],
        [-84, 72, 80],
        [120, 96, 54],
      ]),
    },
  },
};

export type { PaintCtx };
