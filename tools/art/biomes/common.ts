// Shared ground cover for the biome plans (D-031 look review): mid-veld scrub (twiggy shrubs and
// clustered grass), near-ground grass with stones, twigs and stalks, and foreground clumps of
// varied height. Each biome passes its own palette names; every placement comes from the layer's
// seeded PRNG.
import type { LayerCtx } from '../landscape';
import { stone, tone, type Pen, type Tone } from '../scenery';
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
  },
): Item[] {
  const items: Item[] = [];
  for (let x = 20 + ctx.rnd() * 40; x < ctx.width;) {
    const y = 676 + Math.pow(ctx.rnd(), 0.9) * 230;
    const s = 9 + ((y - 660) / 250) * 30;
    if (o.avoid?.(x, y) !== true && ctx.rnd() < o.bushes) {
      const pen: Pen = { ink: ctx.pen.ink, w: s < 16 ? 2.5 : ctx.pen.w };
      if (ctx.rnd() < 0.1) items.push({ y, svg: stoneAt(ctx, x, y, s * 0.6, o.stone, pen) });
      else items.push({ y, svg: bush(ctx, x, y, s * (0.9 + ctx.rnd() * 0.7), pen) });
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
  o: { readonly stone: Tone; readonly bushes?: number; readonly gap?: number },
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
    items.push({ y, svg: bush(ctx, x, y, 24 + ctx.rnd() * 18, pen) });
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
