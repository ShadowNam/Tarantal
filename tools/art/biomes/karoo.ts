// Karoo autumn (bible §4.2, the home biome, in the first download): golden veld under a pale
// autumn sky, flat-topped dolerite mesas and koppies in hazy lilac, karoo bossies, a dirt farm
// track, a wire fence, the windpomp + corrugated reservoir, a rusty fictional bakkie, a potjie on
// a fire, a fence-post bell and aloes. Light from the upper left. D-031.
import type { BiomeArtPlan, LayerCtx, PaintCtx, PropCtx } from '../landscape';
import {
  bossie,
  cloud,
  edgePts,
  flat,
  groundD,
  hatch,
  koppie,
  line,
  mesa,
  mix,
  nextId,
  post,
  shade,
  stone,
  tone,
  treeBlob,
  tuft,
  wire,
  yAt,
  type Pen,
  type Pt,
  type Rnd,
} from '../scenery';
import { el, ellipseD, g, inked, place, polyD, r2, smoothD } from '../svg';

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
function groundBand(
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
  const parts: string[] = [
    vGradient('sky', [
      [0, ctx.raw('skyTop')],
      [0.28, ctx.raw('skyMid')],
      [0.52, ctx.raw('skyBottom')],
      [1, ctx.raw('horizon')],
    ]),
    el('rect', { x: 0, y: 0, width: ctx.width, height: 1080, fill: 'url(#sky)' }),
  ];
  const pen: Pen = { ink: mix('#1B1410', ctx.raw('skyMid'), 0.62), w: 2 };
  // High thin streaks (calm flyer band), then cumulus banks low over the horizon.
  const streak = mix(ctx.raw('cloud'), ctx.raw('skyMid'), 0.35);
  for (let x = 80; x < ctx.width; x += 380 + ctx.rnd() * 360) {
    const y = 120 + ctx.rnd() * 200;
    const w = 160 + ctx.rnd() * 220;
    parts.push(
      flat(
        smoothD(
          [
            [x, y],
            [x + w * 0.3, y - 7],
            [x + w, y - 3],
            [x + w * 0.7, y + 4],
          ],
          true,
          0.8,
        ),
        streak,
      ),
    );
  }
  // Low cumulus banks over the horizon (behind the mesas), soft and warm in the low sun.
  const low = {
    fill: mix(ctx.raw('cloud'), ctx.raw('skyBottom'), 0.35),
    dark: mix(ctx.raw('cloudShadow'), ctx.raw('skyBottom'), 0.25),
    light: '#FFF8EC',
  };
  for (let x = -60; x < ctx.width; x += 260 + ctx.rnd() * 380) {
    const y = 520 + ctx.rnd() * 40;
    const w = 150 + ctx.rnd() * 220;
    parts.push(cloud(ctx.rnd, x, y, w, w * (0.16 + ctx.rnd() * 0.06), low, null));
  }
  const ct = { fill: ctx.raw('cloud'), dark: ctx.raw('cloudShadow'), light: '#FFFFFF' };
  for (let x = 240; x < ctx.width; x += 760 + ctx.rnd() * 520) {
    const y = 360 + ctx.rnd() * 70;
    const w = 110 + ctx.rnd() * 120;
    parts.push(cloud(ctx.rnd, x, y, w, w * 0.26, ct, pen));
  }
  return g({}, ...parts);
}

function farRidge(ctx: LayerCtx): string {
  const parts: string[] = [];
  const horizon = ctx.raw('horizon');
  const backPen: Pen = { ink: mix(ctx.pen.ink, horizon, 0.35), w: 1.5 };
  const backTone = tone(mix(ctx.c('koppie'), horizon, 0.35), 0.15, 0.2);
  const backCap = mix(ctx.c('koppieCap'), horizon, 0.35);
  // A low continuous range behind.
  for (let x = -120; x < ctx.width;) {
    const w = 420 + ctx.rnd() * 420;
    parts.push(mesa(ctx.rnd, x, 610, w, 70 + ctx.rnd() * 60, backTone, backCap, backPen));
    x += w * (0.62 + ctx.rnd() * 0.2);
  }
  // Nearer mesas and koppies.
  const t = tone(ctx.c('koppie'), 0.2, 0.22);
  for (let x = -60; x < ctx.width;) {
    if (ctx.rnd() < 0.62) {
      const w = 260 + ctx.rnd() * 320;
      parts.push(mesa(ctx.rnd, x, 650, w, 125 + ctx.rnd() * 85, t, ctx.c('koppieCap'), ctx.pen));
      x += w + 60 + ctx.rnd() * 260;
    } else {
      const w = 140 + ctx.rnd() * 140;
      parts.push(koppie(ctx.rnd, x, 650, w, 85 + ctx.rnd() * 55, t, ctx.pen));
      x += w + 80 + ctx.rnd() * 240;
    }
  }
  return g({}, ...parts);
}

function farmhouse(ctx: LayerCtx, x: number, base: number): string {
  const pen = ctx.pen;
  const wall = tone(ctx.c('wall'), 0.18, 0.1);
  const roof = ctx.c('roof');
  return g(
    {},
    treeBlob(
      ctx.rnd,
      x - 70,
      base + 2,
      60,
      74,
      tone(ctx.c('tree'), 0.22, 0.2),
      ctx.c('trunk'),
      pen,
    ),
    treeBlob(
      ctx.rnd,
      x + 90,
      base + 3,
      54,
      66,
      tone(ctx.c('tree'), 0.22, 0.2),
      ctx.c('trunk'),
      pen,
    ),
    inked(
      polyD([
        [x - 36, base],
        [x - 36, base - 18],
        [x + 30, base - 18],
        [x + 30, base],
      ]),
      wall.fill,
      pen.ink,
      pen.w,
    ),
    flat(
      polyD([
        [x + 14, base],
        [x + 14, base - 18],
        [x + 30, base - 18],
        [x + 30, base],
      ]),
      wall.dark,
    ),
    inked(
      polyD([
        [x - 42, base - 16],
        [x - 30, base - 30],
        [x + 26, base - 30],
        [x + 36, base - 16],
      ]),
      roof,
      pen.ink,
      pen.w,
    ),
    flat(
      polyD([
        [x - 20, base],
        [x - 20, base - 9],
        [x - 14, base - 9],
        [x - 14, base],
      ]),
      shade(wall.fill, -0.5),
    ),
    flat(
      polyD([
        [x + 2, base - 7],
        [x + 2, base - 12],
        [x + 9, base - 12],
        [x + 9, base - 7],
      ]),
      '#6A8BA0',
    ),
    treeBlob(
      ctx.rnd,
      x + 54,
      base + 4,
      40,
      50,
      tone(ctx.c('tree'), 0.22, 0.2),
      ctx.c('trunk'),
      pen,
    ),
  );
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
  for (let k = 0; k < ctx.width / 22; k++) {
    const x = ctx.rnd() * ctx.width;
    const y = 582 + Math.pow(ctx.rnd(), 1.3) * 170;
    const s = 2.5 + ((y - 580) / 170) * 6;
    const c = ctx.rnd() < 0.5 ? ctx.c('bossie') : ctx.c('bossieGrey');
    inside.push(flat(ellipseD(x, y, s * 1.4, s * 0.8), c));
    inside.push(flat(ellipseD(x + s * 0.4, y + s * 0.3, s * 0.9, s * 0.4), shade(c, -0.2)));
  }
  parts.push(g({ 'clip-path': `url(#${band.clip})` }, ...inside));
  parts.push(line(smoothD(band.edge, false, 0.8), ctx.pen));
  // A farmstead with bluegums, a far windpomp and a stand of trees, on the horizon line.
  const fx = ctx.u(0.62);
  parts.push(farmhouse(ctx, fx, yAt(band.edge, fx) + 4));
  const wx = ctx.u(0.36);
  parts.push(farWindpomp(ctx, wx, yAt(band.edge, wx) + 3));
  for (const u of [0.08, 0.14, 0.88]) {
    const x = ctx.u(u);
    for (let k = 0; k < 3; k++) {
      const tx = x + k * 34 + ctx.rnd() * 10;
      parts.push(
        treeBlob(
          ctx.rnd,
          tx,
          yAt(band.edge, tx) + 3,
          36 + ctx.rnd() * 14,
          46 + ctx.rnd() * 16,
          tone(ctx.c('tree'), 0.22, 0.2),
          ctx.c('trunk'),
          ctx.pen,
        ),
      );
    }
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
  // Bossies and stones, smaller toward the horizon, never on the track.
  const items: { y: number; svg: string }[] = [];
  for (let x = 20; x < ctx.width; x += 40 + ctx.rnd() * 110) {
    const y = 676 + Math.pow(ctx.rnd(), 0.9) * 230;
    if (Math.abs(x - road.xAt(y)) < 70 + (y - 660) * 0.35) continue;
    const s = 9 + ((y - 660) / 250) * 30;
    const pick = ctx.rnd();
    const c =
      pick < 0.45 ? ctx.c('bossie') : pick < 0.8 ? ctx.c('bossieGrey') : ctx.c('bossieDark');
    const pen: Pen = { ink: ctx.pen.ink, w: s < 16 ? 2.5 : ctx.pen.w };
    if (ctx.rnd() < 0.1)
      items.push({ y, svg: stone(ctx.rnd, x, y, s * 0.6, tone(ctx.c('stone'), 0.25, 0.25), pen) });
    else items.push({ y, svg: bossie(ctx.rnd, x, y, s, tone(c, 0.24, 0.26), pen) });
  }
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
  const items: { y: number; svg: string }[] = [];
  const pen: Pen = { ink: ctx.pen.ink, w: 5 };
  const grassA = tone(ctx.c('veld'), 0.22, 0.25);
  const grassB = tone(ctx.c('veldLight'), 0.22, 0.2);
  // Back row of short tufts at the crest, a calm middle band (pop-ups), a front row.
  for (let x = 10; x < ctx.width; x += 60 + ctx.rnd() * 120) {
    const y = 860 + ctx.rnd() * 18;
    items.push({
      y,
      svg: tuft(ctx.rnd, x, y, 28 + ctx.rnd() * 26, ctx.rnd() < 0.5 ? grassA : grassB, {
        ink: ctx.pen.ink,
        w: 4,
      }),
    });
  }
  for (let x = 40; x < ctx.width; x += 90 + ctx.rnd() * 200) {
    const y = 1000 + ctx.rnd() * 80;
    const r = ctx.rnd();
    if (r < 0.14)
      items.push({
        y,
        svg: stone(ctx.rnd, x, y, 16 + ctx.rnd() * 16, tone(ctx.c('stone'), 0.25, 0.25), pen),
      });
    else
      items.push({
        y,
        svg: tuft(ctx.rnd, x, y, 50 + ctx.rnd() * 50, r < 0.55 ? grassA : grassB, pen),
      });
  }
  for (let x = 300; x < ctx.width; x += 500 + ctx.rnd() * 600) {
    const y = 960 + ctx.rnd() * 30;
    items.push({
      y,
      svg: bossie(ctx.rnd, x, y, 30 + ctx.rnd() * 14, tone(ctx.c('bossieGrey'), 0.24, 0.26), pen),
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
  const grassA = tone(ctx.c('veldDark'), 0.25, 0.25);
  const grassB = tone(ctx.c('veld'), 0.25, 0.22);
  const avoid = [ctx.u(0.05), ctx.u(0.93)];
  for (let x = 160 + ctx.rnd() * 200; x < ctx.width; x += 650 + ctx.rnd() * 650) {
    if (avoid.some((a) => Math.abs(a - x) < 320)) continue;
    const kind = ctx.rnd();
    if (kind < 0.25) {
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
      parts.push(tuft(ctx.rnd, x - 20, 1088, 90, grassA, pen));
    } else if (kind < 0.45) {
      parts.push(
        stone(ctx.rnd, x, 1082, 58 + ctx.rnd() * 20, tone(ctx.c('stone'), 0.28, 0.25), pen),
      );
      parts.push(tuft(ctx.rnd, x + 70, 1090, 110, grassB, pen));
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

function groundShadow(x: number, y: number, rx: number, ry: number): string {
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
    groundShadow(18, base + 2, 70, 9),
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
        [84, base - 12],
        [84, base - 4],
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
    groundShadow(26, botY + 14, 200, 26),
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
      `M-210 ${botY - 10}L-176 ${botY - 10}L-176 ${rimY - 6}L-150 ${rimY - 6}L-150 ${rimY + 1}L-170 ${rimY + 1}L-170 ${botY - 3}L-210 ${botY - 3}Z`,
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

function bakkie(ctx: PropCtx): string {
  const pen = ctx.pen;
  const paint = tone(mix('#A6533A', ctx.c('rust'), 0.3), 0.3, 0.25);
  const glass = '#BFDCEA';
  const tyre = '#2A2522';
  const id = nextId();
  // Side silhouette facing right: load bin, cab, bonnet; the 3/4 front face is a slim panel.
  const body = polyD([
    [-206, 52],
    [-208, -48],
    [-14, -48],
    [-6, -98],
    [104, -98],
    [132, -46],
    [196, -38],
    [214, -26],
    [216, 50],
  ]);
  const wheel = (x: number) =>
    g(
      {},
      inked(ellipseD(x, 56, 42, 42), tyre, pen.ink, pen.w),
      inked(ellipseD(x, 56, 20, 20), ctx.c('metal'), pen.ink, 3),
      flat(ellipseD(x - 6, 50, 7, 7), shade(ctx.c('metal'), 0.4)),
    );
  return g(
    {},
    groundShadow(10, 96, 230, 14),
    el('clipPath', { id }, el('path', { d: body })),
    flat(body, paint.fill),
    g(
      { 'clip-path': `url(#${id})` },
      flat(
        polyD([
          [-220, 18],
          [230, 18],
          [230, 60],
          [-220, 60],
        ]),
        paint.dark,
      ),
      flat(
        polyD([
          [-200, -44],
          [-24, -44],
          [-24, -34],
          [-200, -34],
        ]),
        paint.light,
      ),
      flat(ellipseD(-80, -10, 34, 16), shade(ctx.c('rust'), -0.15)),
      flat(ellipseD(160, 0, 22, 12), shade(ctx.c('rust'), -0.15)),
      flat(ellipseD(40, 28, 26, 8), '#8F8A80', { opacity: 0.8 }),
      // Bin ribs.
      line(
        'M-180 -44L-180 14M-140 -44L-140 14M-100 -44L-100 14M-60 -44L-60 14',
        { ink: paint.dark, w: 3 },
        3,
      ),
    ),
    el('path', {
      d: body,
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': pen.w,
      'stroke-linejoin': 'round',
    }),
    // Cab window, door, handle, mirror, headlight, plain grille bars (no badge), bumper.
    inked(
      polyD([
        [4, -88],
        [98, -88],
        [120, -50],
        [4, -50],
      ]),
      glass,
      pen.ink,
      3,
    ),
    flat(
      polyD([
        [30, -86],
        [46, -86],
        [24, -52],
        [8, -52],
      ]),
      '#EAF5FA',
    ),
    line('M-10 -46L-12 40M118 -40L118 40', pen, 3),
    line('M8 -30l20 0', pen, 4),
    inked(
      polyD([
        [124, -64],
        [138, -64],
        [138, -52],
        [124, -52],
      ]),
      shade(paint.fill, -0.3),
      pen.ink,
      2.5,
    ),
    inked(
      polyD([
        [198, -34],
        [216, -26],
        [216, 18],
        [198, 14],
      ]),
      '#7C756C',
      pen.ink,
      3,
    ),
    line('M202 -24l12 4M202 -14l12 4M202 -4l12 4M202 6l12 4', pen, 2),
    inked(ellipseD(190, -24, 8, 8), '#F5E6B0', pen.ink, 2.5),
    inked(
      polyD([
        [184, 26],
        [222, 28],
        [222, 40],
        [184, 38],
      ]),
      '#9C9890',
      pen.ink,
      3,
    ),
    inked(
      polyD([
        [-214, 18],
        [-200, 18],
        [-200, 34],
        [-214, 34],
      ]),
      '#9C9890',
      pen.ink,
      3,
    ),
    // Spare wheel standing in the bin (the secret: content part at (−180, −40), 32 × 36).
    inked(ellipseD(-180, -40, 32, 36), tyre, pen.ink, pen.w),
    inked(ellipseD(-180, -40, 15, 17), ctx.c('metal'), pen.ink, 3),
    flat(ellipseD(-186, -48, 5, 6), shade(ctx.c('metal'), 0.45)),
    wheel(-128),
    wheel(140),
  );
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
    line('M-10 -66c-14 -14 12 -22 0 -38s8 -22 4 -30', { ink: '#F4F1E8', w: 7 }, 7, {
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
    // Fence wires running off both sides (they meet the mid layer's fence).
    line(
      'M-112 -14Q-60 -10 -10 -14M10 -14Q60 -10 112 -14M-112 2Q-60 6 -10 2M10 2Q60 6 112 2',
      { ink: shade(pen.ink, 0.15), w: 1.5 },
      1.5,
    ),
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
          s * 1.75,
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
    sky: { top: 0, height: 1080, draw: sky },
    far_ridge: { top: 380, height: 280, draw: farRidge },
    far_veld: { top: 548, height: 232, draw: farVeld },
    mid: { top: 600, height: 310, draw: mid },
    near: { top: 820, height: 260, draw: near },
    foreground: { top: 880, height: 200, draw: foreground },
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
