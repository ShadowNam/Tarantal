// v1.8c (D-063) Die Oes: the Harvest's farm field in late summer (GDD §12.2). A warm afternoon
// sky; a rocky koppie behind the farm where the baboon troop sits (its seats are fitted to this
// skyline: tools/art/ridgeLine.ts); the farmhouse, a tractor and a bluegum windbreak on the far
// veld; rows of ripe mielies and sunflower patches on the mid plane with the fence along the back
// of the field and its open gap at u 0.5 (the game draws the repair stages and the workers there,
// so the gap and the workers' stretch right of it are kept clear and low); a pumpkin patch with a
// little mielie stubble on the near plane; sunflower clumps in the foreground. Generic farm, no
// brands. Hard light from the upper left.
import type { BiomeArtPlan, LayerCtx, PropCtx } from '../landscape';
import { flat, groundD, line, mix, post, shade, tone, treeBlob, wire, yAt } from '../scenery';
import type { Pen, Rnd, Tone } from '../scenery';
import { el, ellipseD, g, inked, polyD, smoothD } from '../svg';
import { mountain, rockColours } from '../mountains';
import { groundBand, softSky } from './karoo';
import { foregroundClumps } from './common';

/** The fence's gap (content oes.json harvest.gap) and the workers' stretch right of it. */
const GAP_U = 0.5;
const GAP_HALF = 170;
const WORKERS_TO = 520;
/** The fence's ground line on the mid layer. */
const FENCE_Y = 700;

// --- plants -------------------------------------------------------------------------------

/** A ripe mielie plant: a green stalk, long arching leaves, a tassel and one or two cobs in husk. */
function mielie(
  rnd: Rnd,
  x: number,
  foot: number,
  h: number,
  c: (n: string) => string,
  pen: Pen,
): string {
  const lean = (rnd() - 0.5) * h * 0.08;
  const top = foot - h;
  const w = Math.max(2, h * 0.035);
  const stalk = polyD([
    [x - w, foot],
    [x - w * 0.6 + lean, top + h * 0.12],
    [x + w * 0.6 + lean, top + h * 0.12],
    [x + w, foot],
  ]);
  const leafTone = rnd() < 0.3 ? c('mielieDry') : c('mielie');
  const parts: string[] = [inked(stalk, c('mielie'), pen.ink, pen.w * 0.5)];
  const leaves = 4 + Math.floor(rnd() * 2);
  for (let k = 0; k < leaves; k++) {
    const t = 0.25 + (k / leaves) * 0.6;
    const ly = foot - h * t;
    const lx = x + lean * t;
    const side = k % 2 === 0 ? -1 : 1;
    const len = h * (0.36 - t * 0.12) * (0.85 + rnd() * 0.3);
    const tipX = lx + side * len;
    const tipY = ly + len * (0.25 + rnd() * 0.25);
    const d = `M${lx} ${ly}Q${lx + side * len * 0.5} ${ly - len * 0.35} ${tipX} ${tipY}Q${lx + side * len * 0.45} ${ly - len * 0.12} ${lx} ${ly + w * 2}Z`;
    parts.push(inked(d, k % 3 === 2 ? c('mielieDark') : leafTone, pen.ink, pen.w * 0.45));
  }
  // The tassel.
  const tx = x + lean;
  const tassel: string[] = [];
  for (let k = -2; k <= 2; k++)
    tassel.push(
      `M${tx} ${top + h * 0.12}Q${tx + k * h * 0.03} ${top + h * 0.02} ${tx + k * h * 0.05} ${top + h * 0.06}`,
    );
  parts.push(
    el('path', {
      d: tassel.join(''),
      fill: 'none',
      stroke: c('tassel'),
      'stroke-width': Math.max(1.5, h * 0.018),
      'stroke-linecap': 'round',
    }),
  );
  // The cobs in their husks, leaning out of the stalk.
  const cobs = rnd() < 0.5 ? 2 : 1;
  for (let k = 0; k < cobs; k++) {
    const cy = foot - h * (0.45 + k * 0.12);
    const side = k % 2 === 0 ? 1 : -1;
    const cx = x + lean * 0.5 + side * h * 0.05;
    const cob = ellipseD(cx, cy, h * 0.035, h * 0.09);
    parts.push(
      g(
        { transform: `rotate(${side * 18} ${cx} ${cy})` },
        inked(cob, c('husk'), pen.ink, pen.w * 0.5),
        flat(ellipseD(cx, cy - h * 0.06, h * 0.02, h * 0.03), c('cob')),
      ),
    );
  }
  return g({}, ...parts);
}

/** A sunflower: a stalk, two leaves and a nodding head facing the sun (left). */
function sunflower(
  rnd: Rnd,
  x: number,
  foot: number,
  h: number,
  c: (n: string) => string,
  pen: Pen,
): string {
  const top = foot - h;
  const hx = x - h * 0.04;
  const r = h * (0.11 + rnd() * 0.03);
  const parts: string[] = [
    line(
      `M${x} ${foot}Q${x + h * 0.03} ${foot - h * 0.5} ${hx} ${top}`,
      pen,
      Math.max(2, h * 0.04),
    ),
    line(
      `M${x} ${foot}Q${x + h * 0.03} ${foot - h * 0.5} ${hx} ${top}`,
      { ink: c('vine'), w: 1 },
      Math.max(1, h * 0.022),
    ),
  ];
  for (const [t, side] of [
    [0.45, -1],
    [0.65, 1],
  ] as const) {
    const ly = foot - h * t;
    const len = h * 0.2;
    parts.push(
      inked(
        `M${x} ${ly}Q${x + side * len * 0.6} ${ly - len * 0.5} ${x + side * len} ${ly}Q${x + side * len * 0.5} ${ly + len * 0.3} ${x} ${ly}Z`,
        c('vine'),
        pen.ink,
        pen.w * 0.5,
      ),
    );
  }
  const petals: string[] = [];
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const px = hx + Math.cos(a) * r;
    const py = top + Math.sin(a) * r;
    petals.push(ellipseD(px, py, r * 0.42, r * 0.42));
  }
  parts.push(
    inked(petals.join(''), c('sunflower'), pen.ink, pen.w * 0.5),
    inked(ellipseD(hx, top, r * 0.62, r * 0.62), c('sunflowerDisc'), pen.ink, pen.w * 0.4),
    flat(
      ellipseD(hx - r * 0.2, top - r * 0.2, r * 0.22, r * 0.18),
      shade(c('sunflowerDisc'), 0.25),
    ),
  );
  return g({}, ...parts);
}

/** A ripe pumpkin lying on the soil, ribbed, with a curly stalk; lit from the upper left. */
function pumpkin(
  rnd: Rnd,
  x: number,
  foot: number,
  r: number,
  c: (n: string) => string,
  pen: Pen,
): string {
  const t: Tone = tone(rnd() < 0.2 ? mix(c('pumpkin'), c('husk'), 0.4) : c('pumpkin'), 0.25, 0.25);
  const cy = foot - r * 0.7;
  const body = ellipseD(x, cy, r * 1.15, r * 0.75);
  const ribs: string[] = [];
  for (const k of [-0.6, -0.2, 0.2, 0.6])
    ribs.push(
      `M${x + k * r * 0.4} ${cy - r * 0.72}Q${x + k * r * 1.25} ${cy} ${x + k * r * 0.4} ${cy + r * 0.72}`,
    );
  return g(
    {},
    flat(ellipseD(x + r * 0.2, foot - r * 0.05, r * 1.25, r * 0.22), '#5A3418', { opacity: 0.25 }),
    inked(body, t.fill, pen.ink, pen.w),
    flat(ellipseD(x + r * 0.45, cy + r * 0.2, r * 0.6, r * 0.45), t.dark, { opacity: 0.7 }),
    flat(ellipseD(x - r * 0.5, cy - r * 0.35, r * 0.3, r * 0.16), t.light),
    el('path', {
      d: ribs.join(''),
      fill: 'none',
      stroke: t.dark,
      'stroke-width': Math.max(1, pen.w * 0.5),
    }),
    line(
      `M${x} ${cy - r * 0.7}q${r * 0.05} ${-r * 0.3} ${r * 0.25} ${-r * 0.32}`,
      { ink: c('vine'), w: 1 },
      Math.max(2, r * 0.12),
    ),
  );
}

/** A trailing pumpkin vine: a wavy stem with big round leaves. */
function vine(
  rnd: Rnd,
  x: number,
  y: number,
  len: number,
  c: (n: string) => string,
  pen: Pen,
): string {
  const pts: [number, number][] = [];
  for (let k = 0; k <= 6; k++) pts.push([x + (k / 6) * len, y + Math.sin(k * 1.7 + rnd() * 2) * 6]);
  const parts: string[] = [line(smoothD(pts, false, 0.8), { ink: c('mielieDark'), w: 1 }, 3)];
  for (let k = 1; k < 6; k += 1) {
    const p = pts[k];
    if (p === undefined) continue;
    const r = 12 + rnd() * 10;
    parts.push(
      inked(
        ellipseD(p[0], p[1] - r * 0.6, r, r * 0.75),
        k % 2 === 0 ? c('vine') : shade(c('vine'), -0.15),
        pen.ink,
        pen.w * 0.4,
      ),
    );
  }
  return g({}, ...parts);
}

// --- layers ---------------------------------------------------------------------------------

function sky(ctx: LayerCtx): string {
  return softSky(ctx, {
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
  });
}

/** The koppie behind the farm (the troop's, centred at u 0.2) and lower hills along the skyline. */
function farRidge(ctx: LayerCtx): string {
  const horizon = ctx.raw('horizon');
  const rock = rockColours(ctx.raw);
  const back: string[] = [];
  // Low hazy hills along the whole skyline.
  for (let x = -200; x < ctx.width + 200;) {
    const w = 420 + ctx.rnd() * 380;
    back.push(
      mountain(
        ctx.rnd,
        { kind: 'koppie', x, base: 622, w, h: 50 + ctx.rnd() * 50, haze: 0.55 },
        rock,
        { ink: mix(ctx.pen.ink, horizon, 0.5), w: 1.2 },
        horizon,
      ),
    );
    x += w * 0.7;
  }
  // The troop's koppie: a broad rounded hill with a fairly level crest (seats along it).
  const cx = ctx.u(0.2);
  const pts: [number, number][] = [
    [cx - 440, 652],
    [cx - 360, 612],
    [cx - 270, 548],
    [cx - 190, 500],
    [cx - 110, 470],
    [cx - 40, 458],
    [cx + 30, 456],
    [cx + 100, 464],
    [cx + 170, 486],
    [cx + 250, 530],
    [cx + 340, 590],
    [cx + 430, 652],
  ];
  const hill = smoothD(pts, false, 0.8) + `L${cx + 430} 662L${cx - 440} 662Z`;
  const clip = `koppie${Math.round(cx)}`;
  const rocks: string[] = [];
  for (let k = 0; k < 18; k++) {
    const bx = cx - 300 + ctx.rnd() * 600;
    const by = 520 + ctx.rnd() * 120;
    const br = 10 + ctx.rnd() * 18;
    rocks.push(
      inked(
        ellipseD(bx, by, br * 1.3, br * 0.8),
        mix(rock.rock, rock.lit, ctx.rnd() * 0.5),
        ctx.pen.ink,
        1,
      ),
    );
  }
  for (let k = 0; k < 14; k++) {
    const bx = cx - 330 + ctx.rnd() * 660;
    const by = 560 + ctx.rnd() * 80;
    rocks.push(
      flat(ellipseD(bx, by, 10 + ctx.rnd() * 8, 6 + ctx.rnd() * 4), rock.bush ?? rock.shadow),
    );
  }
  return g(
    {},
    ...back,
    el('clipPath', { id: clip }, el('path', { d: hill })),
    inked(hill, mix(rock.rock, horizon, 0.15), ctx.pen.ink, 1.6),
    g(
      { 'clip-path': `url(#${clip})` },
      flat(ellipseD(cx + 200, 590, 260, 140), mix(rock.shadow, horizon, 0.3), { opacity: 0.5 }),
      flat(ellipseD(cx - 120, 500, 150, 34), mix(rock.lit, horizon, 0.2), { opacity: 0.6 }),
      ...rocks,
    ),
  );
}

/** The far veld: stubble fields, a farm road, the bluegum windbreak (the farmhouse and tractor
 *  are props). */
function farVeld(ctx: LayerCtx): string {
  const band = groundBand(ctx, 592, 3, 140, ctx.c('veldLight'));
  const inside: string[] = [
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 640, 5, 160, ctx.bottom + 40),
      mix(ctx.c('veldLight'), ctx.c('veld'), 0.5),
    ),
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 690, 6, 180, ctx.bottom + 40), ctx.c('veld')),
  ];
  // Stubble rows (fine lines) and the farm road winding to the farmhouse.
  const rows: string[] = [];
  for (let y = 600; y < 700; y += 7) rows.push(`M-40 ${y}L${ctx.width + 40} ${y + 2}`);
  inside.push(
    el('path', {
      d: rows.join(''),
      fill: 'none',
      stroke: shade(ctx.c('veld'), -0.12),
      'stroke-width': 1,
    }),
  );
  const fx = ctx.u(0.2);
  inside.push(
    flat(
      `M${fx + 60} 612Q${fx + 400} 650 ${fx + 700} 700L${fx + 760} 700Q${fx + 430} 646 ${fx + 80} 612Z`,
      ctx.c('track'),
    ),
  );
  const parts = [
    band.svg,
    g({ 'clip-path': `url(#${band.clip})` }, ...inside),
    line(smoothD(band.edge, false, 0.8), ctx.pen),
  ];
  // The bluegum windbreak behind the farmhouse, and a few more trees along the road.
  const gum = tone(ctx.c('tree'), 0.25, 0.2);
  for (let k = 0; k < 6; k++) {
    const x = fx + 200 + k * 44 + ctx.rnd() * 12;
    parts.push(
      treeBlob(
        ctx.rnd,
        x,
        yAt(band.edge, x) + 6,
        40 + ctx.rnd() * 12,
        80 + ctx.rnd() * 20,
        gum,
        ctx.c('trunk'),
        { ink: ctx.pen.ink, w: 1.2 },
      ),
    );
  }
  for (let x = 80; x < ctx.width; x += 300 + ctx.rnd() * 400) {
    if (Math.abs(x - fx) < 320) continue;
    parts.push(
      treeBlob(
        ctx.rnd,
        x,
        yAt(band.edge, x) + 6,
        30 + ctx.rnd() * 14,
        50 + ctx.rnd() * 26,
        gum,
        ctx.c('trunk'),
        { ink: ctx.pen.ink, w: 1.2 },
      ),
    );
  }
  return g({}, ...parts);
}

/** The field: ripe mielie rows and sunflower patches, the fence along the back with its gap. */
function mid(ctx: LayerCtx): string {
  const c = ctx.c;
  const band = groundBand(ctx, 688, 3, 160, c('soil'));
  const gap = ctx.u(GAP_U);
  const clearL = gap - GAP_HALF - 60;
  const clearR = gap + GAP_HALF + WORKERS_TO;
  const inside: string[] = [
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 730, 5, 170, ctx.bottom + 40),
      mix(c('soil'), c('soilDark'), 0.3),
    ),
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 820, 8, 190, ctx.bottom + 40), c('soilDark')),
  ];
  // Furrows across the field.
  const furrows: string[] = [];
  for (let y = 706; y < 900; y += 12 + (y - 700) * 0.06)
    furrows.push(`M-40 ${y}L${ctx.width + 40} ${y + 1}`);
  inside.push(
    el('path', {
      d: furrows.join(''),
      fill: 'none',
      stroke: shade(c('soil'), -0.18),
      'stroke-width': 2,
    }),
  );
  // The farm track coming through the gap into the field.
  inside.push(
    flat(
      `M${gap - GAP_HALF + 20} 690L${gap + GAP_HALF - 20} 690L${gap + GAP_HALF + 40} 910L${gap - GAP_HALF - 40} 910Z`,
      mix(c('track'), c('soil'), 0.55),
    ),
  );
  const parts: string[] = [
    band.svg,
    g({ 'clip-path': `url(#${band.clip})` }, ...inside),
    line(smoothD(band.edge, false, 0.8), ctx.pen),
  ];
  // The fence along the back of the field (posts and three wires), open at the gap.
  const postTone = tone(c('wood'), 0.3, 0.22);
  const pen: Pen = { ink: ctx.pen.ink, w: 2 };
  const fence: string[] = [];
  const runs: [number, number][] = [
    [-60, gap - GAP_HALF],
    [gap + GAP_HALF, ctx.width + 60],
  ];
  for (const [a, b] of runs) {
    const posts: number[] = [];
    for (let x = a; x <= b; x += 110) posts.push(Math.min(x, b));
    if (posts.at(-1) !== b) posts.push(b);
    for (const h of [62, 44, 26])
      fence.push(
        wire(
          posts.map((x) => [x, FENCE_Y - h] as [number, number]),
          3,
          { ink: shade(c('metal'), -0.3), w: 1 },
          1.4,
        ),
      );
    for (const x of posts)
      fence.push(post(x, FENCE_Y + 2, 70, x === a || x === b ? 9 : 7, postTone, pen));
  }
  parts.push(...fence);
  // Mielie rows (back to front) and sunflower patches, clear of the gap and the workers' stretch.
  const items: { y: number; svg: string }[] = [];
  const sunPatch = (x: number): boolean =>
    (x > ctx.u(0.06) && x < ctx.u(0.11)) ||
    (x > ctx.u(0.38) && x < ctx.u(0.43)) ||
    (x > ctx.u(0.93) && x < ctx.u(0.98));
  for (const [foot, step, h] of [
    [712, 30, 120],
    [738, 34, 155],
    [790, 40, 185],
  ] as const) {
    for (let x = -20 + ctx.rnd() * step; x < ctx.width + 20; x += step * (0.8 + ctx.rnd() * 0.4)) {
      if (x > clearL && x < clearR) continue;
      const y = foot + (ctx.rnd() - 0.5) * 6;
      const hh = h * (0.88 + ctx.rnd() * 0.22);
      const pen2: Pen = { ink: ctx.pen.ink, w: 2.2 };
      items.push({
        y,
        svg: sunPatch(x)
          ? sunflower(ctx.rnd, x, y, hh * 0.85, c, pen2)
          : mielie(ctx.rnd, x, y, hh, c, pen2),
      });
    }
  }
  // Low trampled stalks and a few fallen cobs in the cleared stretch.
  for (let x = clearL; x < clearR; x += 60 + ctx.rnd() * 60) {
    const y = 760 + ctx.rnd() * 80;
    items.push({
      y,
      svg: line(
        `M${x} ${y}l${20 + ctx.rnd() * 20} ${-6 - ctx.rnd() * 6}`,
        { ink: c('mielieDry'), w: 1 },
        4,
      ),
    });
  }
  items.sort((a, b) => a.y - b.y);
  parts.push(...items.map((i) => i.svg));
  return g({}, ...parts);
}

/** The near plane: the pumpkin patch, with a little stubble at its back edge. */
function near(ctx: LayerCtx): string {
  const c = ctx.c;
  const band = groundBand(ctx, 872, 6, 140, mix(c('soil'), c('soilDark'), 0.4));
  const inside: string[] = [
    flat(groundD(ctx.rnd, -40, ctx.width + 40, 920, 8, 200, ctx.bottom + 40), c('soilDark')),
    flat(
      groundD(ctx.rnd, -40, ctx.width + 40, 1010, 10, 230, ctx.bottom + 40),
      shade(c('soilDark'), -0.08),
    ),
  ];
  const furrows: string[] = [];
  for (let y = 890; y < 1080; y += 18 + (y - 880) * 0.05)
    furrows.push(`M-40 ${y}L${ctx.width + 40} ${y + 2}`);
  inside.push(
    el('path', {
      d: furrows.join(''),
      fill: 'none',
      stroke: shade(c('soilDark'), -0.2),
      'stroke-width': 3,
    }),
  );
  const items: { y: number; svg: string }[] = [];
  const pen: Pen = { ink: ctx.pen.ink, w: 4 };
  // Stubble along the back edge (cut stalks).
  for (let x = ctx.rnd() * 40; x < ctx.width; x += 30 + ctx.rnd() * 40) {
    const y = 884 + ctx.rnd() * 14;
    items.push({
      y,
      svg: line(
        `M${x} ${y}l${(ctx.rnd() - 0.5) * 8} ${-26 - ctx.rnd() * 22}`,
        { ink: c('mielieDry'), w: 1 },
        5,
      ),
    });
  }
  for (let x = 40 + ctx.rnd() * 80; x < ctx.width; x += 220 + ctx.rnd() * 160) {
    const y = 940 + ctx.rnd() * 110;
    items.push({ y: y - 1, svg: vine(ctx.rnd, x - 120, y, 240, c, { ink: ctx.pen.ink, w: 3 }) });
    items.push({
      y,
      svg: pumpkin(ctx.rnd, x + (ctx.rnd() - 0.5) * 60, y, 26 + ctx.rnd() * 14, c, pen),
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
  return g({}, ...foregroundClumps(ctx, [ctx.u(0.05), ctx.u(0.94)]));
}

// --- props ----------------------------------------------------------------------------------

/** The farmhouse (foot at 0): white walls, a corrugated iron roof, a stoep with posts. */
function farmhouse(ctx: PropCtx): string {
  const c = ctx.c;
  const pen: Pen = { ink: ctx.pen.ink, w: 2 };
  const w = 280;
  const wallTop = -86;
  const parts: string[] = [
    inked(
      polyD([
        [-w / 2, 0],
        [-w / 2, wallTop],
        [w / 2, wallTop],
        [w / 2, 0],
      ]),
      c('wall'),
      pen.ink,
      pen.w,
    ),
    flat(
      polyD([
        [w * 0.2, 0],
        [w * 0.2, wallTop],
        [w / 2, wallTop],
        [w / 2, 0],
      ]),
      shade(c('wall'), -0.12),
    ),
    // The roof (corrugated: fine vertical lines).
    inked(
      polyD([
        [-w / 2 - 14, wallTop + 4],
        [-w / 2 + 30, -148],
        [w / 2 - 30, -148],
        [w / 2 + 14, wallTop + 4],
      ]),
      c('roof'),
      pen.ink,
      pen.w,
    ),
  ];
  const corr: string[] = [];
  for (let x = -w / 2; x < w / 2; x += 8)
    corr.push(`M${x} ${wallTop + 2}L${x + (x < 0 ? 6 : -6)} -146`);
  parts.push(
    el('path', {
      d: corr.join(''),
      fill: 'none',
      stroke: shade(c('roof'), -0.2),
      'stroke-width': 1,
    }),
  );
  // The stoep roof and posts, windows, a door, the chimney.
  parts.push(
    inked(
      polyD([
        [-w / 2 - 10, -54],
        [w / 2 + 10, -54],
        [w / 2 + 10, -48],
        [-w / 2 - 10, -48],
      ]),
      shade(c('roof'), -0.1),
      pen.ink,
      1.5,
    ),
    flat(
      polyD([
        [-w / 2, 0],
        [w / 2, 0],
        [w / 2, -8],
        [-w / 2, -8],
      ]),
      c('stoep'),
    ),
  );
  for (let x = -w / 2 + 6; x <= w / 2 - 6; x += 54)
    parts.push(
      flat(
        polyD([
          [x - 2, -48],
          [x + 2, -48],
          [x + 2, -8],
          [x - 2, -8],
        ]),
        c('wood'),
      ),
    );
  for (const x of [-96, -40, 60, 108])
    parts.push(
      inked(
        polyD([
          [x - 12, -40],
          [x + 12, -40],
          [x + 12, -14],
          [x - 12, -14],
        ]),
        '#5C7A8E',
        pen.ink,
        1.5,
      ),
    );
  parts.push(
    inked(
      polyD([
        [8, -44],
        [30, -44],
        [30, -8],
        [8, -8],
      ]),
      c('wood'),
      pen.ink,
      1.5,
    ),
  );
  parts.push(
    inked(
      polyD([
        [70, -150],
        [86, -150],
        [86, -176],
        [70, -176],
      ]),
      c('wall'),
      pen.ink,
      1.5,
    ),
  );
  return g({}, flat(ellipseD(0, 0, w * 0.6, 8), '#5A3418', { opacity: 0.2 }), ...parts);
}

/** A generic farm tractor (foot at 0), red with a green bonnet stripe; no brand. */
function tractor(ctx: PropCtx): string {
  const c = ctx.c;
  const pen: Pen = { ink: ctx.pen.ink, w: 2 };
  const red = tone(c('tractorRed'), 0.28, 0.25);
  const wheel = (x: number, r: number): string =>
    g(
      {},
      inked(ellipseD(x, -r, r, r), c('tyre'), pen.ink, pen.w),
      inked(ellipseD(x, -r, r * 0.45, r * 0.45), c('cob'), pen.ink, 1.2),
    );
  return g(
    {},
    flat(ellipseD(0, 0, 70, 6), '#5A3418', { opacity: 0.25 }),
    // Bonnet, cab and exhaust.
    inked(
      polyD([
        [-6, -60],
        [58, -54],
        [60, -30],
        [-6, -28],
      ]),
      red.fill,
      pen.ink,
      pen.w,
    ),
    flat(
      polyD([
        [-6, -48],
        [58, -44],
        [58, -40],
        [-6, -42],
      ]),
      c('tractorGreen'),
    ),
    inked(
      polyD([
        [-58, -30],
        [-56, -92],
        [-10, -92],
        [-6, -28],
      ]),
      red.fill,
      pen.ink,
      pen.w,
    ),
    inked(
      polyD([
        [-50, -86],
        [-16, -86],
        [-14, -58],
        [-50, -58],
      ]),
      '#9CC0D0',
      pen.ink,
      1.4,
    ),
    line('M34 -56L36 -82', pen, 4),
    wheel(-38, 34),
    wheel(42, 20),
  );
}

/** A clump of tall sunflowers at the edge of the view (foot at 80 in this prop's frame). */
function sunflowerClump(seed: number) {
  return (ctx: PropCtx): string => {
    const pen: Pen = { ink: ctx.pen.ink, w: 4 };
    const parts: string[] = [];
    for (let k = 0; k < 5; k++) {
      const x = (k - 2) * 42 + (ctx.rnd() - 0.5) * 16 + seed;
      parts.push(
        sunflower(ctx.rnd, x, 84, 230 + ctx.rnd() * 80 - Math.abs(k - 2) * 25, ctx.c, pen),
      );
    }
    return g({}, ...parts);
  };
}

export const OES_PLAN: BiomeArtPlan = {
  biome: 'oes',
  layers: {
    sky: { top: 0, height: 1080, encode: 'png8', draw: sky },
    far_ridge: { top: 420, height: 250, colours: 96, draw: farRidge },
    far_veld: { top: 440, height: 300, colours: 112, draw: farVeld },
    mid: { top: 540, height: 380, colours: 128, draw: mid },
    near: { top: 820, height: 260, colours: 112, draw: near },
    foreground: { top: 880, height: 200, fadeTop: 28, colours: 96, draw: foreground },
  },
  props: {
    'oes/farmhouse': {
      draw: farmhouse,
      master: 2,
      wobble: false,
      frame: { w: 380, h: 250, ox: 190, oy: 210 },
    },
    'oes/tractor': {
      draw: tractor,
      master: 2,
      wobble: false,
      frame: { w: 210, h: 184, ox: 105, oy: 144 },
    },
    'oes/sunflowers_a': { draw: sunflowerClump(0), frame: { w: 380, h: 470, ox: 190, oy: 370 } },
    'oes/sunflowers_b': { draw: sunflowerClump(7), frame: { w: 380, h: 470, ox: 190, oy: 370 } },
  },
};
