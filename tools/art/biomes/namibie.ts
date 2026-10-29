// v1.4 B (D-039) Namibië — Etosha & Namib (bible §4): a hot pale sky bleaching to white at the
// horizon, low orange-red Namib dunes, the far edge of the pan with a waterhole and its little
// camelthorns (Ver strip), the wide white salt pan (faint polygon cracks, a bright mirage band at
// the horizon; the shimmer itself is animated by the game), a pale calcrete pan edge with sparse
// grass, the red dune edge in front, blonde grass. Props: camelthorns (the approved layered
// trees of tools/art/camelthorn.ts, one with the sociable-weaver family nest), quiver trees
// (Aloidendron dichotomum, one with an ostrich-egg water flask) and grass mounds. Light from the
// upper left, thin soft outlines (D-035).
import { paint, type BiomeArtPlan, type LayerCtx, type PaintCtx, type PropCtx } from '../landscape';
import type { ArtConfig } from '../config';
import { roundFruit } from '../flora';
import { StrokeBin, zigzag } from '../camelthorn';
import { boulder, graniteLook } from '../rocks';
import {
  flat,
  groundD,
  line,
  mix,
  nextId,
  shade,
  yAt,
  type Pen,
  type Pt,
  type Rnd,
} from '../scenery';
import { el, ellipseD, g, inked, r2, smoothD } from '../svg';
import { fruit, placedFruit } from '../fruitSink';
import { quiverSpikeHi, roundHi } from '../fruitLook';
import { groundBand, groundShadow, softSky } from './karoo';
import { verVeld } from './common';
import {
  bushmanClump,
  clumpField,
  gravelPatch,
  sandGradient,
  sandRidge,
  sandTexture,
  softBlur,
  tracks,
  veldSprite,
  type NamibLook,
  type VeldLooks,
} from '../namibVeld';
import {
  camelthornLook,
  camelthornSpec,
  camelthornTree,
  nestTreeSpec,
  type CamelthornVariant,
} from '../camelthorn';

// --- shapes --------------------------------------------------------------------------------

/** A small camelthorn far away (the layered tree, few clumps, no ground). */
function farCamelthorn(
  ctx: LayerCtx,
  kind: Exclude<CamelthornVariant, 'nest'>,
  x: number,
  foot: number,
  k: number,
  pen: Pen,
): string {
  const spec = camelthornSpec(kind, x, foot, k, 8);
  return camelthornTree(
    ctx.rnd,
    {
      ...spec,
      ground: false,
      dab: Math.max(0.5, 6 * k),
      density: 0.5,
      clumps: Math.max(8, Math.round(110 * k)),
    },
    camelthornLook(ctx.c, pen),
    pen,
  ).svg;
}

/**
 * The salt pan's polygon cracks: rows of cells that grow toward the viewer (perspective), faint
 * lines a shade darker than the salt, a few lighter rims.
 */
function saltCracks(
  rnd: Rnd,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  dark: string,
  light: string,
  wMax: number,
): string {
  let d = '';
  let dl = '';
  for (let y = y0; y < y1;) {
    const rh = 3.5 + (y - y0) * 0.12;
    const next = y + rh;
    let x = x0 + rnd() * 30;
    let prev: Pt = [x, y];
    while (x < x1) {
      const cw = rh * (6 + rnd() * 6);
      const nx = x + cw;
      const ny = y + (rnd() - 0.5) * rh * 0.3;
      // The row's top edge (not always: some cells merge) and a slanted side wall.
      if (rnd() < 0.7) d += `M${r2(prev[0])} ${r2(prev[1])}L${r2(nx)} ${r2(ny)}`;
      if (rnd() < 0.8)
        d += `M${r2(nx)} ${r2(ny)}L${r2(nx + (rnd() - 0.5) * cw * 0.35)} ${r2(next)}`;
      if (rnd() < 0.06) dl += `M${r2(prev[0] + 1)} ${r2(prev[1] + 1)}L${r2(nx - 1)} ${r2(ny + 1)}`;
      prev = [nx, ny];
      x = nx;
    }
    y = next;
  }
  const w = (k: number): number => Math.min(wMax, 0.5 + k);
  return g(
    {},
    el('path', {
      d,
      fill: 'none',
      stroke: dark,
      'stroke-width': w(0.2),
      'stroke-linecap': 'round',
      opacity: 0.55,
    }),
    el('path', { d: dl, fill: 'none', stroke: light, 'stroke-width': w(0.3), opacity: 0.8 }),
  );
}

// --- layers --------------------------------------------------------------------------------

function sky(ctx: LayerCtx): string {
  // Hot and clear: a deep pale blue overhead bleaching to white haze at the horizon, a few thin
  // streaks and small heat-haze clouds low down.
  return softSky(ctx, {
    stops: [
      [0, ctx.raw('skyTop')],
      [0.3, ctx.raw('skyMid')],
      [0.5, ctx.raw('skyBottom')],
      [0.56, ctx.raw('horizon')],
      [1, ctx.raw('horizon')],
    ],
    cloud: {
      lit: ctx.raw('cloud'),
      body: mix(ctx.raw('cloud'), ctx.raw('skyBottom'), 0.45),
      base: ctx.raw('cloudShadow'),
    },
    base: 540,
    size: [26, 46],
    streaks: 3,
  });
}

/**
 * A Sossusvlei dune (D-039 art fix): concave flanks that flatten into the pan, a sinuous knife-edge
 * crest running from the peak down to the foot in an S, a sunlit apricot face on the left of the
 * crest and a deep rust shadow face on the right (darkest right under the crest), soft wind
 * ripples on the lit face. A star dune adds curving arms that run down its lit flank.
 */
function namibDune(
  rnd: Rnd,
  cx: number,
  base: number,
  w: number,
  h: number,
  lit: string,
  lee: string,
  pen: Pen,
  star: boolean,
): string {
  const px = cx + (rnd() - 0.5) * w * 0.12;
  const py = base - h;
  // A long windward flank on the left, a shorter, steeper slip face on the right.
  const lx = cx - w * (0.58 + rnd() * 0.12);
  const rx = cx + w * (0.3 + rnd() * 0.1);
  // Concave flanks: steep near the peak, nearly flat at the foot.
  const left = `M${r2(lx)} ${r2(base)}C${r2(lx + w * 0.32)} ${r2(base - h * 0.03)} ${r2(
    px - w * 0.14,
  )} ${r2(py + h * 0.28)} ${r2(px)} ${r2(py)}`;
  const right = `C${r2(px + w * 0.09)} ${r2(py + h * 0.3)} ${r2(rx - w * 0.26)} ${r2(
    base - h * 0.03,
  )} ${r2(rx)} ${r2(base)}`;
  const outline = `${left}${right}Z`;
  // The crest: an S from the peak to a point on the foot a little right of it.
  const kx = px + w * (0.08 + rnd() * 0.12);
  const s1 = (rnd() - 0.5) * w * 0.1;
  const crest = `C${r2(px - w * 0.07 + s1)} ${r2(py + h * 0.38)} ${r2(kx + w * 0.11 - s1)} ${r2(
    base - h * 0.42,
  )} ${r2(kx)} ${r2(base)}`;
  const litFace = `${left}${crest}Z`;
  const gLit = nextId();
  const gLee = nextId();
  const clip = nextId();
  const parts: string[] = [
    el(
      'linearGradient',
      { id: gLit, x1: 0, y1: 0, x2: 0.15, y2: 1 },
      el('stop', { offset: 0, 'stop-color': shade(lit, 0.22) }),
      el('stop', { offset: 0.5, 'stop-color': lit }),
      el('stop', { offset: 1, 'stop-color': mix(lit, lee, 0.18) }),
    ),
    el(
      'linearGradient',
      { id: gLee, x1: 0, y1: 0, x2: 0.6, y2: 0.4 },
      el('stop', { offset: 0, 'stop-color': shade(lee, -0.28) }),
      el('stop', { offset: 0.55, 'stop-color': lee }),
      el('stop', { offset: 1, 'stop-color': shade(lee, 0.16) }),
    ),
    el('path', { d: outline, fill: `url(#${gLee})` }),
    el('path', { d: litFace, fill: `url(#${gLit})` }),
    el('clipPath', { id: clip }, el('path', { d: litFace })),
  ];
  // Soft wind ripples on the lit face: long shallow waves that curve up toward the crest.
  const rip: string[] = [];
  const nr = Math.max(3, Math.round(h / 6));
  for (let k = 1; k < nr; k++) {
    const t = k / nr;
    const y0 = base - h * t * 0.92;
    const x0 = lx + (px - lx) * t * 0.6 - w * 0.05;
    const x1 = px + (kx - px) * (1 - t) + w * 0.02;
    const amp = 0.5 + rnd() * 0.9;
    let d = `M${r2(x0)} ${r2(y0 + h * 0.02)}`;
    const n = 7;
    for (let q = 1; q <= n; q++) {
      const xq = x0 + ((x1 - x0) * q) / n;
      const yq = y0 - Math.sin((q / n) * Math.PI) * h * 0.03;
      d += `Q${r2(xq - (x1 - x0) / (2 * n))} ${r2(yq + (q % 2 === 0 ? amp : -amp))} ${r2(xq)} ${r2(yq)}`;
    }
    rip.push(d);
  }
  parts.push(
    el('path', {
      d: rip.join(''),
      fill: 'none',
      stroke: mix(lit, lee, 0.45),
      'stroke-width': 0.7,
      opacity: 0.35,
      'clip-path': `url(#${clip})`,
    }),
  );
  if (star) {
    // Curving arms down the lit flank: each a ridge with a thin shadow sliver on its far side.
    for (let k = 0; k < 2; k++) {
      const f = 0.25 + k * 0.3 + rnd() * 0.1;
      const ax = px + (lx - px) * f * 0.55;
      const ay = py + h * (0.18 + f * 0.3);
      const bx = lx + (px - lx) * (0.2 + k * 0.2);
      const arm = `M${r2(ax)} ${r2(ay)}C${r2(ax - w * 0.06)} ${r2(ay + h * 0.2)} ${r2(
        bx + w * 0.1,
      )} ${r2(base - h * 0.18)} ${r2(bx)} ${r2(base)}`;
      const sliver = `${arm}L${r2(bx + w * 0.07)} ${r2(base)}C${r2(bx + w * 0.16)} ${r2(
        base - h * 0.16,
      )} ${r2(ax + w * 0.01)} ${r2(ay + h * 0.22)} ${r2(ax)} ${r2(ay)}Z`;
      parts.push(
        el('path', { d: sliver, fill: lee, opacity: 0.55, 'clip-path': `url(#${clip})` }),
        el('path', {
          d: arm,
          fill: 'none',
          stroke: shade(lit, 0.32),
          'stroke-width': 0.9,
          'stroke-linecap': 'round',
          opacity: 0.8,
          'clip-path': `url(#${clip})`,
        }),
      );
    }
  }
  // The knife edge: a dark line on the shadow side and a bright one on the lit side.
  const crestD = `M${r2(px)} ${r2(py)}${crest}`;
  parts.push(
    el('path', {
      d: crestD,
      fill: 'none',
      stroke: shade(lee, -0.35),
      'stroke-width': 1.6,
      'stroke-linecap': 'round',
      opacity: 0.75,
      transform: 'translate(0.9 0)',
    }),
    el('path', {
      d: crestD,
      fill: 'none',
      stroke: shade(lit, 0.38),
      'stroke-width': 0.9,
      'stroke-linecap': 'round',
      opacity: 0.85,
    }),
    el('path', {
      d: outline,
      fill: 'none',
      stroke: mix(pen.ink, lee, 0.65),
      'stroke-width': Math.max(0.5, pen.w * 0.35),
      'stroke-linejoin': 'round',
      opacity: 0.7,
    }),
  );
  return g({}, ...parts);
}

function farRidge(ctx: LayerCtx): string {
  const parts: string[] = [];
  const horizon = ctx.raw('horizon');
  // Three overlapping ranges, back to front: the back one big and hazy (a few star dunes), then
  // a mid range, then small dunes in front; heights and widths vary, every crest an S.
  const ranges = [
    {
      base: 549,
      h0: 105,
      h1: 165,
      w0: 560,
      w1: 900,
      haze: 0.2,
      s0: 0.4,
      s1: 0.6,
      star: 0.5,
      ink: 0.45,
    },
    {
      base: 552,
      h0: 60,
      h1: 105,
      w0: 360,
      w1: 600,
      haze: 0.08,
      s0: 0.5,
      s1: 0.75,
      star: 0.3,
      ink: 0.25,
    },
    { base: 556, h0: 24, h1: 50, w0: 200, w1: 380, haze: 0, s0: 0.6, s1: 0.95, star: 0, ink: 0.1 },
  ];
  for (const r of ranges) {
    const pen: Pen = { ink: mix(ctx.pen.ink, horizon, r.ink), w: 1.2 };
    // Raw palette: each range's own haze is the only haze (the layer's would wash them out).
    const lit = mix(ctx.raw('duneFar'), horizon, r.haze);
    const lee = mix(ctx.raw('duneLee'), horizon, r.haze * 1.2);
    for (let x = -300; x < ctx.width + 300;) {
      const w = r.w0 + ctx.rnd() * (r.w1 - r.w0);
      const h = r.h0 + ctx.rnd() * (r.h1 - r.h0);
      parts.push(namibDune(ctx.rnd, x + w / 2, r.base, w, h, lit, lee, pen, ctx.rnd() < r.star));
      x += w * (r.s0 + ctx.rnd() * (r.s1 - r.s0));
    }
    // A little haze over each range's foot, most on the farthest.
    const haze = nextId();
    parts.push(
      el(
        'linearGradient',
        { id: haze, x1: 0, y1: 0, x2: 0, y2: 1 },
        el('stop', { offset: 0, 'stop-color': horizon, 'stop-opacity': 0 }),
        el('stop', { offset: 1, 'stop-color': horizon, 'stop-opacity': 0.25 + r.haze }),
      ),
      el('rect', { x: 0, y: r.base - 30, width: ctx.width, height: 34, fill: `url(#${haze})` }),
    );
  }
  // The bases flatten into the pan: a pale band of sand and salt at the foot of the front range.
  const foot = nextId();
  parts.push(
    el(
      'linearGradient',
      { id: foot, x1: 0, y1: 0, x2: 0, y2: 1 },
      el('stop', { offset: 0, 'stop-color': horizon, 'stop-opacity': 0 }),
      el('stop', {
        offset: 1,
        'stop-color': mix(ctx.c('salt'), horizon, 0.3),
        'stop-opacity': 0.85,
      }),
    ),
    el('rect', { x: 0, y: 548, width: ctx.width, height: 36, fill: `url(#${foot})` }),
  );
  return g({}, ...parts);
}

function verStrip(ctx: LayerCtx): string {
  const base = verVeld({ ground: 'saltShade', light: 'salt', scrub: 'bossieGrey' })(ctx);
  const parts: string[] = [base];
  const horizon = ctx.raw('horizon');
  // The waterhole (D-039 art fix): a darker ring of trodden mud, a wet dark edge, the pale-blue
  // water with the sky's glint on it, and a few springbok and gemsbok drinking at its edge.
  const wx = ctx.u(0.5);
  const half = (ctx.u(0.58) - ctx.u(0.42)) * 0.5;
  const wy = 557;
  const mud = '#7A6450';
  parts.push(
    flat(ellipseD(wx, wy + 0.6, half * 0.82, 5.2), mix(ctx.c('calcreteDark'), mud, 0.45), {
      opacity: 0.85,
    }),
    flat(ellipseD(wx, wy + 0.3, half * 0.66, 3.8), mud, { opacity: 0.9 }),
    flat(ellipseD(wx - half * 0.03, wy, half * 0.58, 3.1), '#5E5244'),
    flat(
      ellipseD(wx - half * 0.04, wy - 0.2, half * 0.54, 2.6),
      mix(ctx.c('water'), '#A9CCE0', 0.4),
    ),
    flat(ellipseD(wx - half * 0.14, wy - 0.9, half * 0.3, 0.7), '#F4FAFF', { opacity: 0.95 }),
    flat(ellipseD(wx + half * 0.24, wy - 0.4, half * 0.12, 0.45), '#E6F2FA', { opacity: 0.8 }),
  );
  // v1.6 (D-042): the drinkers are a sprite now (src/game/view/faunaHerds.ts, D-054).
  // A few small camelthorns round the water (hazed, no ink).
  const pen: Pen = { ink: mix(ctx.pen.ink, horizon, 0.5), w: 0.3 };
  const trees: [number, number, number, Exclude<CamelthornVariant, 'nest'>][] = [
    [-0.78, 554, 0.05, 'mature'],
    [-0.62, 553.5, 0.04, 'young'],
    [-0.4, 553, 0.035, 'mature'],
    [0.5, 553.2, 0.04, 'old'],
    [0.7, 554.4, 0.055, 'mature'],
    [0.86, 553.6, 0.035, 'young'],
  ];
  for (const [f, y, k, kind] of trees)
    parts.push(farCamelthorn(ctx, kind, wx + f * half, y, k, pen));
  return g({}, ...parts);
}

function farVeld(ctx: LayerCtx): string {
  const band = groundBand(ctx, 574, 1.2, 140, ctx.c('salt'));
  const grad = nextId();
  const inside: string[] = [
    el(
      'linearGradient',
      { id: grad, x1: 0, y1: 0, x2: 0, y2: 1, gradientUnits: 'userSpaceOnUse' },
      el('stop', { offset: 0, 'stop-color': ctx.c('saltBright') }),
      el('stop', { offset: 0.05, 'stop-color': ctx.c('saltBright') }),
      el('stop', { offset: 0.22, 'stop-color': ctx.c('salt') }),
      el('stop', { offset: 1, 'stop-color': mix(ctx.c('salt'), ctx.c('saltShade'), 0.6) }),
    ),
    el('rect', {
      x: -40,
      y: 560,
      width: ctx.width + 80,
      height: ctx.bottom - 560 + 40,
      fill: `url(#${grad})`,
    }),
  ];
  // Soft shading: long flat drifts of greyer salt and pale sand, wider toward the viewer.
  for (let k = 0; k < ctx.width / 60; k++) {
    const x = ctx.rnd() * ctx.width;
    const y = 582 + Math.pow(ctx.rnd(), 1.4) * 110;
    const t = (y - 575) / 120;
    inside.push(
      flat(
        ellipseD(x, y, 40 + t * 160 + ctx.rnd() * 60, 0.8 + t * 4),
        ctx.rnd() < 0.7 ? ctx.c('saltShade') : mix(ctx.c('calcrete'), ctx.c('sandLight'), 0.3),
        { opacity: 0.35 + ctx.rnd() * 0.25 },
      ),
    );
  }
  inside.push(
    saltCracks(ctx.rnd, -20, ctx.width + 20, 584, ctx.bottom, ctx.c('saltCrack'), '#FFFFFF', 1.4),
  );
  // The mirage band: a bright glassy strip on the horizon with a faint mirrored sky line.
  inside.push(
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 576, 0.8, 160, 581), ctx.c('saltBright'), {
      opacity: 0.9,
    }),
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 577.5, 0.5, 220, 579), ctx.raw('skyMid'), {
      opacity: 0.3,
    }),
  );
  // Odd tufts and stones far out on the pan, sparse.
  const farLook = namibLook(ctx, 0.25);
  const far: { y: number; svg: string }[] = [];
  for (let x = ctx.rnd() * 200; x < ctx.width; x += 90 + ctx.rnd() * 260) {
    const y = 600 + Math.pow(ctx.rnd(), 1.2) * 90;
    far.push({
      y,
      // v1.7d (D-059): tiny ink-free grass clumps, finer and sparser into the distance.
      svg: bushmanClump(ctx.rnd, x, y, 2.5 + ((y - 600) / 90) * 5, farLook, { detail: false }),
    });
  }
  far.sort((p, q) => p.y - q.y);
  inside.push(...far.map((i) => i.svg));
  const parts = [band.svg, g({ 'clip-path': `url(#${band.clip})` }, ...inside)];
  // A few distant camelthorns standing alone on the open pan edge.
  const kinds = ['mature', 'young', 'old', 'mature'] as const;
  const pen: Pen = { ink: ctx.pen.ink, w: 1 };
  for (let x = 160 + ctx.rnd() * 200, k = 0; x < ctx.width; x += 420 + ctx.rnd() * 620, k++) {
    const kind = kinds[k % kinds.length] ?? 'mature';
    const s = kind === 'young' ? 0.18 : 0.12 + ctx.rnd() * 0.04;
    const foot = yAt(band.edge, x) + 6 + ctx.rnd() * 14;
    // D-039 review: keep the sightline to the waterhole (Ver u 0.42–0.56) open at every layout's
    // opening camera, flocks wandering included — no far tree between u 0.34 and 0.72.
    if (x > ctx.u(0.34) && x < ctx.u(0.72)) continue;
    parts.push(
      flat(ellipseD(x + 50 * s, foot, 150 * s, 12 * s), mix(ctx.c('saltCrack'), '#8A7E6C', 0.3), {
        opacity: 0.35,
      }),
      farCamelthorn(ctx, kind, x, foot, s, pen),
    );
  }
  // v1.6 (D-042): a few far quiver trees on the pan edge (outside the waterhole sightline).
  for (const u of [0.12, 0.27, 0.8, 0.93]) {
    const x = ctx.u(u) + (ctx.rnd() - 0.5) * 60;
    parts.push(
      layerQuiver(ctx, x, yAt(band.edge, x) + 10 + ctx.rnd() * 10, 34 + ctx.rnd() * 10, 0.5),
    );
  }
  return g({}, ...parts);
}

/**
 * v1.7d (D-059): the colours of the Namib ground on one plane — straw-gold bushman grass with
 * silvery plumes, red sand, grey gravel — from this layer's (hazed) palette. `cool` pushes the
 * sand paler and cooler (aerial perspective, a haze tint, never alpha).
 */
function namibLook(ctx: PaintCtx, cool = 0): NamibLook {
  const haze = mix(ctx.raw('horizon'), '#C9D2DA', 0.35);
  const c = (n: string): string => mix(ctx.c(n), haze, cool);
  const straw = mix(c('straw'), c('grass'), 0.5);
  return {
    grassBase: mix(straw, '#6E5434', 0.5),
    grass: straw,
    grassLit: mix(c('grassPale'), '#FFFDF2', 0.3),
    grassEdge: mix(straw, '#5A3E22', 0.55),
    plume: mix(c('seed'), '#E6E8EC', 0.35),
    sandDark: mix(c('sandDark'), '#7A3020', 0.2),
    sand: c('sand'),
    sandLit: mix(c('sandLight'), '#FFE6C8', 0.25),
    gravel: mix(c('stone'), c('sandDark'), 0.35),
    pebble: c('stone'),
    shrub: mix('#A3A374', c('bossieGrey'), 0.45),
    wood: mix(c('deadwood'), '#8A8078', 0.3),
    shadow: '#4A2418',
  };
}

/** The pan-edge (calcrete) colours of the mid plane, in the same NamibLook shape. */
function calcreteLook(ctx: PaintCtx): NamibLook {
  const base = namibLook(ctx, 0.12);
  return {
    ...base,
    sandDark: mix(ctx.c('calcreteDark'), ctx.c('sandDark'), 0.25),
    sand: ctx.c('calcrete'),
    sandLit: mix(ctx.c('saltBright'), ctx.c('calcrete'), 0.3),
    shadow: '#5A4636',
  };
}

function mid(ctx: LayerCtx): string {
  // v1.7d (D-059): the pan edge — calcrete running into pale red sand, with gravel plains, fine
  // grain and ripples, sparse small bushman grass and dollar bush; a lit edge instead of ink.
  const band = groundBand(ctx, 664, 4, 150, mix(ctx.c('salt'), ctx.c('calcrete'), 0.5));
  const cal = calcreteLook(ctx);
  const sandy = namibLook(ctx, 0.3);
  const w = ctx.width;
  const inside: string[] = [
    sandGradient(-40, w + 40, 650, ctx.bottom + 10, [
      [0, mix(ctx.c('salt'), ctx.c('calcrete'), 0.5)],
      [0.12, ctx.c('calcrete')],
      [0.5, mix(ctx.c('calcrete'), ctx.c('sandLight'), 0.4)],
      [1, mix(ctx.c('calcrete'), ctx.c('sandLight'), 0.75)],
    ]),
    sandTexture(ctx.rnd, -20, w + 20, 668, ctx.bottom, cal, 0.42),
  ];
  // Salt patches running out into the calcrete (soft-edged).
  const blur = softBlur(2);
  let salt = '';
  for (let k = 0; k < w / 90; k++) {
    const x = ctx.rnd() * w;
    const y = 676 + Math.pow(ctx.rnd(), 1.6) * 120;
    salt += ellipseD(x, y, 30 + ctx.rnd() * 110, 2 + ctx.rnd() * 5);
  }
  inside.push(
    el('defs', {}, blur.def),
    flat(salt, ctx.c('salt'), { opacity: 0.5, filter: `url(#${blur.id})` }),
  );
  // Gravel plains: grey pebble patches, a quartz one now and then.
  for (let x = ctx.rnd() * 300; x < w; x += 260 + ctx.rnd() * 520) {
    const y = 690 + Math.pow(ctx.rnd(), 0.8) * 200;
    const t = (y - 680) / 220;
    inside.push(
      gravelPatch(ctx.rnd, x, y, 40 + t * 60 + ctx.rnd() * 40, 4 + t * 7, cal, ctx.rnd() < 0.18),
    );
  }
  // Tracks across the pan edge.
  for (let k = 0; k < w / 1400; k++)
    inside.push(
      tracks(ctx.rnd, ctx.rnd() * w, 720 + ctx.rnd() * 160, 120 + ctx.rnd() * 160, 1.6, cal),
    );
  const items: { y: number; svg: string }[] = clumpField(ctx.rnd, {
    x0: 0,
    x1: w,
    y0: 676,
    y1: 905,
    h: [7, 26],
    gap: 46,
    draw: (x, y, h) =>
      ctx.rnd() < 0.35
        ? veldSprite(ctx.rnd, 'mid', 'tuft', x, y, h * 0.55)
        : veldSprite(ctx.rnd, 'mid', 'grass', x, y, h),
    look: sandy,
  });
  for (let x = 30 + ctx.rnd() * 200; x < w; x += 140 + ctx.rnd() * 380) {
    const y = 684 + Math.pow(ctx.rnd(), 0.9) * 215;
    const t = (y - 680) / 225;
    if (ctx.rnd() < 0.25)
      items.push({ y, svg: veldSprite(ctx.rnd, 'mid', 'branch', x, y, 10 + t * 26) });
    else
      items.push({
        y,
        svg: veldSprite(ctx.rnd, 'mid', 'dollar', x, y, 3 + t * 9 + ctx.rnd() * 3),
      });
  }
  items.sort((a, b) => a.y - b.y);
  inside.push(...items.map((i) => i.svg));
  // Grass breaking over the edge: small clumps standing right on it.
  const edgeGrass: string[] = [];
  for (let x = ctx.rnd() * 80; x < w; x += 30 + ctx.rnd() * 160) {
    const y = yAt(band.edge, x) + 1.5 + ctx.rnd() * 2;
    edgeGrass.push(veldSprite(ctx.rnd, 'mid', 'grass', x, y, 5 + ctx.rnd() * 9));
  }
  // v1.6 (D-042): quiver trees in winter flower on the calcrete edge (clear of the props and
  // of the waterhole sightline in the middle).
  const trees: string[] = [];
  for (const [u, h] of [
    [0.13, 150],
    [0.785, 165],
    [0.975, 140],
  ] as const) {
    const x = ctx.u(u);
    trees.push(layerQuiver(ctx, x, yAt(band.edge, x) + 44, h, 0.6));
  }
  return g(
    {},
    band.svg,
    g({ 'clip-path': `url(#${band.clip})` }, ...inside),
    sandRidge(band.edge, cal, 0.42),
    ...edgeGrass,
    ...trees,
  );
}

function near(ctx: LayerCtx): string {
  // v1.7d (D-059): the red dune edge — Namib sand with soft undulations, wind ripples, fine
  // grain, gravel and a quartz patch, tracks, dead branches, dollar bush and bushman grass from
  // small tufts to big clumps; a lit sand ridge with grass over it instead of the inked seam.
  const band = groundBand(ctx, 848, 9, 120, mix(ctx.c('sandLight'), ctx.c('sand'), 0.5));
  const look = namibLook(ctx);
  const w = ctx.width;
  const inside: string[] = [
    sandGradient(-40, w + 40, 830, ctx.bottom + 10, [
      [0, mix(ctx.c('sandLight'), ctx.raw('horizon'), 0.3)],
      [0.1, ctx.c('sandLight')],
      [0.4, ctx.c('sand')],
      [1, mix(ctx.c('sand'), ctx.c('sandDark'), 0.6)],
    ]),
    sandTexture(ctx.rnd, -20, w + 20, 852, ctx.bottom, look, 1),
  ];
  // Gravel plains and one quartz-pebble patch per screen or so.
  for (let x = 120 + ctx.rnd() * 300; x < w; x += 420 + ctx.rnd() * 700) {
    const y = 880 + ctx.rnd() * 170;
    inside.push(
      gravelPatch(ctx.rnd, x, y, 70 + ctx.rnd() * 90, 8 + ctx.rnd() * 8, look, ctx.rnd() < 0.3),
    );
  }
  for (let k = 0; k < w / 900; k++)
    inside.push(
      tracks(ctx.rnd, ctx.rnd() * w, 875 + ctx.rnd() * 190, 160 + ctx.rnd() * 220, 3.2, look),
    );
  // A calmer band where the pop-ups rise (y 905–965): small tufts only there.
  const items: { y: number; svg: string }[] = clumpField(ctx.rnd, {
    x0: 0,
    x1: w,
    y0: 858,
    y1: 1078,
    h: [26, 72],
    gap: 80,
    draw: (x, y, h) => {
      const r = ctx.rnd();
      const kind = r < 0.12 && h > 30 ? 'dry' : r < 0.4 ? 'tuft' : 'grass';
      return veldSprite(ctx.rnd, 'near', kind, x, y, kind === 'tuft' ? h * 0.55 : h);
    },
    look,
    avoid: (_x, y) => y > 905 && y < 965 && ctx.rnd() < 0.7,
  });
  for (let x = 200 + ctx.rnd() * 300; x < w; x += 380 + ctx.rnd() * 600) {
    const y = ctx.rnd() < 0.5 ? 875 + ctx.rnd() * 25 : 970 + ctx.rnd() * 90;
    if (ctx.rnd() < 0.35)
      items.push({
        y,
        svg: veldSprite(ctx.rnd, 'near', 'branch', x, y, 50 + ctx.rnd() * 60),
      });
    else
      items.push({
        y,
        svg: veldSprite(ctx.rnd, 'near', 'dollar', x, y, 16 + ctx.rnd() * 14),
      });
  }
  // v1.6 (D-042): !nara hummocks with their melons on the red dune edge (clear of the band
  // where the pop-ups rise).
  for (let x = 260 + ctx.rnd() * 300; x < w; x += 700 + ctx.rnd() * 700) {
    const y = ctx.rnd() < 0.5 ? 880 + ctx.rnd() * 20 : 975 + ctx.rnd() * 70;
    items.push({ y, svg: naraHummock(ctx, x, y, 48 + ((y - 870) / 200) * 30) });
  }
  items.sort((a, b) => a.y - b.y);
  inside.push(...items.map((i) => i.svg));
  const edgeGrass: string[] = [];
  for (let x = ctx.rnd() * 120; x < w; x += 60 + ctx.rnd() * 260) {
    const y = yAt(band.edge, x) + 3 + ctx.rnd() * 4;
    edgeGrass.push(veldSprite(ctx.rnd, 'near', 'grass', x, y, 12 + ctx.rnd() * 22));
  }
  return g(
    {},
    band.svg,
    g({ 'clip-path': `url(#${band.clip})` }, ...inside),
    sandRidge(band.edge, look, 1),
    ...edgeGrass,
  );
}

function foreground(ctx: LayerCtx): string {
  // v1.7d (D-059): big bushman-grass clumps at the screen's foot (no ink), a boulder now and then.
  const pen = ctx.pen;
  const parts: string[] = [];
  const avoid = [ctx.u(0.05), ctx.u(0.93)];
  for (let x = 160 + ctx.rnd() * 200; x < ctx.width; x += 500 + ctx.rnd() * 800) {
    if (avoid.some((a) => Math.abs(a - x) < 320)) continue;
    if (ctx.rnd() < 0.35)
      // v1.6 (D-042): weathered boulders like the Bushveld's, in this biome's rock.
      parts.push(
        boulder(
          ctx.rnd,
          x,
          1092,
          120 + ctx.rnd() * 50,
          70 + ctx.rnd() * 26,
          graniteLook(ctx.tint, pen, ctx.c('grass'), '#B0A090'),
          pen,
        ),
      );
    const n = 2 + Math.floor(ctx.rnd() * 3);
    for (let k = 0; k < n; k++) {
      const tx = x + (ctx.rnd() - 0.5) * 240;
      const h = 70 + Math.pow(ctx.rnd(), 1.5) * 130;
      parts.push(veldSprite(ctx.rnd, 'foreground', 'grass', tx, 1086 + ctx.rnd() * 8, h));
    }
  }
  return g({}, ...parts);
}

// --- props ---------------------------------------------------------------------------------

/** The family-nest camelthorn: the approved Kalahari tree at 1.8× (content geometry is 1.8×). */
/** v1.7d (D-059): bushman grass (no ink) at a camelthorn's foot. */
function namibTuft(ctx: PaintCtx): (rnd: Rnd, x: number, y: number, h: number) => string {
  const look = namibLook(ctx);
  return (rnd, x, y, h) => bushmanClump(rnd, x, y, h * 0.8, look, { spread: 0.8 });
}

function nestCamelthorn(ctx: PropCtx): string {
  return g(
    { transform: 'scale(1.8)' },
    camelthornTree(
      ctx.rnd,
      { ...nestTreeSpec(), tuft: namibTuft(ctx) },
      camelthornLook(ctx.c, ctx.pen),
      ctx.pen,
    ).svg,
  );
}

function camelthornProp(kind: Exclude<CamelthornVariant, 'nest'>, k: number, lean: number) {
  return (ctx: PropCtx): string =>
    camelthornTree(
      ctx.rnd,
      { ...camelthornSpec(kind, 0, 0, k, lean), tuft: namibTuft(ctx) },
      camelthornLook(ctx.c, ctx.pen),
      ctx.pen,
    ).svg;
}

interface Branch {
  readonly a: Pt;
  readonly b: Pt;
  readonly c: Pt;
  readonly w0: number;
  readonly w1: number;
}

/** The forked skeleton of a quiver tree: each limb splits in two, `levels` times. */
function quiverSkeleton(
  rnd: Rnd,
  from: Pt,
  deg: number,
  len: number,
  w: number,
  levels: number,
  out: Branch[],
  tips: Pt[],
): void {
  const rad = (deg * Math.PI) / 180;
  const b: Pt = [from[0] + Math.sin(rad) * len, from[1] - Math.cos(rad) * len];
  // A gentle upward bow: the control point sits a little outside and below the chord.
  const c: Pt = [
    from[0] + Math.sin(rad) * len * 0.55 + Math.sign(deg) * len * 0.08,
    from[1] - Math.cos(rad) * len * 0.4,
  ];
  const w1 = w * 0.72;
  out.push({ a: from, b, c, w0: w, w1 });
  if (levels <= 0) {
    tips.push(b);
    return;
  }
  const spread = 17 + rnd() * 12;
  // Branches turn back toward the vertical as they fork, so the crown stays a rounded dome.
  const pull = deg * 0.35;
  for (const s of [-1, 1]) {
    const nd = deg - pull + s * spread * (0.8 + rnd() * 0.4);
    quiverSkeleton(rnd, b, nd, len * (0.72 + rnd() * 0.1), w1, levels - 1, out, tips);
  }
}

/** A rosette of blue-grey succulent leaves at a branch tip, splayed upward and outward. */
function rosette(rnd: Rnd, x: number, y: number, r: number, ctx: PaintCtx, pen: Pen): string {
  const leaf = ctx.c('quiverLeaf');
  const dark = ctx.c('quiverLeafDark');
  const back: string[] = [];
  const front: string[] = [];
  const n = 13 + Math.floor(rnd() * 5);
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1);
    // −100° … +100° from straight up, the side leaves drooping a little.
    const deg = -100 + f * 200 + (rnd() - 0.5) * 12;
    const rad = (deg * Math.PI) / 180;
    const len = r * (0.75 + rnd() * 0.35) * (1 - Math.abs(f - 0.5) * 0.3);
    const wid = r * 0.16;
    const tx = x + Math.sin(rad) * len;
    const ty = y - Math.cos(rad) * len * 0.8 + Math.abs(Math.sin(rad)) * r * 0.18;
    const nx = Math.cos(rad) * wid;
    const ny = Math.sin(rad) * wid;
    const d = `M${r2(x - nx)} ${r2(y - ny * 0.6)}Q${r2((x + tx) / 2 - nx * 1.1)} ${r2(
      (y + ty) / 2 - ny,
    )} ${r2(tx)} ${r2(ty)}Q${r2((x + tx) / 2 + nx * 1.1)} ${r2((y + ty) / 2 + ny)} ${r2(
      x + nx,
    )} ${r2(y + ny * 0.6)}Z`;
    (k % 2 === 0 ? back : front).push(d);
  }
  const all = back.join('') + front.join('');
  return g(
    {},
    el('path', {
      d: all,
      fill: pen.ink,
      stroke: pen.ink,
      'stroke-width': pen.w * 0.9,
      'stroke-linejoin': 'round',
    }),
    el('path', { d: back.join(''), fill: shade(dark, -0.05) }),
    el('path', { d: front.join(''), fill: leaf }),
    // Lit upper-left leaves.
    flat(ellipseD(x - r * 0.3, y - r * 0.45, r * 0.32, r * 0.18), shade(leaf, 0.35), {
      opacity: 0.6,
    }),
    el('path', {
      d: front.join(''),
      fill: 'none',
      stroke: mix(pen.ink, dark, 0.4),
      'stroke-width': Math.max(0.4, pen.w * 0.25),
    }),
  );
}

/** A quiver tree's flower spike: a stalk forking into 2–3 short yellow racemes. */
function quiverFlowers(
  rnd: Rnd,
  x: number,
  y: number,
  h: number,
  pen: Pen,
): { svg: string; hi: string } {
  const stems: string[] = [];
  const racemes: { x: number; y: number; h: number }[] = [];
  const stalk = '#9A8A50';
  const yellow = '#F2C632';
  const dark = '#C08A1C';
  const parts: string[] = [];
  const n = 2 + Math.floor(rnd() * 2);
  const fork: Pt = [x + (rnd() - 0.5) * 2, y - h * 0.4];
  stems.push(`M${r2(x)} ${r2(y)}L${r2(fork[0])} ${r2(fork[1])}`);
  parts.push(
    el('path', {
      d: `M${r2(x)} ${r2(y)}L${r2(fork[0])} ${r2(fork[1])}`,
      stroke: stalk,
      'stroke-width': 1.4,
      fill: 'none',
    }),
  );
  for (let k = 0; k < n; k++) {
    const f = n === 1 ? 0 : k / (n - 1) - 0.5;
    const bx = fork[0] + f * h * 0.6;
    const by = fork[1] - h * (0.2 + rnd() * 0.1);
    stems.push(`M${r2(fork[0])} ${r2(fork[1])}Q${r2(bx)} ${r2(fork[1])} ${r2(bx)} ${r2(by)}`);
    parts.push(
      el('path', {
        d: `M${r2(fork[0])} ${r2(fork[1])}Q${r2(bx)} ${r2(fork[1])} ${r2(bx)} ${r2(by)}`,
        stroke: stalk,
        'stroke-width': 1.1,
        fill: 'none',
      }),
    );
    // The raceme: a short cylinder of tubular flowers, darker underneath.
    const rh = h * (0.32 + rnd() * 0.1);
    const rw = 2.4;
    racemes.push({ x: bx, y: by, h: rh });
    parts.push(
      el('path', {
        d: `M${r2(bx)} ${r2(by)}L${r2(bx)} ${r2(by - rh)}`,
        stroke: mix(pen.ink, dark, 0.5),
        'stroke-width': rw * 2 + 1,
        'stroke-linecap': 'round',
      }),
      el('path', {
        d: `M${r2(bx)} ${r2(by)}L${r2(bx)} ${r2(by - rh)}`,
        stroke: yellow,
        'stroke-width': rw * 2,
        'stroke-linecap': 'round',
      }),
      el('path', {
        d: `M${r2(bx + rw * 0.5)} ${r2(by)}L${r2(bx + rw * 0.5)} ${r2(by - rh)}`,
        stroke: dark,
        'stroke-width': rw * 0.8,
        'stroke-linecap': 'round',
        opacity: 0.7,
      }),
      el('path', {
        d: Array.from({ length: 4 }, (_, i) => {
          const yy = by - rh * (0.15 + i * 0.22);
          return `M${r2(bx - rw)} ${r2(yy)}l${r2(-1.2)} 1.6M${r2(bx + rw)} ${r2(yy)}l1.2 1.6`;
        }).join(''),
        stroke: yellow,
        'stroke-width': 0.9,
        'stroke-linecap': 'round',
      }),
    );
  }
  return { svg: g({}, ...parts), hi: quiverSpikeHi(stems, racemes, pen.ink) };
}

/**
 * v1.6 (D-042): a !nara hummock (Acanthosicyos horridus) on the dune sand: a mound of tangled
 * leafless green-grey stems with paired spines, sand banked against it, and a few round spiny
 * melons, green to yellow.
 */
function naraHummock(ctx: PaintCtx, x: number, y: number, s: number): string {
  const rnd = ctx.rnd;
  const stem = mix('#7E9A5A', ctx.c('greyGreen'), 0.4);
  const ramp = [shade(stem, -0.4), shade(stem, -0.2), stem, shade(stem, 0.2), shade(stem, 0.38)];
  const parts: string[] = [
    // Sand piled under and round it, and its shadow.
    el('path', {
      d: ellipseD(x + s * 0.15, y + 1, s * 1.35, s * 0.16),
      fill: '#2A1A14',
      opacity: 0.25,
    }),
    el('path', {
      d: `M${r2(x - s * 1.3)} ${r2(y + 1)}Q${r2(x - s * 0.4)} ${r2(y - s * 0.32)} ${r2(x + s * 0.2)} ${r2(y - s * 0.28)}Q${r2(x + s * 0.9)} ${r2(y - s * 0.2)} ${r2(x + s * 1.3)} ${r2(y + 1)}Z`,
      fill: shade(ctx.c('sandLight'), 0.08),
    }),
  ];
  // Tangled stems: many short zig-zag strokes over a dome, darker at the base, lit on top.
  const bin = new StrokeBin();
  const n = Math.round(s * 14);
  for (let k = 0; k < n; k++) {
    const u = rnd() * 2 - 1;
    const top = y - s * 0.75 * Math.sqrt(Math.max(0, 1 - u * u)) - s * 0.15;
    const px = x + u * s * 1.05;
    const py = top + (y - s * 0.12 - top) * Math.pow(rnd(), 0.7);
    const v = (py - top) / Math.max(1, y - top);
    const lum = 1 - v * 1.6 - u * 0.35 + (rnd() - 0.5) * 0.6;
    const c = ramp[Math.max(0, Math.min(4, Math.round(2 + lum * 1.4)))] as string;
    const ang = -Math.PI / 2 + (rnd() - 0.5) * 2.6;
    const len = s * (0.12 + rnd() * 0.16);
    const pts = zigzag(
      rnd,
      [px, py],
      [px + Math.cos(ang) * len, py + Math.sin(ang) * len],
      2,
      0.25,
    );
    bin.add(c, Math.max(0.8, s * 0.035), `M${pts.map((p) => `${r2(p[0])} ${r2(p[1])}`).join('L')}`);
  }
  parts.push(bin.svg(ramp));
  // Spines: pale paired ticks on the upper stems.
  let spines = '';
  for (let k = 0; k < Math.round(s * 1.2); k++) {
    const u = rnd() * 2 - 1;
    const px = x + u * s;
    const py = y - s * 0.7 * Math.sqrt(Math.max(0, 1 - u * u)) * (0.6 + rnd() * 0.4) - s * 0.1;
    spines += `M${r2(px)} ${r2(py)}l${r2(-s * 0.04)} ${r2(-s * 0.05)}M${r2(px)} ${r2(py)}l${r2(s * 0.04)} ${r2(-s * 0.05)}`;
  }
  parts.push(
    el('path', {
      d: spines,
      stroke: '#E8E2C8',
      'stroke-width': Math.max(0.5, s * 0.012),
      fill: 'none',
    }),
  );
  // Melons: round, warty, green with paler bands; one ripening yellow.
  const m = 2 + Math.floor(rnd() * 3);
  for (let k = 0; k < m; k++) {
    const mx = x + (rnd() - 0.5) * s * 1.6;
    const my = y - s * 0.06 - rnd() * s * 0.2;
    const r = s * (0.14 + rnd() * 0.04);
    const ripe = k === 0 && rnd() < 0.6;
    let warts = '';
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * r * 0.8;
      warts += ellipseD(mx + Math.cos(a) * rr, my + Math.sin(a) * rr * 0.9, r * 0.09, r * 0.09);
    }
    // v1.7c (D-047): each melon rocks when shot.
    parts.push(
      fruit({
        species: 'nara',
        motion: 'ground',
        x: mx,
        y: my + r * 0.92,
        ground: my + r * 0.92,
        reach: r * 2 + 3,
        svg: g(
          {},
          roundFruit(mx, my, r, ripe ? '#D9B23A' : '#8DA84A'),
          el('path', { d: warts, fill: ripe ? '#8A6A1E' : '#4E6A2A', opacity: 0.8 }),
        ),
        hi: () => ({
          body: roundHi(mx, my, r, ripe ? '#D9B23A' : '#8DA84A', {
            warts: ripe ? '#8A6A1E' : '#4E6A2A',
          }),
        }),
      }),
    );
  }
  return g({}, ...parts);
}

/** A quiver tree standing on a layer: drawn at its foot (x, foot), `k` × its prop size. */
function layerQuiver(ctx: PaintCtx, x: number, foot: number, h: number, flowers: number): string {
  const k = h / 200;
  // v1.7c (D-047): its flower spikes are fruit sprites, placed the way the tree is.
  const t = placedFruit(Number(r2(x)), Number(r2(foot)), Number(r2(k)), () =>
    quiverTree(ctx, 200, {
      lean: (ctx.rnd() - 0.5) * 8,
      levels: ctx.rnd() < 0.5 ? 3 : 4,
      crown: 0.9 + ctx.rnd() * 0.25,
      flowers,
    }),
  );
  return g({ transform: `translate(${r2(x)} ${r2(foot)}) scale(${r2(k)})` }, t.svg);
}

/** A quiver tree with its foot at (0, 0), `h` tall. Returns the art and its limbs. */
function quiverTree(
  ctx: PaintCtx,
  h: number,
  o: {
    readonly lean: number;
    readonly levels: number;
    readonly crown: number;
    /** v1.6 (D-042): share of the rosettes in winter flower (0 … 1). */
    readonly flowers?: number;
  },
): { svg: string; limbs: Branch[] } {
  const pen: Pen = { ink: ctx.pen.ink, w: Math.min(ctx.pen.w, 2.2) };
  const rnd = ctx.rnd;
  const bark = ctx.c('quiverBark');
  const barkDark = ctx.c('quiverBarkDark');
  const skin = ctx.c('quiverSkin');
  const forkY = -h * 0.46;
  const fork: Pt = [o.lean, forkY];
  const limbs: Branch[] = [];
  const tips: Pt[] = [];
  const firstLen = (h + forkY) * 0.3 * o.crown;
  for (const s of [-1, 1]) {
    quiverSkeleton(
      rnd,
      fork,
      s * (26 + rnd() * 10),
      firstLen * (0.9 + rnd() * 0.2),
      12,
      o.levels,
      limbs,
      tips,
    );
  }
  // An odd third limb out of the fork, as old trees have.
  quiverSkeleton(
    rnd,
    [o.lean, forkY + 6],
    -4 + rnd() * 8,
    firstLen * 0.9,
    9,
    o.levels - 1,
    limbs,
    tips,
  );
  const parts: string[] = [];
  // Ground: shade, a few pebbles and blonde tufts.
  parts.push(groundShadow(16, 2, 46, 7));
  // Trunk: a stout tapering cone, flared at the foot, pale golden with papery plates.
  const tw0 = 20;
  const tw1 = 11;
  const trunkD = smoothD(
    [
      [-tw0 - 5, 2],
      [-tw0 + 1, -6],
      [-tw0 + 3, forkY * 0.4],
      [-tw1 + o.lean * 0.7, forkY * 0.85],
      [-tw1 * 0.8 + o.lean, forkY - 4],
      [tw1 * 0.8 + o.lean, forkY - 4],
      [tw1 + o.lean * 0.7, forkY * 0.85],
      [tw0 - 3, forkY * 0.4],
      [tw0 - 1, -6],
      [tw0 + 6, 2],
    ],
    true,
    0.55,
  );
  const tg = nextId();
  const tclip = nextId();
  parts.push(
    el(
      'linearGradient',
      { id: tg, x1: 0, y1: 0, x2: 1, y2: 0 },
      el('stop', { offset: 0, 'stop-color': shade(bark, 0.35) }),
      el('stop', { offset: 0.35, 'stop-color': bark }),
      el('stop', { offset: 0.75, 'stop-color': shade(bark, -0.2) }),
      el('stop', { offset: 1, 'stop-color': shade(barkDark, -0.1) }),
    ),
  );
  // Limbs behind the trunk top first (the skin is smoother and greyer than the trunk).
  const limbArt = (b: Branch): string => {
    const d = `M${r2(b.a[0])} ${r2(b.a[1])}Q${r2(b.c[0])} ${r2(b.c[1])} ${r2(b.b[0])} ${r2(b.b[1])}`;
    const w = (b.w0 + b.w1) / 2;
    return g(
      {},
      el('path', {
        d,
        fill: 'none',
        stroke: pen.ink,
        'stroke-width': w + pen.w * 0.9,
        'stroke-linecap': 'round',
      }),
      el('path', {
        d,
        fill: 'none',
        stroke: mix(skin, bark, 0.35),
        'stroke-width': w,
        'stroke-linecap': 'round',
      }),
      el('path', {
        d,
        fill: 'none',
        stroke: shade(skin, 0.35),
        'stroke-width': w * 0.32,
        'stroke-linecap': 'round',
        transform: `translate(${r2(-w * 0.22)} 0)`,
        opacity: 0.8,
      }),
    );
  };
  // Draw thick limbs first so the thin ones sit over the forks.
  const sorted = [...limbs].sort((p, q) => q.w0 - p.w0);
  parts.push(...sorted.map(limbArt));
  parts.push(
    el('clipPath', { id: tclip }, el('path', { d: trunkD })),
    el('path', { d: trunkD, fill: `url(#${tg})` }),
  );
  // Papery bark: overlapping golden plates curling at their edges, darker cracks between.
  let plates = '';
  let cracks = '';
  let lit = '';
  for (let k = 0; k < 46; k++) {
    const y = -2 + forkY * rnd();
    const half = tw0 + ((tw1 - tw0) * y) / forkY;
    const x = (rnd() * 2 - 1) * half + (o.lean * y) / forkY;
    const pw = 4 + rnd() * 6;
    const ph = 2 + rnd() * 3;
    plates += `M${r2(x - pw / 2)} ${r2(y)}q${r2(pw / 2)} ${r2(-ph)} ${r2(pw)} 0`;
    if (rnd() < 0.6) cracks += `M${r2(x - pw * 0.4)} ${r2(y + 0.8)}l${r2(pw * 0.8)} ${r2(0.4)}`;
    if (x < 0 && rnd() < 0.6) lit += `M${r2(x - pw * 0.3)} ${r2(y - ph * 0.6)}l${r2(pw * 0.5)} 0`;
  }
  parts.push(
    g(
      { 'clip-path': `url(#${tclip})` },
      el('path', {
        d: cracks,
        fill: 'none',
        stroke: barkDark,
        'stroke-width': 1,
        'stroke-linecap': 'round',
        opacity: 0.7,
      }),
      el('path', {
        d: plates,
        fill: 'none',
        stroke: shade(barkDark, -0.1),
        'stroke-width': 0.8,
        opacity: 0.6,
      }),
      el('path', {
        d: lit,
        fill: 'none',
        stroke: shade(bark, 0.55),
        'stroke-width': 1.1,
        'stroke-linecap': 'round',
        opacity: 0.85,
      }),
      // The shaded right side.
      flat(
        `M${r2(tw0 * 0.35)} 4L${r2(tw1 * 0.3 + o.lean)} ${r2(forkY - 6)}L${r2(40)} ${r2(forkY - 6)}L40 4Z`,
        barkDark,
        { opacity: 0.25 },
      ),
    ),
    el('path', {
      d: trunkD,
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': pen.w * 0.7,
      'stroke-linejoin': 'round',
    }),
  );
  // Rosettes, back to front (higher ones behind).
  const rs = [...tips].sort((p, q) => p[1] - q[1]);
  for (const t of rs) parts.push(rosette(rnd, t[0], t[1], 12 + rnd() * 5, ctx, pen));
  // v1.6 (D-042): winter flowers: short branched spikes of canary-yellow racemes above some
  // rosettes (June–July).
  for (const t of rs)
    if (rnd() < (o.flowers ?? 0)) {
      const spike = quiverFlowers(rnd, t[0], t[1] - 6, 16 + rnd() * 6, pen);
      parts.push(
        fruit({
          species: 'quiver_flower',
          motion: 'stand',
          x: t[0],
          y: t[1] - 6,
          ground: 4,
          reach: 30,
          svg: spike.svg,
          hi: () => ({ body: spike.hi }),
        }),
      );
    }
  // Bushman grass at the foot (v1.7d, D-059: no ink).
  const look = namibLook(ctx);
  for (const [x, hh] of [
    [-30, 22],
    [-14, 15],
    [26, 19],
    [40, 13],
  ] as const)
    parts.push(bushmanClump(rnd, x, 4, hh, look, { spread: 0.8 }));
  return { svg: g({}, ...parts), limbs };
}

function quiverProp(ctx: PropCtx): string {
  return quiverTree(ctx, 205, { lean: -3, levels: 4, crown: 1, flowers: 0.55 }).svg;
}

/** The quiver tree with the ostrich-egg water flask (the secret part at (38, −118), 16 × 20). */
function quiverEgg(ctx: PropCtx): string {
  const tree = quiverTree(ctx, 196, { lean: 4, levels: 4, crown: 1.05, flowers: 0.35 });
  const ex = 38;
  const ey = -118;
  const pen: Pen = { ink: ctx.pen.ink, w: 1.6 };
  // The flask hangs on a cord from the nearest limb point above it.
  let hook: Pt = [ex, ey - 40];
  let best = Infinity;
  for (const l of tree.limbs)
    for (let s = 0; s <= 10; s++) {
      const t = s / 10;
      const x = (1 - t) * (1 - t) * l.a[0] + 2 * (1 - t) * t * l.c[0] + t * t * l.b[0];
      const y = (1 - t) * (1 - t) * l.a[1] + 2 * (1 - t) * t * l.c[1] + t * t * l.b[1];
      if (y > ey - 26) continue;
      const dd = Math.hypot(x - ex, (y - (ey - 34)) * 1.4);
      if (dd < best) {
        best = dd;
        hook = [x, y];
      }
    }
  const leather = ctx.c('leather');
  const egg = ctx.c('egg');
  const eg = nextId();
  const clip = nextId();
  const eggD = smoothD(
    [
      [ex, ey - 20],
      [ex + 12, ey - 14],
      [ex + 16, ey + 1],
      [ex + 12, ey + 15],
      [ex, ey + 20],
      [ex - 12, ey + 15],
      [ex - 16, ey + 1],
      [ex - 12, ey - 14],
    ],
    true,
    0.9,
  );
  return g(
    {},
    tree.svg,
    // The cord: two strands from the hook to the neck.
    line(
      `M${r2(hook[0])} ${r2(hook[1])}L${r2(ex - 4)} ${r2(ey - 19)}M${r2(hook[0])} ${r2(hook[1])}L${r2(ex + 4)} ${r2(ey - 19)}`,
      { ink: shade(leather, -0.35), w: 1.4 },
    ),
    el(
      'radialGradient',
      { id: eg, cx: 0.36, cy: 0.3, r: 0.75 },
      el('stop', { offset: 0, 'stop-color': shade(egg, 0.5) }),
      el('stop', { offset: 0.55, 'stop-color': egg }),
      el('stop', { offset: 1, 'stop-color': shade(egg, -0.28) }),
    ),
    el('clipPath', { id: clip }, el('path', { d: eggD })),
    el('path', { d: eggD, fill: `url(#${eg})` }),
    g(
      { 'clip-path': `url(#${clip})` },
      // Fine shell pores, and the leather sling: a band round the belly and two straps up.
      flat(
        [0, 1, 2, 3, 4, 5, 6, 7, 8]
          .map((k) => ellipseD(ex - 8 + (k % 3) * 7, ey - 6 + Math.floor(k / 3) * 9, 0.6, 0.5))
          .join(''),
        shade(egg, -0.25),
        { opacity: 0.6 },
      ),
      flat(
        `M${ex - 17} ${ey + 2}Q${ex} ${ey + 7} ${ex + 17} ${ey + 2}L${ex + 17} ${ey + 7}Q${ex} ${ey + 12} ${ex - 17} ${ey + 7}Z`,
        leather,
      ),
      flat(
        `M${ex - 17} ${ey + 2}Q${ex} ${ey + 7} ${ex + 17} ${ey + 2}L${ex + 17} ${ey + 3.4}Q${ex} ${ey + 8.4} ${ex - 17} ${ey + 3.4}Z`,
        shade(leather, 0.3),
      ),
      line(`M${ex - 7} ${ey + 5}L${ex - 4} ${ey - 19}M${ex + 7} ${ey + 5}L${ex + 4} ${ey - 19}`, {
        ink: leather,
        w: 2,
      }),
    ),
    el('path', {
      d: eggD,
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': 1.1,
      'stroke-linejoin': 'round',
    }),
    // The plug in the neck: a little grass-and-wax stopper.
    inked(ellipseD(ex, ey - 19.5, 3.4, 1.8), mix(leather, '#3A2A1A', 0.3), pen.ink, 0.8),
    // A glint on the shell, upper left.
    flat(ellipseD(ex - 6, ey - 9, 3.5, 2), '#FFFFFF', { opacity: 0.6 }),
  );
}

function panGrass(seed: number) {
  // v1.7d (D-059): a low sand mound held by bushman grass: big clumps with plumes, no ink.
  return (ctx: PropCtx): string => {
    const look = namibLook(ctx);
    const moundFill = mix(ctx.c('sandLight'), ctx.c('sand'), 0.35);
    const grad = nextId();
    const clip = nextId();
    const mound = smoothD(
      [
        [-150, 130],
        [-122, 100],
        [-44, 86],
        [58, 88],
        [128, 100],
        [150, 130],
      ],
      true,
      0.7,
    );
    const parts: string[] = [
      el(
        'defs',
        {},
        el(
          'linearGradient',
          { id: grad, x1: 0, y1: 84, x2: 0, y2: 132, gradientUnits: 'userSpaceOnUse' },
          el('stop', { offset: 0, 'stop-color': mix(moundFill, '#FFE6C8', 0.3) }),
          el('stop', { offset: 1, 'stop-color': mix(moundFill, ctx.c('sandDark'), 0.5) }),
        ),
      ),
      flat(ellipseD(10, 128, 165, 10), look.shadow, { opacity: 0.25 }),
      flat(mound, `url(#${grad})`),
      // The sand's texture stays on the mound.
      el('clipPath', { id: clip }, el('path', { d: mound })),
      g({ 'clip-path': `url(#${clip})` }, sandTexture(ctx.rnd, -130, 130, 96, 128, look, 0.9)),
    ];
    for (let k = 0; k < 6; k++) {
      const x = -70 + k * 28 + (ctx.rnd() - 0.5) * 12 + (seed % 2) * 6;
      const hh = 95 + ctx.rnd() * 45 - Math.abs(k - 2.5) * 10;
      parts.push(bushmanClump(ctx.rnd, x, 112 + ctx.rnd() * 10, hh, look, { spread: 0.5 }));
    }
    return g({}, ...parts);
  };
}

/** v1.7d (D-059): the colours of the veld sheet (mid-size classes hazed, near ones not). */
export function namibieVeldLooks(cfg: ArtConfig): VeldLooks {
  return {
    far: namibLook(paint(cfg, 'namibie', 'mid', 'namibie/veld'), 0.3),
    near: namibLook(paint(cfg, 'namibie', 'near', 'namibie/veld')),
  };
}

export const NAMIBIE_PLAN: BiomeArtPlan = {
  biome: 'namibie',
  layers: {
    // v1.6 (D-042): a 256-colour sky, as the other biomes'.
    sky: { top: 0, height: 1080, encode: 'png8', draw: sky },
    // v1.6 (D-042): smaller palettes keep the biome chunk inside 1.5 MB.
    far_ridge: { top: 376, height: 214, colours: 96, draw: farRidge },
    ver_veld: { top: 524, height: 64, draw: verStrip },
    far_veld: { top: 464, height: 232, colours: 112, draw: farVeld },
    // v1.7d (D-059): the ink-free Namib ground draws without the hand-drawn wobble.
    mid: { top: 500, height: 410, colours: 128, wobble: false, draw: mid },
    near: { top: 820, height: 260, colours: 128, wobble: false, draw: near },
    foreground: {
      top: 880,
      height: 200,
      fadeTop: 28,
      colours: 128,
      wobble: false,
      draw: foreground,
    },
  },
  props: {
    'namibie/nest_camelthorn': {
      draw: nestCamelthorn,
      master: 1,
      // D-054: 128 colours (no visible change; −40 KB) to make room for the far animals.
      colours: 128,
      wobble: false,
      frame: { w: 1044, h: 1044, ox: 522, oy: 540 },
    },
    'namibie/camelthorn_mature': {
      draw: camelthornProp('mature', 0.6, 10),
      // v1.7d (D-059): 1× in Standard, its 2× twin in the HD pack (room for the veld life).
      master: 1,
      wobble: false,
      frame: { w: 400, h: 296, ox: 196, oy: 258 },
    },
    'namibie/camelthorn_old': {
      draw: camelthornProp('old', 0.6, -8),
      // v1.7d (D-059): 1× in Standard, its 2× twin in the HD pack (room for the veld life).
      master: 1,
      wobble: false,
      frame: { w: 390, h: 296, ox: 195, oy: 258 },
    },
    'namibie/camelthorn_young': {
      draw: camelthornProp('young', 0.72, 6),
      // v1.7d (D-059): 1× in Standard, its 2× twin in the HD pack (room for the veld life).
      master: 1,
      wobble: false,
      // v1.7d (D-059): its occluder reaches 70 px below the foot; at 1× the frame must hold it.
      frame: { w: 230, h: 272, ox: 115, oy: 200 },
    },
    'namibie/quiver_tree': {
      draw: quiverProp,
      // v1.7d (D-059): 1× in Standard, its 2× twin in the HD pack (room for the veld life).
      master: 1,
      wobble: false,
      frame: { w: 240, h: 262, ox: 120, oy: 242 },
    },
    'namibie/quiver_egg': {
      draw: quiverEgg,
      // v1.7d (D-059): 1× in Standard, its 2× twin in the HD pack (room for the veld life).
      master: 1,
      wobble: false,
      frame: { w: 240, h: 254, ox: 116, oy: 234 },
    },
    'namibie/pan_grass_a': { draw: panGrass(1), colours: 64 },
    'namibie/pan_grass_b': { draw: panGrass(2), colours: 64 },
  },
};
