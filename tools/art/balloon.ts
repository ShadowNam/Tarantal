// v1.7d (D-059, art bible §4.5f) Hot-air balloons for the Namibië sky: a tall envelope of
// vertical gores in warm colours (stripes, bands, a zig-zag; never a brand or logo), lit from the
// upper left with a soft shadow side and a sheen, the mouth tapering to a load ring; ropes down
// to a wicker basket (woven texture, a padded rim) with the burner frame over it and two small
// passengers. The flame and a raised fist are their own frames (the view shows them on beats and
// hits). Design px at the far plane, origin at the envelope's middle; no ink outlines.
import {
  BALLOON_SHEET_H,
  BALLOON_SHEET_W,
  BURNER,
  balloonFrames,
} from '../../src/game/view/namib/balloonSheet';
import type { Rgba } from '../assets/image';
import { renderSvg } from './raster';
import { mix, nextId, shade } from './scenery';
import { el, ellipseD, g, r2, svgDoc } from './svg';

/** Envelope half width at height y (−33 top … +33 mouth): a round crown tapering to the mouth. */
function halfWidth(y: number): number {
  const t = (y + 33) / 66; // 0 top … 1 mouth
  if (t < 0.45) return 28 * Math.sqrt(Math.max(0, 1 - ((0.45 - t) / 0.45) ** 2));
  return 28 - (28 - 7) * ((t - 0.45) / 0.55) ** 1.3;
}

interface Design {
  /** Colour of gore k (of `gores`), and of band at height t (0 top … 1 mouth), if any. */
  readonly gore: (k: number) => string;
  readonly band?: (t: number) => string | null;
  readonly zigzag?: string;
}

const DESIGNS: Readonly<Record<string, Design>> = {
  // Red, orange and yellow gores.
  balloon_a: { gore: (k) => ['#D8432E', '#EE8A2C', '#F4C542', '#EE8A2C'][k % 4] ?? '#D8432E' },
  // Deep orange with a cream band and a dark red zig-zag round the middle.
  balloon_b: {
    gore: (k) => (k % 2 === 0 ? '#E06A26' : '#D2561E'),
    band: (t) => (t > 0.36 && t < 0.5 ? '#F2E4C4' : t > 0.72 ? '#8E2A1E' : null),
    zigzag: '#9E2A1C',
  },
  // Terracotta and ochre panels with a teal accent gore.
  balloon_c: {
    gore: (k) => ['#C2603A', '#D9A23E', '#C2603A', '#2E8C8A'][k % 4] ?? '#C2603A',
    band: (t) => (t < 0.12 ? '#F0D9A6' : null),
  },
};

const GORES = 10;

function envelope(d: Design): string {
  const parts: string[] = [];
  const outline: [number, number][] = [];
  for (let y = -33; y <= 33; y += 1.5) outline.push([halfWidth(y), y]);
  const left = outline.map(([w, y]) => `${r2(-w)} ${r2(y)}`);
  const right = [...outline].reverse().map(([w, y]) => `${r2(w)} ${r2(y)}`);
  const shapeD = `M${left.join('L')}L${right.join('L')}Z`;
  const clip = nextId();
  parts.push(el('defs', {}, el('clipPath', { id: clip }, el('path', { d: shapeD }))));
  // Gores: each a strip between two meridians (x = w(y) × sin of its angle), front half only.
  const inner: string[] = [];
  for (let k = 0; k < GORES; k++) {
    const a0 = -Math.PI / 2 + (k / GORES) * Math.PI;
    const a1 = -Math.PI / 2 + ((k + 1) / GORES) * Math.PI;
    const l = outline.map(([w, y]) => `${r2(w * Math.sin(a0))} ${r2(y)}`);
    const r = [...outline].reverse().map(([w, y]) => `${r2(w * Math.sin(a1))} ${r2(y)}`);
    inner.push(el('path', { d: `M${l.join('L')}L${r.join('L')}Z`, fill: d.gore(k) }));
  }
  // Bands across the gores.
  if (d.band !== undefined)
    for (let y = -33; y < 33; y += 1) {
      const c = d.band((y + 33) / 66);
      if (c !== null) inner.push(el('rect', { x: -30, y, width: 60, height: 1.05, fill: c }));
    }
  if (d.zigzag !== undefined) {
    let z = 'M-30 -6';
    for (let x = -30; x < 30; x += 4) z += `L${x + 2} -9L${x + 4} -6`;
    inner.push(
      el('path', {
        d: z,
        fill: 'none',
        stroke: d.zigzag,
        'stroke-width': 1.3,
        'stroke-linejoin': 'round',
      }),
    );
  }
  // Seams between gores, a shade darker.
  let seams = '';
  for (let k = 1; k < GORES; k++) {
    const a = -Math.PI / 2 + (k / GORES) * Math.PI;
    seams += `M${outline.map(([w, y]) => `${r2(w * Math.sin(a))} ${r2(y)}`).join('L')}`;
  }
  inner.push(
    el('path', { d: seams, fill: 'none', stroke: '#5A2A18', 'stroke-width': 0.35, opacity: 0.45 }),
  );
  // Light from the upper left: a shadow side, a sheen, a darker mouth.
  const sh = nextId();
  const sheen = nextId();
  inner.push(
    el(
      'defs',
      {},
      el(
        'linearGradient',
        { id: sh, x1: 0, y1: 0, x2: 1, y2: 0 },
        el('stop', { offset: 0, 'stop-color': '#FFFFFF', 'stop-opacity': 0.18 }),
        el('stop', { offset: 0.45, 'stop-color': '#FFFFFF', 'stop-opacity': 0 }),
        el('stop', { offset: 0.7, 'stop-color': '#2A1410', 'stop-opacity': 0.12 }),
        el('stop', { offset: 1, 'stop-color': '#2A1410', 'stop-opacity': 0.45 }),
      ),
      el(
        'radialGradient',
        { id: sheen, cx: 0.33, cy: 0.22, r: 0.35 },
        el('stop', { offset: 0, 'stop-color': '#FFFFFF', 'stop-opacity': 0.45 }),
        el('stop', { offset: 1, 'stop-color': '#FFFFFF', 'stop-opacity': 0 }),
      ),
    ),
    el('rect', { x: -30, y: -35, width: 60, height: 70, fill: `url(#${sh})` }),
    el('rect', { x: -30, y: -35, width: 60, height: 70, fill: `url(#${sheen})` }),
    el('path', { d: ellipseD(0, 30, 10, 6), fill: '#2A1410', opacity: 0.25 }),
  );
  parts.push(g({ 'clip-path': `url(#${clip})` }, ...inner));
  // The load ring at the mouth.
  parts.push(
    el('path', {
      d: ellipseD(0, 33, 7.2, 1.3),
      fill: 'none',
      stroke: '#6A5040',
      'stroke-width': 0.8,
    }),
  );
  return g({}, ...parts);
}

function basket(): string {
  const top = 45;
  const wicker = '#A87A46';
  let weave = '';
  for (let y = top + 1.5; y < top + 9; y += 1.6) weave += `M-6 ${r2(y)}L6 ${r2(y)}`;
  for (let x = -5; x <= 5; x += 2) weave += `M${x} ${top + 1}L${x} ${top + 9}`;
  // Ropes from the load ring to the basket's corners, and the burner frame.
  const ropes = `M-7 33L-5.5 ${top}M7 33L5.5 ${top}M-3 33L-2.5 ${top}M3 33L2.5 ${top}`;
  return g(
    {},
    el('path', { d: ropes, stroke: '#5E4A3C', 'stroke-width': 0.45, fill: 'none' }),
    el('rect', { x: -3.2, y: BURNER.y - 1, width: 6.4, height: 2.6, rx: 0.6, fill: '#6E6A66' }),
    el('rect', { x: -2, y: BURNER.y - 2.4, width: 4, height: 1.6, rx: 0.5, fill: '#9A9690' }),
    // Two passengers peeking over the rim (a hat, a scarf).
    el('path', { d: ellipseD(-2.8, top - 1.4, 1.7, 1.9), fill: '#8A5A3E' }),
    el('path', { d: `M-4.6 ${top - 2.8}h3.6l-0.5 -1.3h-2.6z`, fill: '#E8DCC0' }),
    el('path', { d: ellipseD(2.8, top - 1.3, 1.6, 1.8), fill: '#E2B48E' }),
    el('path', { d: ellipseD(2.8, top - 2.6, 1.7, 0.9), fill: '#4A3426' }),
    el('rect', { x: -6.5, y: top, width: 13, height: 10, rx: 1.2, fill: wicker }),
    el('path', {
      d: weave,
      stroke: shade(wicker, -0.3),
      'stroke-width': 0.4,
      fill: 'none',
      opacity: 0.8,
    }),
    el('rect', { x: -6.8, y: top - 0.6, width: 13.6, height: 1.6, rx: 0.8, fill: '#6A4628' }),
    el('rect', { x: 2, y: top, width: 4.5, height: 10, fill: '#2A1410', opacity: 0.18 }),
  );
}

function balloon(name: string): string {
  const d = DESIGNS[name] ?? DESIGNS.balloon_a;
  if (d === undefined) return '';
  return g({}, envelope(d), basket());
}

/** The burner's flame, its base at (0, 0): a soft glow and a yellow-white tongue. */
function flame(): string {
  const id = nextId();
  return g(
    {},
    el(
      'defs',
      {},
      el(
        'radialGradient',
        { id },
        el('stop', { offset: 0, 'stop-color': '#FFD27A', 'stop-opacity': 0.75 }),
        el('stop', { offset: 1, 'stop-color': '#FF8A2A', 'stop-opacity': 0 }),
      ),
    ),
    el('path', { d: ellipseD(0, -8, 7.5, 10), fill: `url(#${id})` }),
    el('path', { d: 'M-2.4 0Q-3 -8 0 -16Q3 -8 2.4 0Z', fill: '#FF9A30' }),
    el('path', { d: 'M-1.2 0Q-1.5 -5 0 -10Q1.5 -5 1.2 0Z', fill: mix('#FFF4C8', '#FFD050', 0.3) }),
  );
}

/** A passenger's arm raised with a shaking fist, the shoulder at (0, 0). */
function fist(): string {
  return g(
    {},
    el('path', {
      d: 'M-0.6 0L1.2 -8',
      stroke: '#8A5A3E',
      'stroke-width': 1.5,
      'stroke-linecap': 'round',
    }),
    el('path', { d: ellipseD(1.5, -9.6, 1.6, 1.8), fill: '#E2B48E' }),
  );
}

/** The sheet at `k` texture px per design px (1 Standard, 2 HD). */
export function renderBalloonSheet(k: number): Rgba {
  const cells = balloonFrames().map((f) => {
    const id = nextId();
    const art = f.name === 'flame' ? flame() : f.name === 'fist' ? fist() : balloon(f.name);
    return g(
      {},
      el('clipPath', { id }, el('rect', { x: f.x, y: f.y, width: f.w, height: f.h })),
      g(
        { 'clip-path': `url(#${id})` },
        g({ transform: `translate(${r2(f.x + f.ox)} ${r2(f.y + f.oy)})` }, art),
      ),
    );
  });
  return renderSvg(
    svgDoc(
      BALLOON_SHEET_W * k,
      BALLOON_SHEET_H * k,
      [0, 0, BALLOON_SHEET_W, BALLOON_SHEET_H],
      '',
      g({}, ...cells),
    ),
  );
}

/** One balloon drawn alone (previews). */
export function drawBalloon(name: string): string {
  return balloon(name);
}
