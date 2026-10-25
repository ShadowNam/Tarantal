// Shared ground cover for the biome plans (D-031 look review): mid-veld scrub (twiggy shrubs and
// clustered grass), near-ground grass with stones, twigs and stalks, and foreground clumps of
// varied height. Each biome passes its own palette names; every placement comes from the layer's
// seeded PRNG.
import type { LayerCtx } from '../landscape';
import { flat, groundD, mix, nextId, stone, tone, type Pen, type Tone } from '../scenery';
import { el, ellipseD, g } from '../svg';
import { grassField, pick, stalk, tuftOf, type TuftKind, type Weighted } from '../vegetation';
import { bush, grassTones } from './karoo';

type Item = { y: number; svg: string };

/** Mid layer: shrubs (if any) and clustered grass, smaller toward the horizon. */
export function midScrub(
  ctx: LayerCtx,
  o: {
    /** Chance a placement is a shrub (else left as a gap for grass). */
    readonly bushes: number;
    readonly stone: Tone;
    readonly avoid?: (x: number, y: number) => boolean;
    /** v1.6 (D-042): the biome's own shrub (default: the generic bush). */
    readonly shrub?: (x: number, y: number, s: number, pen: Pen) => string;
  },
): Item[] {
  const items: Item[] = [];
  for (let x = 20 + ctx.rnd() * 40; x < ctx.width;) {
    const y = 676 + Math.pow(ctx.rnd(), 0.9) * 230;
    const s = 9 + ((y - 660) / 250) * 30;
    if (o.avoid?.(x, y) !== true && ctx.rnd() < o.bushes) {
      const pen: Pen = { ink: ctx.pen.ink, w: s < 16 ? 2.5 : ctx.pen.w };
      if (ctx.rnd() < 0.1) items.push({ y, svg: stoneAt(ctx, x, y, s * 0.6, o.stone, pen) });
      else {
        const size = s * (0.9 + ctx.rnd() * 0.7);
        items.push({
          y,
          svg: o.shrub === undefined ? bush(ctx, x, y, size, pen) : o.shrub(x, y, size, pen),
        });
      }
    }
    x += ctx.rnd() < 0.15 ? 140 + ctx.rnd() * 160 : 18 + ctx.rnd() * 70;
  }
  items.push(
    ...grassField(ctx.rnd, {
      x0: 0,
      x1: ctx.width,
      y0: 690,
      y1: 905,
      h: [10, 18],
      grow: 1.6,
      gap: 80,
      grass: grassTones(ctx),
      pen: { ink: ctx.pen.ink, w: 2.5 },
      twigs: { p: 0.2, colour: ctx.c('twig') },
      ...(o.avoid === undefined ? {} : { avoid: o.avoid }),
    }),
  );
  return items;
}

function stoneAt(ctx: LayerCtx, x: number, y: number, r: number, t: Tone, pen: Pen): string {
  return stone(ctx.rnd, x, y, r, t, pen);
}

/** Near layer: clustered grass (a calmer band where the pop-ups rise), stones, twigs, stalks. */
export function nearGrass(
  ctx: LayerCtx,
  o: {
    readonly stone: Tone;
    readonly bushes?: number;
    readonly gap?: number;
    /** v1.6 (D-042): the biome's own shrub and seed-head tuft. */
    readonly shrub?: (x: number, y: number, s: number, pen: Pen) => string;
    readonly tuft?: (x: number, y: number, h: number, pen: Pen) => string;
  },
): Item[] {
  const pen: Pen = { ink: ctx.pen.ink, w: 5 };
  const items = grassField(ctx.rnd, {
    x0: 0,
    x1: ctx.width,
    y0: 856,
    y1: 1078,
    h: [28, 50],
    grow: 1.3,
    gap: o.gap ?? 95,
    grass: grassTones(ctx),
    pen: { ink: ctx.pen.ink, w: 4 },
    stones: { p: 0.22, tone: o.stone },
    twigs: { p: 0.3, colour: ctx.c('twig') },
    stalks: { p: 0.25, colour: ctx.c('bleached'), head: ctx.c('seed') },
    avoid: (_x, y) => y > 905 && y < 965 && ctx.rnd() < 0.6,
  });
  const nb = o.bushes ?? 1;
  for (
    let x = 200 + ctx.rnd() * 300;
    x < ctx.width;
    x += (450 + ctx.rnd() * 800) / Math.max(0.2, nb)
  ) {
    if (nb <= 0) break;
    const y = 960 + ctx.rnd() * 60;
    const size = 24 + ctx.rnd() * 18;
    items.push({
      y,
      svg: o.shrub === undefined ? bush(ctx, x, y, size, pen) : o.shrub(x, y, size, pen),
    });
  }
  if (o.tuft !== undefined)
    for (let x = 60 + ctx.rnd() * 200; x < ctx.width; x += 140 + ctx.rnd() * 320) {
      const y = 880 + ctx.rnd() * 190;
      if (y > 905 && y < 965) continue;
      items.push({ y, svg: o.tuft(x, y, 34 + ((y - 860) / 220) * 26, { ink: ctx.pen.ink, w: 3 }) });
    }
  return items;
}

/** Foreground: sparse clumps of mixed tufts with varied heights and a few tall seed heads. */
export function foregroundClumps(
  ctx: LayerCtx,
  avoidX: readonly number[],
  extra?: (x: number) => string,
): string[] {
  const parts: string[] = [];
  const pen = ctx.pen;
  const grass = grassTones(ctx, 0.3);
  const kinds: Weighted<TuftKind>[] = [
    { v: 'fan', w: 3 },
    { v: 'seeding', w: 2.5 },
    { v: 'wispy', w: 2 },
    { v: 'upright', w: 2 },
    { v: 'windswept', w: 1.5 },
  ];
  for (let x = 160 + ctx.rnd() * 200; x < ctx.width; x += 500 + ctx.rnd() * 800) {
    if (avoidX.some((a) => Math.abs(a - x) < 320)) continue;
    if (extra !== undefined && ctx.rnd() < 0.35) parts.push(extra(x));
    const n = 2 + Math.floor(ctx.rnd() * 5);
    for (let k = 0; k < n; k++) {
      const tx = x + (ctx.rnd() - 0.5) * 220;
      const h = 70 + Math.pow(ctx.rnd(), 1.5) * 140;
      parts.push(
        tuftOf(
          pick(ctx.rnd, kinds),
          ctx.rnd,
          tx,
          1088 + ctx.rnd() * 8,
          h,
          pick(ctx.rnd, grass),
          pen,
          ctx.c('seed'),
        ),
      );
    }
    if (ctx.rnd() < 0.5)
      parts.push(
        stalk(
          ctx.rnd,
          x + (ctx.rnd() - 0.5) * 160,
          1090,
          180 + ctx.rnd() * 60,
          ctx.c('bleached'),
          ctx.c('seed'),
          { ink: pen.ink, w: 3 },
        ),
      );
  }
  return parts;
}

export const stoneTone = (c: string): Tone => tone(c, 0.25, 0.22);

/**
 * v1.3 (D-036): the Ver plane's layer — a strip of distant plain at the foot of the far ridge.
 * Birds stand on it at y 552–566, a few px tall; the far veld's horizon (≈ 573) hides its lower
 * edge. Semi-realistic distance (D-035): no ink at all, colours hazed toward the horizon (the
 * config haze for ver_veld), a soft lit-from-the-left tonal ramp, rows of tiny shrubs whose
 * shadow side is a darker shade of their own colour, and a bright heat line where it meets the
 * ridge. Each biome passes its own palette names.
 */
export function verVeld(names: {
  readonly ground: string;
  readonly light: string;
  readonly scrub: string;
}): (ctx: LayerCtx) => string {
  return (ctx) => {
    const parts: string[] = [];
    const ground = ctx.c(names.ground);
    const light = ctx.c(names.light);
    const horizon = ctx.raw('horizon');
    const grad = nextId();
    parts.push(
      el(
        'defs',
        {},
        el(
          'linearGradient',
          { id: grad, x1: 0, y1: 0, x2: 0, y2: 1 },
          el('stop', { offset: 0, 'stop-color': mix(light, horizon, 0.5) }),
          el('stop', { offset: 0.45, 'stop-color': light }),
          el('stop', { offset: 1, 'stop-color': ground }),
        ),
      ),
    );
    // The plain: a gently rolling top edge, fading into the ridge's foot.
    parts.push(
      flat(groundD(ctx.rnd, -40, ctx.width + 40, 546, 2.5, 120, ctx.bottom + 20), `url(#${grad})`),
    );
    // Long soft streaks (pans, tracks, grass patches) along the plain.
    for (let k = 0; k < ctx.width / 90; k++) {
      const x = ctx.rnd() * ctx.width;
      const y = 554 + ctx.rnd() * 26;
      parts.push(
        flat(
          ellipseD(x, y, 24 + ctx.rnd() * 60, 0.8 + ctx.rnd() * 1.4),
          mix(ground, light, ctx.rnd() < 0.5 ? 0.15 : 0.85),
          { opacity: 0.7 },
        ),
      );
    }
    // Rows of distant shrubs: a lit crown, its shadow side (a darker shade of its own colour)
    // and a soft contact shadow on the ground, smaller and paler toward the ridge.
    const scrub = ctx.c(names.scrub);
    const shadow = mix(scrub, '#2A2520', 0.3);
    const lit = mix(scrub, horizon, 0.25);
    const groundShadow = mix(ground, '#3A2E22', 0.28);
    const items: { y: number; svg: string }[] = [];
    for (let x = ctx.rnd() * 6; x < ctx.width; x += 3 + ctx.rnd() * 14) {
      const y = 550 + Math.pow(ctx.rnd(), 0.8) * 32;
      const k = (y - 550) / 32;
      const s = 0.9 + k * 1.8 + ctx.rnd() * 0.7;
      const fade = 0.35 * (1 - k);
      items.push({
        y,
        svg: g(
          {},
          flat(ellipseD(x + s * 0.9, y, s * 1.5, s * 0.35), groundShadow, { opacity: 0.55 }),
          flat(ellipseD(x + s * 0.25, y - s * 0.55, s * 1.25, s * 0.7), mix(shadow, horizon, fade)),
          flat(ellipseD(x - s * 0.3, y - s * 0.75, s * 0.9, s * 0.5), mix(lit, horizon, fade)),
        ),
      });
    }
    // Now and then a stand of distant trees (acacia-like crowns on thin trunks).
    for (let x = 60 + ctx.rnd() * 200; x < ctx.width; x += 180 + ctx.rnd() * 420) {
      const n = 1 + Math.floor(ctx.rnd() * 3);
      for (let i = 0; i < n; i++) {
        const tx = x + i * (5 + ctx.rnd() * 5);
        const y = 553 + ctx.rnd() * 10;
        const h = 6 + ctx.rnd() * 4;
        const w = 4 + ctx.rnd() * 3;
        items.push({
          y,
          svg: g(
            {},
            flat(ellipseD(tx + w * 0.8, y, w * 1.2, 0.8), groundShadow, { opacity: 0.6 }),
            flat(
              `M${tx - 0.35} ${y}L${tx - 0.25} ${y - h * 0.65}L${tx + 0.25} ${y - h * 0.65}L${tx + 0.35} ${y}Z`,
              shadow,
            ),
            flat(ellipseD(tx + w * 0.15, y - h * 0.72, w, h * 0.22), shadow),
            flat(ellipseD(tx - w * 0.2, y - h * 0.8, w * 0.75, h * 0.15), lit),
          ),
        });
      }
    }
    items.sort((a, b) => a.y - b.y);
    parts.push(...items.map((i) => i.svg));
    // Heat shimmer: a thin bright line where the plain meets the ridge.
    parts.push(
      flat(
        groundD(ctx.rnd, -40, ctx.width + 40, 545.5, 0.6, 200, 547.5),
        mix(horizon, '#FFFFFF', 0.4),
        {
          opacity: 0.55,
        },
      ),
    );
    return g({}, ...parts);
  };
}
