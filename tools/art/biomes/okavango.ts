// Okavango spring (bible §4.2): a fresh blue sky with spring cumulus, a flat floodplain with tree
// islands of jackalberry and ilala palms on the horizon, green grass cut by water channels, reed
// beds and papyrus, a sausage tree, a hippo in the shallows, a lily pad with a reed frog, a
// mokoro marker pole. No jacarandas (bible §2). Soft light from the upper left. D-031.
import { bareBranch, plantLook, seedTuft } from '../flora';
import { ilalaPalm, jackalberry, sausageTree as sausageSpecies } from '../species';
import type { BiomeArtPlan, LayerCtx, PropCtx } from '../landscape';
import {
  edgePts,
  flat,
  groundD,
  hatch,
  line,
  mix,
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
import { groundBand, softSky } from './karoo';
import { foregroundClumps, midScrub, nearGrass, verVeld } from './common';

// --- shapes --------------------------------------------------------------------------------

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
    // v1.6: a feathery plume, a soft spindle of fine drooping hairs, lit on the left.
    el('path', {
      d: smoothD(
        [
          [tx - 6, ty + 32],
          [tx - 9, ty + 10],
          [tx + 1, ty - 9],
          [tx + 9, ty + 12],
          [tx + 5, ty + 32],
        ],
        true,
        0.8,
      ),
      fill: plume,
      stroke: mix(pen.ink, plume, 0.5),
      'stroke-width': pen.w * 0.35,
    }),
    el('path', {
      d: Array.from({ length: 9 }, (_, k) => {
        const yy = ty - 4 + k * 4;
        const side = k % 2 === 0 ? -1 : 1;
        return `M${r2(tx)} ${r2(yy)}q${r2(side * 6)} 2 ${r2(side * 9)} 9`;
      }).join(''),
      fill: 'none',
      stroke: shade(plume, 0.3),
      'stroke-width': 1,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: `M${r2(tx - 4)} ${r2(ty + 26)}Q${r2(tx - 7)} ${r2(ty + 8)} ${r2(tx)} ${r2(ty - 6)}`,
      fill: 'none',
      stroke: shade(plume, 0.45),
      'stroke-width': 1.6,
      'stroke-linecap': 'round',
    }),
  );
}

/**
 * A papyrus stem with its umbel (v1.6, D-042): a triangular stem and a loose mophead of many
 * thin drooping rays, lit on top and shaded under, with tiny brown flower spikelets at the tips.
 */
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
  const back: string[] = [];
  const front: string[] = [];
  const tips: string[] = [];
  const n = 26;
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1);
    const a = Math.PI * (1.0 + f * 1.0) + Math.sin(k * 7.3) * 0.08;
    const r = h * 0.22 * (0.75 + ((k * 5) % 7) * 0.05);
    const ex = tx + Math.cos(a) * r;
    const ey = ty + Math.sin(a) * r * 0.55 + r * (0.3 + Math.abs(Math.cos(a)) * 0.25);
    const d = `M${r2(tx)} ${r2(ty)}Q${r2(tx + Math.cos(a) * r * 0.6)} ${r2(ty + Math.sin(a) * r * 0.75)} ${r2(ex)} ${r2(ey)}`;
    (k % 3 === 0 ? back : front).push(d);
    if (k % 2 === 0) tips.push(ellipseD(ex, ey, 1.6, 1.2));
  }
  const rw = Math.max(1.2, h * 0.008);
  return g(
    {},
    el('path', {
      d: `M${r2(x)} ${r2(base)}Q${r2(x + lean * 0.3)} ${r2(base - h * 0.5)} ${r2(tx)} ${r2(ty)}`,
      fill: 'none',
      stroke: pen.ink,
      'stroke-width': 4 + pen.w * 0.6,
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
      d: `M${r2(x - 1)} ${r2(base)}Q${r2(x + lean * 0.3 - 1)} ${r2(base - h * 0.5)} ${r2(tx - 1)} ${r2(ty)}`,
      fill: 'none',
      stroke: shade(stem, 0.3),
      'stroke-width': 1.2,
    }),
    el('path', {
      d: [...back, ...front].join(''),
      fill: 'none',
      stroke: mix(pen.ink, head.dark, 0.5),
      'stroke-width': rw + 1.4,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: back.join(''),
      fill: 'none',
      stroke: head.dark,
      'stroke-width': rw,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: front.join(''),
      fill: 'none',
      stroke: head.fill,
      'stroke-width': rw,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: front.slice(0, Math.ceil(front.length / 2)).join(''),
      fill: 'none',
      stroke: head.light,
      'stroke-width': rw * 0.5,
      'stroke-linecap': 'round',
    }),
    el('path', { d: tips.join(''), fill: '#8A6A3A' }),
    flat(ellipseD(tx, ty, 4, 3), head.dark),
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
  // A centred pad with a notch on the right: the long way round from −14° to +14°.
  const a1 = (-14 * Math.PI) / 180;
  const a2 = (14 * Math.PI) / 180;
  const ry = r * 0.35;
  const d = `M${r2(x)} ${r2(y)}L${r2(x + r * Math.cos(a1))} ${r2(y + ry * Math.sin(a1))}A${r2(r)} ${r2(ry)} 0 1 0 ${r2(x + r * Math.cos(a2))} ${r2(y + ry * Math.sin(a2))}Z`;
  const veins: string[] = [];
  for (let k = 0; k < 9; k++) {
    const a = a2 + 0.25 + (k / 8) * (Math.PI * 2 - (a2 - a1) - 0.5);
    veins.push(
      `M${r2(x)} ${r2(y)}L${r2(x + Math.cos(a) * r * 0.85)} ${r2(y + Math.sin(a) * ry * 0.85)}`,
    );
  }
  const out = [
    inked(d, t.fill, pen.ink, pen.w),
    flat(ellipseD(x + r * 0.15, y + ry * 0.3, r * 0.75, ry * 0.45), t.dark, { opacity: 0.6 }),
    el('path', {
      d: veins.join(''),
      fill: 'none',
      stroke: t.dark,
      'stroke-width': 0.8,
      opacity: 0.7,
    }),
    flat(ellipseD(x - r * 0.3, y - r * 0.08, r * 0.35, r * 0.08), t.light),
  ];
  if (flower !== null) {
    const fx = x + r * 0.2;
    const fy = y - r * 0.1;
    // A water lily: pointed petals in two rings, the back ones shaded, a yellow heart.
    for (const [a, k, c] of [
      [-70, 0.42, shade(flower, -0.2)],
      [-35, 0.48, shade(flower, -0.2)],
      [35, 0.48, shade(flower, -0.2)],
      [70, 0.42, shade(flower, -0.2)],
      [-50, 0.4, flower],
      [-15, 0.46, flower],
      [15, 0.46, flower],
      [50, 0.4, flower],
    ] as const) {
      const rad = (a * Math.PI) / 180;
      const tipX = fx + Math.sin(rad) * r * k;
      const tipY = fy - Math.cos(rad) * r * k * 0.9;
      out.push(
        inked(
          `M${r2(fx - 3)} ${r2(fy)}Q${r2((fx + tipX) / 2 - 4)} ${r2((fy + tipY) / 2)} ${r2(tipX)} ${r2(tipY)}Q${r2((fx + tipX) / 2 + 4)} ${r2((fy + tipY) / 2)} ${r2(fx + 3)} ${r2(fy)}Z`,
          c,
          mix(pen.ink, flower, 0.4),
          pen.w * 0.4,
        ),
      );
    }
    out.push(
      flat(ellipseD(fx, fy - 3, 4, 3), '#F2C94C'),
      flat(ellipseD(fx - 1, fy - 4, 1.6, 1.2), '#FFF0A0'),
    );
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
  return softSky(ctx, {
    stops: [
      [0, ctx.raw('skyTop')],
      [0.35, ctx.raw('skyMid')],
      [0.58, ctx.raw('skyBottom')],
      [1, ctx.raw('horizon')],
    ],
    cloud: {
      lit: ctx.raw('cloud'),
      body: mix(ctx.raw('cloud'), ctx.raw('skyMid'), 0.3),
      base: ctx.raw('cloudShadow'),
    },
    base: 590,
    size: [70, 120],
    streaks: 4,
  });
}

function farRidge(ctx: LayerCtx): string {
  // Tree islands on the flat horizon: jackalberry crowns and ilala palms, hazed blue-green.
  const parts: string[] = [];
  const horizon = ctx.raw('horizon');
  const backPen: Pen = { ink: mix(ctx.pen.ink, horizon, 0.35), w: 1.5 };
  // D-035: far beyond the flat delta, a few low quartzite hills in the haze (like the Tsodilo
  // Hills at the panhandle): long low ridges, knobbly koppies, wide gaps of open horizon.
  const hills = mountainRow(
    ctx.rnd,
    [
      { kind: 'massif', w: 1.4 },
      { kind: 'koppie', w: 1.4 },
      { kind: 'boulders', w: 0.6 },
    ],
    {
      x0: 80,
      x1: ctx.width - 200,
      base: 640,
      width: [300, 620],
      height: [100, 175],
      overlap: [-1.6, -0.6],
      haze: 0.62,
    },
  );
  parts.push(
    ...paintRow(ctx.rnd, hills, rockColours(ctx.raw), { ink: backPen.ink, w: 1.3 }, horizon),
  );
  for (let x = -60; x < ctx.width; x += 48 + ctx.rnd() * 44)
    // v1.6 (D-042): the hazed back tree line as far jackalberries (broken canopies, more haze).
    parts.push(
      jackalberry(
        ctx.rnd,
        x,
        642,
        100 + ctx.rnd() * 40,
        { tint: (c) => mix(ctx.tint(c), horizon, 0.35), pen: backPen },
        'far',
      ),
    );
  for (let x = -40; x < ctx.width;) {
    const w = 240 + ctx.rnd() * 320;
    for (let k = 0; k < w / 50; k++) {
      const tx = x + k * 50 + ctx.rnd() * 20;
      // v1.6 (D-042): ilala palms and jackalberries on the tree islands (far versions).
      if (ctx.rnd() < 0.3) parts.push(ilalaPalm(ctx.rnd, tx, 650, 90 + ctx.rnd() * 40, ctx, 'far'));
      else parts.push(jackalberry(ctx.rnd, tx, 652, 80 + ctx.rnd() * 40, ctx, 'far'));
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
  for (let x = 120; x < ctx.width; x += 300 + ctx.rnd() * 500)
    parts.push(ilalaPalm(ctx.rnd, x, yAt(band.edge, x) + 6, 60 + ctx.rnd() * 20, ctx, 'far'));
  // v1.6 (D-042): the far animals are sprites now (src/game/view/faunaSprites.ts).
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
  // Sedges and grass in irregular clusters, the channel strip kept open; a few low shrubs.
  const items = midScrub(ctx, {
    bushes: 0.25,
    stone: tone(ctx.c('mud'), 0.25, 0.25),
    avoid: (_x, y) => y > 788 && y < 848,
  });
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
  // v1.6 (D-042): jackalberries and ilala palms on the mid plane's island edge.
  const trees: string[] = [];
  for (const [u, h, kind] of [
    [0.16, 270, 'jackalberry'],
    [0.64, 235, 'palm'],
    [0.81, 250, 'jackalberry'],
    [0.98, 205, 'palm'],
  ] as const) {
    const x = ctx.u(u);
    const foot = yAt(band.edge, x) + 34;
    trees.push(
      kind === 'palm'
        ? ilalaPalm(ctx.rnd, x, foot, h, ctx, 'mid')
        : jackalberry(ctx.rnd, x, foot, h, ctx, 'mid'),
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
  const items = nearGrass(ctx, {
    stone: tone(ctx.c('mud'), 0.25, 0.25),
    bushes: 0,
    tuft: (x, y, h, pen) =>
      seedTuft(
        ctx.rnd,
        x,
        y,
        h,
        {
          base: ctx.c('grassDark'),
          blade: ctx.c('grass'),
          tip: ctx.c('grassLight'),
          seed: ctx.c('plume'),
        },
        pen,
        1 + Math.floor(ctx.rnd() * 3),
      ),
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
  const head = tone(ctx.c('papyrus'), 0.22, 0.25);
  return g(
    {},
    ...foregroundClumps(ctx, [ctx.u(0.05), ctx.u(0.94)], (x) => {
      const n = 2 + Math.floor(ctx.rnd() * 3);
      const out: string[] = [];
      const reeds = ctx.rnd() < 0.5;
      for (let k = 0; k < n; k++) {
        const dx = (k - (n - 1) / 2) * (24 + ctx.rnd() * 20);
        const h = 150 + ctx.rnd() * 90;
        out.push(
          reeds
            ? reed(
                x + dx,
                1100,
                h,
                dx * 0.6 + (ctx.rnd() - 0.5) * 20,
                ctx.c('reed'),
                ctx.c('plume'),
                pen,
                6 + ctx.rnd() * 3,
              )
            : papyrus(x + dx, 1100, h, dx * 0.8, ctx.c('papyrusStem'), head, pen),
        );
      }
      return g({}, ...out);
    }),
  );
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
      const hh = Math.min(h * (1.2 + ctx.rnd() * 0.5) * (1 - Math.abs(f) * 0.5), h + 80); // texture room above the base is h + 120 (pad), less the plume
      const stem = k % 3 === 0 ? shade(ctx.c('reed'), -0.15) : ctx.c('reed');
      parts.push(
        reed(
          f * w * 0.8,
          base,
          hh,
          f * w * 0.25 + (ctx.rnd() - 0.5) * 20,
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

/**
 * v1.6 (D-042): the sausage tree by the species art: a broad round crown, smooth grey-brown
 * bark, maroon flowers and sausage fruit on long stalks. Content: the trunk occluder is centred
 * at (0, 95), 70 × 330 (the foot at y 260); birds perch at (−130, −170) on a bare branch.
 */
function sausageTree(ctx: PropCtx): string {
  const t = sausageSpecies(ctx.rnd, 0, 260, 560, ctx, 'near', 9, { w: 205, depth: 0.4, fork: 0.5 });
  const look = plantLook({
    leaf: ctx.tint('#4F7A38'),
    bark: ctx.tint('#7A6E62'),
    ink: ctx.pen.ink,
  });
  return g({}, t.svg, bareBranch(ctx.rnd, [-6, -40], [-150, -166], 14, look, 'smooth'));
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
    inked(ellipseD(0, 16, 146, 22), water.fill, pen.ink, 3),
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
          [-146, 16],
          [146, 16],
          [146, 36],
          [-146, 36],
        ],
        true,
        0.2,
      ),
      water.fill,
    ),
    line('M-140 18q28 -6 56 0t56 0t56 0t56 0t56 0', { ink: water.light, w: 3 }),
    line('M-136 30q20 6 40 0M96 32q20 6 40 0', { ink: water.dark, w: 2.5 }),
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
    inked(ellipseD(-4, 8, 76, 20), water.fill, pen.ink, 3),
    line('M-70 14q14 -5 28 0M40 18q14 -5 28 0', { ink: water.light, w: 2.5 }),
    lilyPad(-4, 2, 54, pad, pen, null),
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
    // v1.6 (D-042): a 256-colour sky (no visible banding) pays for the new trees.
    sky: { top: 0, height: 1080, encode: 'png8', draw: sky },
    // v1.6 (D-042): smaller palettes keep the biome chunk inside 1.5 MB.
    far_ridge: { top: 380, height: 280, colours: 64, draw: farRidge },
    // v1.3: the Ver plane's strip (shown only on maps that open it).
    ver_veld: {
      top: 536,
      height: 52,
      draw: verVeld({ ground: 'grass', light: 'grassLight', scrub: 'bossie' }),
    },
    far_veld: { top: 464, height: 232, colours: 64, draw: farVeld },
    mid: { top: 380, height: 530, colours: 96, draw: mid },
    near: { top: 820, height: 260, colours: 80, draw: near },
    foreground: { top: 880, height: 200, fadeTop: 28, colours: 96, draw: foreground },
  },
  props: {
    'okavango/reeds_a': { colours: 80, draw: reeds(1) },
    'okavango/reeds_b': { colours: 80, draw: reeds(2) },
    'okavango/reeds_c': { colours: 80, draw: reeds(3) },
    'okavango/reeds_d': { colours: 80, draw: reeds(4) },
    'okavango/mokoro_pole': { draw: mokoroPole },
    'okavango/sausage_tree': {
      draw: sausageTree,
      wobble: false,
      colours: 96,
      frame: { w: 480, h: 640, ox: 240, oy: 370 },
    },
    'okavango/hippo': { draw: hippo },
    'okavango/lily_frog': { draw: lilyFrog },
    'okavango/papyrus_a': { colours: 80, draw: papyrusClump(1) },
    'okavango/papyrus_b': { colours: 80, draw: papyrusClump(2) },
  },
};
