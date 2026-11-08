// Karoo autumn (bible §4.2, the home biome, in the first download): golden veld under a pale
// autumn sky, flat-topped dolerite mesas and koppies in hazy lilac, karoo bossies, a dirt farm
// track, a wire fence, the windpomp + corrugated reservoir, a dusty white fictional bakkie
// (D-078), a potjie on a fire, a fence-post bell and aloes. Light from the upper left. D-031.
import { verVeld } from './common';
import { plantLook, seedTuft, veldShrub, type ShrubKind } from '../flora';
import { bluegum, pepperTree, sweetThorn } from '../species';
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
import { contactShadow, fillD, softPen } from '../realism';
import { aloeFerox, aloeLook, type AloePlant } from '../aloe';
import { potjieHd, potjieLid, potLook } from '../potjie';
import { mountainRow, paintRow, rockColours } from '../mountains';
import { skyGradient, softDefs, type CloudColours } from '../skies';
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
    /** Unused since v1.6 (the clouds are sprites now); kept so the biome calls stay as they were. */
    base?: number;
    size?: readonly [number, number];
    streaks?: number;
    /** v1.6: a warm dust haze over the horizon (Bushveld), its colour and strength. */
    dust?: { readonly colour: string; readonly alpha: number };
  },
): string {
  // v1.6 (D-042, product owner: "the clouds need to be more realistic"): the sky layer is only
  // its gradient now (and a horizon haze); the clouds are soft sprites that drift on sim time
  // (src/game/view/clouds.ts), so no grey disc or white lens is baked into the sky any more.
  const parts: string[] = [softDefs(), skyGradient(ctx.width, 1080, o.stops)];
  if (o.dust !== undefined) {
    const id = nextId();
    parts.push(
      el(
        'defs',
        {},
        el(
          'linearGradient',
          { id, x1: 0, y1: 0, x2: 0, y2: 1 },
          el('stop', { offset: 0, 'stop-color': o.dust.colour, 'stop-opacity': 0 }),
          el('stop', {
            offset: 0.6,
            'stop-color': o.dust.colour,
            'stop-opacity': o.dust.alpha * 0.6,
          }),
          el('stop', { offset: 1, 'stop-color': o.dust.colour, 'stop-opacity': o.dust.alpha }),
        ),
      ),
      el('rect', { x: 0, y: 420, width: ctx.width, height: 220, fill: `url(#${id})` }),
    );
  }
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
  const soil = mix(ctx.c('soil'), ctx.c('veldLight'), 0.55);
  const parts: string[] = [];
  // Bluegums behind the house (taller, darker), then the yard on the ground.
  for (const [dx, , h] of [
    [-78, 32, 84],
    [-58, 28, 72],
    [70, 34, 86],
  ] as const) {
    const tx = x + dx;
    parts.push(bluegum(ctx.rnd, tx, ground(tx) + 2, h * 1.05, ctx, 'far'));
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
  parts.push(pepperTree(ctx.rnd, px, ground(px) + 4, 50, ctx, 'far'));
  return g({}, ...parts);
}

/**
 * v1.6 (D-042): a far windpomp (about 60 px): a braced lattice tower, the wheel seen a little
 * from the side (blades as spokes, a rim, two missing), the head and the vane trailing left.
 * Hazed for its plane, no ink beyond a darker shade of the steel.
 */
export function farWindpomp(
  ctx: { tint: (hex: string) => string },
  x: number,
  base: number,
  k = 1,
): string {
  const steel = ctx.tint('#A9AFB3');
  const dark = ctx.tint('#5E6468');
  const lit = ctx.tint('#DADEE0');
  const top = base - 46 * k;
  const legs = `M${r2(x - 7 * k)} ${r2(base)}L${r2(x - 1.5 * k)} ${r2(top)}M${r2(x + 7 * k)} ${r2(base)}L${r2(x + 1.5 * k)} ${r2(top)}`;
  const braces: string[] = [];
  for (let i = 0; i < 4; i++) {
    const y0 = base - (46 * k * i) / 4;
    const y1 = base - (46 * k * (i + 1)) / 4;
    const h0 = 7 * k - (5.5 * k * i) / 4;
    const h1 = 7 * k - (5.5 * k * (i + 1)) / 4;
    braces.push(
      `M${r2(x - h0)} ${r2(y0)}L${r2(x + h1)} ${r2(y1)}M${r2(x + h0)} ${r2(y0)}L${r2(x - h1)} ${r2(y1)}`,
    );
  }
  const hubX = x + 1.5 * k;
  const hubY = top - 3 * k;
  const rx = 6 * k;
  const ry = 9 * k;
  const spokes: string[] = [];
  for (let b = 0; b < 18; b++) {
    if (b === 3 || b === 12) continue;
    const a = (b * Math.PI * 2) / 18;
    spokes.push(
      `M${r2(hubX)} ${r2(hubY)}L${r2(hubX + Math.cos(a) * rx)} ${r2(hubY + Math.sin(a) * ry)}`,
    );
  }
  return g(
    {},
    el('path', {
      d: ellipseD(x + 3 * k, base + 0.5, 10 * k, 1.4 * k),
      fill: '#3A2A1E',
      opacity: 0.25,
    }),
    el('path', {
      d: braces.join(''),
      fill: 'none',
      stroke: dark,
      'stroke-width': Math.max(0.5, 0.7 * k),
    }),
    el('path', {
      d: legs,
      fill: 'none',
      stroke: dark,
      'stroke-width': Math.max(0.9, 1.6 * k),
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: `M${r2(hubX)} ${r2(hubY)}l${r2(-12 * k)} ${r2(1 * k)}`,
      fill: 'none',
      stroke: dark,
      'stroke-width': Math.max(0.6, 1 * k),
    }),
    el('path', {
      d: `M${r2(hubX - 12 * k)} ${r2(hubY - 3.5 * k)}l${r2(-4 * k)} ${r2(-0.5 * k)}l0 ${r2(8 * k)}l${r2(4 * k)} ${r2(-1 * k)}Z`,
      fill: steel,
      stroke: dark,
      'stroke-width': Math.max(0.4, 0.5 * k),
    }),
    el('path', {
      d: spokes.join(''),
      fill: 'none',
      stroke: steel,
      'stroke-width': Math.max(0.6, 1.1 * k),
    }),
    el('path', {
      d: ellipseD(hubX, hubY, rx, ry),
      fill: 'none',
      stroke: dark,
      'stroke-width': Math.max(0.5, 0.8 * k),
    }),
    el('path', {
      d: `M${r2(hubX - rx * 0.7)} ${r2(hubY - ry * 0.7)}A${r2(rx)} ${r2(ry)} 0 0 1 ${r2(hubX + rx * 0.2)} ${r2(hubY - ry)}`,
      fill: 'none',
      stroke: lit,
      'stroke-width': Math.max(0.4, 0.6 * k),
    }),
    el('path', { d: ellipseD(hubX, hubY, 1.4 * k, 1.4 * k), fill: dark }),
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
  // v1.6: a second one by the farmstead.
  const wx2 = ctx.u(0.66);
  parts.push(farWindpomp(ctx, wx2, yAt(band.edge, wx2) + 5, 0.8));
  // v1.6: stands of sweet thorn along a dry riverbed line, as far trees (a few clumps each).
  for (const u of [0.08, 0.14, 0.88]) {
    const x = ctx.u(u);
    for (let k = 0; k < 3; k++) {
      const tx = x + k * 30 + ctx.rnd() * 12;
      parts.push(sweetThorn(ctx.rnd, tx, yAt(band.edge, tx) + 3, 40 + ctx.rnd() * 18, ctx, 'far'));
    }
  }
  // v1.6 (D-042): the far animals are sprites now (src/game/view/faunaHerds.ts, D-054).
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

/**
 * v1.6 (D-042, product owner 25 Oct): the windpomp tower at the D-039 bar, drawn at 2×. Four
 * galvanised angle-iron legs on concrete footings (3/4 view: the back pair darker), X-braces and
 * girts at every level with bolts at the joints, a ladder up the front-left leg, the pump rod
 * down the middle to the pump head and the pipe to the reservoir, a timber platform, rust. The
 * turning head (gearbox, tail boom, vane) and the wheel are drawn live by WindpompView, so they
 * swing with the wind and the wheel turns; a service plank reaches out left to the kwêvoël's
 * perch (−150, −92: its feet at y ≈ −31), which no longer hangs on the turning boom.
 */
function windpomp(ctx: PropCtx): string {
  const { h, oy } = ctx.box;
  // Tower foot (310) and platform (−60).
  return windpompTower(ctx, oy + h / 2, oy - h / 2 + 10, true);
}

/** The tower from its foot `base` up to the platform `top`, with the service plank or not. */
export function windpompTower(ctx: PaintCtx, base: number, top: number, plank: boolean): string {
  const steel = '#A9AFB3';
  const lit = '#D6DADC';
  const dark = '#6C7276';
  const ink = mix(ctx.pen.ink, dark, 0.3);
  const rust = ctx.tint('#9A4B2A');
  const wood = tone(ctx.c('wood'), 0.3, 0.22);
  const levels = Math.max(4, Math.round((base - top) / 53));
  const yAtLevel = (k: number): number => base - ((base - top) * k) / levels;
  const half = (k: number): number => 46 - (36 * k) / levels;
  const leg = (side: -1 | 1, dx: number): string =>
    `M${r2(side * 46 + dx)} ${r2(base)}L${r2(side * 10 + dx * 0.4)} ${r2(top)}`;
  const parts: string[] = [groundShadow(10, base + 3, 64, 9)];
  // Back legs and their braces (3/4 view: offset right and up, darker).
  const backBraces: string[] = [];
  for (let k = 0; k < levels; k++) {
    const y0 = yAtLevel(k);
    const y1 = yAtLevel(k + 1);
    backBraces.push(
      `M${r2(-half(k) + 16)} ${r2(y0 - 6)}L${r2(half(k + 1) + 16)} ${r2(y1 - 6)}M${r2(half(k) + 16)} ${r2(y0 - 6)}L${r2(-half(k + 1) + 16)} ${r2(y1 - 6)}`,
    );
  }
  parts.push(
    el('path', {
      d: backBraces.join(''),
      fill: 'none',
      stroke: shade(dark, -0.2),
      'stroke-width': 1.6,
    }),
    el('path', {
      d: leg(-1, 16) + leg(1, 16),
      fill: 'none',
      stroke: ink,
      'stroke-width': 5.5,
      'stroke-linecap': 'round',
      transform: 'translate(0 -6)',
    }),
    el('path', {
      d: leg(-1, 16) + leg(1, 16),
      fill: 'none',
      stroke: dark,
      'stroke-width': 3,
      'stroke-linecap': 'round',
      transform: 'translate(0 -6)',
    }),
  );
  // The pump rod down the middle and the pump head with the pipe to the reservoir.
  parts.push(
    el('path', {
      d: `M2 ${r2(top + 4)}L2 ${r2(base - 26)}`,
      fill: 'none',
      stroke: ink,
      'stroke-width': 4,
    }),
    el('path', {
      d: `M2 ${r2(top + 4)}L2 ${r2(base - 26)}`,
      fill: 'none',
      stroke: lit,
      'stroke-width': 1.6,
    }),
    inked(
      polyD([
        [-13, base],
        [-13, base - 26],
        [15, base - 26],
        [15, base],
      ]),
      dark,
      ink,
      3,
    ),
    flat(
      polyD([
        [-11, base - 24],
        [-3, base - 24],
        [-3, base - 2],
        [-11, base - 2],
      ]),
      lit,
      { opacity: 0.6 },
    ),
    inked(
      polyD([
        [12, base - 14],
        [76, base - 14],
        [76, base - 5],
        [12, base - 5],
      ]),
      steel,
      ink,
      2.5,
    ),
    flat(
      polyD([
        [14, base - 13],
        [74, base - 13],
        [74, base - 11],
        [14, base - 11],
      ]),
      lit,
    ),
    flat(
      polyD([
        [30, base - 9],
        [34, base - 9],
        [36, base - 4],
        [28, base - 4],
      ]),
      rust,
      { opacity: 0.6 },
    ),
  );
  // Front braces and girts, then the front legs, footings and bolts.
  const braces: string[] = [];
  const girts: string[] = [];
  const bolts: string[] = [];
  for (let k = 0; k < levels; k++) {
    const y0 = yAtLevel(k);
    const y1 = yAtLevel(k + 1);
    braces.push(
      `M${r2(-half(k))} ${r2(y0)}L${r2(half(k + 1))} ${r2(y1)}M${r2(half(k))} ${r2(y0)}L${r2(-half(k + 1))} ${r2(y1)}`,
    );
    girts.push(`M${r2(-half(k + 1))} ${r2(y1)}L${r2(half(k + 1))} ${r2(y1)}`);
    bolts.push(ellipseD(-half(k + 1), y1, 1.8, 1.8), ellipseD(half(k + 1), y1, 1.8, 1.8));
    bolts.push(ellipseD(0, (y0 + y1) / 2 + (half(k) - half(k + 1)) / 4, 1.5, 1.5));
  }
  parts.push(
    el('path', {
      d: braces.join('') + girts.join(''),
      fill: 'none',
      stroke: ink,
      'stroke-width': 3,
    }),
    el('path', { d: braces.join(''), fill: 'none', stroke: steel, 'stroke-width': 1.4 }),
    el('path', { d: girts.join(''), fill: 'none', stroke: lit, 'stroke-width': 1.4 }),
    el('path', {
      d: leg(-1, 0) + leg(1, 0),
      fill: 'none',
      stroke: ink,
      'stroke-width': 8,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: leg(-1, 0) + leg(1, 0),
      fill: 'none',
      stroke: steel,
      'stroke-width': 4.4,
      'stroke-linecap': 'round',
    }),
    // The angle iron's lit flange on the left of each leg.
    el('path', { d: leg(-1, -1.5) + leg(1, -1.5), fill: 'none', stroke: lit, 'stroke-width': 1.4 }),
    el('path', { d: bolts.join(''), fill: shade(dark, -0.2) }),
    inked(
      polyD([
        [-56, base + 4],
        [-56, base - 6],
        [-36, base - 6],
        [-36, base + 4],
      ]),
      '#B8B0A0',
      ink,
      2,
    ),
    inked(
      polyD([
        [36, base + 4],
        [36, base - 6],
        [56, base - 6],
        [56, base + 4],
      ]),
      '#B8B0A0',
      ink,
      2,
    ),
  );
  // Rust bleeding from a few joints.
  const rusty: string[] = [];
  for (const k of [1, 3, 4, 6]) {
    const y = yAtLevel(k);
    const x = (k % 2 === 0 ? -1 : 1) * half(k);
    rusty.push(`M${r2(x)} ${r2(y + 2)}l${r2((k % 2 === 0 ? 1 : -1) * 1.5)} 12`);
  }
  parts.push(
    el('path', { d: rusty.join(''), fill: 'none', stroke: rust, 'stroke-width': 2, opacity: 0.55 }),
  );
  // The ladder up the front-left leg (rails and rungs).
  const ladder: string[] = [];
  for (let k = 0; k < 22; k++) {
    const f = k / 22;
    const y = base - 10 - (base - top - 20) * f;
    const x = -46 + (46 - 10) * ((base - y) / (base - top)) + 6;
    ladder.push(`M${r2(x - 4)} ${r2(y)}l10 0`);
  }
  parts.push(
    el('path', {
      d: `M-34 ${r2(base)}L-2 ${r2(top + 6)}M-26 ${r2(base)}L4 ${r2(top + 6)}`,
      fill: 'none',
      stroke: ink,
      'stroke-width': 2.6,
    }),
    el('path', { d: ladder.join(''), fill: 'none', stroke: ink, 'stroke-width': 2 }),
    el('path', { d: ladder.join(''), fill: 'none', stroke: lit, 'stroke-width': 0.8 }),
  );
  // The timber platform at the top, and the service plank out to the left (the perch).
  parts.push(
    inked(
      polyD([
        [-30, top + 6],
        [30, top + 6],
        [26, top - 2],
        [-26, top - 2],
      ]),
      wood.fill,
      ink,
      3,
    ),
    flat(
      polyD([
        [-28, top + 4],
        [28, top + 4],
        [26, top + 1],
        [-26, top + 1],
      ]),
      wood.dark,
    ),
    ...(plank
      ? [
          inked(
            polyD([
              [-182, top + 27],
              [-20, top + 1],
              [-20, top + 7],
              [-182, top + 33],
            ]),
            wood.fill,
            ink,
            2.6,
          ),
          flat(
            polyD([
              [-182, top + 31],
              [-20, top + 5],
              [-20, top + 7],
              [-182, top + 33],
            ]),
            wood.dark,
          ),
          el('path', {
            d: `M-150 ${r2(top + 30)}L-30 ${r2(top + 70)}`,
            fill: 'none',
            stroke: ink,
            'stroke-width': 4,
          }),
          el('path', {
            d: `M-150 ${r2(top + 30)}L-30 ${r2(top + 70)}`,
            fill: 'none',
            stroke: dark,
            'stroke-width': 2,
          }),
          el('path', { d: ellipseD(-30, top + 70, 2, 2), fill: lit }),
        ]
      : []),
    // The turntable collar the head sits on.
    inked(
      polyD([
        [-16, top - 2],
        [16, top - 2],
        [12, top - 12],
        [-12, top - 12],
      ]),
      dark,
      ink,
      2.4,
    ),
  );
  return g({}, ...parts);
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
 * D-035, v1.16 (D-078): the farm bakkie, semi-realistic: a boxy old single-cab 4×4 pickup of the
 * kind every Karoo farm has (the owner: "more a Hilux bakkie"), facing right, with no badge, brand
 * or emblem. Dusty farm white: an upright square cab with a near-vertical back, a raked windscreen,
 * a long flat bonnet, the nose turned a little to us so its plain grille (horizontal bars) and
 * square headlights show; chunky black bumpers, boxy flared wheel arches, high ground clearance
 * with the chassis and diff dark underneath, steel wheels on chunky all-terrain tyres; a long load
 * bin with a black sports bar (roll bar) behind the cab, tie-down hooks and vertical tail lights;
 * a tow hitch; dust and mud low down, a few rust spots and a dent. The spare wheel bolted on the
 * bin side is the secret (content part at (−180, −40), 32 × 36).
 */
function bakkie(ctx: PropCtx): string {
  const ink = shade(ctx.c('rust'), -0.7);
  const pen: Pen = { ink, w: Math.max(1.4, ctx.pen.w * 0.5) };
  const paintBase = mix('#F1EFE8', ctx.c('rust'), 0.04);
  const paintTop = shade(paintBase, 0.1);
  const paintLow = shade(paintBase, -0.18);
  const rust = ctx.c('rust');
  const mud = '#7A5A3C';
  const dust = '#C9A878';
  const black = '#26221F';
  const blackHi = '#5A5450';
  const steel = ['#E4E6E4', '#B4B8B6', '#7A807E'] as const;
  const wheelR = 42;
  const wheelY = 56;
  const frontX = 140;
  const rearX = -128;
  const sill = 34;
  // Boxy wheel arches: straight sides, a flat top just clear of the tyre.
  const archPts = (cx: number): Pt[] => [
    [cx + 52, sill],
    [cx + 47, 6],
    [cx + 36, -4],
    [cx - 36, -4],
    [cx - 47, 6],
    [cx - 52, sill],
  ];
  const archL = (cx: number): string =>
    archPts(cx)
      .map(([x, y]) => `L${r2(x)} ${r2(y)}`)
      .join('');
  const bodyD =
    `M-212 -44Q-212 -47 -208 -47L-18 -47L-14 -98Q-13 -104 -6 -104L86 -104Q93 -104 96 -99` +
    `L124 -55L200 -50Q209 -49 209 -40L210 ${sill - 4}Q210 ${sill} 206 ${sill}` +
    archL(frontX) +
    archL(rearX) +
    `L-208 ${sill}Q-212 ${sill} -212 ${sill - 4}Z`;
  // The nose turned a little to us: its front face (grille, headlight, indicator) beyond the side.
  const faceD = polyD([
    [208, -49],
    [226, -45],
    [228, sill - 2],
    [210, sill],
  ]);
  const id = nextId();
  const gPaint = nextId();
  const gGlass = nextId();
  const gTyre = nextId();
  const gDust = nextId();
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
  const rect = (x: number, y: number, w: number, h: number, col: string, rx = 0, sw = 1): string =>
    el('rect', { x, y, width: w, height: h, rx, fill: col, stroke: ink, 'stroke-width': sw });
  parts.push(
    el(
      'linearGradient',
      { id: gPaint, x1: 0, y1: -104, x2: 0, y2: sill, gradientUnits: 'userSpaceOnUse' },
      el('stop', { offset: 0, 'stop-color': paintTop }),
      el('stop', { offset: 0.5, 'stop-color': paintBase }),
      el('stop', { offset: 1, 'stop-color': paintLow }),
    ),
    el(
      'linearGradient',
      { id: gGlass, x1: 0, y1: -96, x2: 30, y2: -56, gradientUnits: 'userSpaceOnUse' },
      el('stop', { offset: 0, 'stop-color': '#DCEBF2' }),
      el('stop', { offset: 0.5, 'stop-color': '#8FB4C8' }),
      el('stop', { offset: 1, 'stop-color': '#4A6170' }),
    ),
    el(
      'linearGradient',
      { id: gDust, x1: 0, y1: -6, x2: 0, y2: sill, gradientUnits: 'userSpaceOnUse' },
      el('stop', { offset: 0, 'stop-color': dust, 'stop-opacity': 0 }),
      el('stop', { offset: 0.5, 'stop-color': dust, 'stop-opacity': 0.4 }),
      el('stop', { offset: 1, 'stop-color': mud, 'stop-opacity': 0.55 }),
    ),
    el(
      'radialGradient',
      { id: gTyre },
      el('stop', { offset: 0.6, 'stop-color': '#3A3431' }),
      el('stop', { offset: 0.85, 'stop-color': '#24201E' }),
      el('stop', { offset: 1, 'stop-color': '#141110' }),
    ),
  );
  // Contact shadow; the chassis, fuel tank and diff dark under the high body; the wheel wells.
  parts.push(contactShadow(8, wheelY + wheelR - 4, 238, 10, 0.34));
  parts.push(
    fill(
      polyD([
        [-196, sill - 2],
        [204, sill - 2],
        [204, sill + 9],
        [-196, sill + 9],
      ]),
      '#1E1A18',
    ),
    rect(-60, sill + 2, 70, 14, '#34302C', 3, 1),
    fill(ellipseD(rearX, sill + 18, 16, 10), '#1E1A18'),
  );
  for (const cx of [rearX, frontX]) parts.push(fill(polyD(archPts(cx)), '#1E1A18'));
  // The body: paint gradient, then everything on the paint inside its clip.
  parts.push(el('clipPath', { id }, el('path', { d: bodyD })), fill(bodyD, `url(#${gPaint})`));
  const onPaint: string[] = [];
  // Sky sheen along the bin rail and the bonnet, the body crease, the darker sill.
  onPaint.push(
    fill(
      polyD([
        [-214, -47],
        [-16, -47],
        [-16, -40],
        [-214, -40],
      ]),
      '#FFFFFF',
      0.6,
    ),
    fill(
      polyD([
        [124, -55],
        [210, -49],
        [210, -43],
        [124, -49],
      ]),
      '#FFFFFF',
      0.6,
    ),
    stroke('M-210 -24L210 -24', '#FFFFFF', 2.2, 0.85),
    stroke('M-210 -21L210 -21', shade(paintLow, -0.15), 1.6, 0.8),
    stroke(`M-210 ${sill - 7}L210 ${sill - 7}`, shade(paintLow, -0.2), 1.2, 0.6),
  );
  // Panel gaps: tailgate, bin/cab seam, door, fender seam.
  onPaint.push(
    stroke('M-200 -45L-200 32', ink, 1.3, 0.75),
    stroke('M-16 -46L-16 32', ink, 1.6, 0.85),
    stroke('M-4 -100L-4 26Q-4 30 0 30L112 30Q116 30 116 26L118 -58', ink, 1.5, 0.85),
    stroke('M184 -50L184 -6', ink, 1.1, 0.6),
  );
  // Rust spots round the arches and the bin's foot (dark edges, lighter flecks).
  const rustBlob = (x: number, y: number, rx: number, ry: number): string[] => {
    const pts: Pt[] = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const rr = 0.7 + ctx.rnd() * 0.5;
      pts.push([x + Math.cos(a) * rx * rr, y + Math.sin(a) * ry * rr]);
    }
    const d = smoothD(pts, true, 1);
    return [
      fill(d, shade(rust, -0.15), 0.8),
      fill(ellipseD(x - rx * 0.2, y - ry * 0.2, rx * 0.5, ry * 0.4), shade(rust, 0.2), 0.6),
    ];
  };
  onPaint.push(
    ...rustBlob(rearX - 58, 24, 9, 5),
    ...rustBlob(rearX + 56, 26, 7, 4),
    ...rustBlob(frontX + 54, 24, 6, 4),
  );
  // A dent in the bin side: a soft dark crescent under a lit edge.
  onPaint.push(
    fill(ellipseD(-58, 2, 13, 7), shade(paintBase, -0.3), 0.4),
    stroke('M-71 -1Q-60 -9 -45 -1', '#FFFFFF', 1.4, 0.7),
  );
  // Dust over the lower third and mud thrown up round the arches.
  onPaint.push(
    fill(
      polyD([
        [-214, -6],
        [214, -6],
        [214, sill + 2],
        [-214, sill + 2],
      ]),
      `url(#${gDust})`,
    ),
  );
  for (const cx of [rearX, frontX])
    for (let k = 0; k < 8; k++) {
      const ang = Math.PI * (0.95 + ctx.rnd() * 0.5);
      const rr = 54 + ctx.rnd() * 18;
      const mx = cx + Math.cos(ang) * rr;
      const my = sill + Math.sin(ang) * rr * 0.55;
      onPaint.push(fill(ellipseD(mx, my, 2 + ctx.rnd() * 3.5, 1.2 + ctx.rnd() * 2), mud, 0.6));
    }
  // Fuel filler on the bin side.
  onPaint.push(
    fill(ellipseD(-40, -32, 6.5, 6.5), shade(paintBase, -0.15)),
    stroke(ellipseD(-40, -32, 6.5, 6.5), ink, 1, 0.7),
  );
  parts.push(g({ 'clip-path': `url(#${id})` }, ...onPaint));
  parts.push(stroke(bodyD, ink, pen.w));
  // The flared arch lips (black plastic flares, squared).
  for (const cx of [rearX, frontX]) {
    const d = polyD(archPts(cx), false);
    parts.push(stroke(d, black, 7), stroke(d, blackHi, 1.4, 0.7));
  }
  // The front face: its own shade, the square headlight, the plain grille, the indicator.
  parts.push(
    fill(faceD, shade(paintBase, -0.1)),
    stroke(faceD, ink, pen.w * 0.9),
    rect(210, -44, 14, 15, '#7A807E', 1.5, 1),
    rect(212, -42, 10, 11, '#F4EBC4', 1, 0.6),
    fill(
      polyD([
        [213, -41],
        [217, -41],
        [213, -35],
      ]),
      '#FFFFFF',
      0.95,
    ),
    rect(211, -27, 15, 22, black, 1.5, 1),
    ...[0, 1, 2, 3].map((k) => stroke(`M212.5 ${-23 + k * 5}L224.5 ${-23 + k * 5}`, steel[1], 1.6)),
    rect(211, -2, 12, 6, '#F2A33A', 1.5, 0.8),
    fill(ellipseD(214, -0.5, 2, 1.2), '#FFE0A0', 0.8),
  );
  // Side glass with the sky in it, a headrest behind, the rubber frame; the windscreen's edge.
  const glassD = polyD([
    [2, -96],
    [84, -96],
    [110, -59],
    [2, -59],
  ]);
  const glassId = nextId();
  parts.push(
    fill(glassD, `url(#${gGlass})`),
    el('clipPath', { id: glassId }, el('path', { d: glassD })),
    g(
      { 'clip-path': `url(#${glassId})` },
      fill(ellipseD(16, -70, 9, 13), '#2E3A42', 0.55),
      fill(
        polyD([
          [30, -98],
          [44, -98],
          [24, -56],
          [10, -56],
        ]),
        '#FFFFFF',
        0.45,
      ),
      fill(
        polyD([
          [52, -98],
          [58, -98],
          [38, -56],
          [32, -56],
        ]),
        '#FFFFFF',
        0.3,
      ),
    ),
    stroke(glassD, '#1E1A18', 2.6),
    stroke('M96 -99L124 -55', '#2A2522', 3),
    stroke('M99 -97L121 -61', '#DCEBF2', 1, 0.7),
  );
  // The square black mirror on the door's corner, the door handle and keyhole.
  parts.push(
    stroke('M110 -60L118 -66', black, 2.4),
    rect(114, -80, 13, 16, black, 2, 1),
    fill(
      polyD([
        [116, -78],
        [119, -78],
        [117, -67],
        [116, -67],
      ]),
      blackHi,
      0.9,
    ),
    rect(4, -46, 18, 5, black, 2, 0.8),
    fill(ellipseD(27, -43.5, 1.5, 1.5), black),
  );
  // The sports bar (roll bar) behind the cab: the hoop's post, its top tube back, the brace down
  // to the bin rail; the far post a shade darker. Tie-down hooks along the rail.
  const bar = 'M-28 -47L-29 -90Q-29 -97 -36 -97L-58 -97Q-63 -97 -66 -92L-96 -47';
  parts.push(
    stroke('M-22 -47L-23 -93', '#141110', 5),
    stroke(bar, black, 5.5),
    stroke('M-30 -50L-31 -90M-38 -98.5L-57 -98.5M-66 -89L-92 -50', '#FFFFFF', 1.2, 0.45),
    ...[-170, -130, -100].map((hx) => stroke(`M${hx} -46q0 6 5 6`, steel[1], 2)),
  );
  // Rear: vertical tail light, the black step bumper, the tow hitch (drawbar and ball).
  parts.push(
    rect(-216, -42, 8, 32, '#B5241E', 1.5, 1),
    fill(
      polyD([
        [-215, -40],
        [-212, -40],
        [-212, -22],
        [-215, -22],
      ]),
      '#F07A6A',
      0.7,
    ),
    rect(-216, -18, 8, 7, '#E9A23B', 1, 0.8),
    rect(-236, 38, 26, 6, '#34302C', 1, 1),
    rect(-232, 31, 3, 8, '#5E666C', 0.5, 0.6),
    fill(ellipseD(-230.5, 30, 4.5, 4.5), '#8A9196'),
    stroke(ellipseD(-230.5, 30, 4.5, 4.5), ink, 1),
    fill(ellipseD(-232, 28.5, 1.5, 1.3), '#FFFFFF', 0.8),
    rect(-224, 20, 22, 17, black, 2.5, 1.2),
    stroke('M-222 22L-205 22', blackHi, 1.4, 0.8),
  );
  // Front: the chunky black bumper wrapping round the nose.
  parts.push(
    el('path', {
      d: 'M196 18L224 16L232 19L232 34L226 37L196 37Z',
      fill: black,
      stroke: ink,
      'stroke-width': 1.2,
      'stroke-linejoin': 'round',
    }),
    stroke('M198 20L224 18L230 21', blackHi, 1.4, 0.8),
  );
  // The spare wheel (the secret, content part at (−180, −40), 32 × 36): bolted to a bracket on
  // the outside of the bin by the tailgate, leaning back a little, in front of the bin side so
  // nearly all of its hit ellipse shows the wheel (review of #49: inside the bin, 58 % of it was
  // hidden and the plain panel triggered the secret).
  const spareTread = Array.from({ length: 14 }, (_, n) => {
    const a = (n / 14) * Math.PI * 2;
    return `M${r2(-180 + Math.cos(a) * 28)} ${r2(-40 + Math.sin(a) * 32)}L${r2(-180 + Math.cos(a) * 32)} ${r2(-40 + Math.sin(a) * 36)}`;
  }).join('');
  parts.push(
    contactShadow(-174, -2, 30, 4, 0.3),
    g(
      { transform: 'rotate(-6 -180 -40)' },
      el('rect', { x: -186, y: -50, width: 12, height: 22, rx: 2, fill: '#3A3431' }),
      fill(ellipseD(-180, -40, 32, 36), `url(#${gTyre})`),
      stroke(spareTread, '#4A4340', 3),
      stroke(ellipseD(-180, -40, 32, 36), shade('#24201E', -0.2), pen.w),
      fill(ellipseD(-180, -40, 16, 18), steel[0]),
      fill(ellipseD(-178, -38, 13, 15), steel[1], 0.5),
      fill(ellipseD(-180, -40, 6, 7), steel[2]),
      stroke(ellipseD(-180, -40, 16, 18), '#5E666C', 1.2),
      fill(ellipseD(-186, -48, 4, 5), '#FFFFFF', 0.7),
      fill(ellipseD(-180, -40, 2.2, 2.2), '#3A3431'),
      fill(ellipseD(-180, -20, 26, 8), dust, 0.3),
    ),
  );
  // The road wheels: chunky all-terrain tyres (block tread proud of the outline, lugs on the
  // shoulder), steel rims with round holes and a lip, the hub and its nuts, dust on the rubber.
  const wheel = (cx: number): string => {
    const blocks: string[] = [];
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const tc = Math.cos(a + 0.18);
      const ts = Math.sin(a + 0.18);
      const ro = wheelR + 2;
      const ri = wheelR - 9;
      blocks.push(
        `M${r2(cx + c * ri)} ${r2(wheelY + sn * ri)}L${r2(cx + c * ro)} ${r2(wheelY + sn * ro)}` +
          `L${r2(cx + tc * ro)} ${r2(wheelY + ts * ro)}L${r2(cx + tc * ri)} ${r2(wheelY + ts * ri)}Z`,
      );
    }
    const holes: string[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      holes.push(ellipseD(cx + Math.cos(a) * 14.5, wheelY + Math.sin(a) * 14.5, 3.4, 3.4));
    }
    const nuts: string[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      nuts.push(ellipseD(cx + Math.cos(a) * 6.5, wheelY + Math.sin(a) * 6.5, 1.3, 1.3));
    }
    return g(
      {},
      fill(ellipseD(cx, wheelY, wheelR, wheelR), `url(#${gTyre})`),
      fill(blocks.join(''), '#3E3734'),
      stroke(ellipseD(cx, wheelY, wheelR, wheelR), ink, pen.w),
      stroke(ellipseD(cx, wheelY, wheelR - 10, wheelR - 10), '#141110', 1.4, 0.8),
      fill(ellipseD(cx, wheelY + 27, wheelR * 0.8, 10), dust, 0.35),
      fill(ellipseD(cx, wheelY, 23, 23), steel[0]),
      fill(ellipseD(cx + 4, wheelY + 4, 20, 20), steel[1], 0.6),
      stroke(ellipseD(cx, wheelY, 19.5, 19.5), steel[2], 1.4),
      fill(holes.join(''), '#3A3431'),
      fill(ellipseD(cx, wheelY, 9, 9), steel[0]),
      fill(nuts.join(''), steel[2]),
      stroke(ellipseD(cx, wheelY, 23, 23), '#4A5257', 1.4),
      fill(ellipseD(cx - 8, wheelY - 11, 5, 3), '#FFFFFF', 0.7),
    );
  };
  parts.push(wheel(rearX), wheel(frontX));
  // Mud flap behind the rear wheel.
  parts.push(rect(rearX - 62, sill - 2, 10, 26, '#1E1A18', 1.5, 0.8));
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

/** The first-download aloe clump (D-031; D-051: the placeholder until the HD clump lands). */
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

/**
 * D-051: an aloe clump (HD, 2× texture): an earth mound with a few stones, bitter aloes back to
 * front (tools/art/aloe.ts) and grass tufts. Shared with the Bushveld (its own palette and ground).
 */
/** D-051: the HD clumps' ground level below the prop's origin (design px). */
export const CLUMP_CREST = 52;

export function aloeClump(
  plants: readonly AloePlant[],
  ground = 'veldDark',
  grass = 'veld',
  stones = 'stone',
  /** Ground level of the clump (its mound's crest), design px below the prop's origin. Review
   *  27 Oct: at 100 the plants' feet sat below the bottom of the screen; the old clumps'
   *  rosettes stood at ~50. */
  crest = CLUMP_CREST,
) {
  return (ctx: PropCtx): string => {
    const look = aloeLook(ctx.tint, ctx.c('aloe'), ctx.c('aloeFlower'), ctx.c('aloeBud'));
    const earth = ctx.c(ground);
    const soft = softPen(ctx.pen, earth, 0.22);
    const parts: string[] = [];
    const mound = smoothD(
      [
        [-150, crest + 50],
        [-138, crest + 20],
        [-96, crest + 2],
        [0, crest],
        [100, crest + 4],
        [140, crest + 20],
        [152, crest + 50],
      ],
      true,
      0.7,
    );
    const id = nextId();
    parts.push(
      el('clipPath', { id }, el('path', { d: mound })),
      flat(mound, earth),
      g(
        { 'clip-path': `url(#${id})` },
        flat(ellipseD(40, crest + 44, 170, 22), shade(earth, -0.18)),
        flat(ellipseD(-90, crest + 8, 70, 10), shade(earth, 0.14)),
      ),
      el('path', {
        d: mound,
        fill: 'none',
        stroke: soft.ink,
        'stroke-width': soft.w,
        'stroke-linejoin': 'round',
      }),
    );
    const rocks: readonly (readonly [number, number, number])[] = [
      [-150, crest + 28, 9],
      [10, crest + 22, 7],
      [140, crest + 30, 10],
    ];
    for (const [x, y, r] of rocks)
      parts.push(stone(ctx.rnd, x, y, r, tone(ctx.c(stones), 0.25, 0.3), soft));
    for (const p of [...plants].sort((a, b) => a.y - b.y)) {
      parts.push(contactShadow(p.x + p.s * 0.1, p.y + 2, p.s * 0.6, p.s * 0.1, 0.3));
      parts.push(aloeFerox(ctx.rnd, p, look));
    }
    const tuftPen = softPen(ctx.pen, ctx.c(grass), 0.3);
    parts.push(tuft(ctx.rnd, -128, crest + 40, 46, tone(ctx.c(grass), 0.22, 0.25), tuftPen, 9));
    parts.push(tuft(ctx.rnd, 124, crest + 42, 42, tone(ctx.c(grass), 0.18, 0.3), tuftPen, 9));
    return g({}, ...parts);
  };
}

/** D-051: a plant of a clump (foot x, y; leaf length s), its flowers sized to fit the frame. */
export function plant(
  x: number,
  y: number,
  s: number,
  stem: number,
  racemes: number,
  turn: number,
  top = -166,
): AloePlant {
  const heart = y - stem - s * 0.25;
  return { x, y, s, stem, racemes, turn, bloomH: Math.min(s * 2.1, heart - top) };
}

export const KAROO_PLAN: BiomeArtPlan = {
  biome: 'karoo-autumn',
  layers: {
    // v1.6 (D-042): a 256-colour sky (no visible banding), as the Okavango's.
    sky: { top: 0, height: 1080, encode: 'png8', draw: sky },
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
    'karoo/windpomp': {
      draw: windpomp,
      master: 2,
      colours: 96,
      wobble: false,
      frame: { w: 310, h: 560, ox: 225, oy: 210 },
    },
    'karoo/reservoir': { draw: reservoir },
    'karoo/bakkie': { draw: bakkie, colours: 160 },
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
    // D-051: the HD potjie (pot on its fire, lidless) and its loose lid (late group).
    'karoo/hd/potjie': {
      draw: (ctx) => potjieHd(ctx.rnd, potLook(ctx.c, ctx.tint), ctx.pen),
      master: 2,
      wobble: false,
      colours: 128,
    },
    'karoo/hd/potjie_lid': {
      draw: (ctx) => potjieLid(potLook(ctx.c, ctx.tint), ctx.pen),
      master: 2,
      wobble: false,
      colours: 64,
    },
    // D-051: the HD bitter aloes (late group, swapped in for aloe_a/b; three plants a clump).
    'karoo/hd/aloe_a': {
      draw: aloeClump([
        plant(-40, 66, 100, 26, 5, -0.4),
        plant(60, 70, 70, 10, 3, 0.6),
        plant(-120, 78, 50, 0, 0, 0.2),
      ]),
      master: 2,
      wobble: false,
      colours: 128,
    },
    'karoo/hd/aloe_b': {
      draw: aloeClump([
        plant(30, 64, 106, 30, 6, 0.3),
        plant(-90, 72, 74, 8, 3, -0.7),
        plant(124, 80, 52, 0, 1, -0.2),
      ]),
      master: 2,
      wobble: false,
      colours: 128,
    },
  },
};

export type { PaintCtx };
