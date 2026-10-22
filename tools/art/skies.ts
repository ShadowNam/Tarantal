// Skies for the interim landscapes (D-031 look review): a smooth vertical gradient (the sky layer
// is packed as a full-colour PNG, so it never bands), soft flat-bottomed cumulus with a lit top
// and a cool shaded base (blurred edges, no hard ink), thin high streaks, and towering
// thunderheads for the Kalahari. Clouds stay out of the flyer band except faint streaks, so navy
// birds keep their contrast (bible §1.5). Seeded PRNG only: the same input gives the same pixels.
import { el, ellipseD, g, r2, smoothD } from './svg';
import { flat, mix, nextId, type Pt, type Rnd } from './scenery';

/** Blur filters used by the clouds (put once in a sky document). */
export function softDefs(): string {
  return el(
    'defs',
    {},
    el(
      'filter',
      { id: 'soft', x: '-10%', y: '-20%', width: '120%', height: '140%' },
      el('feGaussianBlur', { stdDeviation: 1.6 }),
    ),
    el(
      'filter',
      { id: 'softer', x: '-20%', y: '-50%', width: '140%', height: '200%' },
      el('feGaussianBlur', { stdDeviation: 5 }),
    ),
  );
}

/** The sky: a smooth vertical gradient through `stops` (offset 0 … 1 over 0 … height). */
export function skyGradient(
  width: number,
  height: number,
  stops: readonly (readonly [number, string])[],
): string {
  const id = nextId();
  return g(
    {},
    el(
      'defs',
      {},
      el(
        'linearGradient',
        { id, x1: 0, y1: 0, x2: 0, y2: 1 },
        ...stops.map(([o, c]) => el('stop', { offset: o, 'stop-color': c })),
      ),
    ),
    el('rect', { x: 0, y: 0, width, height, fill: `url(#${id})` }),
  );
}

export interface CloudColours {
  /** Sunlit top. */
  readonly lit: string;
  /** Body and the shaded flat base. */
  readonly body: string;
  readonly base: string;
}

/**
 * A soft cumulus: rounded lobes on a flat base (clipped at `base`), lit top fading to a cooler
 * base, a few bright lobe highlights; edges blurred, no ink line.
 */
export function softCumulus(
  rnd: Rnd,
  x: number,
  base: number,
  w: number,
  h: number,
  c: CloudColours,
): string {
  const lobes: [number, number, number][] = [];
  const n = 4 + Math.floor(rnd() * 3);
  for (let k = 0; k < n; k++) {
    const f = (k + 0.5) / n;
    const peak = Math.sin(f * Math.PI);
    const r = (w / n) * (0.75 + rnd() * 0.45) * (0.7 + peak * 0.5);
    lobes.push([
      x + w * f + (rnd() - 0.5) * w * 0.06,
      base - h * (0.25 + peak * 0.55) * (0.85 + rnd() * 0.3) + r * 0.45,
      r,
    ]);
  }
  for (let k = 0; k < 2; k++)
    lobes.push([
      x + w * (0.3 + rnd() * 0.4),
      base - h * (0.55 + rnd() * 0.25) + w * 0.06,
      w * (0.13 + rnd() * 0.06),
    ]);
  const body = lobes.map(([cx, cy, r]) => ellipseD(cx, cy, r, r * 0.82)).join('');
  const clip = nextId();
  const grad = nextId();
  const top = base - h * 1.25;
  return g(
    { filter: 'url(#soft)' },
    el(
      'defs',
      {},
      el(
        'linearGradient',
        { id: grad, gradientUnits: 'userSpaceOnUse', x1: 0, y1: top, x2: 0, y2: base },
        el('stop', { offset: 0, 'stop-color': c.lit }),
        el('stop', { offset: 0.55, 'stop-color': c.body }),
        el('stop', { offset: 1, 'stop-color': c.base }),
      ),
    ),
    el(
      'clipPath',
      { id: clip },
      el('rect', { x: x - w, y: top - h, width: w * 3, height: base - top + h }),
    ),
    g(
      { 'clip-path': `url(#${clip})` },
      el('path', { d: body, fill: `url(#${grad})` }),
      ...lobes
        .slice(0, n)
        .filter((_, i) => i % 2 === 0)
        .map(([cx, cy, r]) =>
          flat(
            ellipseD(cx - r * 0.25, cy - r * 0.45, r * 0.45, r * 0.22),
            mix(c.lit, '#FFFFFF', 0.6),
            { opacity: 0.7 },
          ),
        ),
    ),
  );
}

/** A thin high streak (cirrus): a long tapered wisp, faint. */
export function cirrus(
  rnd: Rnd,
  x: number,
  y: number,
  len: number,
  colour: string,
  opacity: number,
): string {
  const pts: Pt[] = [
    [x, y],
    [x + len * 0.35, y - 3 - rnd() * 3],
    [x + len, y - 2],
    [x + len * 0.6, y + 2.5],
    [x + len * 0.2, y + 1.5],
  ];
  return flat(smoothD(pts, true, 0.9), colour, { opacity: r2(opacity), filter: 'url(#soft)' });
}

/**
 * A distant thunderhead (Kalahari): a tall soft tower of cumulus lobes with a flat anvil top and a
 * shaded flat base with faint rain shafts. Grey-violet, kept lighter than the navy birds.
 */
export function thunderhead(
  rnd: Rnd,
  x: number,
  base: number,
  w: number,
  h: number,
  c: CloudColours,
  rain: string,
): string {
  const parts: string[] = [];
  const shafts: string[] = [];
  for (let k = 0; k < 5; k++) {
    const rx = x + w * (0.2 + k * 0.15 + (rnd() - 0.5) * 0.05);
    shafts.push(`M${r2(rx)} ${r2(base - 4)}l${r2(-14 - rnd() * 8)} ${r2(70 + rnd() * 40)}`);
  }
  parts.push(
    el('path', {
      d: shafts.join(''),
      stroke: rain,
      'stroke-width': 9,
      'stroke-linecap': 'round',
      opacity: 0.35,
      filter: 'url(#softer)',
      fill: 'none',
    }),
  );
  // Tower: stacked cumulus, narrowing upward, then the anvil.
  const tiers = 3;
  for (let t = 0; t < tiers; t++) {
    const tw = w * (1 - t * 0.22);
    const tx = x + (w - tw) * (0.4 + rnd() * 0.2);
    const tb = base - t * h * 0.28;
    parts.push(softCumulus(rnd, tx, tb, tw, h * 0.42, c));
  }
  const ay = base - h * 0.92;
  const anvil = smoothD(
    [
      [x + w * 0.15, ay + h * 0.08],
      [x + w * 0.05, ay - h * 0.02],
      [x + w * 0.4, ay - h * 0.1],
      [x + w * 1.05, ay - h * 0.08],
      [x + w * 1.2, ay + h * 0.02],
      [x + w * 0.75, ay + h * 0.1],
    ],
    true,
    0.8,
  );
  parts.push(flat(anvil, mix(c.lit, c.body, 0.35), { filter: 'url(#soft)', opacity: 0.95 }));
  return g({}, ...parts);
}
