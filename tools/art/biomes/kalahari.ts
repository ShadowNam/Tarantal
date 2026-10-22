// Kalahari summer (bible §4.2): red dunes under a hot sky with a thunderstorm building on the
// horizon (kept low and behind the dunes, so the flyer band stays light and the navy birds pop),
// flat-topped camelthorns, a sociable-weaver mega-nest, gemsbok on a dune crest, a dead
// camelthorn, a signpost (pictogram only, no text), dune grass. Hard light from the upper left.
// D-031.
import type { BiomeArtPlan, LayerCtx, PropCtx } from '../landscape';
import {
  cloud,
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
  type Rnd,
  type Tone,
} from '../scenery';
import { el, ellipseD, g, inked, polyD, r2, smoothD } from '../svg';
import { groundBand, groundShadow, vGradient } from './karoo';

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

/**
 * A building thunderhead: a bank of round sunlit lobes, a dark flat-bottomed storm base and grey
 * rain shafts below (no hard outline at the top, so it never reads as a mountain).
 */
function stormCloud(
  rnd: Rnd,
  x: number,
  base: number,
  w: number,
  h: number,
  body: string,
  lit: string,
  pen: Pen,
): string {
  const lobes: [number, number, number][] = [];
  const n = 7;
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1);
    const hh = Math.sin(f * Math.PI) * 0.75 + 0.25;
    const r = w * (0.11 + rnd() * 0.05);
    lobes.push([x + w * f, base - h * hh * (0.8 + rnd() * 0.25) + r * 0.6, r]);
  }
  for (let k = 0; k < 4; k++)
    lobes.push([x + w * (0.2 + rnd() * 0.6), base - h * (0.35 + rnd() * 0.3), w * 0.14]);
  const d =
    lobes.map(([cx, cy, r]) => ellipseD(cx, cy, r, r * 0.85)).join('') +
    `M${r2(x - w * 0.08)} ${r2(base - h * 0.32)}L${r2(x + w * 1.08)} ${r2(base - h * 0.32)}L${r2(x + w * 1.08)} ${r2(base + 40)}L${r2(x - w * 0.08)} ${r2(base + 40)}Z`;
  const id = nextId();
  const rain: string[] = [];
  for (let k = 0; k < 6; k++) {
    const rx = x + w * (0.15 + k * 0.13);
    rain.push(`M${r2(rx)} ${r2(base - h * 0.2)}l-18 120`);
  }
  return g(
    {},
    el('path', {
      d: rain.join(''),
      stroke: body,
      'stroke-width': 10,
      opacity: 0.35,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d,
      fill: lit,
      stroke: mix(pen.ink, lit, 0.45),
      'stroke-width': pen.w * 2,
      'stroke-linejoin': 'round',
    }),
    el('clipPath', { id }, el('path', { d })),
    flat(d, lit),
    g(
      { 'clip-path': `url(#${id})` },
      flat(
        `M${r2(x - w)} ${r2(base - h * 0.45)}Q${r2(x + w * 0.5)} ${r2(base - h * 0.6)} ${r2(x + w * 2)} ${r2(base - h * 0.42)}L${r2(x + w * 2)} ${r2(base + 60)}L${r2(x - w)} ${r2(base + 60)}Z`,
        body,
      ),
      flat(
        `M${r2(x - w)} ${r2(base - h * 0.62)}Q${r2(x + w * 0.5)} ${r2(base - h * 0.74)} ${r2(x + w * 2)} ${r2(base - h * 0.58)}L${r2(x + w * 2)} ${r2(base - h * 0.45)}Q${r2(x + w * 0.5)} ${r2(base - h * 0.6)} ${r2(x - w)} ${r2(base - h * 0.45)}Z`,
        mix(body, lit, 0.5),
      ),
      ...lobes
        .slice(0, 5)
        .map(([cx, cy, r]) =>
          flat(ellipseD(cx - r * 0.25, cy - r * 0.35, r * 0.45, r * 0.25), '#FFF8EE'),
        ),
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
  const parts: string[] = [
    vGradient('sky', [
      [0, ctx.raw('skyTop')],
      [0.34, ctx.raw('skyMid')],
      [0.55, ctx.raw('skyBottom')],
      [1, ctx.raw('horizon')],
    ]),
    el('rect', { x: 0, y: 0, width: ctx.width, height: 1080, fill: 'url(#sky)' }),
  ];
  // The storm builds low over the horizon (behind the dunes); the flyer band above stays clear.
  const pen: Pen = { ink: mix(ctx.pen.ink, ctx.raw('storm'), 0.3), w: 2 };
  for (let x = -100; x < ctx.width; x += 300 + ctx.rnd() * 300) {
    const w = 320 + ctx.rnd() * 300;
    parts.push(
      stormCloud(
        ctx.rnd,
        x,
        600,
        w,
        150 + ctx.rnd() * 60,
        ctx.raw('storm'),
        ctx.raw('stormLit'),
        pen,
      ),
    );
  }
  for (let x = 0; x < ctx.width; x += 200 + ctx.rnd() * 300) {
    const w = 120 + ctx.rnd() * 140;
    parts.push(
      cloud(
        ctx.rnd,
        x,
        470 + ctx.rnd() * 30,
        w,
        w * 0.2,
        tone(ctx.raw('stormLit'), 0.15, 0.2),
        null,
      ),
    );
  }
  const streak = mix(ctx.raw('cloud'), ctx.raw('skyMid'), 0.35);
  for (let x = 160; x < ctx.width; x += 520 + ctx.rnd() * 400) {
    const y = 140 + ctx.rnd() * 200;
    const w = 160 + ctx.rnd() * 200;
    parts.push(
      flat(
        smoothD(
          [
            [x, y],
            [x + w * 0.35, y - 5],
            [x + w, y - 2],
            [x + w * 0.6, y + 4],
          ],
          true,
          0.8,
        ),
        streak,
      ),
    );
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
  for (let k = 0; k < ctx.width / 26; k++) {
    const x = ctx.rnd() * ctx.width;
    const y = 584 + Math.pow(ctx.rnd(), 1.3) * 170;
    const s = 2.5 + ((y - 580) / 170) * 5;
    inside.push(
      flat(ellipseD(x, y, s * 1.4, s * 0.7), ctx.rnd() < 0.6 ? ctx.c('grass') : ctx.c('shrub')),
    );
  }
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
  const items: { y: number; svg: string }[] = [];
  const grass = tone(ctx.c('grass'), 0.22, 0.25);
  const shrub = tone(ctx.c('shrub'), 0.24, 0.24);
  for (let x = 20; x < ctx.width; x += 70 + ctx.rnd() * 170) {
    const y = 676 + Math.pow(ctx.rnd(), 0.9) * 230;
    const s = 10 + ((y - 660) / 250) * 34;
    const pen: Pen = { ink: ctx.pen.ink, w: s < 18 ? 2.5 : ctx.pen.w };
    const r = ctx.rnd();
    if (r < 0.1)
      items.push({ y, svg: stone(ctx.rnd, x, y, s * 0.5, tone(ctx.c('stone'), 0.25, 0.25), pen) });
    else if (r < 0.35) items.push({ y, svg: tuft(ctx.rnd, x, y, s * 1.3, shrub, pen) });
    else items.push({ y, svg: tuft(ctx.rnd, x, y, s * 1.5, grass, pen, 9) });
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
  const items: { y: number; svg: string }[] = [];
  const pen: Pen = { ink: ctx.pen.ink, w: 5 };
  const grassA = tone(ctx.c('grass'), 0.22, 0.25);
  const grassB = tone(ctx.c('grassPale'), 0.22, 0.2);
  for (let x = 10; x < ctx.width; x += 70 + ctx.rnd() * 140) {
    const y = 860 + ctx.rnd() * 18;
    items.push({
      y,
      svg: tuft(ctx.rnd, x, y, 28 + ctx.rnd() * 26, ctx.rnd() < 0.5 ? grassA : grassB, {
        ink: ctx.pen.ink,
        w: 4,
      }),
    });
  }
  for (let x = 40; x < ctx.width; x += 110 + ctx.rnd() * 220) {
    const y = 1000 + ctx.rnd() * 80;
    const r = ctx.rnd();
    if (r < 0.12)
      items.push({
        y,
        svg: stone(ctx.rnd, x, y, 14 + ctx.rnd() * 14, tone(ctx.c('stone'), 0.25, 0.25), pen),
      });
    else
      items.push({
        y,
        svg: tuft(ctx.rnd, x, y, 50 + ctx.rnd() * 60, r < 0.55 ? grassA : grassB, pen, 9),
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
  const grassA = tone(ctx.c('grass'), 0.25, 0.25);
  const grassB = tone(ctx.c('grassPale'), 0.22, 0.2);
  const avoid = [ctx.u(0.05), ctx.u(0.93)];
  for (let x = 200 + ctx.rnd() * 200; x < ctx.width; x += 650 + ctx.rnd() * 650) {
    if (avoid.some((a) => Math.abs(a - x) < 320)) continue;
    if (ctx.rnd() < 0.3) {
      parts.push(
        stone(ctx.rnd, x, 1084, 50 + ctx.rnd() * 20, tone(ctx.c('stone'), 0.28, 0.25), pen),
      );
      parts.push(tuft(ctx.rnd, x + 70, 1090, 120, grassB, pen, 9));
    } else
      for (let k = 0; k < 4; k++)
        parts.push(
          tuft(
            ctx.rnd,
            x + k * 46 - 70,
            1092,
            120 + ctx.rnd() * 70,
            k % 2 === 0 ? grassA : grassB,
            pen,
            9,
          ),
        );
  }
  return g({}, ...parts);
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
  // Sociable-weaver colony nest (content part: ellipse 150 × 46 at (0, −78)): a huge thatched
  // haystack under the crown, its underside dotted with nest-chamber holes.
  const nest = smoothD(
    [
      [-160, -70],
      [-150, -112],
      [-90, -128],
      [0, -132],
      [100, -128],
      [156, -108],
      [162, -66],
      [120, -38],
      [0, -30],
      [-120, -38],
    ],
    true,
    0.8,
  );
  const id = nextId();
  const holes: string[] = [];
  for (let k = 0; k < 9; k++)
    holes.push(flat(ellipseD(-120 + k * 30, -44 + (k % 2) * 4, 6, 4), '#2A2018'));
  const straws: string[] = [];
  for (let k = 0; k < 26; k++) {
    const x = -150 + ctx.rnd() * 300;
    const y = -122 + ctx.rnd() * 76;
    straws.push(`M${r2(x)} ${r2(y)}l${r2(-6 + ctx.rnd() * 12)} ${r2(8 + ctx.rnd() * 8)}`);
  }
  const canopy = smoothD(
    [
      [-230, -150],
      [-200, -186],
      [-120, -204],
      [0, -210],
      [120, -206],
      [210, -188],
      [236, -150],
      [150, -140],
      [0, -138],
      [-150, -140],
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
    inked(canopy, crown.fill, pen.ink, pen.w),
    flat(ellipseD(-40, -196, 150, 8), crown.light),
    flat(ellipseD(30, -146, 180, 7), crown.dark),
    el('clipPath', { id }, el('path', { d: nest })),
    flat(nest, thatch.fill),
    g(
      { 'clip-path': `url(#${id})` },
      flat(ellipseD(30, -40, 190, 34), thatch.dark),
      flat(ellipseD(-60, -116, 70, 10), thatch.light),
      el('path', {
        d: straws.join(''),
        stroke: thatch.dark,
        'stroke-width': 2.5,
        'stroke-linecap': 'round',
        fill: 'none',
      }),
      ...holes,
    ),
    el('path', {
      d: nest,
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': pen.w,
      'stroke-linejoin': 'round',
    }),
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
      const x = -120 + k * 40 + (ctx.rnd() - 0.5) * 16;
      const hh = 150 + ctx.rnd() * 90 - Math.abs(k - 3) * 18;
      parts.push(tuft(ctx.rnd, x, 120, hh, k % 2 === seed % 2 ? a : b, pen, 9));
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
    sky: { top: 0, height: 1080, draw: sky },
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
