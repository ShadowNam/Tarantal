// Bushveld winter (bible §4.2): a cold dawn — pale blue sky warming to peach at the horizon, frost
// mist lying in the far veld, orange granite domes and boulder koppies, leafless baobabs, olive and
// copper mopane, pale dry winter grass with frost on the near tufts, red winter aloes, distant
// giraffe. Low sun from the right (the glare omen's side). D-031.
import type { BiomeArtPlan, LayerCtx, PropCtx } from '../landscape';
import {
  bossie,
  cloud,
  edgePts,
  flat,
  groundD,
  hatch,
  line,
  mix,
  nextId,
  shade,
  stone,
  tone,
  treeBlob,
  tuft,
  yAt,
  type Pen,
  type Pt,
  type Rnd,
  type Tone,
} from '../scenery';
import { el, ellipseD, g, inked, polyD, r2, smoothD } from '../svg';
import { aloeFlowers, aloeRosette, groundBand, groundShadow, vGradient } from './karoo';

// --- shapes --------------------------------------------------------------------------------

/** A smooth granite dome (whaleback) with curved exfoliation sheets; lit from the right. */
function dome(rnd: Rnd, x: number, base: number, w: number, h: number, t: Tone, pen: Pen): string {
  const pts: Pt[] = [[x, base]];
  for (let k = 1; k < 9; k++) {
    const f = k / 9;
    pts.push([x + w * f, base - h * Math.pow(Math.sin(f * Math.PI), 0.7) * (0.96 + rnd() * 0.08)]);
  }
  pts.push([x + w, base]);
  const body = smoothD(pts, true, 0.7);
  const id = nextId();
  const sheets: string[] = [];
  for (let k = 1; k <= 3; k++) {
    const f = 0.18 + k * 0.17;
    sheets.push(
      line(
        `M${r2(x + w * (0.12 + k * 0.06))} ${r2(base - h * f * 0.5)}Q${r2(x + w * 0.45)} ${r2(base - h * (f + 0.55))} ${r2(x + w * (0.8 - k * 0.04))} ${r2(base - h * f * 0.6)}`,
        pen,
        pen.w * 0.6,
      ),
    );
  }
  return g(
    {},
    el('clipPath', { id }, el('path', { d: body })),
    flat(body, t.fill),
    g(
      { 'clip-path': `url(#${id})` },
      flat(ellipseD(x + w * 0.22, base, w * 0.4, h * 0.9), t.dark),
      flat(ellipseD(x + w * 0.66, base - h * 0.78, w * 0.16, h * 0.12), t.light),
      ...sheets,
    ),
    el('path', { d: body, fill: 'none', stroke: pen.ink, 'stroke-width': pen.w }),
  );
}

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

/** A bare baobab silhouette for the far layers (fat trunk, root-like crown). */
function farBaobab(x: number, base: number, s: number, c: string, pen: Pen): string {
  const trunk = polyD([
    [x - 16 * s, base],
    [x - 13 * s, base - 30 * s],
    [x - 9 * s, base - 46 * s],
    [x + 9 * s, base - 46 * s],
    [x + 13 * s, base - 30 * s],
    [x + 16 * s, base],
  ]);
  const branches = `M${x - 6 * s} ${base - 44 * s}l-14 ${-12 * s}l-6 ${-4 * s}M${x - 2 * s} ${base - 46 * s}l-3 ${-18 * s}M${x + 4 * s} ${base - 46 * s}l10 ${-16 * s}l4 ${-6 * s}M${x + 8 * s} ${base - 44 * s}l16 ${-6 * s}`;
  return g(
    {},
    el('path', {
      d: branches,
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': 4 * s + pen.w,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: branches,
      fill: 'none',
      stroke: c,
      'stroke-width': 4 * s,
      'stroke-linecap': 'round',
    }),
    inked(trunk, c, pen.ink, pen.w),
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
  const parts: string[] = [
    vGradient('sky', [
      [0, ctx.raw('skyTop')],
      [0.3, ctx.raw('skyMid')],
      [0.5, ctx.raw('skyBottom')],
      [1, ctx.raw('horizon')],
    ]),
    el('rect', { x: 0, y: 0, width: ctx.width, height: 1080, fill: 'url(#sky)' }),
  ];
  const streak = mix(ctx.raw('cloud'), ctx.raw('skyMid'), 0.3);
  for (let x = 120; x < ctx.width; x += 420 + ctx.rnd() * 380) {
    const y = 140 + ctx.rnd() * 220;
    const w = 180 + ctx.rnd() * 240;
    parts.push(
      flat(
        smoothD(
          [
            [x, y],
            [x + w * 0.35, y - 6],
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
  const low = {
    fill: mix(ctx.raw('cloud'), ctx.raw('skyBottom'), 0.4),
    dark: ctx.raw('cloudShadow'),
    light: '#FFF6EA',
  };
  for (let x = -40; x < ctx.width; x += 320 + ctx.rnd() * 420) {
    const w = 160 + ctx.rnd() * 220;
    parts.push(cloud(ctx.rnd, x, 540 + ctx.rnd() * 40, w, w * 0.14, low, null));
  }
  parts.push(mist(ctx.rnd, -40, ctx.width + 40, 610, 70, ctx.raw('mist'), 0.55));
  return g({}, ...parts);
}

function farRidge(ctx: LayerCtx): string {
  const parts: string[] = [];
  const horizon = ctx.raw('horizon');
  const back = tone(mix(ctx.c('granite'), horizon, 0.4), 0.14, 0.18);
  const backPen: Pen = { ink: mix(ctx.pen.ink, horizon, 0.35), w: 1.5 };
  for (let x = -100; x < ctx.width;) {
    const w = 360 + ctx.rnd() * 380;
    parts.push(dome(ctx.rnd, x, 640, w, 90 + ctx.rnd() * 60, back, backPen));
    x += w * (0.6 + ctx.rnd() * 0.25);
  }
  const t = tone(ctx.c('granite'), 0.22, 0.2);
  for (let x = -40; x < ctx.width;) {
    if (ctx.rnd() < 0.55) {
      const w = 240 + ctx.rnd() * 260;
      parts.push(dome(ctx.rnd, x, 660, w, 120 + ctx.rnd() * 70, t, ctx.pen));
      x += w + 80 + ctx.rnd() * 260;
    } else {
      const w = 180 + ctx.rnd() * 140;
      parts.push(boulderPile(ctx.rnd, x + w / 2, 660, w, 110 + ctx.rnd() * 50, t, ctx.pen));
      x += w + 100 + ctx.rnd() * 220;
    }
  }
  // A line of mopane along the foot of the hills, and a baobab or two.
  const tree = tone(ctx.c('mopane'), 0.22, 0.2);
  for (let x = 0; x < ctx.width; x += 26 + ctx.rnd() * 50)
    parts.push(
      treeBlob(
        ctx.rnd,
        x,
        602 + ctx.rnd() * 6,
        24 + ctx.rnd() * 18,
        22 + ctx.rnd() * 12,
        tree,
        ctx.c('trunk'),
        ctx.pen,
      ),
    );
  for (const u of [0.3, 0.77]) parts.push(farBaobab(ctx.u(u), 604, 1, ctx.c('baobab'), ctx.pen));
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
  for (let k = 0; k < ctx.width / 24; k++) {
    const x = ctx.rnd() * ctx.width;
    const y = 584 + Math.pow(ctx.rnd(), 1.3) * 170;
    const s = 2.5 + ((y - 580) / 170) * 6;
    const c = ctx.rnd() < 0.6 ? ctx.c('mopane') : ctx.c('mopaneCopper');
    inside.push(flat(ellipseD(x, y, s * 1.4, s * 0.8), c));
  }
  const parts = [
    band.svg,
    g({ 'clip-path': `url(#${band.clip})` }, ...inside),
    line(smoothD(band.edge, false, 0.8), ctx.pen),
  ];
  const tree = [tone(ctx.c('mopane'), 0.22, 0.2), tone(ctx.c('mopaneCopper'), 0.22, 0.2)];
  for (let x = 40; x < ctx.width; x += 140 + ctx.rnd() * 260) {
    const t = tree[ctx.rnd() < 0.6 ? 0 : 1] ?? tone(ctx.c('mopane'));
    parts.push(
      treeBlob(
        ctx.rnd,
        x,
        yAt(band.edge, x) + 4,
        34 + ctx.rnd() * 22,
        38 + ctx.rnd() * 18,
        t,
        ctx.c('trunk'),
        ctx.pen,
      ),
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
  const items: { y: number; svg: string }[] = [];
  for (let x = 20; x < ctx.width; x += 50 + ctx.rnd() * 130) {
    const y = 676 + Math.pow(ctx.rnd(), 0.9) * 230;
    const s = 9 + ((y - 660) / 250) * 30;
    const c = ctx.rnd() < 0.55 ? ctx.c('mopane') : ctx.c('mopaneCopper');
    const pen: Pen = { ink: ctx.pen.ink, w: s < 16 ? 2.5 : ctx.pen.w };
    if (ctx.rnd() < 0.12)
      items.push({ y, svg: stone(ctx.rnd, x, y, s * 0.7, tone(ctx.c('granite'), 0.25, 0.2), pen) });
    else items.push({ y, svg: bossie(ctx.rnd, x, y, s, tone(c, 0.24, 0.24), pen) });
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

/** Frost on a tuft: a few white highlights on the blade tips. */
function frosted(
  rnd: Rnd,
  x: number,
  y: number,
  h: number,
  t: Tone,
  pen: Pen,
  frost: string,
): string {
  const ticks: string[] = [];
  for (let k = 0; k < 4; k++) {
    const fx = x + (rnd() - 0.5) * h * 0.6;
    const fy = y - h * (0.5 + rnd() * 0.35);
    ticks.push(flat(ellipseD(fx, fy, 2.5, 1.6), frost));
  }
  return g({}, tuft(rnd, x, y, h, t, pen), ...ticks);
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
  const items: { y: number; svg: string }[] = [];
  const pen: Pen = { ink: ctx.pen.ink, w: 5 };
  const grassA = tone(ctx.c('grassLight'), 0.2, 0.2);
  const grassB = tone(ctx.c('grass'), 0.22, 0.25);
  const frost = ctx.c('frost');
  for (let x = 10; x < ctx.width; x += 60 + ctx.rnd() * 120) {
    const y = 860 + ctx.rnd() * 18;
    items.push({
      y,
      svg: frosted(
        ctx.rnd,
        x,
        y,
        28 + ctx.rnd() * 26,
        ctx.rnd() < 0.5 ? grassA : grassB,
        { ink: ctx.pen.ink, w: 4 },
        frost,
      ),
    });
  }
  for (let x = 40; x < ctx.width; x += 90 + ctx.rnd() * 200) {
    const y = 1000 + ctx.rnd() * 80;
    const r = ctx.rnd();
    if (r < 0.16)
      items.push({
        y,
        svg: stone(ctx.rnd, x, y, 16 + ctx.rnd() * 18, tone(ctx.c('granite'), 0.25, 0.2), pen),
      });
    else
      items.push({
        y,
        svg: frosted(ctx.rnd, x, y, 50 + ctx.rnd() * 50, r < 0.55 ? grassA : grassB, pen, frost),
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
  const grassA = tone(ctx.c('grassDark'), 0.25, 0.25);
  const grassB = tone(ctx.c('grassLight'), 0.22, 0.2);
  const avoid = [ctx.u(0.06), ctx.u(0.92)];
  for (let x = 200 + ctx.rnd() * 200; x < ctx.width; x += 650 + ctx.rnd() * 650) {
    if (avoid.some((a) => Math.abs(a - x) < 320)) continue;
    const kind = ctx.rnd();
    if (kind < 0.3) {
      parts.push(
        boulderPile(ctx.rnd, x, 1100, 220, 140, tone(ctx.c('granite'), 0.28, 0.2), pen, 3),
      );
      parts.push(tuft(ctx.rnd, x + 110, 1090, 100, grassB, pen));
    } else if (kind < 0.5) {
      // A fallen mopane branch.
      parts.push(
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
      );
      parts.push(
        line(`M${r2(x + 20)} 1035l40 -40M${r2(x - 60)} 1055l-10 -50`, { ink: pen.ink, w: 9 }),
      );
      parts.push(
        line(`M${r2(x + 20)} 1035l40 -40M${r2(x - 60)} 1055l-10 -50`, {
          ink: ctx.c('trunk'),
          w: 4,
        }),
      );
      parts.push(tuft(ctx.rnd, x - 90, 1092, 110, grassA, pen, 8));
    } else {
      for (let k = 0; k < 4; k++)
        parts.push(
          tuft(
            ctx.rnd,
            x + k * 46 - 70,
            1092,
            110 + ctx.rnd() * 70,
            k % 2 === 0 ? grassA : grassB,
            pen,
            8,
          ),
        );
    }
  }
  return g({}, ...parts);
}

// --- props ---------------------------------------------------------------------------------

/** A tapering branch path from (x, y) by (dx, dy) with width w at its base. */
function branch(x: number, y: number, dx: number, dy: number, w: number): string {
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * w * 0.5;
  const ny = (dx / len) * w * 0.5;
  return `M${r2(x - nx)} ${r2(y - ny)}Q${r2(x + dx * 0.5 - nx * 0.7)} ${r2(y + dy * 0.45 - ny * 0.7)} ${r2(x + dx)} ${r2(y + dy)}Q${r2(x + dx * 0.5 + nx * 0.7)} ${r2(y + dy * 0.55 + ny * 0.7)} ${r2(x + nx)} ${r2(y + ny)}Z`;
}

function baobab(ctx: PropCtx): string {
  const pen = ctx.pen;
  const bark = tone(ctx.c('baobab'), 0.25, 0.22);
  const { oy, h } = ctx.box;
  const top = oy - h / 2; // −70
  const foot = oy + h / 2; // 260
  const trunk = smoothD(
    [
      [-96, foot],
      [-84, foot - 60],
      [-80, foot - 180],
      [-70, top + 30],
      [-52, top - 10],
      [52, top - 12],
      [72, top + 30],
      [82, foot - 170],
      [88, foot - 60],
      [100, foot],
    ],
    true,
    0.6,
  );
  const id = nextId();
  // Leafless winter crown: thick limbs splaying up like roots, then twigs.
  const limbs: [number, number, number, number, number][] = [
    [-40, top - 4, -110, -150, 30],
    [-20, top - 8, -60, -230, 26],
    [10, top - 10, 30, -250, 24],
    [36, top - 6, 120, -170, 28],
    [50, top, 170, -60, 20],
    [-52, top, -170, -70, 20],
  ];
  const limbD = limbs.map(([x, y, dx, dy, w]) => branch(x, y, dx, dy, w)).join('');
  const twigs: string[] = [];
  for (const [x, y, dx, dy] of limbs) {
    const ex = x + dx;
    const ey = y + dy;
    twigs.push(
      `M${r2(ex)} ${r2(ey)}l${r2(dx * 0.25)} ${r2(-30)}M${r2(ex)} ${r2(ey)}l${r2(-dx * 0.15 - 20)} ${r2(-36)}M${r2(ex - dx * 0.3)} ${r2(ey - dy * 0.3)}l${r2(dx > 0 ? 34 : -34)} -24`,
    );
  }
  // The secret pod (content part at (110, −120), 22 × 34) hangs on a stalk from the right limb.
  const pod = g(
    {},
    line('M96 -176Q104 -160 110 -150', pen, 3),
    inked(ellipseD(110, -120, 20, 32), ctx.c('pod'), pen.ink, pen.w),
    flat(ellipseD(104, -130, 6, 12), shade(ctx.c('pod'), 0.35)),
    flat(ellipseD(116, -108, 8, 14), shade(ctx.c('pod'), -0.2)),
  );
  return g(
    {},
    groundShadow(10, foot + 4, 150, 16),
    el('path', {
      d: twigs.join(''),
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': 7,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: twigs.join(''),
      fill: 'none',
      stroke: bark.fill,
      'stroke-width': 3,
      'stroke-linecap': 'round',
    }),
    inked(limbD, bark.fill, pen.ink, pen.w),
    el('clipPath', { id }, el('path', { d: trunk })),
    flat(trunk, bark.fill),
    g(
      { 'clip-path': `url(#${id})` },
      flat(ellipseD(-70, foot - 100, 70, 260), bark.dark),
      flat(ellipseD(48, top + 120, 24, 120), bark.light),
      line(
        'M-30 -40Q-40 80 -36 250M10 -50Q4 80 14 250M44 -30Q56 90 54 250M-56 60Q-66 160 -62 250',
        { ink: bark.dark, w: 3 },
      ),
    ),
    el('path', {
      d: trunk,
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': pen.w,
      'stroke-linejoin': 'round',
    }),
    pod,
  );
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
    boulderPile(ctx.rnd, -40, 92, 380, 150, t, pen, 6),
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
    sky: { top: 0, height: 1080, draw: sky },
    far_ridge: { top: 380, height: 280, draw: farRidge },
    far_veld: { top: 548, height: 232, draw: farVeld },
    mid: { top: 630, height: 280, draw: mid },
    near: { top: 820, height: 260, draw: near },
    foreground: { top: 880, height: 200, draw: foreground },
  },
  props: {
    'bushveld/baobab': { draw: baobab },
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
