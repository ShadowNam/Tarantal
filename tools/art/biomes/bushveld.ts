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
  yAt,
  type Pen,
  type Rnd,
} from '../scenery';
import { el, ellipseD, g, inked, r2, smoothD } from '../svg';
import { bushHill, hillColours, hillRow, type HillKind } from '../bushHills';
import { gamePath, naturalEdge, patch, termiteMound } from '../bushveldGround';
import { aloeClump, groundBand, plant, softSky } from './karoo';
import { foregroundClumps, midScrub, nearGrass, verVeld } from './common';
import { plantLook, seedTuft, veldShrub } from '../flora';
import { baobab as baobabTree, marula, mopane } from '../species';
import { baobabNear } from '../baobab';
import { bushveldGranite, dwala, graniteBoulder, granitePile } from '../granite';
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
      // v1.6: a hazy winter horizon with dust in the air.
      dust: { colour: '#D8B48C', alpha: 0.45 },
    }),
    mist(ctx.rnd, -40, ctx.width + 40, 610, 70, ctx.raw('mist'), 0.55),
  );
}

/** v1.7e (D-061): a softer ink for the plane's scrub and grass: a dark tone of the grass at the
 *  edges, not a black line (review R2). */
function softInk(ctx: LayerCtx, k: number): LayerCtx {
  return {
    ...ctx,
    pen: { ink: mix(ctx.pen.ink, shade(ctx.c('grassDark'), -0.3), 0.8), w: ctx.pen.w * k },
  };
}

/** v1.7e (D-061): the edge colours between planes (no ink line). */
function edgeColours(ctx: LayerCtx): { lit: string; shade: string; grass: string[] } {
  return {
    lit: ctx.c('bleached'),
    shade: shade(ctx.c('grassDark'), -0.3),
    grass: [ctx.c('straw'), ctx.c('grass'), shade(ctx.c('grassDark'), -0.1)],
  };
}

function farRidge(ctx: LayerCtx): string {
  const parts: string[] = [];
  const horizon = ctx.raw('horizon');
  // v1.7e (D-061): real Bushveld hills (Waterberg, Limpopo) instead of smooth orange cones: a
  // pale, cool escarpment far back, a row of bushy ridges, then nearer koppies with granite faces
  // and boulder knobs; each row tinted toward the haze (aerial perspective, never alpha).
  const cool = '#AEBBC8';
  const rows: {
    kinds: HillKind[];
    haze: number;
    base: number;
    w: [number, number];
    h: [number, number];
    gap: [number, number];
    scale: number;
  }[] = [
    {
      kinds: ['escarpment', 'ridge'],
      haze: 0.7,
      base: 612,
      w: [560, 950],
      h: [105, 150],
      gap: [-0.25, -0.05],
      scale: 0.7,
    },
    {
      kinds: ['ridge', 'koppie', 'ridge'],
      haze: 0.46,
      base: 630,
      w: [300, 560],
      h: [115, 185],
      gap: [-0.2, 0.2],
      scale: 0.85,
    },
    {
      kinds: ['koppie', 'koppie', 'ridge'],
      haze: 0.24,
      base: 652,
      w: [200, 380],
      h: [130, 225],
      gap: [0.3, 1.3],
      scale: 1,
    },
  ];
  for (const r of rows) {
    const col = hillColours(r.haze, horizon, cool);
    const hills = hillRow(ctx.rnd, r.kinds, {
      x0: -160,
      x1: ctx.width,
      base: r.base,
      width: r.w,
      height: r.h,
      gap: r.gap,
    });
    for (const m of hills) parts.push(bushHill(ctx.rnd, m, col, r.scale));
  }
  // v1.6 (D-042): mopane woodland along the foot of the hills, and a baobab or two.
  for (let x = 0; x < ctx.width; x += 26 + ctx.rnd() * 50)
    parts.push(mopane(ctx.rnd, x, 602 + ctx.rnd() * 6, 22 + ctx.rnd() * 14, ctx, 'far', 0.4));
  for (const u of [0.3, 0.77]) parts.push(baobabTree(ctx.rnd, ctx.u(u), 606, 64, ctx, 'far'));
  // v1.7e (D-061): below y 584 the far veld (its edge at 574 ± 3) always covers this layer: one
  // flat colour there instead of hidden detail (bytes).
  parts.push(
    flat(`M-40 584H${r2(ctx.width + 40)}V${r2(ctx.bottom + 40)}H-40Z`, ctx.c('grassLight')),
  );
  return g({}, ...parts);
}

function farVeld(ctx: LayerCtx): string {
  const band = groundBand(ctx, 574, 3, 120, ctx.c('grassLight'));
  const soft = softInk(ctx, 0.8);
  const inside: string[] = [
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 640, 6, 150, ctx.bottom + 40),
      mix(ctx.c('grassLight'), ctx.c('grass'), 0.5),
    ),
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 700, 8, 170, ctx.bottom + 40), ctx.c('grass')),
  ];
  // v1.7e (D-061): bare red earth and pale grass in long flat patches, far away.
  for (let k = 0; k < ctx.width / 160; k++) {
    const y = 590 + ctx.rnd() * 100;
    const rx = 30 + ctx.rnd() * 80;
    inside.push(
      patch(
        ctx.rnd,
        ctx.rnd() * ctx.width,
        y,
        rx,
        rx * 0.06 + 1.5,
        ctx.rnd() < 0.45 ? ctx.c('soil') : ctx.c('bleached'),
        0.45,
      ),
    );
  }
  inside.push(naturalEdge(ctx.rnd, band.edge, 0.6, edgeColours(ctx)).inside);
  // Distant mopane scrub: small, paler twiggy shrubs, thinly inked.
  const far: { y: number; svg: string }[] = [];
  for (let x = ctx.rnd() * 40; x < ctx.width; x += 14 + ctx.rnd() * 46) {
    const y = 584 + Math.pow(ctx.rnd(), 1.3) * 170;
    far.push({
      y,
      svg: mopaneScrub(soft, x, y, 3 + ((y - 580) / 170) * 7 + ctx.rnd() * 2, {
        ink: soft.pen.ink,
        w: 1,
      }),
    });
  }
  far.sort((p, q) => p.y - q.y);
  inside.push(...far.map((i) => i.svg));
  const parts = [band.svg, g({ 'clip-path': `url(#${band.clip})` }, ...inside)];
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
  // v1.6 (D-042): the giraffes and herds are sprites now (src/game/view/faunaHerds.ts, D-054).
  // Frost mist lying over the far veld at dawn.
  parts.push(mist(ctx.rnd, -40, ctx.width + 40, 588, 26, ctx.raw('mist'), 0.5));
  return g({}, ...parts);
}

function mid(ctx: LayerCtx): string {
  const band = groundBand(ctx, 658, 5, 150, ctx.c('grassLight'));
  const soft = softInk(ctx, 0.7);
  const look = bushveldGranite(ctx.tint, ctx.raw('grass'));
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
  // v1.7e (D-061): dry winter veld with texture: bare red earth, pale and darker grass patches.
  const earth = mix(ctx.c('soil'), '#A8603E', 0.5);
  for (let k = 0; k < ctx.width / 200; k++) {
    const y = 672 + Math.pow(ctx.rnd(), 0.8) * 230;
    const near = (y - 660) / 240;
    const rx = (40 + ctx.rnd() * 90) * (0.6 + near);
    const pick = ctx.rnd();
    const fill = pick < 0.4 ? earth : pick < 0.75 ? ctx.c('bleached') : ctx.c('grassDark');
    inside.push(
      patch(
        ctx.rnd,
        ctx.rnd() * ctx.width,
        y,
        rx,
        rx * (0.05 + near * 0.04) + 1.5,
        fill,
        pick < 0.4 ? 0.4 : 0.32,
      ),
    );
  }
  // A game path winding out of the far veld toward the viewer.
  inside.push(
    gamePath(ctx.rnd, [ctx.u(0.38), 664], [ctx.u(0.44), 915], 3, 22, {
      earth: mix(earth, ctx.c('bleached'), 0.35),
      dark: shade(earth, -0.3),
    }),
  );
  // Dwala: low sheets of bare granite breaking through the grass.
  for (let k = 0; k < Math.max(3, Math.round(ctx.width / 1100)); k++) {
    const x = ctx.rnd() * ctx.width;
    const y = 740 + ctx.rnd() * 150;
    const s = 0.6 + (y - 700) / 220;
    inside.push(dwala(ctx.rnd, x, y, (120 + ctx.rnd() * 120) * s, (9 + ctx.rnd() * 6) * s, look));
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
  // Termite mounds of red earth.
  const mounds: { y: number; svg: string }[] = [];
  for (const [u, y, h] of [
    [0.08, 706, 34],
    [0.42, 690, 26],
    [0.71, 742, 44],
    [0.97, 700, 30],
  ] as const)
    mounds.push({
      y,
      svg: termiteMound(ctx.rnd, ctx.u(u), y, h, {
        earth: mix(earth, ctx.c('grass'), 0.3),
        grass: ctx.c('straw'),
      }),
    });
  const items = [
    ...midScrub(soft, {
      bushes: 0.85,
      stone: tone(ctx.c('granite'), 0.25, 0.2),
      shrub: (x, y, s, pen) => mopaneScrub(soft, x, y, s, pen),
    }),
    ...mounds,
  ];
  items.sort((a, b) => a.y - b.y);
  inside.push(naturalEdge(ctx.rnd, band.edge, 1, edgeColours(ctx)).inside);
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
    naturalEdge(ctx.rnd, band.edge, 1.4, edgeColours(ctx)).over,
    ...trees,
  );
}

function near(ctx: LayerCtx): string {
  const band = groundBand(ctx, 848, 9, 120, mix(ctx.c('grass'), ctx.c('grassDark'), 0.35));
  const soft = softInk(ctx, 0.75);
  const inside: string[] = [
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 884, 10, 200, ctx.bottom + 40), ctx.c('grassDark')),
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 1000, 14, 230, ctx.bottom + 40),
      shade(ctx.c('grassDark'), -0.08),
    ),
  ];
  // v1.7e (D-061): bare red earth and pale grass patches near the viewer.
  const earth = mix(ctx.c('soil'), '#A8603E', 0.5);
  for (let k = 0; k < ctx.width / 260; k++) {
    const y = 870 + ctx.rnd() * 190;
    const rx = 70 + ctx.rnd() * 140;
    inside.push(
      patch(
        ctx.rnd,
        ctx.rnd() * ctx.width,
        y,
        rx,
        rx * 0.09,
        ctx.rnd() < 0.5 ? earth : ctx.c('straw'),
        0.3,
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
      shade(ctx.c('grassDark'), -0.22),
      2.5,
    ),
  );
  const edge = naturalEdge(ctx.rnd, band.edge, 2, edgeColours(ctx));
  inside.push(edge.inside);
  const items = nearGrass(soft, {
    stone: tone(ctx.c('granite'), 0.25, 0.2),
    bushes: 0.6,
    shrub: (x, y, s, pen) => mopaneScrub(soft, x, y, s, pen),
    tuft: (x, y, h, pen) => winterTuft(soft, x, y, h, pen),
  });
  items.sort((a, b) => a.y - b.y);
  inside.push(...items.map((i) => i.svg));
  return g({}, band.svg, g({ 'clip-path': `url(#${band.clip})` }, ...inside), edge.over);
}

function foreground(raw: LayerCtx): string {
  // v1.7e (review R2): the foreground grass and log in dark tones, no black ink.
  const ctx = softInk(raw, 0.7);
  const pen = ctx.pen;
  const parts = foregroundClumps(ctx, [ctx.u(0.06), ctx.u(0.92)], (x) =>
    ctx.rnd() < 0.6
      ? granitePile(ctx.rnd, x, 1100, 220, 140, bushveldGranite(ctx.tint, ctx.raw('grass')), 3)
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
  // 1.9.4 (D-057): redrawn (tools/art/baobab.ts): one silhouette, hollows, stick nests, small
  // hairy pods on long stalks.
  return baobabNear(ctx.rnd, ctx, {
    reach: [
      [-124, -214],
      [158, -252],
    ],
  });
}

/**
 * v1.6 (D-042, product owner 25 Oct): the rock hyrax (dassie) at 2×, lying on the top boulder,
 * facing right, inside its content part (ellipse 30 × 22 at (40, −82)): a compact round-backed
 * body with no tail, grey-brown fur in fine strokes, a cream belly and chin, short rounded ears,
 * a dark eye with a pale ring, a blunt snout and dark nose, the dark dorsal gland spot, its front
 * paws on the rock; lit from the upper left, a contact shadow on the stone.
 */
function dassie(rnd: Rnd, tint: (hex: string) => string): string {
  const fur = tint('#7E6A58');
  const furLit = tint('#A8927C');
  const furDark = tint('#4E4036');
  const cream = tint('#E2D2B6');
  const ink = '#2A211C';
  const body = smoothD(
    [
      [14, -64],
      [12, -76],
      [20, -90],
      [36, -96],
      [52, -94],
      [60, -88],
      [66, -84],
      [70, -79],
      [68, -73],
      [60, -70],
      [56, -64],
    ],
    true,
    0.75,
  );
  const id = nextId();
  // Fine fur strokes following the body's curve: lit along the back, darker low.
  const byColour = new Map<string, string[]>();
  for (let k = 0; k < 160; k++) {
    const t = rnd();
    const x = 16 + t * 46;
    const top = -94 + Math.pow((t - 0.45) * 2, 2) * 18;
    const y = top + rnd() * (-64 - top);
    const v = (y - top) / (-64 - top);
    const c = v < 0.25 ? furLit : v > 0.7 ? furDark : rnd() < 0.5 ? fur : shade(fur, -0.12);
    const ang = -0.4 + t * 0.9 + (rnd() - 0.5) * 0.3;
    const d = `M${r2(x)} ${r2(y)}l${r2(Math.cos(ang) * 3.2)} ${r2(Math.sin(ang) * 1.6 + 1)}`;
    byColour.set(c, [...(byColour.get(c) ?? []), d]);
  }
  return g(
    {},
    // Contact shadow on the stone.
    el('path', { d: ellipseD(40, -63, 30, 3), fill: '#1E1814', opacity: 0.35 }),
    // Hind foot tucked under, behind the body.
    el('path', { d: ellipseD(20, -64.5, 6, 2.6), fill: furDark, stroke: ink, 'stroke-width': 0.8 }),
    el('path', {
      d: body,
      fill: fur,
      stroke: ink,
      'stroke-width': 1.3,
      'stroke-linejoin': 'round',
    }),
    el('clipPath', { id }, el('path', { d: body })),
    g(
      { 'clip-path': `url(#${id})` },
      // Shade under the belly and the haunch, a lit back.
      el('path', { d: ellipseD(38, -64, 28, 8), fill: furDark, opacity: 0.6 }),
      el('path', { d: ellipseD(30, -94, 18, 6), fill: furLit, opacity: 0.7 }),
      ...[...byColour].map(([c, ds]) =>
        el('path', {
          d: ds.join(''),
          fill: 'none',
          stroke: c,
          'stroke-width': 0.9,
          'stroke-linecap': 'round',
        }),
      ),
      // The dorsal gland spot (dark, a pale rim) and the cream chin, throat and belly.
      el('path', { d: ellipseD(33, -94.5, 3.4, 1.4), fill: furDark, opacity: 0.9 }),
      el('path', {
        d: smoothD(
          [
            [56, -66],
            [62, -74],
            [68, -76],
            [66, -70],
            [60, -65],
          ],
          true,
          0.7,
        ),
        fill: cream,
      }),
      el('path', { d: ellipseD(40, -66, 12, 2.6), fill: cream, opacity: 0.7 }),
    ),
    // Front paws on the rock.
    el('path', {
      d: ellipseD(58, -64.5, 4.2, 2.2),
      fill: furDark,
      stroke: ink,
      'stroke-width': 0.8,
    }),
    el('path', { d: ellipseD(64, -64.2, 3.6, 2), fill: fur, stroke: ink, 'stroke-width': 0.8 }),
    // Short rounded ears.
    el('path', {
      d: ellipseD(52, -93.5, 3.2, 2.6),
      fill: furDark,
      stroke: ink,
      'stroke-width': 0.8,
    }),
    el('path', { d: ellipseD(52.4, -93.2, 1.6, 1.3), fill: tint('#B89A86') }),
    // The eye: dark, a pale ring, a catchlight.
    el('path', { d: ellipseD(61.5, -85.5, 2.6, 2.3), fill: tint('#D8CBB4') }),
    el('path', { d: ellipseD(61.6, -85.4, 1.8, 1.7), fill: '#140F0C' }),
    el('path', { d: ellipseD(61, -86.1, 0.55, 0.5), fill: '#FFFFFF' }),
    // A blunt snout, the dark nose, the mouth line and a few whiskers.
    el('path', { d: ellipseD(69.4, -79.4, 1.8, 1.5), fill: '#1A1410' }),
    el('path', { d: 'M68 -76.6q-1.6 1 -3.4 0.6', fill: 'none', stroke: ink, 'stroke-width': 0.7 }),
    el('path', {
      d: 'M67 -79l7 -2M67 -78.4l7 0.6M66.6 -77.8l6 2',
      fill: 'none',
      stroke: tint('#3A302A'),
      'stroke-width': 0.45,
    }),
  );
}

/** v1.6 (D-042): the dassie's koppie: faceted granite with lichen, cracks and an aloe. */
function dassieKoppie(ctx: PropCtx): string {
  // v1.7e (D-061): ink-free weathered granite (tools/art/granite.ts).
  const look = bushveldGranite(ctx.tint, ctx.raw('grass'));
  return g(
    {},
    // The back rocks, the dassie's rock (its flat top at about y −63), the front heap.
    granitePile(ctx.rnd, 150, 40, 170, 120, look, 2),
    graniteBoulder(ctx.rnd, 42, 2, 116, 66, look, { grass: false, shadow: false, flat: 0.6 }),
    dassie(ctx.rnd, ctx.tint),
    granitePile(ctx.rnd, -40, 92, 320, 150, look, 5),
  );
}

function boulderProp(crack: boolean) {
  return (ctx: PropCtx): string => {
    const look = bushveldGranite(ctx.tint, ctx.raw('grass'));
    const { w, h } = ctx.box;
    const ry = h / 2;
    // Content: the crack part sits at (−10, −30), 32 × 28; birds perch on the top (y ≈ −60).
    // v1.7e: smaller than the box and shifted down: a margin above the crown (review R1: it touched the top).
    return graniteBoulder(ctx.rnd, 0, ry * 0.9, w * 0.86, ry * 1.6, look, {
      flat: 0.3,
      ...(crack ? { crack: { x: -10, y: -30, len: 70 } } : {}),
    });
  };
}

export const BUSHVELD_PLAN: BiomeArtPlan = {
  biome: 'bushveld-winter',
  layers: {
    // v1.6 (D-042): a 256-colour sky (no visible banding), as the Karoo's and the Okavango's.
    sky: { top: 0, height: 1080, encode: 'png8', draw: sky },
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
      // v1.7e (D-061): 1× in Standard, its 2× twin in the Bushveld HD pack (as the Kalahari weaver
      // tree, D-057): room in the Bushveld chunk for the redrawn rocks and the tell animals.
      master: 1,
      wobble: false,
      frame: { w: 600, h: 640, ox: 300, oy: 360 },
      // 1.9.4 (D-057): 80 colours keep the redrawn tree and the residents' 2× sheet inside the
      // Bushveld chunk (review R2).
      colours: 80,
    },
    'bushveld/dassie_koppie': {
      draw: dassieKoppie,
      master: 2,
      wobble: false,
      // 1.9.4 (D-057): 96 colours (room for the residents' 2× sheet in the Bushveld chunk).
      colours: 96,
      frame: { w: 560, h: 300, ox: 280, oy: 190 },
    },
    'bushveld/boulder_crack': { draw: boulderProp(true), wobble: false, colours: 112 },
    'bushveld/boulder_a': { draw: boulderProp(false), wobble: false, colours: 112 },
    'bushveld/boulder_b': { draw: boulderProp(false), wobble: false, colours: 112 },
    // D-051: the HD aloe drawing replaces the old cartoon rosettes in place, at 1× (the Bushveld
    // chunk has no room for 2× textures; ≤ 1.5 MB gzip).
    'bushveld/aloe_a': {
      draw: aloeClump(
        [
          plant(-30, 68, 112, 60, 5, -0.4, -226),
          plant(66, 72, 80, 24, 4, 0.6, -226),
          plant(-108, 80, 54, 0, 1, 0.2, -226),
        ],
        'grassDark',
        'grass',
        'granite',
      ),
      wobble: false,
      colours: 128,
    },
    'bushveld/aloe_b': {
      draw: aloeClump(
        [
          plant(24, 66, 122, 66, 6, 0.3, -226),
          plant(-88, 74, 82, 20, 3, -0.7, -226),
          plant(116, 82, 56, 0, 2, -0.2, -226),
        ],
        'grassDark',
        'grass',
        'granite',
      ),
      wobble: false,
      colours: 128,
    },
  },
};
