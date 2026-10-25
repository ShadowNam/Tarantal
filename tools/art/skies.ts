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
 * v1.6 (D-042): a towering cumulonimbus. Cauliflower towers rising from a dark flat base (the
 * tallest in the middle, never a flat top: no mesa), sunlit domes upper left, shaded flanks, a
 * thin wispy anvil streaming off the top, grey rain shafts; soft edges, no ink.
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
  const shafts: string[] = [];
  for (let k = 0; k < 6; k++) {
    const rx = x + w * (0.18 + k * 0.13 + (rnd() - 0.5) * 0.05);
    shafts.push(`M${r2(rx)} ${r2(base - 4)}l${r2(-10 - rnd() * 10)} ${r2(60 + rnd() * 50)}`);
  }
  // Towers: columns of lobes, the middle ones tallest, each column's top a rounded dome.
  const towers = 4 + Math.floor(rnd() * 2);
  const lobes: [number, number, number, number][] = [];
  const domes: [number, number, number][] = [];
  for (let t = 0; t < towers; t++) {
    const f = t / (towers - 1) - 0.5;
    const tx = x + w / 2 + f * w * 0.55 + (rnd() - 0.5) * w * 0.05;
    const th = h * (1 - Math.abs(f) * 1.1 + (rnd() - 0.5) * 0.15);
    const r0 = w * (0.15 + rnd() * 0.03);
    for (let y = base - r0 * 0.5, k = 0; y > base - th && k < 24; k++) {
      const r = r0 * Math.max(0.55, 1 - k * 0.04) * (0.9 + rnd() * 0.2);
      lobes.push([tx + (rnd() - 0.5) * r * 0.7, y, r, k]);
      lobes.push([tx + (rnd() < 0.5 ? -1 : 1) * r * (0.6 + rnd() * 0.4), y - r * 0.15, r * 0.8, k]);
      y -= r * (0.45 + rnd() * 0.15);
    }
    const last = lobes[lobes.length - 1];
    if (last !== undefined) domes.push([last[0], last[1], last[2]]);
  }
  // A broad base mass the towers rise from.
  for (let k = 0; k <= 6; k++) {
    const r = w * (0.17 + rnd() * 0.04);
    lobes.push([x + w * (0.05 + (k / 6) * 0.9), base - r * 0.45, r, 0]);
  }
  const body = lobes.map(([cx, cy, r]) => ellipseD(cx, cy, r, r * 0.88)).join('');
  const lit = domes
    .map(([cx, cy, r]) => ellipseD(cx - r * 0.25, cy - r * 0.3, r * 0.62, r * 0.48))
    .join('');
  const shadeSide = lobes
    .filter((_, i) => i % 2 === 0)
    .map(([cx, cy, r]) => ellipseD(cx + r * 0.35, cy + r * 0.25, r * 0.6, r * 0.55))
    .join('');
  // The anvil: thin wisps streaming downwind from the tallest tower's top.
  const tall = domes.reduce(
    (a, b) => (b[1] < a[1] ? b : a),
    domes[0] ?? [x + w / 2, base - h, w * 0.2],
  );
  const wisps: string[] = [];
  for (let k = 0; k < 9; k++) {
    const y0 = tall[1] - tall[2] * 0.6 + (rnd() - 0.5) * tall[2] * 0.5;
    const len = w * (0.5 + rnd() * 0.6);
    wisps.push(
      `M${r2(tall[0] - tall[2] * 0.4)} ${r2(y0)}q${r2(len * 0.5)} ${r2(-6 - rnd() * 10)} ${r2(len)} ${r2(4 + rnd() * 10)}`,
    );
  }
  const clip = nextId();
  const grad = nextId();
  const top = base - h * 1.15;
  return g(
    {},
    el('path', {
      d: shafts.join(''),
      stroke: rain,
      'stroke-width': 10,
      'stroke-linecap': 'round',
      opacity: 0.3,
      filter: 'url(#softer)',
      fill: 'none',
    }),
    g(
      { filter: 'url(#soft)' },
      el('path', {
        d: wisps.join(''),
        fill: 'none',
        stroke: mix(c.lit, c.body, 0.35),
        'stroke-width': 7,
        'stroke-linecap': 'round',
        opacity: 0.5,
      }),
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
        el('path', { d: shadeSide, fill: c.base, opacity: 0.35 }),
        el('path', { d: lit, fill: c.lit, opacity: 0.7 }),
      ),
    ),
  );
}
