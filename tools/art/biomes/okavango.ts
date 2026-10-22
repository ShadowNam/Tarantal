// Okavango spring (bible §4.2): a fresh blue sky with spring cumulus, a flat floodplain with tree
// islands of jackalberry and ilala palms on the horizon, green grass cut by water channels, reed
// beds and papyrus, a sausage tree, a hippo in the shallows, a lily pad with a reed frog, a
// mokoro marker pole. No jacarandas (bible §2). Soft light from the upper left. D-031.
import type { BiomeArtPlan, LayerCtx, PropCtx } from '../landscape';
import {
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
  type Rnd,
  type Tone,
} from '../scenery';
import { el, ellipseD, g, inked, polyD, r2, smoothD } from '../svg';
import { groundBand, vGradient } from './karoo';

// --- shapes --------------------------------------------------------------------------------

/** An ilala fan palm: a thin curved trunk and a spiky fan crown. */
function palm(
  rnd: Rnd,
  x: number,
  base: number,
  h: number,
  t: Tone,
  trunk: string,
  pen: Pen,
): string {
  const lean = (rnd() - 0.5) * h * 0.25;
  const tx = x + lean;
  const ty = base - h;
  const parts: string[] = [
    el('path', {
      d: `M${r2(x)} ${r2(base)}Q${r2(x + lean * 0.2)} ${r2(base - h * 0.5)} ${r2(tx)} ${r2(ty)}`,
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': h * 0.05 + pen.w,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: `M${r2(x)} ${r2(base)}Q${r2(x + lean * 0.2)} ${r2(base - h * 0.5)} ${r2(tx)} ${r2(ty)}`,
      fill: 'none',
      stroke: trunk,
      'stroke-width': h * 0.05,
      'stroke-linecap': 'round',
    }),
  ];
  const fronds: string[] = [];
  for (let k = 0; k < 9; k++) {
    const a = Math.PI + (k / 8) * Math.PI + (rnd() - 0.5) * 0.2;
    const r = h * (0.3 + rnd() * 0.1);
    const ex = tx + Math.cos(a) * r;
    const ey = ty + Math.sin(a) * r * 0.7 + (k === 0 || k === 8 ? r * 0.3 : 0);
    fronds.push(`M${r2(tx)} ${r2(ty)}L${r2(ex - 3)} ${r2(ey)}L${r2(ex + 3)} ${r2(ey + 2)}Z`);
  }
  parts.push(
    el('path', {
      d: fronds.join(''),
      fill: t.fill,
      stroke: pen.ink,
      'stroke-width': pen.w * 0.8,
      'stroke-linejoin': 'round',
    }),
  );
  return g({}, ...parts);
}

/** A reed: thin tapering stem with a feathery plume (Phragmites). */
function reed(
  x: number,
  base: number,
  h: number,
  lean: number,
  stem: string,
  plume: string,
  pen: Pen,
  w = 4,
): string {
  const tx = x + lean;
  const ty = base - h;
  const d = `M${r2(x - w / 2)} ${r2(base)}Q${r2(x + lean * 0.3)} ${r2(base - h * 0.5)} ${r2(tx)} ${r2(ty)}Q${r2(x + lean * 0.3 + w)} ${r2(base - h * 0.5)} ${r2(x + w / 2)} ${r2(base)}Z`;
  return g(
    {},
    inked(d, stem, pen.ink, pen.w * 0.6),
    inked(
      smoothD(
        [
          [tx - 6, ty + 30],
          [tx - 8, ty + 10],
          [tx + 2, ty - 8],
          [tx + 8, ty + 12],
          [tx + 4, ty + 30],
        ],
        true,
        0.8,
      ),
      plume,
      pen.ink,
      pen.w * 0.5,
    ),
  );
}

/** A papyrus stem with its umbel (a starburst of thin rays). */
function papyrus(
  x: number,
  base: number,
  h: number,
  lean: number,
  stem: string,
  head: Tone,
  pen: Pen,
): string {
  const tx = x + lean;
  const ty = base - h;
  const rays: string[] = [];
  for (let k = 0; k < 13; k++) {
    const a = Math.PI * 1.08 + (k / 12) * Math.PI * 0.84;
    const r = h * 0.2 * (0.8 + (k % 3) * 0.12);
    rays.push(
      `M${r2(tx)} ${r2(ty)}Q${r2(tx + Math.cos(a) * r * 0.6)} ${r2(ty + Math.sin(a) * r * 0.75)} ${r2(tx + Math.cos(a) * r)} ${r2(ty + Math.sin(a) * r * 0.55 + r * 0.25)}`,
    );
  }
  return g(
    {},
    el('path', {
      d: `M${r2(x)} ${r2(base)}Q${r2(x + lean * 0.3)} ${r2(base - h * 0.5)} ${r2(tx)} ${r2(ty)}`,
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': 4 + pen.w,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: `M${r2(x)} ${r2(base)}Q${r2(x + lean * 0.3)} ${r2(base - h * 0.5)} ${r2(tx)} ${r2(ty)}`,
      fill: 'none',
      stroke: stem,
      'stroke-width': 4,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: rays.join(''),
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': 3 + pen.w * 0.7,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: rays.join(''),
      fill: 'none',
      stroke: head.fill,
      'stroke-width': 3,
      'stroke-linecap': 'round',
    }),
    flat(ellipseD(tx, ty, 5, 4), head.dark),
  );
}

/** A lily pad with its notch, optionally a flower. */
function lilyPad(
  x: number,
  y: number,
  r: number,
  t: Tone,
  pen: Pen,
  flower: string | null,
): string {
  const d = `M${r2(x)} ${r2(y)}L${r2(x + r)} ${r2(y - r * 0.08)}A${r2(r)} ${r2(r * 0.35)} 0 1 1 ${r2(x + r * 0.9)} ${r2(y + r * 0.14)}Z`;
  const out = [
    inked(d, t.fill, pen.ink, pen.w),
    flat(ellipseD(x - r * 0.3, y - r * 0.08, r * 0.35, r * 0.08), t.light),
  ];
  if (flower !== null) {
    const fx = x + r * 0.2;
    const fy = y - r * 0.1;
    for (const a of [-50, -20, 10, 40])
      out.push(
        inked(
          `M${r2(fx)} ${r2(fy)}l${r2(Math.sin((a * Math.PI) / 180) * r * 0.35 - 4)} ${r2(-r * 0.35)}l8 0Z`,
          flower,
          pen.ink,
          pen.w * 0.6,
        ),
      );
    out.push(flat(ellipseD(fx, fy - 3, 4, 3), '#F2C94C'));
  }
  return g({}, ...out);
}

/** A water channel strip with glints. */
function channel(
  rnd: Rnd,
  x0: number,
  x1: number,
  y: number,
  h: number,
  water: Tone,
  pen: Pen,
): string {
  const top = edgePts(rnd, x0, x1, y - h / 2, h * 0.2, 90);
  const bot = edgePts(rnd, x0, x1, y + h / 2, h * 0.15, 110).reverse();
  const d = smoothD([...top, ...bot], true, 0.8);
  const glints: string[] = [];
  for (let k = 0; k < (x1 - x0) / 60; k++) {
    const gx = x0 + rnd() * (x1 - x0);
    glints.push(`M${r2(gx)} ${r2(y - h * 0.1 + rnd() * h * 0.3)}l${r2(10 + rnd() * 20)} 0`);
  }
  return g(
    {},
    inked(d, water.fill, pen.ink, pen.w),
    el('path', {
      d: glints.join(''),
      stroke: water.light,
      'stroke-width': 2,
      'stroke-linecap': 'round',
    }),
  );
}

// --- layers --------------------------------------------------------------------------------

function sky(ctx: LayerCtx): string {
  const parts: string[] = [
    vGradient('sky', [
      [0, ctx.raw('skyTop')],
      [0.35, ctx.raw('skyMid')],
      [0.58, ctx.raw('skyBottom')],
      [1, ctx.raw('horizon')],
    ]),
    el('rect', { x: 0, y: 0, width: ctx.width, height: 1080, fill: 'url(#sky)' }),
  ];
  const pen: Pen = { ink: mix(ctx.pen.ink, ctx.raw('skyMid'), 0.6), w: 2 };
  const ct = { fill: ctx.raw('cloud'), dark: ctx.raw('cloudShadow'), light: '#FFFFFF' };
  // Spring cumulus banks low over the delta, a few small ones higher up.
  for (let x = -80; x < ctx.width; x += 260 + ctx.rnd() * 300) {
    const w = 200 + ctx.rnd() * 240;
    parts.push(cloud(ctx.rnd, x, 600 + ctx.rnd() * 30, w, w * (0.18 + ctx.rnd() * 0.08), ct, pen));
  }
  for (let x = 200; x < ctx.width; x += 700 + ctx.rnd() * 500) {
    const w = 110 + ctx.rnd() * 90;
    parts.push(cloud(ctx.rnd, x, 300 + ctx.rnd() * 120, w, w * 0.3, ct, pen));
  }
  return g({}, ...parts);
}

function farRidge(ctx: LayerCtx): string {
  // Tree islands on the flat horizon: jackalberry crowns and ilala palms, hazed blue-green.
  const parts: string[] = [];
  const horizon = ctx.raw('horizon');
  const backPen: Pen = { ink: mix(ctx.pen.ink, horizon, 0.35), w: 1.5 };
  const backT = tone(mix(ctx.c('island'), horizon, 0.35), 0.15, 0.18);
  for (let x = -60; x < ctx.width; x += 30 + ctx.rnd() * 40)
    parts.push(
      treeBlob(
        ctx.rnd,
        x,
        640,
        60 + ctx.rnd() * 40,
        50 + ctx.rnd() * 30,
        backT,
        mix(ctx.c('trunk'), horizon, 0.35),
        backPen,
      ),
    );
  const t = tone(ctx.c('island'), 0.22, 0.2);
  const palmT = tone(ctx.c('palm'), 0.22, 0.2);
  for (let x = -40; x < ctx.width;) {
    const w = 240 + ctx.rnd() * 320;
    for (let k = 0; k < w / 50; k++) {
      const tx = x + k * 50 + ctx.rnd() * 20;
      if (ctx.rnd() < 0.3)
        parts.push(palm(ctx.rnd, tx, 650, 90 + ctx.rnd() * 40, palmT, ctx.c('trunk'), ctx.pen));
      else
        parts.push(
          treeBlob(
            ctx.rnd,
            tx,
            652,
            70 + ctx.rnd() * 50,
            80 + ctx.rnd() * 40,
            t,
            ctx.c('trunk'),
            ctx.pen,
          ),
        );
    }
    x += w + 120 + ctx.rnd() * 300;
  }
  return g({}, ...parts);
}

function farVeld(ctx: LayerCtx): string {
  const band = groundBand(ctx, 574, 3, 120, ctx.c('grassLight'));
  const water = tone(mix(ctx.c('water'), ctx.raw('horizon'), 0.15), 0.15, 0.35);
  const inside: string[] = [
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 650, 6, 150, ctx.bottom + 40),
      mix(ctx.c('grassLight'), ctx.c('grass'), 0.5),
    ),
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 710, 8, 170, ctx.bottom + 40), ctx.c('grass')),
  ];
  for (let x = -40; x < ctx.width; x += 500 + ctx.rnd() * 600) {
    const w = 260 + ctx.rnd() * 420;
    inside.push(
      channel(ctx.rnd, x, x + w, 600 + ctx.rnd() * 50, 10 + ctx.rnd() * 6, water, ctx.pen),
    );
  }
  for (let k = 0; k < ctx.width / 30; k++) {
    const x = ctx.rnd() * ctx.width;
    const y = 584 + Math.pow(ctx.rnd(), 1.3) * 170;
    const s = 2.5 + ((y - 580) / 170) * 5;
    inside.push(flat(ellipseD(x, y, s * 1.2, s * 0.6), ctx.c('reed')));
  }
  const parts = [
    band.svg,
    g({ 'clip-path': `url(#${band.clip})` }, ...inside),
    line(smoothD(band.edge, false, 0.8), ctx.pen),
  ];
  const palmT = tone(ctx.c('palm'), 0.22, 0.2);
  for (let x = 120; x < ctx.width; x += 300 + ctx.rnd() * 500)
    parts.push(
      palm(ctx.rnd, x, yAt(band.edge, x) + 6, 60 + ctx.rnd() * 20, palmT, ctx.c('trunk'), ctx.pen),
    );
  return g({}, ...parts);
}

function mid(ctx: LayerCtx): string {
  const band = groundBand(ctx, 658, 5, 150, ctx.c('grassLight'));
  const inside: string[] = [
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 694, 8, 170, ctx.bottom + 40),
      mix(ctx.c('grassLight'), ctx.c('grass'), 0.55),
    ),
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 740, 10, 190, ctx.bottom + 40), ctx.c('grass')),
    // A muddy, wetter strip where the channels run (the water itself is the splash zones' sprite).
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 790, 10, 200, 850),
      mix(ctx.c('grass'), ctx.c('mud'), 0.45),
    ),
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 850, 14, 210, ctx.bottom + 40), ctx.c('grassDark')),
  ];
  inside.push(
    hatch(
      ctx.rnd,
      0,
      ctx.width,
      690,
      780,
      Math.round(ctx.width / 10),
      8,
      shade(ctx.c('grass'), -0.18),
      1.5,
    ),
  );
  inside.push(
    hatch(
      ctx.rnd,
      0,
      ctx.width,
      850,
      910,
      Math.round(ctx.width / 10),
      13,
      shade(ctx.c('grassDark'), -0.2),
      2,
    ),
  );
  const items: { y: number; svg: string }[] = [];
  const reedT = tone(ctx.c('reed'), 0.22, 0.25);
  const sedge = tone(ctx.c('grassLight'), 0.22, 0.2);
  for (let x = 20; x < ctx.width; x += 60 + ctx.rnd() * 140) {
    const y = 676 + Math.pow(ctx.rnd(), 0.9) * 230;
    if (y > 790 && y < 845) continue; // keep the channel strip open
    const s = 10 + ((y - 660) / 250) * 30;
    const pen: Pen = { ink: ctx.pen.ink, w: s < 16 ? 2.5 : ctx.pen.w };
    items.push({ y, svg: tuft(ctx.rnd, x, y, s * 1.5, ctx.rnd() < 0.5 ? reedT : sedge, pen, 8) });
  }
  const pad = tone(ctx.c('pad'), 0.22, 0.25);
  for (let x = 60; x < ctx.width; x += 160 + ctx.rnd() * 300) {
    const y = 795 + ctx.rnd() * 45;
    items.push({
      y,
      svg: lilyPad(
        x,
        y,
        16 + ctx.rnd() * 8,
        pad,
        { ink: ctx.pen.ink, w: 2.5 },
        ctx.rnd() < 0.35 ? ctx.c('lily') : null,
      ),
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

function near(ctx: LayerCtx): string {
  const band = groundBand(ctx, 848, 9, 120, mix(ctx.c('grass'), ctx.c('grassDark'), 0.4));
  const water = tone(ctx.c('water'), 0.2, 0.35);
  const inside: string[] = [
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 884, 10, 200, ctx.bottom + 40), ctx.c('grassDark')),
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 1000, 14, 230, ctx.bottom + 40),
      shade(ctx.c('grassDark'), -0.08),
    ),
  ];
  for (let x = 200; x < ctx.width; x += 700 + ctx.rnd() * 700) {
    const y = 1010 + ctx.rnd() * 40;
    inside.push(
      flat(ellipseD(x, y + 6, 120, 22), ctx.c('mud')),
      inked(ellipseD(x, y, 100, 16), water.fill, ctx.pen.ink, 4),
      flat(ellipseD(x - 30, y - 4, 30, 3), water.light),
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
  const items: { y: number; svg: string }[] = [];
  const pen: Pen = { ink: ctx.pen.ink, w: 5 };
  const grassA = tone(ctx.c('grass'), 0.22, 0.25);
  const grassB = tone(ctx.c('reed'), 0.22, 0.25);
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
    if (r < 0.08)
      items.push({
        y,
        svg: stone(ctx.rnd, x, y, 14 + ctx.rnd() * 12, tone(ctx.c('mud'), 0.25, 0.25), pen),
      });
    else
      items.push({
        y,
        svg: tuft(ctx.rnd, x, y, 50 + ctx.rnd() * 50, r < 0.55 ? grassA : grassB, pen, 8),
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
  const head = tone(ctx.c('papyrus'), 0.22, 0.25);
  const reedT = tone(ctx.c('reed'), 0.25, 0.25);
  const avoid = [ctx.u(0.05), ctx.u(0.94)];
  for (let x = 200 + ctx.rnd() * 200; x < ctx.width; x += 650 + ctx.rnd() * 650) {
    if (avoid.some((a) => Math.abs(a - x) < 320)) continue;
    if (ctx.rnd() < 0.4) {
      for (let k = 0; k < 4; k++)
        parts.push(
          reed(
            x + k * 26 - 40,
            1100,
            170 + ctx.rnd() * 60,
            (k - 1.5) * 18,
            ctx.c('reed'),
            ctx.c('plume'),
            pen,
            7,
          ),
        );
      parts.push(tuft(ctx.rnd, x, 1092, 100, reedT, pen, 8));
    } else {
      for (let k = 0; k < 3; k++)
        parts.push(
          papyrus(
            x + k * 40 - 40,
            1100,
            160 + ctx.rnd() * 40,
            (k - 1) * 30,
            ctx.c('papyrusStem'),
            head,
            pen,
          ),
        );
      parts.push(tuft(ctx.rnd, x, 1092, 90, reedT, pen, 8));
    }
  }
  return g({}, ...parts);
}

// --- props ---------------------------------------------------------------------------------

function reeds(seed: number) {
  return (ctx: PropCtx): string => {
    const pen = ctx.pen;
    const { w, oy, h } = ctx.box;
    const base = oy + h / 2;
    const parts: string[] = [flat(ellipseD(0, base, w * 0.55, 14), ctx.c('mud'))];
    const n = 16 + (seed % 3) * 2;
    const order = Array.from({ length: n }, (_, k) => k).sort(
      (a, b) => ((a * 7 + seed) % n) - ((b * 7 + seed) % n),
    );
    for (const k of order) {
      const f = k / (n - 1) - 0.5;
      const hh = h * (1.2 + ctx.rnd() * 0.5) * (1 - Math.abs(f) * 0.5);
      const stem = k % 3 === 0 ? shade(ctx.c('reed'), -0.15) : ctx.c('reed');
      parts.push(
        reed(
          f * w * 0.9,
          base,
          hh,
          f * w * 0.5 + (ctx.rnd() - 0.5) * 30,
          stem,
          ctx.c('plume'),
          pen,
          6,
        ),
      );
    }
    parts.push(tuft(ctx.rnd, -w * 0.3, base + 2, 60, tone(ctx.c('grass'), 0.22, 0.25), pen));
    parts.push(tuft(ctx.rnd, w * 0.3, base + 2, 54, tone(ctx.c('grassLight'), 0.22, 0.2), pen));
    return g({}, ...parts);
  };
}

function mokoroPole(ctx: PropCtx): string {
  const pen = ctx.pen;
  const wood = tone(ctx.c('wood'), 0.28, 0.22);
  const cloth = tone(ctx.c('cloth'), 0.25, 0.25);
  const water = tone(ctx.c('water'), 0.2, 0.35);
  // Pole: rect 22 × 260 centred at the origin, stuck in the water; flag part rect 56 × 36 at (30, −112).
  return g(
    {},
    inked(ellipseD(4, 132, 70, 12), water.fill, pen.ink, 3),
    line('M-40 132q20 -6 40 0t40 0', { ink: water.light, w: 2.5 }),
    inked(
      polyD([
        [-8, 136],
        [-6, -130],
        [2, -136],
        [8, -128],
        [10, 136],
      ]),
      wood.fill,
      pen.ink,
      pen.w,
    ),
    flat(
      polyD([
        [3, 136],
        [4, -130],
        [8, -128],
        [10, 136],
      ]),
      wood.dark,
    ),
    line('M-6 -60l14 -4M-6 20l14 4', { ink: wood.dark, w: 2 }),
    line('M-6 -126l14 4M-6 -118l14 4', pen, 3),
    inked(
      smoothD(
        [
          [4, -128],
          [32, -134],
          [58, -126],
          [56, -112],
          [60, -96],
          [32, -100],
          [4, -96],
        ],
        true,
        0.6,
      ),
      cloth.fill,
      pen.ink,
      pen.w,
    ),
    flat(
      smoothD(
        [
          [30, -100],
          [60, -96],
          [56, -112],
          [44, -110],
        ],
        true,
        0.6,
      ),
      cloth.dark,
    ),
    flat(ellipseD(22, -122, 10, 3), cloth.light),
  );
}

function sausageTree(ctx: PropCtx): string {
  const pen = ctx.pen;
  const bark = tone(ctx.c('trunk'), 0.25, 0.25);
  const leaf = tone(ctx.c('canopy'), 0.24, 0.22);
  const { oy, h } = ctx.box;
  const top = oy - h / 2; // −70
  const foot = oy + h / 2; // 260
  const trunk = smoothD(
    [
      [-44, foot],
      [-34, foot - 80],
      [-34, top + 10],
      [-14, top - 40],
      [16, top - 40],
      [34, top + 10],
      [36, foot - 80],
      [48, foot],
    ],
    true,
    0.6,
  );
  // Crown: a broad rounded mass of lobes (dense spring leaves).
  const lobes: [number, number, number][] = [];
  for (let k = 0; k < 11; k++) {
    const f = k / 10 - 0.5;
    lobes.push([f * 330, -230 + Math.abs(f) * 120 + (ctx.rnd() - 0.5) * 20, 70 + ctx.rnd() * 30]);
  }
  for (let k = 0; k < 5; k++) lobes.push([(ctx.rnd() - 0.5) * 240, -300 + ctx.rnd() * 60, 70]);
  const crown = lobes.map(([x, y, r]) => ellipseD(x, y, r, r * 0.8)).join('');
  const id = nextId();
  const fruits: string[] = [];
  for (const [fx, fy, len] of [
    [-120, -150, 90],
    [-60, -130, 110],
    [40, -140, 100],
    [110, -160, 80],
    [150, -190, 70],
    [-160, -180, 70],
  ] as const) {
    fruits.push(line(`M${fx} ${fy}L${fx + 3} ${fy + len}`, { ink: pen.ink, w: 2.5 }));
    fruits.push(
      inked(
        smoothD(
          [
            [fx - 9, fy + len],
            [fx - 8, fy + len - 4],
            [fx + 3, fy + len - 6],
            [fx + 13, fy + len],
            [fx + 11, fy + len + 62],
            [fx + 3, fy + len + 70],
            [fx - 7, fy + len + 62],
          ],
          true,
          0.8,
        ),
        ctx.c('sausage'),
        pen.ink,
        pen.w * 0.8,
      ),
    );
  }
  const flowers: string[] = [];
  for (let k = 0; k < 9; k++)
    flowers.push(
      inked(
        ellipseD(-160 + ctx.rnd() * 320, -190 + ctx.rnd() * 60, 7, 6),
        ctx.c('flower'),
        pen.ink,
        2,
      ),
    );
  return g(
    {},
    el('path', {
      d: `M-20 ${top}Q-80 -120 -140 -160M20 ${top}Q90 -130 150 -170M0 ${top - 20}L0 -220`,
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': 26,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: `M-20 ${top}Q-80 -120 -140 -160M20 ${top}Q90 -130 150 -170M0 ${top - 20}L0 -220`,
      fill: 'none',
      stroke: bark.fill,
      'stroke-width': 18,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: crown,
      fill: pen.ink,
      stroke: pen.ink,
      'stroke-width': pen.w * 2,
      'stroke-linejoin': 'round',
    }),
    el('clipPath', { id }, el('path', { d: crown })),
    flat(crown, leaf.fill),
    g(
      { 'clip-path': `url(#${id})` },
      flat(ellipseD(60, -160, 220, 80), leaf.dark),
      flat(ellipseD(-90, -320, 90, 30), leaf.light),
      ...flowers,
    ),
    // Perch branch out of the crown's underside (content perch (−130, −170)).
    inked(
      smoothD(
        [
          [-60, -150],
          [-150, -168],
          [-152, -162],
          [-62, -140],
        ],
        true,
        0.5,
      ),
      bark.fill,
      pen.ink,
      pen.w * 0.8,
    ),
    inked(trunk, bark.fill, pen.ink, pen.w),
    flat(
      polyD([
        [10, foot],
        [14, top - 30],
        [34, top + 10],
        [36, foot],
      ]),
      bark.dark,
    ),
    line('M-14 0Q-20 120 -16 250M20 -20Q26 100 22 250', { ink: bark.dark, w: 3 }),
    ...fruits,
  );
}

function hippo(ctx: PropCtx): string {
  // Submerged hippo (occluder ellipse 120 × 45): back hump and head above the water line, eyes,
  // ears and nostrils up; ripples round it. The content's splash part is beside it, off the art.
  const pen = ctx.pen;
  const skin = tone(ctx.c('hippo'), 0.25, 0.25);
  const water = tone(ctx.c('water'), 0.2, 0.35);
  const hump = smoothD(
    [
      [-130, 14],
      [-110, -18],
      [-50, -34],
      [10, -26],
      [40, 14],
    ],
    true,
    0.8,
  );
  const head = smoothD(
    [
      [10, 16],
      [16, -24],
      [44, -40],
      [70, -38],
      [100, -30],
      [134, -24],
      [144, -6],
      [138, 16],
    ],
    true,
    0.7,
  );
  return g(
    {},
    inked(ellipseD(0, 16, 156, 24), water.fill, pen.ink, 3),
    inked(hump, skin.fill, pen.ink, pen.w),
    flat(ellipseD(-50, -22, 40, 6), skin.light),
    inked(head, skin.fill, pen.ink, pen.w),
    flat(
      smoothD(
        [
          [100, 14],
          [110, -20],
          [140, -14],
          [140, 14],
        ],
        true,
        0.6,
      ),
      ctx.c('hippoPink'),
    ),
    inked(ellipseD(48, -40, 11, 9), skin.fill, pen.ink, pen.w * 0.8),
    inked(ellipseD(30, -44, 7, 10), skin.dark, pen.ink, pen.w * 0.8),
    flat(ellipseD(50, -40, 4, 4), pen.ink),
    flat(ellipseD(51, -42, 1.5, 1.5), '#FFFFFF'),
    inked(ellipseD(124, -26, 8, 5), skin.dark, pen.ink, 2.5),
    flat(ellipseD(124, -26, 3, 2), pen.ink),
    flat(
      smoothD(
        [
          [-156, 16],
          [156, 16],
          [156, 40],
          [-156, 40],
        ],
        true,
        0.2,
      ),
      water.fill,
    ),
    line('M-150 18q30 -6 60 0t60 0t60 0t60 0t60 0', { ink: water.light, w: 3 }),
    line('M-160 30q20 6 40 0M100 34q20 6 40 0', { ink: water.dark, w: 2.5 }),
  );
}

function lilyFrog(ctx: PropCtx): string {
  // Lily pad (content part: ellipse 56 × 18 at the origin) with a reed frog and a pink lily.
  const pen = ctx.pen;
  const water = tone(ctx.c('water'), 0.2, 0.35);
  const pad = tone(ctx.c('pad'), 0.22, 0.25);
  const frog = tone(ctx.c('frog'), 0.25, 0.3);
  return g(
    {},
    inked(ellipseD(0, 8, 84, 22), water.fill, pen.ink, 3),
    line('M-70 14q14 -5 28 0M40 18q14 -5 28 0', { ink: water.light, w: 2.5 }),
    lilyPad(0, 2, 58, pad, pen, null),
    // Lily flower on its own stalk behind, the frog sitting on the pad.
    ...[-40, -15, 10, 35].map((a) =>
      inked(
        `M-30 -10l${r2(Math.sin((a * Math.PI) / 180) * 22 - 6)} -26l12 0Z`,
        ctx.c('lily'),
        pen.ink,
        2.5,
      ),
    ),
    flat(ellipseD(-30, -14, 6, 4), '#F2C94C'),
    inked(
      smoothD(
        [
          [2, -2],
          [6, -24],
          [22, -34],
          [40, -26],
          [44, -4],
        ],
        true,
        0.7,
      ),
      frog.fill,
      pen.ink,
      pen.w,
    ),
    flat(ellipseD(26, -10, 12, 6), frog.light),
    inked(ellipseD(14, -30, 7, 7), frog.fill, pen.ink, 2.5),
    flat(ellipseD(15, -31, 3.5, 3.5), pen.ink),
    inked(ellipseD(32, -30, 7, 7), frog.fill, pen.ink, 2.5),
    flat(ellipseD(33, -31, 3.5, 3.5), pen.ink),
    line('M18 -16q8 4 16 0', pen, 2),
    inked(
      smoothD(
        [
          [0, -4],
          [-10, 0],
          [-2, 4],
          [10, 2],
        ],
        true,
        0.6,
      ),
      frog.dark,
      pen.ink,
      2,
    ),
    inked(
      smoothD(
        [
          [44, -6],
          [56, -2],
          [48, 4],
          [36, 2],
        ],
        true,
        0.6,
      ),
      frog.dark,
      pen.ink,
      2,
    ),
  );
}

function papyrusClump(seed: number) {
  return (ctx: PropCtx): string => {
    const pen = ctx.pen;
    const head = tone(ctx.c('papyrus'), 0.22, 0.25);
    const parts: string[] = [
      inked(
        smoothD(
          [
            [-150, 140],
            [-120, 104],
            [-40, 92],
            [60, 94],
            [130, 104],
            [150, 140],
          ],
          true,
          0.7,
        ),
        ctx.c('mud'),
        pen.ink,
        pen.w,
      ),
    ];
    const n = 7;
    for (let k = 0; k < n; k++) {
      const f = k / (n - 1) - 0.5;
      const hh = 230 + ctx.rnd() * 60 - Math.abs(f) * 80 + ((k + seed) % 2) * 20;
      parts.push(
        papyrus(
          f * 200,
          130,
          hh,
          f * 140 + (ctx.rnd() - 0.5) * 30,
          ctx.c('papyrusStem'),
          head,
          pen,
        ),
      );
    }
    parts.push(tuft(ctx.rnd, -110, 132, 70, tone(ctx.c('reed'), 0.22, 0.25), pen, 8));
    parts.push(tuft(ctx.rnd, 110, 134, 60, tone(ctx.c('grass'), 0.22, 0.25), pen, 8));
    return g({}, ...parts);
  };
}

export const OKAVANGO_PLAN: BiomeArtPlan = {
  biome: 'okavango-spring',
  layers: {
    sky: { top: 0, height: 1080, draw: sky },
    far_ridge: { top: 380, height: 280, draw: farRidge },
    far_veld: { top: 548, height: 232, draw: farVeld },
    mid: { top: 630, height: 280, draw: mid },
    near: { top: 820, height: 260, draw: near },
    foreground: { top: 880, height: 200, draw: foreground },
  },
  props: {
    'okavango/reeds_a': { draw: reeds(1) },
    'okavango/reeds_b': { draw: reeds(2) },
    'okavango/reeds_c': { draw: reeds(3) },
    'okavango/reeds_d': { draw: reeds(4) },
    'okavango/mokoro_pole': { draw: mokoroPole },
    'okavango/sausage_tree': { draw: sausageTree },
    'okavango/hippo': { draw: hippo },
    'okavango/lily_frog': { draw: lilyFrog },
    'okavango/papyrus_a': { draw: papyrusClump(1) },
    'okavango/papyrus_b': { draw: papyrusClump(2) },
  },
};
