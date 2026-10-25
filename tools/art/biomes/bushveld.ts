// Bushveld winter (bible §4.2): a cold dawn — pale blue sky warming to peach at the horizon, frost
// mist lying in the far veld, orange granite domes and boulder koppies, leafless baobabs, olive and
// copper mopane, pale dry winter grass with frost on the near tufts, red winter aloes, distant
// giraffe. Low sun from the right (the glare omen's side). D-031.
import type { BiomeArtPlan, LayerCtx, PropCtx } from '../landscape';
import {
  edgePts,
  flat,
  groundD,
  hatch,
  line,
  mix,
  nextId,
  shade,
  tone,
  tuft,
  yAt,
  type Pen,
  type Rnd,
  type Tone,
} from '../scenery';
import { el, ellipseD, g, inked, polyD, r2, smoothD } from '../svg';
import { mountainRow, paintRow, rockColours } from '../mountains';
import { aloeFlowers, aloeRosette, groundBand, groundShadow, softSky } from './karoo';
import { foregroundClumps, midScrub, nearGrass, verVeld } from './common';
import { plantLook, seedTuft, veldShrub } from '../flora';
import { baobab as baobabTree, marula, mopane } from '../species';
import type { PaintCtx } from '../landscape';

/** v1.6 (D-042): mopane scrub (butterfly leaves, olive and copper) as layered mounds. */
function mopaneScrub(ctx: PaintCtx, x: number, y: number, s: number, pen: Pen): string {
  const copper = ctx.rnd() < 0.25;
  const look = plantLook({
    leaf: copper ? mix(ctx.c('mopane'), ctx.c('mopaneCopper'), 0.5) : ctx.c('mopane'),
    bark: ctx.c('twig'),
    ink: pen.ink,
    sun: ctx.c('bleached'),
  });
  return veldShrub(ctx.rnd, x, y, s, 'mopane', look, pen);
}

/** v1.6: pale dry winter grass with seed heads. */
function winterTuft(ctx: PaintCtx, x: number, y: number, h: number, pen: Pen): string {
  return seedTuft(
    ctx.rnd,
    x,
    y,
    h,
    {
      base: shade(ctx.c('grassDark'), -0.15),
      blade: ctx.c('grass'),
      tip: ctx.c('bleached'),
      seed: ctx.c('seed'),
    },
    pen,
    1 + Math.floor(ctx.rnd() * 3),
  );
}

// --- shapes --------------------------------------------------------------------------------

/** A pile of rounded granite boulders (koppie) centred on x, standing on base. */
function boulderPile(
  rnd: Rnd,
  x: number,
  base: number,
  w: number,
  h: number,
  t: Tone,
  pen: Pen,
  n = 6,
): string {
  const parts: string[] = [];
  const rocks: [number, number, number, number][] = [];
  for (let k = 0; k < n; k++) {
    const f = k / Math.max(1, n - 1) - 0.5;
    const rw = w * (0.22 + rnd() * 0.12);
    const rh = h * (0.32 + rnd() * 0.14);
    const top = 1 - Math.abs(f) * 1.4;
    rocks.push([x + f * w * 0.75, base - rh * 0.5 - Math.max(0, top) * h * 0.45, rw, rh]);
  }
  rocks.sort((a, b) => a[1] - b[1]);
  for (const [rx, ry, rw, rh] of rocks) {
    const d = smoothD(
      [
        [rx - rw, ry + rh * 0.4],
        [rx - rw * 0.9, ry - rh * 0.3],
        [rx - rw * 0.3, ry - rh * 0.55],
        [rx + rw * 0.5, ry - rh * 0.45],
        [rx + rw, ry],
        [rx + rw * 0.85, ry + rh * 0.5],
        [rx - rw * 0.2, ry + rh * 0.55],
      ],
      true,
      0.8,
    );
    const id = nextId();
    parts.push(
      g(
        {},
        el('clipPath', { id }, el('path', { d })),
        flat(d, t.fill),
        g(
          { 'clip-path': `url(#${id})` },
          flat(ellipseD(rx - rw * 0.45, ry + rh * 0.25, rw * 0.75, rh * 0.6), t.dark),
          flat(ellipseD(rx + rw * 0.3, ry - rh * 0.3, rw * 0.35, rh * 0.14), t.light),
        ),
        el('path', {
          d,
          fill: 'none',
          stroke: pen.ink,
          'stroke-width': pen.w,
          'stroke-linejoin': 'round',
        }),
      ),
    );
  }
  return g({}, ...parts);
}

/** A far giraffe: a small flat silhouette, browsing (neck forward) or upright. */
function giraffe(x: number, base: number, s: number, colour: string, up: boolean): string {
  const neck = up
    ? `M${x + 10 * s} ${base - 34 * s}L${x + 14 * s} ${base - 62 * s}L${x + 20 * s} ${base - 62 * s}L${x + 16 * s} ${base - 32 * s}Z`
    : `M${x + 10 * s} ${base - 34 * s}L${x + 26 * s} ${base - 52 * s}L${x + 30 * s} ${base - 48 * s}L${x + 16 * s} ${base - 30 * s}Z`;
  const head = up
    ? ellipseD(x + 20 * s, base - 63 * s, 5 * s, 3 * s)
    : ellipseD(x + 32 * s, base - 51 * s, 5 * s, 3 * s);
  return g(
    {},
    flat(
      polyD([
        [x - 14 * s, base - 30 * s],
        [x + 14 * s, base - 36 * s],
        [x + 14 * s, base - 26 * s],
        [x - 12 * s, base - 22 * s],
      ]),
      colour,
    ),
    el('path', {
      d: `M${x - 11 * s} ${base - 24 * s}L${x - 12 * s} ${base}M${x - 6 * s} ${base - 24 * s}L${x - 5 * s} ${base}M${x + 8 * s} ${base - 28 * s}L${x + 9 * s} ${base}M${x + 12 * s} ${base - 28 * s}L${x + 14 * s} ${base}`,
      stroke: colour,
      'stroke-width': 2 * s,
      'stroke-linecap': 'round',
    }),
    flat(neck, colour),
    flat(head, colour),
  );
}

/** A low frost-mist band (flat, translucent, soft lobed edges). */
function mist(
  rnd: Rnd,
  x0: number,
  x1: number,
  y: number,
  h: number,
  colour: string,
  opacity: number,
): string {
  const top = edgePts(rnd, x0, x1, y - h / 2, h * 0.25, 160);
  const bot = edgePts(rnd, x0, x1, y + h / 2, h * 0.15, 200).reverse();
  return flat(smoothD([...top, ...bot], true, 0.8), colour, { opacity: r2(opacity) });
}

// --- layers --------------------------------------------------------------------------------

function sky(ctx: LayerCtx): string {
  return g(
    {},
    softSky(ctx, {
      stops: [
        [0, ctx.raw('skyTop')],
        [0.3, ctx.raw('skyMid')],
        [0.5, ctx.raw('skyBottom')],
        [1, ctx.raw('horizon')],
      ],
      cloud: {
        lit: ctx.raw('cloud'),
        body: mix(ctx.raw('cloud'), ctx.raw('skyBottom'), 0.4),
        base: ctx.raw('cloudShadow'),
      },
      size: [45, 85],
      streaks: 5,
    }),
    mist(ctx.rnd, -40, ctx.width + 40, 610, 70, ctx.raw('mist'), 0.55),
  );
}

function farRidge(ctx: LayerCtx): string {
  const parts: string[] = [];
  const horizon = ctx.raw('horizon');
  // D-035: granite country (Spitzkoppe, the Erongo): a hazy back range of massifs and jagged
  // ridges, then steep granite inselbergs, boulder koppies and low boulder heaps.
  const rock = rockColours(ctx.raw);
  const backPen: Pen = { ink: mix(ctx.pen.ink, horizon, 0.35), w: 1.4 };
  const back = mountainRow(
    ctx.rnd,
    [
      { kind: 'massif', w: 2 },
      { kind: 'strata', w: 1 },
      { kind: 'inselberg', w: 1 },
    ],
    {
      x0: -160,
      x1: ctx.width,
      base: 626,
      width: [420, 720],
      height: [70, 150],
      overlap: [0.1, 0.35],
      haze: 0.52,
    },
  );
  const front = mountainRow(
    ctx.rnd,
    [
      { kind: 'inselberg', w: 2.4 },
      { kind: 'koppie', w: 1.6 },
      { kind: 'boulders', w: 1.6 },
      { kind: 'massif', w: 0.6 },
    ],
    {
      x0: -80,
      x1: ctx.width,
      base: 660,
      width: [260, 520],
      height: [90, 215],
      overlap: [-0.3, 0.1],
      haze: 0.2,
    },
  );
  parts.push(
    ...paintRow(ctx.rnd, back, rock, backPen, horizon),
    ...paintRow(ctx.rnd, front, rock, ctx.pen, horizon),
  );
  // A line of mopane along the foot of the hills, and a baobab or two.
  // v1.6 (D-042): mopane woodland along the foot of the hills, and a baobab or two.
  for (let x = 0; x < ctx.width; x += 26 + ctx.rnd() * 50)
    parts.push(mopane(ctx.rnd, x, 602 + ctx.rnd() * 6, 22 + ctx.rnd() * 14, ctx, 'far', 0.4));
  for (const u of [0.3, 0.77]) parts.push(baobabTree(ctx.rnd, ctx.u(u), 606, 64, ctx, 'far'));
  return g({}, ...parts);
}

function farVeld(ctx: LayerCtx): string {
  const band = groundBand(ctx, 574, 3, 120, ctx.c('grassLight'));
  const inside: string[] = [
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 640, 6, 150, ctx.bottom + 40),
      mix(ctx.c('grassLight'), ctx.c('grass'), 0.5),
    ),
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 700, 8, 170, ctx.bottom + 40), ctx.c('grass')),
  ];
  // Distant mopane scrub: small, paler twiggy shrubs, thinly inked.
  const far: { y: number; svg: string }[] = [];
  for (let x = ctx.rnd() * 40; x < ctx.width; x += 14 + ctx.rnd() * 46) {
    const y = 584 + Math.pow(ctx.rnd(), 1.3) * 170;
    far.push({
      y,
      svg: mopaneScrub(ctx, x, y, 3 + ((y - 580) / 170) * 7 + ctx.rnd() * 2, {
        ink: ctx.pen.ink,
        w: 1.2,
      }),
    });
  }
  far.sort((p, q) => p.y - q.y);
  inside.push(...far.map((i) => i.svg));
  const parts = [
    band.svg,
    g({ 'clip-path': `url(#${band.clip})` }, ...inside),
    line(smoothD(band.edge, false, 0.8), ctx.pen),
  ];
  // v1.6: far mopane and marula, simpler versions of the mid-plane trees.
  for (let x = 40; x < ctx.width; x += 140 + ctx.rnd() * 260) {
    const foot = yAt(band.edge, x) + 4;
    const h = 38 + ctx.rnd() * 20;
    parts.push(
      ctx.rnd() < 0.7
        ? mopane(ctx.rnd, x, foot, h, ctx, 'far', 0.5)
        : marula(ctx.rnd, x, foot, h * 1.1, ctx, 'far'),
    );
  }
  const giraffeC = mix(ctx.c('giraffe'), ctx.raw('horizon'), 0.25);
  for (const [u, s, up] of [
    [0.18, 1.05, true],
    [0.2, 0.95, false],
    [0.71, 1, true],
  ] as const) {
    const x = ctx.u(u);
    parts.push(giraffe(x, yAt(band.edge, x) + 6, s, giraffeC, up));
  }
  // Frost mist lying over the far veld at dawn.
  parts.push(mist(ctx.rnd, -40, ctx.width + 40, 588, 26, ctx.raw('mist'), 0.5));
  return g({}, ...parts);
}

function mid(ctx: LayerCtx): string {
  const band = groundBand(ctx, 658, 5, 150, ctx.c('grassLight'));
  const inside: string[] = [
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 692, 8, 170, ctx.bottom + 40),
      mix(ctx.c('grassLight'), ctx.c('grass'), 0.55),
    ),
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 735, 10, 190, ctx.bottom + 40), ctx.c('grass')),
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 840, 14, 210, ctx.bottom + 40),
      mix(ctx.c('grass'), ctx.c('grassDark'), 0.45),
    ),
  ];
  // Low granite sheets breaking through the grass, sandy patches, dry-grass hatching.
  for (let k = 0; k < ctx.width / 420; k++) {
    const x = ctx.rnd() * ctx.width;
    const y = 720 + ctx.rnd() * 170;
    const s = 0.6 + (y - 700) / 200;
    const sheet = smoothD(
      [
        [x - 110 * s, y + 6],
        [x - 70 * s, y - 10 * s],
        [x + 40 * s, y - 13 * s],
        [x + 110 * s, y + 4],
        [x + 30 * s, y + 10 * s],
      ],
      true,
      0.8,
    );
    inside.push(
      inked(sheet, ctx.c('granite'), ctx.pen.ink, 3),
      flat(ellipseD(x + 30 * s, y + 2, 60 * s, 5 * s), shade(ctx.c('granite'), -0.2)),
    );
  }
  for (let k = 0; k < ctx.width / 240; k++) {
    const x = ctx.rnd() * ctx.width;
    const y = 700 + ctx.rnd() * 200;
    inside.push(
      flat(
        ellipseD(x, y, 50 + ctx.rnd() * 70, 5 + ctx.rnd() * 5),
        mix(ctx.c('soil'), ctx.c('grass'), 0.45),
      ),
    );
  }
  inside.push(
    hatch(
      ctx.rnd,
      0,
      ctx.width,
      690,
      770,
      Math.round(ctx.width / 10),
      8,
      shade(ctx.c('grass'), -0.15),
      1.5,
    ),
  );
  inside.push(
    hatch(
      ctx.rnd,
      0,
      ctx.width,
      770,
      910,
      Math.round(ctx.width / 7),
      13,
      shade(ctx.c('grass'), -0.24),
      2,
    ),
  );
  const items = midScrub(ctx, {
    bushes: 0.85,
    stone: tone(ctx.c('granite'), 0.25, 0.2),
    shrub: (x, y, s, pen) => mopaneScrub(ctx, x, y, s, pen),
  });
  items.sort((a, b) => a.y - b.y);
  inside.push(...items.map((i) => i.svg));
  // v1.6 (D-042): a marula with its fallen fruit and two winter mopane on the mid plane.
  const trees: string[] = [];
  for (const [u, h, kind] of [
    [0.54, 240, 'marula'],
    [0.73, 205, 'mopane'],
    [0.96, 185, 'mopane'],
  ] as const) {
    const x = ctx.u(u);
    const foot = yAt(band.edge, x) + 40;
    trees.push(
      kind === 'marula'
        ? marula(ctx.rnd, x, foot, h, ctx, 'mid')
        : mopane(ctx.rnd, x, foot, h, ctx, 'mid', 0.5),
    );
  }
  return g(
    {},
    band.svg,
    g({ 'clip-path': `url(#${band.clip})` }, ...inside),
    line(smoothD(band.edge, false, 0.8), ctx.pen),
    ...trees,
  );
}

function near(ctx: LayerCtx): string {
  const band = groundBand(ctx, 848, 9, 120, mix(ctx.c('grass'), ctx.c('grassDark'), 0.35));
  const inside: string[] = [
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 884, 10, 200, ctx.bottom + 40), ctx.c('grassDark')),
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 1000, 14, 230, ctx.bottom + 40),
      shade(ctx.c('grassDark'), -0.08),
    ),
  ];
  inside.push(
    hatch(
      ctx.rnd,
      0,
      ctx.width,
      880,
      1080,
      Math.round(ctx.width / 7),
      18,
      shade(ctx.c('grassDark'), -0.22),
      2.5,
    ),
  );
  const items = nearGrass(ctx, {
    stone: tone(ctx.c('granite'), 0.25, 0.2),
    bushes: 0.6,
    shrub: (x, y, s, pen) => mopaneScrub(ctx, x, y, s, pen),
    tuft: (x, y, h, pen) => winterTuft(ctx, x, y, h, pen),
  });
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
  const pen = ctx.pen;
  const parts = foregroundClumps(ctx, [ctx.u(0.06), ctx.u(0.92)], (x) =>
    ctx.rnd() < 0.6
      ? boulderPile(ctx.rnd, x, 1100, 220, 140, tone(ctx.c('granite'), 0.28, 0.2), pen, 3)
      : g(
          {},
          inked(
            smoothD(
              [
                [x - 160, 1080],
                [x - 40, 1040],
                [x + 90, 1010],
                [x + 110, 1022],
                [x - 30, 1062],
                [x - 150, 1092],
              ],
              true,
              0.6,
            ),
            ctx.c('trunk'),
            pen.ink,
            pen.w,
          ),
          line(`M${r2(x + 20)} 1035l40 -40M${r2(x - 60)} 1055l-10 -50`, {
            ink: pen.ink,
            w: 9,
          }),
          line(`M${r2(x + 20)} 1035l40 -40M${r2(x - 60)} 1055l-10 -50`, {
            ink: ctx.c('trunk'),
            w: 4,
          }),
        ),
  );
  return g({}, ...parts);
}

// --- props ---------------------------------------------------------------------------------

/**
 * v1.6 (D-042): the kremetart in winter, drawn by the species art (bible §4.2). Content: the
 * occluder rect is centred at (0, 95), 150 × 330 (the foot at y 260); the secret pod hangs at
 * (110, −120), 22 × 34, and birds perch at (−120, −215), on a limb's tip.
 */
function baobab(ctx: PropCtx): string {
  return baobabTree(ctx.rnd, 0, 260, 540, ctx, 'near', {
    girth: 0.72,
    reach: [
      [-124, -214],
      [158, -252],
    ],
    pods: [{ x: 110, y: -120, rx: 21, ry: 33 }],
    extraPods: 5,
  });
}

function dassieKoppie(ctx: PropCtx): string {
  const pen = ctx.pen;
  const t = tone(ctx.c('granite'), 0.26, 0.2);
  const fur = tone(ctx.c('dassie'), 0.25, 0.25);
  // The dassie (rock hyrax) peeks over the top rock: content part at (40, −82), 30 × 22.
  const dassie = g(
    {},
    inked(
      smoothD(
        [
          [8, -70],
          [14, -94],
          [40, -104],
          [66, -96],
          [72, -72],
        ],
        true,
        0.7,
      ),
      fur.fill,
      pen.ink,
      pen.w,
    ),
    flat(ellipseD(46, -96, 14, 4), fur.light),
    inked(ellipseD(26, -100, 5, 4), fur.dark, pen.ink, 2),
    flat(ellipseD(60, -90, 4, 4), pen.ink),
    flat(ellipseD(70, -82, 3, 2.5), pen.ink),
  );
  return g(
    {},
    groundShadow(0, 82, 220, 16),
    boulderPile(ctx.rnd, 60, 40, 140, 150, t, pen, 3),
    dassie,
    boulderPile(ctx.rnd, -20, 92, 320, 150, t, pen, 6),
    tuft(ctx.rnd, -180, 92, 46, tone(ctx.c('grass'), 0.22, 0.25), pen),
    tuft(ctx.rnd, 170, 94, 40, tone(ctx.c('grassLight'), 0.22, 0.2), pen),
  );
}

function boulder(crack: boolean) {
  return (ctx: PropCtx): string => {
    const pen = ctx.pen;
    const t = tone(ctx.c('granite'), 0.26, 0.2);
    const { w, h } = ctx.box;
    const rx = w / 2;
    const ry = h / 2;
    const d = smoothD(
      [
        [-rx, ry * 0.7],
        [-rx * 0.96, -ry * 0.2],
        [-rx * 0.6, -ry * 0.85],
        [0, -ry * 1.02],
        [rx * 0.6, -ry * 0.8],
        [rx * 0.98, -ry * 0.1],
        [rx, ry * 0.7],
      ],
      true,
      0.8,
    );
    const id = nextId();
    const lichen = [
      [-rx * 0.4, -ry * 0.5, 16, 7],
      [rx * 0.3, -ry * 0.62, 12, 5],
    ] as const;
    return g(
      {},
      groundShadow(0, ry * 0.75, rx * 1.1, 12),
      el('clipPath', { id }, el('path', { d })),
      flat(d, t.fill),
      g(
        { 'clip-path': `url(#${id})` },
        flat(ellipseD(-rx * 0.35, ry * 0.4, rx * 0.95, ry * 0.75), t.dark),
        flat(ellipseD(rx * 0.32, -ry * 0.62, rx * 0.35, ry * 0.12), t.light),
        ...lichen.map(([x, y, a, b]) => flat(ellipseD(x, y, a, b), ctx.c('lichen'))),
        // Crack (content part at (−10, −30)): a dark split with a hollow.
        crack
          ? g(
              {},
              inked('M-30 -100L-14 -54L-24 -30L-8 0L-18 40L-4 80', 'none', pen.ink, pen.w),
              inked(
                smoothD(
                  [
                    [-36, -44],
                    [-12, -56],
                    [16, -36],
                    [10, -12],
                    [-26, -10],
                  ],
                  true,
                  0.8,
                ),
                '#2A211C',
                pen.ink,
                pen.w,
              ),
              flat(ellipseD(-4, -24, 10, 6), '#4A3A30'),
            )
          : line(
              `M${r2(rx * 0.1)} ${r2(-ry)}l-8 ${r2(ry * 0.6)}l10 ${r2(ry * 0.5)}`,
              pen,
              pen.w * 0.7,
            ),
      ),
      el('path', {
        d,
        fill: 'none',
        stroke: pen.ink,
        'stroke-width': pen.w,
        'stroke-linejoin': 'round',
      }),
      tuft(ctx.rnd, -rx * 0.8, ry * 0.75, 40, tone(ctx.c('grass'), 0.22, 0.25), pen),
      tuft(ctx.rnd, rx * 0.85, ry * 0.75, 34, tone(ctx.c('grassLight'), 0.22, 0.2), pen),
    );
  };
}

function redAloes(rosettes: readonly (readonly [number, number, number])[]) {
  return (ctx: PropCtx): string => {
    const pen = ctx.pen;
    const parts: string[] = [
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
        ctx.c('grassDark'),
        pen.ink,
        pen.w,
      ),
    ];
    for (const [x, y, s] of rosettes) {
      const n = s > 90 ? 3 : 2;
      parts.push(
        aloeFlowers(
          ctx.rnd,
          x,
          y - s * 0.3,
          s * 1.9,
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
    parts.push(tuft(ctx.rnd, -120, 126, 60, tone(ctx.c('grass'), 0.22, 0.25), pen));
    parts.push(tuft(ctx.rnd, 118, 128, 54, tone(ctx.c('grassLight'), 0.22, 0.2), pen));
    return g({}, ...parts);
  };
}

export const BUSHVELD_PLAN: BiomeArtPlan = {
  biome: 'bushveld-winter',
  layers: {
    sky: { top: 0, height: 1080, encode: 'png', draw: sky },
    // v1.6 (D-042): smaller palettes keep the biome chunk inside 1.5 MB.
    far_ridge: { top: 380, height: 280, colours: 96, draw: farRidge },
    // v1.3: the Ver plane's strip (shown only on maps that open it).
    ver_veld: {
      top: 536,
      height: 52,
      draw: verVeld({ ground: 'grass', light: 'grassLight', scrub: 'bossie' }),
    },
    far_veld: { top: 464, height: 232, colours: 96, draw: farVeld },
    // v1.6: taller, for the marula's and mopanes' crowns.
    mid: { top: 430, height: 480, colours: 128, draw: mid },
    near: { top: 820, height: 260, colours: 128, draw: near },
    foreground: { top: 880, height: 200, fadeTop: 28, colours: 128, draw: foreground },
  },
  props: {
    'bushveld/baobab': {
      draw: baobab,
      master: 2,
      wobble: false,
      frame: { w: 600, h: 640, ox: 300, oy: 360 },
      colours: 128,
    },
    'bushveld/dassie_koppie': { draw: dassieKoppie },
    'bushveld/boulder_crack': { draw: boulder(true) },
    'bushveld/boulder_a': { draw: boulder(false) },
    'bushveld/boulder_b': { draw: boulder(false) },
    'bushveld/aloe_a': {
      draw: redAloes([
        [-30, 44, 104],
        [76, 70, 78],
        [-110, 90, 58],
      ]),
    },
    'bushveld/aloe_b': {
      draw: redAloes([
        [24, 46, 110],
        [-90, 74, 76],
        [118, 96, 56],
      ]),
    },
  },
};
