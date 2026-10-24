// v1.4 B (D-039) Namibië — Etosha & Namib (bible §4): a hot pale sky bleaching to white at the
// horizon, low orange-red Namib dunes, the far edge of the pan with a waterhole and its little
// camelthorns (Ver strip), the wide white salt pan (faint polygon cracks, a bright mirage band at
// the horizon; the shimmer itself is animated by the game), a pale calcrete pan edge with sparse
// grass, the red dune edge in front, blonde grass. Props: camelthorns (the approved layered
// trees of tools/art/camelthorn.ts, one with the sociable-weaver family nest), quiver trees
// (Aloidendron dichotomum, one with an ostrich-egg water flask) and grass mounds. Light from the
// upper left, thin soft outlines (D-035).
import type { BiomeArtPlan, LayerCtx, PropCtx } from '../landscape';
import {
  flat,
  groundD,
  line,
  mix,
  nextId,
  shade,
  stone,
  tone,
  yAt,
  type Pen,
  type Pt,
  type Rnd,
} from '../scenery';
import { el, ellipseD, g, inked, r2, smoothD } from '../svg';
import { bush, groundBand, groundShadow, softSky } from './karoo';
import { foregroundClumps, midScrub, nearGrass, verVeld } from './common';
import { tuftOf } from '../vegetation';
import {
  camelthornLook,
  camelthornSpec,
  camelthornTree,
  nestTreeSpec,
  type CamelthornVariant,
} from '../camelthorn';

// --- shapes --------------------------------------------------------------------------------

/**
 * A Namib dune in side view (after the Kalahari one): a long lit windward slope with fine wind
 * ripples up to a sharp brink, the steep slip face in shadow on the right.
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
): string {
  const cx = x + w * (0.56 + rnd() * 0.12);
  const top = base - h;
  const sway = (rnd() - 0.5) * w * 0.05;
  const windward = smoothD(
    [
      [x, base],
      [x + w * 0.2, base - h * 0.2],
      [x + w * 0.4, base - h * 0.55 + (rnd() - 0.5) * h * 0.08],
      [cx - w * 0.08, top + h * 0.06],
      [cx - w * 0.015, top + 1],
      [cx, top],
    ],
    false,
    0.6,
  );
  const leeD = `${windward}C${r2(cx + w * 0.06)} ${r2(top + h * 0.3)} ${r2(cx + w * 0.17)} ${r2(
    top + h * 0.75,
  )} ${r2(x + w)} ${r2(base)}Z`;
  const crestLine = `M${r2(cx)} ${r2(top)}C${r2(cx - w * 0.05 + sway)} ${r2(top + h * 0.3)} ${r2(
    cx + w * 0.03 - sway,
  )} ${r2(top + h * 0.6)} ${r2(cx - w * 0.07)} ${r2(base)}`;
  const litD = `${windward}${crestLine.replace(/^M[^C]+/, '')}L${r2(x)} ${r2(base)}Z`;
  const gLit = nextId();
  const gLee = nextId();
  const clip = nextId();
  const rip: string[] = [];
  const nr = Math.max(2, Math.round(h / 7));
  for (let k = 0; k < nr; k++) {
    const yy = base - (h * (k + 0.5)) / nr;
    const x0 = x + w * 0.05;
    const x1 = cx - w * 0.02;
    const amp = 0.8 + rnd() * 1;
    let d = `M${r2(x0)} ${r2(yy)}`;
    for (let s = 1; s <= 8; s++) {
      const xs = x0 + ((x1 - x0) * s) / 8;
      d += `Q${r2(xs - (x1 - x0) / 16)} ${r2(yy + (s % 2 === 0 ? amp : -amp))} ${r2(xs)} ${r2(yy)}`;
    }
    rip.push(d);
  }
  return g(
    {},
    el(
      'linearGradient',
      { id: gLit, x1: 0, y1: 0, x2: 0.25, y2: 1 },
      el('stop', { offset: 0, 'stop-color': shade(lit, 0.2) }),
      el('stop', { offset: 0.55, 'stop-color': lit }),
      el('stop', { offset: 1, 'stop-color': shade(lit, -0.06) }),
    ),
    el(
      'linearGradient',
      { id: gLee, x1: 0, y1: 0, x2: 0, y2: 1 },
      el('stop', { offset: 0, 'stop-color': shade(lee, -0.18) }),
      el('stop', { offset: 0.6, 'stop-color': lee }),
      el('stop', { offset: 1, 'stop-color': shade(lee, 0.1) }),
    ),
    el('path', { d: leeD, fill: `url(#${gLee})` }),
    el('clipPath', { id: clip }, el('path', { d: litD })),
    el('path', { d: litD, fill: `url(#${gLit})` }),
    el('path', {
      d: rip.join(''),
      fill: 'none',
      stroke: shade(lit, -0.16),
      'stroke-width': 0.7,
      opacity: 0.4,
      'clip-path': `url(#${clip})`,
    }),
    el('path', {
      d: crestLine,
      fill: 'none',
      stroke: shade(lit, 0.3),
      'stroke-width': Math.max(0.8, pen.w * 0.45),
      'stroke-linecap': 'round',
      opacity: 0.75,
    }),
    el('path', {
      d: leeD,
      fill: 'none',
      stroke: mix(pen.ink, lee, 0.6),
      'stroke-width': Math.max(0.6, pen.w * 0.45),
      'stroke-linejoin': 'round',
    }),
  );
}

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

function farRidge(ctx: LayerCtx): string {
  const parts: string[] = [];
  const horizon = ctx.raw('horizon');
  const backPen: Pen = { ink: mix(ctx.pen.ink, horizon, 0.45), w: 1.2 };
  // The back row: the big Namib dunes, very hazy, peaks well above the pan.
  for (let x = -260; x < ctx.width;) {
    const w = 420 + ctx.rnd() * 380;
    parts.push(
      dune(
        ctx.rnd,
        x,
        584,
        w,
        95 + ctx.rnd() * 60,
        mix(ctx.c('duneFar'), horizon, 0.22),
        mix(ctx.c('duneLee'), horizon, 0.3),
        backPen,
      ),
    );
    x += w * (0.38 + ctx.rnd() * 0.22);
  }
  // The front row: lower, redder, sharper.
  for (let x = -120; x < ctx.width;) {
    const w = 280 + ctx.rnd() * 300;
    parts.push(
      dune(ctx.rnd, x, 596, w, 55 + ctx.rnd() * 55, ctx.c('duneLit'), ctx.c('duneLee'), ctx.pen),
    );
    x += w * (0.45 + ctx.rnd() * 0.3);
  }
  // Heat haze rising off the sand at the dunes' foot.
  const haze = nextId();
  parts.push(
    el(
      'linearGradient',
      { id: haze, x1: 0, y1: 0, x2: 0, y2: 1 },
      el('stop', { offset: 0, 'stop-color': horizon, 'stop-opacity': 0 }),
      el('stop', { offset: 1, 'stop-color': horizon, 'stop-opacity': 0.6 }),
    ),
    el('rect', { x: 0, y: 536, width: ctx.width, height: 84, fill: `url(#${haze})` }),
  );
  return g({}, ...parts);
}

function verStrip(ctx: LayerCtx): string {
  const base = verVeld({ ground: 'saltShade', light: 'salt', scrub: 'bossieGrey' })(ctx);
  const parts: string[] = [base];
  const horizon = ctx.raw('horizon');
  // The waterhole: a flat blue-grey sheen with a darker muddy rim, the sky's glare on it.
  const wx = ctx.u(0.5);
  const half = (ctx.u(0.58) - ctx.u(0.42)) * 0.5;
  const mud = mix(ctx.c('calcreteDark'), '#6E5E4C', 0.25);
  parts.push(
    flat(ellipseD(wx, 557.5, half * 0.62, 3.4), mud, { opacity: 0.7 }),
    flat(ellipseD(wx - half * 0.05, 557, half * 0.52, 2.4), ctx.c('water')),
    flat(ellipseD(wx - half * 0.12, 556.4, half * 0.32, 0.9), ctx.c('waterLit'), { opacity: 0.85 }),
    flat(ellipseD(wx + half * 0.3, 557.6, half * 0.14, 0.6), mix(ctx.c('waterLit'), horizon, 0.3)),
  );
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
  const far: { y: number; svg: string }[] = [];
  for (let x = ctx.rnd() * 200; x < ctx.width; x += 90 + ctx.rnd() * 260) {
    const y = 600 + Math.pow(ctx.rnd(), 1.2) * 90;
    far.push({ y, svg: bush(ctx, x, y, 2 + ((y - 600) / 90) * 4, { ink: ctx.pen.ink, w: 0.8 }) });
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
    parts.push(
      flat(ellipseD(x + 50 * s, foot, 150 * s, 12 * s), mix(ctx.c('saltCrack'), '#8A7E6C', 0.3), {
        opacity: 0.35,
      }),
      farCamelthorn(ctx, kind, x, foot, s, pen),
    );
  }
  return g({}, ...parts);
}

function mid(ctx: LayerCtx): string {
  const band = groundBand(ctx, 664, 4, 150, mix(ctx.c('salt'), ctx.c('calcrete'), 0.5));
  const inside: string[] = [
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 700, 10, 170, ctx.bottom + 40), ctx.c('calcrete')),
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 770, 14, 190, ctx.bottom + 40),
      mix(ctx.c('calcrete'), ctx.c('sandLight'), 0.35),
    ),
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 850, 16, 210, ctx.bottom + 40),
      mix(ctx.c('calcrete'), ctx.c('sandLight'), 0.65),
    ),
  ];
  // Salt patches running out into the calcrete, and pale gravel specks.
  for (let k = 0; k < ctx.width / 70; k++) {
    const x = ctx.rnd() * ctx.width;
    const y = 676 + Math.pow(ctx.rnd(), 1.6) * 120;
    inside.push(
      flat(ellipseD(x, y, 30 + ctx.rnd() * 110, 2 + ctx.rnd() * 5), ctx.c('salt'), {
        opacity: 0.55,
      }),
    );
  }
  let specks = '';
  for (let k = 0; k < ctx.width / 10; k++) {
    const x = ctx.rnd() * ctx.width;
    const y = 680 + ctx.rnd() * 225;
    const r = 0.6 + ((y - 680) / 225) * 1.6;
    specks += ellipseD(x, y, r * 1.4, r * 0.7);
  }
  inside.push(flat(specks, ctx.c('calcreteDark'), { opacity: 0.5 }));
  const items = midScrub(ctx, { bushes: 0.28, stone: tone(ctx.c('stone'), 0.25, 0.25) });
  items.sort((a, b) => a.y - b.y);
  inside.push(...items.map((i) => i.svg));
  return g(
    {},
    band.svg,
    g({ 'clip-path': `url(#${band.clip})` }, ...inside),
    line(smoothD(band.edge, false, 0.8), {
      ink: mix(ctx.pen.ink, ctx.c('calcreteDark'), 0.45),
      w: 1.6,
    }),
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

function near(ctx: LayerCtx): string {
  const band = groundBand(ctx, 848, 9, 120, mix(ctx.c('sandLight'), ctx.c('sand'), 0.5));
  const inside: string[] = [
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 878, 10, 200, ctx.bottom + 40), ctx.c('sand')),
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 960, 14, 230, ctx.bottom + 40), ctx.c('sandDark')),
  ];
  inside.push(
    ripples(
      ctx.rnd,
      0,
      ctx.width,
      870,
      1080,
      Math.round(ctx.width / 12),
      shade(ctx.c('sandDark'), -0.2),
      3,
    ),
    ripples(
      ctx.rnd,
      0,
      ctx.width,
      870,
      1080,
      Math.round(ctx.width / 28),
      shade(ctx.c('sand'), 0.25),
      2,
    ),
  );
  const items = nearGrass(ctx, { stone: tone(ctx.c('stone'), 0.25, 0.25), bushes: 0.25 });
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

/** The family-nest camelthorn: the approved Kalahari tree at 1.8× (content geometry is 1.8×). */
function nestCamelthorn(ctx: PropCtx): string {
  return g(
    { transform: 'scale(1.8)' },
    camelthornTree(ctx.rnd, nestTreeSpec(), camelthornLook(ctx.c, ctx.pen), ctx.pen).svg,
  );
}

function camelthornProp(kind: Exclude<CamelthornVariant, 'nest'>, k: number, lean: number) {
  return (ctx: PropCtx): string =>
    camelthornTree(
      ctx.rnd,
      camelthornSpec(kind, 0, 0, k, lean),
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
function rosette(rnd: Rnd, x: number, y: number, r: number, ctx: PropCtx, pen: Pen): string {
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

/** A quiver tree with its foot at (0, 0), `h` tall. Returns the art and its limbs. */
function quiverTree(
  ctx: PropCtx,
  h: number,
  o: { readonly lean: number; readonly levels: number; readonly crown: number },
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
  // Blonde tufts at the foot.
  const a = tone(ctx.c('grass'), 0.22, 0.25);
  const b = tone(ctx.c('grassPale'), 0.22, 0.2);
  for (const [x, hh, t] of [
    [-30, 22, a],
    [-18, 16, b],
    [26, 20, b],
    [38, 14, a],
  ] as const)
    parts.push(tuftOf('fan', rnd, x, 4, hh, t, { ink: pen.ink, w: 1.4 }, ctx.c('seed')));
  return { svg: g({}, ...parts), limbs };
}

function quiverProp(ctx: PropCtx): string {
  return quiverTree(ctx, 205, { lean: -3, levels: 4, crown: 1 }).svg;
}

/** The quiver tree with the ostrich-egg water flask (the secret part at (38, −118), 16 × 20). */
function quiverEgg(ctx: PropCtx): string {
  const tree = quiverTree(ctx, 196, { lean: 4, levels: 4, crown: 1.05 });
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
  return (ctx: PropCtx): string => {
    const pen = ctx.pen;
    const mound = mix(ctx.c('calcrete'), ctx.c('sandLight'), 0.45);
    const parts: string[] = [
      inked(
        smoothD(
          [
            [-150, 130],
            [-122, 98],
            [-44, 84],
            [58, 86],
            [128, 98],
            [150, 130],
          ],
          true,
          0.7,
        ),
        mound,
        pen.ink,
        pen.w * 0.8,
      ),
      flat(ellipseD(-50, 98, 60, 8), shade(mound, 0.3), { opacity: 0.7 }),
      flat(ellipseD(70, 112, 70, 10), shade(mound, -0.18), { opacity: 0.6 }),
    ];
    const a = tone(ctx.c('grass'), 0.22, 0.25);
    const b = tone(ctx.c('grassPale'), 0.22, 0.2);
    for (let k = 0; k < 7; k++) {
      const x = -96 + k * 32 + (ctx.rnd() - 0.5) * 12;
      const hh = 125 + ctx.rnd() * 60 - Math.abs(k - 3) * 16;
      parts.push(
        tuftOf(
          k % 3 === seed % 3 ? 'upright' : 'fan',
          ctx.rnd,
          x,
          118,
          hh,
          k % 2 === seed % 2 ? a : b,
          pen,
          ctx.c('seed'),
        ),
      );
    }
    for (let k = 0; k < 6; k++) {
      const x = -90 + k * 36 + (ctx.rnd() - 0.5) * 20;
      const top = -60 - ctx.rnd() * 110;
      parts.push(line(`M${r2(x)} 60Q${r2(x - 6)} ${r2(top + 40)} ${r2(x + 4)} ${r2(top)}`, pen, 3));
      parts.push(inked(ellipseD(x + 4, top + 10, 7, 18), ctx.c('seed'), pen.ink, 2));
    }
    return g({}, ...parts);
  };
}

export const NAMIBIE_PLAN: BiomeArtPlan = {
  biome: 'namibie',
  layers: {
    sky: { top: 0, height: 1080, encode: 'png', draw: sky },
    far_ridge: { top: 420, height: 200, draw: farRidge },
    ver_veld: { top: 524, height: 64, draw: verStrip },
    far_veld: { top: 464, height: 232, draw: farVeld },
    mid: { top: 630, height: 280, draw: mid },
    near: { top: 820, height: 260, draw: near },
    foreground: { top: 880, height: 200, fadeTop: 28, draw: foreground },
  },
  props: {
    'namibie/nest_camelthorn': {
      draw: nestCamelthorn,
      master: 1,
      wobble: false,
      frame: { w: 1044, h: 1044, ox: 522, oy: 540 },
    },
    'namibie/camelthorn_mature': {
      draw: camelthornProp('mature', 0.6, 10),
      master: 2,
      wobble: false,
      frame: { w: 400, h: 296, ox: 196, oy: 258 },
    },
    'namibie/camelthorn_old': {
      draw: camelthornProp('old', 0.6, -8),
      master: 2,
      wobble: false,
      frame: { w: 390, h: 296, ox: 195, oy: 258 },
    },
    'namibie/camelthorn_young': {
      draw: camelthornProp('young', 0.72, 6),
      master: 2,
      wobble: false,
      frame: { w: 230, h: 240, ox: 115, oy: 200 },
    },
    'namibie/quiver_tree': {
      draw: quiverProp,
      master: 2,
      wobble: false,
      frame: { w: 240, h: 262, ox: 120, oy: 242 },
    },
    'namibie/quiver_egg': {
      draw: quiverEgg,
      master: 2,
      wobble: false,
      frame: { w: 240, h: 254, ox: 116, oy: 234 },
    },
    'namibie/pan_grass_a': { draw: panGrass(1) },
    'namibie/pan_grass_b': { draw: panGrass(2) },
  },
};
