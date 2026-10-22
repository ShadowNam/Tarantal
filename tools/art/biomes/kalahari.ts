// Kalahari summer (bible §4.2): red dunes under a hot sky with a thunderstorm building on the
// horizon (kept low and behind the dunes, so the flyer band stays light and the navy birds pop),
// flat-topped camelthorns, a sociable-weaver mega-nest, gemsbok on a dune crest, a dead
// camelthorn, a signpost (pictogram only, no text), dune grass. Hard light from the upper left.
// D-031.
import type { BiomeArtPlan, LayerCtx, PropCtx } from '../landscape';
import {
  flat,
  groundD,
  line,
  mix,
  nextId,
  post,
  shade,
  stone,
  tone,
  tuft,
  yAt,
  type Pen,
  type Pt,
  type Rnd,
  type Tone,
} from '../scenery';
import { el, ellipseD, g, inked, polyD, r2, smoothD } from '../svg';
import { bush, groundBand, groundShadow, softSky } from './karoo';
import { foregroundClumps, midScrub, nearGrass } from './common';
import { thunderhead } from '../skies';
import { tuftOf } from '../vegetation';

// --- shapes --------------------------------------------------------------------------------

/** A dune with a sharp crest: lit windward slope on the left, shadowed lee slope on the right. */
function dune(
  rnd: Rnd,
  x: number,
  base: number,
  w: number,
  h: number,
  lit: string,
  lee: string,
  pen: Pen,
): string {
  const cx = x + w * (0.55 + rnd() * 0.1);
  const top = base - h;
  const outline = smoothD(
    [
      [x, base],
      [x + w * 0.25, base - h * 0.45],
      [cx - w * 0.05, top + 4],
      [cx, top],
    ],
    false,
    0.6,
  );
  const leeD = `${outline}Q${r2(cx + w * 0.12)} ${r2(top + h * 0.5)} ${r2(x + w)} ${r2(base)}Z`;
  const litD = `${outline}Q${r2(cx - w * 0.02)} ${r2(top + h * 0.6)} ${r2(cx - w * 0.06)} ${r2(base)}Z`;
  return g(
    {},
    flat(leeD, lee),
    flat(litD, lit),
    el('path', {
      d: leeD,
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': pen.w,
      'stroke-linejoin': 'round',
    }),
    line(
      `M${r2(cx)} ${r2(top)}Q${r2(cx - w * 0.02)} ${r2(top + h * 0.6)} ${r2(cx - w * 0.06)} ${r2(base)}`,
      pen,
      pen.w * 0.6,
    ),
  );
}

/** A camelthorn: short trunk, forked limbs, a flat umbrella crown (lit on top). */
function camelthorn(
  _rnd: Rnd,
  x: number,
  base: number,
  s: number,
  crown: Tone,
  trunk: string,
  pen: Pen,
): string {
  const limbs = `M${r2(x)} ${r2(base)}L${r2(x - 2 * s)} ${r2(base - 30 * s)}L${r2(x - 26 * s)} ${r2(base - 58 * s)}M${r2(x - 2 * s)} ${r2(base - 30 * s)}L${r2(x + 22 * s)} ${r2(base - 60 * s)}M${r2(x - 2 * s)} ${r2(base - 30 * s)}L${r2(x + 2 * s)} ${r2(base - 62 * s)}`;
  const top = base - 62 * s;
  const cr = smoothD(
    [
      [x - 60 * s, top + 6 * s],
      [x - 50 * s, top - 6 * s],
      [x - 20 * s, top - 12 * s],
      [x + 20 * s, top - 13 * s],
      [x + 52 * s, top - 7 * s],
      [x + 62 * s, top + 5 * s],
      [x + 20 * s, top + 9 * s],
      [x - 24 * s, top + 9 * s],
    ],
    true,
    0.8,
  );
  return g(
    {},
    el('path', {
      d: limbs,
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': 5 * s + pen.w,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: limbs,
      fill: 'none',
      stroke: trunk,
      'stroke-width': 5 * s,
      'stroke-linecap': 'round',
    }),
    inked(cr, crown.fill, pen.ink, pen.w),
    flat(ellipseD(x - 10 * s, top - 6 * s, 40 * s, 4 * s), crown.light),
    flat(ellipseD(x + 10 * s, top + 6 * s, 46 * s, 3 * s), crown.dark),
  );
}

/** A gemsbok silhouette: straight long horns, black-and-white face hidden at this size. */
function gemsbok(x: number, base: number, s: number, c: string): string {
  return g(
    {},
    flat(
      smoothD(
        [
          [x - 16 * s, base - 22 * s],
          [x + 14 * s, base - 24 * s],
          [x + 16 * s, base - 14 * s],
          [x - 14 * s, base - 12 * s],
        ],
        true,
        0.6,
      ),
      c,
    ),
    el('path', {
      d: `M${x - 12 * s} ${base - 14 * s}L${x - 13 * s} ${base}M${x - 7 * s} ${base - 14 * s}L${x - 6 * s} ${base}M${x + 9 * s} ${base - 16 * s}L${x + 10 * s} ${base}M${x + 13 * s} ${base - 16 * s}L${x + 14 * s} ${base}M${x + 14 * s} ${base - 22 * s}L${x + 20 * s} ${base - 30 * s}M${x + 20 * s} ${base - 30 * s}L${x + 12 * s} ${base - 54 * s}M${x + 21 * s} ${base - 30 * s}L${x + 15 * s} ${base - 55 * s}M${x - 16 * s} ${base - 20 * s}L${x - 20 * s} ${base - 10 * s}`,
      stroke: c,
      'stroke-width': 2 * s,
      'stroke-linecap': 'round',
    }),
    flat(ellipseD(x + 21 * s, base - 29 * s, 4 * s, 3 * s), c),
  );
}

/** Wind ripples on sand: short parallel curved strokes. */
function ripples(
  rnd: Rnd,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  n: number,
  colour: string,
  w: number,
): string {
  let d = '';
  for (let k = 0; k < n; k++) {
    const x = x0 + rnd() * (x1 - x0);
    const y = y0 + rnd() * (y1 - y0);
    const len = 14 + ((y - y0) / Math.max(1, y1 - y0)) * 30;
    d += `M${r2(x)} ${r2(y)}q${r2(len * 0.5)} ${r2(-len * 0.16)} ${r2(len)} 0`;
  }
  return el('path', {
    d,
    fill: 'none',
    stroke: colour,
    'stroke-width': w,
    'stroke-linecap': 'round',
  });
}

// --- layers --------------------------------------------------------------------------------

function sky(ctx: LayerCtx): string {
  // A hot summer sky; the storm is a few distant thunderheads low over the dunes: tall, soft,
  // grey-violet and lighter than the navy birds (far flocks stay readable against them).
  const parts: string[] = [
    softSky(ctx, {
      stops: [
        [0, ctx.raw('skyTop')],
        [0.34, ctx.raw('skyMid')],
        [0.55, ctx.raw('skyBottom')],
        [1, ctx.raw('horizon')],
      ],
      cloud: {
        lit: ctx.raw('cloud'),
        body: mix(ctx.raw('cloud'), ctx.raw('skyBottom'), 0.4),
        base: ctx.raw('cloudShadow'),
      },
      size: [40, 70],
      streaks: 3,
    }),
  ];
  const storm = { lit: ctx.raw('stormLit'), body: ctx.raw('storm'), base: ctx.raw('stormBase') };
  for (let x = 120 + ctx.rnd() * 300; x < ctx.width; x += 700 + ctx.rnd() * 600) {
    const w = 260 + ctx.rnd() * 160;
    parts.push(thunderhead(ctx.rnd, x, 600, w, 190 + ctx.rnd() * 50, storm, ctx.raw('stormBase')));
  }
  return g({}, ...parts);
}

function farRidge(ctx: LayerCtx): string {
  const parts: string[] = [];
  const horizon = ctx.raw('horizon');
  const backPen: Pen = { ink: mix(ctx.pen.ink, horizon, 0.35), w: 1.5 };
  for (let x = -200; x < ctx.width;) {
    const w = 420 + ctx.rnd() * 360;
    parts.push(
      dune(
        ctx.rnd,
        x,
        640,
        w,
        70 + ctx.rnd() * 50,
        mix(ctx.c('duneLit'), horizon, 0.35),
        mix(ctx.c('duneLee'), horizon, 0.35),
        backPen,
      ),
    );
    x += w * (0.55 + ctx.rnd() * 0.2);
  }
  for (let x = -100; x < ctx.width;) {
    const w = 380 + ctx.rnd() * 340;
    parts.push(
      dune(ctx.rnd, x, 660, w, 100 + ctx.rnd() * 70, ctx.c('duneLit'), ctx.c('duneLee'), ctx.pen),
    );
    x += w * (0.6 + ctx.rnd() * 0.25);
  }
  // Gemsbok on a crest (bible), tiny.
  const gem = mix(ctx.c('gemsbok'), horizon, 0.2);
  parts.push(gemsbok(ctx.u(0.42), 588, 0.9, gem), gemsbok(ctx.u(0.44), 590, 0.85, gem));
  return g({}, ...parts);
}

function farVeld(ctx: LayerCtx): string {
  const band = groundBand(ctx, 574, 3, 120, ctx.c('sandLight'));
  const inside: string[] = [
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 640, 6, 150, ctx.bottom + 40),
      mix(ctx.c('sandLight'), ctx.c('sand'), 0.5),
    ),
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 700, 8, 170, ctx.bottom + 40), ctx.c('sand')),
  ];
  // Distant grass tussocks and shrubs: small, paler, thinly inked.
  const far: { y: number; svg: string }[] = [];
  for (let x = ctx.rnd() * 40; x < ctx.width; x += 18 + ctx.rnd() * 60) {
    const y = 584 + Math.pow(ctx.rnd(), 1.3) * 170;
    far.push({
      y,
      svg: bush(ctx, x, y, 3 + ((y - 580) / 170) * 6 + ctx.rnd() * 2, { ink: ctx.pen.ink, w: 1.2 }),
    });
  }
  far.sort((p, q) => p.y - q.y);
  inside.push(...far.map((i) => i.svg));
  const parts = [
    band.svg,
    g({ 'clip-path': `url(#${band.clip})` }, ...inside),
    line(smoothD(band.edge, false, 0.8), ctx.pen),
  ];
  const crown = tone(ctx.c('camelthorn'), 0.22, 0.22);
  for (let x = 80; x < ctx.width; x += 280 + ctx.rnd() * 420)
    parts.push(
      camelthorn(
        ctx.rnd,
        x,
        yAt(band.edge, x) + 6,
        0.7 + ctx.rnd() * 0.3,
        crown,
        ctx.c('trunk'),
        ctx.pen,
      ),
    );
  return g({}, ...parts);
}

function mid(ctx: LayerCtx): string {
  const band = groundBand(ctx, 658, 6, 150, ctx.c('sandLight'));
  const inside: string[] = [
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 694, 10, 170, ctx.bottom + 40),
      mix(ctx.c('sandLight'), ctx.c('sand'), 0.55),
    ),
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 740, 12, 190, ctx.bottom + 40), ctx.c('sand')),
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 845, 16, 210, ctx.bottom + 40),
      mix(ctx.c('sand'), ctx.c('sandDark'), 0.4),
    ),
  ];
  inside.push(
    ripples(
      ctx.rnd,
      0,
      ctx.width,
      690,
      905,
      Math.round(ctx.width / 8),
      shade(ctx.c('sand'), -0.18),
      2,
    ),
  );
  inside.push(
    ripples(
      ctx.rnd,
      0,
      ctx.width,
      690,
      905,
      Math.round(ctx.width / 16),
      shade(ctx.c('sand'), 0.2),
      2,
    ),
  );
  const items = midScrub(ctx, { bushes: 0.45, stone: tone(ctx.c('stone'), 0.25, 0.25) });
  items.sort((a, b) => a.y - b.y);
  inside.push(...items.map((i) => i.svg));
  return g(
    {},
    band.svg,
    g({ 'clip-path': `url(#${band.clip})` }, ...inside),
    line(smoothD(band.edge, false, 0.8), ctx.pen),
  );
}

function near(ctx: LayerCtx): string {
  const band = groundBand(ctx, 848, 9, 120, mix(ctx.c('sand'), ctx.c('sandDark'), 0.4));
  const inside: string[] = [
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 884, 10, 200, ctx.bottom + 40), ctx.c('sandDark')),
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 1000, 14, 230, ctx.bottom + 40),
      shade(ctx.c('sandDark'), -0.06),
    ),
  ];
  inside.push(
    ripples(
      ctx.rnd,
      0,
      ctx.width,
      880,
      1080,
      Math.round(ctx.width / 6),
      shade(ctx.c('sandDark'), -0.2),
      3,
    ),
  );
  const items = nearGrass(ctx, { stone: tone(ctx.c('stone'), 0.25, 0.25), bushes: 0.3 });
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
  return g(
    {},
    ...foregroundClumps(ctx, [ctx.u(0.05), ctx.u(0.93)], (x) =>
      stone(ctx.rnd, x, 1084, 46 + ctx.rnd() * 20, tone(ctx.c('stone'), 0.28, 0.25), pen),
    ),
  );
}

// --- props ---------------------------------------------------------------------------------

/** A thorny limb: a tapered branch with a few white thorn ticks. */
function limb(
  x: number,
  y: number,
  dx: number,
  dy: number,
  w: number,
  fill: string,
  pen: Pen,
): string {
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * w * 0.5;
  const ny = (dx / len) * w * 0.5;
  const d = `M${r2(x - nx)} ${r2(y - ny)}Q${r2(x + dx * 0.5 - nx * 0.6)} ${r2(y + dy * 0.45 - ny * 0.6)} ${r2(x + dx)} ${r2(y + dy)}Q${r2(x + dx * 0.5 + nx * 0.6)} ${r2(y + dy * 0.55 + ny * 0.6)} ${r2(x + nx)} ${r2(y + ny)}Z`;
  return inked(d, fill, pen.ink, pen.w);
}

function weaverCamelthorn(ctx: PropCtx): string {
  const pen = ctx.pen;
  const bark = tone(ctx.c('trunk'), 0.25, 0.25);
  const crown = tone(ctx.c('camelthorn'), 0.24, 0.24);
  const thatch = tone(ctx.c('thatch'), 0.25, 0.25);
  const { oy, h } = ctx.box;
  const foot = oy + h / 2; // 260
  const trunk = smoothD(
    [
      [-36, foot],
      [-24, foot - 120],
      [-26, -20],
      [-10, -60],
      [14, -60],
      [26, -20],
      [26, foot - 120],
      [38, foot],
    ],
    true,
    0.6,
  );
  // Sociable-weaver colony nest (content part: ellipse 150 × 46 at (0, −78)): a shaggy haystack
  // of grass straws hanging in the canopy (GDD §11): ragged sides, a fringe of loose straws
  // along the underside with the chamber entrances, the crown and branches over its top.
  const rnd = ctx.rnd;
  // A lumpy, rounded mass: bulging sides, a sagging belly, a fringe of loose straws underneath.
  const outline: Pt[] = [];
  outline.push([-150, -128], [-100, -146], [-40, -150], [30, -150], [100, -146], [152, -130]);
  for (let y = -116; y <= -64; y += 10) {
    const bulge = Math.sin(((y + 116) / 52) * Math.PI) * 16;
    outline.push([160 + bulge + (rnd() - 0.5) * 10, y]);
  }
  for (let x = 166; x >= -166; x -= 6) {
    const sag = Math.cos((x / 166) * (Math.PI / 2)) * 16; // the belly hangs lowest mid-way
    const yb = -60 + sag + (rnd() - 0.5) * 5;
    const long = rnd() < 0.3;
    outline.push([x, yb]);
    outline.push([x - 3, yb + (long ? 16 + rnd() * 14 : 4 + rnd() * 7)]);
  }
  for (let y = -64; y >= -116; y -= 10) {
    const bulge = Math.sin(((y + 116) / 52) * Math.PI) * 16;
    outline.push([-160 - bulge + (rnd() - 0.5) * 10, y]);
  }
  const nest = polyD(outline);
  const id = nextId();
  const straws: string[] = [];
  const strawsLight: string[] = [];
  for (let k = 0; k < 120; k++) {
    const x = -150 + rnd() * 300;
    const y = -136 + rnd() * 86;
    const len = 8 + rnd() * 14;
    const d = `M${r2(x)} ${r2(y)}l${r2((rnd() - 0.5) * 6)} ${r2(len)}`;
    (rnd() < 0.35 ? strawsLight : straws).push(d);
  }
  const holes: string[] = [];
  for (let k = 0; k < 8; k++)
    holes.push(ellipseD(-120 + k * 34 + (rnd() - 0.5) * 10, -50 + (rnd() - 0.5) * 6, 7, 5));
  const canopy = smoothD(
    [
      [-236, -150],
      [-206, -188],
      [-120, -208],
      [0, -214],
      [120, -208],
      [214, -190],
      [240, -150],
      [170, -134],
      [80, -140],
      [0, -132],
      [-90, -140],
      [-170, -134],
    ],
    true,
    0.8,
  );
  return g(
    {},
    groundShadow(0, foot + 4, 120, 12),
    limb(-10, -40, -160, -110, 20, bark.fill, pen),
    limb(10, -40, 170, -120, 20, bark.fill, pen),
    limb(0, -50, 10, -150, 18, bark.fill, pen),
    limb(-60, -100, -120, -60, 12, bark.fill, pen),
    // Perch branch (content perch (150, −110)).
    limb(60, -90, 120, -24, 12, bark.fill, pen),
    inked(trunk, bark.fill, pen.ink, pen.w),
    flat(
      polyD([
        [6, foot],
        [10, -50],
        [24, -20],
        [26, foot],
      ]),
      bark.dark,
    ),
    el('clipPath', { id }, el('path', { d: nest })),
    flat(nest, thatch.fill),
    g(
      { 'clip-path': `url(#${id})` },
      flat(ellipseD(40, -44, 210, 42), thatch.dark),
      flat(ellipseD(-70, -128, 80, 12), thatch.light),
      el('path', {
        d: straws.join(''),
        stroke: thatch.dark,
        'stroke-width': 2.2,
        'stroke-linecap': 'round',
        fill: 'none',
      }),
      el('path', {
        d: strawsLight.join(''),
        stroke: thatch.light,
        'stroke-width': 2,
        'stroke-linecap': 'round',
        fill: 'none',
      }),
      flat(holes.join(''), '#2A2018'),
    ),
    el('path', {
      d: nest,
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': pen.w * 0.8,
      'stroke-linejoin': 'round',
    }),
    // Branches run into the nest; the flat crown sits over its top.
    limb(-80, -110, -60, -60, 10, bark.fill, pen),
    limb(70, -114, 70, -62, 10, bark.fill, pen),
    inked(canopy, crown.fill, pen.ink, pen.w),
    flat(ellipseD(-40, -200, 150, 8), crown.light),
    flat(ellipseD(30, -150, 190, 8), crown.dark),
  );
}

function windpompSign(ctx: PropCtx): string {
  // A weathered farm signboard on a post (no text: a painted windpomp pictogram and an arrow),
  // the board is the secret part (rect 90 × 46 at (0, −90)).
  const pen = ctx.pen;
  const wood = tone(ctx.c('wood'), 0.28, 0.22);
  const board = tone(ctx.c('board'), 0.2, 0.2);
  const paint = ctx.c('paint');
  return g(
    {},
    groundShadow(10, 122, 40, 6),
    post(0, 122, 240, 22, wood, pen),
    inked(
      polyD([
        [-48, -116],
        [48, -114],
        [46, -66],
        [-46, -68],
      ]),
      board.fill,
      pen.ink,
      pen.w,
    ),
    flat(
      polyD([
        [20, -114],
        [48, -114],
        [46, -66],
        [24, -66],
      ]),
      board.dark,
    ),
    // Pictogram: a little windpomp and an arrow, in faded paint.
    line('M-30 -74L-24 -100M-18 -74L-24 -100M-26 -86L-22 -86', { ink: paint, w: 3 }),
    el('circle', { cx: -24, cy: -102, r: 7, fill: 'none', stroke: paint, 'stroke-width': 3 }),
    line('M-2 -90L30 -90M22 -98L32 -90L22 -82', { ink: paint, w: 4 }),
    // Bullet holes and nails.
    flat(ellipseD(10, -104, 2.5, 2.5), '#2A2018'),
    flat(ellipseD(-8, -76, 2.5, 2.5), '#2A2018'),
    flat(ellipseD(-40, -108, 2, 2), '#6E6A64'),
    flat(ellipseD(40, -74, 2, 2), '#6E6A64'),
    tuft(ctx.rnd, -26, 124, 44, tone(ctx.c('grass'), 0.22, 0.25), pen),
    tuft(ctx.rnd, 28, 124, 38, tone(ctx.c('grassPale'), 0.22, 0.2), pen),
  );
}

function deadCamelthorn(ctx: PropCtx): string {
  const pen = ctx.pen;
  const wood = tone(ctx.c('deadwood'), 0.28, 0.25);
  const { oy, h } = ctx.box;
  const foot = oy + h / 2; // 230
  const trunk = smoothD(
    [
      [-34, foot],
      [-24, foot - 100],
      [-30, -10],
      [-14, -50],
      [16, -52],
      [26, -10],
      [24, foot - 100],
      [36, foot],
    ],
    true,
    0.6,
  );
  return g(
    {},
    groundShadow(0, foot + 4, 100, 10),
    limb(-14, -30, -120, -130, 18, wood.fill, pen),
    limb(-60, -100, -60, -110, 10, wood.fill, pen),
    limb(14, -40, 130, -170, 18, wood.fill, pen),
    limb(80, -130, 70, -50, 9, wood.fill, pen),
    limb(0, -48, -10, -200, 14, wood.fill, pen),
    // The secret branch stub (content part at (−90, −60), 40 × 22).
    limb(-20, -20, -86, -42, 22, wood.fill, pen),
    inked(ellipseD(-106, -62, 12, 10), wood.light, pen.ink, pen.w * 0.8),
    flat(ellipseD(-106, -62, 6, 5), wood.dark),
    inked(trunk, wood.fill, pen.ink, pen.w),
    flat(
      polyD([
        [4, foot],
        [8, -40],
        [22, -10],
        [24, foot],
      ]),
      wood.dark,
    ),
    line('M-10 40Q-14 120 -8 220M10 -20Q14 80 12 200', { ink: wood.dark, w: 3 }),
  );
}

function duneGrass(seed: number) {
  return (ctx: PropCtx): string => {
    const pen = ctx.pen;
    const parts: string[] = [
      inked(
        smoothD(
          [
            [-150, 130],
            [-120, 96],
            [-40, 80],
            [60, 82],
            [130, 96],
            [150, 130],
          ],
          true,
          0.7,
        ),
        ctx.c('sandDark'),
        pen.ink,
        pen.w,
      ),
    ];
    const a = tone(ctx.c('grass'), 0.22, 0.25);
    const b = tone(ctx.c('grassPale'), 0.22, 0.2);
    for (let k = 0; k < 7; k++) {
      const x = -96 + k * 32 + (ctx.rnd() - 0.5) * 12;
      const hh = 130 + ctx.rnd() * 60 - Math.abs(k - 3) * 16;
      parts.push(
        tuftOf(
          k % 3 === 0 ? 'upright' : 'fan',
          ctx.rnd,
          x,
          120,
          hh,
          k % 2 === seed % 2 ? a : b,
          pen,
          ctx.c('seed'),
        ),
      );
    }
    // Feathery seed heads (Stipagrostis), pale.
    for (let k = 0; k < 6; k++) {
      const x = -90 + k * 36 + (ctx.rnd() - 0.5) * 20;
      const top = -60 - ctx.rnd() * 110;
      parts.push(line(`M${r2(x)} 60Q${r2(x - 6)} ${r2(top + 40)} ${r2(x + 4)} ${r2(top)}`, pen, 3));
      parts.push(inked(ellipseD(x + 4, top + 10, 7, 18), ctx.c('seed'), pen.ink, 2));
    }
    return g({}, ...parts);
  };
}

export const KALAHARI_PLAN: BiomeArtPlan = {
  biome: 'kalahari-summer',
  layers: {
    sky: { top: 0, height: 1080, encode: 'png', draw: sky },
    far_ridge: { top: 380, height: 280, draw: farRidge },
    far_veld: { top: 548, height: 232, draw: farVeld },
    mid: { top: 630, height: 280, draw: mid },
    near: { top: 820, height: 260, draw: near },
    foreground: { top: 880, height: 200, draw: foreground },
  },
  props: {
    'kalahari/weaver_camelthorn': { draw: weaverCamelthorn },
    'kalahari/windpomp_sign': { draw: windpompSign },
    'kalahari/dead_camelthorn': { draw: deadCamelthorn },
    'kalahari/dune_grass_a': { draw: duneGrass(1) },
    'kalahari/dune_grass_b': { draw: duneGrass(2) },
  },
};
