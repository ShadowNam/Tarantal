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
 * v1.6 (D-042 look note D): a cumulonimbus in the Kalahari light: a broad billowing mass with a
 * tower or two (billowCloud), warm cream tops, a flat grey-blue base, a thin wispy anvil and grey
 * rain shafts; soft edges, no outline, no highlight dots, no purple cast.
 */
export function thunderhead(rnd: Rnd, x: number, base: number, w: number, h: number): string {
  const tones: BillowColours = { base: '#8C98AC', body: '#C6CCD6', top: '#FFF2DE' };
  const shafts: string[] = [];
  for (let k = 0; k < 6; k++) {
    const rx = x + w * (0.25 + k * 0.1 + (rnd() - 0.5) * 0.05);
    shafts.push(`M${r2(rx)} ${r2(base - 4)}l${r2(-10 - rnd() * 10)} ${r2(60 + rnd() * 50)}`);
  }
  const wisps: string[] = [];
  const ay = base - h * 1.05;
  for (let k = 0; k < 8; k++) {
    const y0 = ay + (rnd() - 0.5) * h * 0.12;
    const len = w * (0.4 + rnd() * 0.5);
    wisps.push(
      `M${r2(x + w * 0.45)} ${r2(y0)}q${r2(len * 0.5)} ${r2(-4 - rnd() * 8)} ${r2(len)} ${r2(3 + rnd() * 8)}`,
    );
  }
  return g(
    {},
    el('path', {
      d: shafts.join(''),
      stroke: '#8C96A8',
      'stroke-width': 10,
      'stroke-linecap': 'round',
      opacity: 0.3,
      filter: 'url(#softer)',
      fill: 'none',
    }),
    el('path', {
      d: wisps.join(''),
      fill: 'none',
      stroke: '#F2EADC',
      'stroke-width': 6,
      'stroke-linecap': 'round',
      opacity: 0.45,
      filter: 'url(#soft)',
    }),
    billowCloud(rnd, x + w / 2, base, w, h, tones, { towers: 2 }),
  );
}

/** v1.6 (D-042 look note D): a cloud's three tones, base (shade) to sunlit top. */
export interface BillowColours {
  readonly base: string;
  readonly body: string;
  readonly top: string;
}

/**
 * v1.6 (D-042 look note D): a soft, irregular cumulus mass. Cauliflower billows (ragged lobes,
 * bigger and higher toward the middle, `towers` of them stacking up for a cumulonimbus) in three
 * tonal layers that brighten toward the sunlit top (upper left), cut flat at `base` with a
 * slightly darker grey-blue base; blurred, no outline, no highlight dots.
 */
export function billowCloud(
  rnd: Rnd,
  x: number,
  base: number,
  w: number,
  h: number,
  c: BillowColours,
  o: { readonly towers?: number; readonly blur?: number } = {},
): string {
  const lobes: [number, number, number][] = [];
  const env = (u: number): number => h * Math.pow(Math.max(0, 1 - Math.abs(u)), 0.7);
  // Rows of billows filling the envelope from the base up (sized to the cloud, so a tall
  // cumulonimbus is as full as a flat fair-weather cumulus).
  const rows = Math.max(3, Math.round(h / (w * 0.16)));
  const unit = Math.min(w * 0.15, (h / rows) * 1.1);
  for (let r = 0; r < rows; r++) {
    const f = r / rows;
    const half = Math.max(0.12, Math.pow(1 - f, 0.6) * 0.5);
    const n = Math.max(2, Math.round((half * 2 * w) / (unit * 1.3)));
    for (let k = 0; k < n; k++) {
      const u = (n === 1 ? 0 : (k / (n - 1) - 0.5) * 2 * half) + (rnd() - 0.5) * 0.06;
      const cy = base - unit * 0.7 - f * (h - unit * 1.2) + (rnd() - 0.5) * unit * 0.3;
      if (base - cy > env(u * 2) + unit * 0.4) continue;
      lobes.push([x + u * w, cy, unit * (0.85 + rnd() * 0.35)]);
    }
  }
  for (let t = 0; t < (o.towers ?? 0); t++) {
    const tx = x + (rnd() - 0.5) * w * 0.3;
    let y = base - h * 0.55;
    for (let k = 0; k < 5; k++) {
      const rad = unit * (1.05 - k * 0.08) * (0.9 + rnd() * 0.2);
      lobes.push([tx + (rnd() - 0.5) * rad * 0.8, y, rad]);
      lobes.push([tx + (rnd() < 0.5 ? -1 : 1) * rad * 0.7, y + rad * 0.3, rad * 0.8]);
      y -= rad * 0.7;
    }
  }
  const ragged = (
    dx: number,
    dy: number,
    k: number,
    pick: (l: [number, number, number]) => boolean,
  ): string =>
    lobes
      .filter(pick)
      .map(([lx, ly, rad]) => {
        const n = 13;
        const pts: Pt[] = [];
        const ph = rnd() * 6;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const rr = rad * k * (1 + 0.12 * Math.sin(a * 3 + ph) + 0.06 * Math.sin(a * 5 + ph * 2));
          pts.push([lx + dx * rad + Math.cos(a) * rr, ly + dy * rad + Math.sin(a) * rr * 0.9]);
        }
        return smoothD(pts, true, 0.9);
      })
      .join('');
  const top = Math.min(...lobes.map(([, ly, rad]) => ly - rad));
  const upper = (l: [number, number, number]): boolean => l[1] < top + (base - top) * 0.6;
  const most = (l: [number, number, number]): boolean => l[1] < top + (base - top) * 0.85;
  const blur = nextId();
  const clip = nextId();
  return g(
    {},
    el(
      'defs',
      {},
      el(
        'filter',
        { id: blur, x: '-30%', y: '-40%', width: '160%', height: '180%' },
        el('feGaussianBlur', { stdDeviation: r2(o.blur ?? Math.max(1.2, w * 0.012)) }),
      ),
      el(
        'clipPath',
        { id: clip },
        el('rect', { x: x - w * 2, y: top - h * 2, width: w * 4, height: base - top + h * 2 }),
      ),
    ),
    g(
      { filter: `url(#${blur})`, 'clip-path': `url(#${clip})` },
      el('path', { d: ragged(0, 0, 1, () => true), fill: c.base }),
      el('path', { d: ragged(-0.06, -0.12, 0.9, () => true), fill: c.body }),
      el('path', { d: ragged(-0.2, -0.28, 0.78, most), fill: mix(c.body, c.top, 0.55) }),
      el('path', { d: ragged(-0.3, -0.4, 0.5, upper), fill: c.top }),
      // The flat base: a slightly darker grey-blue band along the bottom.
      el('path', {
        d: ellipseD(x, base - h * 0.04, w * 0.46, h * 0.07),
        fill: mix(c.base, '#5E6A80', 0.2),
      }),
    ),
  );
}
