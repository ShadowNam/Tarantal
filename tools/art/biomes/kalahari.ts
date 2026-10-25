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
  tone,
  tuft,
  yAt,
  type Pen,
  type Rnd,
} from '../scenery';
import { el, ellipseD, g, inked, polyD, r2, smoothD } from '../svg';
import { mountainRow, paintRow, rockColours } from '../mountains';
import { groundBand, groundShadow, softSky, windpompTower } from './karoo';
import { foregroundClumps, midScrub, nearGrass, verVeld } from './common';
import { thunderhead } from '../skies';
import { camelthornLook, camelthornSpec, camelthornTree, nestTreeSpec, pod } from '../camelthorn';
import { plantLook, seedTuft, veldShrub } from '../flora';
import { shepherdsTree } from '../species';
import { deadCamelthornTree } from '../deadTree';
import { farAnimal as animal, herd } from '../fauna';
import type { PaintCtx } from '../landscape';
import { boulder, graniteLook } from '../rocks';

/** v1.6 (D-042): driedoring, a grey, open, spiny shrub of the red sand. */
function driedoring(ctx: PaintCtx, x: number, y: number, s: number, pen: Pen): string {
  const look = plantLook({
    leaf: mix(ctx.c('greyGreen'), ctx.c('shrub'), ctx.rnd() * 0.5),
    bark: ctx.c('deadwood'),
    ink: pen.ink,
    sun: ctx.c('grassPale'),
  });
  return veldShrub(ctx.rnd, x, y, s, 'driedoring', look, pen);
}

/** v1.6: Bushman grass (Stipagrostis): blonde blades with silvery feathery plumes. */
function duneTuft(
  ctx: PaintCtx,
  x: number,
  y: number,
  h: number,
  pen: Pen,
  heads?: number,
): string {
  return seedTuft(
    ctx.rnd,
    x,
    y,
    h,
    {
      base: shade(ctx.c('grass'), -0.25),
      blade: ctx.c('grass'),
      tip: ctx.c('grassPale'),
      seed: mix(ctx.c('seed'), '#FFFFFF', 0.3),
    },
    pen,
    heads ?? 1 + Math.floor(ctx.rnd() * 3),
    true,
  );
}

/** v1.6: grey velvety camelthorn pods lying in a tree's shade. */
function fallenPods(
  ctx: PaintCtx,
  x: number,
  foot: number,
  spread: number,
  n: number,
  len: number,
): string {
  const look = camelthornLook(ctx.c, ctx.pen);
  const out: string[] = [];
  for (let k = 0; k < n; k++)
    out.push(
      pod(
        x + (ctx.rnd() - 0.5) * spread * 2,
        foot + (ctx.rnd() - 0.3) * len * 0.8,
        len * (0.8 + ctx.rnd() * 0.4),
        (ctx.rnd() - 0.5) * 0.8 + (ctx.rnd() < 0.5 ? 0 : Math.PI),
        look,
      ),
    );
  return g({}, ...out);
}

// --- shapes --------------------------------------------------------------------------------

/**
 * D-035 round 2: a dune in side view. A long, soft windward slope (lit, a gradient from the
 * bright crest down to the foot, fine wind ripples) rises to a sharp brink; the steep slip face
 * drops on the right, darkest just under the brink and lighter toward its foot; the crest line
 * runs down the face as a sinuous S. Thin soft outline.
 */
function dune(
  rnd: Rnd,
  x: number,
  base: number,
  w: number,
  h: number,
  lit: string,
  lee: string,
  pen: Pen,
  /** Receives the crest point (to stand something on it). */
  crest?: { x: number; y: number },
): string {
  const cx = x + w * (0.58 + rnd() * 0.1);
  const top = base - h;
  if (crest !== undefined) {
    crest.x = cx;
    crest.y = top;
  }
  const sway = (rnd() - 0.5) * w * 0.05;
  // Windward profile: convex, with a slight shoulder; the brink is a small rounded lip.
  const windward = smoothD(
    [
      [x, base],
      [x + w * 0.18, base - h * 0.22],
      [x + w * 0.38, base - h * 0.55 + (rnd() - 0.5) * h * 0.06],
      [cx - w * 0.08, top + h * 0.06],
      [cx - w * 0.015, top + 1],
      [cx, top],
    ],
    false,
    0.6,
  );
  // Slip face: steep and nearly straight to the right foot.
  const leeD = `${windward}C${r2(cx + w * 0.06)} ${r2(top + h * 0.3)} ${r2(cx + w * 0.16)} ${r2(
    top + h * 0.75,
  )} ${r2(x + w)} ${r2(base)}Z`;
  // The brink / crest line seen running down across the face: a sinuous S.
  const crestLine = `M${r2(cx)} ${r2(top)}C${r2(cx - w * 0.05 + sway)} ${r2(top + h * 0.3)} ${r2(
    cx + w * 0.03 - sway,
  )} ${r2(top + h * 0.6)} ${r2(cx - w * 0.07)} ${r2(base)}`;
  const litD = `${windward}${crestLine.replace(/^M[^C]+/, '')}L${r2(x)} ${r2(base)}Z`;
  const gLit = nextId();
  const gLee = nextId();
  const clip = nextId();
  const ripples: string[] = [];
  for (let k = 0; k < Math.round(h / 6); k++) {
    const yy = base - (h * (k + 0.5)) / Math.round(h / 6);
    const x0 = x + w * 0.04;
    const x1 = cx - w * 0.02;
    const amp = 1.2 + rnd() * 1.2;
    let d = `M${r2(x0)} ${r2(yy)}`;
    for (let s = 1; s <= 8; s++) {
      const xs = x0 + ((x1 - x0) * s) / 8;
      d += `Q${r2(xs - (x1 - x0) / 16)} ${r2(yy + (s % 2 === 0 ? amp : -amp))} ${r2(xs)} ${r2(yy)}`;
    }
    ripples.push(d);
  }
  const soft = mix(pen.ink, lee, 0.55);
  return g(
    {},
    el(
      'linearGradient',
      { id: gLit, x1: 0, y1: 0, x2: 0.25, y2: 1 },
      el('stop', { offset: 0, 'stop-color': shade(lit, 0.22) }),
      el('stop', { offset: 0.55, 'stop-color': lit }),
      el('stop', { offset: 1, 'stop-color': shade(lit, -0.1) }),
    ),
    el(
      'linearGradient',
      { id: gLee, x1: 0, y1: 0, x2: 0, y2: 1 },
      el('stop', { offset: 0, 'stop-color': shade(lee, -0.22) }),
      el('stop', { offset: 0.6, 'stop-color': lee }),
      el('stop', { offset: 1, 'stop-color': shade(lee, 0.08) }),
    ),
    el('path', { d: leeD, fill: `url(#${gLee})` }),
    el('clipPath', { id: clip }, el('path', { d: litD })),
    el('path', { d: litD, fill: `url(#${gLit})` }),
    el('path', {
      d: ripples.join(''),
      fill: 'none',
      stroke: shade(lit, -0.18),
      'stroke-width': 0.8,
      opacity: 0.45,
      'clip-path': `url(#${clip})`,
    }),
    el('path', {
      d: crestLine,
      fill: 'none',
      stroke: shade(lit, 0.3),
      'stroke-width': Math.max(1, pen.w * 0.5),
      'stroke-linecap': 'round',
      opacity: 0.8,
    }),
    el('path', {
      d: leeD,
      fill: 'none',
      stroke: soft,
      'stroke-width': Math.max(0.8, pen.w * 0.5),
      'stroke-linejoin': 'round',
    }),
  );
}

/** A gemsbok silhouette: straight long horns, black-and-white face hidden at this size. */

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
    const w = 200 + ctx.rnd() * 100;
    parts.push(thunderhead(ctx.rnd, x, 600, w, 250 + ctx.rnd() * 40, storm, ctx.raw('stormBase')));
  }
  return g({}, ...parts);
}

function farRidge(ctx: LayerCtx): string {
  const parts: string[] = [];
  const horizon = ctx.raw('horizon');
  const backPen: Pen = { ink: mix(ctx.pen.ink, horizon, 0.35), w: 1.5 };
  // D-035: beyond the dunes, a hazy range like the Namib escarpment: jagged layered ridges, a
  // dark massif and a few granite inselbergs rising out of the sand.
  const rock = rockColours(ctx.raw);
  const range = mountainRow(
    ctx.rnd,
    [
      { kind: 'strata', w: 2.2 },
      { kind: 'massif', w: 1.2 },
      { kind: 'inselberg', w: 1 },
      { kind: 'koppie', w: 0.8 },
    ],
    {
      x0: -160,
      x1: ctx.width,
      base: 616,
      width: [380, 700],
      height: [70, 190],
      overlap: [-0.35, 0.2],
      haze: 0.45,
      spireAt: 0.37,
    },
  );
  parts.push(...paintRow(ctx.rnd, range, rock, { ink: backPen.ink, w: 1.4 }, horizon));
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
  // Gemsbok on a crest (bible), tiny: on the front dune whose crest is nearest u = 0.43, drawn
  // right after it (D-035 round 2: they stand on the sand, not in the air).
  const gem = (c: string): string => mix(c, horizon, 0.3);
  const want = ctx.u(0.43);
  const front: { svg: string; crest: { x: number; y: number } }[] = [];
  for (let x = -100; x < ctx.width;) {
    const w = 380 + ctx.rnd() * 340;
    const crest = { x: 0, y: 0 };
    front.push({
      svg: dune(
        ctx.rnd,
        x,
        660,
        w,
        100 + ctx.rnd() * 70,
        ctx.c('duneLit'),
        ctx.c('duneLee'),
        ctx.pen,
        crest,
      ),
      crest,
    });
    x += w * (0.6 + ctx.rnd() * 0.25);
  }
  const near = front.reduce((best, d) =>
    Math.abs(d.crest.x - want) < Math.abs(best.crest.x - want) ? d : best,
  );
  for (const d of front) {
    parts.push(d.svg);
    if (d === near)
      parts.push(
        animal({
          kind: 'gemsbok',
          pose: 'walk',
          x: d.crest.x - 34,
          foot: d.crest.y + 9,
          h: 13,
          tint: gem,
          phase: 0.2,
        }),
        animal({
          kind: 'gemsbok',
          pose: 'alert',
          x: d.crest.x - 12,
          foot: d.crest.y + 3,
          h: 12.5,
          tint: gem,
          phase: 0.7,
        }),
      );
  }
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
      svg: driedoring(ctx, x, y, 3 + ((y - 580) / 170) * 6 + ctx.rnd() * 2, {
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
  // v1.4 B: the far-veld camelthorns use the layered tree at a small scale.
  const look = camelthornLook(ctx.c, ctx.pen);
  const kinds = ['mature', 'young', 'mature', 'old'] as const;
  for (let x = 80, k = 0; x < ctx.width; x += 280 + ctx.rnd() * 420, k++) {
    const kind = kinds[k % kinds.length] ?? 'mature';
    // v1.6 (D-042): now and then a shepherd's tree among the camelthorns.
    if (k % 3 === 2) {
      parts.push(shepherdsTree(ctx.rnd, x, yAt(band.edge, x) + 6, 46 + ctx.rnd() * 14, ctx, 'far'));
      continue;
    }
    const spec = camelthornSpec(kind, x, yAt(band.edge, x) + 6, kind === 'young' ? 0.42 : 0.2, 10);
    parts.push(
      camelthornTree(
        ctx.rnd,
        { ...spec, ground: false, dab: 1.3, density: 0.5, clumps: 22 },
        look,
        ctx.pen,
      ).svg,
    );
  }
  // v1.6 (D-042): herds on the far veld (fauna rig, three poses, hazed for the plane).
  {
    const x = ctx.u(0.5);
    parts.push(herd(ctx.rnd, 'springbok', x, yAt(band.edge, x) + 14, 12, 7, 150, ctx.tint));
  }
  {
    const x = ctx.u(0.62);
    parts.push(herd(ctx.rnd, 'ostrich', x, yAt(band.edge, x) + 12, 24, 2, 50, ctx.tint));
  }
  {
    const x = ctx.u(0.8);
    parts.push(herd(ctx.rnd, 'wildebeest', x, yAt(band.edge, x) + 16, 15, 4, 110, ctx.tint));
  }
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
  const items = midScrub(ctx, {
    bushes: 0.45,
    stone: tone(ctx.c('stone'), 0.25, 0.25),
    shrub: (x, y, sz, pen) => driedoring(ctx, x, y, sz, pen),
  });
  // v1.6 (D-042): grey pods in the shade of the weaver tree (u 0.2) and the dead camelthorn
  // (u 0.74), whose feet stand at about y 740 and 750; blonde plume grass round them.
  for (const [u, foot] of [
    [0.2, 742],
    [0.74, 752],
  ] as const) {
    items.push({ y: foot, svg: fallenPods(ctx, ctx.u(u), foot, 170, 14, 13) });
    for (let k = 0; k < 4; k++) {
      const x = ctx.u(u) + (ctx.rnd() - 0.5) * 360;
      const y = foot + 4 + ctx.rnd() * 14;
      items.push({
        y,
        svg: duneTuft(ctx, x, y, 26 + ctx.rnd() * 10, { ink: ctx.pen.ink, w: 2.5 }),
      });
    }
  }
  items.sort((a, b) => a.y - b.y);
  inside.push(...items.map((i) => i.svg));
  // Shepherd's trees (witgat) on the mid plane, with a few pods blown under them.
  const trees: string[] = [];
  for (const [u, h] of [
    [0.37, 200],
    [0.93, 175],
  ] as const) {
    const x = ctx.u(u);
    trees.push(shepherdsTree(ctx.rnd, x, yAt(band.edge, x) + 40, h, ctx, 'mid'));
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
  const items = nearGrass(ctx, {
    stone: tone(ctx.c('stone'), 0.25, 0.25),
    bushes: 0.3,
    shrub: (x, y, sz, pen) => driedoring(ctx, x, y, sz, pen),
    tuft: (x, y, h, pen) => duneTuft(ctx, x, y, h, pen),
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
  return g(
    {},
    ...foregroundClumps(ctx, [ctx.u(0.05), ctx.u(0.93)], (x) =>
      // v1.6 (D-042): weathered boulders like the Bushveld's, in this biome's rock.
      boulder(
        ctx.rnd,
        x,
        1092,
        120 + ctx.rnd() * 50,
        70 + ctx.rnd() * 26,
        graniteLook(ctx.tint, pen, ctx.c('grass'), '#A8806A'),
        pen,
      ),
    ),
  );
}

// --- props ---------------------------------------------------------------------------------

/**
 * v1.4 B (D-039): the camelthorn with the sociable-weaver family nest, drawn in layers at 2×
 * (tools/art/camelthorn.ts). Content part: nest ellipse 150 × 46 at (0, −78); perch (150, −110).
 */
function weaverCamelthorn(ctx: PropCtx): string {
  return camelthornTree(ctx.rnd, nestTreeSpec(), camelthornLook(ctx.c, ctx.pen), ctx.pen).svg;
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
    // v1.6 (D-042): the windpomp the sign stands by (its head and wheel turn live: WindpompView,
    // hub at (92, −186)).
    g({ transform: 'translate(92 0)' }, windpompTower(ctx, 124, -176, false)),
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

/** v1.4 B: the dead camelthorn (secret branch stub at (−90, −60)), drawn at 2×. */
function deadCamelthornProp(ctx: PropCtx): string {
  return deadCamelthornTree(ctx.rnd, camelthornLook(ctx.c, ctx.pen), ctx.pen);
}

/** v1.6 (D-042): a hummock of Bushman grass with tall silvery plumes (Stipagrostis). */
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
    const order = [0, 6, 1, 5, 2, 4, 3];
    for (const k of order) {
      const x = -84 + k * 28 + (ctx.rnd() - 0.5) * 10 + (seed % 2) * 4;
      const hh = 112 + ctx.rnd() * 40 - Math.abs(k - 3) * 14;
      parts.push(duneTuft(ctx, x, 118 + Math.abs(k - 3) * 2, hh, pen, 2 + ((k + seed) % 2)));
    }
    return g({}, ...parts);
  };
}

export const KALAHARI_PLAN: BiomeArtPlan = {
  biome: 'kalahari-summer',
  layers: {
    sky: { top: 0, height: 1080, encode: 'png', draw: sky },
    // v1.6 (D-042): smaller palettes keep the biome chunk inside 1.5 MB.
    far_ridge: { top: 380, height: 280, colours: 96, draw: farRidge },
    // v1.3: the Ver plane's strip (shown only on maps that open it).
    ver_veld: {
      top: 536,
      height: 52,
      draw: verVeld({ ground: 'sand', light: 'sandLight', scrub: 'bossie' }),
    },
    far_veld: { top: 464, height: 232, colours: 112, draw: farVeld },
    mid: { top: 430, height: 480, colours: 128, draw: mid },
    near: { top: 820, height: 260, colours: 128, draw: near },
    foreground: { top: 880, height: 200, fadeTop: 28, colours: 128, draw: foreground },
  },
  props: {
    'kalahari/weaver_camelthorn': {
      draw: weaverCamelthorn,
      master: 2,
      wobble: false,
      frame: { w: 580, h: 580, ox: 290, oy: 300 },
    },
    'kalahari/windpomp_sign': {
      draw: windpompSign,
      master: 2,
      colours: 96,
      wobble: false,
      frame: { w: 320, h: 440, ox: 120, oy: 310 },
    },
    'kalahari/dead_camelthorn': {
      draw: deadCamelthornProp,
      master: 2,
      wobble: false,
      frame: { w: 460, h: 540, ox: 230, oy: 300 },
    },
    'kalahari/dune_grass_a': { draw: duneGrass(1) },
    'kalahari/dune_grass_b': { draw: duneGrass(2) },
  },
};
